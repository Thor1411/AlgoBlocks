import backtrader as bt
import json
import yfinance as yf
import pandas as pd
import logging
from datetime import datetime
import matplotlib.pyplot as plt
import numpy as np
import operator
from typing import Dict, Any, Type

# Set up logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global constants
CURRENT_UTC_TIME = "2025-04-17 18:19:39"
CURRENT_USER = "c4ndY1"

# Default risk management values
DEFAULT_STOP_LOSS = 0.0    # 0%
DEFAULT_TAKE_PROFIT = 10.0 # 1000%

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

                    return min(max_shares, risk_based_size)

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
                    Gets a value from an indicator or price data
                    """
                    try:
                        if 'indicator' in value_def:
                            return self.indicators[value_def['indicator']][0]
                        elif 'price' in value_def:
                            if value_def['price'] == 'close':
                                return self.dataclose[0]
                            elif value_def['price'] == 'open':
                                return self.datas[0].open[0]
                            elif value_def['price'] == 'high':
                                return self.datas[0].high[0]
                            elif value_def['price'] == 'low':
                                return self.datas[0].low[0]
                        return JsonToBacktraderConverter._safe_float_conversion(
                            value_def.get('value', 0)
                        )
                    except Exception as e:
                        logger.error(f"Error getting value: {str(e)}")
                        return None

                def _execute_rule(self, rule: Dict[str, Any]) -> None:
                    """
                    Executes a single trading rule
                    """
                    if self.order:
                        return

                    condition = rule.get('condition', {})
                    action = rule.get('action', {})

                    if self._evaluate_condition(condition):
                        self._execute_action(action)

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
                        if action_type == 'buy':
                            size = self._calculate_position_size(price)
                            if size <= 0:
                                logger.warning("Position size too small, skipping trade")
                                return

                            self.order = self.buy(size=size)
                            
                        elif action_type in ['sell', 'close']:
                            self.order = self.close()
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
        ('open', 'Open'),
        ('high', 'High'),
        ('low', 'Low'),
        ('close', 'Close'),
        ('volume', 'Volume'),
        ('openinterest', None),
    )

def prepare_data(symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
    """
    Download and prepare data for backtrader
    """
    logger.debug(f"Downloading data for {symbol} from {start_date} to {end_date}")

    try:
        df = yf.download(symbol, start=start_date, end=end_date, progress=False)

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [col[0] for col in df.columns]

        if df.empty:
            raise ValueError(f"No data downloaded for {symbol}")

        return df

    except Exception as e:
        logger.error(f"Error preparing data: {str(e)}")
        raise

def extract_plot_data(data, indicators, trades):
    """
    Extract trading data into a JSON-serializable format with NaN handling
    """
    def handle_nan(value):
        """Helper function to convert NaN to null"""
        if isinstance(value, (float, np.float32, np.float64)) and np.isnan(value):
            return None
        return float(value)

    plot_data = {
        'candlesticks': [],
        'volume': [],
        'indicators': {},
        'trades': [],
        'dates': []
    }
    
    # Extract OHLCV data
    for i in range(len(data)):
        date = data.index[i].strftime('%Y-%m-%d')
        plot_data['dates'].append(date)
        
        plot_data['candlesticks'].append({
            'date': date,
            'open': handle_nan(data['Open'].iloc[i]),
            'high': handle_nan(data['High'].iloc[i]),
            'low': handle_nan(data['Low'].iloc[i]),
            'close': handle_nan(data['Close'].iloc[i])
        })
        
        plot_data['volume'].append({
            'date': date,
            'value': handle_nan(data['Volume'].iloc[i])
        })
    
    # Extract indicator values
    for name, indicator in indicators.items():
        plot_data['indicators'][name] = []
        for i in range(len(data)):
            if i < len(indicator):
                plot_data['indicators'][name].append({
                    'date': data.index[i].strftime('%Y-%m-%d'),
                    'value': handle_nan(indicator[i])
                })
    
    # Extract trade data
    for trade in trades:
        plot_data['trades'].append({
            'date': trade['date'].strftime('%Y-%m-%d'),
            'type': trade['type'],
            'price': handle_nan(trade['price']),
            'size': handle_nan(trade['size'])
        })
    
    return plot_data

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
    except Exception as e:
        logger.error(f"Error saving results to output.json: {str(e)}")
        # Create a minimal error result if saving fails
        error_result = {
            "status": "error",
            "message": "Failed to save results",
            "timestamp": CURRENT_UTC_TIME,
            "user": CURRENT_USER
        }
        with open('output.json', 'w') as f:
            json.dump(error_result, f, indent=2)

def run_strategy(strategy_json: str) -> dict:
    """
    Run the trading strategy and return results including plot data as JSON
    """
    try:
        # Parse input
        input_data = json.loads(strategy_json)
        
        # Extract values from input
        symbol = input_data['stock']
        start_date = input_data['startDate']
        end_date = input_data['endDate']
        strategy_json = json.dumps(input_data['strategy'])

        logger.info(f"Running strategy for {symbol}...")

        # Initialize and configure Cerebro
        cerebro = bt.Cerebro()
        cerebro.broker.setcash(100000.0)
        cerebro.broker.setcommission(commission=0.001)

        # Add analyzers
        cerebro.addanalyzer(bt.analyzers.SharpeRatio)
        cerebro.addanalyzer(bt.analyzers.DrawDown)
        cerebro.addanalyzer(bt.analyzers.Returns)
        cerebro.addanalyzer(bt.analyzers.Transactions)

        # Prepare and add data
        data = prepare_data(symbol, start_date, end_date)
        data_feed = CustomPandasData(
            dataname=data,
            fromdate=datetime.strptime(start_date, '%Y-%m-%d'),
            todate=datetime.strptime(end_date, '%Y-%m-%d')
        )
        cerebro.adddata(data_feed)

        # Add strategy
        Strategy = JsonToBacktraderConverter.load_strategy_from_json(
            json_path=None,
            json_data=strategy_json
        )
        cerebro.addstrategy(Strategy)

        # Run backtest
        initial_value = cerebro.broker.getvalue()
        results = cerebro.run()
        strat = results[0]

        # Get trades from transactions analyzer
        transactions = strat.analyzers.transactions.get_analysis()
        trades = []
        for date, trans in transactions.items():
            for t in trans:
                trades.append({
                    'date': date,
                    'type': 'buy' if t[0] > 0 else 'sell',
                    'price': t[1],
                    'size': abs(t[0])
                })

        # Extract indicators data
        indicators_data = {}
        for name, indicator in strat.indicators.items():
            indicators_data[name] = indicator.lines[0].array

        # Extract plot data
        plot_data = extract_plot_data(data, indicators_data, trades)

        # Calculate results
        final_value = cerebro.broker.getvalue()
        returns_pct = ((final_value - initial_value) / initial_value * 100)
        sharpe_ratio = strat.analyzers.sharperatio.get_analysis().get('sharperatio', None)
        drawdown = strat.analyzers.drawdown.get_analysis()

        # Prepare results dictionary
        results = {
            "status": "success",
            "data": {
                "initial_value": float(initial_value),
                "final_value": float(final_value),
                "returns_pct": float(returns_pct),
                "sharpe_ratio": float(sharpe_ratio) if sharpe_ratio is not None else 0,
                "max_drawdown_pct": float(drawdown.max.drawdown),
                "max_drawdown_money": float(drawdown.max.moneydown),
                "plot_data": plot_data,
                "metadata": {
                    "symbol": symbol,
                    "start_date": start_date,
                    "end_date": end_date,
                    "strategy_name": input_data['strategy']['name']
                }
            },
            "timestamp": CURRENT_UTC_TIME,
            "user": CURRENT_USER
        }

        return results

    except Exception as e:
        logger.exception("Error occurred during execution")
        return {
            "status": "error",
            "message": str(e),
            "timestamp": CURRENT_UTC_TIME,
            "user": CURRENT_USER
        }

# [Previous code remains the same until the main block]

if __name__ == "__main__":
    try:
        # Read the input JSON file
        with open('input.json', 'r') as f:
            strategy_input = f.read()
        
        # Run the strategy with the input
        results = run_strategy(strategy_input)
        
        # Save results to output.json
        save_results(results)
        
        print("Strategy execution completed successfully")
        
    except Exception as e:
        error_result = {
            "status": "error",
            "message": str(e),
            "timestamp": CURRENT_UTC_TIME,
            "user": CURRENT_USER
        }
        save_results(error_result)
        print(f"Error executing strategy: {str(e)}", file=sys.stderr)
        sys.exit(1)