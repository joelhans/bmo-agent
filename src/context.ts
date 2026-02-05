import type { ChatMessage } from "./llm.ts";

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface ModelPricing {
	promptPer1M: number;
	completionPer1M: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
	// OpenAI
	"openai/gpt-4o": { promptPer1M: 2.5, completionPer1M: 10.0 },
	"openai/gpt-4o-mini": { promptPer1M: 0.15, completionPer1M: 0.6 },
	"openai/gpt-4.1": { promptPer1M: 2.0, completionPer1M: 8.0 },
	"openai/gpt-4.1-mini": { promptPer1M: 0.4, completionPer1M: 1.6 },
	"openai/gpt-4.1-nano": { promptPer1M: 0.1, completionPer1M: 0.4 },
	// Anthropic
	"anthropic/claude-opus-4-5-20250514": { promptPer1M: 15.0, completionPer1M: 75.0 },
	"anthropic/claude-sonnet-4-20250514": { promptPer1M: 3.0, completionPer1M: 15.0 },
	"anthropic/claude-haiku-3-5-20250620": { promptPer1M: 0.8, completionPer1M: 4.0 },
	// Google
	"google/gemini-2.5-pro": { promptPer1M: 1.25, completionPer1M: 10.0 },
	"google/gemini-2.5-flash": { promptPer1M: 0.15, completionPer1M: 0.6 },
};

// Conservative default: assume expensive (Opus-tier) so cost overestimates.
const DEFAULT_PRICING: ModelPricing = { promptPer1M: 15.0, completionPer1M: 75.0 };

/**
 * Resolve pricing for a model string.
 *
 * Resolution order:
 * 1. Exact match in config overrides
 * 2. Exact match in built-in MODEL_PRICING table
 * 3. If model has 2+ slashes (gateway format like "ngrok/openai/gpt-4o"),
 *    strip the first segment and retry steps 1-2
 * 4. Fall back to DEFAULT_PRICING
 */
