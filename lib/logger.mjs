import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (process.platform !== 'win32') {
      try { fs.chmodSync(dir, 0o700); } catch (_) {}
    }
    return true;
  } catch (_) { return false; }
}

function resolveDataDir() {
  const homeDir = os.homedir() || process.env.HOME || process.env.USERPROFILE || '.';
  const override = process.env.BMO_DATA_DIR;
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(homeDir, '.local', 'share', 'bmo');
}

export function initSessionLogger() {
  const dataBaseDir = resolveDataDir();
  ensureDir(dataBaseDir);
  const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFilePath = path.join(dataBaseDir, `agent-${sessionTimestamp}.log`);

  function append(line) {
    try { fs.appendFileSync(logFilePath, line); } catch (_) {}
  }

  append(`=== Agent session started at ${new Date().toISOString()} ===\n`);

  return {
    path: logFilePath,
    logUser(text) { append(`You: ${text}\n`); },
    logAssistant(text) { append(`bmo: ${text}\n`); },
    logToolCall(name, details = '') { append(`[tool call] ${name}${details ? ' ' + details : ''}\n`); },
    logToolResult(snippet) { append(`[tool result] ${snippet}\n`); },
    end(reason = 'ended') { append(`=== Agent session ${reason} at ${new Date().toISOString()} ===\n`); }
  };
}
