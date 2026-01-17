import { spawnSync } from "child_process";

export const schema = {
  type: "function",
  function: {
    name: "git_commit",
    description: "Stage changes and create a git commit in the current working directory. Initializes a repo if requested.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Commit message",
        },
        add_all: {
          type: "boolean",
          description: "Stage all changes (git add -A) before committing",
          default: true,
        },
        paths: {
          type: "array",
          items: { type: "string" },
          description: "Specific paths to stage instead of -A (ignored if add_all is true)",
        },
        allow_empty: {
          type: "boolean",
          description: "Allow an empty commit when there are no staged changes",
          default: false,
        },
        signoff: {
          type: "boolean",
          description: "Add Signed-off-by line to commit",
          default: false,
        },
        init_if_needed: {
          type: "boolean",
          description: "Initialize a git repository in the current directory if none exists",
          default: true,
        },
      },
      required: ["message"],
    },
  },
};

function run(cmd, args = [], options = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", ...options });
  return {
    status: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    error: res.error ? String(res.error) : null,
  };
}

function isInsideGitRepo() {
  const res = run("git", ["rev-parse", "--is-inside-work-tree"]);
  return res.status === 0 && res.stdout.trim() === "true";
}

function getStatusPorcelain() {
  const res = run("git", ["status", "--porcelain"]);
  if (res.status !== 0) return { error: res.stderr || res.error || "git status failed" };
  return { output: res.stdout };
}

export async function execute(args) {
  const message = args.message || "chore: commit";
  const addAll = args.add_all !== undefined ? !!args.add_all : true;
  const paths = Array.isArray(args.paths) ? args.paths : [];
  const allowEmpty = args.allow_empty === true;
  const signoff = args.signoff === true;
  const initIfNeeded = args.init_if_needed !== false; // default true

  const steps = [];
  let initialized = false;

  if (!isInsideGitRepo()) {
    if (!initIfNeeded) {
      return JSON.stringify({ ok: false, initialized, step: steps, error: "Not a git repository" });
    }
    const initRes = run("git", ["init"]);
    steps.push({ step: "git init", status: initRes.status, stdout: initRes.stdout, stderr: initRes.stderr });
    if (initRes.status !== 0) {
      return JSON.stringify({ ok: false, initialized, steps, error: initRes.stderr || initRes.error || "git init failed" });
    }
    initialized = true;
  }

  if (addAll) {
    const addRes = run("git", ["add", "-A"]);
    steps.push({ step: "git add -A", status: addRes.status, stdout: addRes.stdout, stderr: addRes.stderr });
    if (addRes.status !== 0) {
      return JSON.stringify({ ok: false, initialized, steps, error: addRes.stderr || addRes.error || "git add failed" });
    }
  } else if (paths.length > 0) {
    const addRes = run("git", ["add", "--", ...paths]);
    steps.push({ step: `git add -- ${paths.join(" ")}` , status: addRes.status, stdout: addRes.stdout, stderr: addRes.stderr });
    if (addRes.status !== 0) {
      return JSON.stringify({ ok: false, initialized, steps, error: addRes.stderr || addRes.error || "git add failed" });
    }
  }

  // Check if there is anything to commit
  const porcelain = getStatusPorcelain();
  if (porcelain.error) {
    steps.push({ step: "git status --porcelain", error: porcelain.error });
    return JSON.stringify({ ok: false, initialized, steps, error: porcelain.error });
  }

  const hasChanges = porcelain.output.trim().length > 0;
  if (!hasChanges && !allowEmpty) {
    return JSON.stringify({ ok: true, initialized, steps, result: "skipped", reason: "nothing to commit" });
  }

  const commitArgs = ["commit", "-m", message];
  if (allowEmpty) commitArgs.push("--allow-empty");
  if (signoff) commitArgs.push("--signoff");

  const commitRes = run("git", commitArgs);
  steps.push({ step: `git ${commitArgs.join(" ")}`, status: commitRes.status, stdout: commitRes.stdout, stderr: commitRes.stderr });
  if (commitRes.status !== 0) {
    return JSON.stringify({ ok: false, initialized, steps, error: commitRes.stderr || commitRes.error || "git commit failed" });
  }

  return JSON.stringify({ ok: true, initialized, steps, result: "committed", output: commitRes.stdout });
}
