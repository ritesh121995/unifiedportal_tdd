import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const requestEventsTable = pgTable("request_events", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  actorName: text("actor_name").notNull(),
  actorRole: text("actor_role").notNull(),
  eventType: text("event_type").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type RequestEvent = typeof requestEventsTable.$inferSelect;
