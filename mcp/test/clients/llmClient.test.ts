import { describe, expect, test } from "vitest";
import { LlmClient } from "../../src/clients/llmClient.js";

describe("LlmClient.createNull", () => {
  test("returns a default canned narrative completion", async () => {
    const client = LlmClient.createNull();

    const narrative = await client.complete("Summarise this retro");

    expect(narrative).toContain("retro");
  });

  test("supports configuring a custom completion for deterministic assertions", async () => {
    const client = LlmClient.createNull({ completion: "The team shipped faster and morale is high." });

    const narrative = await client.complete("Summarise this retro");

    expect(narrative).toBe("The team shipped faster and morale is high.");
  });

  test("sends the prompt as a chat completion request", async () => {
    const client = LlmClient.createNull();

    await client.complete("Summarise this retro");

    const requests = client.trackRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("/chat/completions");
    expect(requests[0].body).toMatchObject({
      messages: [{ role: "user", content: "Summarise this retro" }],
    });
  });

  test("throws a clear error when the completion request fails", async () => {
    const client = LlmClient.createNull({ failure: { status: 503 } });

    await expect(client.complete("Summarise this retro")).rejects.toThrow(/LLM completion failed/);
  });

  test("throws a clear error when the response has no completion content", async () => {
    const client = LlmClient.createNull({ emptyResponse: true });

    await expect(client.complete("Summarise this retro")).rejects.toThrow(/no content/);
  });
});
