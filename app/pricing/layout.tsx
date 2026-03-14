import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — Saguaro CRM | Flat Rate for Your Whole Team',
  description: 'Saguaro CRM pricing: Starter $199/mo, Professional $399/mo, Enterprise custom. Flat pricing — add your whole team for one price. No per-seat fees. Month-to-month.',
  keywords: ['construction CRM pricing', 'procore pricing alternative', 'general contractor software price', 'construction project management pricing'],
  openGraph: {
    title: 'Saguaro CRM Pricing — One Price. Your Whole Team.',
    description: 'Starter $199/mo, Professional $399/mo. Flat pricing, month-to-month, no per-seat fees. Cancel anytime.',
    url: 'https://saguarocontrol.net/pricing',
  },
  alternates: { canonical: 'https://saguarocontrol.net/pricing' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
