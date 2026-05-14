import { type ReactNode, useCallback, useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  Cloud, LayoutDashboard, FileText, PlusCircle, CheckSquare, History,
  LogOut, ChevronRight, Users, Bell, X, Building2, ShieldCheck,
  Code2, DollarSign, Layers, UserCog, Plug, MessageSquare, Activity, UserCheck, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth-context";
import { cn } from "@/lib/utils";
import { getApiBase } from "@/lib/api-base";
import { StatusBadge, type RequestStatus } from "@/components/RequestStatusBadge";

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  roles: string[];
  phase?: number;
}

const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Home",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, roles: ["requestor", "enterprise_architect", "cloud_architect", "admin"] },
      { label: "Submit a Request", path: "/requests/new", icon: PlusCircle, roles: ["requestor", "admin"] },
      { label: "LeanIX Initiatives", path: "/leanix-initiatives", icon: Link2, roles: ["requestor", "enterprise_architect", "cloud_architect", "admin"] },
    ],
  },
  {
    label: "Process Phases",
    items: [
      { label: "Phase 1 — Architecture Review", path: "/phase/1", icon: Building2, roles: ["requestor", "enterprise_architect", "admin"], phase: 1 },
      { label: "Phase 2 — Technical Design", path: "/phase/3", icon: FileText, roles: ["requestor", "cloud_architect", "admin"], phase: 2 },
      { label: "Phase 3 — Infrastructure Deployment", path: "/phase/4", icon: Code2, roles: ["requestor", "cloud_architect", "admin"], phase: 3 },
      { label: "Phase 4 — Observability", path: "/phase/observability", icon: Activity, roles: ["requestor", "cloud_architect", "admin"], phase: 4 },
      { label: "Phase 5 — Cost Management", path: "/phase/5", icon: DollarSign, roles: ["requestor", "enterprise_architect", "cloud_architect", "admin"], phase: 5 },
    ],
  },
  {
    label: "My Work",
    items: [
      { label: "All Requests", path: "/requests", icon: Layers, roles: ["enterprise_architect", "cloud_architect", "admin"] },
      { label: "My Requests", path: "/requests", icon: FileText, roles: ["requestor"] },
      { label: "Architecture Review Queue", path: "/ea-queue", icon: CheckSquare, roles: ["enterprise_architect", "admin"] },
      { label: "Design Document Queue", path: "/tdd-queue", icon: Cloud, roles: ["cloud_architect", "admin"] },
      { label: "Design Document History", path: "/history", icon: History, roles: ["cloud_architect", "admin"] },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "User Management", path: "/admin/users", icon: UserCog, roles: ["admin"] },
      { label: "Approval Delegation", path: "/admin/delegations", icon: UserCheck, roles: ["enterprise_architect", "cloud_architect", "admin"] },
      { label: "Integrations", path: "/integrations", icon: Plug, roles: ["admin"] },
    ],
  },
];

const PHASE_COLORS: Record<number, string> = {
  1: "#FFCD00",
  2: "#FFCD00",
  3: "#FFCD00",
  4: "#FFCD00",
  5: "#FFCD00",
};

const ROLE_LABELS: Record<string, string> = {
  requestor: "Requestor",
  enterprise_architect: "Enterprise Architect",
  cloud_architect: "Cloud Architect",
  admin: "Admin",
};

const ROLE_COLORS: Record<string, string> = {
  requestor: "bg-violet-100 text-violet-700",
  enterprise_architect: "bg-amber-100 text-amber-700",
  cloud_architect: "bg-blue-100 text-blue-700",
  admin: "bg-red-100 text-red-700",
};

const STATUS_CHANGE_LABELS: Record<string, string> = {
  ea_triage: "is being reviewed by the architecture team",
  ea_approved: "was approved — technical design will begin soon",
  ea_rejected: "was not approved — check the request for details",
  tdd_in_progress: "technical design document is being created",
  tdd_completed: "technical design is complete and signed off",
  devsecops_approved: "infrastructure setup has been approved",
  observability_approved: "observability setup has been confirmed",
  finops_active: "is now live in cost management",
};

