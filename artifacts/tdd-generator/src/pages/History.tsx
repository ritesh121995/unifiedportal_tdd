import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Clock, FileText, Eye, Loader2, RefreshCw, Trash2, ListTodo, History as HistoryIcon } from "lucide-react";
import MermaidDiagram from "@/components/MermaidDiagram";
import AzureArchitectureDiagram from "@/components/AzureArchitectureDiagram";
import { getApiBase } from "@/lib/api-base";
import { useAuth } from "@/store/auth-context";

interface CabSubmission {
  id: number;
  applicationName: string;
  organization: string;
  lineOfBusiness: string;
  requestorEmail: string;
  environments: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface CabSubmissionFull extends CabSubmission {
  generatedContent: string | null;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type ActiveTab = "queue" | "history";

export default function History() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [submissions, setSubmissions] = useState<CabSubmission[]>([]);
  const [selected, setSelected] = useState<CabSubmissionFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("queue");

  const fetchSubmissions = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${getApiBase()}/api/cab/submissions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load history");
      const d = await res.json();
      setSubmissions(d.submissions ?? []);
    } catch {
      setError("Could not load cloud architecture blueprints. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSubmissions(); }, []);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this cloud architecture blueprint? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await fetch(`${getApiBase()}/api/cab/submissions/${id}`, { method: "DELETE", credentials: "include" });
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch {
      setError("Failed to delete document. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSelect = async (sub: CabSubmission) => {
    if (selected?.id === sub.id) { setSelected(null); return; }
    setLoadingDetail(true);
    try {
      const res = await fetch(`${getApiBase()}/api/cab/submissions/${sub.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load document");
      const d = await res.json();
      setSelected(d.submission);
    } catch {
      setSelected({ ...sub, generatedContent: null });
    } finally {
      setLoadingDetail(false);
    }
  };

  const queueItems = submissions.filter((s) => s.status !== "completed");
  const historyItems = submissions.filter((s) => s.status === "completed");
  const visibleItems = activeTab === "queue" ? queueItems : historyItems;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Cloud Architecture Blueprints</h2>
          <p className="text-slate-500 mt-1 text-sm">
            {loading ? "Loading…" : `${queueItems.length} in queue · ${historyItems.length} completed`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchSubmissions} disabled={loading}>
            <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        <button
          onClick={() => { setActiveTab("queue"); setSelected(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "queue"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <ListTodo className="w-4 h-4" />
          In Review
          {queueItems.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === "queue" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-500"
            }`}>
              {queueItems.length}
            </span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab("history"); setSelected(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "history"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <HistoryIcon className="w-4 h-4" />
          Blueprint History
          {historyItems.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === "history" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"
            }`}>
              {historyItems.length}
            </span>
          )}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mr-3" />
          <span className="text-sm">Loading cloud architecture blueprints…</span>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <FileText className="w-16 h-16 mb-4 opacity-30" />
          {activeTab === "queue" ? (
            <>
              <p className="text-lg font-medium">No blueprints currently in review</p>
              <p className="text-sm mt-1">Cloud Architecture Blueprints awaiting Cloud Architect sign-off will appear here.</p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">No completed blueprints yet</p>
              <p className="text-sm mt-1">Cloud Architecture Blueprints signed off by the Cloud Architect will appear here.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <div className="lg:col-span-1 space-y-3">
            {visibleItems.map((sub) => (
              <Card
                key={sub.id}
                className={`cursor-pointer transition-all border shadow-sm hover:shadow-md ${
                  selected?.id === sub.id
                    ? "border-amber-400 ring-1 ring-amber-200 bg-amber-50/40"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
                onClick={() => handleSelect(sub)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{sub.applicationName}</p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{sub.organization} · {sub.lineOfBusiness}</p>
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400">
                        <Clock className="w-3 h-3" />
                        <span>{timeAgo(sub.createdAt)}</span>
                        <span className="text-slate-300 mx-1">·</span>
                        <span>{new Date(sub.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {sub.environments.slice(0, 3).map((e) => (
                          <span key={e} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{e}</span>
                        ))}
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${
                            sub.status === "completed"
                              ? "border-green-200 text-green-700 bg-green-50"
                              : "border-amber-200 text-amber-700 bg-amber-50"
                          }`}
                        >
                          {sub.status === "completed" ? "Signed off" : "In review"}
                        </Badge>
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={(e) => handleDelete(sub.id, e)}
                        disabled={deletingId === sub.id}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                        title="Delete document"
                      >
                        {deletingId === sub.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Preview panel */}
          <div className="lg:col-span-2">
            {loadingDetail ? (
              <div className="flex items-center justify-center h-64 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span className="text-sm">Loading document…</span>
              </div>
            ) : selected ? (
              <Card className="shadow-sm border-slate-200 bg-white sticky top-24">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold text-slate-800">{selected.applicationName}</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{selected.requestorEmail}</span>
                      <Badge variant="outline" className="text-xs text-slate-500">
                        {new Date(selected.createdAt).toLocaleString()}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 overflow-y-auto max-h-[calc(100vh-18rem)]">
                  {selected.generatedContent ? (
                    <article className="prose prose-slate prose-sm max-w-none prose-headings:text-slate-900 prose-headings:font-bold prose-h2:text-lg prose-h2:border-b prose-h2:pb-1 prose-h2:mt-6 prose-h3:text-base prose-code:text-primary prose-code:bg-primary/5 prose-code:px-1 prose-code:rounded">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ className, children, ...props }) {
                            const lang = /language-(\w+)/.exec(className ?? "")?.[1]?.toLowerCase();
                            const code = String(children).replace(/\n$/, "");
                            if (lang === "azurediagram") return <AzureArchitectureDiagram code={code} />;
                            if (lang === "mermaid") return <MermaidDiagram code={code} />;
                            return <code className={className} {...props}>{children}</code>;
                          },
                        }}
                      >
                        {selected.generatedContent}
                      </ReactMarkdown>
                    </article>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                      <FileText className="w-10 h-10 mb-3 opacity-30" />
                      <p className="text-sm">No generated content available for this document.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                <Eye className="w-8 h-8 mb-3 opacity-40" />
                <p className="text-sm">Select a document to preview it here</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
