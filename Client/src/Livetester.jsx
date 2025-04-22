import React, { useState, useEffect } from "react";
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  Grid,
  AppBar,
  Toolbar,
  Chip,
  CircularProgress,
  Paper,
  Alert,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import TradingChart from './TradingChart.jsx';
import ErrorBoundary from './ErrorBoundary';

// API configuration
const API_URL = "http://localhost:5000/api";

const StyledCard = styled(Card)({
  padding: "24px",
  margin: "16px 0",
  borderRadius: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  backgroundColor: "#ffffff",
});

const ImageContainer = styled(Paper)({
  padding: "16px",
  marginTop: "16px",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "300px",
});

const UploadBox = styled(Box)({
  border: "2px dashed #1976d2",
  borderRadius: "12px",
  padding: "20px",
  textAlign: "center",
  backgroundColor: "#f8fafc",
  marginBottom: "24px",
  cursor: "pointer",
  transition: "all 0.3s ease",
  "&:hover": {
    backgroundColor: "#e3f2fd",
    borderColor: "#1565c0",
  },
});

const ResultsGrid = styled(Grid)({
  marginTop: "16px",
  "& .result-item": {
    padding: "16px",
    backgroundColor: "#f8fafc",
    borderRadius: "8px",
    transition: "all 0.3s ease",
    "&:hover": {
      backgroundColor: "#e3f2fd",
    },
  },
});

