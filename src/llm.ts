import OpenAI from "openai";
import type { BmoConfig } from "./config.ts";
import type { ToolSchema } from "./tools.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolCallInfo = {
	id: string;
	function: { name: string; arguments: string };
};

export type ChatMessage = {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	tool_calls?: ToolCallInfo[];
	tool_call_id?: string;
};

export type LlmEvent =
	| { type: "text"; text: string }
	| { type: "tool_call_start"; index: number; id: string; name: string }
	| { type: "tool_call_args"; index: number; args: string }
	| { type: "usage"; promptTokens: number; completionTokens: number }
	| { type: "done"; finishReason: string };

export interface LlmClient {
	stream(messages: ChatMessage[], model: string, tools?: ToolSchema[]): AsyncGenerator<LlmEvent>;
}

// ---------------------------------------------------------------------------
// Provider routing
// ---------------------------------------------------------------------------

function parseModel(model: string): { providerName: string; modelName: string } {
	const slashIndex = model.indexOf("/");
	if (slashIndex === -1) {
		throw new Error(`Invalid model format: "${model}". Expected "provider/model-name".`);
	}
	return {
		providerName: model.slice(0, slashIndex),
		modelName: model.slice(slashIndex + 1),
	};
}

// ---------------------------------------------------------------------------
// Message mapping
// ---------------------------------------------------------------------------

function mapMessages(messages: ChatMessage[]): Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
	return messages.map((m) => {
		if (m.role === "tool") {
			return {
				role: "tool" as const,
				content: m.content ?? "",
				tool_call_id: m.tool_call_id ?? "",
			};
		}
		if (m.role === "assistant" && m.tool_calls) {
			return {
				role: "assistant" as const,
				content: m.content ?? null,
				tool_calls: m.tool_calls.map((tc) => ({
					id: tc.id,
					type: "function" as const,
					function: { name: tc.function.name, arguments: tc.function.arguments },
				})),
			};
		}
		return { role: m.role, content: m.content ?? "" };
	});
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

export function createLlmClient(config: BmoConfig): LlmClient {
	const clients = new Map<string, OpenAI>();

	function getClient(providerName: string): OpenAI {
		const cached = clients.get(providerName);
		if (cached) return cached;

		const provider = config.providers[providerName];
		if (!provider) {
			const available = Object.keys(config.providers).join(", ");
			throw new Error(`Unknown provider: "${providerName}". Available: ${available}`);
		}

		const apiKey = process.env[provider.apiKeyEnv];
		if (!apiKey) {
			throw new Error(
				`API key not found. Set ${provider.apiKeyEnv} in your environment.\n` +
					`  export ${provider.apiKeyEnv}=your-key-here`,
			);
		}

		const client = new OpenAI({ apiKey, baseURL: provider.baseUrl });
		clients.set(providerName, client);
		return client;
	}

	return {
		async *stream(messages: ChatMessage[], model: string, tools?: ToolSchema[]): AsyncGenerator<LlmEvent> {
			const { providerName, modelName } = parseModel(model);
			const client = getClient(providerName);

			const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
				model: modelName,
				messages: mapMessages(messages),
				stream: true,
				stream_options: { include_usage: true },
			};

			if (tools && tools.length > 0) {
				params.tools = tools.map((t) => ({
					type: "function" as const,
					function: { name: t.function.name, description: t.function.description, parameters: t.function.parameters },
				}));
			}

			let response: Awaited<ReturnType<typeof client.chat.completions.create>>;
			try {
				response = await client.chat.completions.create(params);
			} catch (err: unknown) {
				if (err instanceof OpenAI.APIError) {
					// Extract detailed error information for logging and debugging
					const errorBody = err.error as Record<string, unknown> | undefined;
					const errorMessage = err.message || "Unknown error";
					const errorType = errorBody?.type || errorBody?.error?.type || "unknown";
					const requestId = err.headers?.["x-request-id"] || err.headers?.["request-id"] || "unknown";

					// For 400 errors, include request context to help debug malformed requests
					const requestContext =
						err.status === 400
							? ` [request: model=${modelName}, tools=${params.tools?.length ?? 0}, messages=${params.messages.length}]`
							: "";

					const details = `[${errorType}] ${errorMessage} (request_id: ${requestId})${requestContext}`;

					if (err.status === 401) {
						throw new Error(`Invalid API key for provider "${providerName}". ${details}`);
					}
					if (err.status === 429) {
						throw new Error(`Rate limited by provider "${providerName}". ${details}`);
					}
					if (err.status && err.status >= 500) {
						throw new Error(`Provider "${providerName}" server error (${err.status}). ${details}`);
					}
					// For other API errors, include full details
					throw new Error(`Provider "${providerName}" error (${err.status}). ${details}`);
				}
				throw err;
			}

			let finishReason = "stop";

			for await (const chunk of response) {
				const choice = chunk.choices[0];
				const delta = choice?.delta;

				if (delta?.content) {
					yield { type: "text", text: delta.content };
				}

				// Tool calls streamed incrementally
				if (delta && "tool_calls" in delta && delta.tool_calls) {
					for (const tc of delta.tool_calls) {
						if (tc.id) {
							yield { type: "tool_call_start", index: tc.index, id: tc.id, name: tc.function?.name ?? "" };
						}
						if (tc.function?.arguments) {
							yield { type: "tool_call_args", index: tc.index, args: tc.function.arguments };
						}
					}
				}

				if (choice?.finish_reason) {
					finishReason = choice.finish_reason;
				}

				if (chunk.usage) {
					yield {
						type: "usage",
						promptTokens: chunk.usage.prompt_tokens,
						completionTokens: chunk.usage.completion_tokens,
					};
				}
			}

			yield { type: "done", finishReason };
		},
	};
}
