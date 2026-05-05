import { Router, type IRouter } from "express";
import { ExportTddBody } from "@workspace/api-zod";
import { and, desc, eq } from "drizzle-orm";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import { uploadBufferBlob } from "../../lib/blob-storage";

const router: IRouter = Router();

interface TddPersistenceContext {
  db: typeof import("@workspace/db").db;
  tddSubmissionsTable: typeof import("@workspace/db").tddSubmissionsTable;
}

async function loadTddPersistenceContext(): Promise<TddPersistenceContext | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  try {
    const dbModule = await import("@workspace/db");
    return {
      db: dbModule.db,
      tddSubmissionsTable: dbModule.tddSubmissionsTable,
    };
  } catch {
    return null;
  }
}

function sanitizeBlobSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function findSubmissionIdForExport(
  context: TddPersistenceContext,
  applicationName: string,
  content: string,
): Promise<number | null> {
  const exactRows = await context.db
    .select({ id: context.tddSubmissionsTable.id })
    .from(context.tddSubmissionsTable)
    .where(
      and(
        eq(context.tddSubmissionsTable.applicationName, applicationName),
        eq(context.tddSubmissionsTable.generatedContent, content),
      ),
    )
    .orderBy(desc(context.tddSubmissionsTable.id))
    .limit(1);

  const exactMatchId = exactRows.at(0)?.id ?? null;
  if (exactMatchId !== null) {
    return exactMatchId;
  }

  // Fallback: content can differ slightly between preview and persisted markdown
  // due to client-side normalization. In that case, bind export to the latest
  // completed submission for the same application.
  const latestCompletedRows = await context.db
    .select({ id: context.tddSubmissionsTable.id })
    .from(context.tddSubmissionsTable)
    .where(
      and(
        eq(context.tddSubmissionsTable.applicationName, applicationName),
        eq(context.tddSubmissionsTable.status, "completed"),
      ),
    )
    .orderBy(desc(context.tddSubmissionsTable.id))
    .limit(1);

  return latestCompletedRows.at(0)?.id ?? null;
}

async function updateSubmissionBlobPath(
  context: TddPersistenceContext,
  submissionId: number,
  format: "docx" | "pdf",
  blobPath: string,
): Promise<void> {
  const updateValues =
    format === "docx"
      ? {
          blobPathDocx: blobPath,
          storageProvider: "azure_blob",
          updatedAt: new Date(),
        }
      : {
          blobPathPdf: blobPath,
          storageProvider: "azure_blob",
          updatedAt: new Date(),
        };

  await context.db
    .update(context.tddSubmissionsTable)
    .set(updateValues)
    .where(eq(context.tddSubmissionsTable.id, submissionId));
}

function parseMarkdownToDocx(markdown: string, appName: string): Document {
  const lines = markdown.split("\n");
  const children: (Paragraph | Table)[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check for table
    if (line.startsWith("|") && i + 1 < lines.length && lines[i + 1].match(/^\|[\s\-|]+\|$/)) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!lines[i].match(/^\|[\s\-|]+\|$/)) {
          tableLines.push(lines[i]);
        }
        i++;
      }

      if (tableLines.length > 0) {
        const tableRows = tableLines.map((rowLine, rowIdx) => {
          const cells = rowLine
            .split("|")
            .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
            .map(cell => cell.trim());

          return new TableRow({
            tableHeader: rowIdx === 0,
            children: cells.map(cell =>
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({
                    text: cell,
                    bold: rowIdx === 0,
                    size: 18,
                    font: "Calibri",
                  })],
                })],
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1 },
                  bottom: { style: BorderStyle.SINGLE, size: 1 },
                  left: { style: BorderStyle.SINGLE, size: 1 },
                  right: { style: BorderStyle.SINGLE, size: 1 },
                },
                shading: rowIdx === 0 ? { fill: "1F4E79", type: "clear" } : undefined,
                width: { size: Math.floor(9000 / cells.length), type: WidthType.DXA },
              })
            ),
          });
        });

        children.push(new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        }));
      }
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      children.push(new Paragraph({
        text: line.replace(/^# /, ""),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }));
    } else if (line.startsWith("## ")) {
      children.push(new Paragraph({
        text: line.replace(/^## /, ""),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
      }));
    } else if (line.startsWith("### ")) {
      children.push(new Paragraph({
        text: line.replace(/^### /, ""),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 100 },
      }));
    } else if (line.startsWith("#### ")) {
      children.push(new Paragraph({
        text: line.replace(/^#### /, ""),
        heading: HeadingLevel.HEADING_4,
        spacing: { before: 160, after: 80 },
      }));
    } else if (line.match(/^[-*] /)) {
      // Bullet
      const text = line.replace(/^[-*] /, "");
      const runs: TextRun[] = parseInlineText(text);
      children.push(new Paragraph({
        bullet: { level: 0 },
        children: runs,
        spacing: { before: 40, after: 40 },
      }));
    } else if (line === "---") {
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1 } },
        spacing: { before: 200, after: 200 },
        children: [],
      }));
    } else if (line.trim() === "") {
      children.push(new Paragraph({ children: [], spacing: { before: 60, after: 60 } }));
    } else {
      const runs = parseInlineText(line);
      children.push(new Paragraph({
        children: runs,
        spacing: { before: 60, after: 60 },
      }));
    }

    i++;
  }

  return new Document({
    creator: "Azure TDD Generator",
    title: `Azure TDD - ${appName}`,
    description: `Technical Design Document for ${appName}`,
    styles: {
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          run: { size: 32, bold: true, color: "1F4E79", font: "Calibri Light" },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          run: { size: 26, bold: true, color: "2E74B5", font: "Calibri Light" },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          run: { size: 22, bold: true, color: "2E74B5", font: "Calibri" },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children,
      },
    ],
  });
}

