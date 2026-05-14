import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, Filter, Loader2, PlusCircle, AlertCircle, Trash2, Download, RefreshCw, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/store/auth-context";
import { getApiBase } from "@/lib/api-base";
import { StatusBadge, type RequestStatus } from "@/components/RequestStatusBadge";

const PHASE_STEPS = ["Arch Review", "Tech Design", "Infrastructure", "Observability", "Cost Mgmt"];

function toRequestNumber(id: number, createdAt: string): string {
  const year = new Date(createdAt).getFullYear();
  return `MCN-${year}-${id.toString().padStart(4, "0")}`;
}

// activeStep is 1-based: 1 = first phase active, 5 = all done
function statusToPhase(status: string): { activeStep: number; rejected: boolean } {
  switch (status) {
    case "submitted":
    case "ea_triage":
    case "modification_requested": return { activeStep: 1, rejected: false };
    case "ea_rejected":            return { activeStep: 1, rejected: true };
    case "ea_approved":
    case "tdd_in_progress":        return { activeStep: 2, rejected: false };
    case "tdd_completed":          return { activeStep: 3, rejected: false };
    case "devsecops_rejected":     return { activeStep: 3, rejected: true };
    case "devsecops_approved":
    case "vendor_active":          return { activeStep: 4, rejected: false };
    case "observability_approved": return { activeStep: 5, rejected: false };
    case "finops_active":          return { activeStep: 6, rejected: false };
    default:                       return { activeStep: 1, rejected: false };
  }
}

