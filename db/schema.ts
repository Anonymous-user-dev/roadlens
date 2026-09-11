import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const roadReports = sqliteTable("road_reports", {
  id: text("id").primaryKey(),
  street: text("street").notNull(),
  detail: text("detail").notNull(),
  severity: text("severity").notNull(),
  confidence: real("confidence"),
  confirmations: integer("confirmations").notNull().default(1),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  imageKey: text("image_key"),
  status: text("status").notNull().default("pending_review"),
  createdAt: text("created_at").notNull(),
});
