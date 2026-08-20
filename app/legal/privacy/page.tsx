import Link from 'next/link'

export const metadata = { title: 'Privacy Policy — Saguaro CRM' }

export default function PrivacyPage() {
  const s = { page: { maxWidth: 800, margin: '0 auto', padding: '48px 24px', color: '#374151' } as React.CSSProperties, h2: { fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 40, marginBottom: 12 } as React.CSSProperties, p: { fontSize: 15, lineHeight: 1.8, marginBottom: 16 } as React.CSSProperties, li: { fontSize: 15, lineHeight: 1.8, marginBottom: 8 } as React.CSSProperties }

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <div style={s.page}>
        <div style={{ marginBottom: 40 }}><Link href="/" style={{ color: '#D4A017', fontWeight: 700, fontSize: 24, textDecoration: 'none' }}>Saguaro</Link></div>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>Effective Date: January 1, 2025</p>

        <p style={s.p}>Copper State Developments LLC (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;) operates Saguaro Construction Intelligence Platform. This Privacy Policy explains how we collect, use, and protect your information when you use our service.</p>

        <h2 style={s.h2}>Information We Collect</h2>
        <p style={s.p}><strong>Account Information:</strong> Name, email address, company name, phone number, and billing information when you create an account.</p>
        <p style={s.p}><strong>Project Data:</strong> Construction project information, documents, photos, financial data, subcontractor information, and other content you upload to the Service.</p>
        <p style={s.p}><strong>Usage Data:</strong> Log data including IP addresses, browser type, pages visited, time spent, and feature usage to improve the Service.</p>
        <p style={s.p}><strong>Payment Information:</strong> Billing details processed by Stripe. We do not store full credit card numbers on our servers.</p>
        <p style={s.p}><strong>Communications:</strong> Emails and messages you send us for support purposes.</p>

        <h2 style={s.h2}>How We Use Your Information</h2>
        <ul>
          <li style={s.li}>Provide, operate, and maintain the Service</li>
          <li style={s.li}>Process payments and manage subscriptions</li>
          <li style={s.li}>Send transactional emails (project notifications, billing receipts)</li>
          <li style={s.li}>Provide customer support</li>
          <li style={s.li}>Improve and develop the Service based on usage patterns</li>
          <li style={s.li}>Comply with legal obligations</li>
          <li style={s.li}>Detect and prevent fraud and security incidents</li>
        </ul>

        <h2 style={s.h2}>Data Sharing</h2>
        <p style={s.p}>We do not sell, trade, or rent your personal information to third parties. We may share data with:</p>
        <ul>
          <li style={s.li}><strong>Service Providers:</strong> Supabase (database hosting), Stripe (payments), Resend (email delivery), Vercel (hosting), OpenAI/Anthropic (AI features). These providers are contractually bound to protect your data.</li>
          <li style={s.li}><strong>Legal Requirements:</strong> When required by law, court order, or to protect our rights and users&apos; safety.</li>
          <li style={s.li}><strong>Business Transfer:</strong> In the event of a merger or acquisition, with appropriate notice to you.</li>
        </ul>

        <h2 style={s.h2}>Data Retention</h2>
        <p style={s.p}>We retain your account data for the duration of your subscription plus 90 days after termination, allowing you to export your data. After 90 days, your data is permanently deleted. Backup copies may persist for up to 30 additional days.</p>

        <h2 style={s.h2}>Your Rights</h2>
        <p style={s.p}>Depending on your location, you may have the following rights:</p>
        <ul>
          <li style={s.li}><strong>Access:</strong> Request a copy of your personal data</li>
          <li style={s.li}><strong>Correction:</strong> Request correction of inaccurate data</li>
          <li style={s.li}><strong>Deletion:</strong> Request deletion of your account and associated data</li>
          <li style={s.li}><strong>Portability:</strong> Receive your data in a machine-readable format</li>
          <li style={s.li}><strong>Opt-out:</strong> Opt out of non-essential communications</li>
        </ul>
        <p style={s.p}>To exercise these rights, visit <Link href="/legal/data-deletion" style={{ color: '#D4A017' }}>our data deletion page</Link> or email <a href="mailto:privacy@saguarocrm.com" style={{ color: '#D4A017' }}>privacy@saguarocrm.com</a>.</p>

        <h2 style={s.h2}>Cookies</h2>
        <p style={s.p}>We use essential cookies for authentication and session management. We do not use advertising or tracking cookies. You can disable cookies in your browser settings, but this may affect Service functionality.</p>

        <h2 style={s.h2}>Security</h2>
        <p style={s.p}>We use TLS encryption for all data in transit, AES-256 encryption for data at rest, access controls, and regular security audits. Our infrastructure is hosted on SOC 2 compliant providers.</p>

        <h2 style={s.h2}>Children&apos;s Privacy</h2>
        <p style={s.p}>The Service is intended for business use by adults. We do not knowingly collect personal information from anyone under 18 years of age.</p>

        <h2 style={s.h2}>California Residents (CCPA)</h2>
        <p style={s.p}>California residents have additional rights under the CCPA including the right to know what personal information we collect, the right to delete, and the right to opt-out of sale (we do not sell personal information). To submit a request, email <a href="mailto:privacy@saguarocrm.com" style={{ color: '#D4A017' }}>privacy@saguarocrm.com</a>.</p>

        <h2 style={s.h2}>Changes to This Policy</h2>
        <p style={s.p}>We may update this Privacy Policy periodically. We will notify you of significant changes by email and by posting a notice in the Service at least 30 days before changes take effect.</p>

        <h2 style={s.h2}>Contact</h2>
        <p style={s.p}>Privacy questions: <a href="mailto:privacy@saguarocrm.com" style={{ color: '#D4A017' }}>privacy@saguarocrm.com</a></p>

        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 48, paddingTop: 24, display: 'flex', gap: 24 }}>
          <Link href="/legal/terms" style={{ color: '#D4A017', fontSize: 14 }}>Terms of Service</Link>
          <Link href="/legal/data-deletion" style={{ color: '#D4A017', fontSize: 14 }}>Data Deletion</Link>
        </div>
      </div>
    </div>
  )
}
