'use client';
import { useRouter } from 'next/navigation';
export default function SubRedirect() {
  const router = useRouter();
  if (typeof window !== 'undefined') router.replace('/portals/sub');
  return <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D4D4D8' }}>Redirecting to Subcontractor Portal…</div>;
}
