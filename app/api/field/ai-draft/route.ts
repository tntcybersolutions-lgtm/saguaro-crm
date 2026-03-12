import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

/**
 * POST /api/field/ai-draft
 * Generates a daily log draft using Claude based on project context.
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      projectName,
      weather = 'Unknown',
      tempHigh,
      lastLogWorkPerformed,
      scheduledTasks = [],
      crewCount,
      superintendent,
    } = body;

    const client = new Anthropic();

    const todayDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const scheduleContext = scheduledTasks.length > 0
      ? `Today's scheduled activities:\n${scheduledTasks.map((t: string) => `- ${t}`).join('\n')}`
      : 'No scheduled tasks data available.';

    const lastLogContext = lastLogWorkPerformed
      ? `Yesterday's work: ${lastLogWorkPerformed}`
      : 'No previous log available.';

    const prompt = `You are a construction superintendent writing a daily log for a construction project.

Project: ${projectName || 'Commercial Construction Project'}
Date: ${todayDate}
Weather: ${weather}${tempHigh ? `, High: ${tempHigh}°F` : ''}
Crew on site: ${crewCount || 'Unknown'}
${superintendent ? `Superintendent: ${superintendent}` : ''}

${lastLogContext}
${scheduleContext}

Write a professional, realistic daily construction log entry. Be specific and detailed, using standard construction terminology. Include:

1. Work Performed (3-5 sentences): Describe the day's activities based on the schedule, continuing from yesterday's work. Be specific about locations (e.g., "Level 2 east wing"), trades (electricians, framers, concrete crew), and progress milestones.

2. Delays (1-2 sentences or "None"): Note any realistic delay based on weather or typical construction issues.

3. Safety Notes (1-2 sentences): Standard safety observation appropriate for the work being done.

4. Notes (1 sentence): Brief foreman observation or notable event.

Respond ONLY with valid JSON in this exact format:
{
  "workPerformed": "...",
  "delays": "...",
  "safetyNotes": "...",
  "notes": "..."
}`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response format');

    const draft = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ success: true, draft });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ai-draft]', msg);
    // Return a placeholder so the field app doesn't break
    return NextResponse.json({
      success: false,
      error: msg,
      draft: {
        workPerformed: '',
        delays: '',
        safetyNotes: 'All crew completed morning safety briefing. PPE in use.',
        notes: '',
      },
    });
  }
}
