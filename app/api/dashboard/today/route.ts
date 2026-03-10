import { NextResponse } from 'next/server';

interface ActionItem {
  type: 'pay-app' | 'insurance' | 'rfi' | 'compliance';
  title: string;
  subtitle: string;
  urgency: 'high' | 'medium' | 'low';
  actionUrl: string;
  actionLabel: string;
}

const DEMO_ITEMS: ActionItem[] = [
  {
    type: 'pay-app',
    title: 'Pay App #4 Pending',
    subtitle: 'Mesa Office Tower — Submitted 2 days ago',
    urgency: 'high',
    actionUrl: '/app/projects/demo/pay-apps',
    actionLabel: 'Review',
  },
  {
    type: 'insurance',
    title: 'COI Expiring Soon',
    subtitle: 'AZ Steel Fabricators — expires in 18 days',
    urgency: 'high',
    actionUrl: '/app/projects/demo/insurance',
    actionLabel: 'Request Renewal',
  },
  {
    type: 'rfi',
    title: 'RFI Overdue',
    subtitle: 'RFI-047 — No response in 5 days',
    urgency: 'medium',
    actionUrl: '/app/projects/demo/rfis',
    actionLabel: 'View RFI',
  },
  {
    type: 'compliance',
    title: 'W-9 Missing',
    subtitle: 'Desert Iron Works — not on file',
    urgency: 'low',
    actionUrl: '/app/projects/demo/w9',
    actionLabel: 'Request W-9',
  },
];

const URGENCY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export async function GET() {
  const items: ActionItem[] = [];

  try {
    // Attempt live DB queries — lazy import so build never fails without env vars
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey || supabaseUrl === 'https://demo.supabase.co') {
      throw new Error('demo-mode');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Pay applications submitted / awaiting approval ───────────────
    const { data: payApps } = await supabase
      .from('pay_applications')
      .select('id, application_number, status, project_id, projects(name)')
      .eq('status', 'submitted')
      .limit(5);

    if (payApps && payApps.length > 0) {
      for (const pa of payApps) {
        const projectName = (pa.projects as { name?: string } | null)?.name ?? 'Unknown Project';
        items.push({
          type: 'pay-app',
          title: `Pay App #${pa.application_number} Pending`,
          subtitle: `${projectName} — awaiting approval`,
          urgency: 'high',
          actionUrl: `/app/projects/${pa.project_id}/pay-apps`,
          actionLabel: 'Review',
        });
      }
    }

    // ── Insurance certificates expiring within 30 days ───────────────
    const thirtyDaysOut = new Date();
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

    const { data: cois } = await supabase
      .from('insurance_certificates')
      .select('id, sub_name, expiry_date, project_id')
      .lte('expiry_date', thirtyDaysOut.toISOString().split('T')[0])
      .gte('expiry_date', new Date().toISOString().split('T')[0])
      .limit(5);

    if (cois && cois.length > 0) {
      for (const coi of cois) {
        const expiry = new Date(coi.expiry_date);
        const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
        items.push({
          type: 'insurance',
          title: 'COI Expiring Soon',
          subtitle: `${coi.sub_name} — expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
          urgency: daysLeft <= 7 ? 'high' : 'medium',
          actionUrl: `/app/projects/${coi.project_id}/insurance`,
          actionLabel: 'Request Renewal',
        });
      }
    }

    // ── Unread notifications ─────────────────────────────────────────
    const { data: notifications } = await supabase
      .from('notifications')
      .select('id, type, title, message, entity_id, urgency')
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(5);

    if (notifications && notifications.length > 0) {
      for (const n of notifications) {
        const nType = n.type as ActionItem['type'];
        if (!['pay-app', 'insurance', 'rfi', 'compliance'].includes(nType)) continue;
        items.push({
          type: nType,
          title: n.title ?? 'Notification',
          subtitle: n.message ?? '',
          urgency: (n.urgency as ActionItem['urgency']) ?? 'medium',
          actionUrl: `/app/projects/${n.entity_id ?? 'demo'}`,
          actionLabel: 'View',
        });
      }
    }

    // If DB returned nothing, fall back to demo data
    if (items.length === 0) {
      return NextResponse.json({ items: DEMO_ITEMS });
    }

    // Sort by urgency
    items.sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 2) - (URGENCY_ORDER[b.urgency] ?? 2));
    return NextResponse.json({ items });

  } catch {
    // Demo mode or DB unavailable — return demo items
    return NextResponse.json({ items: DEMO_ITEMS });
  }
}
