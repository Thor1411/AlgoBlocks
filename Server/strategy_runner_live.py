import backtrader as bt
import json
import yfinance as yf
import pandas as pd
import logging
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
import numpy as np
import operator
from typing import Dict, Any, Type
import pytz
import sys

# Set up logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global constants - Updated with current values
CURRENT_UTC_TIME = "2025-04-18 19:54:43"
CURRENT_USER = "TejKiran06"

# Default risk management values
DEFAULT_STOP_LOSS = 0.0    # 0%
DEFAULT_TAKE_PROFIT = 10.0 # 1000%

# Market hours configuration
MARKET_OPEN_TIME = "09:30"
MARKET_CLOSE_TIME = "16:00"
MARKET_TIMEZONE = "US/Eastern"

def get_last_trading_day(current_time: datetime) -> datetime:
    """
    Get the last valid trading day based on current time
    """
    eastern = pytz.timezone(MARKET_TIMEZONE)
    current_time_et = current_time.astimezone(eastern)
    
    # Start with current date
    target_date = current_time_et.date()
    
    # If current time is after market close, move to previous day
    market_close = eastern.localize(datetime.combine(
        target_date,
        datetime.strptime(MARKET_CLOSE_TIME, '%H:%M').time()
    ))
    
    if current_time_et > market_close:
        target_date = target_date - timedelta(days=1)
    
    # Skip weekends
    while target_date.weekday() > 4:  # 5 = Saturday, 6 = Sunday
        target_date = target_date - timedelta(days=1)
    
    return target_date

def prepare_data(symbol: str) -> pd.DataFrame:
    """
    Download and prepare market data for the last valid trading day.
    """
    logger.debug(f"Downloading data for {symbol}")

    try:
        # Get current time in UTC
        current_time = datetime.strptime(CURRENT_UTC_TIME, "%Y-%m-%d %H:%M:%S")
        current_time = pytz.utc.localize(current_time)
        
        # Ensure we have enough historical data for indicators
        # Move back 30 days to ensure we have enough data for calculations
        start_date = get_last_trading_day(current_time - timedelta(days=30))
        end_date = get_last_trading_day(current_time)

        # Set up market times
        eastern = pytz.timezone(MARKET_TIMEZONE)
        market_open = eastern.localize(datetime.combine(
            start_date,
            datetime.strptime(MARKET_OPEN_TIME, '%H:%M').time()
        ))
        market_close = eastern.localize(datetime.combine(
            end_date,
            datetime.strptime(MARKET_CLOSE_TIME, '%H:%M').time()
        ))

        logger.info(f"Downloading data for {symbol} from {market_open} to {market_close}")
        
        # Download data
        df = yf.download(
            symbol,
            start=market_open,
            end=market_close,
            interval="1d",  # Using daily data for more reliable results
            progress=False
        )

        if df.empty:
            raise ValueError(f"No data available for {symbol}. Please check the symbol or data source.")

        # Ensure we have all required columns
        required_columns = ['Open', 'High', 'Low', 'Close', 'Volume']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise ValueError(f"Missing required columns: {missing_columns}")

        # Flatten MultiIndex columns if present
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [col[0] for col in df.columns]

        # Rename columns to lowercase for consistency
        df.rename(columns={
            'Open': 'open',
            'High': 'high',
            'Low': 'low',
            'Close': 'close',
            'Volume': 'volume'
        }, inplace=True)

        # Ensure data is sorted by date
        df = df.sort_index()

        # Add a check for minimum required data points
        if len(df) < 20:  # Minimum required for most indicators
            raise ValueError(f"Insufficient data points for {symbol}. Got {len(df)}, need at least 30.")

        logger.info(f"Successfully prepared data for {symbol}: {len(df)} data points")
        return df

    except Exception as e:
        logger.error(f"Error preparing data for {symbol}: {str(e)}")
        raise

