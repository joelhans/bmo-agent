# Working Memory
Generated: 2026-02-03T23:45:00Z

## Active Preferences
- User prefers direct implementation over explanations when the solution is clear and scoped
- User works primarily with TypeScript/React codebases
- User values efficiency — reduce shell calls and round-trips
- User uses ngrok.ai proxy for API access

## Common Pitfalls
- **Python-based file patching is error-prone**: Initial patches often introduce bugs (missing statements, misaligned braces). Always verify patched code structure and run tests.
- **Explaining instead of building**: When a solution is identified, implement it immediately rather than asking permission
- **Piecemeal exploration**: Repeated shell calls to explore config/provider settings wastes time. Use purpose-built introspection tools.
- **Missing learning event capture**: Sessions frequently lack learningEvents despite correction/preference opportunities. Proactively log events.
- **Empty reflections**: ~40% of sessions have empty/null reflections, reducing maintenance signal quality

## Recurring Patterns
- **Config/provider queries**: Frequent need to check which providers/models are configured and ready
- **Session analysis during maintenance**: Need to summarize reflections and learning events across recent sessions
- **Code exploration in unfamiliar repos**: Start narrow, exclude noise dirs, use search_code before reading files
- **External component dependencies**: When components come from packages not in repo, exploration slows significantly

## Key Insights
- The "build it now" principle works: tools created during tasks get immediate validation
- Telemetry targets: run_command success ≥95%, avg latency ≤300ms (currently 88% / 169ms)
- Maintenance artifacts (OPPORTUNITIES.md, EXPERIMENT.md) improve carryover — hypothesis still pending full validation
- Only 1 learning event captured across 10 sessions — need to improve capture rate to ≥60%
- Reflection coverage at 40% — need ≥90% for quality maintenance signal

## Tool & Skill Notes
- **run_command**: Workhorse tool, 88% success rate. Failures often from file-not-found or grep misses. Use search_code for content search instead.
- **search_code**: Smart defaults, exclude node_modules automatically. 80% success (low sample) — likely user query issues not tool bugs.
- **reload_tools**: Slow (~1144ms) but reliable. Call after any tool/skill creation.
- **list_files_filtered**: Good for structure overview, use before deep-diving into specific files.
- **codebase-exploration skill**: Covers narrow→wide search pattern, noise exclusion. Works well.
- **Missing tools**: config_introspect (one-call config status), session_digest (maintenance helper)
