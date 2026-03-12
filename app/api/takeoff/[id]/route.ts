import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { ok, notFound, serverError } from '@/lib/api-response';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id } = await params;

    const { data: takeoff, error: takeoffErr } = await supabase
      .from('takeoffs')
      .select('*, projects!takeoffs_project_id_fkey(name)')
      .eq('id', id)
      .single();

    if (takeoffErr || !takeoff) {
      return notFound('Takeoff not found');
    }

    const { data: materials, error: materialsErr } = await supabase
      .from('takeoff_materials')
      .select('*')
      .eq('takeoff_id', id)
      .order('sort_order', { ascending: true });

    if (materialsErr) throw materialsErr;

    const projects = takeoff.projects as { name?: string } | null;
    const result = {
      ...takeoff,
      projects: undefined,
      project_name: projects?.name || null,
      materials: materials || [],
    };

    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}
