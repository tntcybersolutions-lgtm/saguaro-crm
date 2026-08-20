import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { projectId } = await params;
  const body = await req.json();
  const periodFrom = body.period_from;
  const periodTo = body.period_to;

  if (!periodFrom || !periodTo) {
    return new Response(JSON.stringify({ error: 'Missing period_from and period_to' }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const db = createServerClient();
        const tenantId = user.tenantId;

        // STAGE 1: Gathering
        send({ stage: 'gathering', message: 'Gathering project data for the week...', pct: 10 });

        // Load all data in parallel
        const [
          { data: project },
          { data: dailyLogs },
          { data: openRFIs },
          { data: newRFIs },
          { data: submittals },
          { data: changOrders },
          { data: punchItems },
          { data: timeEntries },
          { data: budget },
        ] = await Promise.all([
          db.from('projects').select('name, address, city, state, contract_value, owner_name')
            .eq('id', projectId).eq('tenant_id', tenantId).single(),
          db.from('daily_logs').select('work_performed, total_workers, log_date')
            .eq('project_id', projectId).eq('tenant_id', tenantId)
            .gte('log_date', periodFrom).lte('log_date', periodTo),
          db.from('rfis').select('id, status')
            .eq('project_id', projectId).eq('tenant_id', tenantId)
            .in('status', ['open', 'submitted', 'under_review']),
          db.from('rfis').select('id')
            .eq('project_id', projectId).eq('tenant_id', tenantId)
            .gte('created_at', periodFrom).lte('created_at', periodTo + 'T23:59:59'),
          db.from('submittals').select('id, status')
            .eq('project_id', projectId).eq('tenant_id', tenantId),
          db.from('change_orders').select('id, amount, status')
            .eq('project_id', projectId).eq('tenant_id', tenantId),
          db.from('punch_list_items').select('id, status')
            .eq('project_id', projectId).eq('tenant_id', tenantId),
          db.from('time_entries').select('total_hours, labor_cost, employee_id')
            .eq('project_id', projectId).eq('tenant_id', tenantId)
            .gte('work_date', periodFrom).lte('work_date', periodTo),
          db.from('budget_line_items').select('current_budget, cost_to_date, committed_cost')
            .eq('project_id', projectId).eq('tenant_id', tenantId),
        ]);

        const logCount = (dailyLogs || []).length;
        const totalWorkers = (dailyLogs || []).reduce((s: number, l: any) => s + Number(l.total_workers || 0), 0);
        const workSummaries = (dailyLogs || []).map((l: any) => l.work_performed).filter(Boolean).join('\n');

        send({ stage: 'daily_logs', message: 'Reading daily logs...', pct: 20,
          detail: `${logCount} daily logs · ${totalWorkers} total workers` });

        const openRFICount = (openRFIs || []).length;
        const overdueRFIs = (openRFIs || []).filter((r: any) => r.status === 'overdue').length;
        const newRFICount = (newRFIs || []).length;

        send({ stage: 'rfis', message: 'Reviewing RFI status...', pct: 30,
          detail: `${openRFICount} open · ${overdueRFIs} overdue` });

        const pendingSubmittals = (submittals || []).filter((s: any) => s.status === 'submitted' || s.status === 'under_review').length;
        const approvedSubmittals = (submittals || []).filter((s: any) => s.status === 'approved').length;

        const approvedCOs = (changOrders || []).filter((c: any) => c.status === 'approved');
        const totalCOAmount = approvedCOs.reduce((s: number, c: any) => s + Math.abs(Number(c.amount || 0)), 0);
        const newCOs = (changOrders || []).filter((c: any) =>
          c.status === 'submitted' || c.status === 'draft').length;

        const totalBudget = (budget || []).reduce((s: number, b: any) => s + Number(b.current_budget || 0), 0);
        const totalSpent = (budget || []).reduce((s: number, b: any) => s + Number(b.cost_to_date || 0), 0);
        const totalCommitted = (budget || []).reduce((s: number, b: any) => s + Number(b.committed_cost || 0), 0);
        const variancePct = totalBudget > 0 ? Math.round(((totalBudget - totalSpent) / totalBudget) * 100) : 0;
        const pctCommitted = totalBudget > 0 ? Math.round((totalCommitted / totalBudget) * 100) : 0;
        const pctSpent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

        send({ stage: 'budget', message: 'Calculating budget status...', pct: 40,
          detail: `${variancePct >= 0 ? '+' : ''}${variancePct}% variance` });

        const totalHours = (timeEntries || []).reduce((s: number, t: any) => s + Number(t.total_hours || 0), 0);
        const uniqueWorkerIds = new Set((timeEntries || []).map((t: any) => t.employee_id));

        const openPunchItems = (punchItems || []).filter((p: any) => p.status !== 'closed' && p.status !== 'completed').length;

        // STAGE 5: Writing
        send({ stage: 'writing', message: 'Sage AI is writing the owner report...', pct: 50,
          detail: 'Drafting executive summary and weekly narrative' });

        const prompt = `You are the project manager for ${project?.name || 'the project'}.
Write a professional weekly owner report for the period ${periodFrom} through ${periodTo}.

PROJECT: ${project?.name || 'N/A'}
LOCATION: ${[project?.address, project?.city, project?.state].filter(Boolean).join(', ') || 'N/A'}
CONTRACT VALUE: $${Number(project?.contract_value || 0).toLocaleString()}

DAILY LOG SUMMARY:
${workSummaries || 'No daily logs recorded this week.'}

WORKFORCE: Total workers on site: ${uniqueWorkerIds.size}, Total man-hours: ${Math.round(totalHours)}

RFI STATUS: Open: ${openRFICount}, Overdue: ${overdueRFIs}, New this week: ${newRFICount}
SUBMITTAL STATUS: Pending review: ${pendingSubmittals}, Approved: ${approvedSubmittals}
CHANGE ORDER STATUS: Total approved COs: ${approvedCOs.length} ($${totalCOAmount.toLocaleString()}), New: ${newCOs}
BUDGET: Variance: ${variancePct}% ${variancePct >= 0 ? '(under budget)' : '(over budget)'}, Committed: ${pctCommitted}%, Spent: ${pctSpent}%
PUNCH LIST: Open items: ${openPunchItems}

Write a professional weekly owner report with these sections. Respond with JSON only:
{
  "executive_summary": "2-3 sentences",
  "schedule_status": "On schedule | X days ahead | X days behind",
  "schedule_narrative": "paragraph",
  "budget_status": "On budget | X% under | X% over",
  "budget_narrative": "paragraph",
  "work_completed_narrative": "2-3 paragraphs",
  "work_planned_narrative": "paragraph",
  "issues_narrative": "paragraph or 'No critical issues this week'",
  "safety_narrative": "paragraph"
}

Be specific. Use dollar amounts, percentages, counts. Professional tone. Maximum 500 words.`;

        const client = new Anthropic();
        let fullText = '';

        const aiStream = await client.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const event of aiStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            const pct = 50 + Math.min(40, Math.round((fullText.length / 2000) * 40));
            send({ stage: 'preview', text: fullText, pct });
          }
        }

        // Parse JSON from AI response
        send({ stage: 'saving', message: 'Saving report to project records...', pct: 95 });

        let parsed: any = {};
        try {
          const jsonMatch = fullText.match(/\{[\s\S]*\}/);
          if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch {
          parsed = { executive_summary: fullText.slice(0, 500) };
        }

        const metrics = {
          open_rfis: openRFICount,
          rfis_submitted_this_week: newRFICount,
          open_submittals: pendingSubmittals,
          punch_items: openPunchItems,
          workers_this_week: uniqueWorkerIds.size,
          man_hours_this_week: Math.round(totalHours),
          budget_variance_pct: variancePct,
          pct_committed: pctCommitted,
          pct_spent: pctSpent,
        };

        const { data: report, error: insertErr } = await db
          .from('owner_reports')
          .insert({
            project_id: projectId,
            tenant_id: tenantId,
            period_from: periodFrom,
            period_to: periodTo,
            executive_summary: parsed.executive_summary || null,
            schedule_status: parsed.schedule_status || null,
            schedule_narrative: parsed.schedule_narrative || null,
            budget_status: parsed.budget_status || null,
            budget_narrative: parsed.budget_narrative || null,
            work_completed_narrative: parsed.work_completed_narrative || null,
            work_planned_narrative: parsed.work_planned_narrative || null,
            issues_narrative: parsed.issues_narrative || null,
            safety_narrative: parsed.safety_narrative || null,
            metrics,
            sage_generated: true,
            sage_generated_at: new Date().toISOString(),
            generation_model: 'claude-sonnet-4-20250514',
            status: 'draft',
            created_by: user.id,
          })
          .select()
          .single();

        if (insertErr) throw insertErr;

        send({
          type: 'done',
          report_id: report?.id,
          metrics,
          executive_summary: parsed.executive_summary,
          pct: 100,
        });

        controller.close();
      } catch (err: any) {
        send({ type: 'error', message: err.message || 'Report generation failed' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
