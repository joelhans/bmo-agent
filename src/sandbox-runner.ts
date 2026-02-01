// ---------------------------------------------------------------------------
// Sandbox runner — subprocess entry point for dynamic .mjs tools
//
// This script is spawned by executeSandboxed(). It:
// 1. Reads a JSON request from stdin: { toolPath, args }
// 2. Applies sandbox restrictions based on BMO_SANDBOX_* env vars
// 3. Dynamically imports the tool module
// 4. Calls run(args)
// 5. Writes JSON result to stdout: { ok, result?, error? }
// ---------------------------------------------------------------------------

function applySandboxRestrictions(): void {
	// Network restriction
	if (process.env.BMO_SANDBOX_NO_NETWORK === "1") {
		globalThis.fetch = () => {
			throw new Error("Network access denied by sandbox");
		};
	}

	// Subprocess restriction
	if (process.env.BMO_SANDBOX_NO_SUBPROCESS === "1") {
		const deny = () => {
			throw new Error("Subprocess access denied by sandbox");
		};
		Bun.spawn = deny as typeof Bun.spawn;
		Bun.spawnSync = deny as typeof Bun.spawnSync;
	}
}

async function readStdin(): Promise<string> {
	const chunks: Uint8Array[] = [];
	for await (const chunk of Bun.stdin.stream()) {
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString("utf-8");
}

async function main(): Promise<void> {
	try {
		const input = await readStdin();
		const { toolPath, args } = JSON.parse(input) as { toolPath: string; args: Record<string, unknown> };

		applySandboxRestrictions();

		const mod = (await import(toolPath)) as {
			run: (args: Record<string, unknown>) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
		};

		if (typeof mod.run !== "function") {
			const result = { ok: false, error: "Tool module does not export a run function" };
			process.stdout.write(JSON.stringify(result));
			process.exit(1);
		}

		const result = await mod.run(args);
		process.stdout.write(JSON.stringify(result));
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		const result = { ok: false, error: msg };
		process.stdout.write(JSON.stringify(result));
		process.exit(1);
	}
}

main();
