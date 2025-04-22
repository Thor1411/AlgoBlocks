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
        const commands = [
            'python',
            'python3',
            'py',
            'C:\\Python39\\python.exe',
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

// Function to run Python script and handle the process
async function runPythonScript(scriptName, inputData) {
    const scriptPath = path.join(__dirname, scriptName);

    try {
        await fs.access(scriptPath);
    } catch (error) {
        console.error(`Python script not found: ${scriptPath}`);
        throw new Error(`Python script ${scriptName} not found`);
    }

    let pythonCommand;
    try {
        pythonCommand = getPythonCommand();
    } catch (error) {
        throw new Error('Python is not installed or not in PATH');
    }

    console.log(`Using Python command: ${pythonCommand} for ${scriptName}`);
    
    // Write input data to input.json
    await fs.writeFile('input.json', JSON.stringify(inputData, null, 2));

    return new Promise((resolve, reject) => {
        const pythonProcess = spawn(pythonCommand, [scriptPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });

        let errorData = '';
        let outputData = '';

        pythonProcess.stdout.on('data', (data) => {
            outputData += data.toString();
            console.log(`Python output (${scriptName}):`, data.toString());
        });

        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
            console.error(`Python error (${scriptName}):`, data.toString());
        });

        pythonProcess.on('close', async (code) => {
            try {
                if (code !== 0) {
                    reject(new Error(`Strategy execution failed: ${errorData}`));
                    return;
                }

                // Read the output.json file
                const outputData = await fs.readFile('output.json', 'utf8');
                const results = JSON.parse(outputData);
                
                // Check for error status in results
                if (results.status === 'error') {
                    reject(new Error(results.message || 'Strategy execution failed'));
                    return;
                }

                resolve(results);

            } catch (error) {
                reject(new Error('Error processing results'));
            }
        });

        pythonProcess.on('error', (error) => {
            reject(new Error('Failed to start Python process'));
        });
    });
}

// Add market status endpoint
app.get('/api/market-status', (req, res) => {
    const now = new Date();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const day = now.getUTCDay();

    const isWeekday = day >= 1 && day <= 5;
    const marketTime = (hours >= 14 && hours < 21) || (hours === 13 && minutes >= 30);

    res.json({
        isOpen: isWeekday && marketTime
    });
});

// Endpoint to handle backtest requests
app.post('/api/run-backtest', async (req, res) => {
    try {
        const { stock, strategy, startDate, endDate } = req.body;

        // Create input data structure
        const inputData = {
            stock,
            strategy,
            params: {
                initialCapital: 100000,
            }
        };

        // Add dates if they exist (for backtest mode)
        if (startDate && endDate) {
            inputData.startDate = startDate;
            inputData.endDate = endDate;
        }

        // Choose which Python script to run based on presence of dates
        const scriptName = startDate && endDate ? 'strategy_runner.py' : 'strategy_runner_live.py';
        
        console.log(`Running ${scriptName} for ${stock}`);
        const results = await runPythonScript(scriptName, inputData);

        // Send results back to frontend
        if (results.status === 'success' && results.data) {
            res.json({
                success: true,
                ...results.data
            });
        } else {
            throw new Error(results.message || 'Strategy execution failed');
        }

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

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