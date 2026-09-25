import { redirect } from 'next/navigation';

/* Server-side redirect into the project home.
 *
 * The comment here used to claim "no blank client frame". Measured against
 * production it was not true: this answered HTTP 200 carrying
 *   <meta http-equiv="refresh" content="1;url=.../overview">
 * so every entry into a project sat on a blank frame for a full second. Next
 * degrades redirect() to a meta refresh once the shell has already flushed,
 * and the sibling loading.tsx in this segment is what flushes it.
 *
 * force-dynamic keeps the segment from being statically shelled, so redirect()
 * resolves before anything streams and answers with a real 307. */
export const dynamic = 'force-dynamic';
export default function ProjectIndexPage({ params }: { params: { projectId: string } }) {
  redirect(`/app/projects/${params.projectId}/overview`);
}
