  "use client";

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { 
  Upload, 
  FileText, 
  Brain, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Trash2, 
  Download, 
  Loader2,
  Sparkles,
  Edit3,
  Save,
  FolderOpen,
  Palette,
  Workflow,
  Moon,
  Sun,
  BarChart3,
  Clock,
  TrendingUp,
  Award
} from 'lucide-react';
import jsPDF from 'jspdf';
import { domToCanvas } from 'modern-screenshot';
import Image from 'next/image';
import VisualSchema from '@/components/VisualSchema';

// --- Configuración de API ---
const GENERIC_ERROR = "Lo siento, hubo un problema al procesar tu documento. Por favor, intenta de nuevo.";

interface MindMapNodeData {
  label: string;
  link?: string;
  isCrossLink?: boolean;
  children?: MindMapNodeData[];
}

type Metacognition = {
  preguntas_autoevaluacion: string[];
  conceptos_clave_examen?: string[];
};

// --- Plantillas de Esquemas ---
const SCHEMA_TEMPLATES = {
  simple: {
    label: 'Tema Central',
    children: [
      { label: 'Concepto 1', children: [] },
      { label: 'Concepto 2', children: [] },
      { label: 'Concepto 3', children: [] },
    ]
  },
  comparative: {
    label: 'Comparación',
    children: [
      { 
        label: 'Aspecto 1', 
        children: [
          { label: 'Opción A', children: [] },
          { label: 'Opción B', children: [] },
        ]
      },
      { label: 'Aspecto 2', children: [] },
      { label: 'Aspecto 3', children: [] },
    ]
  },
  process: {
    label: 'Proceso',
    children: [
      { label: 'Paso 1: Inicio', children: [] },
      { label: 'Paso 2: Desarrollo', children: [] },
      { label: 'Paso 3: Finalización', children: [] },
    ]
  },
  hierarchical: {
    label: 'Tema Principal',
    children: [
      { 
        label: 'Categoría 1',
        children: [
          { label: 'Subcategoría A', children: [] },
          { label: 'Subcategoría B', children: [] },
        ]
      },
      { 
        label: 'Categoría 2',
        children: [
          { label: 'Subcategoría A', children: [] },
          { label: 'Subcategoría B', children: [] },
        ]
      },
    ]
  },
} as const;

type SchemaTemplate = keyof typeof SCHEMA_TEMPLATES;

// --- Componentes del Mapa Mental ---
interface MindMapNodeProps {
  node: MindMapNodeData;
  path: number[];
  depth?: number;
  onUpdate: (path: number[], newLabel: string) => void;
  onAddChild: (path: number[]) => void;
  onDelete: (path: number[]) => void;
}

// Temas de colores personalizados
const STYLE_THEMES = {
  slate: {
    level1: { bullet: '#1e293b', text: '#0f172a' },
    level2: { bullet: '#334155', text: '#0f172a' },
    level3: { bullet: '#475569', text: '#1e293b' },
    level4: { bullet: '#64748b', text: '#334155' },
  },
  blue: {
    level1: { bullet: '#1e3a8a', text: '#172554' },
    level2: { bullet: '#1d4ed8', text: '#1e3a8a' },
    level3: { bullet: '#3b82f6', text: '#1d4ed8' },
    level4: { bullet: '#60a5fa', text: '#2563eb' },
  },
  green: {
    level1: { bullet: '#14532d', text: '#052e16' },
    level2: { bullet: '#166534', text: '#14532d' },
    level3: { bullet: '#22c55e', text: '#166534' },
    level4: { bullet: '#4ade80', text: '#16a34a' },
  },
  purple: {
    level1: { bullet: '#581c87', text: '#3b0764' },
    level2: { bullet: '#7e22ce', text: '#581c87' },
    level3: { bullet: '#a855f7', text: '#7e22ce' },
    level4: { bullet: '#d8b4fe', text: '#9333ea' },
  },
} as const;

type StyleTheme = keyof typeof STYLE_THEMES;

// Estilos por nivel con soporte de tema personalizado
const LEVEL_STYLES = [
  { bullet: 'bg-slate-800', text: 'text-slate-900', font: 'font-semibold' },
  { bullet: 'bg-slate-700', text: 'text-slate-900', font: 'font-medium' },
  { bullet: 'bg-slate-600', text: 'text-slate-800', font: 'font-normal' },
  { bullet: 'bg-slate-500', text: 'text-slate-700', font: 'font-normal' },
];

