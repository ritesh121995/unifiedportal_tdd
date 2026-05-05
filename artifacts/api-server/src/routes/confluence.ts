import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { marked } from "marked";

const router = Router();

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.execute(sql`SELECT value FROM portal_settings WHERE key = ${key} LIMIT 1`);
  const row = rows.rows[0] as Record<string, string> | undefined;
  return row?.value ?? null;
}

function mdToConfluenceHtml(markdown: string): string {
  const html = marked.parse(markdown, { async: false }) as string;
  return html;
}

router.post("/publish", authenticate, async (req, res) => {
  try {
    const { title, markdownContent, spaceKey: bodySpaceKey, parentPageId: bodyParentPageId } = req.body as {
      title: string;
      markdownContent: string;
      spaceKey?: string;
      parentPageId?: string;
    };

    if (!title || !markdownContent) {
      res.status(400).json({ error: "title and markdownContent are required" });
      return;
    }

    const confluenceUrl = await getSetting("confluence_url");
    const confluenceEmail = await getSetting("confluence_email");
    const confluenceToken = await getSetting("confluence_api_token");
    const spaceKey = bodySpaceKey ?? (await getSetting("confluence_space_key"));
    const parentPageId = bodyParentPageId ?? (await getSetting("confluence_parent_page_id"));

    if (!confluenceUrl || !confluenceEmail || !confluenceToken || !spaceKey) {
      res.status(400).json({
        error: "Confluence is not fully configured. Go to Integrations → Confluence and fill in URL, email, API token, and space key.",
      });
      return;
    }

    const htmlBody = mdToConfluenceHtml(markdownContent);

    const pageBody: Record<string, unknown> = {
      type: "page",
      title,
      space: { key: spaceKey },
      body: {
        storage: {
          value: htmlBody,
          representation: "storage",
        },
      },
    };

    if (parentPageId) {
      pageBody.ancestors = [{ id: parentPageId }];
    }

    const base64Auth = Buffer.from(`${confluenceEmail}:${confluenceToken}`).toString("base64");
    const apiBase = confluenceUrl.replace(/\/$/, "");

    const response = await fetch(`${apiBase}/wiki/rest/api/content`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${base64Auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(pageBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error({ status: response.status, errText }, "Confluence API error");
      res.status(502).json({
        error: `Confluence returned ${response.status}: ${errText.slice(0, 200)}`,
      });
      return;
    }

    const data = (await response.json()) as Record<string, unknown>;
    const pageId = data.id as string;
    const pageUrl = `${apiBase}/wiki/pages/${pageId}`;

    res.json({ success: true, pageId, pageUrl, title });
  } catch (err) {
    logger.error({ err }, "Failed to publish to Confluence");
    res.status(500).json({ error: "Failed to publish to Confluence" });
  }
});

router.post("/test", authenticate, async (_req, res) => {
  try {
    const confluenceUrl = await getSetting("confluence_url");
    const confluenceEmail = await getSetting("confluence_email");
    const confluenceToken = await getSetting("confluence_api_token");

    if (!confluenceUrl || !confluenceEmail || !confluenceToken) {
      res.status(400).json({ ok: false, error: "Confluence credentials not configured" });
      return;
    }

    const base64Auth = Buffer.from(`${confluenceEmail}:${confluenceToken}`).toString("base64");
    const apiBase = confluenceUrl.replace(/\/$/, "");

    const response = await fetch(`${apiBase}/wiki/rest/api/space?limit=1`, {
      headers: { Authorization: `Basic ${base64Auth}`, Accept: "application/json" },
    });

    if (!response.ok) {
      res.json({ ok: false, error: `Confluence returned HTTP ${response.status}` });
      return;
    }

    const data = (await response.json()) as { results?: unknown[] };
    res.json({ ok: true, spacesVisible: data.results?.length ?? 0 });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : "Connection failed" });
  }
});

export default router;
