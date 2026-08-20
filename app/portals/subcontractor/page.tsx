'use client';
import { useRouter } from 'next/navigation';
export default function SubRedirect() {
  const router = useRouter();
  if (typeof window !== 'undefined') router.replace('/portals/sub');
  return <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B9DB8' }}>Redirecting to Subcontractor Portal...</div>;
}
