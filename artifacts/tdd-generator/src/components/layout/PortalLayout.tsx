import { type ReactNode, useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  Cloud, LayoutDashboard, FileText, PlusCircle, CheckSquare, History,
  LogOut, ChevronRight, Users, Bell, X, Building2, ShieldCheck,
  Code2, DollarSign, Layers, UserCog, Plug,
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
    label: "Overview",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, roles: ["requestor", "enterprise_architect", "cloud_architect", "admin"] },
      { label: "New Request", path: "/requests/new", icon: PlusCircle, roles: ["requestor", "admin"] },
    ],
  },
  {
    label: "Onboarding Phases",
    items: [
      { label: "Phase 1 — Architecture Review Request", path: "/phase/1", icon: Building2, roles: ["requestor", "enterprise_architect", "admin"], phase: 1 },
      { label: "Phase 2 — CCoE App Intake (TDD)", path: "/phase/3", icon: FileText, roles: ["requestor", "cloud_architect", "admin"], phase: 2 },
      { label: "Phase 3 — DevSecOps / IaC", path: "/phase/4", icon: Code2, roles: ["requestor", "cloud_architect", "admin"], phase: 3 },
      { label: "Phase 4 — FinOps", path: "/phase/5", icon: DollarSign, roles: ["requestor", "enterprise_architect", "cloud_architect", "admin"], phase: 4 },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "All Requests", path: "/requests", icon: Layers, roles: ["enterprise_architect", "cloud_architect", "admin"] },
      { label: "My Requests", path: "/requests", icon: FileText, roles: ["requestor"] },
      { label: "EA Review Queue", path: "/ea-queue", icon: CheckSquare, roles: ["enterprise_architect", "admin"] },
      { label: "TDD Queue", path: "/tdd-queue", icon: Cloud, roles: ["cloud_architect", "admin"] },
      { label: "TDD History", path: "/history", icon: History, roles: ["cloud_architect", "admin"] },
      { label: "User Management", path: "/admin/users", icon: UserCog, roles: ["admin"] },
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
  ea_triage: "moved to EA Triage",
  ea_approved: "was approved by EA",
  ea_rejected: "was rejected by EA",
  tdd_in_progress: "TDD generation started",
  tdd_completed: "TDD completed",
};

interface Notification {
  requestId: number;
  title: string;
  message: string;
  status: RequestStatus;
  updatedAt: string;
}

const SEEN_KEY = "portal_seen_statuses";

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
            <span className="text-xs text-slate-400 font-mono tracking-widest uppercase">Enterprise Onboarding Portal</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-600 font-mono">Live</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono">McCain CCoE · v2.0 · 2026</span>
            {/* Notifications bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => {
                  setShowNotifs((v) => !v);
                  if (!showNotifs && notifications.length > 0) setTimeout(markAllSeen, 3000);
                }}
                className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800"
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                    {notifications.length > 9 ? "9+" : notifications.length}
                  </span>
                )}
              </button>
              {showNotifs && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-800">Notifications</p>
                    <button onClick={() => setShowNotifs(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-slate-400 text-sm">
                      <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      You're all caught up!
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                      {notifications.map((n) => (
                        <button
                          key={n.requestId}
                          onClick={() => handleNotifClick(n.requestId)}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5"><StatusBadge status={n.status} /></div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{n.title}</p>
                              <p className="text-xs text-slate-500">{n.message}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{new Date(n.updatedAt).toLocaleString()}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {notifications.length > 0 && (
                    <div className="border-t border-slate-100 px-4 py-2">
                      <button onClick={markAllSeen} className="text-xs font-medium" style={{ color: "#b49000" }}>
                        Mark all as read
                      </button>
                    </div>
                  )}
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
          <span className="text-xs font-mono text-slate-400 tracking-widest uppercase">CONFIDENTIAL — MANAGEMENT REVIEW</span>
        </footer>
      </div>
    </div>
  );
}
