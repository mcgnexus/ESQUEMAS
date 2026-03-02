import { NextResponse } from 'next/server';

interface ImageData {
  data: string;
  mimeType: string;
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type ParsedNode = {
  id: string | number;
  texto: string;
  parent_id?: string | number | null;
  nodeType?: 'root' | 'category' | 'content' | 'example';
  nivel?: number;
  ejemplos?: string[];
  rol?: string;
};

type ParsedFlowConn = {
  from: string | number;
  to: string | number;
  etiqueta?: string;
  tipo?: 'solid' | 'dashed' | 'crosslink';
};

type ParsedEsquema = {
  tipo_esquema?: string;
  tema_central?: string;
  descripcion_corta?: string;
  nodos?: ParsedNode[];
  conexiones_flujo?: ParsedFlowConn[];
  metacognicion?: unknown;
};

type ParsedContent = {
  esquema?: ParsedEsquema;
};

const MAX_IMAGES = 2;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/pdf',
]);

const estimateBase64Bytes = (value: string) => {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
};

const isValidBase64 = (value: string) => /^[A-Za-z0-9+/=]+$/.test(value);

const validateImagesPayload = (images: ImageData[]) => {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('No image data provided.');
  }
  if (images.length > MAX_IMAGES) {
    throw new Error(`Too many files. Maximum allowed is ${MAX_IMAGES}.`);
  }

  images.forEach((img, idx) => {
    if (!img || typeof img.data !== 'string' || typeof img.mimeType !== 'string') {
      throw new Error(`Invalid image payload at index ${idx}.`);
    }
    if (!ALLOWED_IMAGE_MIME.has(img.mimeType)) {
      throw new Error(`Unsupported MIME type at index ${idx}.`);
    }
    if (!isValidBase64(img.data)) {
      throw new Error(`Malformed base64 data at index ${idx}.`);
    }
    if (estimateBase64Bytes(img.data) > MAX_IMAGE_BYTES) {
      throw new Error(`File too large at index ${idx}.`);
    }
  });
};

const callGeminiWithRetries = async (prompt: string, images: ImageData[]) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API key not found. Please set the GEMINI_API_KEY environment variable.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  // Construir parts con el prompt y todas las imágenes
  const parts: GeminiPart[] = [{ text: prompt }];
  images.forEach((img) => {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data
      }
    });
  });

  const payload = {
    contents: [{
      parts
    }],
    generationConfig: {
      responseMimeType: "application/json",
    }
  };

  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`API Error (Attempt ${i + 1}):`, response.status, errorBody);
        
        let errorMessage = `API Error: ${response.status}`;
        try {
          const errorJson = JSON.parse(errorBody);
          errorMessage = errorJson.error?.message || errorMessage;
        } catch {}

        // No reintentar en errores de cliente (4xx) excepto 429 (Too Many Requests)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(errorMessage);
        }
        throw new Error(errorMessage);
      }
      const data = await response.json();
      return data;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Attempt ${i + 1} failed:`, errorMessage);
      // Si es el último intento o es un error fatal (no de red ni 5xx), lanzamos el error inmediatamente
      if (i === 2 || (errorMessage && !errorMessage.includes('fetch failed') && !errorMessage.includes('API Error: 5'))) {
        throw err;
      }
      if (i < 2) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error('Failed to call Gemini API after multiple retries.');
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      images?: ImageData[];
      mode?: 'mindmap' | 'conceptual';
      image?: string;
      mimeType?: string;
    };
    const mode = body.mode ?? 'mindmap';
    
    let imagesToProcess: ImageData[] = [];
    
    if (body.images && Array.isArray(body.images) && body.images.length > 0) {
      // Nuevo formato: array de imágenes
      imagesToProcess = body.images;
    } else if (body.image) {
      // Formato antiguo: imagen única
      imagesToProcess = [{ data: body.image, mimeType: body.mimeType || 'image/png' }];
    } else {
      return NextResponse.json({ error: 'No image data provided.' }, { status: 400 });
    }
    validateImagesPayload(imagesToProcess);

    const basePrompt = `SYSTEM PROMPT: Generador de Esquemas Visuales (JSON)
