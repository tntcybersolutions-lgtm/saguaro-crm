import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { projectId } = body;
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const db = createServerClient();
  const tenantId = user.tenantId;

  // Fetch budget lines and project
  const [{ data: lines }, { data: project }, { data: cos }] = await Promise.all([
    db.from('budget_lines').select('cost_code, description, original_budget, committed_cost, actual_cost, forecast_cost').eq('project_id', projectId).eq('tenant_id', tenantId).limit(50),
    db.from('projects').select('name, start_date, end_date, contract_amount').eq('id', projectId).eq('tenant_id', tenantId).single(),
    db.from('change_orders').select('cost_impact, status').eq('project_id', projectId).eq('tenant_id', tenantId),
  ]);

  const budgetLines = (lines || []) as any[];
  const p = (project || {}) as any;
  const changeOrders = (cos || []) as any[];

  const totalBudget = budgetLines.reduce((s: number, l: any) => s + (l.original_budget || 0), 0);
  const totalActual = budgetLines.reduce((s: number, l: any) => s + (l.actual_cost || 0), 0);
  const totalCommitted = budgetLines.reduce((s: number, l: any) => s + (l.committed_cost || 0), 0);
  const approvedCOTotal = changeOrders.filter((c: any) => c.status === 'approved').reduce((s: number, c: any) => s + (c.cost_impact || 0), 0);
  const pendingCOTotal = changeOrders.filter((c: any) => c.status === 'pending').reduce((s: number, c: any) => s + (c.cost_impact || 0), 0);

  const linesSummary = budgetLines.slice(0, 15).map((l: any) => ({
    code: l.cost_code,
    desc: l.description,
    budget: l.original_budget,
    actual: l.actual_cost,
    pct: l.original_budget > 0 ? Math.round((l.actual_cost / l.original_budget) * 100) : 0,
  }));

  const prompt = `You are a construction cost expert. Analyze this project's budget performance and forecast likely final cost.

Project: ${p.name || 'Unknown'}
Contract Amount: $${(p.contract_amount || 0).toLocaleString()}
Total Budget (cost lines): $${totalBudget.toLocaleString()}
Total Actual Cost: $${totalActual.toLocaleString()} (${totalBudget > 0 ? Math.round(totalActual / totalBudget * 100) : 0}% of budget)
Total Committed: $${totalCommitted.toLocaleString()}
Approved Change Orders: +$${approvedCOTotal.toLocaleString()}
Pending Change Orders: +$${pendingCOTotal.toLocaleString()} (not yet approved)

Budget line detail (top lines by risk):
${JSON.stringify(linesSummary, null, 2)}

Return a JSON object with this exact shape:
{
  "forecast_final_cost": number,
  "forecast_variance": number,
  "forecast_variance_pct": number,
  "confidence": number,
  "risk_level": "low" | "medium" | "high",
  "at_risk_lines": [{"code": string, "description": string, "risk": string}],
  "recommendations": string[],
  "summary": string
}

Return only the raw JSON, no markdown.`;

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content?.[0]?.type === 'text' ? (message.content[0] as any).text : '';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    }

    return NextResponse.json({ ...parsed, totalBudget, totalActual, totalCommitted });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[ai/budget-forecast] error:', msg);
    // Return a rule-based fallback if AI fails
    const runRate = totalBudget > 0 ? totalActual / totalBudget : 0;
    const forecastFinal = Math.round(totalCommitted + (totalActual - totalCommitted > 0 ? (totalActual - totalCommitted) / Math.max(0.01, runRate) : 0));
    return NextResponse.json({
      forecast_final_cost: forecastFinal || totalActual,
      forecast_variance: forecastFinal - totalBudget,
      forecast_variance_pct: totalBudget > 0 ? Math.round((forecastFinal - totalBudget) / totalBudget * 100) : 0,
      confidence: 60,
      risk_level: runRate > 0.9 ? 'high' : runRate > 0.75 ? 'medium' : 'low',
      at_risk_lines: [],
      recommendations: ['Review high-spend cost codes for overruns.'],
      summary: `AI analysis unavailable. Budget is ${Math.round(runRate * 100)}% spent based on actuals.`,
      totalBudget, totalActual, totalCommitted,
    });
  }
}
