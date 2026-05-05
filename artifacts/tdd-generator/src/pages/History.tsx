import { useState } from "react";
import { useLocation } from "wouter";
import { useAppContext, type HistoryEntry } from "@/store/app-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Clock, Trash2, FileText, Eye } from "lucide-react";
import MermaidDiagram from "@/components/MermaidDiagram";

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

export default function History() {
  const [, setLocation] = useLocation();
  const { history, removeHistoryEntry, clearHistory } = useAppContext();
  const [selected, setSelected] = useState<HistoryEntry | null>(null);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Document History</h2>
          <p className="text-slate-500 mt-1">
            {history.length === 0
              ? "No documents generated yet."
              : `${history.length} document${history.length !== 1 ? "s" : ""} saved locally.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {history.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearHistory}
              className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear All
            </Button>
          )}
          <Button variant="outline" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <FileText className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg font-medium">No history yet</p>
          <p className="text-sm mt-1">Generated TDDs will appear here for the last 10 documents.</p>
          <Button className="mt-6" onClick={() => setLocation("/dashboard")}>
            Generate a TDD
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <div className="lg:col-span-1 space-y-3">
            {history.map((entry) => (
              <Card
                key={entry.id}
                className={`cursor-pointer transition-all border shadow-sm hover:shadow-md ${
                  selected?.id === entry.id
                    ? "border-primary ring-1 ring-primary/20 bg-primary/5"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
                onClick={() => setSelected(entry)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">
                        {entry.applicationName}
                      </p>
                      <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                        <Clock className="w-3 h-3" />
                        <span>{timeAgo(entry.generatedAt)}</span>
                        <span className="text-slate-300 mx-1">·</span>
                        <span>{new Date(entry.generatedAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                        {entry.snippet}
                      </p>
                    </div>
                    <button
                      className="p-1 text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeHistoryEntry(entry.id);
                        if (selected?.id === entry.id) setSelected(null);
                      }}
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Preview panel */}
          <div className="lg:col-span-2">
            {selected ? (
              <Card className="shadow-sm border-slate-200 bg-white sticky top-24">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold text-slate-800">
                      {selected.applicationName}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs text-slate-500">
                        {new Date(selected.generatedAt).toLocaleString()}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent
                  className="p-6 overflow-y-auto max-h-[calc(100vh-18rem)]"
                >
                  <article className="prose prose-slate prose-sm max-w-none prose-headings:text-slate-900 prose-headings:font-bold prose-h2:text-lg prose-h2:border-b prose-h2:pb-1 prose-h2:mt-6 prose-h3:text-base prose-code:text-primary prose-code:bg-primary/5 prose-code:px-1 prose-code:rounded">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ className, children, ...props }) {
                          const lang = /language-(\w+)/.exec(className ?? "")?.[1];
                          if (lang?.toLowerCase() === "mermaid") {
                            return <MermaidDiagram code={String(children).replace(/\n$/, "")} />;
                          }
                          return <code className={className} {...props}>{children}</code>;
                        },
                      }}
                    >
                      {selected.markdown}
                    </ReactMarkdown>
                  </article>
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
