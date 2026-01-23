import fs from "fs";
import path from "path";
import { resolvePath } from "./lib.mjs";

export const schema = {
  type: "function",
  function: {
    name: "scan_sensitive",
    description: "Scan files and directories for potentially sensitive information (API keys, secrets, private keys, emails). Returns masked findings and a summary.",
    parameters: {
      type: "object",
      properties: {
        paths: {
          type: "array",
          description: "List of file or directory paths to scan (relative, absolute, or bmo://)",
          items: { type: "string" },
        },
        includeExtensions: {
          type: "array",
          description: "Optional whitelist of file extensions to scan (e.g., ['.log', '.txt']). If omitted, scan all files.",
          items: { type: "string" },
        },
        maxFindingsPerFile: {
          type: "integer",
          description: "Limit number of findings per file to avoid overwhelming output.",
          default: 100,
        },
      },
      required: ["paths"],
    },
  },
};

const PATTERNS = [
  { name: "OpenAI key sk-", regex: /sk-[A-Za-z0-9]{20,}/g },
  { name: "GitHub token ghp_", regex: /ghp_[A-Za-z0-9]{30,}/g },
  { name: "GitHub fine-grained token", regex: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: "Slack token xox", regex: /xox[abpr]-[A-Za-z0-9-]{10,}/g },
  { name: "AWS Access Key ID", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "Google API key AIza", regex: /AIza[0-9A-Za-z\-_]{35}/g },
  { name: "Stripe secret key", regex: /sk_live_[0-9A-Za-z]{16,}/g },
  { name: "Bearer token", regex: /Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/g },
  { name: "Private key header", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: "Env var style OPENAI_API_KEY", regex: /OPENAI_API_KEY\s*[=:]\s*[^\s"']{8,}/g },
  { name: "Generic email", regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
];

function isTextLikely(buf) {
  // Simple heuristic: no NUL bytes
  return !buf.includes(0);
}

function maskValue(val) {
  const s = String(val);
  if (s.length <= 8) return "***";
  return s.slice(0, 4) + "…" + s.slice(-4);
}

function collectFilesFrom(p, includeExtensions) {
  const results = [];
  const stat = fs.statSync(p);
  const allow = (file) => {
    if (!includeExtensions || includeExtensions.length === 0) return true;
    const ext = path.extname(file).toLowerCase();
    return includeExtensions.includes(ext);
  };
  if (stat.isFile()) {
    if (allow(p)) results.push(p);
  } else if (stat.isDirectory()) {
    const stack = [p];
    while (stack.length) {
      const cur = stack.pop();
      const entries = fs.readdirSync(cur, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(cur, e.name);
        if (e.isDirectory()) {
          stack.push(full);
        } else if (e.isFile()) {
          if (allow(full)) results.push(full);
        }
      }
    }
  }
  return results;
}

export async function execute(args) {
  try {
    const { paths, includeExtensions = [], maxFindingsPerFile = 100 } = args;
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return JSON.stringify({ ok: false, error: "paths[] is required" });
    }

    const resolved = [];
    for (const p of paths) {
      try {
        const r = resolvePath(p);
        if (fs.existsSync(r)) resolved.push(r);
      } catch {}
    }

    const toScan = [];
    for (const p of resolved) {
      try {
        toScan.push(...collectFilesFrom(p, includeExtensions));
      } catch {}
    }

    const findings = [];
    let filesScanned = 0;

    for (const file of toScan) {
      try {
        const buf = fs.readFileSync(file);
        if (!isTextLikely(buf)) continue;
        const content = buf.toString("utf8");
        filesScanned++;
        const lines = content.split(/\r?\n/);
        let countForFile = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (const { name, regex } of PATTERNS) {
            regex.lastIndex = 0;
            let m;
            while ((m = regex.exec(line)) !== null) {
              const raw = m[0];
              findings.push({
                file,
                line: i + 1,
                type: name,
                valueMasked: maskValue(raw),
                preview: line.trim().slice(0, 200),
              });
              countForFile++;
              if (countForFile >= maxFindingsPerFile) break;
            }
            if (countForFile >= maxFindingsPerFile) break;
          }
          if (countForFile >= maxFindingsPerFile) break;
        }
      } catch {}
    }

    const summary = {};
    for (const f of findings) summary[f.type] = (summary[f.type] || 0) + 1;

    return JSON.stringify({ ok: true, filesScanned, findingsCount: findings.length, summary, findings });
  } catch (err) {
    return JSON.stringify({ ok: false, error: String(err && err.message || err) });
  }
}

export function details(args) {
  const p = (args && args.paths) ? args.paths.join(",") : "";
  const exts = (args && args.includeExtensions && args.includeExtensions.length) ? args.includeExtensions.join(",") : "all";
  return `scan paths=${p} ext=${exts}`;
}
