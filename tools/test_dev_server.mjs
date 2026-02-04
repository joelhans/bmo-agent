/**
 * test_dev_server.mjs
 * Start a dev server, wait for it to be ready, test an endpoint, then kill it cleanly.
 */

import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

export const description = 'Start dev server, test endpoint, and kill cleanly (no hung processes)';

export const schema = {
  type: 'object',
  properties: {
    command: { type: 'string', description: 'Command to start server (e.g., "pnpm start")' },
    cwd: { type: 'string', description: 'Working directory' },
    testUrl: { type: 'string', description: 'URL to test (e.g., http://localhost:5173/love)' },
    startupWaitMs: { type: 'number', default: 20000, description: 'How long to wait for server startup (ms)' },
    readyPattern: { type: 'string', description: 'Regex pattern in stdout indicating server ready (optional)' },
  },
  required: ['command', 'cwd', 'testUrl'],
};

export async function run(args) {
  const { command, cwd, testUrl, startupWaitMs = 20000, readyPattern } = args;
  
  let serverProcess = null;
  let stdout = '';
  let stderr = '';
  
  try {
    // Parse command into array
    const [cmd, ...cmdArgs] = command.split(/\s+/);
    
    // Spawn server process
    serverProcess = spawn(cmd, cmdArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false, // Keep as child so we can kill it
    });
    
    const startTime = Date.now();
    let serverReady = false;
    
    // Collect output
    serverProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (readyPattern && new RegExp(readyPattern).test(chunk)) {
        serverReady = true;
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    // Wait for startup (either pattern match or timeout)
    const checkInterval = 500;
    while (!serverReady && (Date.now() - startTime) < startupWaitMs) {
      await setTimeout(checkInterval);
      if (readyPattern === undefined) {
        // No pattern, just wait the full time
        serverReady = (Date.now() - startTime) >= startupWaitMs;
      }
    }
    
    if (!serverReady) {
      throw new Error(`Server did not become ready within ${startupWaitMs}ms`);
    }
    
    // Test the endpoint
    const fetchStart = Date.now();
    const response = await fetch(testUrl);
    const fetchTime = Date.now() - fetchStart;
    const body = await response.text();
    
    // Kill the server
    serverProcess.kill('SIGTERM');
    
    // Wait a bit for graceful shutdown
    await setTimeout(1000);
    
    // Force kill if still alive
    if (!serverProcess.killed) {
      serverProcess.kill('SIGKILL');
    }
    
    return {
      ok: true,
      result: {
        status: response.status,
        statusText: response.statusText,
        responseTime: fetchTime,
        bodyPreview: body.slice(0, 500),
        bodyLength: body.length,
        serverStdout: stdout.slice(-1000), // Last 1KB
        serverStderr: stderr.slice(-1000),
      },
    };
    
  } catch (err) {
    // Make sure we kill the server on error
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGKILL');
    }
    
    return {
      ok: false,
      error: `${err.message}\n\nServer stdout:\n${stdout.slice(-1000)}\n\nServer stderr:\n${stderr.slice(-1000)}`,
    };
  }
}
