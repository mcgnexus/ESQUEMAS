"use client";

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  Connection,
  ConnectionLineType,
  Controls,
  Edge,
  Handle,
  MarkerType,
  Node,
  NodeProps,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import { ArrowLeft, BookOpen, Download, Edit2, LayoutPanelTop, Move, Save, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { domToCanvas, domToPng } from "modern-screenshot";
import jsPDF from "jspdf";
import mermaid from "mermaid";

type NodeType = "root" | "category" | "content" | "example";
type Orientation = "vertical" | "horizontal";
type ZoomPreset = "fit" | 0.25 | 0.5 | 0.75 | 1;
type RenderEngine = "mermaid" | "flow";
type MermaidDiagramType = "flowchart" | "mindmap";
type MermaidTheme = "default" | "neutral" | "dark" | "forest";
type MermaidCurve = "basis" | "linear" | "stepBefore" | "stepAfter" | "monotoneX";

const A4 = {
  vertical: { width: 794, height: 1123 },
  horizontal: { width: 1123, height: 794 },
};
const MARGIN_MM = 10;
const MARGIN_PX = Math.round((96 / 25.4) * MARGIN_MM);

const sanitizeSvgForCanvas = (rawSvg: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawSvg, "image/svg+xml");
  const svg = doc.documentElement;

  if (!svg.getAttribute("xmlns")) {
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  doc.querySelectorAll("script, iframe, object, embed").forEach((el) => el.remove());
  doc.querySelectorAll("image").forEach((el) => {
    const href = el.getAttribute("href") || el.getAttribute("xlink:href") || "";
    if (href && !href.startsWith("data:")) el.remove();
  });

  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.value.includes("url(")) {
        const safeValue = attr.value.replace(/url\((['"]?)(?!#)[^)]+\1\)/g, "none");
        el.setAttribute(attr.name, safeValue);
      }
    }
  });

  doc.querySelectorAll("style").forEach((styleEl) => {
    styleEl.textContent = (styleEl.textContent || "").replace(/@import[^;]+;/g, "");
  });

  return new XMLSerializer().serializeToString(doc);
};

type StudyNodeData = {
  label: string;
  ejemplos?: string[];
  rol?: string;
  nivel?: number;
  nodeType?: NodeType;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
  textColor?: string;
  fontWeight?: "normal" | "bold";
  lineHeight?: number;
  nodeBgColor?: string;
  isEditMode?: boolean;
  onLabelChange?: (id: string, value: string) => void;
};

const nodeDims: Record<NodeType, { width: number; height: number }> = {
  root: { width: 240, height: 140 },
  category: { width: 120, height: 48 },
  content: { width: 220, height: 120 },
  example: { width: 220, height: 130 },
};

const inferType = (raw: { nivel?: number; texto: string; ejemplos?: string[]; nodeType?: NodeType }): NodeType => {
  if (raw.nodeType) return raw.nodeType;
  if ((raw.nivel || 1) === 1) return "root";
  if (raw.ejemplos?.length) return "example";
  const t = raw.texto.toLowerCase();
  if (["reflejos", "primarios", "secundarios", "voluntarios"].some((k) => t.includes(k)) && raw.texto.length < 20) {
    return "category";
  }
  return "content";
};

const styleByType = (type: NodeType) => {
  if (type === "root") return { bg: "#FFC107", border: "#FF6F00", text: "#000", bw: 3, fs: "16px" };
  if (type === "category") return { bg: "transparent", border: "transparent", text: "#D32F2F", bw: 0, fs: "14px" };
  if (type === "example") return { bg: "#F5F5F5", border: "#D32F2F", text: "#333", bw: 2, fs: "12px" };
  return { bg: "#E3F2FD", border: "#D32F2F", text: "#333", bw: 2, fs: "12px" };
};

const StudyNode = ({ id, data }: NodeProps<StudyNodeData>) => {
  const t = data.nodeType || "content";
  const s = styleByType(t);

  return (
    <div
      className="cursor-pointer transition-all focus-visible:ring-2 focus-visible:ring-indigo-500"
      tabIndex={data.isEditMode ? -1 : 0}
      role="button"
      aria-label={`Nodo ${data.label}`}
      style={{
        backgroundColor: data.nodeBgColor || s.bg,
        borderColor: s.border,
        borderWidth: s.bw,
        borderStyle: "solid",
        color: data.textColor || s.text,
        fontSize: data.fontSize ? `${data.fontSize}px` : s.fs,
        textAlign: data.textAlign || "left",
        fontWeight: data.fontWeight || undefined,
        lineHeight: data.lineHeight || 1.25,
        borderRadius: t === "category" ? 0 : 12,
        minWidth: t === "category" ? "auto" : 140,
        maxWidth: t === "category" ? "none" : 280,
        padding: t === "category" ? "4px 8px" : "12px 16px",
      }}
    >
      <Handle type="target" position={Position.Top} className={t === "category" ? "!w-1 !h-1 !bg-transparent !border-0" : ""} />
      {data.isEditMode ? (
        <textarea value={data.label} rows={2} className="w-full text-sm bg-white/80 border rounded p-2" style={{ textAlign: data.textAlign || "left" }} onChange={(e) => data.onLabelChange?.(id, e.target.value)} />
      ) : (
        <div>{data.label}</div>
      )}
      {!!data.ejemplos?.length && (
        <ul className="mt-2 pt-2 border-t border-slate-300/50 text-[11px] italic">
          {data.ejemplos.map((e, i) => (
            <li key={i}>* {e}</li>
          ))}
        </ul>
      )}
      <Handle type="source" position={Position.Bottom} className={t === "category" ? "!w-1 !h-1 !bg-transparent !border-0" : ""} />
    </div>
  );
};

const nodeTypes = { studyNode: StudyNode };

const bounds = (nodes: Node[]) => {
  if (!nodes.length) return { w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach((n) => {
    const d = nodeDims[(n.data?.nodeType as NodeType) || "content"];
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + d.width);
    maxY = Math.max(maxY, n.position.y + d.height);
  });
  return { w: maxX - minX, h: maxY - minY };
};

const bestOrientation = (nodes: Node[]): Orientation => {
  const b = bounds(nodes);
  const fit = (o: Orientation) => {
    const p = A4[o];
    const sx = (p.width - 2 * MARGIN_PX) / Math.max(1, b.w);
    const sy = (p.height - 2 * MARGIN_PX) / Math.max(1, b.h);
    return Math.min(sx, sy);
  };
  return fit("horizontal") > fit("vertical") ? "horizontal" : "vertical";
};

const layout = (nodes: Node[], edges: Edge[], type: string) => {
  if (type === "radial" || type === "circular") {
    const lv: Record<number, Node[]> = {};
    nodes.forEach((n) => {
      const l = n.data.nivel || 1;
      if (!lv[l]) lv[l] = [];
      lv[l].push(n);
    });
    return nodes.map((n) => {
      const l = n.data.nivel || 1;
      const items = lv[l];
      const idx = items.indexOf(n);
      const angle = items.length ? (idx / items.length) * Math.PI * 2 : 0;
      const d = nodeDims[(n.data?.nodeType as NodeType) || "content"];
      const r = (l - 1) * 300;
      return { ...n, position: { x: r * Math.cos(angle) - d.width / 2, y: r * Math.sin(angle) - d.height / 2 } };
    });
  }
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: type === "lineal" ? "LR" : "TB",
    ranksep: 170,
    nodesep: 130,
    edgesep: 90,
    marginx: 40,
    marginy: 40,
    ranker: "tight-tree",
    acyclicer: "greedy",
  });
  nodes.forEach((n) => g.setNode(n.id, nodeDims[(n.data?.nodeType as NodeType) || "content"]));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    const d = nodeDims[(n.data?.nodeType as NodeType) || "content"];
    return { ...n, position: { x: pos.x - d.width / 2, y: pos.y - d.height / 2 } };
  });
};

