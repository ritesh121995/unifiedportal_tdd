import { useMemo } from "react";

interface AzureService {
  id: string;
  name: string;
  sub?: string;
  type: "users" | "networking" | "compute" | "database" | "storage" | "security" | "monitor" | "identity" | "devops" | "finops" | "bcdr";
}

interface Tier {
  label: string;
  services: AzureService[];
}

interface DiagramConfig {
  applicationName: string;
  region: string;
  networkPosture: string;
  drEnabled: boolean;
  tiers: Tier[];
  connections: [string, string, string?][];
}

const SERVICE_COLORS: Record<AzureService["type"], { bg: string; badge: string; text: string }> = {
  users:      { bg: "#1a1a2e", badge: "#FFCD00", text: "#fff" },
  networking: { bg: "#0063B1", badge: "#00BCF2", text: "#fff" },
  compute:    { bg: "#0078D4", badge: "#50E6FF", text: "#fff" },
  database:   { bg: "#003087", badge: "#00BCF2", text: "#fff" },
  storage:    { bg: "#0062AD", badge: "#50E6FF", text: "#fff" },
  security:   { bg: "#B83C00", badge: "#FFCD00", text: "#fff" },
  monitor:    { bg: "#005E50", badge: "#00D2B8", text: "#fff" },
  identity:   { bg: "#0F4E97", badge: "#50E6FF", text: "#fff" },
  devops:     { bg: "#1D6FA4", badge: "#50E6FF", text: "#fff" },
  finops:     { bg: "#107C10", badge: "#00D2B8", text: "#fff" },
  bcdr:       { bg: "#5C2D91", badge: "#C3B3DC", text: "#fff" },
};

const SERVICE_ABBR: Record<AzureService["type"], string> = {
  users:      "USR",
  networking: "AGW",
  compute:    "APP",
  database:   "SQL",
  storage:    "BLB",
  security:   "KV",
  monitor:    "MON",
  identity:   "AAD",
  devops:     "ADO",
  finops:     "ACM",
  bcdr:       "ASR",
};

// Box dimensions
const BOX_W = 130;
const BOX_H = 70;
const BOX_RX = 10;
const BADGE_W = 36;
const BADGE_H = 18;

function ServiceBox({ x, y, service }: { x: number; y: number; service: AzureService }) {
  const colors = SERVICE_COLORS[service.type];
  const abbr = SERVICE_ABBR[service.type];
  const cx = x + BOX_W / 2;

  return (
    <g>
      <rect x={x} y={y} width={BOX_W} height={BOX_H} rx={BOX_RX}
        fill={colors.bg} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      {/* Badge top-right */}
      <rect x={x + BOX_W - BADGE_W - 4} y={y + 4} width={BADGE_W} height={BADGE_H} rx={4}
        fill={colors.badge} />
      <text x={x + BOX_W - BADGE_W / 2 - 4} y={y + 16} textAnchor="middle"
        fontSize="8" fontWeight="800" fill={colors.bg} fontFamily="'Segoe UI',Arial,sans-serif">
        {abbr}
      </text>
      {/* Service name */}
      <text x={cx} y={y + 34} textAnchor="middle"
        fontSize="11" fontWeight="700" fill="#fff" fontFamily="'Segoe UI',Arial,sans-serif">
        {service.name}
      </text>
      {/* Sub-label */}
      {service.sub && (
        <text x={cx} y={y + 50} textAnchor="middle"
          fontSize="9" fill="rgba(255,255,255,0.7)" fontFamily="'Segoe UI',Arial,sans-serif">
          {service.sub}
        </text>
      )}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, dashed }: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }) {
  const mx = (x1 + x2) / 2;
  const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  return (
    <path d={d} fill="none" stroke={dashed ? "#94a3b8" : "#64748b"} strokeWidth="1.5"
      strokeDasharray={dashed ? "5,3" : undefined}
      markerEnd="url(#arrowhead)" />
  );
}

