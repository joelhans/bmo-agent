/**
 * Analyze token estimation accuracy against real API usage from sessions
 */

export const description = "Compare token estimates vs real API usage from session files";

export const schema = {
	type: "object",
	properties: {
		sessionCount: {
			type: "number",
			description: "Number of recent sessions to analyze (default: 5)",
			default: 5,
		},
	},
};

export async function run({ sessionCount = 5 }) {
	const fs = await import("fs");
	const path = await import("path");
	
	const dataDir = process.env.BMO_HOME || path.join(process.env.HOME, ".local/share/bmo");
	const sessionsDir = path.join(dataDir, "sessions");
	
	if (!fs.existsSync(sessionsDir)) {
		return { ok: false, error: "Sessions directory not found" };
	}
	
	// Get recent session files (exclude .log files)
	const files = fs.readdirSync(sessionsDir)
		.filter(f => f.endsWith(".json"))
		.sort()
		.reverse()
		.slice(0, sessionCount);
	
	if (files.length === 0) {
		return { ok: false, error: "No session files found" };
	}
	
	let totalMessages = 0;
	let totalRealTokens = 0;
	let totalEstimatedTokens = 0;
	const samples = [];
	
	for (const file of files) {
		const content = fs.readFileSync(path.join(sessionsDir, file), "utf8");
		const session = JSON.parse(content);
		
		if (!session.messages || !session.usage) continue;
		
		// For each message, estimate tokens using current formula
		for (const msg of session.messages) {
			let chars = (msg.content ?? "").length;
			if (msg.tool_calls) {
				chars += JSON.stringify(msg.tool_calls).length;
			}
			if (msg.tool_call_id) {
				chars += msg.tool_call_id.length;
			}
			
			const estimated = Math.ceil(chars / 3.5) + 4;
			
			totalMessages++;
			totalEstimatedTokens += estimated;
			
			// Sample some for display
			if (samples.length < 10 && chars > 0 && chars < 200) {
				samples.push({
					role: msg.role,
					chars,
					estimated,
					snippet: (msg.content ?? "").slice(0, 50),
				});
			}
		}
		
		// Real tokens from API (prompt tokens only, since that's what we estimate)
		totalRealTokens += session.usage.totalPromptTokens;
	}
	
	const avgRealPerMessage = totalRealTokens / totalMessages;
	const avgEstimatedPerMessage = totalEstimatedTokens / totalMessages;
	const overestimateRatio = avgEstimatedPerMessage / avgRealPerMessage;
	
	const result = {
		sessionsAnalyzed: files.length,
		totalMessages,
		totalRealTokens,
		totalEstimatedTokens,
		avgRealPerMessage: avgRealPerMessage.toFixed(1),
		avgEstimatedPerMessage: avgEstimatedPerMessage.toFixed(1),
		overestimateRatio: overestimateRatio.toFixed(2) + "x",
		overestimatePercent: ((overestimateRatio - 1) * 100).toFixed(0) + "%",
		samples: samples.slice(0, 5),
	};
	
	return { ok: true, result };
}
