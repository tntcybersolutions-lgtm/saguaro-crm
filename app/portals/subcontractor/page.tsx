'use client';
import { useRouter } from 'next/navigation';
export default function SubRedirect() {
  const router = useRouter();
  if (typeof window !== 'undefined') router.replace('/portals/sub');
  return <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#86868B' }}>Redirecting to Subcontractor Portal...</div>;
}
