# BMO – Self‑improving coding agent

BMO is a local, self‑improving coding agent that can modify repositories using tool calls. It supports adding new tools on the fly and enforcing governance rules.

## Home repo vs. project repos

BMO separates its own self‑improvements from project work.

- Home repo: The BMO agent’s own repository. Marked by a `.bmo-home` file.
- Project repos: Any other repository you use BMO to work on.

Rules:
- Fundamental changes to BMO (behavior, tools, autonomy, policies) must happen only in the home repo.
- Project‑specific edits stay in that project’s repo.

## Configure the home repo

1) Mark this repo as the home repo (already present): `.bmo-home`
2) Persist the absolute path so BMO always knows where to apply self‑improvements:

```bash
bmo set-home /absolute/path/to/this/repo
```

This writes HOME_REPO_PATH into `~/.config/bmo/.env`.

## Approvals and autonomy

- One‑time per session approvals for external web requests, git commits, and git pushes
- Exception: When improving BMO itself inside the home repo, BMO acts autonomously (no approval prompts) while still following safety rules

## Guardrails in tools

- `write_repo_file` accepts an optional `purpose` parameter. When `purpose: "bmo-self-improvement"`, writes are allowed only in the home repo (must contain `.bmo-home`).
- `git_commit` accepts an optional `purpose` parameter. When `purpose: "bmo-self-improvement"`, commits are allowed only in the home repo.

## Development

- Validate tool schemas:

```bash
npm run validate:tools
```

- Build the CLI:

```bash
npm run build
```

- Install CLI locally:

```bash
npm run install-cli
```
