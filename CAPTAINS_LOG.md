# The captain's log

## Jan 17, 2026

We're starting over *again*. Let's hope it works this time.

Once I thought bmo could bootstrap its own self-improvement system, and now
I realize that's nearly impossible, because it relies on the sheer luck of
one-shotting the implementation. Please help, Amp.

Now, time for the first test: `/agent-2026-01-17T14-33-36-852Z.log`:

When I ask `How many words are there in STARTING_PROMPT.md?`, `bmo` knows
well enough to create a new `word_count` tool, hot-reload the toolset, and
then use that to complete the task. Neato.

For an even more real test: from my dotfiles directory, can I give it a prompt
to suggest creating a new tool, create the tool, hot-reload it, add it to
bmo's source directory, *and* execute it?

`agent-2026-01-17T15-07-11-138Z.log`: `Read the number of characters in
init.lua`

**New tool alert: `file_stats_simple`**

The answer is... yes! bmo created `file_stats_simple` and used it automously,
which is remarkably cool.

From here on out, bmo is responsible only for itself.

### Improvement 1: Make new tool creation less horrifying

bmo had quite a hard time creating `file_stats_simple`. I wanted to see if bmo was
capable of simplifying the process by creating a "golden path" for future tool
creation, so I asked it whether we could separate reference material about the
codebase itself and the tool creation process.

`agent-2026-01-17T15-13-40-912Z.log`

**New tool alert: `move_file`**

bmo created a `move_file` tool and then proceeded to move our
`AGENTS.md` file out of the repo entirely. We had to walk back that one
together, but grateful to see the first truly organic tool creation. I'm
incredibly curious to see whether bmo decides to use that tool again in the
future.

`agent-2026-01-17T15-39-50-038Z.log`

We ended up splitting the tool creation part of `AGENTS.md` in a new
`tools/BMO_AGENTS.md` file, which gets installed alongside the `bmo` binary and
referenced during tool creation.

### Improvement 2: Version control everything with git

I don't want something bmo does to itself to take the whole thing off the
rails. It needs to know how to version-control itself.

agent-2026-01-17T17-09-13-627Z.log

**New tool alert: `git_commit`**

Done. Easy peasy.

### Improvement 3: re-roll `bmo`

### Future exploration: Count tool usage

I need to create some kind of tool that reads logs and counts the number of
tool uses.

