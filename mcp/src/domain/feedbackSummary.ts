import type { FeedbackEntry } from "../clients/feedbackStore.js";

export interface FeedbackComment {
  rating: number;
  comment: string;
  recordedAt: string;
}

export interface FeedbackSummary {
  totalCount: number;
  averageRating: number | null;
  recentComments: FeedbackComment[];
}

const MAX_RECENT_COMMENTS = 5;

function hasComment(entry: FeedbackEntry): entry is FeedbackEntry & { comment: string } {
  return typeof entry.comment === "string" && entry.comment.trim().length > 0;
}

export function buildFeedbackSummary(entries: FeedbackEntry[]): FeedbackSummary {
  if (entries.length === 0) {
    return { totalCount: 0, averageRating: null, recentComments: [] };
  }

  const totalRating = entries.reduce((sum, entry) => sum + entry.rating, 0);
  const recentComments = entries
    .filter(hasComment)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, MAX_RECENT_COMMENTS)
    .map((entry) => ({ rating: entry.rating, comment: entry.comment, recordedAt: entry.recordedAt }));

  return {
    totalCount: entries.length,
    averageRating: totalRating / entries.length,
    recentComments,
  };
}

export function formatFeedbackSummary(summary: FeedbackSummary): string {
  if (summary.totalCount === 0 || summary.averageRating === null) {
    return "No feedback recorded yet.";
  }

  const lines = [
    `Retro-Bot feedback: ${summary.averageRating.toFixed(1)}/5 average from ${summary.totalCount} ratings`,
  ];

  if (summary.recentComments.length > 0) {
    lines.push("", "Recent comments");
    lines.push(...summary.recentComments.map((entry) => `- ${entry.rating}/5: ${entry.comment}`));
  }

  return lines.join("\n");
}
