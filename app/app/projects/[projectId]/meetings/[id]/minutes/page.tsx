'use client';
/** Printable minutes for one meeting — see components/meetings/MeetingMinutesPrint. */
import React from 'react';
import { useParams } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { PageShell } from '@/components/ui/kit';
import MeetingMinutesPrint from '@/components/meetings/MeetingMinutesPrint';

export default function MeetingMinutesPage() {
  const { projectId, id } = useParams() as { projectId: string; id: string };
  const { ctx } = useProjectContext(projectId);
  const base = `/app/projects/${projectId}`;
  const name = ctx?.project?.name || 'Project';
  return (
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: name, href: `${base}/overview` },
        { label: 'Meetings', href: `${base}/meetings` },
        { label: 'Minutes' },
      ]}
      title="Minutes"
    >
      <MeetingMinutesPrint projectId={projectId} meetingId={id} projectName={name} />
    </PageShell>
  );
}
