import type { BmoConfig } from "./config.ts";

// ---------------------------------------------------------------------------
// Secret masking — prevent API keys and tokens from leaking into logs/output
// ---------------------------------------------------------------------------

export interface SecretMasker {
	mask(text: string): string;
}

/** Regex patterns for common token formats as a safety net. */
const TOKEN_PATTERNS: RegExp[] = [
	/sk-[a-zA-Z0-9]{20,}/g,
	/ghp_[a-zA-Z0-9]{36}/g,
	/ghu_[a-zA-Z0-9]{36}/g,
	/ghs_[a-zA-Z0-9]{36}/g,
	/gho_[a-zA-Z0-9]{36}/g,
	/Bearer\s+[a-zA-Z0-9._-]{20,}/g,
];

/**
 * Create a SecretMasker that replaces known secret values and common token
 * patterns with `***`.
 *
 * Collects literal secret values from `process.env[provider.apiKeyEnv]` for
 * each configured provider. Filters out empty/short values (< 8 chars) to
 * avoid false positives.
 */
export function createSecretMasker(config: BmoConfig): SecretMasker {
	const literals: string[] = [];

	for (const provider of Object.values(config.providers)) {
		const value = process.env[provider.apiKeyEnv];
		if (value && value.length >= 8) {
			literals.push(value);
		}
	}

	// Sort longest first so longer matches are replaced before shorter substrings
	literals.sort((a, b) => b.length - a.length);

	return {
		mask(text: string): string {
			let result = text;

			// Replace literal secret values
			for (const secret of literals) {
				result = result.replaceAll(secret, "***");
			}

			// Apply regex patterns as safety net
			for (const pattern of TOKEN_PATTERNS) {
				result = result.replace(pattern, "***");
			}

			return result;
		},
	};
}