class JsonToBacktraderConverter:
    @staticmethod
    def _safe_float_conversion(value, default=0.0):
        """
        Safely convert value to float, handling both string and numeric inputs
        """
        if isinstance(value, (int, float)):
            return float(value)
        elif isinstance(value, str):
            try:
                return float(value.strip())
            except (ValueError, TypeError):
                return default
        return default

    @staticmethod
    def load_strategy_from_json(json_path: str = None, json_data: str = None) -> Type[bt.Strategy]:
        try:
            if json_path:
                logger.info(f"Loading strategy from file: {json_path}")
                with open(json_path, 'r') as f:
                    strategy_def = json.load(f)
            elif json_data:
                logger.info("Loading strategy from provided JSON string")
                strategy_def = json.loads(json_data)
            else:
                raise ValueError("Either json_path or json_data must be provided")

            class DynamicStrategy(bt.Strategy):
                params = (
                    ('max_position_size', 0.2),
                    ('max_risk_per_trade', 0.01),
                    ('min_portfolio_value', 10000),
                )

                def __init__(self):
                    self.order = None
                    self.dataclose = self.datas[0].close
                    self.strategy_name = strategy_def.get('name', 'Unnamed Strategy')

                    # Track positions and their stop losses/take profits
                    self.active_positions = {}
                    self.stop_orders = {}
                    self.take_profit_orders = {}

                    # Get risk management values from JSON, use defaults if not specified
                    risk_mgmt = strategy_def.get('riskManagement', {})
                    
                    # Use the safe conversion method for stop loss and take profit
                    self.stop_loss_pct = JsonToBacktraderConverter._safe_float_conversion(
                        risk_mgmt.get('stopLoss', DEFAULT_STOP_LOSS)
                    ) / 100

                    self.take_profit_pct = JsonToBacktraderConverter._safe_float_conversion(
                        risk_mgmt.get('takeProfit', DEFAULT_TAKE_PROFIT)
                    ) / 100

                    # Portfolio high watermark for trailing stop
                    self.portfolio_high = self.broker.getvalue()

                    logger.info(f"Initializing strategy: {self.strategy_name}")
                    logger.info(f"Stop Loss: {self.stop_loss_pct*100}%")
                    logger.info(f"Take Profit: {self.take_profit_pct*100}%")

                    # Initialize indicators
                    self.indicators = {}
                    for ind_def in strategy_def.get('indicators', []):
                        self._create_indicator(ind_def)

                def _create_indicator(self, ind_def: Dict[str, Any]) -> None:
                    """
                    Creates an indicator based on the definition
                    """
                    ind_type = ind_def.get('type', '').upper()
                    ind_name = ind_def.get('name', '')
                    params = ind_def.get('params', {})

                    try:
                        if ind_type == 'SMA':
                            self.indicators[ind_name] = bt.indicators.SimpleMovingAverage(
                                self.dataclose, period=params.get('period', 20)
                            )
                        elif ind_type == 'EMA':
                            self.indicators[ind_name] = bt.indicators.ExponentialMovingAverage(
                                self.dataclose, period=params.get('period', 20)
                            )
                        elif ind_type == 'RSI':
                            self.indicators[ind_name] = bt.indicators.RSI(
                                self.dataclose, period=params.get('period', 14)
                            )
                        elif ind_type == 'MACD':
                            self.indicators[ind_name] = bt.indicators.MACD(
                                self.dataclose,
                                period_me1=params.get('fast_period', 12),
                                period_me2=params.get('slow_period', 26),
                                period_signal=params.get('signal_period', 9)
                            )
                        elif ind_type == 'BOLLINGER':
                            self.indicators[ind_name] = bt.indicators.BollingerBands(
                                self.dataclose,
                                period=params.get('period', 20),
                                devfactor=params.get('devfactor', 2)
                            )
                        logger.debug(f"Created indicator: {ind_name}")
                    except Exception as e:
                        logger.error(f"Error creating indicator {ind_name}: {str(e)}")
                        raise

                def _check_portfolio_health(self) -> bool:
                    """
                    Check if the portfolio is healthy enough to trade
                    """
                    portfolio_value = self.broker.getvalue()
                    self.portfolio_high = max(self.portfolio_high, portfolio_value)

                    if portfolio_value <= self.params.min_portfolio_value:
                        logger.warning(f"Portfolio value ({portfolio_value:.2f}) below minimum threshold")
                        return False

                    drawdown = (self.portfolio_high - portfolio_value) / self.portfolio_high
                    if drawdown > 0.20:
                        logger.warning(f"Portfolio drawdown ({drawdown:.2%}) too large")
                        return False

                    return True

                def _calculate_position_size(self, price: float) -> int:
                    """
                    Calculate the appropriate position size based on risk parameters
                    """
                    portfolio_value = self.broker.getvalue()
                    max_position_value = portfolio_value * self.params.max_position_size
                    available_cash = self.broker.getcash()

                    # Calculate position size based on risk parameters
                    risk_amount = portfolio_value * self.params.max_risk_per_trade
                    stop_loss_distance = price * max(self.stop_loss_pct, 0.001)
                    risk_based_size = int(risk_amount / stop_loss_distance)

                    # Calculate maximum shares based on position size limit
                    max_shares = min(
                        int(max_position_value / price),
                        int(available_cash / price)
                    )

                    return max(1, min(max_shares, risk_based_size))  # Ensure at least 1 share

                def _set_stop_loss_take_profit(self, order, entry_price: float) -> None:
                    """
                    Set both stop loss and take profit orders for a position
                    """
                    if order.isbuy():
                        # Set stop loss if enabled
                        if self.stop_loss_pct > 0:
                            stop_price = entry_price * (1 - self.stop_loss_pct)
                            stop_order = self.sell(
                                size=order.size,
                                exectype=bt.Order.Stop,
                                price=stop_price
                            )
                            self.stop_orders[order.ref] = stop_order
                            logger.info(f"Set stop loss at {stop_price:.2f}")

                        # Set take profit
                        take_profit_price = entry_price * (1 + self.take_profit_pct)
                        take_profit_order = self.sell(
                            size=order.size,
                            exectype=bt.Order.Limit,
                            price=take_profit_price
                        )
                        self.take_profit_orders[order.ref] = take_profit_order
                        logger.info(f"Set take profit at {take_profit_price:.2f}")

                def _cancel_pending_orders(self, position_ref):
                    """
                    Cancel pending stop loss and take profit orders
                    """
                    if position_ref in self.stop_orders:
                        self.cancel(self.stop_orders[position_ref])
                        del self.stop_orders[position_ref]
                    
                    if position_ref in self.take_profit_orders:
                        self.cancel(self.take_profit_orders[position_ref])
                        del self.take_profit_orders[position_ref]

                def notify_order(self, order):
                    """
                    Receives order notifications
                    """
                    if order.status in [order.Submitted, order.Accepted]:
                        return

                    if order.status in [order.Completed]:
                        if order.isbuy():
                            self.active_positions[order.ref] = order.executed.price
                            self._set_stop_loss_take_profit(order, order.executed.price)
                            logger.info(
                                f'BUY EXECUTED - Price: {order.executed.price:.2f}, '
                                f'Cost: {order.executed.value:.2f}, '
                                f'Commission: {order.executed.comm:.2f}'
                            )
                        else:
                            if order.ref in self.active_positions:
                                self._cancel_pending_orders(order.ref)
                                del self.active_positions[order.ref]
                            logger.info(
                                f'SELL EXECUTED - Price: {order.executed.price:.2f}, '
                                f'Cost: {order.executed.value:.2f}, '
                                f'Commission: {order.executed.comm:.2f}'
                            )

                    elif order.status in [order.Canceled, order.Margin, order.Rejected]:
                        logger.warning(f'Order Canceled/Margin/Rejected - Status: {order.status}')

                    self.order = None

                def _evaluate_condition(self, condition: Dict[str, Any]) -> bool:
                    """
                    Evaluates a trading condition
                    """
                    try:
                        operator_map = {
                            '>': operator.gt,
                            '<': operator.lt,
                            '>=': operator.ge,
                            '<=': operator.le,
                            '==': operator.eq,
                            '!=': operator.ne,
                            'GREATER_THAN': operator.gt,
                            'LESS_THAN': operator.lt
                        }

                        if 'operator' in condition and condition['operator'].lower() in ['and', 'or']:
                            op = condition['operator'].lower()
                            results = [self._evaluate_condition(cond) for cond in condition.get('conditions', [])]
                            return all(results) if op == 'and' else any(results)

                        op = operator_map.get(condition.get('operator'))
                        if not op:
                            return False

                        left = self._get_value(condition.get('left', {}))
                        right = self._get_value(condition.get('right', {}))

                        if left is None or right is None:
                            return False

                        return op(left, right)

                    except Exception as e:
                        logger.error(f"Error evaluating condition: {str(e)}")
                        return False

                def _get_value(self, value_def: Dict[str, Any]) -> float:
                    """
                    Gets a value from an indicator or price data with safe array access
                    """
                    try:
                        if 'indicator' in value_def:
                            ind_name = value_def['indicator']
                            if ind_name in self.indicators:
                                indicator = self.indicators[ind_name]
                                if len(indicator) > 0:  # Check if indicator has data
                                    return indicator[0]
                            logger.warning(f"Indicator {ind_name} not found or has no data")
                            return None
                        elif 'price' in value_def:
                            # Ensure we have enough data points
                            if len(self.datas[0]) == 0:
                                return None
                                
                            if value_def['price'] == 'close':
                                return self.dataclose[0]
                            elif value_def['price'] == 'open':
                                return self.datas[0].open[0]
                            elif value_def['price'] == 'high':
                                return self.datas[0].high[0]
                            elif value_def['price'] == 'low':
                                return self.datas[0].low[0]
                        elif 'value' in value_def:
                            return JsonToBacktraderConverter._safe_float_conversion(value_def['value'])
                        return None
                    except IndexError as e:
                        logger.error(f"Index error in _get_value: {str(e)}")
                        return None
                    except Exception as e:
                        logger.error(f"Error getting value: {str(e)}")
                        return None

                def _execute_rule(self, rule: Dict[str, Any]) -> None:
                    """
                    Executes a single trading rule
                    """
                    if self.order:
                        return

                    try:
                        condition = rule.get('condition', {})
                        action = rule.get('action', {})

                        if self._evaluate_condition(condition):
                            self._execute_action(action)
                    except Exception as e:
                        logger.error(f"Error executing rule: {str(e)}")

                def _execute_action(self, action: Dict[str, Any]) -> None:
                    """
                    Executes a trading action with risk management
                    """
                    if not self._check_portfolio_health():
                        logger.warning("Skipping trade due to unhealthy portfolio")
                        return

                    action_type = action.get('type', '').lower()
                    price = self.dataclose[0]

                    try:
                        if action_type == 'buy' and not self.position:
                            size = self._calculate_position_size(price)
                            if size <= 0:
                                logger.warning("Position size too small, skipping trade")
                                return

                            self.order = self.buy(size=size)
                            logger.info(f"Placing buy order for {size} shares at {price:.2f}")
                            
                        elif action_type in ['sell', 'close'] and self.position:
                            self.order = self.close()
                            logger.info(f"Closing position at {price:.2f}")
                            for pos_ref in list(self.active_positions.keys()):
                                self._cancel_pending_orders(pos_ref)

                    except Exception as e:
                        logger.error(f"Error executing action: {str(e)}")
                        raise

                def next(self):
                    """
                    Define the trading logic with portfolio protection
                    """
                    try:
                        if not self._check_portfolio_health():
                            self.close()
                            return

                        # Monitor active positions
                        for pos_ref, entry_price in list(self.active_positions.items()):
                            current_price = self.dataclose[0]
                            
                            # Check for stop loss if enabled
                            if self.stop_loss_pct > 0 and current_price <= entry_price * (1 - self.stop_loss_pct):
                                logger.info(f"Stop loss triggered at {current_price:.2f}")
                                self.close()
                                self._cancel_pending_orders(pos_ref)
                                del self.active_positions[pos_ref]
                                continue
                            
                            # Check for take profit
                            if current_price >= entry_price * (1 + self.take_profit_pct):
                                logger.info(f"Take profit triggered at {current_price:.2f}")
                                self.close()
                                self._cancel_pending_orders(pos_ref)
                                del self.active_positions[pos_ref]
                                continue

                        # Execute trading rules if portfolio is healthy
                        if self._check_portfolio_health():
                            for rule in strategy_def.get('rules', []):
                                if rule.get('type') in ['stop_loss', 'take_profit']:
                                    continue
                                self._execute_rule(rule)

                    except Exception as e:
                        logger.error(f"Error in next(): {str(e)}")

            return DynamicStrategy

        except Exception as e:
            logger.error(f"Error loading strategy: {str(e)}")
            raise