interface Notification {
  requestId: number;
  title: string;
  message: string;
  status: RequestStatus;
  updatedAt: string;
}

const SEEN_KEY = "portal_seen_statuses";
const LAST_READ_KEY = "portal_last_read_at";
const CLEARED_AT_KEY = "portal_cleared_at";

interface RecentEvent {
  id: number;
  requestId: number;
  requestTitle: string;
  actorName: string;
  actorRole: string;
  eventType: string;
  description: string;
  createdAt: string;
}

function loadSeen(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}"); } catch { return {}; }
}

function saveSeen(data: Record<string, string>) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(data));
}

interface PortalLayoutProps {
  children: ReactNode;
}

export function PortalLayout({ children }: PortalLayoutProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"notifications" | "activity" | "comments">("notifications");
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [lastReadAt, setLastReadAt] = useState<string>(() => localStorage.getItem(LAST_READ_KEY) ?? new Date(0).toISOString());
  const [clearedAt, setClearedAt] = useState<string>(() => localStorage.getItem(CLEARED_AT_KEY) ?? new Date(0).toISOString());
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch(`${getApiBase()}/api/requests`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const requests: { id: number; title: string; status: RequestStatus; updatedAt: string }[] = d.requests ?? [];
        const seen = loadSeen();
        const newNotifs: Notification[] = [];
        for (const req of requests) {
          const lastSeen = seen[req.id];
          if (lastSeen !== undefined && lastSeen !== req.status) {
            const label = STATUS_CHANGE_LABELS[req.status];
            if (label) {
              newNotifs.push({ requestId: req.id, title: req.title, message: label, status: req.status, updatedAt: req.updatedAt });
            }
          }
        }
        setNotifications(newNotifs);
      });
  }, [user]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchRecentEvents = useCallback(() => {
    if (!user) return;
    fetch(`${getApiBase()}/api/requests/events/recent`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setRecentEvents(d.events ?? []))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    fetchRecentEvents();
    const timer = setInterval(fetchRecentEvents, 30_000);
    return () => clearInterval(timer);
  }, [fetchRecentEvents]);

  const markAllSeen = () => {
    fetch(`${getApiBase()}/api/requests`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const requests: { id: number; status: string }[] = d.requests ?? [];
        const updated: Record<string, string> = {};
        for (const req of requests) updated[req.id] = req.status;
        saveSeen(updated);
        setNotifications([]);
      });
  };

  const handleNotifClick = (requestId: number) => {
    markAllSeen();
    setShowNotifs(false);
    setLocation(`/requests/${requestId}`);
  };

  const visibleEvents = recentEvents.filter((e) => new Date(e.createdAt) > new Date(clearedAt));
  const isUnread = (e: RecentEvent) => new Date(e.createdAt) > new Date(lastReadAt);
  const activityEvents = visibleEvents.filter((e) => e.eventType !== "comment");
  const commentEvents = visibleEvents.filter((e) => e.eventType === "comment");
  const unreadCount = visibleEvents.filter(isUnread).length;

  const handleMarkAllRead = () => {
    const now = new Date().toISOString();
    setLastReadAt(now);
    localStorage.setItem(LAST_READ_KEY, now);
    markAllSeen();
  };

  const handleClearAll = () => {
    const now = new Date().toISOString();
    setClearedAt(now);
    localStorage.setItem(CLEARED_AT_KEY, now);
    setLastReadAt(now);
    localStorage.setItem(LAST_READ_KEY, now);
    markAllSeen();
  };

  const handleReply = async (eventId: number) => {
    const event = commentEvents.find((e) => e.id === eventId);
    if (!event || !replyText.trim()) return;
    setSubmittingReply(true);
    try {
      await fetch(`${getApiBase()}/api/requests/${event.requestId}/comment`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: replyText.trim() }),
      });
      setReplyText("");
      setReplyingTo(null);
      fetchRecentEvents();
    } catch {
      // ignore
    } finally {
      setSubmittingReply(false);
    }
  };

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  const isActive = (path: string) => {
    const base = path.split("?")[0];
    return location === base || location.startsWith(base + "/");
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#f7f5f0" }}>
      {/* Sidebar */}
      <aside className="w-64 text-white flex flex-col fixed inset-y-0 left-0 z-40" style={{ background: "#1a1a2e" }}>
        {/* Logo */}
        <div className="px-4 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img src="/assets/mccain-logo.png" alt="McCain Foods" className="h-10 object-contain shrink-0" />
            <div>
              <p className="font-bold text-sm leading-tight tracking-wide" style={{ fontFamily: "Outfit, sans-serif" }}>McCAIN FOODS</p>
              <p className="text-xs tracking-widest font-mono" style={{ color: "#FFCD00" }}>CCoE · Unified Portal</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter((item) => item.roles.includes(user.role));
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label}>
                <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: "#6b6258" }}>
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    const phaseColor = item.phase ? PHASE_COLORS[item.phase] : undefined;
                    return (
                      <button
                        key={item.label}
                        onClick={() => setLocation(item.path)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                          active
                            ? "text-white"
                            : "text-slate-400 hover:bg-white/10 hover:text-white"
                        )}
                        style={active ? { background: phaseColor ?? "#FFCD00", color: phaseColor === "#FFCD00" || !phaseColor ? "#1a1a2e" : "#ffffff" } : {}}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="flex-1 text-left">{item.label}</span>
                        {active && <ChevronRight className="w-3 h-3 opacity-70" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User info */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,205,0,0.2)" }}>
              <Users className="w-4 h-4" style={{ color: "#FFCD00" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", ROLE_COLORS[user.role] ?? "bg-slate-600 text-white")}>
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start text-slate-400 hover:text-white hover:bg-white/10 px-2"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen min-w-0 overflow-x-hidden">
        {/* Top header bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold">Application Onboarding Portal</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-600">Online</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono">McCain CCoE · 2026</span>
            {/* Notifications bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifs((v) => !v)}
                className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800"
                title="Updates on your requests"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-800">Notifications</p>
                    <div className="flex items-center gap-3">
                      {unreadCount > 0 && (
                        <button onClick={handleMarkAllRead} className="text-xs font-medium" style={{ color: "#b49000" }}>
                          Mark all as read
                        </button>
                      )}
                      {visibleEvents.length > 0 && (
                        <button onClick={handleClearAll} className="text-xs font-medium text-slate-400 hover:text-red-500 transition-colors">
                          Clear all
                        </button>
                      )}
                      <button onClick={() => setShowNotifs(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex border-b border-slate-100">
                    {([
                      { key: "notifications", label: "Status Updates", icon: Bell },
                      { key: "activity", label: "All Activity", icon: Activity },
                      { key: "comments", label: "Comments", icon: MessageSquare },
                    ] as const).map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors border-b-2",
                          activeTab === key ? "text-slate-800 border-amber-400" : "text-slate-400 hover:text-slate-600 border-transparent"
                        )}
                      >
                        <Icon className="w-3 h-3" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Tab content */}
                  <div className="max-h-80 overflow-y-auto">

                    {/* Notifications tab */}
                    {activeTab === "notifications" && (
                      activityEvents.length === 0 ? (
                        <div className="px-4 py-8 text-center text-slate-400 text-sm">
                          <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          You're all caught up!
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {activityEvents.map((e) => (
                            <button
                              key={e.id}
                              onClick={() => { setShowNotifs(false); setLocation(`/requests/${e.requestId}`); }}
                              className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                            >
                              <div className="flex items-start gap-3">
                                <div className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0 flex-shrink-0", isUnread(e) ? "bg-red-400" : "bg-slate-200")} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-slate-700 truncate">{e.requestTitle}</p>
                                  <p className="text-xs text-slate-600 mt-0.5">{e.description}</p>
                                  <p className="text-xs text-slate-400 mt-0.5">{e.actorName} · {new Date(e.createdAt).toLocaleString()}</p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )
                    )}

                    {/* Activity tab */}
                    {activeTab === "activity" && (
                      recentEvents.length === 0 ? (
                        <div className="px-4 py-8 text-center text-slate-400 text-sm">
                          <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          No recent activity
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {recentEvents.map((e) => (
                            <button
                              key={e.id}
                              onClick={() => { setShowNotifs(false); setLocation(`/requests/${e.requestId}`); }}
                              className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                            >
                              <div className="flex items-start gap-3">
                                <div className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0 flex-shrink-0", isUnread(e) ? "bg-red-400" : "bg-slate-200")} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-slate-700 truncate">{e.requestTitle}</p>
                                  <p className="text-xs text-slate-600 mt-0.5">{e.description}</p>
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mr-1",
                                      e.eventType === "comment" ? "bg-violet-100 text-violet-600" : "bg-amber-100 text-amber-700"
                                    )}>{e.eventType}</span>
                                    {e.actorName} · {new Date(e.createdAt).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )
                    )}

                    {/* Comments tab */}
                    {activeTab === "comments" && (
                      commentEvents.length === 0 ? (
                        <div className="px-4 py-8 text-center text-slate-400 text-sm">
                          <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          No comments yet
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {commentEvents.map((e) => (
                            <div key={e.id} className="px-4 py-3">
                              <div className="flex items-start gap-2">
                                <div className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0 flex-shrink-0", isUnread(e) ? "bg-red-400" : "bg-slate-200")} />
                                <div className="flex-1 min-w-0">
                                  <button
                                    onClick={() => { setShowNotifs(false); setLocation(`/requests/${e.requestId}`); }}
                                    className="text-xs font-semibold text-slate-700 hover:underline text-left truncate block w-full"
                                  >
                                    {e.requestTitle}
                                  </button>
                                  <p className="text-xs text-slate-600 mt-0.5 break-words">{e.description}</p>
                                  <p className="text-xs text-slate-400 mt-0.5">{e.actorName} · {new Date(e.createdAt).toLocaleString()}</p>
                                  <button
                                    onClick={() => { setReplyingTo(replyingTo === e.id ? null : e.id); setReplyText(""); }}
                                    className="text-xs font-medium mt-1 hover:underline"
                                    style={{ color: "#b49000" }}
                                  >
                                    Reply
                                  </button>
                                  {replyingTo === e.id && (
                                    <div className="mt-2">
                                      <textarea
                                        value={replyText}
                                        onChange={(ev) => setReplyText(ev.target.value)}
                                        placeholder="Write a reply..."
                                        rows={2}
                                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
                                      />
                                      <div className="flex items-center gap-2 mt-1">
                                        <button
                                          onClick={() => handleReply(e.id)}
                                          disabled={submittingReply || !replyText.trim()}
                                          className="text-xs px-3 py-1 rounded-md font-medium disabled:opacity-50 transition-opacity"
                                          style={{ background: "#FFCD00", color: "#1a1a2e" }}
                                        >
                                          {submittingReply ? "Sending…" : "Send"}
                                        </button>
                                        <button
                                          onClick={() => { setReplyingTo(null); setReplyText(""); }}
                                          className="text-xs text-slate-400 hover:text-slate-600"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8">
          {children}
        </main>

        <footer className="bg-white border-t border-slate-200 px-8 py-3 flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400 tracking-widest uppercase">McCAIN FOODS LTD. · Cloud Centre of Excellence</span>
          <span className="text-xs font-mono text-slate-400 tracking-widest uppercase">Internal Use Only</span>
        </footer>
      </div>
    </div>
  );
}
