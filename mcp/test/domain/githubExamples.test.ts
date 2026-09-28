import { describe, expect, test } from "vitest";
import { GitHubClient } from "../../src/clients/githubClient.js";
import { LlmClient } from "../../src/clients/llmClient.js";
import { findGithubExamples, formatGithubExamples } from "../../src/domain/githubExamples.js";

describe("findGithubExamples", () => {
  test("finds GitHub code examples for each retro item raised", async () => {
    const client = GitHubClient.createNull({
      codeSearchResults: [
        {
          path: "src/clients/githubClient.ts",
          url: "https://github.com/example-org/example-repo/blob/main/src/clients/githubClient.ts",
          repository: "example-org/example-repo",
        },
      ],
      commitSearchResults: [],
    });

    const groups = await findGithubExamples(client, ["Flaky pipeline fails on checkout"]);

    expect(groups).toEqual([
      {
        item: "Flaky pipeline fails on checkout",
        examples: [
          {
            path: "src/clients/githubClient.ts",
            url: "https://github.com/example-org/example-repo/blob/main/src/clients/githubClient.ts",
            repository: "example-org/example-repo",
          },
        ],
        commits: [],
      },
    ]);
  });

  test("returns no examples for a retro item when nothing matches", async () => {
    const client = GitHubClient.createNull({ codeSearchResults: [], commitSearchResults: [] });

    const groups = await findGithubExamples(client, ["Something totally novel"]);

    expect(groups).toEqual([{ item: "Something totally novel", examples: [], commits: [] }]);
  });

  test("caps the number of examples surfaced per retro item", async () => {
    const client = GitHubClient.createNull({
      codeSearchResults: [
        { path: "src/one.ts", url: "https://example.test/1", repository: "acme/widgets" },
        { path: "src/two.ts", url: "https://example.test/2", repository: "acme/widgets" },
        { path: "src/three.ts", url: "https://example.test/3", repository: "acme/widgets" },
        { path: "src/four.ts", url: "https://example.test/4", repository: "acme/widgets" },
      ],
    });

    const groups = await findGithubExamples(client, ["Broken build"]);

    expect(groups[0].examples).toHaveLength(3);
  });

  test("searches with an LLM-generated keyword query instead of the raw retro item text", async () => {
    const client = GitHubClient.createNull({ codeSearchResults: [] });
    const llmClient = LlmClient.createNull({ completion: "flaky pipeline checkout" });

    await findGithubExamples(
      client,
      ["Whenever we run the checkout suite the pipeline seems to randomly fail for no clear reason"],
      { llmClient },
    );

    const requests = client.trackRequests();
    expect(decodeURIComponent(requests[0].url)).toContain("flaky pipeline checkout");
  });

  test("falls back to the raw retro item text if the LLM query rewrite fails", async () => {
    const client = GitHubClient.createNull({ codeSearchResults: [] });
    const llmClient = LlmClient.createNull({ failure: { status: 500 } });

    await findGithubExamples(client, ["Broken build pipeline"], { llmClient });

    const requests = client.trackRequests();
    expect(decodeURIComponent(requests[0].url)).toContain("Broken build pipeline");
  });

  test("strips retro column labels and punctuation from the fallback search query", async () => {
    const client = GitHubClient.createNull({ codeSearchResults: [] });

    await findGithubExamples(client, ["Action: Add retry logic for transient Miro API 500 errors."]);

    const requests = client.trackRequests();
    const query = decodeURIComponent(requests[0].url);
    expect(query).toContain("Add retry logic for transient Miro API 500 errors");
    expect(query).not.toContain("Action:");
  });

  test("behaves exactly as before when no llmClient is supplied", async () => {
    const client = GitHubClient.createNull({ codeSearchResults: [] });

    await findGithubExamples(client, ["Broken build pipeline"]);

    const requests = client.trackRequests();
    expect(decodeURIComponent(requests[0].url)).toContain("Broken build pipeline");
  });

  test("filters out results the LLM judges irrelevant to the retro item", async () => {
    const client = GitHubClient.createNull({
      codeSearchResults: [
        { path: "src/checkout/pipeline.ts", url: "https://example.test/1", repository: "acme/widgets" },
        { path: "README.md", url: "https://example.test/2", repository: "acme/widgets" },
      ],
    });
    const llmClient = LlmClient.createNull({ completion: "1" });

    const groups = await findGithubExamples(client, ["Checkout pipeline is flaky"], { llmClient });

    expect(groups[0].examples).toEqual([
      { path: "src/checkout/pipeline.ts", url: "https://example.test/1", repository: "acme/widgets" },
    ]);
  });

  test("keeps all results when the LLM relevance filter fails", async () => {
    const client = GitHubClient.createNull({
      codeSearchResults: [{ path: "src/checkout/pipeline.ts", url: "https://example.test/1", repository: "acme/widgets" }],
    });
    const llmClient = LlmClient.createNull({ failure: { status: 500 } });

    const groups = await findGithubExamples(client, ["Checkout pipeline is flaky"], { llmClient });

    expect(groups[0].examples).toHaveLength(1);
  });

  test("returns no examples for a retro item when the GitHub search fails", async () => {
    const client = GitHubClient.createNull({ codeSearchFailureStatus: 403, commitSearchResults: [] });

    const groups = await findGithubExamples(client, ["Broken build pipeline"]);

    expect(groups).toEqual([{ item: "Broken build pipeline", examples: [], commits: [] }]);
  });

  test("flags a retro item as unable to be checked when GitHub's search index is still building", async () => {
    const client = GitHubClient.createNull({ codeSearchIncomplete: true, commitSearchResults: [] });

    const groups = await findGithubExamples(client, ["Broken build pipeline"]);

    expect(groups).toEqual([
      {
        item: "Broken build pipeline",
        examples: [],
        commits: [],
        note: "Couldn't be checked — GitHub's code search index for this repository is still building. Try again shortly.",
      },
    ]);
  });

  test("scopes searches to the supplied owner and repo", async () => {
    const client = GitHubClient.createNull({ codeSearchResults: [], commitSearchResults: [] });

    await findGithubExamples(client, ["Broken build"], { owner: "acme", repo: "widgets" });

    const requests = client.trackRequests();
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(decodeURIComponent(request.url)).toContain("repo:acme/widgets");
    }
  });

  test("finds relevant commits alongside code examples for each retro item raised", async () => {
    const client = GitHubClient.createNull({
      codeSearchResults: [],
      commitSearchResults: [
        {
          sha: "abc1234",
          message: "Fix flaky checkout pipeline retries",
          url: "https://github.com/example-org/example-repo/commit/abc1234",
          repository: "example-org/example-repo",
        },
      ],
    });

    const groups = await findGithubExamples(client, ["Flaky pipeline fails on checkout"]);

    expect(groups[0].commits).toEqual([
      {
        sha: "abc1234",
        message: "Fix flaky checkout pipeline retries",
        url: "https://github.com/example-org/example-repo/commit/abc1234",
        repository: "example-org/example-repo",
      },
    ]);
  });

  test("caps the number of commits surfaced per retro item", async () => {
    const client = GitHubClient.createNull({
      codeSearchResults: [],
      commitSearchResults: [
        { sha: "1", message: "one", url: "https://example.test/1", repository: "acme/widgets" },
        { sha: "2", message: "two", url: "https://example.test/2", repository: "acme/widgets" },
        { sha: "3", message: "three", url: "https://example.test/3", repository: "acme/widgets" },
        { sha: "4", message: "four", url: "https://example.test/4", repository: "acme/widgets" },
      ],
    });

    const groups = await findGithubExamples(client, ["Broken build"]);

    expect(groups[0].commits).toHaveLength(3);
  });

  test("filters out commits the LLM judges irrelevant to the retro item", async () => {
    const client = GitHubClient.createNull({
      codeSearchResults: [],
      commitSearchResults: [
        { sha: "1", message: "Fix flaky checkout pipeline retries", url: "https://example.test/1", repository: "acme/widgets" },
        { sha: "2", message: "Update README", url: "https://example.test/2", repository: "acme/widgets" },
      ],
    });
    const llmClient = LlmClient.createNull({ completion: "1" });

    const groups = await findGithubExamples(client, ["Checkout pipeline is flaky"], { llmClient });

    expect(groups[0].commits).toEqual([
      { sha: "1", message: "Fix flaky checkout pipeline retries", url: "https://example.test/1", repository: "acme/widgets" },
    ]);
  });

  test("returns no commits for a retro item when the commit search fails", async () => {
    const client = GitHubClient.createNull({ codeSearchResults: [], commitSearchFailureStatus: 403 });

    const groups = await findGithubExamples(client, ["Broken build pipeline"]);

    expect(groups[0].commits).toEqual([]);
  });

  test("flags a retro item as unable to be checked when GitHub's commit search index is still building", async () => {
    const client = GitHubClient.createNull({ codeSearchResults: [], commitSearchIncomplete: true });

    const groups = await findGithubExamples(client, ["Broken build pipeline"]);

    expect(groups[0].note).toBe(
      "Couldn't be checked — GitHub's code search index for this repository is still building. Try again shortly.",
    );
  });
});

