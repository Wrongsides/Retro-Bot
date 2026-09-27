import { describe, expect, test } from "vitest";
import { McpClient } from "../src/mcpClient.js";

describe("McpClient.createNull", () => {
  test("returns the default retro-bot tool set when none is configured", async () => {
    const client = McpClient.createNull();

    const tools = await client.listTools();

    expect(tools).toEqual(["miro_create_retro", "cycle_overview"]);
  });

  test("returns a configured tool list", async () => {
    const client = McpClient.createNull({ tools: ["only_tool"] });

    expect(await client.listTools()).toEqual(["only_tool"]);
  });

  test("returns a stubbed string response for a known tool", async () => {
    const client = McpClient.createNull({
      responses: { miro_create_retro: "created board 123" },
    });

    const result = await client.callTool("miro_create_retro", {});

    expect(result).toBe("created board 123");
  });

  test("supports a response factory that receives the call args", async () => {
    const client = McpClient.createNull({
      responses: {
        cycle_overview: (args) => `overview for ${JSON.stringify(args)}`,
      },
    });

    const result = await client.callTool("cycle_overview", { boardId: "abc" });

    expect(result).toBe('overview for {"boardId":"abc"}');
  });

  test("falls back to a generic stub message for an unconfigured tool", async () => {
    const client = McpClient.createNull();

    const result = await client.callTool("unknown_tool", { foo: "bar" });

    expect(result).toContain("unknown_tool");
    expect(result).toContain('"foo":"bar"');
  });

  test("defaults callTool args to an empty object", async () => {
    const client = McpClient.createNull({
      responses: {
        cycle_overview: (args) => JSON.stringify(args),
      },
    });

    const result = await client.callTool("cycle_overview");

    expect(result).toBe("{}");
  });
});

describe("McpClient output tracking", () => {
  test("records each callTool invocation with its tool name and args", async () => {
    const client = McpClient.createNull();

    await client.callTool("miro_create_retro", { boardId: "abc" });
    await client.callTool("cycle_overview", {});

    expect(client.trackCalls()).toEqual([
      { toolName: "miro_create_retro", args: { boardId: "abc" } },
      { toolName: "cycle_overview", args: {} },
    ]);
  });

  test("only tracks calls made after trackCalls was called", async () => {
    const client = McpClient.createNull();
    await client.callTool("miro_create_retro", {});

    client.trackCalls();
    await client.callTool("cycle_overview", {});

    expect(client.trackCalls()).toEqual([{ toolName: "cycle_overview", args: {} }]);
  });
});