export function resolvePricing(model: string, overrides?: Record<string, ModelPricing>): ModelPricing {
	// 1. Exact match in overrides
	if (overrides?.[model]) return overrides[model];

	// 2. Exact match in built-in table
	if (MODEL_PRICING[model]) return MODEL_PRICING[model];

	// 3. Strip gateway prefix if present (2+ slashes means gateway/provider/model)
	const firstSlash = model.indexOf("/");
	if (firstSlash !== -1) {
		const rest = model.slice(firstSlash + 1);
		if (rest.includes("/")) {
			if (overrides?.[rest]) return overrides[rest];
			if (MODEL_PRICING[rest]) return MODEL_PRICING[rest];
		}
	}

	// 4. Default
	return DEFAULT_PRICING;
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimate tokens for a single message.
 * Heuristic: ceil(chars / 3.5) + 4 per-message overhead.
 * Intentionally overestimates — safer to truncate early than hit API limits.
 */
export function estimateTokens(message: ChatMessage): number {
	let chars = (message.content ?? "").length;
	if (message.tool_calls) {
		chars += JSON.stringify(message.tool_calls).length;
	}
	if (message.tool_call_id) {
		chars += message.tool_call_id.length;
	}
	return Math.ceil(chars / 3.5) + 4;
}

/**
 * Estimate total tokens for an array of messages.
 * Adds 3 tokens of conversation-level framing overhead.
 */
export function estimateTokensForMessages(messages: ChatMessage[]): number {
	let total = 3;
	for (const msg of messages) {
		total += estimateTokens(msg);
	}
	return total;
}

// ---------------------------------------------------------------------------
// Context truncation
// ---------------------------------------------------------------------------

/**
 * Truncate messages to fit within the token budget.
 *
 * Preserves messages[0] (system prompt). Drops oldest non-system messages
 * first, removing user+assistant pairs together when possible.
 * Mutates the array in place. Returns the number of messages dropped.
 */
export function truncateToFit(messages: ChatMessage[], maxTokens: number, responseHeadroom: number): number {
	const budget = maxTokens - responseHeadroom;
	let dropped = 0;

	while (messages.length > 1 && estimateTokensForMessages(messages) > budget) {
		const msg = messages[1];

		// Drop orphan tool result messages
		if (msg.role === "tool") {
			messages.splice(1, 1);
			dropped++;
			continue;
		}

		// Drop assistant messages with tool_calls as a group
		// (assistant + all following tool result messages)
		if (msg.role === "assistant" && msg.tool_calls) {
			messages.splice(1, 1);
			dropped++;
			while (messages.length > 1 && messages[1].role === "tool") {
				messages.splice(1, 1);
				dropped++;
			}
			continue;
		}

		// Standard drop: remove message at index 1
		messages.splice(1, 1);
		dropped++;

		// If the next non-system message is an assistant reply, drop it too
		if (messages.length > 1 && messages[1].role === "assistant" && !messages[1].tool_calls) {
			messages.splice(1, 1);
			dropped++;
		}
	}

	return dropped;
}

// ---------------------------------------------------------------------------
// Token display helper
// ---------------------------------------------------------------------------

export function formatTokenCount(tokens: number): string {
	if (tokens >= 1_000_000) {
		return `${(tokens / 1_000_000).toFixed(1)}M`;
	}
	if (tokens >= 1_000) {
		return `${(tokens / 1_000).toFixed(1)}k`;
	}
	return `${tokens}`;
}

// ---------------------------------------------------------------------------
// Session tracker
// ---------------------------------------------------------------------------

export interface SessionStats {
	totalPromptTokens: number;
	totalCompletionTokens: number;
	totalCost: number;
	lastPromptTokens: number;
	lastCompletionTokens: number;
}

export interface SessionTracker {
	recordUsage(model: string, promptTokens: number, completionTokens: number): void;
	getStats(): SessionStats;
	isOverBudget(sessionLimit: number | null): boolean;
	formatStatus(sessionId: string, model: string, sessionLimit: number | null): string;
}

export interface InitialUsage {
	totalPromptTokens: number;
	totalCompletionTokens: number;
	totalCost: number;
}

export function createSessionTracker(
	initial?: InitialUsage,
	pricingOverrides?: Record<string, ModelPricing>,
): SessionTracker {
	let totalPromptTokens = initial?.totalPromptTokens ?? 0;
	let totalCompletionTokens = initial?.totalCompletionTokens ?? 0;
	let totalCost = initial?.totalCost ?? 0;
	let lastPromptTokens = 0;
	let lastCompletionTokens = 0;

	return {
		recordUsage(model: string, promptTokens: number, completionTokens: number): void {
			lastPromptTokens = promptTokens;
			lastCompletionTokens = completionTokens;
			totalPromptTokens += promptTokens;
			totalCompletionTokens += completionTokens;

			const pricing = resolvePricing(model, pricingOverrides);
			totalCost +=
				(promptTokens / 1_000_000) * pricing.promptPer1M + (completionTokens / 1_000_000) * pricing.completionPer1M;
		},

		getStats(): SessionStats {
			return {
				totalPromptTokens,
				totalCompletionTokens,
				totalCost,
				lastPromptTokens,
				lastCompletionTokens,
			};
		},

		isOverBudget(sessionLimit: number | null): boolean {
			if (sessionLimit === null) return false;
			return totalCost >= sessionLimit;
		},

		formatStatus(sessionId: string, model: string, sessionLimit: number | null): string {
			const tokenStr = formatTokenCount(lastPromptTokens);
			const costStr = totalCost.toFixed(2);

			if (sessionLimit === null) {
				return `bmo v0.1.0 | session: ${sessionId} | ${model} | tokens: ${tokenStr} | $${costStr}`;
			}

			const limitStr = sessionLimit.toFixed(2);
			return `bmo v0.1.0 | session: ${sessionId} | ${model} | tokens: ${tokenStr} | $${costStr}/$${limitStr}`;
		},
	};
}