class CustomPandasData(bt.feeds.PandasData):
    """
    Custom PandasData class to handle Yahoo Finance data
    """
    params = (
        ('datetime', None),
        ('open', 'open'),
        ('high', 'high'),
        ('low', 'low'),
        ('close', 'close'),
        ('volume', 'volume'),
        ('openinterest', None),
    )

def extract_plot_data(data, indicators, trades):
    """
    Extract trading data into a JSON-serializable format with NaN handling.
    """
    def handle_nan(value):
        """Helper function to convert NaN to null"""
        if isinstance(value, (float, np.float32, np.float64)) and (np.isnan(value) or np.isinf(value)):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    plot_data = {
        'candlesticks': [],
        'volume': [],
        'indicators': {},
        'trades': [],
        'dates': []
    }
    
    try:
        # Extract OHLCV data
        for i in range(len(data)):
            try:
                date = data.index[i].strftime('%Y-%m-%d %H:%M')
                plot_data['dates'].append(date)
                
                plot_data['candlesticks'].append({
                    'date': date,
                    'open': handle_nan(data['open'].iloc[i]),
                    'high': handle_nan(data['high'].iloc[i]),
                    'low': handle_nan(data['low'].iloc[i]),
                    'close': handle_nan(data['close'].iloc[i])
                })
                
                plot_data['volume'].append({
                    'date': date,
                    'value': handle_nan(data['volume'].iloc[i])
                })
            except IndexError as e:
                logger.error(f"Index error processing OHLCV data at index {i}: {str(e)}")
                continue
        
        # Extract indicator values
        for name, indicator in indicators.items():
            plot_data['indicators'][name] = []
            indicator_length = len(indicator) if hasattr(indicator, '__len__') else 0
            
            for i in range(len(data)):
                try:
                    if i < indicator_length:
                        value = indicator[i]
                    else:
                        value = None
                        
                    plot_data['indicators'][name].append({
                        'date': data.index[i].strftime('%Y-%m-%d %H:%M'),
                        'value': handle_nan(value)
                    })
                except IndexError as e:
                    logger.error(f"Index error processing indicator {name} at index {i}: {str(e)}")
                    plot_data['indicators'][name].append({
                        'date': data.index[i].strftime('%Y-%m-%d %H:%M'),
                        'value': None
                    })
        
        # Extract trade data safely
        for trade in trades:
            try:
                plot_data['trades'].append({
                    'date': trade['date'].strftime('%Y-%m-%d %H:%M'),
                    'type': trade['type'],
                    'price': handle_nan(trade['price']),
                    'size': handle_nan(trade['size'])
                })
            except (KeyError, AttributeError) as e:
                logger.error(f"Error processing trade data: {str(e)}")
                continue

        return plot_data
    
    except Exception as e:
        logger.error(f"Error in extract_plot_data: {str(e)}")
        return {
            'candlesticks': [],
            'volume': [],
            'indicators': {},
            'trades': [],
            'dates': []
        }

class NumpyJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.float32, np.float64)):
            if np.isnan(obj):
                return None
            return float(obj)
        return super().default(obj)

def save_results(results: dict):
    """
    Save results to output.json with proper error handling and NaN value handling
    """
    try:
        with open('output.json', 'w') as f:
            json.dump(results, f, indent=2, cls=NumpyJSONEncoder, default=str)
            logger.info("Results saved successfully to output.json")
    except Exception as e:
        logger.error(f"Error saving results to output.json: {str(e)}")
        # Create a minimal error result if saving fails
        error_result = {
            "status": "error",
            "message": "Failed to save results",
            "timestamp": CURRENT_UTC_TIME,
            "user": CURRENT_USER
        }
        try:
            with open('output.json', 'w') as f:
                json.dump(error_result, f, indent=2)
        except Exception as write_error:
            logger.error(f"Failed to write error result: {str(write_error)}")

def run_strategy(strategy_input: Any) -> dict:
    """
    Run the trading strategy with the provided input.
    """
    try:
        # Check if strategy_input is a dictionary or JSON string
        if isinstance(strategy_input, str):
            input_data = json.loads(strategy_input)
        elif isinstance(strategy_input, dict):
            input_data = strategy_input
        else:
            raise ValueError("Invalid input: strategy_input must be a JSON string or dictionary")

        stock = input_data.get("stock")
        strategy = input_data.get("strategy")
        
        # Validate inputs
        if not stock:
            raise ValueError("Stock symbol is required")
        if not strategy:
            raise ValueError("Strategy configuration is required")

        # Prepare data for the stock
        data = prepare_data(stock)

        # Initialize Backtrader engine
        cerebro = bt.Cerebro()
        
        # Set initial cash
        initial_cash = input_data.get("params", {}).get("initialCapital", 100000)
        cerebro.broker.setcash(initial_cash)

        # Create a custom data feed for Backtrader
        data_feed = CustomPandasData(dataname=data)
        cerebro.adddata(data_feed)

        # Convert strategy to JSON string if it's a dictionary
        strategy_json = json.dumps(strategy) if isinstance(strategy, dict) else strategy

        # Load the strategy from the JSON
        strategy_class = JsonToBacktraderConverter.load_strategy_from_json(json_data=strategy_json)
        cerebro.addstrategy(strategy_class)

        # Run the backtest
        initial_value = cerebro.broker.getvalue()
        trades = []
        try:
            results = cerebro.run()
            if results and len(results) > 0:
                strat = results[0]
                # Collect trades if available
                if hasattr(strat, 'trades'):
                    trades = strat.trades
        except Exception as e:
            logger.error(f"Error running backtest: {str(e)}")
            raise

        final_value = cerebro.broker.getvalue()

        # Calculate performance metrics
        returns_pct = ((final_value - initial_value) / initial_value) * 100

        # Generate plot data
        plot_data = extract_plot_data(data, indicators={}, trades=trades)

        # Prepare results
        results = {
            "status": "success",
            "data": {
                "initial_value": initial_value,
                "final_value": final_value,
                "returns_pct": returns_pct,
                "plot_data": plot_data,
                "metadata": {
                    "strategy_name": strategy.get("name", "Unnamed Strategy"),
                    "symbol": stock,
                    "timestamp": CURRENT_UTC_TIME
                }
            }
        }

        return results

    except Exception as e:
        logger.error(f"Error running strategy: {str(e)}")
        return {
            "status": "error",
            "message": str(e)
        }

if __name__ == "__main__":
    try:
        # Read the input JSON file
        with open('input.json', 'r') as f:
            input_data = json.load(f)
            
        # Validate that we have at least the required fields
        if 'stock' not in input_data or 'strategy' not in input_data:
            raise ValueError("Input JSON must contain 'stock' and 'strategy' fields")
            
        # Remove start_date and end_date if they exist
        input_data.pop('startDate', None)
        input_data.pop('endDate', None)
        
        # Run the strategy with the input
        results = run_strategy(input_data)
        
        # Save results to output.json
        save_results(results)
        
        logger.info("Strategy execution completed successfully")
        sys.exit(0)
        
    except Exception as e:
        error_result = {
            "status": "error",
            "message": str(e),
            "timestamp": CURRENT_UTC_TIME,
            "user": CURRENT_USER
        }
        save_results(error_result)
        logger.error(f"Error executing strategy: {str(e)}")
        sys.exit(1)