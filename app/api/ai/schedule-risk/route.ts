import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const db = createServerClient();

    // Fetch schedule phases and project info
    const [phasesRes, projectRes] = await Promise.all([
      db.from('schedule_phases')
        .select('*')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .order('start_date', { ascending: true }),
      db.from('projects')
        .select('name, start_date, end_date, status, contract_amount')
        .eq('id', projectId)
        .eq('tenant_id', user.tenantId)
        .single(),
    ]);

    if (phasesRes.error) {
      return NextResponse.json({ error: 'Failed to fetch schedule phases', details: phasesRes.error.message }, { status: 500 });
    }

    const phases = phasesRes.data || [];
    const project = projectRes.data;
    const today = new Date();

    // Calculate pace metrics
    const phaseAnalysis = phases.map((phase: any) => {
      const start = new Date(phase.start_date);
      const end = new Date(phase.end_date);
      const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const elapsedDays = Math.max(0, (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const expectedProgress = Math.min(100, (elapsedDays / totalDays) * 100);
      const actualProgress = phase.percent_complete || 0;
      const variance = actualProgress - expectedProgress;
      const daysRemaining = Math.max(0, (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      let predictedDelay = 0;
      if (actualProgress > 0 && elapsedDays > 0) {
        const ratePerDay = actualProgress / elapsedDays;
        const daysToComplete = ratePerDay > 0 ? (100 - actualProgress) / ratePerDay : Infinity;
        predictedDelay = Math.max(0, daysToComplete - daysRemaining);
      }

      return {
        phase_name: phase.name || phase.phase_name,
        status: phase.status,
        start_date: phase.start_date,
        end_date: phase.end_date,
        percent_complete: actualProgress,
        expected_progress: Math.round(expectedProgress),
        variance: Math.round(variance),
        days_remaining: Math.round(daysRemaining),
        predicted_delay_days: Math.round(predictedDelay),
        at_risk: variance < -10 || predictedDelay > 5,
      };
    });

    const atRiskPhases = phaseAnalysis.filter((p: any) => p.at_risk);

    // Generate AI risk assessment
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Analyze this construction project schedule risk:

Project: ${project?.name || 'Unknown'}
Project Timeline: ${project?.start_date} to ${project?.end_date}
Today: ${today.toISOString().split('T')[0]}

Phase Analysis:
${JSON.stringify(phaseAnalysis, null, 2)}

At-Risk Phases (${atRiskPhases.length}):
${JSON.stringify(atRiskPhases, null, 2)}

Provide a structured risk assessment with:
1. Overall risk level (low/medium/high/critical)
2. Key findings (top 3 risks)
3. Recommended actions
4. Predicted overall project delay in days

Return as JSON: { "risk_level": "...", "findings": [...], "actions": [...], "predicted_delay_days": N, "summary": "..." }`,
      }],
    });

    let aiAssessment: any = {};
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) aiAssessment = JSON.parse(jsonMatch[0]);
    } catch {
      aiAssessment = { summary: responseText, risk_level: 'unknown' };
    }

    return NextResponse.json({
      project: project?.name,
      phases: phaseAnalysis,
      at_risk_count: atRiskPhases.length,
      ai_assessment: aiAssessment,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
