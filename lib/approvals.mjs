import * as fs from "fs";
import * as path from "path";

const SESSION_FILE = path.join(process.cwd(), ".bmo-session-approvals.json");

export function loadApprovals() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
    }
  } catch {}
  return { web: null, gitCommit: null, gitPush: null, destructive: null };
}

export function saveApprovals(a) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(a), "utf-8");
  } catch {}
}

export function clearApprovals() {
  try {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  } catch {}
}
