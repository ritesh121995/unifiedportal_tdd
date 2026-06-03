import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cabSubmissionsTable = pgTable("tdd_submissions", {
  id: serial("id").primaryKey(),
  applicationName: text("application_name").notNull(),
  organization: text("organization").notNull(),
  lineOfBusiness: text("line_of_business").notNull(),
  requestorEmail: text("requestor_email").notNull(),
  environments: text("environments").array().notNull(),
  formData: jsonb("form_data").notNull(),
  generatedContent: text("generated_content"),
  blobPathMarkdown: text("blob_path_markdown"),
  blobPathDocx: text("blob_path_docx"),
  blobPathPdf: text("blob_path_pdf"),
  storageProvider: text("storage_provider").notNull().default("postgresql"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCabSubmissionSchema = createInsertSchema(cabSubmissionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCabSubmission = z.infer<typeof insertCabSubmissionSchema>;
export type CabSubmission = typeof cabSubmissionsTable.$inferSelect;
