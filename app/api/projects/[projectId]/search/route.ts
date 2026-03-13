import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

const SEARCHABLE_TABLES = [
  { table: 'rfis', module: 'RFIs', titleField: 'subject', searchFields: ['subject', 'question'] },
  { table: 'punch_list', module: 'Punch List', titleField: 'title', searchFields: ['title', 'description'] },
  { table: 'daily_logs', module: 'Daily Logs', titleField: 'work_performed', searchFields: ['work_performed', 'notes'] },
  { table: 'inspections', module: 'Inspections', titleField: 'type', searchFields: ['type', 'notes'] },
  { table: 'change_orders', module: 'Change Orders', titleField: 'title', searchFields: ['title', 'description'] },
  { table: 'submittals', module: 'Submittals', titleField: 'title', searchFields: ['title', 'description'] },
  { table: 'safety_incidents', module: 'Safety', titleField: 'description', searchFields: ['description', 'location'] },
  { table: 'meetings', module: 'Meetings', titleField: 'title', searchFields: ['title', 'notes'] },
  { table: 'tm_tickets', module: 'T&M Tickets', titleField: 'description', searchFields: ['description'] },
  { table: 'observations', module: 'Observations', titleField: 'description', searchFields: ['description', 'location'] },
  { table: 'correspondence', module: 'Correspondence', titleField: 'subject', searchFields: ['subject', 'body'] },
];

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.toLowerCase() || '';
  const modules = url.searchParams.get('modules')?.split(',') || [];

  if (!q) return NextResponse.json({ results: [] });

  try {
    const supabase = createServerClient();
    const results: Array<{ module: string; id: string; title: string; status?: string; date?: string }> = [];

    const tables = modules.length > 0
      ? SEARCHABLE_TABLES.filter(t => modules.includes(t.module))
      : SEARCHABLE_TABLES;

    await Promise.allSettled(
      tables.map(async ({ table, module, titleField }) => {
        try {
          const { data } = await supabase
            .from(table)
            .select('*')
            .eq('project_id', params.projectId)
            .ilike(titleField, `%${q}%`)
            .limit(10);
          if (data) {
            data.forEach((item: Record<string, unknown>) => {
              results.push({
                module,
                id: String(item.id || ''),
                title: String(item[titleField] || item.title || item.description || ''),
                status: String(item.status || ''),
                date: String(item.created_at || item.date || ''),
              });
            });
          }
        } catch { /* table may not exist */ }
      })
    );

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
