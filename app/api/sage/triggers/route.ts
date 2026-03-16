import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';

type TriggerType =
  | 'budget_threshold'
  | 'coi_expiring'
  | 'lien_waiver_overdue'
  | 'change_order_unsigned'
  | 'pay_app_not_submitted'
  | 'rfi_overdue';

interface TriggerBody {
  triggerType: TriggerType;
  triggerData?: Record<string, unknown>;
  projectId?: string;
}

function getPriority(triggerType: TriggerType, triggerData?: Record<string, unknown>): number {
  switch (triggerType) {
    case 'budget_threshold': {
      const percent = typeof triggerData?.percent === 'number' ? triggerData.percent : 0;
      return percent >= 90 ? 8 : 6;
    }
    case 'coi_expiring':
      return 9;
    case 'lien_waiver_overdue':
      return 7;
    case 'change_order_unsigned':
      return 8;
    case 'pay_app_not_submitted':
      return 7;
    case 'rfi_overdue':
      return 6;
    default:
      return 5;
  }
}

function buildInsightMessage(
  triggerType: TriggerType,
  triggerData?: Record<string, unknown>
): string {
  switch (triggerType) {
    case 'budget_threshold':
      return `Project budget is at ${triggerData?.percent ?? ''}% (${triggerData?.amount ?? ''}).`;
    case 'coi_expiring':
      return `COI for ${triggerData?.subName ?? 'a subcontractor'} expires on ${triggerData?.expiresAt ?? 'soon'}.`;
    case 'lien_waiver_overdue':
      return `Lien waiver from ${triggerData?.subName ?? 'a subcontractor'} is ${triggerData?.days ?? ''} days overdue.`;
    case 'change_order_unsigned':
      return `Change order #${triggerData?.coNumber ?? ''} has been unsigned for ${triggerData?.days ?? ''} days.`;
    case 'pay_app_not_submitted':
      return `Pay application for ${triggerData?.month ?? 'this month'} has not been submitted.`;
    case 'rfi_overdue':
      return `RFI #${triggerData?.rfiNumber ?? ''} is ${triggerData?.days ?? ''} days overdue.`;
    default:
      return 'A new trigger event has been recorded.';
  }
}

const VALID_TRIGGER_TYPES: TriggerType[] = [
  'budget_threshold',
  'coi_expiring',
  'lien_waiver_overdue',
  'change_order_unsigned',
  'pay_app_not_submitted',
  'rfi_overdue',
];

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: TriggerBody = await req.json();

    if (!body.triggerType) {
      return NextResponse.json({ error: 'triggerType is required' }, { status: 400 });
    }
    if (!VALID_TRIGGER_TYPES.includes(body.triggerType)) {
      return NextResponse.json({ error: 'Invalid triggerType' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data: triggerRow, error: triggerError } = await supabase
      .from('sage_trigger_events')
      .insert({
        user_id: user.id,
        tenant_id: user.tenantId,
        trigger_type: body.triggerType,
        trigger_data: body.triggerData ?? {},
        project_id: body.projectId ?? null,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (triggerError || !triggerRow) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const priority = getPriority(body.triggerType, body.triggerData);
    const message = buildInsightMessage(body.triggerType, body.triggerData);

    const { data: insightRow, error: insightError } = await supabase
      .from('sage_proactive_insights')
      .insert({
        user_id: user.id,
        tenant_id: user.tenantId,
        trigger_event_id: triggerRow.id,
        trigger_type: body.triggerType,
        message,
        priority,
        project_id: body.projectId ?? null,
        delivered: false,
        dismissed: false,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insightError || !insightRow) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    await supabase
      .from('sage_trigger_events')
      .update({ insight_id: insightRow.id })
      .eq('id', triggerRow.id);

    return NextResponse.json({ success: true, insightCreated: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
