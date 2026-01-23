import { spawn } from 'node:child_process'
import * as path from 'node:path'
import { formatDetails } from './lib.mjs'

export const schema = {
  type: 'function',
  function: {
    name: 'run_command',
    description: 'Run a shell command in the current working directory and capture stdout, stderr, exit code, and timing. Accepts an optional reason for traceability.',
    parameters: {
      type: 'object',
      properties: {
        cmd: { type: 'string', description: 'The full shell command to execute' },
        timeoutMs: { type: 'number', description: 'Optional timeout in milliseconds after which the process will be killed (default 60000)' },
        env: { type: 'object', description: 'Optional environment variables to merge into process.env' },
        reason: { type: 'string', description: 'Why this command is being run (shown in the result for transparency)' },
        confirmDangerous: { type: 'boolean', description: 'Set true to run commands detected as potentially destructive (e.g., those using rm). Defaults to false.' }
      },
      required: ['cmd']
    }
  }
}

export function details(args) {
  const { cmd, reason, confirmDangerous } = args || {}
  const displayCmd = (cmd || '').slice(0, 200)
  return formatDetails([
    displayCmd ? `cmd=${JSON.stringify(displayCmd)}` : null,
    reason ? `reason=${reason}` : null,
    confirmDangerous ? `confirmDangerous=${!!confirmDangerous}` : null,
  ])
}

// Heuristic detector for destructive commands (initial focus: rm)
function detectDestructive(cmd) {
  const risks = []
  // Detect rm only when it appears to be the command at the start of a pipeline/statement segment
  const rmAtSegmentStart = /(^|\n|;|\|\||&&|\|)\s*(?:sudo\s+)?(?:(?:\.?\/)?(?:usr\/bin\/|bin\/|sbin\/)?)*rm(\s|$)/
  if (rmAtSegmentStart.test(cmd)) {
    const entry = { type: 'rm', severity: 'medium', message: 'rm command detected; may delete files' }
    const rmRf = /(^|\n|;|\|\||&&|\|)\s*(?:sudo\s+)?(?:(?:\.?\/)?(?:usr\/bin\/|bin\/|sbin\/)?)*rm\s+[^\n]*(-[rf]{2}|-r[^\n]*-f|-f[^\n]*-r)/i
    if (rmRf.test(cmd)) {
      entry.severity = 'high'
      entry.message = 'rm -rf detected; forceful recursive delete'
    }
    if (/\brm\b[^\n]*\s\/(\s|$)/.test(cmd)) {
      entry.severity = 'critical'
      entry.message = 'rm appears to target root (/) path'
    }
    risks.push(entry)
  }
  return risks
}

export async function execute(args) {
  const { cmd, timeoutMs, env, reason, confirmDangerous } = args
  if (!cmd || typeof cmd !== 'string') {
    return JSON.stringify({ ok: false, error: 'cmd is required and must be a string' })
  }

  const startedAt = new Date()
  const startTime = startedAt.toISOString()
  const cwd = process.cwd()

  // Preflight destructive detection
  const detectedRisks = detectDestructive(cmd)
  if (detectedRisks.length > 0 && !confirmDangerous) {
    const endedAt = new Date()
    const endTime = endedAt.toISOString()
    const durationMs = endedAt - startedAt
    return JSON.stringify({
      ok: false,
      message: '[run_command] Command blocked pending confirmation',
      cmd,
      reason,
      stdout: '',
      stderr: '',
      requiresConfirmation: true,
      detectedRisks,
      startTime,
      endTime,
      durationMs,
      cwd,
    })
  }

  const mergedEnv = {
    ...process.env,
    NO_COLOR: '1',
    CLICOLOR: '0',
    TERM: process.env.TERM || 'dumb',
    PAGER: 'cat',
    GIT_PAGER: 'cat',
    RIPGREP_CONFIG_PATH: '/dev/null',
    ...(env || {}),
  }

  const shellCmd = `set -Ee -o pipefail; ${cmd}`

  return await new Promise((resolve) => {
    const child = spawn('bash', ['-lc', shellCmd], {
      cwd,
      env: mergedEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timeout = setTimeout(() => {
      if (timeoutMs && timeoutMs > 0) {
        timedOut = true
        try { child.kill('SIGTERM') } catch (_) {}
        setTimeout(() => { try { child.kill('SIGKILL') } catch (_) {} }, 2500)
      }
    }, Math.max(1, Number(timeoutMs || 60000)))

    child.stdout.on('data', (d) => (stdout += String(d)))
    child.stderr.on('data', (d) => (stderr += String(d)))

    const finalize = (code, signal, error) => {
      clearTimeout(timeout)
      const endedAt = new Date()
      const endTime = endedAt.toISOString()
      const durationMs = endedAt - startedAt
      const ok = !timedOut && code === 0 && !error
      resolve(
        JSON.stringify({
          ok,
          message: `[run_command] ${cmd}`,
          cmd,
          reason,
          stdout,
          stderr,
          code,
          signal,
          timedOut,
          error: error ? String(error) : undefined,
          startTime,
          endTime,
          durationMs,
          cwd,
          detectedRisks,
          confirmDangerous: !!confirmDangerous,
        })
      )
    }

    child.on('error', (err) => finalize(undefined, undefined, err))
    child.on('close', (code, signal) => finalize(code, signal))
  })
}
