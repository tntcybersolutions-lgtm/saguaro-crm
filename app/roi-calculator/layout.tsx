import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ROI Calculator — How Much Are You Losing Without Saguaro?',
  description: 'Calculate exactly how much manual takeoffs, lien waivers, and Procore pricing are costing your GC business. Most teams save $3,000–$8,000/month.',
  keywords: ['construction ROI calculator', 'procore cost calculator', 'construction software savings', 'general contractor software cost'],
  openGraph: {
    title: 'Construction ROI Calculator — See Your Exact Savings',
    description: 'Enter your numbers. See how much you\'re leaving on the table with manual processes and expensive software.',
    url: 'https://saguarocontrol.net/roi-calculator',
  },
  alternates: { canonical: 'https://saguarocontrol.net/roi-calculator' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
