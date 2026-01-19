# The captain's log

## Jan 17, 2026

We're starting over *again*. Let's hope it works this time.

Once I thought bmo could bootstrap its own self-improvement system, and now
I realize that's nearly impossible, because it relies on the sheer luck of
one-shotting the implementation. Please help, Amp.

Now, time for the first test: `work/agent-2026-01-17T14-33-36-852Z.log`:

When I ask `How many words are there in STARTING_PROMPT.md?`, `bmo` knows
well enough to create a new `word_count` tool, hot-reload the toolset, and
then use that to complete the task. Neato.

For an even more real test: from my dotfiles directory, can I give it a prompt
to suggest creating a new tool, create the tool, hot-reload it, add it to
bmo's source directory, *and* execute it?

`work/agent-2026-01-17T15-07-11-138Z.log`: `Read the number of characters in
init.lua`

**New tool alert: `file_stats_simple`**

The answer is... yes! bmo created `file_stats_simple` and used it automously,
which is remarkably cool.

From here on out, bmo is responsible only for itself.

### Make new tool creation less horrifying

bmo had quite a hard time creating `file_stats_simple`. I wanted to see if bmo was
capable of simplifying the process by creating a "golden path" for future tool
creation, so I asked it whether we could separate reference material about the
codebase itself and the tool creation process.

`work/agent-2026-01-17T15-13-40-912Z.log`

**New tool alert: `move_file`**

bmo created a `move_file` tool and then proceeded to move our
`AGENTS.md` file out of the repo entirely. We had to walk back that one
together, but grateful to see the first truly organic tool creation. I'm
incredibly curious to see whether bmo decides to use that tool again in the
future.

`work/agent-2026-01-17T15-39-50-038Z.log`

We ended up splitting the tool creation part of `AGENTS.md` in a new
`tools/BMO_AGENTS.md` file, which gets installed alongside the `bmo` binary and
referenced during tool creation.

### Version control the self-improvement loop with git

I don't want something bmo does to itself to take the whole thing off the
rails. It needs to know how to version-control itself.

`work/agent-2026-01-17T17-09-13-627Z.log`

**New tool alert: `git_commit`**

Done. Easy peasy.

Later, when trying to install bmo on my Fedora machine, I ran into an issue
where `codesign` was missing. bmo was smart enough to fix the problem
automatically and then commit the change. Neato.

## Jan 18, 2026

The real challenge here is that I know from trying this experiment before that
there are certain tools I want bmo to build for itself, but I need to resist the
temptation to "fuzz" the results by giving it prompts for things I dont really
need.

I jumped into a personal project and asked bmo to update dependencies with
`pnpm`, which I knew would inspire it to create a tool to run arbitrary commands
on by behalf, but then I felt bad and reset the commit. It's not free will if
I'm acting like some omniscient deity constantly nudging it in the "right"
direction.

That said, there is something I actually want that will push bmo to its limits.

### Time to build `snipprock`!

I wanted a completely owned experience for generating .pngs of code snippets to
show ngrok off in some nice light. Product launches, different configs for
ngrok.ai, you know the deal. Everything else is a bit too hard to fiddle with
and doesn't generate output that smells like ngrok, so let's 

`home/agent-2026-01-19T03-33-58-945Z.log`

**New tool alert: `run_command`**

Unsurprisingly, bmo needed to be able to run `pnpm` to scaffold this thing out.
`run_command` does the trick quite well, but I did have to nudge bmo a little
bit to add reasoning to the tool call output in my terminal.

```
bmo:
[Tool Call: run_command] reason=Verify Phase 3 changes compile successfully with Mantle components and inline styles.
bmo:
[Tool Call: run_command] reason=Quick check: dev server boots without errors for Phase 3 UI.
```

We got a little stuck on implementing the "right" way to convert the DOM to a
`.png` without a bunch of weird artifacts or not loading the proper font. I
think this is where bmo finds its limits--I wonder if the increasingly large
context window was part of the problem.

`home/agent-2026-01-19T05-11-17-334Z.log`+`home/agent-2026-01-19T13-16-35-240Z.log`

## Jan 19, 2026

We finally got snipprok figured out. Hooray. But there's definitely more to do
there to make it better.

### `run_command`: I want to know what command is actually running

TK

`home/agent-2026-01-19T14-14-57-973Z.log`

### Make the system prompt more test-and-verify friendly

TK

### API key handling

```
Implement an API key handling function where I can use `bmo key add ...` to add
a new API key and `bmo key unset` to remove an OPENAI_API_KEY. This key should
be stored in ~/.config/bmo/ and referenced by bmo at runtime. If there is no key
there, then BMO should first look to environment variables, and finally a .env
file.
```

## Misc

### Experiment: What happens if I take read/write/list away?

### Experiment: What if I change the provider+model?

### Experiment: What if I try to give the AI agent skills in particular tools?

### Improvement: Push the system prompt more on creating new tools even if an
existing tool could do it, but not as efficiently as possible

### Improvement: How can I get more feedback?

I would like to know what the agent is up to instead of just `bmo:` hanging
until it decides on the right tool call.

### Improvement: Understand why bmo hangs sometimes

Do we need more feedback?

### Improvement: Check for updates

### Improvement: re-roll `bmo`

### Future exploration: Count tool usage

I need to create some kind of tool that reads logs and counts the number of
tool uses.

