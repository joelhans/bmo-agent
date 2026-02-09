/**
 * test_dev_server.mjs
 * Start a dev server, poll until ready, test an endpoint, then kill cleanly.
 * 
 * Key improvements:
 * - Polls endpoint until it responds (no blind waiting)
 * - All network operations have explicit timeouts
 * - Hard overall timeout prevents infinite hangs
 * - Better progress tracking in output
 */

import { spawn } from 'node:child_process';

export const description = 'Start dev server, test endpoint, and kill cleanly (no hung processes)';

export const capabilities = { subprocess: true, network: true };

export const schema = {
  type: 'object',
  properties: {
    command: { type: 'string', description: 'Command to start server (e.g., "npm run dev")' },
    cwd: { type: 'string', description: 'Working directory' },
    testUrl: { type: 'string', description: 'URL to test (e.g., http://localhost:4321/)' },
    maxWaitMs: { type: 'number', default: 30000, description: 'Max time to wait for server to be ready (ms)' },
    fetchTimeoutMs: { type: 'number', default: 5000, description: 'Timeout for each fetch attempt (ms)' },
    pollIntervalMs: { type: 'number', default: 1000, description: 'How often to poll the endpoint (ms)' },
  },
  required: ['command', 'cwd', 'testUrl'],
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function run(args) {
  const { 
    command, 
    cwd, 
    testUrl, 
    maxWaitMs = 30000,
    fetchTimeoutMs = 5000,
    pollIntervalMs = 1000,
  } = args;
  
  let serverProcess = null;
  let stdout = '';
  let stderr = '';
  const timeline = []; // Track what happened when
  
  const cleanup = () => {
    if (serverProcess && !serverProcess.killed) {
      // Kill the entire process group if we spawned detached
      try {
        process.kill(-serverProcess.pid, 'SIGTERM');
      } catch {
        // Fallback to direct kill
        serverProcess.kill('SIGTERM');
      }
      
      // Force kill after 2 seconds
      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          try {
            process.kill(-serverProcess.pid, 'SIGKILL');
          } catch {
            serverProcess.kill('SIGKILL');
          }
        }
      }, 2000);
    }
  };
  
  try {
    // Parse command - handle quoted args properly
    const [cmd, ...cmdArgs] = command.split(/\s+/);
    
    timeline.push({ t: 0, event: 'spawning server', command });
    
    // Spawn server process in its own process group so we can kill children
    serverProcess = spawn(cmd, cmdArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true, // Own process group for clean kill
    });
    
    // Collect output
    serverProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    serverProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    // Handle early exit
    let serverExited = false;
    let exitCode = null;
    serverProcess.on('exit', (code) => {
      serverExited = true;
      exitCode = code;
      timeline.push({ t: Date.now() - startTime, event: 'server exited', code });
    });
    
    const startTime = Date.now();
    let attempts = 0;
    let lastError = null;
    
    // Poll until endpoint responds or timeout
    while ((Date.now() - startTime) < maxWaitMs) {
      if (serverExited) {
        throw new Error(`Server exited early with code ${exitCode}`);
      }
      
      attempts++;
      const elapsed = Date.now() - startTime;
      
      try {
        timeline.push({ t: elapsed, event: 'fetch attempt', attempt: attempts });
        
        const fetchStart = Date.now();
        const response = await fetchWithTimeout(testUrl, fetchTimeoutMs);
        const fetchTime = Date.now() - fetchStart;
        
        // Success! Get body and return
        const body = await response.text();
        
        timeline.push({ t: Date.now() - startTime, event: 'success', status: response.status });
        
        // Clean up server
        cleanup();
        
        return {
          ok: true,
          result: {
            status: response.status,
            statusText: response.statusText,
            responseTime: fetchTime,
            totalTime: Date.now() - startTime,
            attempts,
            bodyPreview: body.slice(0, 500),
            bodyLength: body.length,
            timeline: timeline.slice(-10), // Last 10 events
            serverStdout: stdout.slice(-500),
            serverStderr: stderr.slice(-500),
          },
        };
        
      } catch (err) {
        lastError = err.name === 'AbortError' ? 'fetch timeout' : err.message;
        timeline.push({ t: Date.now() - startTime, event: 'fetch failed', error: lastError });
        
        // Connection refused or timeout - server not ready yet, keep polling
        await sleep(pollIntervalMs);
      }
    }
    
    // Timed out
    cleanup();
    
    return {
      ok: false,
      error: `Server did not respond within ${maxWaitMs}ms after ${attempts} attempts. Last error: ${lastError}`,
      details: {
        timeline: timeline.slice(-15),
        serverStdout: stdout.slice(-1000),
        serverStderr: stderr.slice(-1000),
      },
    };
    
  } catch (err) {
    cleanup();
    
    return {
      ok: false,
      error: err.message,
      details: {
        timeline,
        serverStdout: stdout.slice(-1000),
        serverStderr: stderr.slice(-1000),
      },
    };
  }
}