function PhaseProgress({ status }: { status: string }) {
  const { activeStep, rejected } = statusToPhase(status);
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-0">
        {PHASE_STEPS.map((label, i) => {
          const done = i < activeStep - 1;
          const active = i === activeStep - 1;
          const isRejected = active && rejected;
          return (
            <div key={i} className="flex items-center">
              <div
                className={`w-2.5 h-2.5 rounded-full border transition-colors ${
                  done        ? "bg-green-500 border-green-500" :
                  isRejected  ? "bg-red-400 border-red-400" :
                  active      ? "bg-yellow-400 border-yellow-400" :
                                "bg-slate-100 border-slate-300"
                }`}
                title={label}
              />
              {i < PHASE_STEPS.length - 1 && (
                <div className={`w-4 h-px ${done ? "bg-green-300" : "bg-slate-200"}`} />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-slate-400 leading-none">
        {rejected ? "⚑ " : ""}{PHASE_STEPS[Math.min(activeStep - 1, PHASE_STEPS.length - 1)]}
      </p>
    </div>
  );
}

interface ArchitectureRequest {
  id: number;
  title: string;
  applicationName: string;
  businessUnit: string;
  priority: string;
  status: RequestStatus;
  requestorName: string;
  applicationType: string;
  deploymentModel?: string;
  createdAt: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "text-red-600 bg-red-50 border-red-200",
  High: "text-orange-600 bg-orange-50 border-orange-200",
  Medium: "text-yellow-600 bg-yellow-50 border-yellow-200",
  Low: "text-slate-600 bg-slate-50 border-slate-200",
};

const SLA_THRESHOLD_DAYS = 3;
const ACTIVE_STATUSES = ["submitted", "ea_triage", "modification_requested"];
const BULK_ELIGIBLE_STATUSES = ["submitted", "ea_triage"];

const DEPLOYMENT_MODEL_OPTIONS = [
  { value: "all", label: "All deployment models" },
  { value: "Cloud (McCain Tenant)", label: "Cloud (McCain Tenant)" },
  { value: "SaaS Solution", label: "SaaS Solution" },
  { value: "Vendor Tenant", label: "Vendor Tenant" },
  { value: "Other 3rd Party Solution", label: "Other 3rd Party Solution" },
  { value: "On-Premises (McCain Data Center)", label: "On-Premises (McCain Data Center)" },
  { value: "Hybrid", label: "Hybrid" },
];

const DATE_FILTER_OPTIONS = [
  { value: "any", label: "Any time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function SlaTag({ createdAt, status }: { createdAt: string; status: string }) {
  if (!ACTIVE_STATUSES.includes(status)) return null;
  const days = daysSince(createdAt);
  if (days < SLA_THRESHOLD_DAYS) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-medium text-orange-700 bg-orange-50 border-orange-200 shrink-0" title="Waiting for review for more than 3 days">
      <AlertCircle className="w-3 h-3" />
      Waiting {days}d
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
  const [deploymentFilter, setDeploymentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("any");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "priority">("newest");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);

  const canBulkSelect = user?.role === "enterprise_architect" || user?.role === "admin";

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
      const matchesDeployment = deploymentFilter === "all" || r.deploymentModel === deploymentFilter;
      const q = query.toLowerCase();
      const reqNum = toRequestNumber(r.id, r.createdAt).toLowerCase();
      const matchesQuery = !q || r.title.toLowerCase().includes(q) || r.applicationName.toLowerCase().includes(q) || r.businessUnit.toLowerCase().includes(q) || r.requestorName.toLowerCase().includes(q) || reqNum.includes(q);
      let matchesDate = true;
      if (dateFilter !== "any") {
        const days = parseInt(dateFilter, 10);
        matchesDate = daysSince(r.createdAt) <= days;
      }
      return matchesStatus && matchesPriority && matchesDeployment && matchesQuery && matchesDate;
    })
    .sort((a, b) => {
      if (sortOrder === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortOrder === "priority") return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // Only requests eligible for bulk selection (submitted or ea_triage)
  const bulkEligible = filtered.filter((r) => BULK_ELIGIBLE_STATUSES.includes(r.status));
  const allEligibleSelected = bulkEligible.length > 0 && bulkEligible.every((r) => selectedIds.has(r.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allEligibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(bulkEligible.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkAction = async (action: "approve" | "triage") => {
    if (selectedIds.size === 0) return;
    setBulkActing(true);
    try {
      await fetch(`${getApiBase()}/api/requests/bulk-action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action }),
      });
      setSelectedIds(new Set());
      doRefresh();
    } finally {
      setBulkActing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {pageTitle ?? (user?.role === "requestor" ? "My Requests" : "All Architecture Requests")}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {user?.role === "requestor"
              ? `${requests.length} request${requests.length !== 1 ? "s" : ""} — click any row to see the current status, reviewer comments, and next steps.`
              : `${requests.length} total · ${filtered.length} shown`}
          </p>
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
                a.download = `mccain-architecture-requests-${new Date().toISOString().slice(0, 10)}.csv`;
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
              New Request
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
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="ea_triage">Under review</SelectItem>
              <SelectItem value="modification_requested">Changes requested</SelectItem>
              <SelectItem value="ea_approved">Architecture approved</SelectItem>
              <SelectItem value="ea_rejected">Not approved</SelectItem>
              <SelectItem value="tdd_in_progress">Technical design in progress</SelectItem>
              <SelectItem value="tdd_completed">Technical design complete</SelectItem>
              <SelectItem value="devsecops_approved">Infrastructure approved</SelectItem>
              <SelectItem value="devsecops_rejected">Infrastructure rejected</SelectItem>
              <SelectItem value="observability_approved">Observability approved</SelectItem>
              <SelectItem value="finops_active">Complete</SelectItem>
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
        <Select value={deploymentFilter} onValueChange={setDeploymentFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All deployment models" />
          </SelectTrigger>
          <SelectContent>
            {DEPLOYMENT_MODEL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Any time" />
          </SelectTrigger>
          <SelectContent>
            {DATE_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
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

      {/* Bulk Actions Bar */}
      {canBulkSelect && someSelected && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#0078d4]/10 border border-[#0078d4]/30 text-sm">
          <CheckSquare className="w-4 h-4 text-[#0078d4] shrink-0" />
          <span className="font-medium text-[#0078d4]">{selectedIds.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm"
              className="h-7 px-3 text-xs bg-[#0078d4] hover:bg-[#106ebe]"
              disabled={bulkActing}
              onClick={() => handleBulkAction("approve")}
            >
              {bulkActing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Approve (EA)
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs"
              disabled={bulkActing}
              onClick={() => handleBulkAction("triage")}
            >
              Move to Triage
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-3 text-xs text-slate-500"
              disabled={bulkActing}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

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
          {/* Select-all header row — EA / admin only, shown when there are bulk-eligible rows */}
          {canBulkSelect && bulkEligible.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-1.5 text-xs text-slate-500">
              <input
                type="checkbox"
                className="w-4 h-4 rounded accent-[#0078d4] cursor-pointer"
                checked={allEligibleSelected}
                onChange={toggleSelectAll}
                aria-label="Select all eligible requests"
              />
              <span>
                {allEligibleSelected ? "Deselect all" : `Select all (${bulkEligible.length} eligible)`}
              </span>
            </div>
          )}

          {filtered.map((req) => {
            const isBulkEligible = canBulkSelect && BULK_ELIGIBLE_STATUSES.includes(req.status);
            const isSelected = selectedIds.has(req.id);

            return (
              <Card
                key={req.id}
                className={`hover:shadow-md transition-shadow ${isSelected ? "ring-2 ring-[#0078d4]/50 bg-[#0078d4]/5" : ""}`}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  {/* Checkbox — only for EA/admin on eligible rows */}
                  {canBulkSelect && (
                    <div className="shrink-0 w-5 flex items-center justify-center">
                      {isBulkEligible ? (
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded accent-[#0078d4] cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(req.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select request ${req.title}`}
                        />
                      ) : null}
                    </div>
                  )}

                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setLocation(`/requests/${req.id}`)}
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] font-mono font-semibold text-slate-400 shrink-0 tracking-wide">
                        {toRequestNumber(req.id, req.createdAt)}
                      </span>
                      <p className="font-medium text-sm truncate">{req.title}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 ${PRIORITY_COLORS[req.priority] ?? "text-slate-600"}`}>
                        {req.priority}
                      </span>
                      <SlaTag createdAt={req.createdAt} status={req.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {req.applicationName} · {req.applicationType} · {req.businessUnit}
                      {req.deploymentModel ? ` · ${req.deploymentModel}` : ""}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      By {req.requestorName} · {new Date(req.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <PhaseProgress status={req.status} />
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
            );
          })}
        </div>
      )}
    </div>
  );
}
