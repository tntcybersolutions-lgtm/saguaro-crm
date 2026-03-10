'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BidScorePage() {
  const router = useRouter();
  useEffect(() => { router.replace('/app/bids?tab=score'); }, [router]);
  return null;
}
