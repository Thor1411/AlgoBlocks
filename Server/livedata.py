import yfinance as yf
import pandas as pd
import json
import logging
from datetime import datetime, timedelta
import numpy as np

# Set up logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global constants
CURRENT_UTC_TIME = "2025-04-18 09:40:27"
CURRENT_USER = "c4ndY1"

class NumpyJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder to handle numpy data types and NaN values"""
    def default(self, obj):
        if isinstance(obj, (np.float32, np.float64)):
            if np.isnan(obj):
                return None
            return float(obj)
        elif isinstance(obj, pd.Series):
            return float(obj.iloc[0])
        return super().default(obj)

def safe_float(value):
    """Safely convert value to float, handling Series objects"""
    if isinstance(value, pd.Series):
        return float(value.iloc[0])
    return float(value)

def fetch_stock_data(symbol: str) -> dict:
    """
    Fetch the last month's stock data for a given symbol
    
    Args:
        symbol (str): Stock symbol (e.g., 'AAPL', 'MSFT')
    
    Returns:
        dict: Dictionary containing status and stock data
    """
    try:
        # Calculate date range (last 30 days)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)
        
        logger.info(f"Fetching data for {symbol} from {start_date.date()} to {end_date.date()}")
        
        # Download data using yfinance
        df = yf.download(
            symbol, 
            start=start_date,
            end=end_date,
            progress=False,
            auto_adjust=True
        )
        
        if df.empty:
            return {
                "status": "error",
                "message": f"No data available for {symbol}",
                "timestamp": CURRENT_UTC_TIME,
                "user": CURRENT_USER
            }
            
        # Process the data
        data = []
        for index, row in df.iterrows():
            data_point = {
                "date": index.strftime("%Y-%m-%d"),
                "open": safe_float(row['Open']),
                "high": safe_float(row['High']),
                "low": safe_float(row['Low']),
                "close": safe_float(row['Close']),
                "volume": safe_float(row['Volume'])
            }
            data.append(data_point)
            
        # Calculate some basic statistics
        stats = {
            "avg_price": safe_float(df['Close'].mean()),
            "min_price": safe_float(df['Low'].min()),
            "max_price": safe_float(df['High'].max()),
            "total_volume": safe_float(df['Volume'].sum()),
            "price_change": safe_float(df['Close'].iloc[-1] - df['Close'].iloc[0]),
            "price_change_percent": safe_float(((df['Close'].iloc[-1] - df['Close'].iloc[0]) / df['Close'].iloc[0]) * 100)
        }
            
        return {
            "status": "success",
            "data": {
                "symbol": symbol,
                "start_date": start_date.strftime("%Y-%m-%d"),
                "end_date": end_date.strftime("%Y-%m-%d"),
                "daily_data": data,
                "statistics": stats
            },
            "timestamp": CURRENT_UTC_TIME,
            "user": CURRENT_USER
        }
        
    except Exception as e:
        logger.error(f"Error fetching data: {str(e)}")
        return {
            "status": "error",
            "message": str(e),
            "timestamp": CURRENT_UTC_TIME,
            "user": CURRENT_USER
        }

def save_results(results: dict, filename: str = 'output.json'):
    """Save results to a JSON file"""
    try:
        with open(filename, 'w') as f:
            json.dump(results, f, indent=2, cls=NumpyJSONEncoder)
        logger.info(f"Results saved to {filename}")
    except Exception as e:
        logger.error(f"Error saving results: {str(e)}")

def main():
    """Main function to run the stock data fetcher"""
    try:
        # Read input from input.json
        with open('input.json', 'r') as f:
            input_data = json.load(f)
            
        # Extract stock symbol
        symbol = input_data.get('stock')
        
        if not symbol:
            raise ValueError("Stock symbol not provided in input.json")
            
        # Fetch and save data
        results = fetch_stock_data(symbol)
        save_results(results)
        
        if results["status"] == "success":
            print("Data fetched and saved successfully")
        else:
            print(f"Error: {results.get('message', 'Unknown error')}")
            
    except Exception as e:
        error_result = {
            "status": "error",
            "message": str(e),
            "timestamp": CURRENT_UTC_TIME,
            "user": CURRENT_USER
        }
        save_results(error_result)
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main()