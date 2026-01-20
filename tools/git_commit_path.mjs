import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { resolvePath, formatDetails, BMO_SOURCE } from './lib.mjs'

export const schema = {
  type: 'function',
  function: {
    name: 'git_commit_path',
    description: 'Stage and commit changes in a specific repository path (used for bmo self-improvements).',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Path to the Git repository. Defaults to BMO_SOURCE if omitted.' },
        message: { type: 'string', description: 'Commit message.' },
        add_all: { type: 'boolean', description: 'Use git add -A (default true).'},
        allow_empty: { type: 'boolean', description: 'Allow empty commit (default false).'},
      },
      required: ['message']
    }
  }
}

export function details(args) {
  const { repoPath, message } = args || {}
  return formatDetails([
    repoPath ? `path=${repoPath}` : null,
    message ? `msg=${JSON.stringify(message).slice(0,60)}` : null,
  ])
}

export async function execute(args) {
  try {
    const repoPath = args.repoPath ? path.resolve(args.repoPath) : (BMO_SOURCE || null)
    if (!repoPath) {
      return JSON.stringify({ ok: false, error: 'repoPath is required (no BMO_SOURCE set)' })
    }
    if (!fs.existsSync(repoPath)) {
      return JSON.stringify({ ok: false, error: `repoPath does not exist: ${repoPath}` })
    }
    const addAll = args.add_all !== false
    const allowEmpty = args.allow_empty === true

    const run = (cmd) => execSync(cmd, { stdio: 'pipe', cwd: repoPath }).toString()

    // Initialize if needed
    try {
      run('git rev-parse --is-inside-work-tree')
    } catch (_) {
      run('git init')
    }

    if (addAll) run('git add -A')
    const msgArg = args.message.replace(/'/g, "'\\''")
    const allowEmptyFlag = allowEmpty ? ' --allow-empty' : ''
    let output = ''
    try {
      output = run(`git commit -m '${msgArg}'${allowEmptyFlag}`)
    } catch (e) {
      if (!allowEmpty) {
        return JSON.stringify({ ok: false, error: 'no changes to commit', repoPath })
      }
      // try empty commit
      output = run(`git commit -m '${msgArg}' --allow-empty`)
    }

    return JSON.stringify({ ok: true, repoPath, output })
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e) })
  }
}
