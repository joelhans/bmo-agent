import * as fs from "fs";
import * as path from "path";

const BMO_HOME = process.env.BMO_HOME || path.join(process.env.HOME, "src", "bmo-agent");
const STATE_FILE = path.join(BMO_HOME, ".bmo-state.json");

export function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    // Ignore errors, return null
  }
  return null;
}

export function clearState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
  } catch (err) {
    // Ignore errors
  }
}

export function hasState() {
  return fs.existsSync(STATE_FILE);
}
