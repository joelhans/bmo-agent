import { formatDetails } from "./lib.mjs";
import { spawn } from "child_process";
import * as path from "path";

export const schema = {
  type: "function",
  function: {
    name: "safe_run",
    description: "Run a shell command with robust bash wrapping, safe defaults, colorless output, pipefail, timeout, and danger guards. Useful for rg/grep and other CLIs that can hang or page output.",
    parameters: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "The shell command to execute (will run under bash -lc)." },
        timeoutMs: { type: "integer", description: "Timeout in milliseconds (default 60000)." },
        cwd: { type: "string", description: "Working directory to run the command in (defaults to current working directory)." },
        allowDangerous: { type: "boolean", description: "Allow potentially dangerous commands like rm -rf /. Defaults to false (blocked)." },
        env: { type: "object", description: "Additional environment variables to set for the command." },
        reason: { type: "string", description: "Why this command is being run (logged for transparency)." }
      },
      required: ["cmd"],
    },
  },
};

export function details(args) {
  const { cmd, cwd, reason } = args || {};
  const displayCmd = (cmd || '').slice(0, 200);
  return formatDetails([
    displayCmd ? `cmd=${JSON.stringify(displayCmd)}` : null,
    cwd ? `cwd=${path.resolve(cwd)}` : null,
    reason ? `reason=${reason}` : null,
  ]);
}

function looksDangerous(command) {
  const patterns = [
    /\brm\s+-rf\s+\/(\s|$)/,                        // rm -rf /
    /\brm\s+-rf\s+--no-preserve-root\b/,            // rm -rf --no-preserve-root
    /\bmkfs\./,                                       // mkfs.*
    /\bdd\b[^|\n;]*\bof=\/dev\//,                   // dd ... of=/dev/...
    /\bshutdown\b|\breboot\b/,                        // shutdown/reboot
  ];
  return patterns.some((re) => re.test(command));
}

export async function execute(args) {
  const { cmd, timeoutMs = 60000, cwd, allowDangerous = false, env: extraEnv = {} } = args || {};
  if (!cmd || typeof cmd !== "string") {
    return JSON.stringify({ ok: false, error: "cmd is required and must be a string" });
  }

  if (!allowDangerous && looksDangerous(cmd)) {
    return JSON.stringify({ ok: false, error: "Blocked potentially dangerous command. Set allowDangerous=true to run." });
  }

  const env = {
    ...process.env,
    NO_COLOR: "1",
    CLICOLOR: "0",
    TERM: process.env.TERM || "dumb",
    PAGER: "cat",
    GIT_PAGER: "cat",
    RIPGREP_CONFIG_PATH: "/dev/null", // avoid user rg config surprises
    ...extraEnv,
  };

  const shellCmd = `set -Ee -o pipefail; ${cmd}`;

  const start = Date.now();
  let timedOut = false;
  let stdout = "";
  let stderr = "";

  return await new Promise((resolve) => {
    const child = spawn("bash", ["-lc", shellCmd], {
      cwd: cwd ? path.resolve(cwd) : process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGTERM"); } catch (_) {}
      setTimeout(() => { try { child.kill("SIGKILL"); } catch (_) {} }, 2500);
    }, Math.max(1, Number(timeoutMs)));

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("error", (err) => {
      clearTimeout(timeout);
      const durationMs = Date.now() - start;
      resolve(JSON.stringify({ ok: false, error: String(err), stdout, stderr, timedOut, durationMs }));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      const durationMs = Date.now() - start;
      resolve(JSON.stringify({ ok: code === 0 && !timedOut, code, stdout, stderr, timedOut, durationMs }));
    });
  });
}
