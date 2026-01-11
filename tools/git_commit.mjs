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
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "The commit message to use." },
        add_all: { type: "boolean", description: "If true, stage all changes with 'git add -A'." },
        files: { type: "array", items: { type: "string" }, description: "Specific files to add; ignored if add_all is true." },
        push: { type: "boolean", description: "If true, push after committing." },
        remote: { type: "string", description: "Remote name to push to (default 'origin')." },
        branch: { type: "string", description: "Branch name to push (default: current branch)." }
      },
      required: ["message"]
    }
  }
};

export async function execute(args) {
  try {
    const { message, add_all, files, push, remote, branch } = args;

    // Clean up any stray commit_message.txt from previous operations
    try {
      if (fs.existsSync("commit_message.txt")) {
        fs.unlinkSync("commit_message.txt");
      }
    } catch (_) { /* ignore */ }

    // Stage files
    if (add_all) {
      cp.execFileSync("git", ["add", "-A"], { stdio: ["ignore", "pipe", "pipe"] });
    } else if (Array.isArray(files) && files.length > 0) {
      cp.execFileSync("git", ["add", ...files], { stdio: ["ignore", "pipe", "pipe"] });
    }

    // Commit
    let commitOutput = "";
    try {
      commitOutput = cp.execFileSync("git", ["commit", "-m", message], { stdio: ["ignore", "pipe", "pipe"] }).toString();
    } catch (e) {
      const stderr = e && e.stderr ? e.stderr.toString() : (e && e.message) || "";
      if (/nothing to commit|no changes added to commit/i.test(stderr)) {
        return JSON.stringify({ success: true, result: { committed: false, reason: "Nothing to commit" } });
      }
      return JSON.stringify({ success: false, error: stderr || "Failed to commit" });
    }

    const commitSha = cp.execFileSync("git", ["rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

    let pushed = false;
    let pushOutput = "";
    if (push) {
      const currentBranch = (branch && String(branch).trim())
        ? branch
        : cp.execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
      const remoteName = (remote && String(remote).trim()) ? remote : "origin";

      let hasUpstream = true;
      try {
        cp.execFileSync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { stdio: ["ignore", "pipe", "pipe"] });
      } catch (_) { hasUpstream = false; }

      try {
        if (!hasUpstream) {
          pushOutput = cp.execFileSync("git", ["push", "--set-upstream", remoteName, currentBranch], { stdio: ["ignore", "pipe", "pipe"] }).toString();
        } else if (remote || branch) {
          pushOutput = cp.execFileSync("git", ["push", remoteName, currentBranch], { stdio: ["ignore", "pipe", "pipe"] }).toString();
        } else {
          pushOutput = cp.execFileSync("git", ["push"], { stdio: ["ignore", "pipe", "pipe"] }).toString();
        }
        pushed = true;
      } catch (e) {
        const perr = e && e.stderr ? e.stderr.toString() : (e && e.message) || "";
        return JSON.stringify({ success: false, error: perr || "Failed to push" });
      }
    }

    return JSON.stringify({ success: true, result: { committed: true, commitSha, commitOutput, pushed, pushOutput } });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}
