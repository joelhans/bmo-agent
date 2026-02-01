import OpenAI from "openai";
import type { BmoConfig } from "./config.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

export type LlmEvent =
	| { type: "text"; text: string }
	| { type: "usage"; promptTokens: number; completionTokens: number }
	| { type: "done" };

export interface LlmClient {
	stream(messages: ChatMessage[], model: string): AsyncGenerator<LlmEvent>;
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
				`${provider.apiKeyEnv} is not set. Set it in your environment to use provider "${providerName}".`,
			);
		}

		const client = new OpenAI({ apiKey, baseURL: provider.baseUrl });
		clients.set(providerName, client);
		return client;
	}

	return {
		async *stream(messages: ChatMessage[], model: string): AsyncGenerator<LlmEvent> {
			const { providerName, modelName } = parseModel(model);
			const client = getClient(providerName);

			const response = await client.chat.completions.create({
				model: modelName,
				messages: messages.map((m) => ({ role: m.role, content: m.content })),
				stream: true,
				stream_options: { include_usage: true },
			});

			for await (const chunk of response) {
				const delta = chunk.choices[0]?.delta;
				if (delta?.content) {
					yield { type: "text", text: delta.content };
				}
				if (chunk.usage) {
					yield {
						type: "usage",
						promptTokens: chunk.usage.prompt_tokens,
						completionTokens: chunk.usage.completion_tokens,
					};
				}
			}

			yield { type: "done" };
		},
	};
}
