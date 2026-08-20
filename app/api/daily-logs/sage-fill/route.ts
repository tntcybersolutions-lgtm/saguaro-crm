import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const maxDuration = 90;
export const dynamic = 'force-dynamic';

function formatDate(d: string) {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const body = await req.json();
  const { projectId, logDate, trades, weather, phaseOfWork, completionPct } = body;

  if (!projectId) {
    return new Response(JSON.stringify({ error: 'projectId is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        // Stage 1: Loading
        send({ stage: 'loading', message: 'Loading project context...', pct: 5 });

        const db = createServerClient();
        const { data: project } = await db
          .from('projects')
          .select('name, address, city, state, project_type, pm_name, contract_amount, square_footage')
          .eq('id', projectId)
          .eq('tenant_id', user.tenantId)
          .single();

        const projectName = project?.name || 'Unknown Project';

        // Load last 3 days logs
        const { data: recentLogs } = await db
          .from('daily_logs')
          .select('work_performed, log_date')
          .eq('project_id', projectId)
          .eq('tenant_id', user.tenantId)
          .lt('log_date', logDate || new Date().toISOString().split('T')[0])
          .order('log_date', { ascending: false })
          .limit(3);

        // Stage 2: Analyzing crews
        const activeTrades = Array.isArray(trades) ? trades.filter((t: any) => t.workers > 0 || t.trade) : [];
        const totalWorkers = activeTrades.reduce((s: number, t: any) => s + (t.workers || 0), 0);
        const totalHours = activeTrades.reduce((s: number, t: any) => s + ((t.workers || 0) * (t.hours || 8)), 0);

        send({
          stage: 'analyzing',
          message: `Analyzing ${activeTrades.length} crews on site — ${totalWorkers} total workers`,
          detail: activeTrades.map((t: any) => `${t.trade || 'General'} (${t.company || 'Unknown'})`).join(', '),
          pct: 20,
        });
        await new Promise(r => setTimeout(r, 100));

        // Stage 3: Weather assessment
        const w = weather || {};
        const impactLabel = w.construction_impact === 'adverse' ? 'Adverse conditions detected — documenting impact' : `${w.conditions || 'Unknown'} conditions`;
        send({
          stage: 'weather',
          message: w.construction_impact === 'adverse'
            ? 'Adverse conditions detected — documenting impact...'
            : `Assessing weather impact on ${logDate || 'today'}...`,
          detail: `${w.conditions || 'N/A'} · ${w.temperature_high || '?'}°F high · ${w.wind_speed || 0} mph wind`,
          pct: 30,
        });
        await new Promise(r => setTimeout(r, 100));

        // Stage 5: Drafting
        send({
          stage: 'drafting',
          message: 'Sage AI is writing the work performed narrative...',
          detail: `${formatDate(logDate || new Date().toISOString().split('T')[0])} · ${activeTrades.map((t: any) => t.trade || 'General').join(', ')} · ${totalWorkers} workers on site`,
          pct: 45,
        });

        const tradeLines = activeTrades.map((t: any) =>
          `- ${t.company || 'Unknown'} (${t.trade || 'General'}): ${t.workers || 0} workers × ${t.hours || 8} hrs = ${(t.workers || 0) * (t.hours || 8)} man-hours`
        ).join('\n');

        const recentContext = (recentLogs || []).map((l: any) =>
          `- ${l.log_date}: ${(l.work_performed || '').slice(0, 80)}...`
        ).join('\n');

        const workNotes = Array.isArray(w.work_notes) ? w.work_notes.join('; ') : '';

        const prompt = `You are a construction superintendent writing today's official daily log.
Write a specific, professional work performed narrative.
Use past tense. Be specific about locations, quantities, and trade activities.

PROJECT: ${projectName}
LOCATION: ${project?.address || ''}, ${project?.city || ''}, ${project?.state || ''}
TYPE: ${project?.project_type || 'Commercial'}
DATE: ${formatDate(logDate || new Date().toISOString().split('T')[0])}

WEATHER CONDITIONS:
- ${w.conditions || 'Unknown'}, High ${w.temperature_high || '?'}°F / Low ${w.temperature_low || '?'}°F
- Wind: ${w.wind_speed || 0} mph
- Precipitation: ${(w.precipitation || 0) > 0 ? w.precipitation + '" — protections required' : 'None'}
- Construction Impact: ${(w.construction_impact || 'favorable').toUpperCase()}
${workNotes ? '- ADVISORY: ' + workNotes : ''}

CREWS ON SITE TODAY:
${tradeLines || '- No trade data provided'}
TOTAL: ${totalWorkers} workers / ${totalHours} man-hours

${phaseOfWork ? `CURRENT PROJECT PHASE: ${phaseOfWork}` : ''}
${completionPct ? `ESTIMATED PROJECT COMPLETION: ${completionPct}%` : ''}

${recentContext ? `RECENT WORK CONTEXT (last ${(recentLogs || []).length} days):\n${recentContext}` : ''}

Write a 3-4 paragraph work performed narrative:

PARAGRAPH 1 — Weather and site conditions.
PARAGRAPH 2 — Primary work activities by trade with specific locations and quantities.
PARAGRAPH 3 — Issues, delays, or notable items. If none, state "No significant delays or issues were encountered."
PARAGRAPH 4 — Planned work for tomorrow.

Use professional superintendent language. Paragraph form only. Maximum 280 words.
Every sentence must describe a specific action. Do not mention trades with 0 workers.

Also provide a separate 1-2 sentence safety note based on weather and activities.

Respond in JSON format:
{"work_performed": "...", "safety_notes": "..."}`;

        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic();

        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }],
        });

        const rawText = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';

        let workPerformed = '';
        let safetyNotes = '';
        try {
          const clean = rawText.replace(/```json\n?|```\n?/g, '').trim();
          const parsed = JSON.parse(clean);
          workPerformed = parsed.work_performed || rawText;
          safetyNotes = parsed.safety_notes || '';
        } catch {
          workPerformed = rawText;
        }

        // Typewriter reveal
        const words = workPerformed.split(' ');
        for (let i = 0; i < words.length; i += 8) {
          const chunk = words.slice(0, i + 8).join(' ');
          send({ stage: 'preview', text: chunk, pct: Math.round(45 + (i / words.length) * 43) });
          await new Promise(r => setTimeout(r, 22));
        }

        // Safety stage
        send({ stage: 'safety', message: 'Adding safety notes...', pct: 90 });
        await new Promise(r => setTimeout(r, 50));

        // Done
        send({
          type: 'done',
          work_performed: workPerformed,
          safety_notes: safetyNotes,
          word_count: words.length,
          pct: 100,
        });

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        send({ type: 'error', message: `Sage fill failed: ${message}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
