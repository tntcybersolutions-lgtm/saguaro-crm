import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const { id } = await params;
  const db = createServerClient();

  /* ── Load submission ───────────────────────────────────────────── */
  const { data: sub, error: loadErr } = await db
    .from('prequal_submissions')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', user.tenantId)
    .single();

  if (loadErr || !sub) {
    return new Response(JSON.stringify({ error: 'Submission not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  /* ── SSE Stream ────────────────────────────────────────────────── */
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(stage: string, data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ stage, ...data })}\n\n`));
      }

      try {
        send('loading', { message: 'Loading submission data...' });

        /* ── Safety Score ──────────────────────────────────────── */
        send('safety', { message: 'Analyzing safety record...' });
        const emr = sub.emr_current ? parseFloat(sub.emr_current) : null;
        let emrScore = 0;
        if (emr !== null) {
          if (emr < 0.7) emrScore = 20;
          else if (emr < 0.85) emrScore = 15;
          else if (emr < 1.0) emrScore = 10;
          else if (emr < 1.2) emrScore = 5;
        }

        const oshaIncidents = (sub.osha_recordable_incidents ?? 0) + (sub.osha_lost_time_incidents ?? 0);
        let oshaScore = 0;
        if (oshaIncidents === 0) oshaScore = 10;
        else if (oshaIncidents === 1) oshaScore = 7;
        else if (oshaIncidents === 2) oshaScore = 4;

        send('safety', { message: 'Safety analysis complete', emrScore, oshaScore });

        /* ── Financial Score ───────────────────────────────────── */
        send('financial', { message: 'Evaluating financial capacity...' });
        const bondingVal = sub.bonding_limit ? parseFloat(sub.bonding_limit) : 0;
        let bondingScore = 0;
        if (bondingVal > 500000) bondingScore = 10;
        else if (bondingVal > 200000) bondingScore = 5;

        send('financial', { message: 'Financial analysis complete', bondingScore });

        /* ── References Score ──────────────────────────────────── */
        send('references', { message: 'Reviewing references...' });
        const refs = Array.isArray(sub.references) ? sub.references : [];
        const refCount = refs.filter((r: Record<string, string>) => r.company || r.contact_name).length;
        let refScore = 0;
        if (refCount >= 3) refScore = 10;
        else if (refCount >= 2) refScore = 7;
        else if (refCount >= 1) refScore = 3;

        send('references', { message: 'Reference review complete', refScore, refCount });

        /* ── Final Score ───────────────────────────────────────── */
        send('scoring', { message: 'Calculating final score...' });
        const baseScore = 50;
        const totalScore = Math.min(100, baseScore + emrScore + oshaScore + refScore + bondingScore);

        send('scoring', {
          message: 'Score calculated',
          score: totalScore,
          breakdown: { base: baseScore, emr: emrScore, osha: oshaScore, references: refScore, bonding: bondingScore },
        });

        /* ── AI Analysis via Anthropic ─────────────────────────── */
        send('scoring', { message: 'Running AI analysis...' });

        let aiAnalysis = { strengths: [] as string[], concerns: [] as string[], recommendation: '' };

        try {
          const anthropic = new Anthropic();
          const prompt = `Analyze this subcontractor prequalification submission for a construction project. Provide a brief JSON assessment.

Company: ${sub.company_name}
Trade: ${sub.primary_trade || 'Not specified'}
EMR (current): ${sub.emr_current || 'Not provided'}
EMR (prior): ${sub.emr_prior_year || 'Not provided'}
OSHA Recordable: ${sub.osha_recordable_incidents ?? 'Not provided'}
OSHA Lost Time: ${sub.osha_lost_time_incidents ?? 'Not provided'}
Has Safety Officer: ${sub.has_safety_officer ? 'Yes' : 'No'}
Annual Revenue: ${sub.annual_revenue ? '$' + Number(sub.annual_revenue).toLocaleString() : 'Not provided'}
Bonding Limit: ${sub.bonding_limit ? '$' + Number(sub.bonding_limit).toLocaleString() : 'Not provided'}
Current Backlog: ${sub.current_backlog ? '$' + Number(sub.current_backlog).toLocaleString() : 'Not provided'}
Year Established: ${sub.year_established || 'Not provided'}
References: ${refCount} provided
Insurance: GL ${sub.gl_carrier ? 'Yes' : 'No'}, WC ${sub.wc_carrier ? 'Yes' : 'No'}, Auto ${sub.auto_carrier ? 'Yes' : 'No'}
Calculated Score: ${totalScore}/100

Respond ONLY with valid JSON in this format:
{"strengths": ["strength1", "strength2", "strength3"], "concerns": ["concern1", "concern2"], "recommendation": "Approve/Conditional Approve/Deny - brief reason"}`;

          const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }],
          });

          const text = response.content[0].type === 'text' ? response.content[0].text : '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            aiAnalysis = JSON.parse(jsonMatch[0]);
          }
        } catch (aiErr: unknown) {
          const aiMsg = aiErr instanceof Error ? aiErr.message : 'AI analysis unavailable';
          aiAnalysis = {
            strengths: ['Score-based assessment completed'],
            concerns: ['AI detailed analysis unavailable: ' + aiMsg],
            recommendation: totalScore >= 80 ? 'Approve based on score' : totalScore >= 60 ? 'Conditional approval recommended' : 'Manual review required',
          };
        }

        /* ── Save results ──────────────────────────────────────── */
        await db
          .from('prequal_submissions')
          .update({
            sage_score: totalScore,
            sage_analysis: aiAnalysis,
            sage_analyzed_at: new Date().toISOString(),
            status: 'under_review',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('tenant_id', user.tenantId);

        send('done', {
          message: 'Analysis complete',
          score: totalScore,
          analysis: aiAnalysis,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Analysis failed';
        send('error', { message: errMsg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
