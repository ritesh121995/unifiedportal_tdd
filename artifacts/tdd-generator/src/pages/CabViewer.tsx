import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiBase } from "@/lib/api-base";

interface CabSubmission {
  id: number;
  applicationName: string;
  generatedContent: string;
  createdAt: string;
}

interface RequestSummary {
  id: number;
  applicationName: string;
  title: string;
  cabSubmissionId: number | null;
}

export default function CabViewer() {
  const { requestId } = useParams<{ requestId: string }>();
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [appName, setAppName] = useState<string>("");
  const [submissionDate, setSubmissionDate] = useState<string>("");

  useEffect(() => {
    if (!requestId) return;
    setLoading(true);
    setError(null);

    const api = getApiBase();

    fetch(`${api}/api/requests/${requestId}`, { credentials: "include" })
      .then((r) => r.json())
      .then(async (d: { request?: RequestSummary; error?: string }) => {
        if (!d.request) throw new Error(d.error ?? "Request not found");
        setAppName(d.request.applicationName);

        const subId = d.request.cabSubmissionId;
        if (!subId) throw new Error("No CAB has been generated for this request yet.");

        const sr = await fetch(`${api}/api/cab/submissions/${subId}`, { credentials: "include" });
        const sd = await sr.json() as { submission?: CabSubmission; error?: string };
        if (!sd.submission) throw new Error(sd.error ?? "CAB submission not found");

        setContent(sd.submission.generatedContent ?? "");
        setSubmissionDate(sd.submission.createdAt ? new Date(sd.submission.createdAt).toLocaleDateString() : "");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load CAB");
      })
      .finally(() => setLoading(false));
  }, [requestId]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation(`/requests/${requestId}`)}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Request
        </Button>
        <div className="h-5 w-px bg-slate-200" />
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <FileText className="w-4 h-4 text-purple-500" />
          <span className="font-medium text-slate-800">{appName || "Cloud Architecture Blueprint"}</span>
          {submissionDate && <span className="text-xs text-slate-400">· Generated {submissionDate}</span>}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24 gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading Cloud Architecture Blueprint…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* CAB Content */}
      {!loading && !error && content && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-500" />
            <span className="text-sm font-semibold text-slate-700">Cloud Architecture Blueprint</span>
            <span className="ml-auto text-xs text-slate-400">Read-only view</span>
          </div>
          <div className="px-8 py-6">
            <article className="prose prose-slate max-w-none
              prose-headings:font-semibold
              prose-h1:text-2xl prose-h1:border-b prose-h1:border-slate-200 prose-h1:pb-2
              prose-h2:text-xl prose-h2:mt-8
              prose-h3:text-base
              prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-lg
              prose-code:text-sm prose-code:bg-slate-100 prose-code:px-1 prose-code:rounded
              prose-table:text-sm
              prose-th:bg-slate-50 prose-th:font-semibold
              prose-a:text-blue-600">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </article>
          </div>
        </div>
      )}
    </div>
  );
}
