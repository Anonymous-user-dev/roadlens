import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const roadReports = sqliteTable("road_reports", {
  id: text("id").primaryKey(),
  street: text("street").notNull(),
  detail: text("detail").notNull(),
  severity: text("severity").notNull(),
  confidence: real("confidence"),
  confirmations: integer("confirmations").notNull().default(1),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  locationAccuracy: real("location_accuracy"),
  locationSource: text("location_source").notNull().default("approximate"),
  defectType: text("defect_type"),
  aiExplanation: text("ai_explanation"),
  duplicateOf: text("duplicate_of"),
  imageKey: text("image_key"),
  status: text("status").notNull().default("pending_review"),
  reviewerNote: text("reviewer_note"),
  reviewedAt: text("reviewed_at"),
  updatedAt: text("updated_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_road_reports_status_created").on(table.status, table.createdAt),
  index("idx_road_reports_duplicate_of").on(table.duplicateOf),
]);

export const submissionRateLimits = sqliteTable("submission_rate_limits", {
  fingerprint: text("fingerprint").primaryKey(),
  requestCount: integer("request_count").notNull().default(1),
  expiresAt: text("expires_at").notNull(),
}, (table) => [index("idx_submission_rate_limits_expires").on(table.expiresAt)]);
