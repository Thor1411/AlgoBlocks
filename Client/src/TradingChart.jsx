import React from 'react';
import PropTypes from 'prop-types';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Scatter
} from 'recharts';

// Utility functions to calculate indicators
const calculateSMA = (data, period = 20) => {
  const sma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push({ value: null });
      continue;
    }
    
    const sum = data.slice(i - period + 1, i + 1)
      .reduce((acc, val) => acc + val.close, 0);
    sma.push({ value: sum / period });
  }
  return sma;
};

const calculateRSI = (data, period = 14) => {
  const rsi = [];
  let gains = [];
  let losses = [];

  // Calculate price changes
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      rsi.push({ value: null });
      continue;
    }

    const change = data[i].close - data[i - 1].close;
    gains.push(Math.max(0, change));
    losses.push(Math.max(0, -change));

    if (i < period) {
      rsi.push({ value: null });
      continue;
    }

    if (i === period) {
      const avgGain = gains.reduce((a, b) => a + b) / period;
      const avgLoss = losses.reduce((a, b) => a + b) / period;
      gains = [avgGain];
      losses = [avgLoss];
    } else {
      const avgGain = (gains[0] * (period - 1) + Math.max(0, change)) / period;
      const avgLoss = (losses[0] * (period - 1) + Math.max(0, -change)) / period;
      gains = [avgGain];
      losses = [avgLoss];
    }

    const rs = gains[0] / losses[0];
    rsi.push({ value: 100 - (100 / (1 + rs)) });
  }
  return rsi;
};

const TradingChart = ({ plotData }) => {
// Add detailed console logging
  console.log('TradingChart Data Overview:', {
    totalDates: plotData?.dates?.length || 0,
    totalCandlesticks: plotData?.candlesticks?.length || 0,
    totalTrades: plotData?.trades?.length || 0,
    timeRange: {
      start: plotData?.dates?.[0],
      end: plotData?.dates?.[plotData?.dates?.length - 1]
    }
  });

  // Log first few candlesticks
  console.log('First 5 Candlesticks:', plotData?.candlesticks?.slice(0, 5).map(candle => ({
    date: candle.date,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  })));

  // Log first few trades if they exist
  if (plotData?.trades?.length > 0) {
    console.log('First 5 Trades:', plotData.trades.slice(0, 5));
  }

  // Validate and prepare base data
  if (!plotData || !plotData.dates || !plotData.candlesticks) {
    console.error('Missing required base data');
    return <div>Missing required base data</div>;
  }

  try {
    // Ensure indicators object exists
    const indicators = plotData.indicators || {};
    
    // Calculate SMA and RSI if not provided
    const sma20 = indicators.SMA_20 || calculateSMA(plotData.candlesticks);
    const rsi14 = indicators.RSI_14 || calculateRSI(plotData.candlesticks);

    // Combine all data points
    const combinedData = plotData.dates.map((date, index) => {
      const candlestick = plotData.candlesticks[index];
      const volumeData = plotData.volume ? plotData.volume[index] : { value: 0 };
      
      return {
        date,
        open: Number(candlestick.open),
        high: Number(candlestick.high),
        low: Number(candlestick.low),
        close: Number(candlestick.close),
        volume: Number(volumeData.value),
        sma20: sma20[index]?.value,
        rsi: rsi14[index]?.value
      };
    });

    // Filter out null values for the RSI chart
    const rsiData = combinedData.filter(d => d.rsi !== null);

    return (
      <div style={{ width: '100%', height: 600 }}>
        <ResponsiveContainer width="100%" height="70%">
          <ComposedChart data={combinedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis yAxisId="price" domain={['auto', 'auto']} />
            <YAxis yAxisId="volume" orientation="right" domain={['auto', 'auto']} />
            <Tooltip />
            <Legend />
            <Bar
              dataKey="volume"
              yAxisId="volume"
              fill="#8884d8"
              opacity={0.3}
              name="Volume"
            />
            <Line
              type="monotone"
              dataKey="close"
              stroke="#000000"
              yAxisId="price"
              dot={false}
              name="Price"
            />
            <Line
              type="monotone"
              dataKey="sma20"
              stroke="#ff7300"
              yAxisId="price"
              dot={false}
              name="SMA(20)"
            />
            {plotData.trades && plotData.trades.map((trade, index) => (
              <Scatter
                key={index}
                name={`${trade.type === 'buy' ? 'Buy' : 'Sell'} ${index + 1}`}
                data={[{
                  date: trade.date,
                  price: Number(trade.price)
                }]}
                yAxisId="price"
                fill={trade.type === 'buy' ? '#00ff00' : '#ff0000'}
                shape="triangle"
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>

        <ResponsiveContainer width="100%" height="25%">
          <ComposedChart data={rsiData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="rsi"
              stroke="#2196f3"
              name="RSI(14)"
            />
            <Line
              type="monotone"
              data={[
                { date: plotData.dates[0], overbought: 70 },
                { date: plotData.dates[plotData.dates.length - 1], overbought: 70 }
              ]}
              dataKey="overbought"
              stroke="#ff0000"
              strokeDasharray="3 3"
              name="Overbought (70)"
            />
            <Line
              type="monotone"
              data={[
                { date: plotData.dates[0], oversold: 30 },
                { date: plotData.dates[plotData.dates.length - 1], oversold: 30 }
              ]}
              dataKey="oversold"
              stroke="#ff0000"
              strokeDasharray="3 3"
              name="Oversold (30)"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  } catch (error) {
    console.error('Error processing data:', error);
    return (
      <div style={{ 
        padding: '20px', 
        backgroundColor: '#fff3f3', 
        border: '1px solid #ffcdd2',
        borderRadius: '4px' 
      }}>
        <p>Error processing data: {error.message}</p>
      </div>
    );
  }
};

TradingChart.propTypes = {
  plotData: PropTypes.shape({
    dates: PropTypes.arrayOf(PropTypes.string).isRequired,
    candlesticks: PropTypes.arrayOf(PropTypes.shape({
      open: PropTypes.number.isRequired,
      high: PropTypes.number.isRequired,
      low: PropTypes.number.isRequired,
      close: PropTypes.number.isRequired,
    })).isRequired,
    volume: PropTypes.arrayOf(PropTypes.shape({
      value: PropTypes.number,
    })),
    indicators: PropTypes.shape({
      SMA_20: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.number,
      })),
      RSI_14: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.number,
      })),
    }),
    trades: PropTypes.arrayOf(PropTypes.shape({
      date: PropTypes.string.isRequired,
      type: PropTypes.oneOf(['buy', 'sell']).isRequired,
      price: PropTypes.number.isRequired,
    })),
  }).isRequired,
};

export default TradingChart;