const Testing = () => {
  const [selectedStock, setSelectedStock] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [backTestResults, setBackTestResults] = useState(null);
  const [strategyFile, setStrategyFile] = useState(null);
  const [strategyError, setStrategyError] = useState(null);
  const [marketStatus, setMarketStatus] = useState(null);

  // Available test stocks
  const testStocks = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NFLX", "NVDA"];

  // Check market status on component mount and every minute
  useEffect(() => {
    const checkMarketStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/market-status`);
        if (!response.ok) {
          throw new Error("Failed to fetch market status");
        }
        const data = await response.json();
        setMarketStatus(data.isOpen);
      } catch (error) {
        console.error("Error checking market status:", error);
        setMarketStatus(false);
      }
    };

    checkMarketStatus();
    const interval = setInterval(checkMarketStatus, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    setStrategyError(null);

    if (file) {
      if (file.type !== "application/json") {
        setStrategyError("Please upload a JSON file");
        setStrategyFile(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = JSON.parse(e.target.result);
          setStrategyFile({
            file,
            content,
          });
          setStrategyError(null);
        } catch (error) {
          setStrategyError("Invalid JSON file format");
          setStrategyFile(null);
        }
      };
      reader.onerror = () => {
        setStrategyError("Error reading file");
        setStrategyFile(null);
      };
      reader.readAsText(file);
    }
  };

  const handleRunBacktest = async () => {
    if (!marketStatus) {
      setStrategyError("Market is currently closed. Testing is only available during market hours.");
      return;
    }

    if (!strategyFile) {
      setStrategyError("Please upload a strategy file first");
      return;
    }

    if (!selectedStock) {
      setStrategyError("Please select a stock");
      return;
    }

    setIsLoading(true);
    setStrategyError(null);
    setBackTestResults(null);

    try {
      const data = {
        stock: selectedStock,
        strategy: strategyFile.content,
      };

      const response = await fetch(`${API_URL}/run-backtest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to run backtest");
      }

      const results = await response.json();
      
      if (results.success) {
        setBackTestResults({
          initialValue: Number(results.initial_value) || 0,
          finalValue: Number(results.final_value) || 0,
          totalReturn: (Number(results.returns_pct) || 0).toFixed(2),
          sharpeRatio: (Number(results.sharpe_ratio) || 0).toFixed(2),
          maxDrawdown: (Number(results.max_drawdown_pct) || 0).toFixed(2),
          maxDrawdownMoney: (Number(results.max_drawdown_money) || 0).toFixed(2),
          plotData: results.plot_data || {},
          metadata: {
            strategy_name: results.metadata?.strategy_name || 'Unknown Strategy',
            symbol: results.metadata?.symbol || selectedStock
          }
        });
      } else {
        throw new Error(results.message || "Failed to run backtest");
      }
    } catch (error) {
      console.error("Backtest failed:", error);
      setStrategyError(`Backtest failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderResults = () => {
    if (!backTestResults) return null;

    return (
      <ResultsGrid container spacing={2}>
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            Strategy: {backTestResults.metadata?.strategy_name || 'Unknown Strategy'}
          </Typography>
          <Typography variant="subtitle1" gutterBottom>
            {backTestResults.metadata?.symbol || ''}
          </Typography>
        </Grid>
        
        <Grid item xs={6} className="result-item">
          <Typography variant="subtitle2" color="textSecondary">
            Initial Value
          </Typography>
          <Typography variant="h6">
            ${(backTestResults.initialValue || 0).toLocaleString()}
          </Typography>
        </Grid>

        <Grid item xs={6} className="result-item">
          <Typography variant="subtitle2" color="textSecondary">
            Final Value
          </Typography>
          <Typography variant="h6">
            ${(backTestResults.finalValue || 0).toLocaleString()}
          </Typography>
        </Grid>

        <Grid item xs={6} className="result-item">
          <Typography variant="subtitle2" color="textSecondary">
            Total Return
          </Typography>
          <Typography 
            variant="h6" 
            color={parseFloat(backTestResults.totalReturn || 0) >= 0 ? "success.main" : "error.main"}
          >
            {backTestResults.totalReturn || '0.00'}%
          </Typography>
        </Grid>

        <Grid item xs={6} className="result-item">
          <Typography variant="subtitle2" color="textSecondary">
            Sharpe Ratio
          </Typography>
          <Typography variant="h6">{backTestResults.sharpeRatio || '0.00'}</Typography>
        </Grid>

        <Grid item xs={6} className="result-item">
          <Typography variant="subtitle2" color="textSecondary">
            Max Drawdown (%)
          </Typography>
          <Typography variant="h6" color="error.main">
            {backTestResults.maxDrawdown || '0.00'}%
          </Typography>
        </Grid>

        <Grid item xs={6} className="result-item">
          <Typography variant="subtitle2" color="textSecondary">
            Max Drawdown ($)
          </Typography>
          <Typography variant="h6" color="error.main">
            ${parseFloat(backTestResults.maxDrawdownMoney || 0).toLocaleString()}
          </Typography>
        </Grid>
      </ResultsGrid>
    );
  };

  return (
    <Box sx={{ bgcolor: "#f5f5f5", minHeight: "100vh" }}>
      <AppBar
        position="static"
        sx={{
          bgcolor: "#1976d2",
          mb: 4,
          backgroundImage: "linear-gradient(135deg, #1976d2 0%, #0d47a1 100%)",
        }}
      >
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Strategy Livetesting
          </Typography>
          {marketStatus !== null && (
            <Chip
              label={marketStatus ? "Market Open" : "Market Closed"}
              color={marketStatus ? "success" : "error"}
              sx={{ ml: 2 }}
            />
          )}
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg">
        <Grid container spacing={3}>
          {/* Left Column - Strategy Upload and Stock Selection */}
          <Grid item xs={12} md={6}>
            <StyledCard>
              <Typography
                variant="h6"
                gutterBottom
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <UploadFileIcon />
                Upload Strategy
              </Typography>

              <input
                type="file"
                accept=".json"
                id="strategy-upload"
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
              <label htmlFor="strategy-upload">
                <UploadBox>
                  {strategyFile ? (
                    <Typography variant="subtitle1" color="primary">
                      Uploaded: {strategyFile.file.name}
                    </Typography>
                  ) : (
                    <>
                      <UploadFileIcon
                        sx={{ fontSize: 40, color: "#1976d2", mb: 1 }}
                      />
                      <Typography variant="subtitle1">
                        Click to upload your JSON strategy file
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        .json files only
                      </Typography>
                    </>
                  )}
                </UploadBox>
              </label>

              {strategyError && (
                <Alert severity="error" sx={{ mb: 3 }}>
                  {strategyError}
                </Alert>
              )}

              <Typography
                variant="h6"
                gutterBottom
                sx={{ display: "flex", alignItems: "center", gap: 1, mt: 4 }}
              >
                <ShowChartIcon />
                Select Test Stock
              </Typography>

              <Box sx={{ mb: 4 }}>
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 1.5,
                    backgroundColor: "#f8fafc",
                    padding: 2,
                    borderRadius: 2,
                  }}
                >
                  {testStocks.map((stock) => (
                    <Chip
                      key={stock}
                      label={stock}
                      onClick={() => setSelectedStock(stock)}
                      color={selectedStock === stock ? "primary" : "default"}
                      clickable
                      sx={{
                        fontSize: "1rem",
                        padding: "20px 10px",
                        "&:hover": {
                          backgroundColor: "#e3f2fd",
                        },
                        "&.MuiChip-colorPrimary": {
                          backgroundColor: "#1976d2",
                          color: "white",
                        },
                      }}
                    />
                  ))}
                </Box>
              </Box>

              <Button
                variant="contained"
                fullWidth
                disabled={isLoading || !selectedStock || !strategyFile || !marketStatus}
                sx={{
                  height: "48px",
                  bgcolor: "#1976d2",
                  "&:hover": {
                    bgcolor: "#115293",
                  },
                  "&.Mui-disabled": {
                    bgcolor: "#ccc",
                  },
                }}
                onClick={handleRunBacktest}
                startIcon={
                  isLoading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <PlayArrowIcon />
                  )
                }
              >
                {isLoading ? "Running Test..." : "Run Backtest"}
              </Button>
            </StyledCard>
          </Grid>

          {/* Right Column - Results */}
          <Grid item xs={12} md={6}>
            <StyledCard>
              <Typography
                variant="h6"
                gutterBottom
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <ShowChartIcon />
                Backtest Results
              </Typography>

              {isLoading ? (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "300px",
                  }}
                >
                  <CircularProgress />
                </Box>
              ) : backTestResults ? (
                renderResults()
              ) : (
                <Box
                  sx={{
                    p: 4,
                    textAlign: "center",
                    height: "300px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#f8fafc",
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="body1" color="textSecondary">
                    {!marketStatus
                      ? "Market is currently closed"
                      : !strategyFile
                      ? "Upload your strategy file to begin"
                      : !selectedStock
                      ? "Select a stock to test your strategy"
                      : `Ready to test strategy on ${selectedStock}`}
                  </Typography>
                </Box>
              )}

              {backTestResults && backTestResults.plotData && (
                <ImageContainer>
                  <Typography variant="h6" gutterBottom>
                    Trading Activity
                  </Typography>
                  <ErrorBoundary>
                    <TradingChart plotData={backTestResults.plotData} />
                  </ErrorBoundary>
                  <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                    Number of trades: {backTestResults.plotData.trades?.length || 0}
                  </Typography>
                </ImageContainer>
              )}
            </StyledCard>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default Testing;