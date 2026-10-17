/**
 * /app/projects/:job/punch-list/:id — an old record link (notifications and emails
 * sent before the record pages lived at /items/:tool/:id). Sends it on to the
 * record's real page, so a link already in someone's inbox still opens it.
 */
import { redirect } from 'next/navigation';
import { legacyRecordTarget } from '@/lib/record-links';

export default async function LegacyRecordRedirect({ params }: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await params;
  redirect(legacyRecordTarget('punch-list', projectId, id));
}
