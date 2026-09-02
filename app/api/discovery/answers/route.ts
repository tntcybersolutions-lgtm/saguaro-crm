import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { must } from '@/lib/db-write';

/**
 * GET /api/discovery/answers?customer_id=xxx
 * List discovery_answers for a customer.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customer_id');
    if (!customerId) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('discovery_answers')
      .select('*')
      .eq('customer_id', customerId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ answers: data || [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/discovery/answers
 * Save an answer. Check upsell_tags from the question options and auto-create
 * customer_recommendations for each tag that doesn't already exist.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { customer_id, question_key, question_text, answer_value, answer_details } = body;

    if (!customer_id || !question_key || !answer_value) {
      return NextResponse.json(
        { error: 'customer_id, question_key, and answer_value are required' },
        { status: 400 },
      );
    }

    const db = createServerClient();

    // Save the answer
    const { data: answer, error: ansError } = await db
      .from('discovery_answers')
      .insert({
        tenant_id: user.tenantId,
        customer_id,
        question_key,
        question_text: question_text || question_key,
        answer_value,
        answer_details: answer_details || {},
      })
      .select()
      .single();

    if (ansError) throw ansError;

    // Look up the question to find upsell_tags for the chosen answer
    const { data: question } = await db
      .from('discovery_questions')
      .select('options')
      .eq('question_key', question_key)
      .single();

    let upsellCount = 0;

    if (question?.options && Array.isArray(question.options)) {
      // Find the selected option
      const selectedOption = (question.options as Array<{ value: string; upsell_tags?: string[] }>).find(
        (opt: { value: string; upsell_tags?: string[] }) => opt.value === answer_value,
      );

      if (selectedOption?.upsell_tags && selectedOption.upsell_tags.length > 0) {
        // Mark the answer as upsell-triggered
        await must(db
          .from('discovery_answers')
          .update({ upsell_triggered: true })
          .eq('id', answer.id), 'discovery_answers write');

        // For each tag, create a recommendation if one doesn't already exist
        for (const tag of selectedOption.upsell_tags) {
          // Check if recommendation already exists
          const { data: existing } = await db
            .from('customer_recommendations')
            .select('id')
            .eq('customer_id', customer_id)
            .eq('recommendation_key', tag)
            .eq('tenant_id', user.tenantId)
            .limit(1);

          if (!existing || existing.length === 0) {
            await must(db.from('customer_recommendations').insert({
              tenant_id: user.tenantId,
              customer_id,
              recommendation_key: tag,
              title: formatTagTitle(tag),
              description: `Recommended based on your answer: "${answer_value}" to "${question_text || question_key}"`,
              category: 'discovery_upsell',
              source: 'discovery_answer',
              trigger_question: question_key,
              trigger_answer: answer_value,
              priority: 5,
            }), 'customer_recommendations insert');
            upsellCount++;
          }
        }
      }
    }

    return NextResponse.json({
      answer,
      upsells_created: upsellCount,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Convert a snake_case tag like "pool_house" to "Pool House". */
function formatTagTitle(tag: string): string {
  return tag
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
