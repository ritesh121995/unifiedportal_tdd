import { useEffect, useState } from "react";
import { Loader2, PlusCircle, Trash2, ShieldCheck, Calendar, User, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/store/auth-context";
import { getApiBase } from "@/lib/api-base";

interface Delegation {
  id: string;
  delegatorName: string;
  delegatorRole: string;
  delegateName: string;
  delegateEmail: string;
  scope: string;
  startDate: string;
  endDate: string;
  reason: string;
  createdAt: string;
  active: boolean;
}

const SCOPE_LABELS: Record<string, string> = {
  ea_review: "Architecture Review (triage, approve, reject requests)",
  ca_review: "CA Review (generate Cloud Architecture Blueprint, Infrastructure approval)",
  all: "Full Delegation (all approval actions)",
};

const SCOPE_COLORS: Record<string, string> = {
  ea_review: "text-amber-700 bg-amber-50 border-amber-200",
  ca_review: "text-blue-700 bg-blue-50 border-blue-200",
  all: "text-purple-700 bg-purple-50 border-purple-200",
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function DelegationManager() {
  const { user } = useAuth();
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const today = todayStr();
  const [form, setForm] = useState({
    delegateName: "",
    delegateEmail: "",
    scope: "ea_review",
    startDate: today,
    endDate: addDays(today, 7),
    reason: "",
  });

  const loadDelegations = async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/delegations`, { credentials: "include" });
      const d = await res.json() as { delegations?: Delegation[] };
      setDelegations(d.delegations ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadDelegations(); }, []);

  const handleCreate = async () => {
    setError("");
    if (!form.delegateName.trim() || !form.delegateEmail.trim()) {
      setError("Delegate name and email are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${getApiBase()}/api/delegations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json() as { delegation?: Delegation; error?: string };
      if (!res.ok) { setError(d.error ?? "Failed to create delegation"); return; }
      setDelegations((prev) => [...prev, d.delegation!]);
      setShowForm(false);
      setForm({ delegateName: "", delegateEmail: "", scope: "ea_review", startDate: today, endDate: addDays(today, 7), reason: "" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`${getApiBase()}/api/delegations/${id}`, { method: "DELETE", credentials: "include" });
      setDelegations((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const activeDelegations = delegations.filter((d) => d.active);
  const pastDelegations = delegations.filter((d) => !d.active);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Approval Delegation</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Temporarily delegate your approval rights to a colleague during leave or hand-off periods.
          </p>
        </div>
        <Button
          className="gap-2"
          style={{ background: "#0078d4", color: "#fff" }}
          onClick={() => setShowForm((v) => !v)}
        >
          <PlusCircle className="w-4 h-4" />
          New Delegation
        </Button>
      </div>

      {/* Info card */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
        <div>
          <p className="font-semibold">How delegation works</p>
          <p className="mt-0.5 text-amber-700">
            Delegations are recorded in the portal as an audit trail. The designated delegate should use their own portal login — this registry documents who has temporary authority so EA and CA managers can track coverage.
            Active delegations are visible to all admins.
          </p>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="border-[#0078d4]/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-[#0078d4]" />
              Create New Delegation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Delegate Name <span className="text-red-500">*</span></Label>
                <Input
                  value={form.delegateName}
                  onChange={(e) => setForm((f) => ({ ...f, delegateName: e.target.value }))}
                  placeholder="Full name of delegate"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Delegate Email <span className="text-red-500">*</span></Label>
                <Input
                  type="email"
                  value={form.delegateEmail}
                  onChange={(e) => setForm((f) => ({ ...f, delegateEmail: e.target.value }))}
                  placeholder="colleague@mccain.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Delegation Scope <span className="text-red-500">*</span></Label>
              <Select value={form.scope} onValueChange={(v) => setForm((f) => ({ ...f, scope: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Start Date <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={form.startDate}
                  min={today}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Date <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Reason / Notes</Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Annual leave, conference, handoff period…"
                rows={2}
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button
                className="bg-[#0078d4] hover:bg-[#106ebe] text-white"
                disabled={saving}
                onClick={() => { void handleCreate(); }}
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Create Delegation
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setError(""); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active delegations */}
      <div className="space-y-3">
        <p className="text-xs font-mono uppercase tracking-widest text-slate-400">
          Active Delegations ({activeDelegations.length})
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading delegations…
          </div>
        ) : activeDelegations.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-500 text-sm">
              No active delegations.
            </CardContent>
          </Card>
        ) : (
          activeDelegations.map((d) => (
            <Card key={d.id} className="border-green-200 bg-green-50/40">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-800">{d.delegateName}</span>
                      <span className="text-xs text-slate-500">{d.delegateEmail}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${SCOPE_COLORS[d.scope] ?? "text-slate-600 bg-slate-50 border-slate-200"}`}>
                        {SCOPE_LABELS[d.scope] ?? d.scope}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        From: <span className="font-medium text-slate-700">{d.delegatorName}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {d.startDate} → {d.endDate}
                      </span>
                    </div>
                    {d.reason && (
                      <p className="text-xs text-slate-500 italic">"{d.reason}"</p>
                    )}
                  </div>
                  {(user?.name === d.delegatorName || user?.role === "admin") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 shrink-0"
                      disabled={deletingId === d.id}
                      onClick={() => { void handleDelete(d.id); }}
                      title="Remove delegation"
                    >
                      {deletingId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Past delegations */}
      {pastDelegations.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-mono uppercase tracking-widest text-slate-400">
            Past Delegations ({pastDelegations.length})
          </p>
          {pastDelegations.map((d) => (
            <Card key={d.id} className="border-slate-200 opacity-70">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-700">{d.delegateName}</span>
                      <span className="text-xs text-slate-400">{d.delegateEmail}</span>
                      <span className="text-[11px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Expired</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                      <span>From: {d.delegatorName}</span>
                      <span><Calendar className="w-3 h-3 inline mr-1" />{d.startDate} → {d.endDate}</span>
                    </div>
                  </div>
                  {user?.role === "admin" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-slate-300 hover:text-red-500 hover:bg-red-50 shrink-0"
                      disabled={deletingId === d.id}
                      onClick={() => { void handleDelete(d.id); }}
                    >
                      {deletingId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
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
