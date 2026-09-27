import { describe, expect, test } from "vitest";
import { HttpClient } from "../../src/clients/httpClient.js";

describe("HttpClient.createNull", () => {
  test("returns a configured static response for a matching request", async () => {
    const client = HttpClient.createNull({
      "GET /widgets": { status: 200, body: { widgets: [] } },
    });

    const response = await client.request({ method: "GET", url: "https://example.test/widgets" });

    expect(response).toEqual({ status: 200, ok: true, data: { widgets: [] } });
  });

  test("defaults to a 200 status when none is configured", async () => {
    const client = HttpClient.createNull({
      "GET /widgets": { body: { widgets: [] } },
    });

    const response = await client.request({ method: "GET", url: "https://example.test/widgets" });

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
  });

  test("marks non-2xx configured statuses as not ok", async () => {
    const client = HttpClient.createNull({
      "GET /widgets": { status: 404, body: { message: "not found" } },
    });

    const response = await client.request({ method: "GET", url: "https://example.test/widgets" });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });

  test("matches responses by method and path fragment, ignoring query params and host", async () => {
    const client = HttpClient.createNull({
      "GET /widgets/123": { status: 200, body: { id: "123" } },
    });

    const response = await client.request({
      method: "GET",
      url: "https://example.test/widgets/123?expand=all",
    });

    expect(response.data).toEqual({ id: "123" });
  });

  test("serves queued array responses in order, repeating the last entry once exhausted", async () => {
    const client = HttpClient.createNull({
      "GET /widgets": [{ body: { page: 1 } }, { body: { page: 2 } }],
    });

    const first = await client.request({ method: "GET", url: "https://example.test/widgets" });
    const second = await client.request({ method: "GET", url: "https://example.test/widgets" });
    const third = await client.request({ method: "GET", url: "https://example.test/widgets" });

    expect(first.data).toEqual({ page: 1 });
    expect(second.data).toEqual({ page: 2 });
    expect(third.data).toEqual({ page: 2 });
  });

  test("resolves a function response using the outgoing request as context", async () => {
    const client = HttpClient.createNull({
      "POST /widgets": (ctx) => ({ status: 201, body: { name: (ctx.body as { name: string }).name } }),
    });

    const response = await client.request({
      method: "POST",
      url: "https://example.test/widgets",
      body: { name: "sprocket" },
    });

    expect(response).toEqual({ status: 201, ok: true, data: { name: "sprocket" } });
  });

  test("throws a clear error when no response is configured for the request", async () => {
    const client = HttpClient.createNull();

    await expect(
      client.request({ method: "GET", url: "https://example.test/widgets" }),
    ).rejects.toThrow(/No stubbed response configured for GET https:\/\/example\.test\/widgets/);
  });

  test("does not match a configured response for a different method", async () => {
    const client = HttpClient.createNull({
      "POST /widgets": { status: 201, body: {} },
    });

    await expect(client.request({ method: "GET", url: "https://example.test/widgets" })).rejects.toThrow();
  });
});

describe("HttpClient output tracking", () => {
  test("records every request made through the client", async () => {
    const client = HttpClient.createNull({
      "GET /widgets": { body: [] },
      "POST /widgets": { status: 201, body: {} },
    });

    await client.request({ method: "GET", url: "https://example.test/widgets" });
    await client.request({
      method: "POST",
      url: "https://example.test/widgets",
      headers: { "Content-Type": "application/json" },
      body: { name: "sprocket" },
    });

    const requests = client.trackRequests();
    expect(requests).toEqual([
      { method: "GET", url: "https://example.test/widgets", headers: undefined, body: undefined },
      {
        method: "POST",
        url: "https://example.test/widgets",
        headers: { "Content-Type": "application/json" },
        body: { name: "sprocket" },
      },
    ]);
  });

  test("only tracks requests made after trackRequests was called", async () => {
    const client = HttpClient.createNull({ "GET /widgets": { body: [] } });
    await client.request({ method: "GET", url: "https://example.test/widgets" });

    const requests = client.trackRequests();
    await client.request({ method: "GET", url: "https://example.test/widgets" });

    expect(requests).toHaveLength(1);
  });
});
