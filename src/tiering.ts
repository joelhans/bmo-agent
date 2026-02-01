// ---------------------------------------------------------------------------
// Model tier selection
// ---------------------------------------------------------------------------

export type ModelTier = "coding" | "reasoning";

export interface TierContext {
	userMessage: string;
	lastResponseWasError: boolean;
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
];

/**
 * Select model tier based on user message content and error state.
 * Escalates to reasoning tier for complex tasks or after errors.
 */
export function selectTier(ctx: TierContext): ModelTier {
	if (ctx.lastResponseWasError) {
		return "reasoning";
	}

	const lower = ctx.userMessage.toLowerCase();
	for (const keyword of REASONING_KEYWORDS) {
		if (lower.includes(keyword)) {
			return "reasoning";
		}
	}

	return "coding";
}
