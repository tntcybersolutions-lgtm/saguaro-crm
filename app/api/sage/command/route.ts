import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type ActionType =
  | 'daily_report' | 'g702' | 'change_order' | 'rfi' | 'lien_waiver'
  | 'contract' | 'closeout' | 'milestone' | 'coi' | 'health' | 'unknown';

interface ActionSpec {
  actionType: ActionType;
  label: string;
  description: string;
  buttonLabel: string;
  routeTemplate: string; // ${projectId} will be substituted
}

const ACTIONS: Record<ActionType, ActionSpec> = {
  daily_report: {
    actionType: 'daily_report',
    label: 'Daily Report',
    description: 'Open the daily report builder (voice → AI).',
    buttonLabel: 'Open Daily Reports',
    routeTemplate: '/app/projects/${projectId}/daily-reports',
  },
  g702: {
    actionType: 'g702',
    label: 'G702 Pay Application',
    description: 'Create or edit an AIA G702/G703 application.',
    buttonLabel: 'Open Pay Apps',
    routeTemplate: '/app/projects/${projectId}/pay-applications',
  },
  change_order: {
    actionType: 'change_order',
    label: 'Change Order',
    description: 'Draft a change order with Sage AI.',
    buttonLabel: 'Open Change Orders',
    routeTemplate: '/app/projects/${projectId}/change-orders',
  },
  rfi: {
    actionType: 'rfi',
    label: 'RFI',
    description: 'Draft an RFI to the architect.',
    buttonLabel: 'Open RFIs',
    routeTemplate: '/app/projects/${projectId}/rfis',
  },
  lien_waiver: {
    actionType: 'lien_waiver',
    label: 'Lien Waiver',
    description: 'Send or manage lien waivers.',
    buttonLabel: 'Open Lien Waivers',
    routeTemplate: '/app/projects/${projectId}/lien-waivers',
  },
  contract: {
    actionType: 'contract',
    label: 'Subcontract',
    description: 'Generate a subcontract with Sage AI.',
    buttonLabel: 'Open Contracts',
    routeTemplate: '/app/projects/${projectId}/contracts',
  },
  closeout: {
    actionType: 'closeout',
    label: 'Closeout',
    description: 'Track project closeout items.',
    buttonLabel: 'Open Closeout',
    routeTemplate: '/app/projects/${projectId}/closeout',
  },
  milestone: {
    actionType: 'milestone',
    label: 'Milestone Letter',
    description: 'Generate NTP, SC, or punch list letters.',
    buttonLabel: 'Open Milestone Letters',
    routeTemplate: '/app/projects/${projectId}/milestone-letters',
  },
  coi: {
    actionType: 'coi',
    label: 'COI Tracking',
    description: 'Review subcontractor insurance certificates.',
    buttonLabel: 'Open COI Tracking',
    routeTemplate: '/app/projects/${projectId}/insurance',
  },
  health: {
    actionType: 'health',
    label: 'System Health',
    description: 'Run diagnostics across the platform.',
    buttonLabel: 'Open System Health',
    routeTemplate: '/app/admin/health',
  },
  unknown: {
    actionType: 'unknown',
    label: 'Dashboard',
    description: "I couldn't match that to a feature. Taking you to the dashboard.",
    buttonLabel: 'Open Dashboard',
    routeTemplate: '/app',
  },
};

const KEYWORDS: Array<{ type: ActionType; terms: string[] }> = [
  { type: 'daily_report', terms: ['daily', 'report', 'log', 'weather', 'crew', 'voice'] },
  { type: 'g702',         terms: ['g702', 'g703', 'pay app', 'pay application', 'aia', 'sov', 'billing', 'invoice owner'] },
  { type: 'change_order', terms: ['change order', 'co ', 'cor ', 'co #', 'scope change', 'extra work'] },
  { type: 'rfi',          terms: ['rfi', 'request for information', 'architect question', 'clarification'] },
  { type: 'lien_waiver',  terms: ['lien', 'waiver', 'partial conditional', 'final conditional', 'sub waiver'] },
  { type: 'contract',     terms: ['subcontract', 'contract', 'trade agreement', 'sign contract'] },
  { type: 'closeout',     terms: ['closeout', 'close out', 'close-out', 'substantial completion', 'warranty book', 'as-built'] },
  { type: 'milestone',    terms: ['milestone letter', 'notice to proceed', 'ntp', 'certificate of substantial', 'punch list letter', 'retainage release letter'] },
  { type: 'coi',          terms: ['coi', 'insurance certificate', 'coverage', 'certificate of insurance'] },
  { type: 'health',       terms: ['system health', 'health check', 'diagnostics', 'status check', 'is everything working'] },
];

function classifyByKeywords(command: string): ActionType | null {
  const lc = command.toLowerCase();
  let best: { type: ActionType; score: number } | null = null;
  for (const kw of KEYWORDS) {
    let hits = 0;
    for (const t of kw.terms) if (lc.includes(t)) hits++;
    if (hits > 0 && (!best || hits > best.score)) {
      best = { type: kw.type, score: hits };
    }
  }
  return best?.type ?? null;
}

async function classifyByAI(command: string): Promise<ActionType> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return 'unknown';
  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 40,
      system: `Classify the user's construction-app command into exactly one of these action types:
daily_report | g702 | change_order | rfi | lien_waiver | contract | closeout | milestone | coi | health | unknown

Return ONLY the action type string — no punctuation, no explanation.`,
      messages: [{ role: 'user', content: command }],
    });
    const txt = (msg.content[0] as { text?: string })?.text?.trim().toLowerCase() || '';
    if (txt in ACTIONS) return txt as ActionType;
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const command: string = (body?.command || '').toString().trim();
    const projectId: string | null = body?.projectId || null;
    if (!command) return NextResponse.json({ error: 'command is required' }, { status: 400 });

    const byKeyword = classifyByKeywords(command);
    const actionType: ActionType = byKeyword ?? await classifyByAI(command);
    const spec = ACTIONS[actionType];

    let route = spec.routeTemplate;
    if (route.includes('${projectId}')) {
      if (projectId) {
        route = route.replace('${projectId}', projectId);
      } else {
        // No project context — send to projects list instead of /app/projects/undefined/...
        route = '/app/projects';
      }
    }

    const action = {
      label: spec.label,
      description: spec.description,
      buttonLabel: spec.buttonLabel,
      route,
    };

    // Log to sage_quick_actions (non-blocking)
    try {
      const db = createServerClient();
      await db.from('sage_quick_actions').insert({
        tenant_id: user.tenantId,
        user_id: user.id,
        project_id: projectId,
        command,
        action_type: actionType,
        route,
        created_at: new Date().toISOString(),
      });
    } catch { /* non-blocking */ }

    return NextResponse.json({
      actionType,
      action,
      matchedBy: byKeyword ? 'keyword' : 'ai',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
