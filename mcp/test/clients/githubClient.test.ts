import { describe, expect, test } from "vitest";
import { GitHubClient, GitHubSearchIncompleteError } from "../../src/clients/githubClient.js";

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

describe("GitHubClient.searchCode", () => {
  test("returns the default sample code search result", async () => {
    const client = GitHubClient.createNull();

    const results = await client.searchCode("literal query");

    expect(results).toEqual([
      {
        path: "src/clients/githubClient.ts",
        url: "https://github.com/example-org/example-repo/blob/main/src/clients/githubClient.ts",
        repository: "example-org/example-repo",
      },
    ]);
  });

  test("supports configuring custom code search results", async () => {
    const client = GitHubClient.createNull({
      codeSearchResults: [
        { path: "src/domain/example.ts", url: "https://example.test/blob/main/src/domain/example.ts", repository: "acme/widgets" },
      ],
    });

    const results = await client.searchCode("custom query");

    expect(results).toEqual([
      { path: "src/domain/example.ts", url: "https://example.test/blob/main/src/domain/example.ts", repository: "acme/widgets" },
    ]);
  });

  test("scopes the code search query to the supplied owner and repo", async () => {
    const client = GitHubClient.createNull();

    await client.searchCode("literal query", "acme", "widgets");

    const requests = client.trackRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(decodeURIComponent(requests[0].url)).toContain("repo:acme/widgets");
    expect(decodeURIComponent(requests[0].url)).toContain("literal query");
  });

  test("throws a GitHubSearchIncompleteError when GitHub reports the results as incomplete", async () => {
    const client = GitHubClient.createNull({ codeSearchIncomplete: true });

    await expect(client.searchCode("literal query")).rejects.toBeInstanceOf(GitHubSearchIncompleteError);
  });
});

describe("GitHubClient.searchCommits", () => {
  test("returns the default sample commit search result", async () => {
    const client = GitHubClient.createNull();

    const results = await client.searchCommits("literal query");

    expect(results).toEqual([
      {
        sha: "abc1234",
        message: "Add retry/backoff to broadband availability lookup",
        url: "https://github.com/example-org/example-repo/commit/abc1234",
        repository: "example-org/example-repo",
      },
    ]);
  });

  test("scopes the commit search query to the supplied owner and repo", async () => {
    const client = GitHubClient.createNull();

    await client.searchCommits("literal query", "acme", "widgets");

    const requests = client.trackRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(decodeURIComponent(requests[0].url)).toContain("repo:acme/widgets");
    expect(decodeURIComponent(requests[0].url)).toContain("literal query");
  });
});

describe("GitHubClient.searchIssues", () => {
  test("returns the default sample search result", async () => {
    const client = GitHubClient.createNull();

    const results = await client.searchIssues("flaky pipeline");

    expect(results).toEqual([
      {
        number: 17,
        title: "Flaky pipeline fails intermittently on the checkout suite",
        state: "open",
        url: "https://github.com/example-org/example-repo/issues/17",
        repository: "example-org/example-repo",
      },
    ]);
  });

  test("supports configuring custom search results", async () => {
    const client = GitHubClient.createNull({
      searchResults: [
        {
          number: 5,
          title: "Custom match",
          state: "closed",
          url: "https://example.test/issues/5",
          repository: "acme/widgets",
        },
      ],
    });

    const results = await client.searchIssues("custom query");

    expect(results).toEqual([
      { number: 5, title: "Custom match", state: "closed", url: "https://example.test/issues/5", repository: "acme/widgets" },
    ]);
  });

  test("scopes the search query to the supplied owner and repo", async () => {
    const client = GitHubClient.createNull();

    await client.searchIssues("flaky pipeline", "acme", "widgets");

    const requests = client.trackRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(decodeURIComponent(requests[0].url)).toContain("repo:acme/widgets");
    expect(decodeURIComponent(requests[0].url)).toContain("flaky pipeline");
  });
});
