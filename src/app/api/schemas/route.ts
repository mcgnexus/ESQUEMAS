import { NextResponse } from "next/server";
import { getSupabaseServerClient, SUPABASE_SCHEMAS_TABLE } from "@/lib/supabaseServer";

type SchemaPayload = {
  id: string;
  title: string;
  summary: string;
  mindMap: unknown;
  previewUrl: string | null;
  createdAt: string;
  updatedAt: string;
  fullSchema?: unknown;
  metadata?: unknown;
};

const mapRowToSchema = (row: Record<string, unknown>) => ({
  id: String(row.id),
  title: String(row.title || ""),
  summary: String(row.summary || ""),
  mindMap: row.mind_map ?? null,
  previewUrl: (row.preview_url as string | null) ?? null,
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
  fullSchema: row.full_schema ?? null,
  metadata: row.metadata ?? null,
});

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from(SUPABASE_SCHEMAS_TABLE)
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: (data || []).map(mapRowToSchema) });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });
  }

  const body = (await request.json()) as SchemaPayload;
  if (!body?.id || !body?.title) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const row = {
    id: body.id,
    title: body.title,
    summary: body.summary || "",
    mind_map: body.mindMap ?? null,
    preview_url: body.previewUrl ?? null,
    created_at: body.createdAt || new Date().toISOString(),
    updated_at: body.updatedAt || new Date().toISOString(),
    full_schema: body.fullSchema ?? null,
    metadata: body.metadata ?? null,
  };

  const { data, error } = await supabase
    .from(SUPABASE_SCHEMAS_TABLE)
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: mapRowToSchema(data as Record<string, unknown>) });
}
