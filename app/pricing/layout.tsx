import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — Saguaro Control Systems — Construction Management & Project Controls | Flat Rate, Free Migration, Unlimited Users',
  description: 'Saguaro Control Systems — Construction Management & Project Controls pricing: Starter $499/mo, Professional $750/mo, Enterprise custom. Free migration from Procore or Buildertrend. Flat pricing — unlimited users. No per-seat fees.',
  keywords: ['construction CRM pricing', 'procore pricing alternative', 'buildertrend alternative pricing', 'general contractor software price', 'free migration construction software', 'construction project management pricing'],
  openGraph: {
    title: 'Saguaro Control Systems — Construction Management & Project Controls Pricing — Flat Rate. Free Migration. Unlimited Users.',
    description: 'Starter $499/mo, Professional $750/mo. Free migration from Procore or Buildertrend. Unlimited users, no per-seat fees.',
    url: 'https://saguarocontrol.net/pricing',
  },
  alternates: { canonical: 'https://saguarocontrol.net/pricing' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
