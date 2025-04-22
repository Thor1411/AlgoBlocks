const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Function to get Python command
function getPythonCommand() {
    if (process.platform === 'win32') {
        // Try different possible Python commands on Windows
        const commands = [
            'python',
            'python3',
            'py',
            'C:\\Python39\\python.exe',  // Adjust version number as needed
            'C:\\Python310\\python.exe',
            '%LocalAppData%\\Programs\\Python\\Python39\\python.exe',
            '%LocalAppData%\\Programs\\Python\\Python310\\python.exe'
        ];
        
        for (const cmd of commands) {
            try {
                require('child_process').execSync(`${cmd} --version`);
                return cmd;
            } catch (e) {
                continue;
            }
        }
        throw new Error('Python not found');
    }
    return 'python3'; // Default for non-Windows systems
}

// Endpoint to handle backtest requests
app.post('/api/run-backtest', async (req, res) => {
    try {
        const { stock, strategy, startDate, endDate } = req.body;

        // Create input data for Python script
        const inputData = {
            stock,
            startDate,
            endDate,
            strategy
        };

        // Write input data to a temporary file
        await fs.writeFile('input.json', JSON.stringify(inputData, null, 2));

        // Get the absolute path of the Python script
        const scriptPath = path.join(__dirname, 'strategy_runner.py');

        // Check if Python script exists
        try {
            await fs.access(scriptPath);
        } catch (error) {
            console.error('Python script not found:', scriptPath);
            return res.status(500).json({
                success: false,
                error: 'Python script not found'
            });
        }

        // Get the correct Python command
        let pythonCommand;
        try {
            pythonCommand = getPythonCommand();
        } catch (error) {
            console.error('Python not found:', error);
            return res.status(500).json({
                success: false,
                error: 'Python is not installed or not in PATH'
            });
        }

        console.log(`Using Python command: ${pythonCommand}`);
        
        // Spawn Python process
        const pythonProcess = spawn(pythonCommand, [scriptPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true // This is important for Windows
        });

        let errorData = '';
        let outputData = '';

        // Collect standard output data from Python script
        pythonProcess.stdout.on('data', (data) => {
            outputData += data.toString();
            console.log('Python output:', data.toString());
        });

        // Collect error data from Python script
        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
            console.error('Python error:', data.toString());
        });

        // Handle process completion
        pythonProcess.on('close', async (code) => {
            try {
                if (code !== 0) {
                    console.error('Python script error:', errorData);
                    return res.status(500).json({
                        success: false,
                        error: `Strategy execution failed: ${errorData}`
                    });
                }

                // Read the output.json file
                const outputData = await fs.readFile('output.json', 'utf8');
                const results = JSON.parse(outputData);

                // Send the results back to frontend
                res.json({
                    success: true,
                    ...results.data
                });

            } catch (error) {
                console.error('Error processing results:', error);
                res.status(500).json({
                    success: false,
                    error: 'Error processing results'
                });
            }
        });

        // Handle process errors
        pythonProcess.on('error', (error) => {
            console.error('Failed to start Python process:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to start Python process'
            });
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Add a test endpoint to verify Python installation
app.get('/api/test-python', (req, res) => {
    try {
        const pythonCommand = getPythonCommand();
        const version = require('child_process').execSync(`${pythonCommand} --version`).toString();
        res.json({ status: 'success', python_version: version });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Python not found', 
            error: error.message 
        });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});