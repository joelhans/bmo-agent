import { exec } from 'node:child_process'
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
        timeoutMs: { type: 'number', description: 'Optional timeout in milliseconds after which the process will be killed' },
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
  return formatDetails([
    cmd ? `cmd=${cmd}` : null,
    reason ? `reason=${reason}` : null,
    confirmDangerous ? `confirmDangerous=${!!confirmDangerous}` : null,
  ])
}

// Heuristic detector for destructive commands (initial focus: rm)
function detectDestructive(cmd) {
  const risks = []
  // Detect rm only when it appears to be the command at the start of a pipeline/statement segment
  // Examples detected: "rm ...", "sudo rm ...", "/bin/rm ...", "foo && rm ...", "foo | sudo rm ..."
  // Examples NOT detected: "echo rm", "printf 'rm -rf /'"
  const rmAtSegmentStart = /(^|\n|;|\|\||&&|\|)\s*(?:sudo\s+)?(?:(?:\.?\/)?(?:usr\/bin\/|bin\/|sbin\/)?)*rm(\s|$)/
  if (rmAtSegmentStart.test(cmd)) {
    const entry = { type: 'rm', severity: 'medium', message: 'rm command detected; may delete files' }
    // Escalate severity for recursive/force flags (any order -rf or -fr within same rm invocation)
    const rmRf = /(^|\n|;|\|\||&&|\|)\s*(?:sudo\s+)?(?:(?:\.?\/)?(?:usr\/bin\/|bin\/|sbin\/)?)*rm\s+[^\n]*(-[rf]{2}|-r[^\n]*-f|-f[^\n]*-r)/i
    if (rmRf.test(cmd)) {
      entry.severity = 'high'
      entry.message = 'rm -rf detected; forceful recursive delete'
    }
    // Potentially catastrophic targets
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

  return await new Promise((resolve) => {
    const child = exec(cmd, { cwd, timeout: timeoutMs ?? 0, env: { ...process.env, ...(env || {}) } })
    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (d) => (stdout += String(d)))
    child.stderr?.on('data', (d) => (stderr += String(d)))

    const finalize = (ok, extra = {}) => {
      const endedAt = new Date()
      const endTime = endedAt.toISOString()
      const durationMs = endedAt - startedAt
      resolve(
        JSON.stringify({
          ok,
          message: `[run_command] ${cmd}`,
          cmd,
          reason,
          stdout,
          stderr,
          ...extra,
          startTime,
          endTime,
          durationMs,
          cwd,
          detectedRisks,
          confirmDangerous: !!confirmDangerous,
        })
      )
    }

    child.on('close', (code, signal) => finalize(true, { code, signal }))
    child.on('error', (err) => finalize(false, { error: String(err) }))
  })
}
