import { useState, useEffect } from "react";
import { DollarSign, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";

const PHASE_COLOR = "#FFCD00";

const SERVICES_BASE = [
  { service: "AKS", jan: 4200, feb: 3900, mar: 4800, category: "Compute" },
  { service: "SQL DB", jan: 2800, feb: 2750, mar: 2900, category: "Database" },
  { service: "App Service", jan: 1900, feb: 2100, mar: 1850, category: "Compute" },
  { service: "Storage", jan: 640, feb: 710, mar: 690, category: "Storage" },
  { service: "APIM", jan: 1200, feb: 1200, mar: 1350, category: "Integration" },
  { service: "Key Vault", jan: 180, feb: 175, mar: 190, category: "Security" },
  { service: "Monitor", jan: 420, feb: 460, mar: 440, category: "Operations" },
];

const SERVICE_COLORS: Record<string, string> = {
  Compute: "#FFCD00", Database: "#FFCD00", Storage: "#FFCD00",
  Integration: "#FFCD00", Security: "#FFCD00", Operations: "#64748b",
};

const SAVINGS_RECS = [
  { title: "Reserved Instances — AKS Node Pools", saving: 1260, roi: 38, effort: "Low", type: "RI", status: "recommended" },
  { title: "Right-size App Service Plan (P2v3 → P1v3)", saving: 540, roi: 22, effort: "Low", type: "Resize", status: "recommended" },
  { title: "Azure Hybrid Benefit — SQL Server Licences", saving: 840, roi: 45, effort: "Low", type: "Licensing", status: "applied" },
  { title: "Savings Plan — Compute (3yr commitment)", saving: 2100, roi: 52, effort: "Medium", type: "Savings Plan", status: "recommended" },
  { title: "Storage lifecycle policies — archive tier", saving: 280, roi: 18, effort: "Low", type: "Tiering", status: "recommended" },
  { title: "Dev/Test SKUs for non-prod environments", saving: 960, roi: 34, effort: "Medium", type: "Dev/Test", status: "applied" },
];

const BUDGET_ALERTS = [
  { subscription: "prod-corp-001", budget: 16000, forecast: 17200, actual: 11800, alert: "warning" },
  { subscription: "nonprod-corp-002", budget: 8000, forecast: 7100, actual: 5400, alert: "ok" },
  { subscription: "shared-services-003", budget: 5000, forecast: 5800, actual: 3900, alert: "warning" },
  { subscription: "data-platform-004", budget: 12000, forecast: 11500, actual: 8200, alert: "ok" },
  { subscription: "dev-sandbox-005", budget: 3000, forecast: 3600, actual: 2100, alert: "critical" },
];

const MONTHLY_TREND = [
  { month: "Aug", actual: 9800, forecast: 9800 },
  { month: "Sep", actual: 10200, forecast: 10200 },
  { month: "Oct", actual: 10800, forecast: 10800 },
  { month: "Nov", actual: 11300, forecast: 11300 },
  { month: "Dec", actual: 11200, forecast: 11200 },
  { month: "Jan", actual: 11340, forecast: 11340 },
  { month: "Feb", actual: null as unknown as number, forecast: 11600 },
  { month: "Mar", actual: null as unknown as number, forecast: 12100 },
  { month: "Apr", actual: null as unknown as number, forecast: 12400 },
];

const MONTHS = ["jan", "feb", "mar"] as const;

export default function Phase6FinOps() {
  const [activeMonth, setActiveMonth] = useState<"jan" | "feb" | "mar">("mar");
  const [animFrame, setAnimFrame] = useState(0);

  // Simple animation — tick up to full on mount
  useEffect(() => {
    let frame = 0;
    const id = setInterval(() => {
      frame += 1;
      setAnimFrame(frame);
      if (frame >= 20) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, []);

  const chartData = SERVICES_BASE.map((s) => ({
    service: s.service,
    value: Math.round(s[activeMonth] * (Math.min(animFrame, 20) / 20)),
    category: s.category,
    color: SERVICE_COLORS[s.category] ?? "#94a3b8",
  }));

  const totalCost = SERVICES_BASE.reduce((s, d) => s + d[activeMonth], 0);
  const totalSavings = SAVINGS_RECS.filter((r) => r.status === "recommended").reduce((s, r) => s + r.saving, 0);
  const appliedSavings = SAVINGS_RECS.filter((r) => r.status === "applied").reduce((s, r) => s + r.saving, 0);

  return (
    <div className="space-y-6">
      {/* Phase header */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#1a1a2e 0%,#2d1a35 100%)" }}>
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-20 bg-white" />
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-xs font-mono tracking-widest uppercase opacity-80 mb-1">Phase 05 · Ongoing Azure Cost Governance</p>
            <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>FinOps — Cost Management</h1>
            <p className="text-sm opacity-80 max-w-xl">
              Continuous cost visibility, budget governance, chargeback reporting, and optimisation recommendations. Powered by the McCain FinOps Framework with Azure Cost Management + Advisor integration.
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {["Azure Cost Mgmt", "Chargeback", "Reserved Instances", "Tag Policy", "Budget Alerts"].map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-mono border border-white/30 bg-white/10">{tag}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {[{ label: "Monthly Spend", val: `$${(totalCost / 1000).toFixed(1)}k` },
              { label: "Potential Savings", val: `$${(totalSavings / 1000).toFixed(1)}k` },
              { label: "Applied Savings", val: `$${(appliedSavings / 1000).toFixed(1)}k` }].map((s) => (
              <div key={s.label} className="text-center bg-white/10 rounded-xl px-4 py-2">
                <p className="text-xl font-black" style={{ fontFamily: "Outfit, sans-serif" }}>{s.val}</p>
                <p className="text-[10px] opacity-70 font-mono">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cost by service animated bar chart */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Cost by Azure Service</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">Monthly breakdown — CAD · All production subscriptions</p>
            </div>
            <div className="flex gap-1">
              {MONTHS.map((m) => (
                <button key={m} onClick={() => setActiveMonth(m)}
                  className="px-3 py-1 rounded text-xs font-mono transition-colors"
                  style={activeMonth === m ? { background: PHASE_COLOR, color: "#1a1a2e" } : { background: "#f1f5f9", color: "#64748b" }}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1).toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <XAxis dataKey="service" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
              <Tooltip
                formatter={(v: number) => [`$${v.toLocaleString()} CAD`, "Cost"]}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.service} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Category legend */}
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {Object.entries(SERVICE_COLORS).map(([cat, color]) => (
              <div key={cat} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                <span className="text-[10px] text-slate-500">{cat}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Savings Recommendations */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Savings Recommendations — ROI Analysis</CardTitle>
            <p className="text-xs text-slate-500">Powered by Azure Advisor + McCain FinOps CoE · Monthly potential: <strong>${totalSavings.toLocaleString()} CAD</strong></p>
          </CardHeader>
          <CardContent className="space-y-2">
            {SAVINGS_RECS.map((rec) => (
              <div key={rec.title} className={`p-3 rounded-xl border ${rec.status === "applied" ? "bg-green-50 border-green-200" : "bg-white border-slate-200"} hover:shadow-sm transition-all`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: `${PHASE_COLOR}18`, color: PHASE_COLOR }}>{rec.type}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${rec.effort === "Low" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {rec.effort} Effort
                      </span>
                      {rec.status === "applied" && <span className="flex items-center gap-0.5 text-[10px] font-mono text-green-700"><CheckCircle2 className="w-2.5 h-2.5" />Applied</span>}
                    </div>
                    <p className="text-xs font-medium text-slate-800">{rec.title}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold" style={{ color: PHASE_COLOR }}>${rec.saving.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{rec.roi}% ROI</p>
                  </div>
                </div>
                {rec.status === "recommended" && (
                  <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${rec.roi}%`, background: PHASE_COLOR }} />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Trend chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Spend Trend — Forecast vs Actuals</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">Aug 2025 – Apr 2026 · All subscriptions (CAD)</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={MONTHLY_TREND} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [`$${v?.toLocaleString() ?? "—"} CAD`, ""]} contentStyle={{ fontSize: 11 }} />
                  <Legend iconType="line" wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="actual" stroke={PHASE_COLOR} strokeWidth={2} dot={{ r: 3 }} name="Actual" connectNulls={false} />
                  <Line type="monotone" dataKey="forecast" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Forecast" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Budget Alerts */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Budget Alerts — Subscriptions</CardTitle>
              <p className="text-xs text-slate-500">Forecast vs budget threshold · Monthly CAD</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {BUDGET_ALERTS.map((alert) => {
                const pct = Math.round((alert.forecast / alert.budget) * 100);
                const barColor = alert.alert === "critical" ? "#ef4444" : alert.alert === "warning" ? "#f59e0b" : "#22c55e";
                return (
                  <div key={alert.subscription} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        {alert.alert === "critical" ? <AlertTriangle className="w-3 h-3 text-red-500" /> :
                          alert.alert === "warning" ? <AlertTriangle className="w-3 h-3 text-yellow-500" /> :
                          <CheckCircle2 className="w-3 h-3 text-green-500" />}
                        <span className="font-mono text-slate-700 text-[10px]">{alert.subscription}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-[10px]">${alert.actual.toLocaleString()} actual</span>
                        <span className="font-mono font-bold text-[10px]" style={{ color: barColor }}>{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                      <span>Budget: ${alert.budget.toLocaleString()}</span>
                      <span>Forecast: ${alert.forecast.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
