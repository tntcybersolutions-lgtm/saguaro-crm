import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();

  try {
    // Load ALL project data simultaneously
    const [
      projectRes,
      budgetRes,
      rfisRes,
      submittalsRes,
      changeOrdersRes,
      punchRes,
      dailyLogsRes,
      inspectionsRes,
      scheduleRes,
      payAppsRes,
    ] = await Promise.all([
      db.from('projects').select('*').eq('id', projectId).eq('tenant_id', user.tenantId).single(),
      db.from('budget_items').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId),
      db.from('rfis').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId),
      db.from('submittals').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId),
      db.from('change_orders').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId),
      db.from('punch_list').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId),
      db.from('daily_logs').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('log_date', { ascending: false }).limit(30),
      db.from('inspections').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId),
      db.from('schedule_items').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId),
      db.from('pay_applications').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId),
    ]);

    const project = projectRes.data;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const budget = budgetRes.data || [];
    const rfis = rfisRes.data || [];
    const submittals = submittalsRes.data || [];
    const changeOrders = changeOrdersRes.data || [];
    const punchItems = punchRes.data || [];
    const dailyLogs = dailyLogsRes.data || [];
    const inspections = inspectionsRes.data || [];
    const scheduleItems = scheduleRes.data || [];
    const payApps = payAppsRes.data || [];

    // ---- Algorithmic score computation BEFORE calling Anthropic ----
    // Schedule Score
    const totalSchedule = scheduleItems.length || 1;
    const completedSchedule = scheduleItems.filter((s: any) => s.status === 'completed' || s.pct_complete >= 100).length;
    const overdueSchedule = scheduleItems.filter((s: any) => {
      if (s.status === 'completed') return false;
      if (!s.end_date) return false;
      return new Date(s.end_date) < new Date();
    }).length;
    const scheduleScore = Math.max(0, Math.min(100, Math.round(
      (completedSchedule / totalSchedule) * 60 +
      Math.max(0, 40 - (overdueSchedule / totalSchedule) * 100)
    )));

    // Budget Score
    const totalBudget = budget.reduce((s: number, b: any) => s + (Number(b.budget_amount) || 0), 0);
    const totalActual = budget.reduce((s: number, b: any) => s + (Number(b.actual_cost) || Number(b.committed_cost) || 0), 0);
    const budgetVariance = totalBudget > 0 ? ((totalBudget - totalActual) / totalBudget) * 100 : 100;
    const budgetScore = Math.max(0, Math.min(100, Math.round(
      budgetVariance >= 0 ? Math.min(100, 70 + budgetVariance) : Math.max(0, 70 + budgetVariance * 2)
    )));

    // Quality Score
    const totalPunch = punchItems.length || 1;
    const closedPunch = punchItems.filter((p: any) => p.status === 'closed' || p.status === 'verified').length;
    const failedInspections = inspections.filter((i: any) => i.result === 'fail' || i.status === 'failed').length;
    const qualityScore = Math.max(0, Math.min(100, Math.round(
      (closedPunch / totalPunch) * 50 +
      Math.max(0, 50 - failedInspections * 10)
    )));

    // Safety Score
    const safetyIncidents = dailyLogs.filter((d: any) =>
      (d.safety_incidents && d.safety_incidents > 0) ||
      (d.notes && typeof d.notes === 'string' && d.notes.toLowerCase().includes('incident'))
    ).length;
    const safetyScore = Math.max(0, Math.min(100, 100 - safetyIncidents * 15));

    // Communication Score
    const openRfis = rfis.filter((r: any) => r.status === 'open' || r.status === 'pending').length;
    const overdueRfis = rfis.filter((r: any) => {
      if (r.status === 'closed' || r.status === 'answered') return false;
      if (!r.due_date) return false;
      return new Date(r.due_date) < new Date();
    }).length;
    const pendingSubmittals = submittals.filter((s: any) => s.status === 'pending' || s.status === 'submitted').length;
    const communicationScore = Math.max(0, Math.min(100, Math.round(
      100 - overdueRfis * 8 - openRfis * 2 - pendingSubmittals * 3
    )));

    const overallScore = Math.round(
      scheduleScore * 0.25 + budgetScore * 0.25 + qualityScore * 0.20 +
      safetyScore * 0.15 + communicationScore * 0.15
    );

    // Build critical_issues list
    const critical_issues: string[] = [];
    if (overdueSchedule > 0) critical_issues.push(`${overdueSchedule} schedule items are overdue`);
    if (budgetVariance < -10) critical_issues.push(`Budget is ${Math.abs(budgetVariance).toFixed(1)}% over`);
    if (safetyIncidents > 0) critical_issues.push(`${safetyIncidents} safety incidents in recent logs`);
    if (overdueRfis > 3) critical_issues.push(`${overdueRfis} RFIs past due date`);
    if (failedInspections > 0) critical_issues.push(`${failedInspections} failed inspections`);

    const warnings: string[] = [];
    if (openRfis > 5) warnings.push(`${openRfis} open RFIs need responses`);
    if (pendingSubmittals > 5) warnings.push(`${pendingSubmittals} submittals awaiting review`);
    if (punchItems.length - closedPunch > 10) warnings.push(`${punchItems.length - closedPunch} open punch items`);
    const pendingCOs = changeOrders.filter((c: any) => c.status === 'pending' || c.status === 'draft').length;
    if (pendingCOs > 0) warnings.push(`${pendingCOs} change orders pending approval`);

    const positive_findings: string[] = [];
    if (safetyScore >= 90) positive_findings.push('Excellent safety record — no recent incidents');
    if (budgetScore >= 85) positive_findings.push('Budget is tracking well within targets');
    if (scheduleScore >= 80) positive_findings.push('Schedule is on track');
    if (closedPunch > 0) positive_findings.push(`${closedPunch} punch items closed out`);

    // SSE streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: 'stage', stage: 'loading', message: 'Loading project data...' });
        send({ type: 'stage', stage: 'computing', message: 'Computing health scores...' });
        send({
          type: 'scores',
          overall: overallScore,
          schedule: scheduleScore,
          budget: budgetScore,
          quality: qualityScore,
          safety: safetyScore,
          communication: communicationScore,
        });

        send({ type: 'stage', stage: 'analyzing', message: 'Running AI analysis...' });

        // Call Anthropic for narrative analysis
        try {
          const anthropic = new Anthropic();
          const metricsPrompt = `
You are a construction project analyst. Analyze this project data and provide insights.

PROJECT: ${project.name}
PRE-COMPUTED SCORES:
- Overall: ${overallScore}/100
- Schedule: ${scheduleScore}/100 (${completedSchedule}/${totalSchedule} tasks done, ${overdueSchedule} overdue)
- Budget: ${budgetScore}/100 ($${totalBudget.toLocaleString()} budget, $${totalActual.toLocaleString()} actual, ${budgetVariance.toFixed(1)}% variance)
- Quality: ${qualityScore}/100 (${closedPunch}/${punchItems.length} punch closed, ${failedInspections} failed inspections)
- Safety: ${safetyScore}/100 (${safetyIncidents} incidents in 30 days)
- Communication: ${communicationScore}/100 (${openRfis} open RFIs, ${overdueRfis} overdue, ${pendingSubmittals} pending submittals)

CRITICAL ISSUES: ${critical_issues.join('; ') || 'None'}
WARNINGS: ${warnings.join('; ') || 'None'}
CHANGE ORDERS: ${changeOrders.length} total, $${changeOrders.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0).toLocaleString()} total value
PAY APPS: ${payApps.length} submitted

Provide a JSON response with:
{
  "narrative": "2-3 paragraph executive summary",
  "predictions": {
    "estimated_completion": "YYYY-MM-DD or 'On Schedule'",
    "final_cost_estimate": number,
    "completion_probability": number (0-100),
    "key_risk": "one sentence"
  },
  "recommendations": ["action 1", "action 2", "action 3"]
}`;

          const aiResponse = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            messages: [{ role: 'user', content: metricsPrompt }],
          });

          const aiText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '';
          let parsed: any = {};
          try {
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
          } catch { /* use empty */ }

          send({ type: 'stage', stage: 'predictions', message: 'Generating predictions...' });
          send({
            type: 'analysis',
            narrative: parsed.narrative || 'Analysis complete.',
            predictions: parsed.predictions || {
              estimated_completion: 'On Schedule',
              final_cost_estimate: totalBudget,
              completion_probability: overallScore,
              key_risk: critical_issues[0] || 'No major risks identified',
            },
            recommendations: parsed.recommendations || [],
            critical_issues,
            warnings,
            positive_findings,
          });

        } catch (aiErr: any) {
          send({
            type: 'analysis',
            narrative: 'AI analysis unavailable. Scores computed from project data.',
            predictions: {
              estimated_completion: 'On Schedule',
              final_cost_estimate: totalBudget,
              completion_probability: overallScore,
              key_risk: critical_issues[0] || 'No major risks identified',
            },
            recommendations: [],
            critical_issues,
            warnings,
            positive_findings,
          });
        }

        // Save to project_intelligence
        send({ type: 'stage', stage: 'saving', message: 'Saving analysis...' });
        await db.from('project_intelligence').insert({
          tenant_id: user.tenantId,
          project_id: projectId,
          overall_score: overallScore,
          schedule_score: scheduleScore,
          budget_score: budgetScore,
          quality_score: qualityScore,
          safety_score: safetyScore,
          communication_score: communicationScore,
          critical_issues,
          warnings,
          positive_findings,
          created_by: user.id,
        });

        send({ type: 'done' });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
