// ---------------------------------------------------------------------------
// Model tier selection
// ---------------------------------------------------------------------------

export type ModelTier = "coding" | "reasoning";

export interface TierContext {
	userMessage: string;
	lastResponseWasError: boolean;
}

export interface IterationContext {
	iteration: number;
	lastToolCalls: Array<{ name: string; success: boolean }>;
	lastAssistantText: string;
	hadError: boolean;
}

// Keywords that indicate complex reasoning is needed
const REASONING_KEYWORDS = [
	"architect",
	"design",
	"refactor",
	"why does",
	"why is",
	"why are",
	"why did",
	"what's wrong",
	"explain why",
	"explain how",
	"how should i structure",
	"review",
	"maintenance",
	"introspect",
	"battery check",
	"self-improvement",
	"investigate",
	"think deeply",
	"debug",
	"analyze",
	"compare",
	"trade-off",
	"tradeoff",
];

// Keywords that indicate simple mechanical tasks → coding tier
const CODING_KEYWORDS = [
	"read ",
	"cat ",
	"list ",
	"ls ",
	"show ",
	"print ",
	"what is in",
	"what's in",
	"contents of",
	"run ",
	"execute ",
	"create a file",
	"write to",
	"make a",
	"add a line",
	"delete ",
	"remove ",
	"rename ",
	"move ",
	"copy ",
];

// Simple file operation tools that coding tier can handle
const SIMPLE_FILE_TOOLS = ["run_command", "safe_read", "search_code", "list_files_filtered", "smart_grep"];

// Words that suggest planning/reasoning vs mechanical execution
const PLANNING_INDICATORS = [
	"first",
	"then",
	"should",
	"need to",
	"let me",
	"i'll",
	"strategy",
	"approach",
	"plan",
	"consider",
	"analyze",
	"investigate",
];

/**
 * Select initial model tier based on user message content and error state.
 * This determines the tier for the first iteration of each user message.
 */
export function selectInitialTier(ctx: TierContext): ModelTier {
	// Always use reasoning after errors
	if (ctx.lastResponseWasError) {
		return "reasoning";
	}

	const lower = ctx.userMessage.toLowerCase();

	// Check for reasoning keywords first (takes priority)
	for (const keyword of REASONING_KEYWORDS) {
		if (lower.includes(keyword)) {
			return "reasoning";
		}
	}

	// Check for simple coding task keywords
	for (const keyword of CODING_KEYWORDS) {
		if (lower.includes(keyword)) {
			return "coding";
		}
	}

	// Short messages without reasoning keywords are likely simple tasks
	if (ctx.userMessage.length < 50) {
		return "coding";
	}

	// Default to reasoning for anything else (complex or ambiguous)
	return "reasoning";
}

/**
 * Select tier for subsequent iterations (iteration > 0) based on what just happened.
 * Enables fluid switching between reasoning (planning) and coding (execution).
 *
 * Note: iteration 0 should use defaultTier directly, not this function.
 */
export function selectIterationTier(ctx: IterationContext): ModelTier {
	// Always escalate to reasoning after errors
	if (ctx.hadError) {
		return "reasoning";
	}

	// For many tool calls, use reasoning (coordinating multiple actions)
	if (ctx.lastToolCalls.length > 4) {
		return "reasoning";
	}

	// Check if the last tool calls were all simple file operations
	const allSimpleFileOps = ctx.lastToolCalls.every((tc) => tc.success && SIMPLE_FILE_TOOLS.includes(tc.name));

	// Check if assistant text suggests planning/reasoning vs mechanical execution
	const lower = ctx.lastAssistantText.toLowerCase();
	const hasPlanning = PLANNING_INDICATORS.some((indicator) => lower.includes(indicator));

	// If we just did simple file ops and there's no planning language,
	// the coding tier can handle follow-up
	if (allSimpleFileOps && !hasPlanning && ctx.lastAssistantText.length < 500) {
		return "coding";
	}

	// Default to reasoning for safety — better to over-use reasoning than under-use it
	return "reasoning";
}
