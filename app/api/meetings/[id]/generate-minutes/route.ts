import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = await params;
  const db = createServerClient();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Stage 1: Loading
        send({ type: 'stage', stage: 'loading', message: 'Loading meeting data...' });

        const { data: meeting, error: meetingError } = await db
          .from('meetings')
          .select('*')
          .eq('tenant_id', user.tenantId)
          .eq('id', id)
          .single();

        if (meetingError) throw meetingError;
        if (!meeting) throw new Error('Meeting not found');

        const { data: attendees } = await db
          .from('meeting_attendees')
          .select('*')
          .eq('tenant_id', user.tenantId)
          .eq('meeting_id', id);

        // Stage 2: Analyzing
        send({ type: 'stage', stage: 'analyzing', message: 'Analyzing notes and transcript...' });

        const attendeeList = (attendees || [])
          .map((a) => `${a.name} (${a.company}, ${a.role})`)
          .join('\n  - ');

        const prompt = `You are a construction project meeting minutes generator. Generate professional meeting minutes from the following meeting data.

Meeting Details:
- Title: ${meeting.title}
- Type: ${meeting.meeting_type}
- Date: ${meeting.meeting_date}
- Location: ${meeting.location || 'Not specified'}
- Agenda: ${meeting.agenda || 'Not provided'}

Attendees:
  - ${attendeeList || 'None recorded'}

Notes/Transcript:
${meeting.notes || meeting.transcript || 'No notes or transcript available.'}

Respond with ONLY valid JSON in this exact format:
{
  "minutes_text": "Full formatted meeting minutes text in markdown",
  "action_items": [
    {
      "title": "Brief action item title",
      "description": "Detailed description",
      "assignee_name": "Person responsible",
      "due_date": "YYYY-MM-DD or null",
      "priority": "high|medium|low"
    }
  ],
  "summary_line": "One-sentence summary of the meeting"
}`;

        // Stage 3: Writing
        send({ type: 'stage', stage: 'writing', message: 'Generating meeting minutes...' });

        const anthropic = new Anthropic();
        const msg = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = msg.content[0].type === 'text' ? msg.content[0].text : '';

        let parsed: {
          minutes_text: string;
          action_items: Array<{
            title: string;
            description: string;
            assignee_name: string;
            due_date: string | null;
            priority: string;
          }>;
          summary_line: string;
        };

        try {
          parsed = JSON.parse(text);
        } catch {
          // Try extracting JSON from markdown code block
          const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[1].trim());
          } else {
            throw new Error('Failed to parse AI response as JSON');
          }
        }

        // Stage 4: Actions
        send({ type: 'stage', stage: 'actions', message: 'Saving minutes and action items...' });

        // Update meeting with minutes
        const { error: updateError } = await db
          .from('meetings')
          .update({
            minutes_text: parsed.minutes_text,
            summary_line: parsed.summary_line,
            status: 'draft_minutes',
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', user.tenantId)
          .eq('id', id);

        if (updateError) throw updateError;

        // Insert action items
        const insertedItems: unknown[] = [];
        for (const item of parsed.action_items) {
          const { data: aiData, error: aiError } = await db
            .from('action_items')
            .insert({
              tenant_id: user.tenantId,
              meeting_id: id,
              project_id: meeting.project_id,
              title: item.title,
              description: item.description,
              assignee_name: item.assignee_name,
              due_date: item.due_date || null,
              priority: item.priority || 'medium',
              status: 'open',
              created_by: user.id,
            })
            .select()
            .single();

          if (aiError) throw aiError;
          insertedItems.push(aiData);
        }

        // Stage 5: Done
        send({
          type: 'done',
          minutes_text: parsed.minutes_text,
          action_items: insertedItems,
          summary_line: parsed.summary_line,
        });
      } catch (err: unknown) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      }

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
}