describe("formatGithubExamples", () => {
  test("formats a GitHub examples section listing each match", () => {
    const text = formatGithubExamples([
      {
        item: "Flaky pipeline fails on checkout",
        examples: [
          {
            path: "src/clients/githubClient.ts",
            url: "https://github.com/example-org/example-repo/blob/main/src/clients/githubClient.ts",
            repository: "example-org/example-repo",
          },
        ],
        commits: [],
      },
    ]);

    expect(text).toContain("GitHub examples");
    expect(text).toContain("Flaky pipeline fails on checkout");
    expect(text).toContain(
      "- example-org/example-repo src/clients/githubClient.ts — https://github.com/example-org/example-repo/blob/main/src/clients/githubClient.ts",
    );
  });

  test("omits groups that have no examples", () => {
    const text = formatGithubExamples([{ item: "Something totally novel", examples: [], commits: [] }]);

    expect(text).not.toContain("Something totally novel");
  });

  test("shows a note explaining a retro item couldn't be checked when the GitHub index is still building", () => {
    const text = formatGithubExamples([
      {
        item: "Broken build pipeline",
        examples: [],
        commits: [],
        note: "Couldn't be checked — GitHub's code search index for this repository is still building. Try again shortly.",
      },
    ]);

    expect(text).toContain("Broken build pipeline");
    expect(text).toContain("Couldn't be checked — GitHub's code search index for this repository is still building. Try again shortly.");
  });

  test("returns an empty string when there are no examples at all", () => {
    const text = formatGithubExamples([{ item: "Something totally novel", examples: [], commits: [] }]);

    expect(text).toBe("");
  });

  test("formats a relevant commits section separate from code examples", () => {
    const text = formatGithubExamples([
      {
        item: "Flaky pipeline fails on checkout",
        examples: [],
        commits: [
          {
            sha: "abc1234",
            message: "Fix flaky checkout pipeline retries",
            url: "https://github.com/example-org/example-repo/commit/abc1234",
            repository: "example-org/example-repo",
          },
        ],
      },
    ]);

    expect(text).toContain("Relevant commits");
    expect(text).toContain(
      "- example-org/example-repo abc1234 Fix flaky checkout pipeline retries — https://github.com/example-org/example-repo/commit/abc1234",
    );
  });

  test("omits the relevant commits section when a group has no commits", () => {
    const text = formatGithubExamples([{ item: "Something totally novel", examples: [], commits: [] }]);

    expect(text).not.toContain("Relevant commits");
  });
});
