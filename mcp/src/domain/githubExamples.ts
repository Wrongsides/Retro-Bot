import {
  GitHubSearchIncompleteError,
  type GitHubClient,
  type GitHubCodeSearchResult,
  type GitHubCommitSearchResult,
} from "../clients/githubClient.js";
import type { LlmClient } from "../clients/llmClient.js";
import { logger } from "../utils/logger.js";

const MAX_EXAMPLES_PER_ITEM = 3;
const MAX_COMMITS_PER_ITEM = 3;
const INDEX_BUILDING_NOTE =
  "Couldn't be checked — GitHub's code search index for this repository is still building. Try again shortly.";

export interface GithubExampleGroup {
  item: string;
  examples: GitHubCodeSearchResult[];
  commits: GitHubCommitSearchResult[];
  note?: string;
}

export interface FindGithubExamplesOptions {
  owner?: string;
  repo?: string;
  llmClient?: LlmClient;
}

function buildSearchQueryPrompt(item: string): string {
  return [
    "Extract 2-5 concise technical keywords suitable for a GitHub code search from this retro note.",
    "Respond with only the keywords, space separated, no punctuation or explanation.",
    "",
    `Retro note: ${item}`,
  ].join("\n");
}

function sanitizeFallbackQuery(item: string): string {
  return item.replace(/^[A-Za-z][A-Za-z\s]{0,30}:\s*/, "").replace(/[.!?]+$/, "");
}

async function buildSearchQuery(item: string, llmClient?: LlmClient): Promise<string> {
  if (!llmClient) {
    return sanitizeFallbackQuery(item);
  }
  try {
    const completion = await llmClient.complete(buildSearchQueryPrompt(item));
    return completion.trim() || sanitizeFallbackQuery(item);
  } catch {
    return sanitizeFallbackQuery(item);
  }
}

function buildRelevanceFilterPrompt<T>(item: string, results: T[], describe: (result: T) => string): string {
  const lines = [
    "A retro note raised the following point. Which of these are genuinely relevant examples of it?",
    "Respond with only the relevant candidate numbers below, comma separated, in order of relevance. Respond with none if no result is relevant.",
    "",
    `Retro note: ${item}`,
    "",
    "Candidates:",
  ];
  results.forEach((result, index) => {
    lines.push(`${index + 1}: ${describe(result)}`);
  });
  return lines.join("\n");
}

function parseRelevantIndexes(completion: string): number[] {
  return completion
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((number) => Number.isInteger(number));
}

async function filterRelevantResults<T>(
  item: string,
  results: T[],
  llmClient: LlmClient | undefined,
  describe: (result: T) => string,
): Promise<T[]> {
  if (!llmClient || results.length === 0) {
    return results;
  }
  try {
    const completion = await llmClient.complete(buildRelevanceFilterPrompt(item, results, describe));
    const relevantIndexes = parseRelevantIndexes(completion);
    if (relevantIndexes.length === 0) {
      return results;
    }
    return relevantIndexes
      .map((oneBasedIndex) => results[oneBasedIndex - 1])
      .filter((result): result is T => Boolean(result));
  } catch {
    return results;
  }
}

function describeCodeResult(result: GitHubCodeSearchResult): string {
  return `${result.repository} ${result.path}`;
}

function describeCommitResult(result: GitHubCommitSearchResult): string {
  return `${result.repository} ${result.message.split("\n")[0]}`;
}

interface SafeSearchOutcome<T> {
  results: T[];
  note?: string;
}

async function searchSafely<T>(
  search: () => Promise<T[]>,
  item: string,
  warnMessage: string,
): Promise<SafeSearchOutcome<T>> {
  try {
    return { results: await search() };
  } catch (error) {
    if (error instanceof GitHubSearchIncompleteError) {
      logger.warn(`${warnMessage} — index still building, could not be checked`, {
        item,
        error: String(error),
      });
      return { results: [], note: INDEX_BUILDING_NOTE };
    }
    logger.warn(`${warnMessage}, continuing without results`, {
      item,
      error: String(error),
    });
    return { results: [] };
  }
}

export async function findGithubExamples(
  client: GitHubClient,
  items: string[],
  options: FindGithubExamplesOptions = {},
): Promise<GithubExampleGroup[]> {
  const groups: GithubExampleGroup[] = [];

  for (const item of items) {
    const query = await buildSearchQuery(item, options.llmClient);

    const codeOutcome = await searchSafely(
      () => client.searchCode(query, options.owner, options.repo),
      item,
      "GitHub code search failed for retro item",
    );
    const relevantExamples = codeOutcome.note
      ? codeOutcome.results
      : await filterRelevantResults(item, codeOutcome.results, options.llmClient, describeCodeResult);

    const commitOutcome = await searchSafely(
      () => client.searchCommits(query, options.owner, options.repo),
      item,
      "GitHub commit search failed for retro item",
    );
    const relevantCommits = commitOutcome.note
      ? commitOutcome.results
      : await filterRelevantResults(item, commitOutcome.results, options.llmClient, describeCommitResult);

    const note = codeOutcome.note ?? commitOutcome.note;
    groups.push({
      item,
      examples: relevantExamples.slice(0, MAX_EXAMPLES_PER_ITEM),
      commits: relevantCommits.slice(0, MAX_COMMITS_PER_ITEM),
      ...(note ? { note } : {}),
    });
  }

  return groups;
}

export function formatGithubExamples(groups: GithubExampleGroup[]): string {
  const groupsToShow = groups.filter((group) => group.examples.length > 0 || group.commits.length > 0 || group.note);
  if (groupsToShow.length === 0) {
    return "";
  }

  const lines = ["GitHub examples"];
  for (const group of groupsToShow) {
    lines.push(`${group.item}:`);
    if (group.note) {
      lines.push(`- ${group.note}`);
    }
    for (const example of group.examples) {
      lines.push(`- ${example.repository} ${example.path} — ${example.url}`);
    }
    if (group.commits.length > 0) {
      lines.push("Relevant commits:");
      for (const commit of group.commits) {
        lines.push(`- ${commit.repository} ${commit.sha} ${commit.message.split("\n")[0]} — ${commit.url}`);
      }
    }
  }

  return lines.join("\n");
}
