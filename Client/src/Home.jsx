import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Card,
  Grid,
  AppBar,
  Toolbar,
  Button,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import CreateIcon from '@mui/icons-material/Create';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

const StyledCard = styled(Card)(({ theme }) => ({
  height: '300px',
  padding: "32px",
  margin: "16px 0",
  borderRadius: "16px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  backgroundColor: "#ffffff",
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
  cursor: 'pointer',
  '&:hover': {
    transform: 'translateY(-8px)',
    boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
  }
}));

const IconWrapper = styled(Box)(({ theme }) => ({
  fontSize: '64px',
  marginBottom: '24px',
  color: '#1976d2',
  transition: 'transform 0.3s ease-in-out',
  '&:hover': {
    transform: 'scale(1.1)',
  }
}));

const Home = () => {
  const navigate = useNavigate();

  const features = [
    {
      title: "Make Strategy",
      description: "Create custom trading strategies using our intuitive block-based interface",
      icon: <CreateIcon sx={{ fontSize: 64 }} />,
      path: "/builder"
    },
    {
      title: "Run Backtest",
      description: "Test your strategies using historical market data",
      icon: <ShowChartIcon sx={{ fontSize: 64 }} />,
      path: "/testing"
    },
    {
      title: "Run Live Test",
      description: "Execute your strategies in real-time market conditions",
      icon: <PlayArrowIcon sx={{ fontSize: 64 }} />,
      path: "/testing2"
    }
  ];

  return (
    <Box sx={{ bgcolor: "#f5f5f5", minHeight: "100vh" }}>
      <AppBar
        position="static"
        sx={{
          bgcolor: "#1976d2",
          backgroundImage: "linear-gradient(135deg, #1976d2 0%, #0d47a1 100%)",
        }}
      >
        <Toolbar>
          <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 600 }}>
            AlgoBlocks
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 8, mb: 8 }}>
        <Box textAlign="center" mb={8}>
          <Typography variant="h3" gutterBottom fontWeight="bold">
            Empowering Your Trading Journey
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 800, mx: 'auto' }}>
            Design, test, and deploy algorithmic trading strategies with ease - no coding required
          </Typography>
        </Box>

        <Grid container spacing={4}>
          {features.map((feature, index) => (
            <Grid item xs={12} md={4} key={index}>
              <StyledCard onClick={() => navigate(feature.path)}>
                <IconWrapper>
                  {feature.icon}
                </IconWrapper>
                <Typography variant="h5" gutterBottom fontWeight="bold">
                  {feature.title}
                </Typography>
                <Typography variant="body1" color="text.secondary" textAlign="center">
                  {feature.description}
                </Typography>
              </StyledCard>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
};

export default Home;