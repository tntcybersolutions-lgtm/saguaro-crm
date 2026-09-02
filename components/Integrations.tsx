'use client';
import { SiQuickbooks, SiStripe, SiXero, SiSage, SiAutodesk } from 'react-icons/si';
import type { IconType } from 'react-icons';
import { ScribbleNote } from '@/components/Scribble';

// Real vendor brand marks, rendered directly in each brand's color (react-icons /
// Simple Icons glyphs). No image files to 404 on — the strip always renders. We only
// list integrations we actually ship. DocuSign has no glyph in the icon set, so it
// renders as its brand wordmark.
type Vendor = { name: string; color: string; Icon?: IconType };

const VENDORS: Vendor[] = [
  { name: 'QuickBooks', color: '#2CA01C', Icon: SiQuickbooks },
  { name: 'Stripe', color: '#635BFF', Icon: SiStripe },
  { name: 'Xero', color: '#13B5EA', Icon: SiXero },
  { name: 'Sage', color: '#00D639', Icon: SiSage },
  { name: 'DocuSign', color: '#4C00FF' },
  { name: 'Autodesk', color: '#000000', Icon: SiAutodesk },
];

function VendorLogo({ name, color, Icon }: Vendor) {
  if (Icon) return <Icon size={34} color={color} title={name} aria-label={name} />;
  // DocuSign is a wordmark brand — render it cleanly in its brand color.
  return (
    <span
      aria-label={name}
      style={{ fontSize: 21, fontWeight: 800, color, letterSpacing: '-0.02em', fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {name}
    </span>
  );
}

export function IntegrationStrip({
  heading = 'Integrates with the tools you already use',
}: {
  heading?: string;
}) {
  return (
    <div style={{ padding: '36px 0', borderTop: '1px solid rgba(255,255,255,0.12)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
      {/* The claim that lands with a GC is not that we integrate — everyone
          says that — it is that connecting it does not come with a quote from
          an implementation partner. That is the bill they have actually been
          handed before, so it is the one worth naming. */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
        <ScribbleNote size={15} rotate={-4} color="#FBBF24">no implementation fee</ScribbleNote>
      </div>
      <div style={{ textAlign: 'center', color: '#CBD5E1', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 28, fontWeight: 600 }}>
        {heading}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 50, flexWrap: 'wrap', maxWidth: 1000, margin: '0 auto', padding: '0 24px' }}>
        {VENDORS.map((v) => (
          <div key={v.name} title={v.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 40 }}>
            <VendorLogo {...v} />
          </div>
        ))}
      </div>
    </div>
  );
}
