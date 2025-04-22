import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '20px', 
          backgroundColor: '#fff3f3', 
          border: '1px solid #ffcdd2',
          borderRadius: '4px',
          margin: '10px 0'
        }}>
          <h3 style={{ color: '#d32f2f' }}>Chart Loading Error</h3>
          <p>We're unable to display the chart at this moment. Please check your data format.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;