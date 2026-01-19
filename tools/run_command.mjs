import { exec } from 'node:child_process'

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
        reason: { type: 'string', description: 'Why this command is being run (shown in the result for transparency)' }
      },
      required: ['cmd']
    }
  }
}

export async function execute(args) {
  const { cmd, timeoutMs, env, reason } = args
  const startedAt = new Date()
  const startTime = startedAt.toISOString()
  const cwd = process.cwd()

  return await new Promise((resolve) => {
    const child = exec(cmd, { cwd, timeout: timeoutMs ?? 0, env: { ...process.env, ...(env || {}) } })
    let stdout = ''
    let stderr = ''

    // Prepend a clear prelude so the UI shows intent + the exact command
    if (reason) {
      stderr += `[run_command] reason: ${reason}\n`
    }
    stderr += `[run_command] cmd: ${cmd}\n`
    stderr += `[run_command] cwd: ${cwd}\n`

    child.stdout?.on('data', (d) => (stdout += String(d)))
    child.stderr?.on('data', (d) => (stderr += String(d)))

    const finalize = (ok, extra = {}) => {
      const endedAt = new Date()
      const endTime = endedAt.toISOString()
      const durationMs = endedAt - startedAt
      resolve(
        JSON.stringify({
          ok,
          // Provide a succinct message that surfaces the command prominently
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
        })
      )
    }

    child.on('close', (code, signal) => finalize(true, { code, signal }))
    child.on('error', (err) => finalize(false, { error: String(err) }))
  })
}
