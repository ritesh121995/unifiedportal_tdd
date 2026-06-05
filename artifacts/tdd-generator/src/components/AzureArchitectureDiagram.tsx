import { useMemo } from "react";

interface DiagramConfig {
  applicationName: string;
  region: string;
  networkPosture: string;
  drEnabled: boolean;
  tiers: { label: string; services: { id: string; name: string; sub?: string; type: string }[] }[];
  connections: [string, string, string?][];
}

// Official Azure service colors
const AZ_COLOR: Record<string, string> = {
  users:       "#374151",
  networking:  "#0063B1",
  compute:     "#0078D4",
  database:    "#0078D4",
  storage:     "#0078D4",
  security:    "#E8782C",
  monitor:     "#773ADC",
  identity:    "#0078D4",
  devops:      "#005A9E",
  finops:      "#107C10",
  bcdr:        "#5C2D91",
};

// Azure service icon paths (simplified official shapes)
function ServiceIcon({ type, size = 32 }: { type: string; size?: number }) {
  const c = size / 2;
  const s = size * 0.28;

  const icons: Record<string, JSX.Element> = {
    users: (
      <>
        <circle cx={c} cy={c * 0.72} r={s * 0.85} fill="white" />
        <path d={`M${c - s * 1.5},${size * 0.92} Q${c - s * 1.5},${c + s * 0.6} ${c},${c + s * 0.6} Q${c + s * 1.5},${c + s * 0.6} ${c + s * 1.5},${size * 0.92}`} fill="white" />
      </>
    ),
    networking: (
      <>
        <path d={`M${c},${c - s * 1.4} L${c + s * 1.2},${c - s * 0.3} L${c + s * 1.2},${c + s * 0.9} L${c},${c + s * 1.4} L${c - s * 1.2},${c + s * 0.9} L${c - s * 1.2},${c - s * 0.3} Z`} fill="none" stroke="white" strokeWidth="2" />
        <circle cx={c} cy={c} r={s * 0.5} fill="white" />
      </>
    ),
    compute: (
      <>
        <rect x={c - s * 1.2} y={c - s} width={s * 2.4} height={s * 1.8} rx="3" fill="white" fillOpacity="0.25" stroke="white" strokeWidth="1.5" />
        <rect x={c - s * 0.7} y={c - s * 0.5} width={s * 1.4} height={s * 0.9} rx="2" fill="white" />
        <line x1={c - s * 0.4} y1={c + s} x2={c + s * 0.4} y2={c + s} stroke="white" strokeWidth="1.5" />
      </>
    ),
    database: (
      <>
        <ellipse cx={c} cy={c - s * 0.8} rx={s * 1.3} ry={s * 0.45} fill="white" />
        <rect x={c - s * 1.3} y={c - s * 0.8} width={s * 2.6} height={s * 1.8} fill="white" fillOpacity="0.2" />
        <ellipse cx={c} cy={c + s} rx={s * 1.3} ry={s * 0.45} fill="white" />
        <line x1={c - s * 1.3} y1={c - s * 0.8} x2={c - s * 1.3} y2={c + s} stroke="white" strokeWidth="1.5" />
        <line x1={c + s * 1.3} y1={c - s * 0.8} x2={c + s * 1.3} y2={c + s} stroke="white" strokeWidth="1.5" />
        <ellipse cx={c} cy={c + s * 0.1} rx={s * 1.3} ry={s * 0.45} fill="white" fillOpacity="0.3" />
      </>
    ),
    storage: (
      <>
        {[0, 1, 2].map(i => (
          <rect key={i} x={c - s * 1.2} y={c - s * 0.9 + i * s * 0.72} width={s * 2.4} height={s * 0.58} rx="2" fill="white" fillOpacity={1 - i * 0.25} />
        ))}
      </>
    ),
    security: (
      <>
        <path d={`M${c},${c - s * 1.3} L${c + s * 1.2},${c - s * 0.6} L${c + s * 1.2},${c + s * 0.4} Q${c},${c + s * 1.4} ${c - s * 1.2},${c + s * 0.4} L${c - s * 1.2},${c - s * 0.6} Z`} fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.5" />
        <circle cx={c} cy={c - s * 0.15} r={s * 0.45} fill="white" />
        <rect x={c - s * 0.2} y={c + s * 0.2} width={s * 0.4} height={s * 0.6} rx="1" fill="white" />
      </>
    ),
    monitor: (
      <>
        <rect x={c - s * 1.2} y={c - s * 0.9} width={s * 2.4} height={s * 1.6} rx="3" fill="none" stroke="white" strokeWidth="1.5" />
        <polyline points={`${c - s},${c + s * 0.1} ${c - s * 0.5},${c - s * 0.4} ${c},${c + s * 0.3} ${c + s * 0.5},${c - s * 0.6} ${c + s},${c}`} fill="none" stroke="white" strokeWidth="2" />
      </>
    ),
    identity: (
      <>
        <circle cx={c} cy={c - s * 0.5} r={s * 0.8} fill="white" fillOpacity="0.25" stroke="white" strokeWidth="1.5" />
        <circle cx={c} cy={c - s * 0.5} r={s * 0.4} fill="white" />
        <path d={`M${c - s * 1.2},${c + s * 1.1} Q${c - s * 1.2},${c + s * 0.2} ${c},${c + s * 0.2} Q${c + s * 1.2},${c + s * 0.2} ${c + s * 1.2},${c + s * 1.1}`} fill="white" fillOpacity="0.25" stroke="white" strokeWidth="1.5" />
      </>
    ),
    devops: (
      <>
        <circle cx={c} cy={c} r={s * 1.2} fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="3,2" />
        <path d={`M${c - s * 0.7},${c} A${s * 0.7},${s * 0.7} 0 0,1 ${c + s * 0.7},${c}`} fill="none" stroke="white" strokeWidth="2" />
        <polygon points={`${c + s * 0.7},${c - s * 0.3} ${c + s * 1.1},${c} ${c + s * 0.7},${c + s * 0.3}`} fill="white" />
        <polygon points={`${c - s * 0.7},${c - s * 0.3} ${c - s * 1.1},${c} ${c - s * 0.7},${c + s * 0.3}`} fill="white" />
      </>
    ),
    finops: (
      <>
        <circle cx={c} cy={c} r={s * 1.2} fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5" />
        <text x={c} y={c + s * 0.45} textAnchor="middle" fontSize={s * 1.6} fill="white" fontWeight="800" fontFamily="Arial">$</text>
      </>
    ),
    bcdr: (
      <>
        <path d={`M${c},${c - s * 1.3} L${c + s * 1.1},${c - s * 0.4} L${c + s * 0.7},${c + s * 1.1} L${c - s * 0.7},${c + s * 1.1} L${c - s * 1.1},${c - s * 0.4} Z`} fill="none" stroke="white" strokeWidth="1.5" />
        <path d={`M${c - s * 0.5},${c} Q${c},${c - s * 0.8} ${c + s * 0.5},${c}`} fill="none" stroke="white" strokeWidth="2" />
        <polygon points={`${c + s * 0.5},${c - s * 0.3} ${c + s * 0.8},${c} ${c + s * 0.5},${c + s * 0.3}`} fill="white" />
      </>
    ),
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {icons[type] ?? icons.compute}
    </svg>
  );
}

