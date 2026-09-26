import { describe, expect, test } from "vitest";
import { JiraClient } from "../../src/integrations/jiraClient.js";

describe("JiraClient.createNull", () => {
  test("returns default sample issues when searching without configuration", async () => {
    const client = JiraClient.createNull();

    const issues = await client.searchIssues("project = RETRO");

    expect(issues).toEqual([
      {
        key: "RETRO-101",
        summary: "Investigate flaky checkout integration tests",
        status: "In Progress",
        url: "https://example.atlassian.net/browse/RETRO-101",
      },
      {
        key: "RETRO-98",
        summary: "Document on-call handover checklist",
        status: "Done",
        url: "https://example.atlassian.net/browse/RETRO-98",
      },
    ]);
  });

  test("creates an issue using the default project key and an incrementing key", async () => {
    const client = JiraClient.createNull();

    const issue = await client.createIssue({ summary: "Add retry logic to checkout" });

    expect(issue).toEqual({
      key: "RETRO-102",
      summary: "Add retry logic to checkout",
      status: "To Do",
      url: "https://example.atlassian.net/browse/RETRO-102",
    });
  });

  test("increments the issue key across successive creations", async () => {
    const client = JiraClient.createNull();

    const first = await client.createIssue({ summary: "First action" });
    const second = await client.createIssue({ summary: "Second action" });

    expect(first.key).toBe("RETRO-102");
    expect(second.key).toBe("RETRO-103");
  });

  test("uses a supplied project key instead of the default", async () => {
    const client = JiraClient.createNull();

    const issue = await client.createIssue({ summary: "Cross-team action", projectKey: "TEAM" });

    expect(issue.key).toBe("TEAM-102");
  });

  test("supports configuring a custom search response", async () => {
    const client = JiraClient.createNull({
      searchIssues: [{ key: "RETRO-5", summary: "Custom", status: "Done", url: "https://example.test/RETRO-5" }],
    });

    const issues = await client.searchIssues("project = RETRO");

    expect(issues).toEqual([
      { key: "RETRO-5", summary: "Custom", status: "Done", url: "https://example.test/RETRO-5" },
    ]);
  });

  test("tracks the JQL used for outgoing search requests", async () => {
    const client = JiraClient.createNull();

    await client.searchIssues("project = RETRO AND status != Done");

    const requests = client.trackRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("/rest/api/3/search/jql");
    expect(requests[0].body).toMatchObject({ jql: "project = RETRO AND status != Done" });
  });

  test("tracks outgoing create-issue requests with the submitted summary", async () => {
    const client = JiraClient.createNull();

    await client.createIssue({ summary: "Add retry logic to checkout" });

    const requests = client.trackRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].body).toMatchObject({ fields: { summary: "Add retry logic to checkout" } });
  });
});
