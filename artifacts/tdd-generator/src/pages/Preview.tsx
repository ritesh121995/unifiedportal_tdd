import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useAppContext, type FormDraft } from "@/store/app-context";
import { useExportTdd, type TddExportResponse } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileDown,
  ArrowLeft,
  Loader2,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  ClipboardCheck,
  CheckCircle2,
  Pencil,
  Eye,
  Code2,
  Copy,
  Check,
  Download,
  FlaskConical,
  Cloud,
  BookOpen,
  ExternalLink,
  Terminal,
  Rocket,
  XCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MermaidDiagram from "@/components/MermaidDiagram";
import { getApiBase } from "@/lib/api-base";
import AzureServiceSelector, { detectServicesFromTdd } from "@/components/AzureServiceSelector";
import { generateMultiServiceTerraform } from "@/lib/terraformGenerator";

interface SseChunkPayload {
  content?: string;
  done?: boolean;
  fullContent?: string;
  error?: string;
  markdownBlobUploadError?: string | null;
  rebuiltSections?: string[];
}

interface SectionRegenerateResponse {
  sectionTitle: string;
  regenerated: string;
}

interface IacDeployment {
  id: number;
  status: "pending" | "provisioning" | "succeeded" | "failed";
  resource_group: string;
  app_name: string;
  region: string;
  resources?: Record<string, string>;
  log?: string;
  error?: string;
  started_at: string;
  completed_at?: string;
}

const TDD_SECTION_HEADINGS = [
  "1. Executive Summary",
  "2. Ownership, Stakeholders & Billing Context",
  "3. Workload Context & Classification",
  "4. Current State Architecture (As-Is)",
  "5. Platform Components (Infrastructure View)",
  "6. Proposed Target State Architecture (To-Be)",
  "7. Target Solution Detailed Design Components",
  "8. Deployment Architecture",
] as const;

