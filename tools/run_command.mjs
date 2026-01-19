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
    // Emit a concise, single-line prelude to the user's terminal and capture it
    const prelude = `[Tool Call: run_command] cmd=${cmd}${reason ? ` reason=${reason}` : ''}`
    try { process.stderr.write(prelude + "\n") } catch {}

    const child = exec(cmd, { cwd, timeout: timeoutMs ?? 0, env: { ...process.env, ...(env || {}) } })
    let stdout = ''
    let stderr = prelude + "\n" // include prelude in captured stderr as well

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
          preludeLine: prelude,
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
