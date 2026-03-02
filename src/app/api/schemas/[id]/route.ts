import { NextResponse } from "next/server";
import { getSupabaseServerClient, SUPABASE_SCHEMAS_TABLE } from "@/lib/supabaseServer";

type SchemaUpdatePayload = {
  title?: string;
  summary?: string;
  mindMap?: unknown;
  previewUrl?: string | null;
  updatedAt?: string;
  fullSchema?: unknown;
  metadata?: unknown;
};

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });
  }

  const { id } = await params;
  const body = (await request.json()) as SchemaUpdatePayload;
  const update = {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.summary !== undefined ? { summary: body.summary } : {}),
    ...(body.mindMap !== undefined ? { mind_map: body.mindMap } : {}),
    ...(body.previewUrl !== undefined ? { preview_url: body.previewUrl } : {}),
    ...(body.fullSchema !== undefined ? { full_schema: body.fullSchema } : {}),
    ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
    updated_at: body.updatedAt || new Date().toISOString(),
  };

  const { error } = await supabase.from(SUPABASE_SCHEMAS_TABLE).update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });
  }
  const { id } = await params;

  const { error } = await supabase.from(SUPABASE_SCHEMAS_TABLE).delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