export default function AzureArchitectureDiagram({ code }: { code: string }) {
  const config = useMemo<DiagramConfig | null>(() => {
    try { return JSON.parse(code); } catch { return null; }
  }, [code]);

  if (!config) {
    return (
      <div className="my-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Could not parse Azure architecture diagram config.
      </div>
    );
  }

  // Layout: left-to-right tiers
  // Each tier is a vertical stack of services
  const TIER_GAP = 30;          // horizontal gap between tiers
  const SVC_GAP = 14;           // vertical gap between services in same tier
  const PADDING_LEFT = 24;
  const PADDING_TOP = 80;       // below header
  const HEADER_H = 60;

  // Calculate tier positions
  const tiers = config.tiers;
  type TierLayout = { x: number; services: { svc: AzureService; y: number; cx: number; cy: number }[] };
  const tierLayouts: TierLayout[] = [];
  let curX = PADDING_LEFT;

  for (const tier of tiers) {
    const svcs: TierLayout["services"] = [];
    let curY = PADDING_TOP;
    for (const svc of tier.services) {
      svcs.push({
        svc,
        y: curY,
        cx: curX + BOX_W / 2,
        cy: curY + BOX_H / 2,
      });
      curY += BOX_H + SVC_GAP;
    }
    tierLayouts.push({ x: curX, services: svcs });
    curX += BOX_W + TIER_GAP;
  }

  // Total dimensions
  const svgW = curX - TIER_GAP + PADDING_LEFT;
  const maxH = Math.max(...tierLayouts.map(t => t.services.reduce((acc, s) => Math.max(acc, s.y + BOX_H), 0)));
  const svgH = maxH + 40;

  // Build service position map for connections
  const posMap: Record<string, { cx: number; cy: number; rightX: number; leftX: number; topY: number; botY: number }> = {};
  for (const tl of tierLayouts) {
    for (const s of tl.services) {
      posMap[s.svc.id] = {
        cx: s.cx, cy: s.cy,
        rightX: tl.x + BOX_W,
        leftX: tl.x,
        topY: s.y,
        botY: s.y + BOX_H,
      };
    }
  }

  return (
    <div style={{ margin: "16px 0", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "auto" }}
        xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
          </marker>
        </defs>

        {/* Background */}
        <rect width={svgW} height={svgH} fill="#f8fafc" />

        {/* Header */}
        <rect width={svgW} height={HEADER_H} fill="#1a1a2e" />
        <text x={svgW / 2} y={26} textAnchor="middle"
          fontSize="13" fontWeight="700" fill="#FFCD00"
          fontFamily="'Segoe UI',Arial,sans-serif">
          Azure Cloud Architecture — {config.applicationName}
        </text>
        <text x={svgW / 2} y={46} textAnchor="middle"
          fontSize="10" fill="rgba(255,255,255,0.6)"
          fontFamily="'Segoe UI',Arial,sans-serif">
          {config.region} · {config.networkPosture}{config.drEnabled ? " · DR Enabled" : ""}
        </text>

        {/* Tier labels */}
        {tierLayouts.map((tl, i) => (
          <text key={i} x={tl.x + BOX_W / 2} y={PADDING_TOP - 10}
            textAnchor="middle" fontSize="9" fontWeight="700"
            fill="#94a3b8" fontFamily="'Segoe UI',Arial,sans-serif"
            letterSpacing="1">
            {tiers[i].label.toUpperCase()}
          </text>
        ))}

        {/* Connections */}
        {config.connections.map(([from, to, style], idx) => {
          const a = posMap[from];
          const b = posMap[to];
          if (!a || !b) return null;
          return (
            <Arrow key={idx}
              x1={a.rightX} y1={a.cy}
              x2={b.leftX} y2={b.cy}
              dashed={style === "dashed"} />
          );
        })}

        {/* Service boxes */}
        {tierLayouts.map((tl) =>
          tl.services.map(({ svc, y }) => (
            <ServiceBox key={svc.id} x={tl.x} y={y} service={svc} />
          ))
        )}
      </svg>
    </div>
  );
}
