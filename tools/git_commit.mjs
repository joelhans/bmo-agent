import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as https from "https";
import * as http from "http";

export const definition = {
  type: "function",
  function: {
    name: "git_commit",
    description: "Stage files, create a commit with a message, and optionally push. Never uses a temporary commit message file and cleans up any leftover commit_message.txt. Also sets upstream on first push if needed.",
    parameters: {},
  }
};

export async function execute(args) {
  try {\n  const { message, add_all, files, push, remote, branch } = args;\n\n  // Clean up any stray commit_message.txt from previous operations\n  try {\n    if (fs.existsSync("commit_message.txt")) {\n      fs.unlinkSync("commit_message.txt");\n    }\n  } catch (_) { /* ignore */ }\n\n  // Stage files\n  if (add_all) {\n    cp.execFileSync("git", ["add", "-A"], { stdio: ["ignore", "pipe", "pipe"] });\n  } else if (Array.isArray(files) && files.length > 0) {\n    cp.execFileSync("git", ["add", ...files], { stdio: ["ignore", "pipe", "pipe"] });\n  }\n\n  // Commit\n  let commitOutput = "";\n  try {\n    commitOutput = cp.execFileSync("git", ["commit", "-m", message], { stdio: ["ignore", "pipe", "pipe"] }).toString();\n  } catch (e) {\n    const stderr = e && e.stderr ? e.stderr.toString() : (e && e.message) || "";\n    if (/nothing to commit|no changes added to commit/i.test(stderr)) {\n      return JSON.stringify({ success: true, result: { committed: false, reason: "Nothing to commit" } });\n    }\n    return JSON.stringify({ success: false, error: stderr || "Failed to commit" });\n  }\n\n  const commitSha = cp.execFileSync("git", ["rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();\n\n  let pushed = false;\n  let pushOutput = "";\n  if (push) {\n    const currentBranch = (branch && String(branch).trim())\n      ? branch\n      : cp.execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();\n    const remoteName = (remote && String(remote).trim()) ? remote : "origin";\n\n    let hasUpstream = true;\n    try {\n      cp.execFileSync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { stdio: ["ignore", "pipe", "pipe"] });\n    } catch (_) { hasUpstream = false; }\n\n    try {\n      if (!hasUpstream) {\n        pushOutput = cp.execFileSync("git", ["push", "--set-upstream", remoteName, currentBranch], { stdio: ["ignore", "pipe", "pipe"] }).toString();\n      } else if (remote || branch) {\n        pushOutput = cp.execFileSync("git", ["push", remoteName, currentBranch], { stdio: ["ignore", "pipe", "pipe"] }).toString();\n      } else {\n        pushOutput = cp.execFileSync("git", ["push"], { stdio: ["ignore", "pipe", "pipe"] }).toString();\n      }\n      pushed = true;\n    } catch (e) {\n      const perr = e && e.stderr ? e.stderr.toString() : (e && e.message) || "";\n      return JSON.stringify({ success: false, error: perr || "Failed to push" });\n    }\n  }\n\n  return JSON.stringify({ success: true, result: { committed: true, commitSha, commitOutput, pushed, pushOutput } });\n} catch (error) {\n  return JSON.stringify({ success: false, error: error.message });\n}
}
