import { describe, expect, test } from "bun:test";
import type { BmoConfig } from "./config.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { createRunCommandTool, createToolRegistry, formatToolCallSummary } from "./tools.ts";

const testConfig: BmoConfig = {
	...DEFAULT_CONFIG,
	sandbox: { ...DEFAULT_CONFIG.sandbox, defaultTimeoutMs: 5000 },
	toolResultTruncation: 500,
};

describe("createToolRegistry", () => {
	test("register and get a tool", () => {
		const registry = createToolRegistry();
		const tool = createRunCommandTool(testConfig);
		registry.register(tool);
		expect(registry.get("run_command")).toBeDefined();
		expect(registry.get("run_command")?.name).toBe("run_command");
	});

	test("get returns undefined for unknown tool", () => {
		const registry = createToolRegistry();
		expect(registry.get("nonexistent")).toBeUndefined();
	});

	test("getSchemas returns OpenAI-format schemas", () => {
		const registry = createToolRegistry();
		registry.register(createRunCommandTool(testConfig));
		const schemas = registry.getSchemas();
		expect(schemas).toHaveLength(1);
		expect(schemas[0].type).toBe("function");
		expect(schemas[0].function.name).toBe("run_command");
		expect(schemas[0].function.description).toBeTruthy();
		expect(schemas[0].function.parameters).toBeDefined();
	});

	test("listNames returns registered tool names", () => {
		const registry = createToolRegistry();
		registry.register(createRunCommandTool(testConfig));
		expect(registry.listNames()).toEqual(["run_command"]);
	});
});

describe("builtin vs dynamic tools", () => {
	test("builtin tool survives clearDynamic", () => {
		const registry = createToolRegistry();
		registry.register(createRunCommandTool(testConfig), { builtin: true });
		registry.clearDynamic();
		expect(registry.get("run_command")).toBeDefined();
		expect(registry.listNames()).toEqual(["run_command"]);
	});

	test("dynamic tool is removed by clearDynamic", () => {
		const registry = createToolRegistry();
		registry.register(createRunCommandTool(testConfig), { builtin: true });
		registry.register({
			name: "dynamic_tool",
			description: "test",
			parameters: { type: "object", properties: {} },
			async execute() {
				return { output: "ok" };
			},
		});
		expect(registry.listNames()).toHaveLength(2);
		registry.clearDynamic();
		expect(registry.listNames()).toEqual(["run_command"]);
		expect(registry.get("dynamic_tool")).toBeUndefined();
	});

	test("listDynamicNames returns only non-builtin names", () => {
		const registry = createToolRegistry();
		registry.register(createRunCommandTool(testConfig), { builtin: true });
		registry.register({
			name: "dynamic_tool",
			description: "test",
			parameters: { type: "object", properties: {} },
			async execute() {
				return { output: "ok" };
			},
		});
		expect(registry.listDynamicNames()).toEqual(["dynamic_tool"]);
	});

	test("cannot overwrite builtin with dynamic tool", () => {
		const registry = createToolRegistry();
		registry.register(createRunCommandTool(testConfig), { builtin: true });
		registry.register({
			name: "run_command",
			description: "impostor",
			parameters: { type: "object", properties: {} },
			async execute() {
				return { output: "fake" };
			},
		});
		// Original builtin should remain
		expect(registry.get("run_command")?.description).not.toBe("impostor");
	});

	test("builtin can overwrite builtin", () => {
		const registry = createToolRegistry();
		registry.register(createRunCommandTool(testConfig), { builtin: true });
		registry.register(
			{
				name: "run_command",
				description: "updated",
				parameters: { type: "object", properties: {} },
				async execute() {
					return { output: "ok" };
				},
			},
			{ builtin: true },
		);
		expect(registry.get("run_command")?.description).toBe("updated");
	});
});

describe("run_command", () => {
	const tool = createRunCommandTool(testConfig);

	test("executes a simple command", async () => {
		const result = await tool.execute({ command: "echo hello" });
		expect(result.output).toContain("hello");
		expect(result.output).toContain("[exit code: 0]");
		expect(result.isError).toBeFalsy();
	});

	test("captures failing command", async () => {
		const result = await tool.execute({ command: "false" });
		expect(result.output).toContain("[exit code: 1]");
		expect(result.isError).toBe(true);
	});

	test("captures stderr", async () => {
		const result = await tool.execute({ command: "echo err >&2" });
		expect(result.output).toContain("[stderr]");
		expect(result.output).toContain("err");
	});

	test("truncates long output", async () => {
		const result = await tool.execute({ command: `python3 -c "print('x' * 1000)"` });
		expect(result.output).toContain("[truncated");
	});

	test("respects pipefail", async () => {
		const result = await tool.execute({ command: "false | cat" });
		expect(result.isError).toBe(true);
	});
});

describe("formatToolCallSummary", () => {
	test("formats simple args", () => {
		const summary = formatToolCallSummary("run_command", '{"command":"ls -la"}');
		expect(summary).toBe("run_command(command='ls -la')");
	});

	test("truncates long string values", () => {
		const longCmd = "a".repeat(100);
		const summary = formatToolCallSummary("run_command", JSON.stringify({ command: longCmd }));
		expect(summary).toContain("...");
		expect(summary.length).toBeLessThan(120);
	});

	test("formats non-string values", () => {
		const summary = formatToolCallSummary("run_command", '{"command":"ls","timeout_ms":5000}');
		expect(summary).toBe("run_command(command='ls', timeout_ms=5000)");
	});

	test("handles invalid JSON", () => {
		const summary = formatToolCallSummary("run_command", "not json");
		expect(summary).toBe("run_command(...)");
	});
});
