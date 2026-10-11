'use client';
import { useRouter } from 'next/navigation';
export default function OwnerRedirect() {
  const router = useRouter();
  if (typeof window !== 'undefined') router.replace('/portals/client');
  return <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Redirecting to Client Portal…</div>;
}
