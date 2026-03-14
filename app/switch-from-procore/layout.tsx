import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Switch from Procore — Free Migration | Saguaro CRM',
  description: 'Switch from Procore to Saguaro in 1 business day. Free data migration, no implementation consultant, flat pricing starting at $399/mo. AI features Procore doesn\'t have.',
  keywords: ['procore alternative', 'switch from procore', 'procore competitor', 'construction software alternative', 'procore migration'],
  openGraph: {
    title: 'Tired of Procore? Switch to Saguaro in 1 Day — Free Migration',
    description: 'Join 500+ GC teams who switched. Free data migration, 1-day setup, AI takeoff included. $399/mo flat vs Procore\'s $1,850+/mo.',
    url: 'https://saguarocontrol.net/switch-from-procore',
  },
  alternates: { canonical: 'https://saguarocontrol.net/switch-from-procore' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
