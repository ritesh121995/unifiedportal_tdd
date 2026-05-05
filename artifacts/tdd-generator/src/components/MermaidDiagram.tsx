import { useEffect, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  themeVariables: {
    primaryColor: "#FFCD00",
    primaryTextColor: "#1e1e2e",
    primaryBorderColor: "#C49F00",
    lineColor: "#605E5C",
    secondaryColor: "#FFF3CC",
    tertiaryColor: "#FFFAE6",
    background: "#ffffff",
    mainBkg: "#FFFAE6",
    nodeBorder: "#C49F00",
    clusterBkg: "#FFFBF0",
    titleColor: "#1a1a2e",
    edgeLabelBackground: "#ffffff",
    fontFamily: "'Segoe UI', sans-serif",
    fontSize: "14px",
  },
  flowchart: {
    htmlLabels: true,
    curve: "basis",
    padding: 20,
  },
  securityLevel: "loose",
});

interface MermaidDiagramProps {
  code: string;
}

function svgContainsMermaidSyntaxError(svg: string): boolean {
  return /syntax error in text/i.test(svg);
}

function containsMermaidEngineNoise(diagramCode: string): boolean {
  const normalized = diagramCode.toLowerCase();
  return (
    normalized.includes("syntax error in text") ||
    /mermaid version\s+\d+\.\d+\.\d+/.test(normalized)
  );
}

function looksLikeValidMermaidStarter(diagramCode: string): boolean {
  const normalized = diagramCode.trim().toLowerCase();
  return (
    /^graph(\s|$)/.test(normalized) ||
    /^flowchart(\s|$)/.test(normalized) ||
    /^sequencediagram(\s|$)/.test(normalized) ||
    /^classdiagram(\s|$)/.test(normalized) ||
    /^statediagram(\s|$)/.test(normalized) ||
    /^erdiagram(\s|$)/.test(normalized) ||
    /^journey(\s|$)/.test(normalized) ||
    /^gantt(\s|$)/.test(normalized) ||
    /^pie(\s|$)/.test(normalized) ||
    /^mindmap(\s|$)/.test(normalized) ||
    /^timeline(\s|$)/.test(normalized) ||
    /^gitgraph(\s|$)/.test(normalized)
  );
}

/**
 * Client-side sanitizer for Mermaid v11 compatibility.
 * Mirrors the server-side sanitizeMermaidBody logic.
 */
function sanitizeMermaidCode(code: string): string {
  const lines = code.split("\n").map((line) => {
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("%%")) return line;

    // Keep control keywords as-is
    if (
      /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitgraph)(\s|$)/i.test(trimmed) ||
      /^(subgraph|end|direction|click|style|classDef|linkStyle|note)(\s|$)/i.test(trimmed)
    ) {
      return line;
    }

    // Remove markdown table lines
    if (trimmed.startsWith("|")) return "";

    // Remove horizontal rules
    if (/^[-*]{3,}$/.test(trimmed)) return "";

    // Fix unquoted node labels that contain parentheses or special chars
    // that Mermaid v11 might misinterpret as shape syntax.
    // Excludes labels starting with ( to preserve cylinder [(label)] shapes.
    const fixedLine = line.replace(
      /\b(\w+)\[([^(\]"<>][^\]]*[()#+&][^\]]*)\]/g,
      (_m, id: string, label: string) => `${id}["${label.replace(/"/g, "'")}"]`,
    );
    return fixedLine;
  });

  return lines.filter((l) => l !== undefined).join("\n");
}

export default function MermaidDiagram({ code }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [showSource, setShowSource] = useState(false);
  const normalizedCode = useMemo(
    () => code.trim().replaceAll("\r\n", "\n"),
    [code],
  );

  useEffect(() => {
    if (normalizedCode.length === 0) {
      setSvg("");
      setError("Empty diagram source.");
      return;
    }
    if (
      containsMermaidEngineNoise(normalizedCode) ||
      !looksLikeValidMermaidStarter(normalizedCode)
    ) {
      setSvg("");
      setError(
        "Diagram source does not start with a recognised Mermaid keyword (e.g. graph TD). The document was still generated successfully.",
      );
      return;
    }

    const sanitized = sanitizeMermaidCode(normalizedCode);
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    mermaid
      .render(id, sanitized)
      .then(({ svg: renderedSvg }) => {
        if (svgContainsMermaidSyntaxError(renderedSvg)) {
          setError(
            "Mermaid v11 reported a syntax error. The document was still generated. Expand below to inspect the diagram source.",
          );
          setSvg("");
          return;
        }
        setSvg(renderedSvg);
        setError("");
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(
          `Diagram render failed: ${msg}. The document was still generated successfully. Expand below to inspect the source.`,
        );
        setSvg("");
      });
  }, [normalizedCode]);

  if (error) {
    return (
      <div className="my-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <strong>Diagram could not be rendered.</strong>{" "}
        <span>{error}</span>
        <div className="mt-2">
          <button
            type="button"
            className="text-xs underline text-amber-700 hover:text-amber-900"
            onClick={() => setShowSource((v) => !v)}
          >
            {showSource ? "Hide diagram source" : "Show diagram source"}
          </button>
        </div>
        {showSource && (
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-white border border-amber-200 p-2 text-xs text-slate-700 whitespace-pre-wrap">
            {normalizedCode}
          </pre>
        )}
        <p className="mt-2 text-xs opacity-70">
          You can continue to export the document — the diagram will be omitted from the export.
        </p>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-4 flex items-center justify-center rounded border border-yellow-200 bg-yellow-50 p-8 text-sm text-yellow-800">
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="my-6 overflow-x-auto rounded-lg border border-yellow-200 bg-white p-4 shadow-sm"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
