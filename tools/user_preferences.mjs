import * as fs from 'fs'
import * as path from 'path'
import { BMO_CONF, resolvePath, ensureDir, formatDetails } from './lib.mjs'

const PREFS_PATH = path.join(BMO_CONF, 'user_prefs.json')
const LEGACY_PATH = resolvePath('bmo://user_prefs.json') // previously under BMO_HOME

const DEFAULTS = {
  confirm_destructive_actions: true,
}

function initializeIfMissing() {
  try {
    if (fs.existsSync(PREFS_PATH)) return

    // Try migrating from legacy location if present
    if (fs.existsSync(LEGACY_PATH)) {
      try {
        ensureDir(path.dirname(PREFS_PATH))
        const raw = fs.readFileSync(LEGACY_PATH, 'utf8')
        fs.writeFileSync(PREFS_PATH, raw)
        try { fs.chmodSync(PREFS_PATH, 0o600) } catch (_) {}
        return
      } catch (_) {}
    }

    // Create with defaults
    ensureDir(path.dirname(PREFS_PATH))
    fs.writeFileSync(PREFS_PATH, JSON.stringify(DEFAULTS, null, 2))
    try { fs.chmodSync(PREFS_PATH, 0o600) } catch (_) {}
  } catch (_) {
    // best-effort init
  }
}

function readPrefs() {
  try {
    initializeIfMissing()
    if (!fs.existsSync(PREFS_PATH)) return { ...DEFAULTS }
    const raw = fs.readFileSync(PREFS_PATH, 'utf8')
    try {
      const parsed = JSON.parse(raw || '{}') || {}
      return { ...DEFAULTS, ...parsed }
    } catch (_) {
      return { ...DEFAULTS }
    }
  } catch (_) {
    return { ...DEFAULTS }
  }
}

function writePrefs(prefs) {
  try {
    ensureDir(path.dirname(PREFS_PATH))
    fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2))
    try { fs.chmodSync(PREFS_PATH, 0o600) } catch (_) {}
    return true
  } catch (e) {
    return false
  }
}

export const schema = {
  type: 'function',
  function: {
    name: 'user_preferences',
    description: 'Get or set persistent user preferences (stored under BMO_CONF, default: ~/.local/share/bmo/user_prefs.json).',
    parameters: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['get','set','all'], description: 'Operation to perform: get a value, set a value, or return all preferences.' },
        key: { type: 'string', description: 'Preference key (required for get/set).'},
        value: { description: 'Value to set (required for set). Can be any JSON-serializable type.'},
        defaultValue: { description: 'Default value if key is missing (get op only).'},
        reason: { type: 'string', description: 'Why this preference is being accessed.'}
      },
      required: ['op']
    }
  }
}

export function details(args) {
  const { op, key, reason } = args || {}
  return formatDetails([
    op ? `op=${op}` : null,
    key ? `key=${key}` : null,
    reason ? `reason=${reason}` : null,
  ])
}

export async function execute(args) {
  try {
    const { op, key, value, defaultValue } = args
    if (op === 'all') {
      const prefs = readPrefs()
      return JSON.stringify({ ok: true, op, prefs, path: PREFS_PATH })
    }
    if (op === 'get') {
      if (!key) return JSON.stringify({ ok: false, error: 'key is required for get' })
      const prefs = readPrefs()
      const exists = Object.prototype.hasOwnProperty.call(prefs, key)
      return JSON.stringify({ ok: true, op, key, exists, value: exists ? prefs[key] : defaultValue, path: PREFS_PATH })
    }
    if (op === 'set') {
      if (!key) return JSON.stringify({ ok: false, error: 'key is required for set' })
      const prefs = readPrefs()
      const previous = Object.prototype.hasOwnProperty.call(prefs, key) ? prefs[key] : undefined
      prefs[key] = value
      const saved = writePrefs(prefs)
      if (!saved) return JSON.stringify({ ok: false, error: 'failed to persist preferences', path: PREFS_PATH })
      return JSON.stringify({ ok: true, op, key, previous, value, path: PREFS_PATH })
    }
    return JSON.stringify({ ok: false, error: `unsupported op: ${op}` })
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e) })
  }
}
