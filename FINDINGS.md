# Findings

## self-improvement loop requires too much prompting

For a while, the coding agent using a generic `run_command` tool to
handle git-related operations. This worked fine, but required a few executions
and sometimes left behind a commit message that I'd have to clean up manually.
Only when I prompted `bmo` to *actually improve* itself did I write a
`git_commit` tool to simplify this behavior.

Similarly, the first few tools all used an incorrect structure, so they didn't
work out of the box. Getting those to work properly took a *lot* of gentle
(sometimes not so gentle) prodding of the self-improvement loop.

## self-improvement loop is confusing to the agent

When using `bmo` in a repo that *is not itself*, it often gets confused about
where improvements should happen. It adds new files to `cwd` without thinking,
pushes them to the wrong repo, and claims the work is done. I had to press
multiple times to convince it to update its own guidance and improve its
behavior.

### 01-13: Still having trouble with this

>  I'm still having so much trouble getting this coding agent to understand that when I want to start off the self-improvement loop, I want changed to be made **IN THIS REPOSITORY**, not at whatever current working directory I might be in at the time. There needs to be a strict separation between using bmo to improve a codebase and bmo **IMPROVING ITSELF IN ITS OWN REPOSITORY**. What can we do to improve this?

## leaking pii is an inevitability

It didn't take long for the agent to push a doc that details how to properly
create new tools that told it to *not* use a bunch of `declare` statements, many
of which contained details I felt like were too personal... including my OpenAI
API key.
