import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, Filter, Loader2, PlusCircle, AlertCircle, Trash2, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/store/auth-context";
import { getApiBase } from "@/lib/api-base";
import { StatusBadge, type RequestStatus } from "@/components/RequestStatusBadge";

interface ArchitectureRequest {
  id: number;
  title: string;
  applicationName: string;
  businessUnit: string;
  priority: string;
  status: RequestStatus;
  requestorName: string;
  applicationType: string;
  createdAt: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "text-red-600 bg-red-50 border-red-200",
  High: "text-orange-600 bg-orange-50 border-orange-200",
  Medium: "text-yellow-600 bg-yellow-50 border-yellow-200",
  Low: "text-slate-600 bg-slate-50 border-slate-200",
};

const SLA_THRESHOLD_DAYS = 3;
const ACTIVE_STATUSES = ["submitted", "ea_triage"];

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function SlaTag({ createdAt, status }: { createdAt: string; status: string }) {
  if (!ACTIVE_STATUSES.includes(status)) return null;
  const days = daysSince(createdAt);
  if (days < SLA_THRESHOLD_DAYS) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-medium text-orange-700 bg-orange-50 border-orange-200 shrink-0">
      <AlertCircle className="w-3 h-3" />
      {days}d pending
    </span>
  );
}

interface RequestListProps {
  fixedStatuses?: string[];
  pageTitle?: string;
}

export default function RequestList({ fixedStatuses, pageTitle }: RequestListProps = {}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [requests, setRequests] = useState<ArchitectureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "priority">("newest");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const doRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (refreshTick > 0) setLoading(false); // keep list visible, just update
    fetch(`${getApiBase()}/api/requests`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setRequests(d.requests ?? []))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [refreshTick]);

  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      await fetch(`${getApiBase()}/api/requests/${id}`, { method: "DELETE", credentials: "include" });
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  const PRIORITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

  const filtered = requests
    .filter((r) => {
      const matchesStatus = fixedStatuses
        ? fixedStatuses.includes(r.status)
        : statusFilter === "all" || r.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || r.priority === priorityFilter;
      const q = query.toLowerCase();
      const matchesQuery = !q || r.title.toLowerCase().includes(q) || r.applicationName.toLowerCase().includes(q) || r.businessUnit.toLowerCase().includes(q) || r.requestorName.toLowerCase().includes(q);
      return matchesStatus && matchesPriority && matchesQuery;
    })
    .sort((a, b) => {
      if (sortOrder === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortOrder === "priority") return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {pageTitle ?? (user?.role === "requestor" ? "My Requests" : "All Architecture Requests")}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{requests.length} total · {filtered.length} shown</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-slate-600"
            onClick={doRefresh}
            disabled={refreshing}
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {(user?.role === "enterprise_architect" || user?.role === "cloud_architect" || user?.role === "admin") && !fixedStatuses && (
            <Button
              variant="outline"
              className="gap-2 text-slate-600"
              onClick={async () => {
                const res = await fetch(`${getApiBase()}/api/requests/export`, { credentials: "include" });
                if (!res.ok) return;
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `mccain-arr-requests-${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          )}
          {(user?.role === "requestor" || user?.role === "admin") && (
            <Button className="bg-[#0078d4] hover:bg-[#106ebe]" onClick={() => setLocation("/requests/new")}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Submit New
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search requests…" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!fixedStatuses && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <Filter className="w-3.5 h-3.5 mr-2 text-slate-400" />
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="ea_triage">EA Triage</SelectItem>
              <SelectItem value="ea_approved">EA Approved</SelectItem>
              <SelectItem value="ea_rejected">EA Rejected</SelectItem>
              <SelectItem value="tdd_in_progress">TDD In Progress</SelectItem>
              <SelectItem value="tdd_completed">TDD Completed</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="Critical">Critical</SelectItem>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as typeof sortOrder)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="priority">By priority</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading requests…
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            {requests.length === 0 ? (
              <>
                <p className="font-medium">No requests yet</p>
                {(user?.role === "requestor" || user?.role === "admin") && (
                  <Button className="mt-4 bg-[#0078d4] hover:bg-[#106ebe]" onClick={() => setLocation("/requests/new")}>
                    Submit your first request
                  </Button>
                )}
              </>
            ) : (
              <p>No requests match your filters.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((req) => (
            <Card
              key={req.id}
              className="hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => setLocation(`/requests/${req.id}`)}
                >
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-medium text-sm truncate">{req.title}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 ${PRIORITY_COLORS[req.priority] ?? "text-slate-600"}`}>
                      {req.priority}
                    </span>
                    <SlaTag createdAt={req.createdAt} status={req.status} />
                  </div>
                  <p className="text-xs text-slate-500">
                    {req.applicationName} · {req.applicationType} · {req.businessUnit}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    By {req.requestorName} · {new Date(req.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={req.status} />
                  {user?.role === "admin" && (
                    confirmDeleteId === req.id ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-slate-600">Delete?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2 text-xs"
                          disabled={deleting}
                          onClick={() => handleDelete(req.id)}
                        >
                          {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={deleting}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(req.id); }}
                        title="Delete request"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