const ICON_BOX = 56;   // icon square size
const LABEL_H = 32;    // label area height below icon
const NODE_W = 80;     // total node width (box + padding)
const NODE_H = ICON_BOX + LABEL_H;
const COL_GAP = 50;    // horizontal gap between nodes
const ROW_GAP = 40;    // vertical gap between rows
const HEADER_H = 56;
const PAD = 24;

export default function AzureArchitectureDiagram({ code }: { code: string }) {
  const config = useMemo<DiagramConfig | null>(() => {
    try { return JSON.parse(code); } catch { return null; }
  }, [code]);

  if (!config) {
    return (
      <div className="my-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Could not parse Azure architecture diagram.
      </div>
    );
  }

  // Flatten services into rows by tier
  // Special layout: tiers become columns, services in a tier stack vertically
  const tiers = config.tiers;

  // Compute node positions: each tier is a column
  type NodePos = { id: string; name: string; sub?: string; type: string; x: number; y: number; cx: number; cy: number };
  const nodeMap: Record<string, NodePos> = {};
  const allNodes: NodePos[] = [];

  let curX = PAD;
  for (const tier of tiers) {
    let curY = HEADER_H + PAD;
    for (const svc of tier.services) {
      const cx = curX + NODE_W / 2;
      const cy = curY + NODE_H / 2;
      const pos: NodePos = { id: svc.id, name: svc.name, sub: svc.sub, type: svc.type, x: curX, y: curY, cx, cy };
      nodeMap[svc.id] = pos;
      allNodes.push(pos);
      curY += NODE_H + ROW_GAP;
    }
    curX += NODE_W + COL_GAP;
  }

  const svgW = curX - COL_GAP + PAD;
  const maxY = Math.max(...allNodes.map(n => n.y + NODE_H));
  const svgH = maxY + PAD;

  // Draw connections
  const connections = config.connections;

  return (
    <div style={{ margin: "16px 0", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0", background: "#ffffff", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "auto" }}
        xmlns="http://www.w3.org/2000/svg" fontFamily="'Segoe UI', Arial, sans-serif">
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#0078D4" />
          </marker>
          <marker id="arrd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* White background */}
        <rect width={svgW} height={svgH} fill="#ffffff" />

        {/* Header */}
        <rect width={svgW} height={HEADER_H} fill="#1a1a2e" />
        <text x={svgW / 2} y={24} textAnchor="middle" fontSize={13} fontWeight={700} fill="#FFCD00">
          Azure Cloud Architecture — {config.applicationName}
        </text>
        <text x={svgW / 2} y={42} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.55)">
          {config.region} · {config.networkPosture}{config.drEnabled ? " · DR Enabled" : ""}
        </text>

        {/* Tier column labels */}
        {tiers.map((tier, i) => {
          const firstInTier = allNodes.find(n => tiers[i].services.some(s => s.id === n.id));
          if (!firstInTier) return null;
          const midX = firstInTier.cx;
          return (
            <text key={i} x={midX} y={HEADER_H + 14} textAnchor="middle"
              fontSize={8} fontWeight={700} fill="#94a3b8" letterSpacing={1}>
              {tier.label.toUpperCase()}
            </text>
          );
        })}

        {/* Connections */}
        {connections.map(([from, to, style], idx) => {
          const a = nodeMap[from];
          const b = nodeMap[to];
          if (!a || !b) return null;
          const dashed = style === "dashed";
          const marker = dashed ? "url(#arrd)" : "url(#arr)";
          const stroke = dashed ? "#cbd5e1" : "#0078D4";
          const sw = dashed ? 1.5 : 2;

          // Horizontal connection (same row, different column)
          if (Math.abs(a.cy - b.cy) < 10) {
            return (
              <line key={idx}
                x1={a.x + NODE_W} y1={a.cy}
                x2={b.x} y2={b.cy}
                stroke={stroke} strokeWidth={sw}
                strokeDasharray={dashed ? "5,3" : undefined}
                markerEnd={marker} />
            );
          }

          // Vertical/diagonal — use a curved path
          const x1 = a.x + NODE_W / 2;
          const y1 = a.y + NODE_H;
          const x2 = b.x + NODE_W / 2;
          const y2 = b.y;
          return (
            <path key={idx}
              d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
              fill="none" stroke={stroke} strokeWidth={sw}
              strokeDasharray={dashed ? "5,3" : undefined}
              markerEnd={marker} />
          );
        })}

        {/* Step numbers on connections */}
        {connections.filter(([, , s]) => s !== "dashed").map(([from, to], idx) => {
          const a = nodeMap[from];
          const b = nodeMap[to];
          if (!a || !b) return null;
          const mx = (a.cx + b.cx) / 2;
          const my = Math.abs(a.cy - b.cy) < 10 ? a.cy - 12 : (a.y + NODE_H + b.y) / 2;
          return (
            <g key={`step-${idx}`}>
              <circle cx={mx} cy={my} r={9} fill="#0078D4" />
              <text x={mx} y={my + 4} textAnchor="middle" fontSize={9} fontWeight={700} fill="white">
                {idx + 1}
              </text>
            </g>
          );
        })}

        {/* Service nodes */}
        {allNodes.map((n) => {
          const color = AZ_COLOR[n.type] ?? "#0078D4";
          const iconX = n.x + (NODE_W - ICON_BOX) / 2;
          const iconY = n.y;
          const labelY = n.y + ICON_BOX + 6;

          return (
            <g key={n.id}>
              {/* Icon box with rounded corners */}
              <rect x={iconX} y={iconY} width={ICON_BOX} height={ICON_BOX} rx={10}
                fill={color} />
              {/* Subtle highlight overlay */}
              <rect x={iconX} y={iconY} width={ICON_BOX} height={ICON_BOX / 2} rx={10}
                fill="white" fillOpacity={0.08} />

              {/* Azure service icon */}
              <foreignObject x={iconX + (ICON_BOX - 32) / 2} y={iconY + (ICON_BOX - 32) / 2} width={32} height={32}>
                <div xmlns="http://www.w3.org/1999/xhtml">
                  <ServiceIcon type={n.type} size={32} />
                </div>
              </foreignObject>

              {/* Service name */}
              <text x={n.cx} y={labelY + 10} textAnchor="middle"
                fontSize={9} fontWeight={700} fill="#1e293b">
                {n.name}
              </text>
              {n.sub && (
                <text x={n.cx} y={labelY + 22} textAnchor="middle"
                  fontSize={8} fill="#64748b">
                  {n.sub.length > 18 ? n.sub.slice(0, 17) + "…" : n.sub}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
