import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Search, ExternalLink, Loader2, RefreshCw, ArrowRight,
  AlertCircle, Tag, CalendarDays, User, Plug, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getApiBase } from "@/lib/api-base";

const LEANIX_PREFILL_KEY = "leanix_initiative_prefill";

interface Initiative {
  id: string;
  displayName: string;
  description: string;
  businessOwner: string;
  businessOwnerEmail: string;
  itOwner: string;
  itOwnerEmail: string;
  targetGoLiveDate: string;
  tags: string[];
  lifecyclePhase: string;
}

const PHASE_LABELS: Record<string, { label: string; color: string }> = {
  plan:       { label: "Planning",    color: "bg-slate-100 text-slate-600 border-slate-200" },
  phaseIn:    { label: "Phase In",    color: "bg-blue-100 text-blue-700 border-blue-200" },
  active:     { label: "Active",      color: "bg-green-100 text-green-700 border-green-200" },
  phaseOut:   { label: "Phase Out",   color: "bg-orange-100 text-orange-700 border-orange-200" },
  endOfLife:  { label: "End of Life", color: "bg-red-100 text-red-700 border-red-200" },
};

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

export default function LeanIXInitiatives() {
  const [, setLocation] = useLocation();
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedPhase, setSelectedPhase] = useState("all");
  const [launching, setLaunching] = useState<string | null>(null);

  const fetchInitiatives = async () => {
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    try {
      const res = await fetch(`${getApiBase()}/api/leanix/initiatives`, { credentials: "include" });
      const d = await res.json() as { initiatives?: Initiative[]; error?: string; notConfigured?: boolean };
      if (!res.ok) {
        if (d.notConfigured) { setNotConfigured(true); return; }
        throw new Error(d.error ?? "Failed to load initiatives");
      }
      setInitiatives(d.initiatives ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load LeanIX initiatives");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInitiatives(); }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return initiatives.filter((i) => {
      const matchesQuery = !q ||
        i.displayName.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.businessOwner.toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q));
      const matchesPhase = selectedPhase === "all" || i.lifecyclePhase === selectedPhase;
      return matchesQuery && matchesPhase;
    });
  }, [initiatives, query, selectedPhase]);

  const handleStartRequest = (initiative: Initiative) => {
    setLaunching(initiative.id);
    // Map initiative data to form fields and store in sessionStorage
    const prefill = {
      title: initiative.displayName,
      applicationName: initiative.displayName,
      description: initiative.description,
      businessOwner: initiative.businessOwner,
      businessOwnerEmail: initiative.businessOwnerEmail,
      itOwner: initiative.itOwner,
      technologyOwnerEmail: initiative.itOwnerEmail,
      targetGoLiveDate: initiative.targetGoLiveDate,
      existingAppId: initiative.id,
      _leanixInitiativeName: initiative.displayName,
      _leanixTags: initiative.tags,
    };
    sessionStorage.setItem(LEANIX_PREFILL_KEY, JSON.stringify(prefill));
    setLocation("/requests/new");
  };

  const uniquePhases = [...new Set(initiatives.map((i) => i.lifecyclePhase).filter(Boolean))];

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center p-1">
              <img
                src="https://www.leanix.net/hubfs/LeanIX_June2022/Images/leanix-logo-icon.svg"
                alt="LeanIX"
                className="w-full h-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
            <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
              LeanIX Initiatives
            </h1>
          </div>
          <p className="text-slate-500 text-sm">
            Browse initiatives from your LeanIX Enterprise Architecture repository. Click <strong>Start Request</strong> to open the intake form pre-filled with the initiative's details.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchInitiatives} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Not configured state */}
      {notConfigured && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <Plug className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-amber-800">LeanIX credentials not configured</p>
              <p className="text-sm text-amber-700 mt-1">
                An admin needs to add the LeanIX API URL and token in the Integrations settings before initiatives can be loaded.
              </p>
              <Button
                size="sm"
                className="mt-3 gap-2"
                style={{ background: "#FFCD00", color: "#1a1a2e" }}
                onClick={() => setLocation("/integrations")}
              >
                <Plug className="w-3.5 h-3.5" /> Go to Integrations
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700">Could not load initiatives</p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={fetchInitiatives} className="shrink-0 text-xs">Retry</Button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-3" />
          <span className="text-sm">Connecting to LeanIX…</span>
        </div>
      )}

      {/* Loaded */}
      {!loading && !notConfigured && !error && (
        <>
          {/* Search + filter bar */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by name, description, owner, or tag…"
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {uniquePhases.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-400 font-medium">Phase:</span>
                {(["all", ...uniquePhases]).map((phase) => {
                  const cfg = PHASE_LABELS[phase];
                  const isActive = selectedPhase === phase;
                  return (
                    <button
                      key={phase}
                      onClick={() => setSelectedPhase(phase)}
                      className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                        isActive
                          ? "bg-[#FFCD00] text-[#1a1a2e] border-[#FFCD00]"
                          : (cfg?.color ?? "bg-slate-100 text-slate-600 border-slate-200") + " hover:opacity-80"
                      }`}
                    >
                      {phase === "all" ? "All phases" : (cfg?.label ?? phase)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Count */}
          <p className="text-sm text-slate-500">
            {filtered.length} initiative{filtered.length !== 1 ? "s" : ""}
            {initiatives.length !== filtered.length ? ` (filtered from ${initiatives.length})` : ""}
          </p>

          {/* Initiative cards */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Search className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-base font-medium">No initiatives found</p>
              <p className="text-sm mt-1">Try a different search term or phase filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filtered.map((initiative) => {
                const phaseCfg = PHASE_LABELS[initiative.lifecyclePhase];
                return (
                  <Card
                    key={initiative.id}
                    className="border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all"
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Title + phase badge */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-slate-900 text-base leading-tight">{initiative.displayName}</h3>
                            {phaseCfg && (
                              <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${phaseCfg.color}`}>
                                {phaseCfg.label}
                              </span>
                            )}
                          </div>

                          {/* Description */}
                          {initiative.description && (
                            <p className="text-sm text-slate-600 line-clamp-2">{initiative.description}</p>
                          )}

                          {/* Meta row */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
                            {initiative.businessOwner && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3 shrink-0" />
                                <span className="font-medium text-slate-700">{initiative.businessOwner}</span>
                                <span className="text-slate-400">(Business Owner)</span>
                              </span>
                            )}
                            {initiative.itOwner && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3 shrink-0" />
                                <span className="font-medium text-slate-700">{initiative.itOwner}</span>
                                <span className="text-slate-400">(IT Owner)</span>
                              </span>
                            )}
                            {initiative.targetGoLiveDate && (
                              <span className="flex items-center gap-1">
                                <CalendarDays className="w-3 h-3 shrink-0" />
                                <span>Go-live: <span className="font-medium text-slate-700">{formatDate(initiative.targetGoLiveDate)}</span></span>
                              </span>
                            )}
                          </div>

                          {/* Tags */}
                          {initiative.tags.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Tag className="w-3 h-3 text-slate-400 shrink-0" />
                              {initiative.tags.map((tag) => (
                                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 border-slate-200 text-slate-500">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* LeanIX ID */}
                          <p className="text-[10px] text-slate-300 font-mono">{initiative.id}</p>
                        </div>

                        {/* Action */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <Button
                            onClick={() => handleStartRequest(initiative)}
                            disabled={launching === initiative.id}
                            style={{ background: "#FFCD00", color: "#1a1a2e" }}
                            className="gap-2 whitespace-nowrap"
                          >
                            {launching === initiative.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <ArrowRight className="w-4 h-4" />}
                            Start Request
                          </Button>
                          <p className="text-[11px] text-slate-400 text-right max-w-[160px] leading-tight">
                            Opens the intake form pre-filled with this initiative's details
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { LEANIX_PREFILL_KEY };
