import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const portalSettingsTable = pgTable("portal_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PortalSetting = typeof portalSettingsTable.$inferSelect;
