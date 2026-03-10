'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ProjectIndexPage() {
  const params = useParams();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/app/projects/${params['projectId']}/overview`);
  }, [params, router]);
  return null;
}
