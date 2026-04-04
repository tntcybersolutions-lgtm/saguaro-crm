'use client';
import { useRouter } from 'next/navigation';
export default function OwnerRedirect() {
  const router = useRouter();
  if (typeof window !== 'undefined') router.replace('/portals/client');
  return <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}>Redirecting to Client Portal...</div>;
}
