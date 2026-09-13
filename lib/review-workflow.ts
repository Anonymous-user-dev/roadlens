export const workflowStatuses = ["verified", "scheduled", "repairing", "repaired"] as const;
export type ReviewedStatus = typeof workflowStatuses[number];

const transitions: Partial<Record<ReviewedStatus, ReviewedStatus>> = {
  verified: "scheduled",
  scheduled: "repairing",
  repairing: "repaired",
};

export function isReviewedStatus(value: unknown): value is ReviewedStatus {
  return typeof value === "string" && workflowStatuses.includes(value as ReviewedStatus);
}

export function nextReviewedStatus(current: string) {
  return transitions[current as ReviewedStatus] ?? null;
}