function parseInlineText(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const boldPattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index), size: 20, font: "Calibri" }));
    }
    runs.push(new TextRun({ text: match[1], bold: true, size: 20, font: "Calibri" }));
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex), size: 20, font: "Calibri" }));
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, size: 20, font: "Calibri" }));
  }

  return runs;
}

router.post("/export", async (req, res) => {
  const parseResult = ExportTddBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { content, format, applicationName } = parseResult.data;

  try {
    const persistence = await loadTddPersistenceContext();
    const submissionId = persistence
      ? await findSubmissionIdForExport(persistence, applicationName, content)
      : null;

    if (format === "docx") {
      const doc = parseMarkdownToDocx(content, applicationName);
      const buffer = await Packer.toBuffer(doc);
      const base64 = buffer.toString("base64");
      const fileName = `TDD_${applicationName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.docx`;
      let blobPath: string | null = null;

      const trackingKey =
        submissionId !== null
          ? String(submissionId)
          : `untracked-${Date.now()}-${sanitizeBlobSegment(applicationName)}`;
      const uploadResult = await uploadBufferBlob(
        `tdd/${trackingKey}/${fileName}`,
        buffer,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );

      if (uploadResult) {
        blobPath = uploadResult.blobPath;
      }

      if (persistence && submissionId !== null && blobPath) {
        try {
          await updateSubmissionBlobPath(persistence, submissionId, "docx", blobPath);
        } catch (error) {
          req.log.error(
            { error, submissionId, blobPath },
            "Failed to persist DOCX blob path for submission",
          );
        }
      }

      res.json({
        fileBase64: base64,
        fileName,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        submissionId,
        blobPath,
      });
    } else {
      // PDF: Generate a simple HTML → convert to plain text then base64
      // Using a simple text representation since pdf-lib is for creating PDFs
      const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const pageWidth = 612;
      const pageHeight = 792;
      const margin = 72;
      const lineHeight = 14;
      const maxWidth = pageWidth - 2 * margin;

      let page = pdfDoc.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin;

      const lines = content.split("\n");

      const drawText = (text: string, size: number, isBold: boolean, color = rgb(0, 0, 0)) => {
        const f = isBold ? boldFont : font;
        const words = text.split(" ");
        let currentLine = "";

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const testWidth = f.widthOfTextAtSize(testLine, size);

          if (testWidth > maxWidth && currentLine) {
            if (y < margin + lineHeight) {
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              y = pageHeight - margin;
            }
            page.drawText(currentLine, { x: margin, y, size, font: f, color });
            y -= lineHeight;
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }

        if (currentLine) {
          if (y < margin + lineHeight) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
          }
          page.drawText(currentLine, { x: margin, y, size, font: f, color });
          y -= lineHeight;
        }
      };

      for (const line of lines) {
        if (line.startsWith("# ")) {
          y -= 8;
          drawText(line.replace(/^# /, ""), 18, true, rgb(0.12, 0.31, 0.49));
          y -= 6;
        } else if (line.startsWith("## ")) {
          y -= 6;
          drawText(line.replace(/^## /, ""), 14, true, rgb(0.18, 0.45, 0.71));
          y -= 4;
        } else if (line.startsWith("### ")) {
          y -= 4;
          drawText(line.replace(/^### /, ""), 12, true, rgb(0.18, 0.45, 0.71));
          y -= 2;
        } else if (line.startsWith("---")) {
          y -= 8;
        } else if (line.trim() === "") {
          y -= lineHeight / 2;
        } else if (line.match(/^[-*] /)) {
          drawText("  • " + line.replace(/^[-*] /, "").replace(/\*\*/g, ""), 10, false);
        } else if (line.startsWith("|")) {
          drawText(line.replace(/\|/g, " | ").replace(/\*\*/g, ""), 9, false);
        } else {
          drawText(line.replace(/\*\*/g, ""), 10, false);
        }
      }

      const pdfBytes = await pdfDoc.save();
      const base64 = Buffer.from(pdfBytes).toString("base64");
      const fileName = `TDD_${applicationName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
      let blobPath: string | null = null;

      const trackingKey =
        submissionId !== null
          ? String(submissionId)
          : `untracked-${Date.now()}-${sanitizeBlobSegment(applicationName)}`;
      const uploadResult = await uploadBufferBlob(
        `tdd/${trackingKey}/${fileName}`,
        Buffer.from(pdfBytes),
        "application/pdf",
      );

      if (uploadResult) {
        blobPath = uploadResult.blobPath;
      }

      if (persistence && submissionId !== null && blobPath) {
        try {
          await updateSubmissionBlobPath(persistence, submissionId, "pdf", blobPath);
        } catch (error) {
          req.log.error(
            { error, submissionId, blobPath },
            "Failed to persist PDF blob path for submission",
          );
        }
      }

      res.json({
        fileBase64: base64,
        fileName,
        mimeType: "application/pdf",
        submissionId,
        blobPath,
      });
    }
  } catch (err) {
    req.log.error({ err }, "Error exporting TDD");
    res.status(500).json({ error: "Failed to export document" });
  }
});

export default router;
