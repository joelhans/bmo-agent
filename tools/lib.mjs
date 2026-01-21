import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";

// BMO_HOME resolution - works for both source and compiled binary
function getBmoHome() {
  if (process.env.BMO_HOME) {
    return path.resolve(process.env.BMO_HOME);
  }
  
  // This file lives in BMO_HOME/tools/ or BMO_HOME/bmo-tools/, so go up one level
  const currentFile = fileURLToPath(import.meta.url);
  return path.dirname(path.dirname(currentFile));
}

export const BMO_HOME = getBmoHome();

// Resolve tools directory: prefer bmo-tools/ (installed), fall back to tools/ (source)
export function getToolsDir() {
  const bmoToolsDir = path.join(BMO_HOME, "bmo-tools");
  if (fs.existsSync(bmoToolsDir)) {
    return bmoToolsDir;
  }
  return path.join(BMO_HOME, "tools");
}

// Resolve BMO_SOURCE with sensible defaults for installed binaries
// Precedence:
//  1) If ~/src/bmo-agent exists, use it (default dev source)
//  2) Else if BMO_SOURCE env var is set, use that
//  3) Else null (no source mirror)
function resolveBmoSource() {
  try {
    const defaultPath = path.join(os.homedir(), "src", "bmo-agent");
    if (fs.existsSync(defaultPath)) {
      return defaultPath;
    }
  } catch (_) {
    // ignore
  }
  if (process.env.BMO_SOURCE) {
    try {
      return path.resolve(process.env.BMO_SOURCE);
    } catch (_) {
      return null;
    }
  }
  return null;
}

// BMO_SOURCE: canonical source location for persisting new tools
// When set, writes to bmo:// go here AND get copied to BMO_HOME
export const BMO_SOURCE = resolveBmoSource();

// Config directory (separate from BMO_HOME so installs don't overwrite user data)
function getConfigDir() {
  if (process.env.BMO_CONF) {
    return path.resolve(process.env.BMO_CONF);
  }
  // Default to XDG-like location
  return path.join(os.homedir(), ".local", "share", "bmo");
}

export const BMO_CONF = getConfigDir();

// Path resolution: bmo:// prefix routes to BMO_HOME
const BMO_PREFIX = "bmo://";

export function resolvePath(inputPath) {
  if (inputPath.startsWith(BMO_PREFIX)) {
    const relativePart = inputPath.slice(BMO_PREFIX.length);
    
    // Route bmo://tools/... or bmo://bmo-tools/... to the actual tools directory
    if (relativePart.startsWith("tools/") || relativePart.startsWith("bmo-tools/")) {
      const prefix = relativePart.startsWith("tools/") ? "tools/" : "bmo-tools/";
      const toolRelative = relativePart.slice(prefix.length);
      return path.join(getToolsDir(), toolRelative);
    }
    
    return path.join(BMO_HOME, relativePart);
  }
  return path.resolve(inputPath);
}

export function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (process.platform !== "win32") {
      try {
        fs.chmodSync(dir, 0o700);
      } catch (_) {}
    }
    return true;
  } catch (_) {
    return false;
  }
}

// Callback registry for reload_tools to call back into the main module
let _reloadCallback = null;

export function registerReloadCallback(fn) {
  _reloadCallback = fn;
}

export async function triggerReload() {
  if (_reloadCallback) {
    return await _reloadCallback();
  }
  return { error: "reload callback not registered" };
}

// Helper to build standardized details strings for tool calls
export function formatDetails(parts = []) {
  return parts.filter(Boolean).join(' ');
}