Rol: Eres un experto en Arquitectura de la Información y Diseño Instruccional. Tu objetivo es analizar textos o imágenes educativas y transformarlas en una estructura de datos JSON optimizada para visualización como diagrama de flujo jerárquico.

INSTRUCCIONES DE PROCESAMIENTO

1. Detección de Tipología Estructural
Analiza la semántica del contenido para determinar la disposición visual óptima:
- jerarquico: Taxonomías, clasificaciones, tipos, categorías (Ej: Tipos de movimientos, Ramas del derecho).
- lineal: Procesos paso a paso, secuencias (Ej: Fases de la mitosis).
- radial: Concepto central con características independientes (Ej: Características del Renacimiento).
- circular: Ciclos cerrados, retroalimentación (Ej: Ciclo del agua).

2. Extracción y Síntesis de Nodos con Tipos Visuales
Cada nodo DEBE incluir el campo nodeType para determinar su apariencia visual:

TIPOS DE NODO:
- "root": Nodo raíz principal (fondo amarillo #FFC107, texto negro mayúsculas, borde naranja #FF6F00)
  * Usar SOLO para el nodo de nivel 1 (tema central)
  * Ejemplo: "MOVIMIENTOS"

- "category": Etiquetas de categoría (texto rojo #D32F2F, sin fondo, mayúsculas)
  * Usar para clasificaciones principales como "REFLEJOS", "INVOLUNTARIOS", "VOLUNTARIOS"
  * También para subcategorías como "Asociados", "Automáticos", "primarios", "secundarios"
  * Estos nodos NO tienen fondo, solo texto rojo en mayúsculas

- "content": Cajas de contenido descriptivo (fondo azul claro #E3F2FD, borde rojo #D32F2F)
  * Usar para descripciones, definiciones, explicaciones
  * Ejemplo: "Son los más sencillos aunque intervienen muchos músculos"

- "example": Cajas de ejemplo (fondo gris claro #F5F5F5, borde rojo #D32F2F)
  * Usar cuando el nodo contiene ejemplos específicos
  * Ejemplo: "Mover la pierna al dar un pequeño golpe bajo la rótula"

REGLAS PARA ASIGNAR nodeType:
- Nivel 1 → "root"
- Nivel 2 con palabras clave de clasificación (reflejos, voluntarios, tipos, etc.) → "category"
- Nivel 3+ que describe/definie → "content"
- Nivel 3+ que da ejemplos → "example"

Sintetización: Máximo 6-8 palabras por nodo.

3. Conexiones y Etiquetas de Relación
Las conexiones entre nodos pueden tener etiquetas descriptivas:
- "ejemplo": Indica que el nodo hijo es un ejemplo del padre
- "son": Indica definición o característica
- "tienen": Indica posesión o característica
- "presentan": Indica manifestación
- "dos tipos": Indica clasificación
- "primarios"/"secundarios": Indica subdivisión

Para conexiones jerárquicas desde categorías hacia contenido, usar "tipo": "dashed" en conexiones_flujo.

4. Estructura del JSON

{
  "esquema": {
    "tipo_esquema": "jerarquico",
    "tema_central": "[Máximo 5 palabras]",
    "descripcion_corta": "[Resumen]",
    "nodos": [
      {
        "id": 1,
        "texto": "TEMA CENTRAL",
        "nivel": 1,
        "nodeType": "root"
      },
      {
        "id": 2,
        "texto": "CATEGORÍA",
        "nivel": 2,
        "parent_id": 1,
        "nodeType": "category"
      },
      {
        "id": 3,
        "texto": "Descripción del concepto",
        "nivel": 3,
        "parent_id": 2,
        "nodeType": "content"
      },
      {
        "id": 4,
        "texto": "Ejemplo específico",
        "nivel": 4,
        "parent_id": 3,
        "nodeType": "example"
      }
    ],
    "conexiones_flujo": [
      {
        "from": 3,
        "to": 4,
        "etiqueta": "ejemplo",
        "tipo": "dashed"
      }
    ],
    "metacognicion": {
      "preguntas_autoevaluacion": ["¿Pregunta 1?", "¿Pregunta 2?"],
      "conceptos_clave_examen": ["Concepto A", "Concepto B"]
    }
  }
}

Analiza ${imagesToProcess.length > 1 ? 'las imágenes adjuntas' : 'el documento o imagen adjunta'} y genera el JSON siguiendo estas instrucciones.`;

    const conceptualPromptAddendum =
      mode === 'conceptual'
        ? `

MODO MAPA CONCEPTUAL (AUSUBEL/NOVAK)
Además de lo anterior, optimiza el resultado para mapa conceptual:
- Usa conexiones_flujo como palabras de enlace entre ramas (etiqueta = verbo o frase corta).
- Asegura que [Concepto A] + [etiqueta] + [Concepto B] forme una proposición con sentido.
- Incluye al menos 2 conexiones cruzadas (cross-links) entre ramas diferentes con tipo="crosslink".`
        : '';

    const prompt = `${basePrompt}${conceptualPromptAddendum}`;

    const result = await callGeminiWithRetries(prompt, imagesToProcess);
    
    // Extraer y parsear el contenido de la respuesta de Gemini
    const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      throw new Error('Invalid response structure from Gemini API');
    }

    const parsedContent = JSON.parse(textContent.replace(/```json|```/g, '').trim()) as ParsedContent;
    if (!parsedContent?.esquema) {
      throw new Error('The model response does not contain a valid "esquema" object.');
    }

    // Mapeo para compatibilidad con el frontend actual
    const nodes = parsedContent.esquema?.nodos || [];
    
    type NestedNode = { label: string; children?: NestedNode[]; link?: string; isCrossLink?: boolean };

    const buildNestedNodes = (parentId: string | number | null = null): NestedNode[] => {
      return nodes
        .filter((n) => (parentId === null ? n.parent_id == null : n.parent_id === parentId))
        .map((n) => {
          const children = buildNestedNodes(n.id);
          const node: NestedNode = {
            label: n.texto,
          };
          if (children.length > 0) {
            node.children = children;
          }
          // Intentar encontrar si hay una conexión de flujo que actúe como link
          const flowConn = parsedContent.esquema?.conexiones_flujo?.find((c) => String(c.to) === String(n.id));
          if (flowConn) {
            node.link = flowConn.etiqueta;
            if (flowConn.tipo === 'crosslink') {
              node.isCrossLink = true;
            }
          }
          return node;
        });
    };

    const rootNodes = buildNestedNodes(null);
    
    // Si hay múltiples nodos raíz, crear un nodo virtual que los contenga a todos
    const nestedMindMap = rootNodes.length === 0 
      ? { label: parsedContent.esquema?.tema_central || "Sin título", children: [] }
      : rootNodes.length === 1 
        ? rootNodes[0]
        : { 
            label: parsedContent.esquema?.tema_central || "Temas Principales", 
            children: rootNodes 
          };

    return NextResponse.json({
      summary: parsedContent.esquema?.descripcion_corta || "",
      mindMap: nestedMindMap,
      fullSchema: parsedContent.esquema,
      metadata: {
        tipo_esquema: parsedContent.esquema?.tipo_esquema,
        metacognicion: parsedContent.esquema?.metacognicion
      }
    });

  } catch (error) {
    console.error('Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    const statusCode =
      errorMessage.includes('No image data') ||
      errorMessage.includes('Too many files') ||
      errorMessage.includes('Invalid image payload') ||
      errorMessage.includes('Unsupported MIME type') ||
      errorMessage.includes('Malformed base64') ||
      errorMessage.includes('File too large')
        ? 400
        : 500;

    return NextResponse.json(
      {
        error: statusCode === 400 ? errorMessage : 'Failed to process document.',
      },
      { status: statusCode }
    );
  }
}