// Componente de nodo simple - lista vertical con viñetas
const MindMapNode = memo(function MindMapNode({ node, path, depth = 1, onUpdate, onAddChild, onDelete }: MindMapNodeProps) {
  const [isOpen, setIsOpen] = useState(true);
  const childNodes = node.children ?? [];
  const hasChildren = childNodes.length > 0;
  const style = LEVEL_STYLES[Math.min(depth - 1, LEVEL_STYLES.length - 1)];

  const handleLabelChange = (newLabel: string) => {
    onUpdate(path, newLabel);
  };

  return (
    <div className="mt-2">
      {/* Palabra de enlace (link) para mapas conceptuales */}
      {node.link && (
        <div className="ml-5 mb-1 flex items-center gap-1">
          <div className="h-4 w-0.5 bg-slate-200 ml-1.5" />
          <span className="text-[10px] font-medium text-slate-600 uppercase tracking-wider bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
            {node.link}
          </span>
        </div>
      )}

      {/* Fila del nodo: viñeta + input */}
      <div className={`group flex items-start gap-2 ${node.isCrossLink ? 'bg-amber-50 rounded-lg p-1 -ml-1 border border-amber-100' : ''}`}>
        {/* Viñeta */}
        <div className="flex items-center gap-2 pt-1.5 shrink-0">
          {hasChildren ? (
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-slate-600 hover:text-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-sm outline-none"
              aria-label={isOpen ? "Colapsar sección" : "Expandir sección"}
              aria-expanded={isOpen}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-3.5" /> // espacio para alinear
          )}
          <span className={`w-2 h-2 rounded-full ${style.bullet}`} />
        </div>

        {/* Input editable */}
        <div className="flex-1 flex flex-col">
          <input
            value={node.label}
            onChange={(e) => handleLabelChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={`w-full bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-300 rounded px-1 py-0.5 text-sm ${style.text} ${style.font}`}
            aria-label={`Editar concepto: ${node.label}`}
          />
          {node.isCrossLink && (
            <span className="text-[9px] text-amber-700 font-bold px-1 uppercase tracking-tighter">
              Conexión Cruzada
            </span>
          )}
        </div>

        {/* Botón eliminar */}
        <button
          onClick={() => onDelete(path)}
          className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-600 transition-all pt-1 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500 rounded-sm outline-none"
          aria-label="Eliminar concepto"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Hijos indentados */}
      {isOpen && (
        <div className="ml-6 border-l-2 border-slate-100 pl-2">
          {childNodes.map((child, idx) => (
            <MindMapNode
              key={idx}
              node={child}
              path={[...path, idx]}
              depth={depth + 1}
              onUpdate={onUpdate}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
          <button
            onClick={() => onAddChild(path)}
            className="mt-1 flex items-center gap-1 text-xs text-slate-600 hover:text-indigo-700 transition-colors py-1 px-2 rounded focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
            aria-label="Añadir concepto hijo"
          >
            <Plus size={12} /> Añadir concepto
          </button>
        </div>
      )}
    </div>
  );
});




// --- Estadísticas de Estudio ---
interface StudyStatistics {
  totalSchemas: number;
  totalStudyTime: number; // en minutos
  lastStudyDate: string | null;
  schemasCreated: number;
  schemasExported: number;
  studySessions: StudySession[];
  averageSessionDuration: number;
}

interface StudySession {
  id: string;
  schemaId: string;
  schemaTitle: string;
  startTime: string;
  endTime: string | null;
  duration: number; // en minutos
  exported: boolean;
  exportedFormats: string[];
}

interface SavedSchema {
  id: string;
  title: string;
  summary: string;
  mindMap: MindMapNodeData;
  previewUrl: string | null;
  createdAt: string;
  updatedAt: string;
  fullSchema?: unknown;
  metadata?: { metacognicion?: Metacognition };
  studyStats?: {
    totalStudyTime: number; // en minutos
    lastStudied: string | null;
    studySessions: number;
    exported: boolean;
    exportedFormats: string[];
  };
}

const HomePage = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [mindMap, setMindMap] = useState<MindMapNodeData | null>(null);
  const [fullSchema, setFullSchema] = useState<unknown | null>(null);
  const [metacognition, setMetacognition] = useState<Metacognition | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'results' | 'library'>('upload');
  const [savedSchemas, setSavedSchemas] = useState<SavedSchema[]>([]);
  const [mapMode, setMapMode] = useState<'mindmap' | 'conceptual'>('mindmap');
  const [isVisualMode, setIsVisualMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isStylePanelOpen, setIsStylePanelOpen] = useState(false);
  const [styleTheme, setStyleTheme] = useState<StyleTheme>('slate');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const mindMapRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [studySession, setStudySession] = useState<StudySession | null>(null);
  const [studyStartTime, setStudyStartTime] = useState<number | null>(null);
  const studyTimerRef = useRef<number | null>(null);
  const [currentSchemaId, setCurrentSchemaId] = useState<string | null>(null);

  const loadSchemasFromLocal = useCallback(() => {
    try {
      const saved = localStorage.getItem('studybuddy_schemas');
      if (saved) {
        setSavedSchemas(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Error al cargar schemas guardados (local):', error);
    }
  }, []);

  const saveSchemasToLocal = useCallback((schemas: SavedSchema[]) => {
    try {
      localStorage.setItem('studybuddy_schemas', JSON.stringify(schemas));
      setSavedSchemas(schemas);
    } catch (error) {
      console.error('Error al guardar schemas en local:', error);
    }
  }, []);

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('studybuddy_darkmode');
    if (savedDarkMode !== null) {
      setIsDarkMode(JSON.parse(savedDarkMode));
    }
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('studybuddy_darkmode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    const loadSavedSchemas = async () => {
      try {
        const response = await fetch('/api/schemas', { method: 'GET' });
        if (!response.ok) {
          loadSchemasFromLocal();
          return;
        }
        const payload = await response.json() as { items?: SavedSchema[] };
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setSavedSchemas(items);
        localStorage.setItem('studybuddy_schemas', JSON.stringify(items));
      } catch {
        loadSchemasFromLocal();
      }
    };
    void loadSavedSchemas();
  }, [loadSchemasFromLocal]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (studyTimerRef.current) clearInterval(studyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!mindMap || activeTab !== 'results') return;
    const startTime = Date.now();
    setStudyStartTime(startTime);
    setStudySession({
      id: `session_${Date.now()}`,
      schemaId: currentSchemaId || `temp_${Date.now()}`,
      schemaTitle: mindMap.label,
      startTime: new Date(startTime).toISOString(),
      endTime: null,
      duration: 0,
      exported: false,
      exportedFormats: [],
    });
    studyTimerRef.current = window.setInterval(() => {
      const now = Date.now();
      const durationMinutes = Math.floor((now - startTime) / 60000);
      setStudySession((prev) => (prev ? { ...prev, duration: durationMinutes } : null));
    }, 10000);

    return () => {
      if (studyTimerRef.current) clearInterval(studyTimerRef.current);
    };
  }, [mindMap, activeTab, currentSchemaId]);

  const calculateStatistics = useCallback((): StudyStatistics => {
    try {
      const sessions: StudySession[] = JSON.parse(localStorage.getItem('studybuddy_sessions') || '[]');
      const totalStudyTime = sessions.reduce((sum, session) => sum + session.duration, 0);
      const averageSessionDuration = sessions.length > 0 ? Math.round(totalStudyTime / sessions.length) : 0;
      const lastStudyDate = sessions.length > 0 ? sessions[sessions.length - 1].endTime || sessions[sessions.length - 1].startTime : null;
      const schemasExported = savedSchemas.filter((s) => s.studyStats?.exported).length;
      return {
        totalSchemas: savedSchemas.length,
        totalStudyTime,
        lastStudyDate,
        schemasCreated: savedSchemas.length,
        schemasExported,
        studySessions: sessions,
        averageSessionDuration,
      };
    } catch {
      return {
        totalSchemas: savedSchemas.length,
        totalStudyTime: 0,
        lastStudyDate: null,
        schemasCreated: savedSchemas.length,
        schemasExported: 0,
        studySessions: [],
        averageSessionDuration: 0,
      };
    }
  }, [savedSchemas]);

  const statistics = calculateStatistics();

  const exportToMarkdown = useCallback(() => {
    if (!mindMap) return;
    const walk = (node: MindMapNodeData, level = 0): string => {
      const indent = "  ".repeat(level);
      const prefix = level === 0 ? "# " : "- ";
      return `${indent}${prefix}${node.label}\n${(node.children || []).map((c) => walk(c, level + 1)).join("")}`;
    };
    const markdown = walk(mindMap);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `esquema-${mindMap.label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mindMap]);

  const exportToJSON = useCallback(() => {
    if (!mindMap || !fullSchema) return;
    const data = { title: mindMap.label, summary, mindMap, schema: fullSchema, metadata: metacognition, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `esquema-${mindMap.label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mindMap, fullSchema, summary, metacognition]);

  const exportToPNG = useCallback(async () => {
    if (!mindMapRef.current || !mindMap) return;
    const canvas = await domToCanvas(mindMapRef.current, {
      scale: 2,
      backgroundColor: "#ffffff",
      width: mindMapRef.current.scrollWidth,
      height: mindMapRef.current.scrollHeight,
    });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `esquema-${mindMap.label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [mindMap]);

  const exportToPDF = useCallback(async () => {
    if (!mindMapRef.current || !mindMap) return;
    const canvas = await domToCanvas(mindMapRef.current, {
      scale: 2,
      backgroundColor: "#ffffff",
      width: mindMapRef.current.scrollWidth,
      height: mindMapRef.current.scrollHeight,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const margin = 15;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;
    const imgHeight = (canvas.height * contentWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = margin;

    pdf.addImage(imgData, "PNG", margin, position, contentWidth, imgHeight);
    heightLeft -= contentHeight;
    while (heightLeft > 0) {
      position = margin - (imgHeight - heightLeft - contentHeight);
      pdf.addPage();
      pdf.addImage(imgData, "PNG", margin, position, contentWidth, imgHeight);
      heightLeft -= contentHeight;
    }
    pdf.save(`esquema-${mindMap.label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.pdf`);
  }, [mindMap]);

  // --- Guardar esquema: Supabase primero, fallback local ---
  const saveToLocalStorage = async () => {
    if (!mindMap || !summary) {
      alert('No hay contenido para guardar.');
      return;
    }

    try {
      const existing: SavedSchema[] = savedSchemas;
      const existingCurrent = currentSchemaId ? existing.find((s) => s.id === currentSchemaId) : null;
      const schemaId = currentSchemaId || Date.now().toString();

      const schema: SavedSchema = {
        id: schemaId,
        title: mindMap.label,
        summary: summary,
        mindMap: mindMap,
        previewUrl: null,
        createdAt: existingCurrent?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fullSchema: fullSchema,
        metadata: {
          metacognicion: metacognition || undefined
        }
      };

      const updated = existingCurrent
        ? existing.map((s) => (s.id === schemaId ? schema : s))
        : [schema, ...existing];

      try {
        const response = await fetch('/api/schemas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(schema),
        });
        if (!response.ok) {
          throw new Error('Supabase no disponible');
        }
      } catch {
        // fallback silencioso: ya persistimos en local
      }

      saveSchemasToLocal(updated);
      setCurrentSchemaId(schemaId);
      alert(existingCurrent ? 'Esquema actualizado exitosamente.' : 'Esquema guardado exitosamente.');
    } catch (error) {
      console.error('Error al guardar:', error);
      alert('No se pudo guardar el esquema.');
    }
  };

  // --- FunciÃ³n para cargar schema desde localStorage ---
  const loadSchema = (schemaId: string) => {
    try {
      const schema = savedSchemas.find((s) => s.id === schemaId);
      
      if (schema) {
        setCurrentSchemaId(schema.id);
        setMindMap(schema.mindMap);
        setSummary(schema.summary);
        setPreviewUrls(schema.previewUrl ? [schema.previewUrl] : []);
        setFullSchema(schema.fullSchema || null);
        setMetacognition(schema.metadata?.metacognicion || null);
        setActiveTab('results');
      }
    } catch (error) {
      console.error('Error al cargar schema:', error);
      alert('Error al cargar el esquema.');
    }
  };

  // --- Función para eliminar schema del localStorage ---
  const deleteSchema = (schemaId: string) => {
    try {
      const updated = savedSchemas.filter((s) => s.id !== schemaId);
      void fetch(`/api/schemas/${schemaId}`, { method: 'DELETE' }).catch(() => undefined);
      saveSchemasToLocal(updated);
      if (currentSchemaId === schemaId) {
        setCurrentSchemaId(null);
      }
    } catch (error) {
      console.error('Error al eliminar schema:', error);
      alert('Error al eliminar el esquema.');
    }
  };
  
  // --- Lógica de Procesamiento ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    // Limitar a máximo 2 archivos
    const newFiles = selectedFiles.slice(0, 2 - files.length);
    if (newFiles.length === 0) {
      alert('Máximo 2 imágenes permitidas');
      return;
    }

    // Combinar con archivos existentes (máximo 2)
    const updatedFiles = [...files, ...newFiles].slice(0, 2);
    setFiles(updatedFiles);

    // Leer y crear previews para los nuevos archivos
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrls((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const processDocument = async () => {
    if (previewUrls.length === 0) return;
    setLoading(true);
    
    // Preparar datos de imágenes
    const images = previewUrls.map((url) => {
      const [mimeInfo, base64Data] = url.split(',');
      const mimeType = mimeInfo.match(/:(.*?);/)?.[1] || 'image/png';
      return { data: base64Data, mimeType };
    });

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          images,
          mode: mapMode 
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || `Error del servidor (${response.status})`);
      }

      const output = (await response.json()) as {
        summary: string;
        mindMap: MindMapNodeData;
        fullSchema?: unknown;
        metadata?: { metacognicion?: Metacognition };
      };
      
      setSummary(output.summary);
      setMindMap(output.mindMap);
      setFullSchema(output.fullSchema ?? null);
      setMetacognition(output.metadata?.metacognicion ?? null);
      setCurrentSchemaId(null);
      setActiveTab('results');
    } catch (error) {
      console.error('Error en processDocument:', error);
      alert(error instanceof Error ? error.message : GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  const updateNodeLabel = useCallback((path: number[], newLabel: string) => {
    setMindMap(prevMap => {
      if (!prevMap) return null;

      const updateRecursive = (obj: MindMapNodeData, p: number[], label: string): MindMapNodeData => {
        if (p.length === 0) return { ...obj, label };
        const nextIdx = p[0];
        if (obj.children && obj.children[nextIdx]) {
          const newChildren = [...obj.children];
          newChildren[nextIdx] = updateRecursive(newChildren[nextIdx], p.slice(1), label);
          return { ...obj, children: newChildren };
        }
        return obj;
      };
      return updateRecursive(prevMap, path, newLabel);
    });
  }, []);

  const addNode = useCallback((path: number[]) => {
    setMindMap(prevMap => {
      if (!prevMap) return null;
      const newNode: MindMapNodeData = { label: "Nuevo concepto", children: [] };
      
      const addRecursive = (obj: MindMapNodeData, p: number[]): MindMapNodeData => {
        if (p.length === 0) {
          return { ...obj, children: [...(obj.children || []), newNode] };
        }
        const nextIdx = p[0];
        if (obj.children && obj.children[nextIdx]) {
          const newChildren = [...obj.children];
          newChildren[nextIdx] = addRecursive(newChildren[nextIdx], p.slice(1));
          return { ...obj, children: newChildren };
        }
        return obj;
      };
      return addRecursive(prevMap, path);
    });
  }, []);

  const deleteNode = useCallback((path: number[]) => {
    setMindMap(prevMap => {
      if (!prevMap || path.length === 0) return prevMap;
      
      const deleteRecursive = (obj: MindMapNodeData, p: number[]): MindMapNodeData => {
        if (p.length === 1) {
          const newChildren = (obj.children || []).filter((_, idx) => idx !== p[0]);
          return { ...obj, children: newChildren };
        }
        const nextIdx = p[0];
        if (obj.children && obj.children[nextIdx]) {
          const newChildren = [...obj.children];
          newChildren[nextIdx] = deleteRecursive(newChildren[nextIdx], p.slice(1));
          return { ...obj, children: newChildren };
        }
        return obj;
      };
      return deleteRecursive(prevMap, path);
    });
  }, []);

  // --- Convertir mapa mental a nodos visuales ---
  const convertToVisualNodes = useCallback(() => {
    if (!fullSchema) return;
    setIsVisualMode(true);
  }, [fullSchema]);

  const handleSaveVisual = (nodes: unknown[] = [], edges: unknown[] = []) => {
    const current = fullSchema;
    if (!current || typeof current !== 'object') {
      setIsVisualMode(false);
      return;
    }

    const schema = current as {
      nodos?: Array<{
        id: string | number;
        texto: string;
        parent_id?: string | number | null;
        position?: { x: number; y: number };
        nodeType?: string;
        estilo?: { fontSize?: number; textAlign?: string; textColor?: string; lineHeight?: number; nodeBgColor?: string };
      }>;
      conexiones_flujo?: Array<{ from: string | number; to: string | number; etiqueta?: string; tipo?: 'solid' | 'dashed' }>;
    };

    if (!Array.isArray(schema.nodos)) {
      setIsVisualMode(false);
      return;
    }

    const visualNodes = new Map(
      (nodes as Array<{ id: string | number; position?: { x: number; y: number }; data?: { label?: string; nodeType?: string; fontSize?: number; textAlign?: string; textColor?: string; lineHeight?: number; nodeBgColor?: string } }>)
        .map((n) => [String(n.id), n])
    );

    const updatedNodes = schema.nodos.map((n) => {
      const vn = visualNodes.get(String(n.id));
      if (!vn) return n;
      return {
        ...n,
        texto: vn.data?.label ?? n.texto,
        nodeType: vn.data?.nodeType ?? n.nodeType,
        position: vn.position
          ? { x: Math.round(vn.position.x), y: Math.round(vn.position.y) }
          : n.position,
        estilo: {
          ...(n.estilo || {}),
          fontSize: vn.data?.fontSize ?? n.estilo?.fontSize,
          textAlign: vn.data?.textAlign ?? n.estilo?.textAlign,
          textColor: vn.data?.textColor ?? n.estilo?.textColor,
          lineHeight: vn.data?.lineHeight ?? n.estilo?.lineHeight,
          nodeBgColor: vn.data?.nodeBgColor ?? n.estilo?.nodeBgColor,
        },
      };
    });

    const parentPairs = new Set(
      updatedNodes
        .filter((n) => n.parent_id != null)
        .map((n) => `${String(n.parent_id)}->${String(n.id)}`)
    );

    const updatedFlow = (edges as Array<{ source: string | number; target: string | number; label?: string; style?: { strokeDasharray?: string } }>)
      .filter((e) => !parentPairs.has(`${String(e.source)}->${String(e.target)}`))
      .map((e) => ({
        from: String(e.source),
        to: String(e.target),
        etiqueta: e.label,
        tipo: e.style?.strokeDasharray ? 'dashed' as const : 'solid' as const,
      }));

    const nextSchema = {
      ...schema,
      nodos: updatedNodes,
      conexiones_flujo: updatedFlow,
    };

    setFullSchema(nextSchema);

    if (currentSchemaId) {
      try {
        const updated = savedSchemas.map((s) =>
          s.id === currentSchemaId
            ? { ...s, fullSchema: nextSchema, updatedAt: new Date().toISOString() }
            : s
        );
        saveSchemasToLocal(updated);
        void fetch(`/api/schemas/${currentSchemaId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullSchema: nextSchema, updatedAt: new Date().toISOString() }),
        }).catch(() => undefined);
      } catch (error) {
        console.error('Error al persistir cambios visuales:', error);
      }
    }

    setIsVisualMode(false);
    setShowSaveToast(true);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setShowSaveToast(false);
      toastTimerRef.current = null;
    }, 2200);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <button 
            onClick={() => setActiveTab('upload')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 outline-none rounded-lg p-1"
            aria-label="Volver a inicio - StudyBuddy AI"
          >
            <div className="bg-indigo-700 p-2 rounded-lg">
              <Brain className="text-white" size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">StudyBuddy <span className="text-indigo-700">AI</span></h1>
          </button>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowStatsPanel(!showStatsPanel)}
              className="text-slate-600 hover:text-indigo-700 text-sm font-medium flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 outline-none rounded px-2 py-1"
              aria-label="Ver estadísticas de estudio"
              aria-expanded={showStatsPanel}
            >
              <BarChart3 size={16} /> Estadísticas
            </button>
            <button 
              onClick={() => setActiveTab('library')}
              className="text-slate-600 hover:text-indigo-700 text-sm font-medium flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 outline-none rounded px-2 py-1"
              aria-label={`Ver biblioteca: ${savedSchemas.length} esquemas guardados`}
            >
              <FolderOpen size={16} /> Mi Biblioteca ({savedSchemas.length})
            </button>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
              aria-label={isDarkMode ? "Activar modo claro" : "Activar modo oscuro"}
              aria-pressed={isDarkMode}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-800 font-bold text-xs border border-indigo-200" aria-label="Perfil de usuario">
              JD
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {activeTab === 'upload' ? (
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-extrabold text-slate-800">Transforma tus apuntes</h2>
              <p className="text-slate-600 text-lg">Sube una foto de tu libro o cuaderno y deja que la IA organice tu estudio.</p>
            </div>

            <div className={`relative border-2 border-dashed rounded-2xl transition-all ${files.length > 0 ? 'border-indigo-400 bg-indigo-50/30' : 'border-slate-300 bg-white hover:border-indigo-300'}`}>
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center justify-center p-8 w-full h-full gap-4">
                {previewUrls.length > 0 ? (
                  <div className="w-full">
                    <div className={`grid gap-4 ${previewUrls.length === 1 ? 'grid-cols-1 max-w-sm mx-auto' : 'grid-cols-2'}`}>
                      {previewUrls.map((url, index) => (
                        <div key={index} className="relative group/file">
                          {files[index]?.type === 'application/pdf' ? (
                            <div className="w-full h-48 bg-slate-200 rounded-lg flex flex-col items-center justify-center border border-slate-300">
                              <FileText size={48} className="text-slate-600" />
                              <p className="text-xs text-slate-600 mt-2 px-2 text-center truncate max-w-[90%]">{files[index]?.name}</p>
                            </div>
                          ) : (
                            <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-200">
                              <Image 
                                src={url} 
                                alt={`Vista previa ${index + 1}`}
                                fill
                                className="object-cover" 
                              />
                              <button 
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeFile(index); }}
                                className="absolute top-1 right-1 p-1.5 bg-white/90 rounded-full text-slate-600 hover:text-red-600 opacity-0 group-hover/file:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500 outline-none"
                                aria-label={`Eliminar imagen ${files[index]?.name}`}
                              >
                                <Plus size={12} className="rotate-45" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-600">
                      <Upload size={32} />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-slate-800">Haz clic para subir o arrastra aquí</p>
                      <p className="text-sm text-slate-600">JPG, PNG o PDF (Máx. 2 imágenes, 10MB cada una)</p>
                    </div>
                  </>
                )}
              </label>
              <label htmlFor="file-upload" className="sr-only">
                Subir imágenes o documentos PDF
              </label>
              <input 
                id="file-upload" 
                type="file" 
                className="hidden" 
                multiple 
                accept="image/*,application/pdf"
                onChange={handleFileUpload}
                aria-label="Subir imágenes o documentos PDF (máximo 2 archivos)"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => setMapMode('mindmap')}
                className={`flex-1 flex flex-col items-center justify-center py-4 px-4 rounded-xl border-2 transition-all focus-visible:ring-4 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 outline-none ${
                  mapMode === 'mindmap' 
                    ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm' 
                    : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                }`}
                aria-pressed={mapMode === 'mindmap'}
              >
                <Brain size={24} className="mb-1" />
                <span className="font-bold text-sm">Mapa Mental</span>
                <span className="text-[10px] text-slate-600">Buzan/Jerárquico (Esencial)</span>
              </button>
              <button 
                onClick={() => setMapMode('conceptual')}
                className={`flex-1 flex flex-col items-center justify-center py-4 px-4 rounded-xl border-2 transition-all focus-visible:ring-4 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 outline-none ${
                  mapMode === 'conceptual' 
                    ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm' 
                    : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                }`}
                aria-pressed={mapMode === 'conceptual'}
              >
                <Sparkles size={24} className="mb-1" />
                <span className="font-bold text-sm">Mapa Conceptual</span>
                <span className="text-[10px] text-slate-600">Ausubel/Novak (Alta gama)</span>
              </button>
            </div>

            <button 
              onClick={processDocument}
              disabled={loading || files.length === 0}
              className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all ${loading || files.length === 0 ? 'bg-slate-200 text-slate-600 cursor-not-allowed' : 'bg-indigo-700 text-white hover:bg-indigo-800 shadow-lg hover:shadow-indigo-200 focus-visible:ring-4 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 outline-none'}`}
              aria-busy={loading}
              aria-label={loading ? "Procesando documento..." : "Transformar en esquema"}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" /> Procesando...
                </>
              ) : (
                <>
                  <Sparkles size={20} /> Generar Guía de Estudio
                </>
              )}
            </button>

            {/* Featured Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8 border-t border-slate-200">
              <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                <FileText className="text-indigo-600 shrink-0" size={20} />
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Resumen Inteligente</h4>
                  <p className="text-xs text-slate-600">Extrae lo más importante de párrafos densos.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                <Brain className="text-indigo-600 shrink-0" size={20} />
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Mapa Conceptual</h4>
                  <p className="text-xs text-slate-600">Estructura jerárquica lista para estudiar.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                <Edit3 className="text-indigo-600 shrink-0" size={20} />
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Editor Flexible</h4>
                  <p className="text-xs text-slate-600">Ajusta los conceptos a tu propio estilo.</p>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'library' ? (
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-extrabold text-slate-800">Mi Biblioteca</h2>
                <p className="text-slate-600 mt-1">Tus esquemas guardados para estudiar</p>
              </div>
              <button 
                onClick={() => setActiveTab('upload')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg flex items-center gap-2 transition-all focus-visible:ring-4 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 outline-none"
              >
                <Plus size={18} /> Nuevo Esquema
              </button>
            </div>

            {savedSchemas.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <FolderOpen size={64} className="text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-700 mb-2">Biblioteca vacía</h3>
                <p className="text-slate-600 mb-6">Aún no has guardado ningún esquema.</p>
                <button 
                  onClick={() => setActiveTab('upload')}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all focus-visible:ring-4 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 outline-none"
                >
                  Crear mi primer esquema
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {savedSchemas.map((schema) => (
                  <div 
                    key={schema.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden group"
                  >
                    <div className="p-5 flex items-start justify-between gap-4">
                      <button 
                        onClick={() => loadSchema(schema.id)}
                        className="flex-1 flex items-start gap-4 text-left focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg outline-none"
                        aria-label={`Ver esquema: ${schema.title}`}
                      >
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                          <Brain size={24} />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-lg text-slate-800 mb-1">{schema.title}</h3>
                          <p className="text-xs text-slate-600">
                            Creado el {new Date(schema.createdAt).toLocaleDateString('es-ES', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </p>
                        </div>
                      </button>
                      <button 
                         onClick={() => deleteSchema(schema.id)}
                         className="text-slate-600 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500 outline-none"
                         aria-label={`Eliminar esquema: ${schema.title}`}
                       >
                         <Trash2 size={18} />
                       </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 lg:gap-8">
            {/* Botón toggle para sidebar en móvil */}
            <div className="lg:hidden flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-2">
              <div className="flex items-center gap-2">
                <FileText className="text-indigo-600" size={18} />
                <span className="font-bold text-slate-800">Resumen y Herramientas</span>
              </div>
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none flex items-center gap-2"
                aria-label={isSidebarOpen ? "Cerrar herramientas" : "Ver herramientas y resumen"}
                aria-expanded={isSidebarOpen}
              >
                <span className="text-xs font-bold">{isSidebarOpen ? "Cerrar" : "Ver"}</span>
                {isSidebarOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            </div>

            {/* Sidebar con Resumen */}
            <div className={`${isSidebarOpen ? 'block animate-in slide-in-from-top-2 duration-300' : 'hidden'} lg:block lg:col-span-4 space-y-6`}>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="text-indigo-600" size={20} />
                  <h3 className="font-bold text-lg text-slate-800">Resumen del Tema</h3>
                </div>
                <div className="text-slate-600 leading-relaxed text-sm whitespace-pre-wrap">
                  {summary}
                </div>
              </div>
              
              <div className="bg-indigo-900 p-6 rounded-2xl text-white shadow-xl">
                <h4 className="font-bold mb-2 flex items-center gap-2">
                  <Sparkles size={18} className="text-indigo-300" />
                  {metacognition ? "Preguntas de Autoevaluación" : "Consejo de Estudio"}
                </h4>
                {metacognition ? (
                  <ul className="list-disc list-inside space-y-2 text-sm text-indigo-100" role="list">
                    {metacognition.preguntas_autoevaluacion.map((q: string, i: number) => (
                      <li key={i} role="listitem">{q}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-indigo-100">
                    Basado en este contenido, te recomendamos repasar la conexión entre los conceptos del segundo nivel. ¡Suelen ser preguntas de examen!
                  </p>
                )}
                
                {metacognition?.conceptos_clave_examen && (
                  <div className="mt-4 pt-4 border-t border-indigo-800">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-indigo-300 mb-2">Conceptos Clave Examen</h5>
                    <div className="flex flex-wrap gap-2">
                      {metacognition.conceptos_clave_examen.map((c: string, i: number) => (
                        <span key={i} className="bg-indigo-800 px-2 py-1 rounded text-[10px] font-medium">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Panel de Personalización de Estilos */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Palette className="text-indigo-600" size={18} />
                    <h3 className="font-bold text-lg text-slate-800">Estilo del Esquema</h3>
                  </div>
                  <button
                    onClick={() => setIsStylePanelOpen(!isStylePanelOpen)}
                    className="p-2 bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                    aria-label={isStylePanelOpen ? "Cerrar panel de estilos" : "Abrir panel de estilos"}
                    aria-expanded={isStylePanelOpen}
                  >
                    <span className="text-xs font-bold">{isStylePanelOpen ? "Ocultar" : "Personalizar"}</span>
                    {isStylePanelOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>

                {isStylePanelOpen && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
                    {/* Plantillas de esquemas */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 mb-2 block">Plantillas</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(SCHEMA_TEMPLATES) as SchemaTemplate[]).map((template) => (
                          <button
                            key={template}
                            onClick={() => setMindMap(JSON.parse(JSON.stringify(SCHEMA_TEMPLATES[template])))}
                            className="flex flex-col items-center gap-1 px-3 py-3 rounded-lg border-2 border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                            aria-label={`Usar plantilla ${template}`}
                          >
                            <Brain size={20} className="text-indigo-600" />
                            <span className="text-[10px] font-bold text-slate-700 capitalize">
                              {template === 'simple' ? 'Simple' : template === 'comparative' ? 'Comparativa' : template === 'process' ? 'Proceso' : 'Jerárquico'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-200">
                      <label className="text-xs font-bold text-slate-700 mb-2 block">Tema de Colores</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(STYLE_THEMES) as StyleTheme[]).map((theme) => (
                          <button
                            key={theme}
                            onClick={() => setStyleTheme(theme)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none ${
                              styleTheme === theme
                                ? 'border-indigo-600 bg-indigo-50'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                            aria-pressed={styleTheme === theme}
                          >
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: STYLE_THEMES[theme].level1.bullet }}
                            />
                            <span className="text-xs font-medium capitalize text-slate-700">
                              {theme === 'slate' ? 'Gris' : theme === 'blue' ? 'Azul' : theme === 'green' ? 'Verde' : 'Púrpura'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => setStyleTheme('slate')}
                      className="w-full py-2 text-slate-600 hover:text-indigo-700 text-xs font-medium flex items-center justify-center gap-1 bg-slate-50 rounded-lg hover:bg-indigo-50 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                    >
                      <span>Restablecer tema predeterminado</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Botones de Acción */}
              <div className="grid grid-cols-2 lg:flex lg:flex-col gap-3">
                <button
                  onClick={saveToLocalStorage}
                  className="col-span-1 py-3 bg-indigo-700 hover:bg-indigo-800 text-white font-medium flex items-center justify-center gap-2 rounded-xl shadow-md transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 outline-none"
                  aria-label="Guardar en biblioteca"
                >
                  <Save size={18} className="text-indigo-200" /> <span className="hidden sm:inline">Guardar</span>
                </button>

                <button
                  onClick={() => setActiveTab('upload')}
                  className="col-span-1 py-3 text-slate-600 hover:text-indigo-700 font-medium flex items-center justify-center gap-2 bg-slate-100 rounded-xl hover:bg-indigo-50 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                  aria-label="Subir otro documento"
                >
                  <Plus size={18} /> <span className="hidden sm:inline">Subir otro</span>
                </button>
              </div>
            </div>

            {/* Area de Mapa Mental */}
            <div className="lg:col-span-8 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm flex flex-col min-h-[500px] lg:min-h-[620px]">
              <div className="flex items-center justify-between border-b border-slate-300 bg-slate-100 px-4 py-3 text-slate-800">
                <div className="flex items-center gap-2">
                  <Brain className="text-slate-700" size={20} />
                  <h3 className="text-sm font-semibold tracking-wide">Esquema Generado</h3>
                </div>
                <div className="flex gap-1 relative">
                  <button
                    onClick={convertToVisualNodes}
                    className="rounded-md px-3 py-2 text-slate-700 transition hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none flex items-center gap-2"
                    aria-label="Abrir editor visual interactivo"
                  >
                    <Workflow size={18} />
                    <span className="text-xs font-semibold hidden sm:inline">Editor visual</span>
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      className="rounded-md p-2 text-slate-700 transition hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                      aria-label="Exportar esquema"
                      aria-expanded={showExportMenu}
                      aria-haspopup="true"
                    >
                      <Download size={18} />
                    </button>
                    
                    {showExportMenu && (
                      <div 
                        ref={exportMenuRef}
                        className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-slate-200 shadow-lg z-20"
                        role="menu"
                        aria-label="Opciones de exportación"
                      >
                        <button
                          onClick={() => { exportToPDF(); setShowExportMenu(false); }}
                          className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none rounded-t-xl"
                          role="menuitem"
                        >
                          <FileText size={16} className="text-indigo-600" />
                          <span>PDF</span>
                        </button>
                        <button
                          onClick={() => { exportToPNG(); setShowExportMenu(false); }}
                          className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                          role="menuitem"
                        >
                          <Sparkles size={16} className="text-indigo-600" />
                          <span>PNG (Imagen)</span>
                        </button>
                        <button
                          onClick={() => { exportToMarkdown(); setShowExportMenu(false); }}
                          className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                          role="menuitem"
                        >
                          <Edit3 size={16} className="text-indigo-600" />
                          <span>Markdown (.md)</span>
                        </button>
                        <button
                          onClick={() => { exportToJSON(); setShowExportMenu(false); }}
                          className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none rounded-b-xl"
                          role="menuitem"
                        >
                          <Brain size={16} className="text-indigo-600" />
                          <span>JSON (.json)</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto bg-white p-3 sm:p-6">
                {mindMap ? (
                  <div
                    ref={mindMapRef}
                    className="mx-auto w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-4 sm:p-8 shadow-inner"
                  >
                    {/* Título principal */}
                    <div className="mb-6 pb-4 border-b border-slate-200">
                      <input
                        value={mindMap.label}
                        onChange={(e) => updateNodeLabel([], e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        className="w-full bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-300 rounded px-2 text-lg sm:text-xl font-bold text-slate-900 text-center"
                        aria-label="Título del esquema"
                      />
                    </div>

                    {/* Lista vertical de items */}
                    <div className="space-y-1" role="list" aria-label="Contenido del esquema">
                      {mindMap.children?.map((child, idx) => (
                        <div key={idx} role="listitem">
                          <MindMapNode
                            node={child}
                            path={[idx]}
                            depth={1}
                            onUpdate={updateNodeLabel}
                            onAddChild={addNode}
                            onDelete={deleteNode}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Botón añadir tema principal */}
                    <div className="mt-6 pt-4 border-t border-slate-100">
                      <button
                        onClick={() => addNode([])}
                        className="flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-700 transition-colors py-2 px-3 rounded focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                        aria-label="Añadir nuevo tema principal al esquema"
                      >
                        <Plus size={16} /> Añadir tema principal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-600">
                    <Loader2 className="animate-spin text-indigo-500" size={48} aria-hidden="true" />
                    <p className="font-medium">Generando tu esquema mental...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer simple */}
      <footer className="mt-12 py-8 border-t border-slate-200 text-center text-slate-600 text-sm">
        <p>© 2024 StudyBuddy AI - MVP de Aprendizaje Acelerado</p>
      </footer>

      {/* Modal de Estadísticas de Estudio */}
      {showStatsPanel && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stats-title"
          onClick={() => setShowStatsPanel(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h2 id="stats-title" className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <BarChart3 className="text-indigo-600" size={28} />
                  Estadísticas de Estudio
                </h2>
                <p className="text-sm text-slate-600 mt-1">Tu progreso y rendimiento</p>
              </div>
              <button
                onClick={() => setShowStatsPanel(false)}
                className="p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                aria-label="Cerrar estadísticas"
              >
                <span className="text-2xl font-bold">&times;</span>
              </button>
            </div>

            {/* Contenido del Modal */}
            <div className="p-6 space-y-6">
              {/* Métricas principales */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="text-indigo-600" size={20} />
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Esquemas</span>
                  </div>
                  <p className="text-3xl font-extrabold text-indigo-700">{statistics.totalSchemas}</p>
                  <p className="text-xs text-slate-600 mt-1">Creados</p>
                </div>

                <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="text-green-600" size={20} />
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Tiempo</span>
                  </div>
                  <p className="text-3xl font-extrabold text-green-700">
                    {statistics.totalStudyTime >= 60 
                      ? `${Math.floor(statistics.totalStudyTime / 60)}h ${statistics.totalStudyTime % 60}m`
                      : `${statistics.totalStudyTime}m`
                    }
                  </p>
                  <p className="text-xs text-slate-600 mt-1">Total de estudio</p>
                </div>

                <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="text-purple-600" size={20} />
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Sesiones</span>
                  </div>
                  <p className="text-3xl font-extrabold text-purple-700">{statistics.studySessions.length}</p>
                  <p className="text-xs text-slate-600 mt-1">Completadas</p>
                </div>

                <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Award className="text-amber-600" size={20} />
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Exportados</span>
                  </div>
                  <p className="text-3xl font-extrabold text-amber-700">{statistics.schemasExported}</p>
                  <p className="text-xs text-slate-600 mt-1">Formatos múltiples</p>
                </div>
              </div>

              {/* Estadísticas adicionales */}
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <BarChart3 size={20} className="text-indigo-600" />
                  Resumen Detallado
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-slate-200">
                    <span className="text-sm text-slate-600">Duración promedio por sesión</span>
                    <span className="text-sm font-bold text-slate-800 bg-white px-3 py-1 rounded-lg border border-slate-200">
                      {statistics.averageSessionDuration > 0 ? `${statistics.averageSessionDuration} minutos` : 'No hay datos'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-200">
                    <span className="text-sm text-slate-600">Última sesión de estudio</span>
                    <span className="text-sm font-bold text-slate-800 bg-white px-3 py-1 rounded-lg border border-slate-200">
                      {statistics.lastStudyDate 
                        ? new Date(statistics.lastStudyDate).toLocaleDateString('es-ES', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : 'Sin actividad'
                      }
                    </span>
                  </div>
                  {statistics.totalStudyTime > 0 && (
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-slate-600">Tiempo total invertido</span>
                      <span className="text-sm font-bold text-slate-800 bg-white px-3 py-1 rounded-lg border border-slate-200">
                        {statistics.totalStudyTime >= 60 
                          ? `${Math.floor(statistics.totalStudyTime / 60)} horas y ${statistics.totalStudyTime % 60} minutos`
                          : `${statistics.totalStudyTime} minutos`
                        }
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Sesiones recientes */}
              {statistics.studySessions.length > 0 && (
                <div>
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <Clock size={20} className="text-indigo-600" />
                    Sesiones Recientes
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {statistics.studySessions.slice(-5).reverse().map((session) => (
                      <div key={session.id} className="bg-white rounded-lg p-3 border border-slate-200 hover:border-indigo-300 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-sm font-bold text-slate-800 mb-1">{session.schemaTitle}</p>
                            <p className="text-xs text-slate-600">
                              {new Date(session.startTime).toLocaleDateString('es-ES', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg text-xs font-bold">
                              <Clock size={12} />
                              {session.duration} min
                            </span>
                            {session.exported && (
                              <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded-lg text-xs font-bold mt-1">
                                <Download size={12} />
                                Exportado
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mensaje sin datos */}
              {statistics.studySessions.length === 0 && (
                <div className="text-center py-8 bg-slate-50 rounded-xl">
                  <BarChart3 size={48} className="text-slate-300 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-slate-700 mb-1">Sin datos de estudio</h3>
                  <p className="text-sm text-slate-600">
                    Comienza a crear esquemas para ver tus estadísticas de estudio.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Editor Visual */}
      {isVisualMode && (
        <VisualSchema
          schema={fullSchema}
          onBack={() => setIsVisualMode(false)}
          onSave={handleSaveVisual}
        />
      )}

      {showSaveToast && (
        <div
          className="fixed bottom-4 right-4 z-[70] bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg border border-emerald-500 text-sm font-semibold animate-in fade-in slide-in-from-bottom-2 duration-200"
          role="status"
          aria-live="polite"
        >
          Cambios visuales guardados
        </div>
      )}
    </div>
  );
};

export default HomePage;
