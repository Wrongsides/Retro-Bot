import { describe, expect, test } from "vitest";
import { GitHubClient } from "../../src/integrations/githubClient.js";

describe("GitHubClient.createNull", () => {
  test("returns the default sample open issue", async () => {
    const client = GitHubClient.createNull();

    const issues = await client.listOpenIssues();

    expect(issues).toEqual([
      {
        number: 42,
        title: "Add retry/backoff to broadband availability lookup",
        state: "open",
        url: "https://github.com/example-org/example-repo/issues/42",
      },
    ]);
  });

  test("creates an issue with an incrementing number using the default owner and repo", async () => {
    const client = GitHubClient.createNull();

    const issue = await client.createIssue({ title: "Add retry logic to checkout" });

    expect(issue).toEqual({
      number: 43,
      title: "Add retry logic to checkout",
      state: "open",
      url: "https://github.com/example-org/example-repo/issues/43",
    });
  });

  test("increments the issue number across successive creations", async () => {
    const client = GitHubClient.createNull();

    const first = await client.createIssue({ title: "First action" });
    const second = await client.createIssue({ title: "Second action" });

    expect(first.number).toBe(43);
    expect(second.number).toBe(44);
  });

  test("uses a supplied owner and repo instead of the default", async () => {
    const client = GitHubClient.createNull();

    const issue = await client.createIssue({ title: "Cross-team action", owner: "other-org", repo: "other-repo" });

    expect(issue.url).toBe("https://github.com/other-org/other-repo/issues/43");
  });

  test("supports configuring a custom list of open issues", async () => {
    const client = GitHubClient.createNull({
      openIssues: [{ number: 7, title: "Custom", state: "open", url: "https://example.test/issues/7" }],
    });

    const issues = await client.listOpenIssues();

    expect(issues).toEqual([{ number: 7, title: "Custom", state: "open", url: "https://example.test/issues/7" }]);
  });

  test("tracks the owner and repo used for outgoing list requests", async () => {
    const client = GitHubClient.createNull();

    await client.listOpenIssues("acme", "widgets");

    const requests = client.trackRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toContain("/repos/acme/widgets/issues");
  });

  test("tracks outgoing create-issue requests with the submitted title", async () => {
    const client = GitHubClient.createNull();

    await client.createIssue({ title: "Add retry logic to checkout" });

    const requests = client.trackRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].body).toMatchObject({ title: "Add retry logic to checkout" });
  });
});
