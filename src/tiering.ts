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
	lastToolCalls?: Array<{ name: string; success: boolean }>;
	lastAssistantText?: string;
	hadError: boolean;
}

const REASONING_KEYWORDS = [
	"architect",
	"design",
	"debug",
	"refactor",
	"why does",
	"what's wrong",
	"explain why",
	"how should i structure",
	"review",
	"maintenance",
	"introspect",
	"battery check",
	"self-improvement",
	"investigate",
	"think deeply",
];

// Simple file operation tools that coding tier can handle
const SIMPLE_FILE_TOOLS = ["run_command"];

// Words that suggest planning/reasoning vs mechanical execution
const PLANNING_INDICATORS = [
	"first",
	"next",
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
 * This determines the tier for the first iteration.
 */
export function selectInitialTier(ctx: TierContext): ModelTier {
	if (ctx.lastResponseWasError) {
		return "reasoning";
	}

	const lower = ctx.userMessage.toLowerCase();
	for (const keyword of REASONING_KEYWORDS) {
		if (lower.includes(keyword)) {
			return "reasoning";
		}
	}

	// Default to reasoning tier for initial planning
	return "reasoning";
}

/**
 * Select tier for a specific iteration based on what just happened.
 * Enables fluid switching between reasoning (planning) and coding (execution).
 */
export function selectIterationTier(ctx: IterationContext): ModelTier {
	// First iteration always uses reasoning for initial planning
	if (ctx.iteration === 0) {
		return "reasoning";
	}

	// Always escalate to reasoning after errors
	if (ctx.hadError) {
		return "reasoning";
	}

	// If we don't have context about what just happened, stay on reasoning (safe default)
	if (!ctx.lastToolCalls || !ctx.lastAssistantText) {
		return "reasoning";
	}

	// Check if the last tool calls were all simple file operations
	const allSimpleFileOps = ctx.lastToolCalls.every(
		(tc) => tc.success && SIMPLE_FILE_TOOLS.includes(tc.name),
	);

	// Check if assistant text suggests planning/reasoning vs mechanical execution
	const lower = ctx.lastAssistantText.toLowerCase();
	const hasPlanning = PLANNING_INDICATORS.some((indicator) => lower.includes(indicator));

	// If we just did simple file ops and there's no planning language,
	// the coding tier can handle follow-up
	if (allSimpleFileOps && !hasPlanning && ctx.lastAssistantText.length < 300) {
		return "coding";
	}

	// For multi-tool calls or complex operations, use reasoning
	if (ctx.lastToolCalls.length > 2) {
		return "reasoning";
	}

	// Default to reasoning for safety — better to over-use reasoning than under-use it
	return "reasoning";
}