function escapeForRegex(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractHeadingOptions(markdown: string): string[] {
  const matched = markdown.match(/^##\s+(.+)$/gm);
  if (!matched || matched.length === 0) {
    return [...TDD_SECTION_HEADINGS];
  }

  return matched.map((line) => line.replace(/^##\s+/, "").trim());
}

function stripRenderBreakingArtifacts(markdown: string): string {
  return markdown
    .replaceAll(
      /^.*\(The rest of sections follows similar level detail as initially outlined, ending with Deployment Sequence\.\).*$/gim,
      "",
    )
    .replaceAll(
      /^.*full document will continue.*$/gim,
      "",
    )
    .replaceAll(
      /^.*contact for more details and final implementation steps.*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[See full detailed components as outlined previously in each subsection of Section 7\.\]\s*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[Deployment sequence, naming conventions, and promotion paths as outlined previously in Section 8\.\]\s*$/gim,
      "",
    )
    .replaceAll(
      /^.*syntax error in text.*$/gim,
      "",
    )
    .replaceAll(
      /^.*mermaid version\s+\d+\.\d+\.\d+.*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[Continue generating sections?\s+\d.*?\].*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[continue.*?template structure.*?\].*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[.*?sections?\s+\d+\s+through\s+\d+.*?\].*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[.*?following the (provided|same) template.*?\].*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[.*?generate.*?section[s]?\s+\d.*?\].*$/gim,
      "",
    )
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

function safeParseSectionRegenerateResponse(
  value: unknown,
): SectionRegenerateResponse | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const sectionTitle = Reflect.get(value, "sectionTitle");
  const regenerated = Reflect.get(value, "regenerated");

  if (
    typeof sectionTitle !== "string" ||
    typeof regenerated !== "string"
  ) {
    return null;
  }

  return {
    sectionTitle,
    regenerated,
  };
}

function replaceSectionContent(
  fullDocument: string,
  sectionHeading: string,
  newSectionBody: string,
): string {
  const escapedHeading = escapeForRegex(sectionHeading);
  const sectionRegex = new RegExp(
    `(^##\\s+${escapedHeading}\\s*$)([\\s\\S]*?)(?=^##\\s+|\\Z)`,
    "m",
  );
  const replacementBody = `\n\n${newSectionBody.trim()}\n\n`;

  return fullDocument.replace(
    sectionRegex,
    (_match, headingLine: string) => `${headingLine}${replacementBody}`,
  );
}

function isSseChunkPayload(value: unknown): value is SseChunkPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const contentValue = Reflect.get(value, "content");
  const doneValue = Reflect.get(value, "done");
  const fullContentValue = Reflect.get(value, "fullContent");
  const errorValue = Reflect.get(value, "error");
  const markdownBlobUploadErrorValue = Reflect.get(value, "markdownBlobUploadError");
  const rebuiltSectionsValue = Reflect.get(value, "rebuiltSections");

  return (
    (contentValue === undefined || typeof contentValue === "string") &&
    (doneValue === undefined || typeof doneValue === "boolean") &&
    (fullContentValue === undefined || typeof fullContentValue === "string") &&
    (errorValue === undefined || typeof errorValue === "string") &&
    (markdownBlobUploadErrorValue === undefined ||
      markdownBlobUploadErrorValue === null ||
      typeof markdownBlobUploadErrorValue === "string") &&
    (rebuiltSectionsValue === undefined || Array.isArray(rebuiltSectionsValue))
  );
}

function extractSseEvents(
  streamBuffer: string,
  flushRemainder: boolean,
): { events: string[]; remainder: string } {
  const normalizedBuffer = streamBuffer.replaceAll("\r\n", "\n");
  const splitEvents = normalizedBuffer.split("\n\n");
  const remainder = splitEvents.pop() ?? "";
  const events = splitEvents.filter((eventBlock) => eventBlock.trim().length > 0);

  if (flushRemainder && remainder.trim().length > 0) {
    events.push(remainder);
    return { events, remainder: "" };
  }

  return { events, remainder };
}

function parseSseChunk(eventBlock: string): SseChunkPayload | null {
  const lines = eventBlock.split("\n");

  // Skip SSE comments (lines starting with ":")
  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  // If this block only contained comments/keepalives, skip it
  if (dataLines.length === 0) {
    return null;
  }

  const jsonPayload = dataLines.join("\n");
  if (jsonPayload === "[DONE]") {
    return { done: true };
  }

  const parsed: unknown = JSON.parse(jsonPayload);
  return isSseChunkPayload(parsed) ? parsed : null;
}

function getJsonHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}


function toTddFormDataOrNull(formData: FormDraft): Record<string, unknown> | null {
  // Only block generation on fields that are structurally essential —
  // optional fields (billing, personnel, architecture details) are allowed
  // to be empty and will appear as blank cells / N/A in the TDD.
  const requiredStrings = [
    "applicationName",
    "applicationType",
    "applicationOverview",
    "organization",
    "lineOfBusiness",
    "requestorEmail",
    "networkPosture",
    "solution",
  ] as const;

  for (const key of requiredStrings) {
    const value = formData[key];
    if (typeof value !== "string" || value.length === 0) {
      return null;
    }
  }

  // Accept either the new environmentCidrs or legacy networkCidr
  const hasNetworkCidr = typeof formData.networkCidr === "string" && formData.networkCidr.length > 0;
  const hasEnvCidrs =
    formData.environmentCidrs != null &&
    typeof formData.environmentCidrs === "object" &&
    Object.keys(formData.environmentCidrs).length > 0;
  if (!hasNetworkCidr && !hasEnvCidrs) {
    return null;
  }

  if (
    !Array.isArray(formData.environmentsRequired) ||
    formData.environmentsRequired.length === 0 ||
    !formData.environmentsRequired.every((item) => typeof item === "string")
  ) {
    return null;
  }

  if (
    !Array.isArray(formData.azureRegions) ||
    formData.azureRegions.length === 0 ||
    !formData.azureRegions.every((item) => typeof item === "string")
  ) {
    return null;
  }

  return formData;
}

const REVIEW_CHECKLIST = [
  { id: "exec_summary", label: "Executive Summary reviewed and is accurate" },
  { id: "stakeholders", label: "Ownership, stakeholders & billing details confirmed" },
  { id: "workload", label: "Workload classification and tier validated" },
  { id: "architecture", label: "Proposed architecture (as-is / to-be) accurately reflects the design" },
  { id: "platform", label: "Platform components and Azure services verified" },
  { id: "networking", label: "Networking section reviewed — subnets, CIDRs, routing" },
  { id: "security", label: "Security posture and compliance controls confirmed" },
  { id: "naming", label: "Naming standards verified against McCain conventions" },
] as const;

export default function Preview() {
  const { formData, addHistoryEntry } = useAppContext();
  const [, setLocation] = useLocation();
  const [content, setContent] = useState("");
  const previewRef = useRef<HTMLElement>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string>(
    TDD_SECTION_HEADINGS[0],
  );
  const [isRegeneratingSection, setIsRegeneratingSection] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [blobWarning, setBlobWarning] = useState<string | null>(null);
  const [rebuiltSections, setRebuiltSections] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  // Review gate state
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [reviewChecked, setReviewChecked] = useState<Record<string, boolean>>({});
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewCompleting, setReviewCompleting] = useState(false);
  const [reviewCompleted, setReviewCompleted] = useState(false);

  const [iacCopied, setIacCopied] = useState(false);
  const [iacDeployOpen, setIacDeployOpen] = useState(false);
  const [iacDeployPassword, setIacDeployPassword] = useState("");
  const [iacDeployLoading, setIacDeployLoading] = useState(false);
  const [iacDeploymentId, setIacDeploymentId] = useState<number | null>(null);
  const [iacDeployment, setIacDeployment] = useState<IacDeployment | null>(null);
  const [iacDeployError, setIacDeployError] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  const [confluencePublishing, setConfluencePublishing] = useState(false);
  const [confluenceResult, setConfluenceResult] = useState<{ pageUrl: string; title: string } | null>(null);
  const [confluenceError, setConfluenceError] = useState<string | null>(null);

  const hasStartedRef = useRef(false);
  const exportMutation = useExportTdd();
  const sectionOptions = useMemo(() => extractHeadingOptions(content), [content]);

  useEffect(() => {
    if (sectionOptions.length === 0) {
      return;
    }

    if (sectionOptions.includes(selectedSection)) {
      return;
    }

    const nextSection = sectionOptions.at(0);
    if (nextSection) {
      setSelectedSection(nextSection);
    }
  }, [sectionOptions, selectedSection]);

  useEffect(() => {
    // Prevent double fetch in strict mode
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    
    if (!formData.applicationName) {
      setLocation("/dashboard");
      return;
    }

    const generateDocument = async () => {
      setIsGenerating(true);
      setError(null);
      setContent("");
      setBlobWarning(null);
      
      try {
        const payload = toTddFormDataOrNull(formData);
        if (!payload) {
          throw new Error("Form data is incomplete. Please review all required fields.");
        }

        const response = await fetch(`${getApiBase()}/api/tdd/generate`, {
          method: 'POST',
          headers: getJsonHeaders(),
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const failureBody = await response.text();
          const failureDetail =
            typeof failureBody === "string" && failureBody.trim().length > 0
              ? failureBody.slice(0, 300)
              : response.statusText;
          throw new Error(
            `Failed to generate document (${response.status}): ${failureDetail}`,
          );
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamBuffer = "";
        let aggregatedContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          streamBuffer += decoder.decode(value, { stream: true });
          const extracted = extractSseEvents(streamBuffer, false);
          streamBuffer = extracted.remainder;

          for (const eventBlock of extracted.events) {
            // SSE keepalive comments (": keepalive") produce empty blocks
            if (eventBlock.trim().startsWith(":")) {
              continue;
            }
            let parsedChunk: SseChunkPayload | null;
            try {
              parsedChunk = parseSseChunk(eventBlock);
            } catch {
              throw new Error(
                "Failed to parse generation stream from server.",
              );
            }

            if (!parsedChunk) {
              continue;
            }

            if (parsedChunk.error) {
              throw new Error(parsedChunk.error);
            }
            if (parsedChunk.markdownBlobUploadError) {
              setBlobWarning(parsedChunk.markdownBlobUploadError);
            }

            if (parsedChunk.content) {
              aggregatedContent += parsedChunk.content;
              setContent(stripRenderBreakingArtifacts(aggregatedContent));
            }

            if (parsedChunk.done && parsedChunk.fullContent) {
              aggregatedContent = parsedChunk.fullContent;
              setContent(stripRenderBreakingArtifacts(aggregatedContent));
              if (parsedChunk.rebuiltSections) {
                setRebuiltSections(parsedChunk.rebuiltSections);
              }
            }
          }
        }

        streamBuffer += decoder.decode();
        const flushed = extractSseEvents(streamBuffer, true);

        for (const eventBlock of flushed.events) {
          if (eventBlock.trim().startsWith(":")) {
            continue;
          }
          let parsedChunk: SseChunkPayload | null;
          try {
            parsedChunk = parseSseChunk(eventBlock);
          } catch {
            throw new Error("Failed to parse final generation stream data.");
          }

          if (!parsedChunk) {
            continue;
          }

          if (parsedChunk.error) {
            throw new Error(parsedChunk.error);
          }
          if (parsedChunk.markdownBlobUploadError) {
            setBlobWarning(parsedChunk.markdownBlobUploadError);
          }

          if (parsedChunk.content) {
            aggregatedContent += parsedChunk.content;
            setContent(stripRenderBreakingArtifacts(aggregatedContent));
          }

          if (parsedChunk.done && parsedChunk.fullContent) {
            aggregatedContent = parsedChunk.fullContent;
            setContent(stripRenderBreakingArtifacts(aggregatedContent));
            if (parsedChunk.rebuiltSections) {
              setRebuiltSections(parsedChunk.rebuiltSections);
            }
          }
        }

        if (aggregatedContent.length === 0) {
          throw new Error(
            "Generation finished without content. Check server logs for Azure OpenAI errors.",
          );
        }
        const finalContent = stripRenderBreakingArtifacts(aggregatedContent);
        setContent(finalContent);
        setSectionError(null);

        // Auto-detect Azure services from TDD and pre-select them
        const detected = detectServicesFromTdd(finalContent);
        if (detected.length > 0) {
          setSelectedServices(detected);
        }

        // Save to history
        addHistoryEntry({
          applicationName: formData.applicationName ?? "Untitled",
          snippet: finalContent.replace(/[#*`|>]/g, "").slice(0, 180).trim(),
          markdown: finalContent,
        });

        // If this TDD was generated from an architecture request, hold for human review
        const activeRequestId = localStorage.getItem("activeRequestId");
        if (activeRequestId) {
          setPendingRequestId(activeRequestId);
          // Do NOT remove from localStorage yet — cleared after review sign-off
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "An error occurred during generation";
        setError(message);
      } finally {
        setIsGenerating(false);
      }
    };

    generateDocument();
  }, [formData, setLocation]);

  const handleExport = (format: "docx") => {
    exportMutation.mutate({
      data: {
        content: content,
        format: format,
        applicationName: formData.applicationName || "TDD_Document"
      }
    }, {
      onSuccess: (result: TddExportResponse) => {
        const link = document.createElement('a');
        link.href = `data:${result.mimeType};base64,${result.fileBase64}`;
        link.download = result.fileName;
        link.click();
      }
    });
  };

  const handlePrintPdf = () => {
    const articleEl = previewRef.current;
    if (!articleEl) return;
    const appName = formData.applicationName || "TDD Document";
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${appName} — TDD</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Calibri, "Segoe UI", Arial, sans-serif; font-size: 11pt; color: #111; line-height: 1.5; padding: 2cm 2.5cm; }
    h1 { font-size: 22pt; margin-bottom: 6pt; }
    h2 { font-size: 16pt; margin-top: 24pt; margin-bottom: 6pt; border-bottom: 1px solid #bbb; padding-bottom: 4pt; page-break-after: avoid; }
    h3 { font-size: 13pt; margin-top: 16pt; margin-bottom: 4pt; page-break-after: avoid; }
    h4 { font-size: 11pt; margin-top: 12pt; margin-bottom: 4pt; page-break-after: avoid; }
    p  { margin-bottom: 8pt; }
    ul, ol { margin-left: 20pt; margin-bottom: 8pt; }
    li { margin-bottom: 3pt; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 12pt; font-size: 9pt; page-break-inside: avoid; }
    th { background-color: #1f4e79; color: #fff; padding: 5pt 6pt; text-align: left; font-weight: bold; }
    td { border: 1px solid #ccc; padding: 4pt 6pt; vertical-align: top; }
    tr:nth-child(even) td { background-color: #f5f8fc; }
    code { font-family: Consolas, monospace; font-size: 9pt; background: #f0f0f0; padding: 1pt 3pt; border-radius: 2pt; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 10pt; border-radius: 4pt; font-size: 8.5pt; overflow-x: auto; margin-bottom: 10pt; page-break-inside: avoid; }
    pre code { background: none; color: inherit; padding: 0; }
    blockquote { border-left: 3px solid #1f4e79; padding-left: 10pt; color: #444; margin-bottom: 8pt; }
    hr { border: none; border-top: 1px solid #ccc; margin: 16pt 0; }
    svg { max-width: 100%; height: auto; }
    @media print {
      body { padding: 0; }
      h2 { page-break-before: auto; }
      @page { margin: 1.8cm 2cm; size: A4; }
    }
  </style>
</head>
<body>
${articleEl.innerHTML}
</body>
</html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => {
      setTimeout(() => {
        win.focus();
        win.print();
      }, 300);
    };
  };

  const handleRegenerateSection = async () => {
    if (!content || isGenerating || isRegeneratingSection) {
      return;
    }

    const payload = toTddFormDataOrNull(formData);
    if (!payload) {
      setSectionError("Form data is incomplete. Please go back and review required fields.");
      return;
    }

    setIsRegeneratingSection(true);
    setSectionError(null);

    try {
      const sectionRegex = new RegExp(
        `^##\\s+${escapeForRegex(selectedSection)}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`,
        "m",
      );
      const currentSectionMatch = content.match(sectionRegex);
      if (!currentSectionMatch) {
        throw new Error("Could not locate the selected section in the document.");
      }

      const currentSectionContent = currentSectionMatch[1]?.trim() ?? "";
      if (currentSectionContent.length === 0) {
        throw new Error("Selected section is empty and cannot be regenerated.");
      }

      const response = await fetch(`${getApiBase()}/api/tdd/regenerate-section`, {
        method: "POST",
        headers: getJsonHeaders(),
        body: JSON.stringify({
          applicationName: formData.applicationName ?? "Application",
          fullDocument: content,
          sectionTitle: selectedSection,
          currentSectionContent,
        }),
      });

      const parsed = safeParseSectionRegenerateResponse(await response.json());
      if (!response.ok || !parsed) {
        throw new Error("Failed to regenerate selected section.");
      }

      const merged = replaceSectionContent(content, parsed.sectionTitle, parsed.regenerated);
      setContent(merged);
      setSelectedSection(parsed.sectionTitle);
    } catch (sectionRegenerateError: unknown) {
      const message =
        sectionRegenerateError instanceof Error
          ? sectionRegenerateError.message
          : "Failed to regenerate section.";
      setSectionError(message);
    } finally {
      setIsRegeneratingSection(false);
    }
  };

  const allReviewChecked = REVIEW_CHECKLIST.every((item) => reviewChecked[item.id]);

  const handleCompleteWithReview = async () => {
    if (!pendingRequestId || !allReviewChecked) return;
    setReviewCompleting(true);
    try {
      await fetch(`${getApiBase()}/api/requests/${pendingRequestId}/complete-tdd`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNotes: reviewNotes.trim() || null }),
      });
      localStorage.removeItem("activeRequestId");
      setPendingRequestId(null);
      setReviewCompleted(true);
    } catch {
      /* best-effort */
    } finally {
      setReviewCompleting(false);
    }
  };

  const handleDeploy = async () => {
    if (!iacDeployPassword) return;
    setIacDeployLoading(true);
    setIacDeployError(null);
    try {
      const r = await fetch(`${getApiBase()}/api/iac/deploy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName: formData.applicationName ?? "demo-app",
          region: (formData.azureRegions?.[0] ?? "canadacentral").toLowerCase().replace(/\s+/g, ""),
          adminPassword: iacDeployPassword,
        }),
      });
      const d = await r.json() as { deploymentId?: number; error?: string };
      if (!r.ok || !d.deploymentId) {
        setIacDeployError(d.error ?? "Failed to start deployment");
        return;
      }
      setIacDeploymentId(d.deploymentId);
      setIacDeployOpen(false);
    } catch {
      setIacDeployError("Could not reach the portal API. Please try again.");
    } finally {
      setIacDeployLoading(false);
    }
  };

  useEffect(() => {
    if (!iacDeploymentId) return;
    const poll = setInterval(() => {
      void fetch(`${getApiBase()}/api/iac/deploy/${iacDeploymentId}`, { credentials: "include" })
        .then((r) => r.json())
        .then((d: { deployment?: IacDeployment }) => {
          if (d.deployment) {
            setIacDeployment(d.deployment);
            if (d.deployment.status === "succeeded" || d.deployment.status === "failed") {
              clearInterval(poll);
            }
          }
        })
        .catch(() => {});
    }, 8000);
    void fetch(`${getApiBase()}/api/iac/deploy/${iacDeploymentId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { deployment?: IacDeployment }) => { if (d.deployment) setIacDeployment(d.deployment); })
      .catch(() => {});
    return () => clearInterval(poll);
  }, [iacDeploymentId]);

  const handlePublishToConfluence = async () => {
    if (!content) return;
    setConfluencePublishing(true);
    setConfluenceError(null);
    try {
      const r = await fetch(`${getApiBase()}/api/confluence/publish`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `TDD — ${formData.applicationName ?? "Application"}`,
          markdownContent: content,
        }),
      });
      const d = await r.json() as { success?: boolean; pageUrl?: string; title?: string; error?: string };
      if (!r.ok || !d.success) {
        setConfluenceError(d.error ?? "Failed to publish to Confluence");
        return;
      }
      setConfluenceResult({ pageUrl: d.pageUrl!, title: d.title! });
    } catch {
      setConfluenceError("Could not reach Confluence. Check your integration settings.");
    } finally {
      setConfluencePublishing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Technical Design Document</h2>
          <p className="text-slate-500 mt-1">
            {isGenerating
              ? "Generating..."
              : `Generated for ${formData.applicationName}`}
          </p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" onClick={() => setLocation("/dashboard")} disabled={isGenerating}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Form
          </Button>

          {/* Edit / Preview toggle */}
          {!isGenerating && content && (
            <Button
              variant={isEditing ? "default" : "outline"}
              onClick={() => setIsEditing((v) => !v)}
              className={isEditing ? "bg-amber-500 hover:bg-amber-600 text-white border-0" : ""}
            >
              {isEditing ? (
                <><Eye className="w-4 h-4 mr-2" />Preview Document</>
              ) : (
                <><Pencil className="w-4 h-4 mr-2" />Edit Document</>
              )}
            </Button>
          )}

          {!isEditing && (
            <div className="flex items-center gap-2">
              <select
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                value={selectedSection}
                onChange={(event) => {
                  setSelectedSection(event.target.value);
                }}
                disabled={isGenerating || isRegeneratingSection || !content}
              >
                {sectionOptions.map((heading) => (
                  <option key={heading} value={heading}>
                    {heading}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                onClick={() => {
                  handleRegenerateSection().catch(() => {
                    // Errors are handled inside handleRegenerateSection.
                  });
                }}
                disabled={isGenerating || isRegeneratingSection || !content}
              >
                {isRegeneratingSection ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-2" />
                )}
                Regenerate Section
              </Button>
            </div>
          )}

          
          <Button 
            variant="secondary"
            onClick={() => handleExport("docx")} 
            disabled={isGenerating || exportMutation.isPending || !content}
            className="bg-white border-slate-200 shadow-sm"
          >
            {exportMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2 text-primary" />}
            Word (.docx)
          </Button>
          
          <Button 
            onClick={handlePrintPdf}
            disabled={isGenerating || !content}
          >
            <FileDown className="w-4 h-4 mr-2" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {rebuiltSections.length > 0 && !isGenerating && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {rebuiltSections.length} section{rebuiltSections.length !== 1 ? "s" : ""} used fallback content — manual review recommended
              </p>
              <p className="text-xs text-amber-700 mt-1 mb-2">
                The AI did not produce sufficient content for these sections, so structured default content was inserted automatically. Use "Regenerate Section" to retry each one.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {rebuiltSections.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <Card className="min-h-[600px] shadow-sm border-slate-200 bg-white overflow-hidden relative">
        {isGenerating && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
            <RefreshCw className="w-8 h-8 text-primary animate-spin mb-4" />
            <p className="text-slate-700 font-medium animate-pulse">Drafting architecture document...</p>
            <p className="text-slate-400 text-sm mt-2 max-w-sm text-center">Consulting best practices and mapping Azure services to your requirements.</p>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 bg-red-50 z-10 flex flex-col items-center justify-center p-8">
            <p className="text-red-600 font-medium mb-4 text-center">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
          </div>
        )}

        {sectionError && (
          <div className="absolute bottom-4 left-4 right-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            {sectionError}
          </div>
        )}
        {!sectionError && blobWarning && (
          <div className="absolute bottom-4 left-4 right-4 rounded border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700">
            {blobWarning}
          </div>
        )}

        <CardContent className="p-0">
          {isEditing ? (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200">
                <Pencil className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-xs text-amber-700 font-medium">Editing raw Markdown — changes apply immediately. Click "Preview Document" to see the rendered result.</span>
              </div>
              <textarea
                className="w-full font-mono text-sm text-slate-800 bg-white p-6 focus:outline-none resize-none leading-relaxed"
                style={{ minHeight: "600px" }}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="p-8 md:p-12">
              <article ref={previewRef} className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-headings:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-h2:border-b prose-h2:pb-2 prose-h2:mt-10 prose-h3:text-xl prose-a:text-primary hover:prose-a:text-primary/80 prose-code:text-primary prose-code:bg-primary/5 prose-code:px-1 prose-code:rounded prose-pre:bg-slate-900 prose-pre:text-slate-50">
                {content ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const lang = /language-(\w+)/.exec(className ?? "")?.[1];
                        const normalizedLang = lang?.toLowerCase();
                        const code = String(children).replace(/\n$/, "");
                        if (normalizedLang === "mermaid") {
                          return <MermaidDiagram code={code} />;
                        }
                        return (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {content}
                  </ReactMarkdown>
                ) : (
                  <div className="text-slate-300 italic h-full flex items-center justify-center py-20">
                    Document content will appear here...
                  </div>
                )}
              </article>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Review Gate ─────────────────────────────────────────────────── */}
      {pendingRequestId && !isGenerating && !reviewCompleted && (
        <Card className="border-2 border-yellow-300 shadow-lg">
          <div className="px-6 py-4 border-b border-yellow-200 flex items-center gap-3 flex-wrap" style={{ background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "#FFCD00" }}>
              <ClipboardCheck className="w-5 h-5 text-[#1a1a2e]" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-900 text-base">Cloud Architect Review Sign-off</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Use <span className="font-semibold text-amber-700">"Edit Document"</span> above to make changes before signing off. Confirm all items below when ready.
              </p>
            </div>
            <div className="text-sm font-medium text-slate-600 shrink-0">
              {Object.values(reviewChecked).filter(Boolean).length} / {REVIEW_CHECKLIST.length} confirmed
            </div>
          </div>

          <CardContent className="p-6 space-y-5">
            {/* Checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {REVIEW_CHECKLIST.map((item) => (
                <label
                  key={item.id}
                  htmlFor={`chk-${item.id}`}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors select-none ${
                    reviewChecked[item.id]
                      ? "bg-green-50 border-green-200"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <Checkbox
                    id={`chk-${item.id}`}
                    checked={!!reviewChecked[item.id]}
                    onCheckedChange={(checked) =>
                      setReviewChecked((prev) => ({ ...prev, [item.id]: !!checked }))
                    }
                    className="mt-0.5 shrink-0"
                  />
                  <span className={`text-sm leading-snug ${reviewChecked[item.id] ? "text-green-800 line-through decoration-green-400 decoration-1" : "text-slate-700"}`}>
                    {item.label}
                  </span>
                </label>
              ))}
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${(Object.values(reviewChecked).filter(Boolean).length / REVIEW_CHECKLIST.length) * 100}%`,
                  background: allReviewChecked ? "#16a34a" : "#FFCD00",
                }}
              />
            </div>

            {/* Review Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="reviewNotes" className="text-sm font-medium text-slate-700">
                Review Notes <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <Textarea
                id="reviewNotes"
                placeholder="Add any observations, exceptions, or conditions noted during review…"
                rows={3}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="resize-none"
              />
            </div>

            {/* Submit + Confluence publish */}
            <div className="flex items-center justify-between pt-1 gap-3 flex-wrap">
              {!allReviewChecked && (
                <p className="text-xs text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Complete all {REVIEW_CHECKLIST.length} checklist items to enable sign-off
                </p>
              )}
              <div className="ml-auto flex items-center gap-3 flex-wrap">
                <Button
                  variant="outline"
                  disabled={confluencePublishing || !content}
                  onClick={() => void handlePublishToConfluence()}
                  className="gap-2 border-[#0052CC] text-[#0052CC] hover:bg-blue-50"
                >
                  {confluencePublishing
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <BookOpen className="w-4 h-4" />}
                  {confluencePublishing ? "Publishing…" : "Publish to Confluence"}
                </Button>
                <Button
                  disabled={!allReviewChecked || reviewCompleting}
                  onClick={() => void handleCompleteWithReview()}
                  className="font-semibold px-6"
                  style={allReviewChecked ? { background: "#FFCD00", color: "#1a1a2e" } : {}}
                >
                  {reviewCompleting
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                    : <><ClipboardCheck className="w-4 h-4 mr-2" />Mark TDD as Complete</>
                  }
                </Button>
              </div>
            </div>

            {/* Confluence result / error */}
            {confluenceResult && (
              <div className="flex items-center gap-2.5 rounded-lg border border-[#0052CC]/30 bg-blue-50 px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-[#0052CC] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0052CC]">Published to Confluence</p>
                  <p className="text-xs text-blue-700 mt-0.5 truncate">{confluenceResult.title}</p>
                </div>
                <a
                  href={confluenceResult.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#0052CC] font-medium hover:underline shrink-0"
                >
                  Open page <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {confluenceError && (
              <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Confluence publish failed</p>
                  <p className="mt-0.5">{confluenceError}</p>
                  <p className="mt-1 text-red-500">
                    Check your credentials in <strong>Integrations → Confluence</strong> and ensure the space key and parent page ID are correct.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Review Completed Banner ─────────────────────────────────────── */}
      {reviewCompleted && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-4">
              <CheckCircle2 className="w-8 h-8 text-green-600 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-green-800">TDD Signed Off &amp; Complete</p>
                <p className="text-sm text-green-700 mt-0.5">
                  This Technical Design Document has been reviewed and marked as complete. It is now visible to all stakeholders on the request.
                </p>
              </div>
              <Button variant="outline" onClick={() => setLocation("/requests")} className="shrink-0 border-green-300 text-green-700 hover:bg-green-100">
                Back to Requests
              </Button>
            </div>

            {/* Confluence publish from completed banner */}
            <div className="border-t border-green-200 pt-3 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-green-700 flex-1">
                <BookOpen className="w-4 h-4 text-[#0052CC]" />
                <span>Publish this TDD to your Confluence space for wider visibility</span>
              </div>
              {confluenceResult ? (
                <a
                  href={confluenceResult.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0052CC] hover:underline"
                >
                  <CheckCircle2 className="w-4 h-4" />View on Confluence <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={confluencePublishing || !content}
                  onClick={() => void handlePublishToConfluence()}
                  className="gap-2 border-[#0052CC] text-[#0052CC] hover:bg-blue-50 shrink-0"
                >
                  {confluencePublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                  {confluencePublishing ? "Publishing…" : "Publish to Confluence"}
                </Button>
              )}
              {confluenceError && (
                <p className="text-xs text-red-600 w-full">{confluenceError} — check settings in Integrations.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Azure Service Selector ───────────────────────────────────────── */}
      {/* Shown only after "Mark TDD as Complete" (when coming from a request),
          or immediately after generation when there is no pending request. */}
      {content && !isGenerating && (!pendingRequestId || reviewCompleted) && (
        <Card className="border border-blue-200 shadow-sm overflow-hidden">
          <CardHeader className="pb-0 pt-5 px-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#0078d4" }}>
                <Cloud className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Select Azure Services for IaC
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Services are auto-detected from your TDD. Adjust the selection — Terraform code and deployment will reflect your choices.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-4">
            <AzureServiceSelector
              tddContent={content}
              selectedIds={selectedServices}
              onChange={setSelectedServices}
            />
          </CardContent>
        </Card>
      )}

      {/* ─── Demo IaC — Terraform ────────────────────────────────────────── */}
      {content && !isGenerating && (!pendingRequestId || reviewCompleted) && (
        <Card className="border border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="pb-0 pt-5 px-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#1a1a2e" }}>
                  <Code2 className="w-5 h-5 text-[#FFCD00]" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    Demo IaC — Terraform
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                      <FlaskConical className="w-3 h-3" />
                      DEMO ONLY
                    </span>
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    azurerm ~&gt; 3.110 · {selectedServices.length > 0 ? `${selectedServices.length} service${selectedServices.length !== 1 ? "s" : ""} selected` : "No services selected"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={selectedServices.length === 0}
                  onClick={() => {
                    void navigator.clipboard.writeText(generateMultiServiceTerraform(formData, selectedServices)).then(() => {
                      setIacCopied(true);
                      setTimeout(() => setIacCopied(false), 2000);
                    });
                  }}
                >
                  {iacCopied
                    ? <><Check className="w-3.5 h-3.5 mr-1.5 text-green-600" />Copied!</>
                    : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={selectedServices.length === 0}
                  onClick={() => {
                    const blob = new Blob([generateMultiServiceTerraform(formData, selectedServices)], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "main.tf";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />Download main.tf
                </Button>
                {!iacDeploymentId && (
                  <Button
                    size="sm"
                    className="text-xs font-semibold gap-1.5"
                    style={{ background: "#0078d4", color: "#fff" }}
                    disabled={selectedServices.length === 0}
                    onClick={() => setIacDeployOpen((v) => !v)}
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    {iacDeployOpen ? "Cancel" : "Deploy to Azure"}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-6 pb-6 pt-4 space-y-4">
            {selectedServices.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center justify-center">
                <p className="text-sm text-slate-500">Select at least one Azure service above to generate Terraform code.</p>
              </div>
            ) : (
              <>
                {/* Warning banner */}
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-800">
                    <span className="font-semibold">Demonstration configuration only.</span> This Terraform template is generated for demo purposes and is <span className="font-semibold">not hardened for production</span>. Do not use in production without a full security review.
                  </p>
                </div>

                {/* Selected services summary */}
                <div className="flex flex-wrap gap-2">
                  {selectedServices.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-800">
                      {id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  ))}
                </div>

                {/* Deployment summary: resource group + region */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  {[
                    { label: "Resource Group", value: `mf-${(formData.applicationName ?? "app").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}-demo-rg` },
                    { label: "Region", value: formData.azureRegions?.[0] ?? "canadacentral" },
                    { label: "Services", value: `${selectedServices.length} resource block${selectedServices.length !== 1 ? "s" : ""}` },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                      <p className="text-slate-400 mb-0.5">{label}</p>
                      <p className="font-mono font-semibold text-slate-700 break-all">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Code block */}
                <div className="rounded-lg overflow-hidden border border-slate-200">
                  <div className="flex items-center justify-between px-4 py-2 bg-[#1e1e1e]">
                    <span className="text-xs text-slate-400 font-mono">main.tf</span>
                    <span className="text-xs text-slate-500">HCL · Terraform</span>
                  </div>
                  <pre className="overflow-x-auto text-xs leading-relaxed p-4 bg-[#1e1e1e] text-[#d4d4d4] max-h-[520px] font-mono">
                    <code>{generateMultiServiceTerraform(formData, selectedServices)}</code>
                  </pre>
                </div>
              </>
            )}

            {/* ── Deploy form ─────────────────────────────────────────── */}
            {iacDeployOpen && !iacDeploymentId && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Rocket className="w-4 h-4 text-blue-600 shrink-0" />
                  <p className="text-sm font-semibold text-blue-900">Launch Azure Deployment</p>
                </div>
                <p className="text-xs text-blue-800">
                  The portal will use the Azure Service Principal configured in <strong>Integrations → Azure</strong> to provision the selected resources ({selectedServices.length} service{selectedServices.length !== 1 ? "s" : ""} selected). Make sure credentials are saved before proceeding.
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-slate-500 mb-0.5">Resource Group</p>
                    <p className="font-mono font-semibold text-slate-800">
                      {`mf-${(formData.applicationName ?? "app").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}-demo-rg`}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-0.5">Region</p>
                    <p className="font-mono font-semibold text-slate-800">{(formData.azureRegions?.[0] ?? "canadacentral")}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vmPassword" className="text-xs font-medium text-slate-700">
                    VM Administrator Password <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="vmPassword"
                    type="password"
                    placeholder="Min 12 chars · upper+lower+number+symbol"
                    value={iacDeployPassword}
                    onChange={(e) => setIacDeployPassword(e.target.value)}
                    className="text-xs"
                  />
                  <p className="text-xs text-slate-400">Required by Azure for Windows VM provisioning. This is only sent to your Azure subscription and never stored in the portal.</p>
                </div>
                {iacDeployError && (
                  <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{iacDeployError}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    className="text-xs font-semibold gap-1.5"
                    style={{ background: "#0078d4", color: "#fff" }}
                    disabled={!iacDeployPassword || iacDeployLoading}
                    onClick={() => void handleDeploy()}
                  >
                    {iacDeployLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                    {iacDeployLoading ? "Starting…" : "Launch Deployment"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => setIacDeployOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* ── Deployment status panel ──────────────────────────────── */}
            {iacDeployment && (
              <div className={`rounded-lg border p-4 space-y-3 ${
                iacDeployment.status === "succeeded" ? "border-green-200 bg-green-50"
                  : iacDeployment.status === "failed" ? "border-red-200 bg-red-50"
                  : "border-blue-200 bg-blue-50"
              }`}>
                <div className="flex items-center gap-2">
                  {iacDeployment.status === "succeeded" && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                  {iacDeployment.status === "failed" && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                  {(iacDeployment.status === "pending" || iacDeployment.status === "provisioning") && <Loader2 className="w-4 h-4 text-blue-600 shrink-0 animate-spin" />}
                  <p className={`text-sm font-semibold ${
                    iacDeployment.status === "succeeded" ? "text-green-800"
                      : iacDeployment.status === "failed" ? "text-red-800"
                      : "text-blue-900"
                  }`}>
                    {iacDeployment.status === "pending" && "Deployment queued — waiting to start…"}
                    {iacDeployment.status === "provisioning" && "Provisioning Azure resources…"}
                    {iacDeployment.status === "succeeded" && "Deployment succeeded!"}
                    {iacDeployment.status === "failed" && "Deployment failed"}
                  </p>
                </div>

                {iacDeployment.status === "succeeded" && iacDeployment.resources && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(iacDeployment.resources).map(([k, v]) => (
                      <div key={k} className="bg-white rounded border border-green-100 px-2 py-1.5">
                        <p className="text-slate-400 capitalize">{k.replace(/_/g, " ")}</p>
                        <p className="font-mono font-semibold text-slate-700 break-all">{v}</p>
                      </div>
                    ))}
                  </div>
                )}

                {iacDeployment.status === "failed" && iacDeployment.error && (
                  <p className="text-xs text-red-700 font-mono bg-red-100 rounded p-2">{iacDeployment.error}</p>
                )}

                {iacDeployment.log && (
                  <div className="rounded-lg overflow-hidden border border-slate-200">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e1e]">
                      <Terminal className="w-3 h-3 text-slate-400" />
                      <span className="text-xs text-slate-400 font-mono">Deployment Log</span>
                    </div>
                    <pre className="text-xs leading-relaxed p-3 bg-[#1e1e1e] text-[#a8d8a8] font-mono max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {iacDeployment.log}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
