import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Saguaro CRM — Construction Intelligence Platform',
  description: 'AI-powered construction management platform. Blueprint takeoff in 47 seconds. Beats Procore and Buildertrend.',
  keywords: ['construction CRM', 'AI takeoff', 'construction management', 'bid management'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#0d1117', color: '#e8edf8' }}>
        {children}
      </body>
    </html>
  );
}
