import React, { useState, useEffect } from 'react';
import './Livedata.css';

function StockData() {
    const [symbol, setSymbol] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [stockData, setStockData] = useState(null);
    const [currentTime, setCurrentTime] = useState("2025-04-18 09:52:51");
    const [currentUser, setCurrentUser] = useState("c4ndY1");

    // Fetch initialization data when component mounts
    useEffect(() => {
        fetch('http://localhost:5000/')
            .then(response => response.json())
            .then(data => {
                if (data.status === "success") {
                    setCurrentTime(data.currentTime);
                    setCurrentUser(data.currentUser);
                }
            })
            .catch(err => {
                console.error('Failed to fetch initialization data:', err);
                // Use default values if server is not reachable
                setCurrentTime("2025-04-18 09:52:51");
                setCurrentUser("c4ndY1");
            });
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setStockData(null);

        try {
            const response = await fetch('http://localhost:5000/api/stock-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ stock: symbol })
            });

            const data = await response.json();
            
            if (data.status === 'success') {
                setStockData(data.data);
            } else {
                setError(data.message || 'Failed to fetch stock data');
            }
        } catch (err) {
            setError('Failed to connect to server');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="stock-data-container">
            <div className="header-info">
                <p>Current Time (UTC): {currentTime}</p>
                <p>User: {currentUser}</p>
            </div>

            <h1>Stock Data Viewer</h1>
            
            <form onSubmit={handleSubmit} className="stock-form">
                <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="Enter stock symbol (e.g., AAPL)"
                    required
                />
                <button type="submit" disabled={loading}>
                    {loading ? 'Loading...' : 'Fetch Data'}
                </button>
            </form>

            {error && (
                <div className="error-message">
                    {error}
                </div>
            )}

            {stockData && (
                <div className="stock-results">
                    <h2>{stockData.symbol} Stock Data</h2>
                    <div className="date-range">
                        <p>From: {stockData.start_date}</p>
                        <p>To: {stockData.end_date}</p>
                    </div>

                    <div className="statistics">
                        <h3>Statistics</h3>
                        <div className="stats-grid">
                            <div className="stat-item">
                                <label>Average Price:</label>
                                <span>${stockData.statistics.avg_price.toFixed(2)}</span>
                            </div>
                            <div className="stat-item">
                                <label>Minimum Price:</label>
                                <span>${stockData.statistics.min_price.toFixed(2)}</span>
                            </div>
                            <div className="stat-item">
                                <label>Maximum Price:</label>
                                <span>${stockData.statistics.max_price.toFixed(2)}</span>
                            </div>
                            <div className="stat-item">
                                <label>Price Change:</label>
                                <span style={{ color: stockData.statistics.price_change >= 0 ? 'green' : 'red' }}>
                                    ${stockData.statistics.price_change.toFixed(2)} 
                                    ({stockData.statistics.price_change_percent.toFixed(2)}%)
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="daily-data">
                        <h3>Daily Data</h3>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Open</th>
                                        <th>High</th>
                                        <th>Low</th>
                                        <th>Close</th>
                                        <th>Volume</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stockData.daily_data.map((day) => (
                                        <tr key={day.date}>
                                            <td>{day.date}</td>
                                            <td>${day.open.toFixed(2)}</td>
                                            <td>${day.high.toFixed(2)}</td>
                                            <td>${day.low.toFixed(2)}</td>
                                            <td>${day.close.toFixed(2)}</td>
                                            <td>{day.volume.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default StockData;