interface VisualSchemaProps { schema: unknown; onBack: () => void; onSave: (nodes: Node[], edges: Edge[]) => void; }
interface FlowHandle { get: () => { nodes: Node[]; edges: Edge[] }; applyZoom: (z: ZoomPreset) => void; fit: () => void; }
interface FlowProps {
  schema: unknown;
  layoutType: "jerarquico" | "lineal" | "radial" | "circular" | `hibrido_${string}`;
  isEdit: boolean;
  zoomPreset: ZoomPreset;
  fitTick: number;
  onNodesReady: (nodes: Node[]) => void;
}

const FlowCanvasComponent = ({ schema, layoutType, isEdit, zoomPreset, fitTick, onNodesReady }: FlowProps, ref: React.Ref<FlowHandle>) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [ctx, setCtx] = useState<{ x: number; y: number; id: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const rf = useReactFlow();

  const applyZoom = useCallback((z: ZoomPreset) => (z === "fit" ? rf.fitView({ padding: 0.1, duration: 300, minZoom: 0.25, maxZoom: 2 }) : rf.zoomTo(z, { duration: 200 })), [rf]);
  useImperativeHandle(ref, () => ({ get: () => ({ nodes: rf.getNodes(), edges: rf.getEdges() }), applyZoom, fit: () => rf.fitView({ padding: 0.1, duration: 300, minZoom: 0.25, maxZoom: 2 }) }));

  useEffect(() => {
    if (!schema) return;
    const s = schema as {
      tipo_esquema?: string;
      nodos: Array<{ id: string | number; texto: string; ejemplos?: string[]; rol?: string; nivel?: number; parent_id?: string | number | null; position?: { x: number; y: number }; nodeType?: NodeType; estilo?: { fontSize?: number; textAlign?: "left" | "center" | "right"; textColor?: string; fontWeight?: "normal" | "bold"; lineHeight?: number; nodeBgColor?: string } }>;
      conexiones_flujo?: Array<{ from: string | number; to: string | number; etiqueta?: string; tipo?: "solid" | "dashed" }>;
    };
    const nodos = Array.isArray(s.nodos) ? s.nodos : [];
    const n: Node[] = nodos.map((x) => ({
      id: String(x.id),
      type: "studyNode",
      position: x.position || { x: 0, y: 0 },
      data: {
        label: x.texto,
        ejemplos: x.ejemplos,
        rol: x.rol,
        nivel: x.nivel,
        nodeType: inferType(x),
        fontSize: x.estilo?.fontSize,
        textAlign: x.estilo?.textAlign,
        textColor: x.estilo?.textColor,
        fontWeight: x.estilo?.fontWeight,
        lineHeight: x.estilo?.lineHeight,
        nodeBgColor: x.estilo?.nodeBgColor,
        isEditMode: false,
        onLabelChange: (id: string, value: string) => setNodes((prev) => prev.map((z) => z.id === id ? { ...z, data: { ...z.data, label: value } } : z)),
      },
    }));
    const e1: Edge[] = nodos.filter((x) => x.parent_id != null).map((x) => ({ id: `e-${x.parent_id}-${x.id}`, source: String(x.parent_id), target: String(x.id), type: "smoothstep", style: { stroke: "#000", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#000" } }));
    const e2: Edge[] = (s.conexiones_flujo || []).map((c, i) => ({
      id: `f-${i}`,
      source: String(c.from),
      target: String(c.to),
      label: c.etiqueta,
      type: "smoothstep",
      style: { stroke: "#1f2937", strokeWidth: 2.2, strokeDasharray: c.tipo === "dashed" ? "6,4" : "none" },
      labelStyle: { fill: "#111827", fontWeight: 800, fontSize: 15 },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.95, stroke: "#111827", strokeWidth: 0.8 },
      labelBgPadding: [8, 6],
      labelBgBorderRadius: 8,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#1f2937" },
    }));
    const laid = layout(n, [...e1, ...e2], s.tipo_esquema || "jerarquico");
    setNodes(laid);
    setEdges([...e1, ...e2]);
    requestAnimationFrame(() => { onNodesReady(laid); rf.fitView({ padding: 0.1, duration: 300 }); });
  }, [schema, setNodes, setEdges, onNodesReady, rf]);

  useEffect(() => setNodes((arr) => arr.map((n) => ({ ...n, data: { ...n.data, isEditMode: isEdit } }))), [isEdit, setNodes]);
  useEffect(() => {
    const currentNodes = rf.getNodes();
    if (!currentNodes.length) return;
    const laid = layout(currentNodes, rf.getEdges(), layoutType);
    setNodes(laid);
    requestAnimationFrame(() => {
      onNodesReady(laid);
      applyZoom("fit");
    });
  }, [layoutType, setNodes, rf, onNodesReady, applyZoom]);
  useEffect(() => {
    applyZoom(zoomPreset);
  }, [zoomPreset, applyZoom]);
  useEffect(() => {
    applyZoom("fit");
  }, [fitTick, applyZoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isEdit || !selected) return;
      if ((e.key === "Delete" || e.key === "Backspace") && !["input", "textarea"].includes((e.target as HTMLElement)?.tagName.toLowerCase())) {
        e.preventDefault();
        setNodes((x) => x.filter((n) => n.id !== selected));
        setEdges((x) => x.filter((ed) => ed.source !== selected && ed.target !== selected));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isEdit, selected, setNodes, setEdges]);

  const onConnect = useCallback((c: Connection) => {
    if (!isEdit) return;
    setEdges((eds) => addEdge({ ...c, type: ConnectionLineType.SmoothStep, style: { stroke: "#333", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#333" } }, eds));
  }, [isEdit, setEdges]);

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodesDraggable={isEdit}
        nodesConnectable={isEdit}
        edgesUpdatable={isEdit}
        minZoom={0.25}
        maxZoom={2}
        onSelectionChange={({ nodes: s }) => setSelected(s?.[0]?.id || null)}
        onPaneClick={() => setCtx(null)}
        onNodeContextMenu={(ev, node) => { if (!isEdit) return; ev.preventDefault(); setSelected(node.id); setCtx({ x: ev.clientX + 4, y: ev.clientY + 4, id: node.id }); }}
        defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "#000", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#000" } }}
      >
        <Background color="#e2e8f0" gap={25} />
        <Controls />
      </ReactFlow>
      {ctx && (
        <div className="fixed z-[1200] w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-2" style={{ left: ctx.x, top: ctx.y }}>
          <button className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100" onClick={() => { const src = rf.getNodes().find((n) => n.id === ctx.id); if (!src) return; const id = `dup_${Date.now()}`; setNodes((v) => [...v, { ...src, id, position: { x: src.position.x + 50, y: src.position.y + 50 } }]); setCtx(null); }}>Duplicar nodo</button>
          <button className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-700 hover:bg-red-50" onClick={() => { setNodes((v) => v.filter((n) => n.id !== ctx.id)); setEdges((v) => v.filter((e) => e.source !== ctx.id && e.target !== ctx.id)); setCtx(null); }}>Eliminar nodo</button>
          <div className="my-1 border-t" />
          <button className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100" onClick={() => { setNodes((v) => v.map((n) => n.id === ctx.id ? { ...n, data: { ...n.data, nodeType: "content" } } : n)); setCtx(null); }}>Tipo: Contenido</button>
          <button className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100" onClick={() => { setNodes((v) => v.map((n) => n.id === ctx.id ? { ...n, data: { ...n.data, nodeType: "example" } } : n)); setCtx(null); }}>Tipo: Ejemplo</button>
          <button className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100" onClick={() => { setNodes((v) => v.map((n) => n.id === ctx.id ? { ...n, data: { ...n.data, nodeType: "category" } } : n)); setCtx(null); }}>Tipo: Categoria</button>
          <div className="my-1 border-t" />
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Tipografia</div>
          <div className="grid grid-cols-3 gap-1 px-2 pb-1">
            <button className="px-2 py-1 rounded-md text-xs bg-slate-100 hover:bg-slate-200" onClick={() => setNodes((v) => v.map((n) => n.id === ctx.id ? { ...n, data: { ...n.data, fontSize: Math.max(10, (n.data.fontSize || 12) - 1) } } : n))}>A-</button>
            <button className="px-2 py-1 rounded-md text-xs bg-slate-100 hover:bg-slate-200" onClick={() => setNodes((v) => v.map((n) => n.id === ctx.id ? { ...n, data: { ...n.data, fontWeight: n.data.fontWeight === "bold" ? "normal" : "bold" } } : n))}>Negrita</button>
            <button className="px-2 py-1 rounded-md text-xs bg-slate-100 hover:bg-slate-200" onClick={() => setNodes((v) => v.map((n) => n.id === ctx.id ? { ...n, data: { ...n.data, fontSize: Math.min(28, (n.data.fontSize || 12) + 1) } } : n))}>A+</button>
          </div>
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Parrafo</div>
          <div className="grid grid-cols-3 gap-1 px-2 pb-1">
            <button className="px-2 py-1 rounded-md text-xs bg-slate-100 hover:bg-slate-200" onClick={() => setNodes((v) => v.map((n) => n.id === ctx.id ? { ...n, data: { ...n.data, textAlign: "left" } } : n))}>Izq</button>
            <button className="px-2 py-1 rounded-md text-xs bg-slate-100 hover:bg-slate-200" onClick={() => setNodes((v) => v.map((n) => n.id === ctx.id ? { ...n, data: { ...n.data, textAlign: "center" } } : n))}>Centro</button>
            <button className="px-2 py-1 rounded-md text-xs bg-slate-100 hover:bg-slate-200" onClick={() => setNodes((v) => v.map((n) => n.id === ctx.id ? { ...n, data: { ...n.data, textAlign: "right" } } : n))}>Der</button>
          </div>
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Interlineado</div>
          <div className="grid grid-cols-3 gap-1 px-2 pb-1">
            {[1.1, 1.25, 1.5].map((lh) => (
              <button
                key={lh}
                className="px-2 py-1 rounded-md text-xs bg-slate-100 hover:bg-slate-200"
                onClick={() => setNodes((v) => v.map((n) => n.id === ctx.id ? { ...n, data: { ...n.data, lineHeight: lh } } : n))}
              >
                {lh}
              </button>
            ))}
          </div>
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Color fuente</div>
          <div className="grid grid-cols-4 gap-1 px-2 pb-2">
            {["#111827", "#1d4ed8", "#047857", "#b91c1c"].map((color) => (
              <button
                key={color}
                className="h-7 rounded-md border border-slate-200"
                style={{ backgroundColor: color }}
                onClick={() => setNodes((v) => v.map((n) => n.id === ctx.id ? { ...n, data: { ...n.data, textColor: color } } : n))}
                aria-label={`Color ${color}`}
              />
            ))}
          </div>
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Fondo nodo</div>
          <div className="grid grid-cols-5 gap-1 px-2 pb-2">
            {["", "#ffffff", "#fef9c3", "#dcfce7", "#dbeafe"].map((color, idx) => (
              <button
                key={`${color}-${idx}`}
                className="h-7 rounded-md border border-slate-200"
                style={{ backgroundColor: color || "transparent" }}
                onClick={() => setNodes((v) => v.map((n) => n.id === ctx.id ? { ...n, data: { ...n.data, nodeBgColor: color || undefined } } : n))}
                aria-label={color ? `Fondo ${color}` : "Quitar fondo personalizado"}
                title={color ? "Aplicar fondo" : "Quitar fondo personalizado"}
              />
            ))}
          </div>
          <div className="px-2 pb-1">
            <button
              className="w-full px-3 py-2 rounded-lg text-sm text-slate-700 bg-slate-100 hover:bg-slate-200"
              onClick={() =>
                setNodes((v) =>
                  v.map((n) =>
                    n.id === ctx.id
                      ? {
                          ...n,
                          data: {
                            ...n.data,
                            fontSize: undefined,
                            textAlign: undefined,
                            textColor: undefined,
                            fontWeight: undefined,
                            lineHeight: undefined,
                            nodeBgColor: undefined,
                          },
                        }
                      : n,
                  ),
                )
              }
            >
              Restablecer estilo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
const FlowCanvas = forwardRef(FlowCanvasComponent);

const MermaidCanvas = ({
  schema,
  orientation,
  labelMap,
  diagramType,
  theme,
  curve,
  nodeSpacing,
  rankSpacing,
  onSvgChange,
}: {
  schema: unknown;
  orientation: Orientation;
  labelMap: Record<string, string>;
  diagramType: MermaidDiagramType;
  theme: MermaidTheme;
  curve: MermaidCurve;
  nodeSpacing: number;
  rankSpacing: number;
  onSvgChange?: (svg: string) => void;
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const buildMermaidDefinition = useCallback(() => {
    const s = schema as {
      nodos?: Array<{ id: string | number; texto: string; parent_id?: string | number | null; nodeType?: NodeType }>;
      conexiones_flujo?: Array<{ from: string | number; to: string | number; etiqueta?: string; tipo?: "solid" | "dashed" }>;
    };
    const nodes = Array.isArray(s?.nodos) ? s.nodos : [];
    if (!nodes.length) return "flowchart TB\nA[\"Sin datos\"]";

    const dir = orientation === "horizontal" ? "LR" : "TB";
    const escapeFlow = (v: string) =>
      v
        .replace(/"/g, '\\"')
        .replace(/\n/g, " ")
        .replace(/\[/g, "(")
        .replace(/\]/g, ")");
    const escapeMindmap = (v: string) =>
      v
        .replace(/\n/g, " ")
        .replace(/"/g, "'")
        .replace(/\[/g, "(")
        .replace(/\]/g, ")")
        .replace(/\s+/g, " ")
        .trim();
    const idMap = new Map<string, string>();
    const lines: string[] = [];

    if (diagramType === "mindmap") {
      lines.push("mindmap");
      const byParent = new Map<string, Array<{ id: string | number; texto: string; parent_id?: string | number | null }>>();
      const roots: Array<{ id: string | number; texto: string; parent_id?: string | number | null }> = [];
      let seq = 0;
      const nodeRef = () => `MM${++seq}`;
      nodes.forEach((n) => {
        if (n.parent_id == null) {
          roots.push(n);
          return;
        }
        const key = String(n.parent_id);
        const list = byParent.get(key) || [];
        list.push(n);
        byParent.set(key, list);
      });

      const buildTree = (node: { id: string | number; texto: string }, depth: number) => {
        const pad = "  ".repeat(depth);
        const label = escapeMindmap(labelMap[String(node.id)] ?? node.texto ?? "");
        lines.push(`${pad}${nodeRef()}["${label}"]`);
        const children = byParent.get(String(node.id)) || [];
        children.forEach((child) => buildTree(child, depth + 1));
      };

      if (roots.length === 1) {
        lines.push(`  root((${escapeMindmap(labelMap[String(roots[0].id)] ?? roots[0].texto ?? "Tema")}))`);
        const children = byParent.get(String(roots[0].id)) || [];
        children.forEach((child) => buildTree(child, 2));
      } else {
        lines.push(`  root((${escapeMindmap((schema as { tema_central?: string })?.tema_central || "Esquema")}))`);
        roots.forEach((r) => buildTree(r, 2));
      }
      return lines.join("\n");
    }

    lines.push(`flowchart ${dir}`);

    nodes.forEach((n, idx) => {
      const id = `N${idx + 1}`;
      idMap.set(String(n.id), id);
      const label = labelMap[String(n.id)] ?? n.texto ?? "";
      lines.push(`${id}["${escapeFlow(label)}"]`);
    });

    const classMap: Record<NodeType, string[]> = { root: [], category: [], content: [], example: [] };
    nodes.forEach((n) => {
      const type = (n.nodeType || "content") as NodeType;
      const mermaidId = idMap.get(String(n.id));
      if (mermaidId && classMap[type]) classMap[type].push(mermaidId);
      if (n.parent_id != null) {
        const parent = idMap.get(String(n.parent_id));
        if (parent && mermaidId) lines.push(`${parent} --> ${mermaidId}`);
      }
    });

    const flow = Array.isArray(s?.conexiones_flujo) ? s.conexiones_flujo : [];
    flow.forEach((e) => {
      const from = idMap.get(String(e.from));
      const to = idMap.get(String(e.to));
      if (!from || !to) return;
      const label = e.etiqueta ? `|${escapeFlow(e.etiqueta)}|` : "";
      lines.push(e.tipo === "dashed" ? `${from} -.${label}.- ${to}` : `${from} --${label}--> ${to}`);
    });

    lines.push("classDef root fill:#FFC107,stroke:#FF6F00,stroke-width:3px,color:#000;");
    lines.push("classDef category fill:#ffffff,stroke:#D32F2F,stroke-width:2px,color:#B91C1C;");
    lines.push("classDef content fill:#E3F2FD,stroke:#D32F2F,stroke-width:2px,color:#1F2937;");
    lines.push("classDef example fill:#F5F5F5,stroke:#D32F2F,stroke-width:2px,color:#111827;");
    (Object.keys(classMap) as NodeType[]).forEach((k) => {
      if (classMap[k].length) lines.push(`class ${classMap[k].join(",")} ${k};`);
    });

    return lines.join("\n");
  }, [schema, orientation, labelMap, diagramType]);

  useEffect(() => {
    let mounted = true;
    const render = async () => {
      if (!hostRef.current) return;
      setError(null);
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme,
          flowchart: { useMaxWidth: true, curve, nodeSpacing, rankSpacing },
        });
        const id = `mermaid-${Date.now()}`;
        const def = buildMermaidDefinition();
        const { svg } = await mermaid.render(id, def);
        if (!mounted || !hostRef.current) return;
        hostRef.current.innerHTML = svg;
        onSvgChange?.(svg);
      } catch (e) {
        console.error("Mermaid render error:", e);
        if (mounted) setError("No se pudo renderizar Mermaid.");
      }
    };
    void render();
    return () => {
      mounted = false;
    };
  }, [buildMermaidDefinition, theme, curve, nodeSpacing, rankSpacing, onSvgChange]);

  return (
    <div className="w-full h-full overflow-auto p-6 bg-white">
      {error ? <div className="text-sm text-red-700 font-semibold">{error}</div> : <div ref={hostRef} className="mermaid-host" />}
    </div>
  );
};

const VisualSchema = ({ schema, onBack, onSave }: VisualSchemaProps) => {
  const flowRef = useRef<FlowHandle>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const [layoutType, setLayoutType] = useState<"jerarquico" | "lineal" | "radial" | "circular" | `hibrido_${string}`>(() => {
    const t = (schema as { tipo_esquema?: string } | null | undefined)?.tipo_esquema;
    if (t === "lineal") return "lineal";
    if (t === "radial") return "radial";
    if (t === "circular") return "circular";
    if (t?.startsWith("hibrido_")) return t as `hibrido_${string}`;
    return "jerarquico";
  });
  const [isEdit, setIsEdit] = useState(false);
  const [renderEngine, setRenderEngine] = useState<RenderEngine>("mermaid");
  const [mermaidDiagramType, setMermaidDiagramType] = useState<MermaidDiagramType>("flowchart");
  const [mermaidTheme, setMermaidTheme] = useState<MermaidTheme>("default");
  const [mermaidCurve, setMermaidCurve] = useState<MermaidCurve>("basis");
  const [mermaidNodeSpacing, setMermaidNodeSpacing] = useState(45);
  const [mermaidRankSpacing, setMermaidRankSpacing] = useState(60);
  const [mermaidSvg, setMermaidSvg] = useState("");
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>("vertical");
  const [orientationMode, setOrientationMode] = useState<"auto" | "manual">("auto");
  const [zoomPreset, setZoomPreset] = useState<ZoomPreset>("fit");
  const [fitTick, setFitTick] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [viewportScale, setViewportScale] = useState(1);
  const [manualZoom, setManualZoom] = useState(1);
  const [isMermaidLabelEditorOpen, setIsMermaidLabelEditorOpen] = useState(false);
  const [mermaidLabelMap, setMermaidLabelMap] = useState<Record<string, string>>({});

  const title = (schema as { tema_central?: string } | null | undefined)?.tema_central;
  const sheet = A4[orientation];

  const schemaNodesForMermaid = useCallback(() => {
    const s = schema as {
      nodos?: Array<{ id: string | number; texto: string; parent_id?: string | number | null; position?: { x: number; y: number }; nodeType?: NodeType; estilo?: { fontSize?: number; textAlign?: "left" | "center" | "right"; textColor?: string; fontWeight?: "normal" | "bold"; lineHeight?: number; nodeBgColor?: string } }>;
      conexiones_flujo?: Array<{ from: string | number; to: string | number; etiqueta?: string; tipo?: "solid" | "dashed" }>;
    };
    return {
      nodes: Array.isArray(s?.nodos) ? s.nodos : [],
      flows: Array.isArray(s?.conexiones_flujo) ? s.conexiones_flujo : [],
    };
  }, [schema]);

  useEffect(() => {
    const { nodes } = schemaNodesForMermaid();
    const nextMap: Record<string, string> = {};
    nodes.forEach((n) => {
      nextMap[String(n.id)] = n.texto || "";
    });
    setMermaidLabelMap(nextMap);
  }, [schemaNodesForMermaid]);

  const onNodesReady = useCallback((nodes: Node[]) => {
    if (orientationMode !== "auto") return;
    setOrientation(bestOrientation(nodes));
  }, [orientationMode]);

  useEffect(() => {
    const resize = () => {
      if (!viewportRef.current) return;
      const w = Math.max(320, viewportRef.current.clientWidth - 24);
      const h = Math.max(320, viewportRef.current.clientHeight - 24);
      setViewportScale(Math.min(1, w / sheet.width, h / sheet.height));
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (viewportRef.current) ro.observe(viewportRef.current);
    window.addEventListener("resize", resize);
    return () => { ro.disconnect(); window.removeEventListener("resize", resize); };
  }, [sheet.width, sheet.height]);

  const exportPdf = useCallback(async () => {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      const scale = Math.min(4, Math.max(2, (window.devicePixelRatio || 1) * 2));
      const canvas = await domToCanvas(exportRef.current, { scale, backgroundColor: "#ffffff" });
      const pdf = new jsPDF(orientation === "vertical" ? "p" : "l", "mm", "a4");
      const iw = pdf.internal.pageSize.getWidth() - 2 * MARGIN_MM;
      const ih = pdf.internal.pageSize.getHeight() - 2 * MARGIN_MM;
      const ar = canvas.width / canvas.height;
      const pr = iw / ih;
      const w = ar > pr ? iw : ih * ar;
      const h = ar > pr ? iw / ar : ih;
      const x = MARGIN_MM + (iw - w) / 2;
      const y = MARGIN_MM + (ih - h) / 2;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, w, h, undefined, "FAST");
      pdf.save(`esquema-visual-a4-${Date.now()}.pdf`);
    } finally {
      setExporting(false);
    }
  }, [orientation]);

  const handleSave = useCallback(() => {
    if (renderEngine === "mermaid") {
      const { nodes, flows } = schemaNodesForMermaid();
      if (!nodes.length) return;
      const flowNodes: Node[] = nodes.map((n) => ({
        id: String(n.id),
        type: "studyNode",
        position: n.position || { x: 0, y: 0 },
        data: {
          label: mermaidLabelMap[String(n.id)] ?? n.texto ?? "",
          nodeType: n.nodeType,
          fontSize: n.estilo?.fontSize,
          textAlign: n.estilo?.textAlign,
          textColor: n.estilo?.textColor,
          fontWeight: n.estilo?.fontWeight,
          lineHeight: n.estilo?.lineHeight,
          nodeBgColor: n.estilo?.nodeBgColor,
        },
      }));
      const parentEdges: Edge[] = nodes
        .filter((n) => n.parent_id != null)
        .map((n) => ({
          id: `e-${n.parent_id}-${n.id}`,
          source: String(n.parent_id),
          target: String(n.id),
        }));
      const flowEdges: Edge[] = flows.map((f, idx) => ({
        id: `f-${idx}`,
        source: String(f.from),
        target: String(f.to),
        label: f.etiqueta,
        style: { strokeDasharray: f.tipo === "dashed" ? "6,4" : "none" },
      }));
      onSave(flowNodes, [...parentEdges, ...flowEdges]);
      return;
    }
    const v = flowRef.current?.get();
    if (v) onSave(v.nodes, v.edges);
  }, [renderEngine, onSave, schemaNodesForMermaid, mermaidLabelMap]);

  const handleMermaidA4Fit = useCallback(() => {
    setOrientationMode("auto");
    setManualZoom(1);
    setFitTick((v) => v + 1);
  }, []);

  const handleViewportWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (renderEngine !== "mermaid") return;
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    setManualZoom((prev) => {
      const next = prev * factor;
      return Math.min(2.5, Math.max(0.5, Number(next.toFixed(3))));
    });
  }, [renderEngine]);

  const effectiveScale = viewportScale * manualZoom;
  const zoomMermaidIn = useCallback(() => setManualZoom((prev) => Math.min(2.5, Number((prev * 1.1).toFixed(3)))), []);
  const zoomMermaidOut = useCallback(() => setManualZoom((prev) => Math.max(0.5, Number((prev * 0.9).toFixed(3)))), []);

  const exportMermaidSvg = useCallback(() => {
    if (!mermaidSvg) {
      alert("No hay SVG Mermaid disponible para exportar.");
      return;
    }
    const blob = new Blob([mermaidSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `esquema-mermaid-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mermaidSvg]);

    const exportMermaidPng = useCallback(async () => {
    // Buscar el contenedor específico de Mermaid para exportar el diagrama completo
    // en lugar de la vista previa A4 que podría tener scroll/recorte.
    const mermaidContainer = exportRef.current?.querySelector(".mermaid-host");
    const elementToExport = mermaidContainer || exportRef.current;

    if (!elementToExport) {
      alert("No hay elemento para exportar.");
      return;
    }

    setExporting(true);
    try {
      // Aumentar escala para mejor calidad y asegurar fondo blanco
      const scale = 3;
      const dataUrl = await domToPng(elementToExport as HTMLElement, {
        scale,
        backgroundColor: "#ffffff",
        style: {
          transform: "none", // Evitar transformaciones que puedan afectar
        },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `esquema-mermaid-${Date.now()}.png`;
      a.click();
    } catch (e) {
      console.error("Mermaid PNG export error:", e);
      alert("No se pudo exportar PNG.");
    } finally {
      setExporting(false);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement)?.tagName.toLowerCase();
      if (e.key === "Escape") onBack();
      if (!cmd) return;
      if (e.key.toLowerCase() === "s") { e.preventDefault(); handleSave(); }
      if (e.key.toLowerCase() === "p") { e.preventDefault(); void exportPdf(); }
      if (tag === "input" || tag === "textarea") return;
      if (renderEngine === "flow") {
        if (e.key === "0") { e.preventDefault(); setZoomPreset("fit"); setFitTick((v) => v + 1); }
        if (e.key === "1") { e.preventDefault(); setZoomPreset(0.25); }
        if (e.key === "2") { e.preventDefault(); setZoomPreset(0.5); }
        if (e.key === "3") { e.preventDefault(); setZoomPreset(0.75); }
        if (e.key === "4") { e.preventDefault(); setZoomPreset(1); }
        if (e.key.toLowerCase() === "e") { e.preventDefault(); setIsEdit((v) => !v); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, exportPdf, handleSave, renderEngine]);

  useEffect(() => {
    const first = modalRef.current?.querySelector("button");
    if (first) (first as HTMLButtonElement).focus();
  }, []);

  return (
    <div ref={modalRef} className="fixed inset-0 z-50 bg-white flex flex-col" role="dialog" aria-modal="true" aria-labelledby="schema-title">
      <div className={`border-b border-slate-200 px-4 py-3 flex flex-col gap-2 ${isPrintMode ? "hidden" : ""}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full" aria-label="Volver"><ArrowLeft size={20} className="text-slate-600" /></button>
            <div>
              <h2 id="schema-title" className="font-bold text-slate-800">{title}</h2>
              {isPrintMode && <span className="text-[10px] text-indigo-700 font-black uppercase tracking-widest">Vista previa A4 210x297mm</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportPdf} disabled={exporting} className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"><Download size={20} /></button>
            <button onClick={handleSave} className="bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-bold"><Save size={14} className="inline mr-1" />Guardar</button>
            <button onClick={() => setIsPrintMode((v) => !v)} className={`px-3 py-2 rounded-lg text-xs font-semibold ${isPrintMode ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {isPrintMode ? "Modo Edición" : "Modo Impresión A4"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <div className="bg-slate-100 rounded-xl p-1 flex gap-1">
            <button onClick={() => setRenderEngine("mermaid")} className={`px-3 py-1.5 rounded-lg ${renderEngine === "mermaid" ? "bg-white text-indigo-700" : ""}`}>Mermaid</button>
            <button onClick={() => setRenderEngine("flow")} className={`px-3 py-1.5 rounded-lg ${renderEngine === "flow" ? "bg-white text-indigo-700" : ""}`}>Flow</button>
          </div>
          {renderEngine === "flow" && (
            <>
              <div className="bg-slate-100 rounded-xl border p-1 flex gap-1"><button className={`w-8 h-8 rounded-lg ${layoutType === "jerarquico" ? "bg-white text-indigo-700" : ""}`} onClick={() => setLayoutType("jerarquico")}>V</button><button className={`w-8 h-8 rounded-lg ${layoutType === "lineal" ? "bg-white text-indigo-700" : ""}`} onClick={() => setLayoutType("lineal")}>H</button><button className={`w-8 h-8 rounded-lg ${layoutType === "radial" ? "bg-white text-indigo-700" : ""}`} onClick={() => setLayoutType("radial")}>R</button></div>
              <div className="bg-slate-100 rounded-xl border p-1 flex gap-1">{([0.25, 0.5, 0.75, 1] as const).map((z) => <button key={z} onClick={() => setZoomPreset(z)} className={`px-2 h-8 rounded-lg ${zoomPreset === z ? "bg-white text-indigo-700" : ""}`}>{Math.round(z * 100)}%</button>)}<button onClick={() => { setZoomPreset("fit"); setFitTick((v) => v + 1); }} className={`px-2 h-8 rounded-lg ${zoomPreset === "fit" ? "bg-white text-indigo-700" : ""}`}>Ajustar ventana</button></div>
              <div className="bg-slate-100 rounded-xl p-1 flex gap-1"><button onClick={() => setIsEdit(false)} className={`px-3 py-1.5 rounded-lg ${!isEdit ? "bg-white text-indigo-700" : ""}`}><BookOpen size={14} className="inline mr-1" />Estudiar</button><button onClick={() => setIsEdit(true)} className={`px-3 py-1.5 rounded-lg ${isEdit ? "bg-white text-indigo-700" : ""}`}><Edit2 size={14} className="inline mr-1" />Editar</button></div>
            </>
          )}
          <div className="bg-slate-100 rounded-xl border p-1 flex gap-1"><button onClick={() => { if (renderEngine === "flow") { setOrientationMode("auto"); const n = flowRef.current?.get().nodes || []; setOrientation(bestOrientation(n)); } setFitTick((v) => v + 1); }} className={`px-2 h-8 rounded-lg ${orientationMode === "auto" && renderEngine === "flow" ? "bg-white text-indigo-700" : ""}`}>Auto</button><button onClick={() => { setOrientationMode("manual"); setOrientation("vertical"); setFitTick((v) => v + 1); }} className={`w-8 h-8 rounded-lg ${orientation === "vertical" ? "bg-white text-indigo-700" : ""}`}><LayoutPanelTop size={14} /></button><button onClick={() => { setOrientationMode("manual"); setOrientation("horizontal"); setFitTick((v) => v + 1); }} className={`w-8 h-8 rounded-lg ${orientation === "horizontal" ? "bg-white text-indigo-700" : ""}`}><Move size={14} /></button></div>
          {renderEngine === "mermaid" && (
            <button onClick={() => setIsMermaidLabelEditorOpen((v) => !v)} className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 font-semibold text-slate-700 hover:bg-white">
              Editar etiquetas
            </button>
          )}
          {renderEngine === "mermaid" && (
            <div className="bg-slate-100 rounded-xl border p-1 flex gap-1">
              <button
                onClick={zoomMermaidOut}
                className="w-8 h-8 rounded-lg bg-white text-indigo-700 hover:bg-indigo-50"
                aria-label="Zoom menos"
                title="Zoom menos"
              >
                <ZoomOut size={14} className="mx-auto" />
              </button>
              <button
                onClick={zoomMermaidIn}
                className="w-8 h-8 rounded-lg bg-white text-indigo-700 hover:bg-indigo-50"
                aria-label="Zoom mas"
                title="Zoom mas"
              >
                <ZoomIn size={14} className="mx-auto" />
              </button>
              <button onClick={() => setMermaidDiagramType("flowchart")} className={`px-3 py-1.5 rounded-lg ${mermaidDiagramType === "flowchart" ? "bg-white text-indigo-700" : ""}`}>Flowchart</button>
              <button onClick={() => setMermaidDiagramType("mindmap")} className={`px-3 py-1.5 rounded-lg ${mermaidDiagramType === "mindmap" ? "bg-white text-indigo-700" : ""}`}>Mindmap</button>
              <button onClick={handleMermaidA4Fit} className="px-3 py-1.5 rounded-lg bg-white text-indigo-700 font-semibold">A4</button>
              <button onClick={exportMermaidSvg} className="px-3 py-1.5 rounded-lg bg-white text-indigo-700 font-semibold">SVG</button>
              <button onClick={exportMermaidPng} className="px-3 py-1.5 rounded-lg bg-white text-indigo-700 font-semibold">PNG</button>
            </div>
          )}
          {renderEngine === "mermaid" && (
            <div className="bg-slate-100 rounded-xl border p-1 flex items-center gap-1">
              <select value={mermaidTheme} onChange={(e) => setMermaidTheme(e.target.value as MermaidTheme)} className="h-8 px-2 rounded-lg text-xs font-semibold bg-white border border-slate-200">
                <option value="default">Tema: Default</option>
                <option value="neutral">Tema: Neutral</option>
                <option value="forest">Tema: Forest</option>
                <option value="dark">Tema: Dark</option>
              </select>
              <select value={mermaidCurve} onChange={(e) => setMermaidCurve(e.target.value as MermaidCurve)} className="h-8 px-2 rounded-lg text-xs font-semibold bg-white border border-slate-200">
                <option value="basis">Curva: Basis</option>
                <option value="linear">Curva: Linear</option>
                <option value="monotoneX">Curva: Monotone</option>
                <option value="stepBefore">Curva: Step Before</option>
                <option value="stepAfter">Curva: Step After</option>
              </select>
              <label className="text-[10px] font-semibold text-slate-600 px-1">N</label>
              <input type="range" min={20} max={120} step={5} value={mermaidNodeSpacing} onChange={(e) => setMermaidNodeSpacing(Number(e.target.value))} />
              <label className="text-[10px] font-semibold text-slate-600 px-1">R</label>
              <input type="range" min={30} max={180} step={5} value={mermaidRankSpacing} onChange={(e) => setMermaidRankSpacing(Number(e.target.value))} />
            </div>
          )}
          <span className="text-slate-500">{renderEngine === "flow" ? "Atajos: Ctrl/Cmd + [1..4,0,E,S,P]" : "Atajos: Ctrl/Cmd + [S,P]"}</span>
        </div>
      </div>

      <div ref={viewportRef} onWheel={handleViewportWheel} className={`flex-1 overflow-auto flex items-center justify-center p-3 ${isPrintMode ? "bg-white" : "bg-slate-200"}`}>
        <div style={{ transform: isPrintMode ? `scale(${effectiveScale})` : "none", transformOrigin: "center center", transition: "transform .18s ease-out", width: isPrintMode ? "auto" : "100%", height: isPrintMode ? "auto" : "100%" }}>
          <div 
            ref={exportRef} 
            className={`relative bg-white ${isPrintMode ? "shadow-2xl border border-slate-300" : "w-full h-full"} overflow-hidden`} 
            style={isPrintMode ? { width: sheet.width, height: sheet.height } : { width: "100%", height: "100%" }}
          >
            {isPrintMode && <div className="pointer-events-none absolute border-2 border-dashed border-rose-300" style={{ left: MARGIN_PX, right: MARGIN_PX, top: MARGIN_PX, bottom: MARGIN_PX }} />}
            {isPrintMode && <div className="pointer-events-none absolute top-2 right-2 text-[10px] font-bold text-rose-500 bg-white/80 px-2 py-1 rounded-md">Margen impresion 10mm</div>}
            {renderEngine === "mermaid" ? (
              <MermaidCanvas
                schema={schema}
                orientation={orientation}
                labelMap={mermaidLabelMap}
                diagramType={mermaidDiagramType}
                theme={mermaidTheme}
                curve={mermaidCurve}
                nodeSpacing={mermaidNodeSpacing}
                rankSpacing={mermaidRankSpacing}
                onSvgChange={setMermaidSvg}
              />
            ) : (
              <ReactFlowProvider>
                <FlowCanvas ref={flowRef} schema={schema} layoutType={layoutType} isEdit={isEdit} zoomPreset={zoomPreset} fitTick={fitTick} onNodesReady={onNodesReady} />
              </ReactFlowProvider>
            )}
            {renderEngine === "mermaid" && isMermaidLabelEditorOpen && (
              <div className="absolute left-3 top-3 z-20 w-[320px] max-h-[70%] overflow-auto bg-white/95 border border-slate-300 rounded-xl shadow-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Etiquetas Mermaid</h3>
                  <button className="text-xs text-slate-600 hover:text-slate-900" onClick={() => setIsMermaidLabelEditorOpen(false)}>Cerrar</button>
                </div>
                <div className="space-y-2">
                  {schemaNodesForMermaid().nodes.map((n) => (
                    <div key={String(n.id)} className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-500 font-semibold">Nodo {String(n.id)}</label>
                      <input
                        value={mermaidLabelMap[String(n.id)] ?? n.texto ?? ""}
                        onChange={(e) => setMermaidLabelMap((prev) => ({ ...prev, [String(n.id)]: e.target.value }))}
                        className="w-full h-8 px-2 rounded-md border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`border-t border-slate-200 px-4 py-2 bg-slate-50 text-[11px] text-slate-600 flex flex-wrap items-center gap-3 ${isPrintMode ? "hidden" : ""}`}>
        <span className="font-semibold">Flujo maximo 3 clics:</span><span>1) Modo</span><span>2) Click derecho nodo</span><span>3) Accion</span>
        <span className="inline-flex items-center gap-1 text-indigo-700 font-semibold"><Scan size={14} />Preview impresion A4 en tiempo real</span>
      </div>
    </div>
  );
};

export default VisualSchema;

