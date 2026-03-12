'use client';
import { usePathname } from 'next/navigation';
import SaguaroChatWidget from './SaguaroChatWidget';

export default function MarketingChatWrapper() {
  const pathname = usePathname();
  // Don't show marketing bot on /app/* routes
  if (pathname?.startsWith('/app')) return null;
  return <SaguaroChatWidget variant="marketing" />;
}
