import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const db = createServerClient();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Fetch all active (non-resolved) lien deadlines
    const { data: deadlines } = await db
      .from('lien_deadlines')
      .select('*, projects(name, tenant_id)')
      .neq('status', 'resolved')
      .order('due_date', { ascending: true });

    let notificationsSent = 0;

    for (const dl of (deadlines || []) as any[]) {
      const dueDate = new Date(dl.due_date);
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
      const tenantId = dl.tenant_id || dl.projects?.tenant_id;
      const projectName = dl.projects?.name || 'Project';

      // Determine which reminder to fire
      let reminderType: string | null = null;
      let urgency: 'info' | 'warning' | 'critical' = 'info';

      if (daysUntilDue < 0 && dl.status !== 'overdue') {
        // Overdue — mark and alert
        await db.from('lien_deadlines').update({ status: 'overdue' }).eq('id', dl.id);
        reminderType = 'overdue';
        urgency = 'critical';
      } else if (daysUntilDue <= 7 && !dl.reminder_sent_7) {
        await db.from('lien_deadlines').update({ reminder_sent_7: true }).eq('id', dl.id);
        reminderType = '7_day';
        urgency = 'critical';
      } else if (daysUntilDue <= 14 && !dl.reminder_sent_14) {
        await db.from('lien_deadlines').update({ reminder_sent_14: true }).eq('id', dl.id);
        reminderType = '14_day';
        urgency = 'warning';
      } else if (daysUntilDue <= 30 && !dl.reminder_sent_30) {
        await db.from('lien_deadlines').update({ reminder_sent_30: true }).eq('id', dl.id);
        reminderType = '30_day';
        urgency = 'info';
      }

      if (reminderType && tenantId) {
        // Create notification
        const messages: Record<string, string> = {
          overdue: `OVERDUE: ${dl.deadline_type} deadline for ${projectName} was due ${dl.due_date}. Immediate action required.`,
          '7_day': `URGENT: ${dl.deadline_type} deadline for ${projectName} is due in ${daysUntilDue} days (${dl.due_date}).`,
          '14_day': `REMINDER: ${dl.deadline_type} deadline for ${projectName} is due in ${daysUntilDue} days (${dl.due_date}).`,
          '30_day': `UPCOMING: ${dl.deadline_type} deadline for ${projectName} is due in ${daysUntilDue} days (${dl.due_date}).`,
        };

        await db.from('notifications').insert({
          tenant_id: tenantId,
          project_id: dl.project_id,
          type: 'lien_deadline',
          title: `Lien Deadline ${reminderType === 'overdue' ? 'OVERDUE' : 'Reminder'}`,
          body: messages[reminderType] || `Lien deadline reminder for ${projectName}`,
          message: messages[reminderType] || `Lien deadline reminder for ${projectName}`,
          severity: urgency,
          link: `/app/projects/${dl.project_id}/lien-waivers`,
          read: false,
          created_at: new Date().toISOString(),
        });

        notificationsSent++;
      }
    }

    return NextResponse.json({ success: true, checked: (deadlines || []).length, notificationsSent, date: todayStr });
  } catch (err) {
    console.error('[cron/lien-deadline-reminders]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
