import Link from 'next/link'

export const metadata = { title: 'Terms of Service — Saguaro CRM' }

export default function TermsPage() {
  const EFFECTIVE_DATE = 'January 1, 2025'
  const COMPANY = 'Copper State Developments LLC'
  const EMAIL = 'legal@saguarocrm.com'
  const APP_URL = 'https://saguarocrm.com'

  const s = {
    page: { maxWidth: 800, margin: '0 auto', padding: '48px 24px', color: '#374151', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' } as React.CSSProperties,
    h1: { fontSize: 32, fontWeight: 900, color: '#0f172a', marginBottom: 8 } as React.CSSProperties,
    h2: { fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 40, marginBottom: 12 } as React.CSSProperties,
    p: { fontSize: 15, lineHeight: 1.8, marginBottom: 16 } as React.CSSProperties,
    li: { fontSize: 15, lineHeight: 1.8, marginBottom: 8 } as React.CSSProperties,
  }

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <div style={s.page}>
        <div style={{ marginBottom: 40 }}>
          <Link href="/" style={{ color: '#D4A017', fontWeight: 700, fontSize: 24, textDecoration: 'none' }}>Saguaro</Link>
        </div>
        <h1 style={s.h1}>Terms of Service</h1>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>Effective Date: {EFFECTIVE_DATE} · Last Updated: {EFFECTIVE_DATE}</p>

        <p style={s.p}>These Terms of Service (&quot;Terms&quot;) govern your use of Saguaro Construction Intelligence Platform (&quot;Service&quot;) operated by {COMPANY} (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By accessing or using the Service, you agree to be bound by these Terms.</p>

        <h2 style={s.h2}>1. Description of Service</h2>
        <p style={s.p}>Saguaro is a cloud-based construction project management platform for general contractors and construction companies. The Service includes project management, financial tracking, document management, subcontractor coordination, and AI-powered tools.</p>

        <h2 style={s.h2}>2. Account Registration</h2>
        <p style={s.p}>To use the Service, you must create an account. You agree to:</p>
        <ul>
          <li style={s.li}>Provide accurate, complete, and current registration information</li>
          <li style={s.li}>Maintain the security of your password and account</li>
          <li style={s.li}>Accept responsibility for all activities under your account</li>
          <li style={s.li}>Notify us immediately of any unauthorized access at {EMAIL}</li>
        </ul>

        <h2 style={s.h2}>3. Subscription and Billing</h2>
        <p style={s.p}>The Service is offered on a subscription basis. By subscribing, you agree to pay the fees specified at the time of purchase. All fees are in US dollars and are non-refundable except as expressly stated herein.</p>
        <p style={s.p}><strong>Trial Period:</strong> New accounts receive a 14-day free trial with full access to all features. No credit card is required during the trial. At the end of the trial, you must subscribe to continue using the Service.</p>
        <p style={s.p}><strong>Billing:</strong> Subscriptions are billed monthly or annually in advance. You authorize us to charge your payment method on each renewal date. Prices may change with 30 days notice.</p>
        <p style={s.p}><strong>Cancellation:</strong> You may cancel at any time. Your access continues until the end of the current billing period. We do not provide prorated refunds for partial periods.</p>

        <h2 style={s.h2}>4. Acceptable Use</h2>
        <p style={s.p}>You agree not to:</p>
        <ul>
          <li style={s.li}>Use the Service for any unlawful purpose or in violation of any regulations</li>
          <li style={s.li}>Upload content that infringes intellectual property rights</li>
          <li style={s.li}>Attempt to reverse engineer, decompile, or hack the Service</li>
          <li style={s.li}>Resell, sublicense, or transfer your account without written consent</li>
          <li style={s.li}>Use the Service to transmit malware, spam, or harmful content</li>
          <li style={s.li}>Interfere with the Service&apos;s infrastructure or other users</li>
        </ul>

        <h2 style={s.h2}>5. Your Data</h2>
        <p style={s.p}>You retain all rights to the data, files, and content you upload to the Service (&quot;Your Content&quot;). By using the Service, you grant us a limited license to process and store Your Content solely to provide the Service to you.</p>
        <p style={s.p}>We do not sell Your Content. We may access Your Content only as necessary to provide support, comply with legal obligations, or enforce these Terms.</p>

        <h2 style={s.h2}>6. Data Security</h2>
        <p style={s.p}>We implement industry-standard security measures including encryption in transit and at rest, access controls, and regular security audits. However, no method of electronic storage is 100% secure. You use the Service at your own risk.</p>

        <h2 style={s.h2}>7. Uptime and Support</h2>
        <p style={s.p}>We target 99.5% monthly uptime but do not guarantee uninterrupted service. Planned maintenance is communicated in advance where possible. Support is available via email at {EMAIL}.</p>

        <h2 style={s.h2}>8. Intellectual Property</h2>
        <p style={s.p}>The Service, including all software, designs, and documentation, is owned by {COMPANY} and protected by intellectual property laws. You may not copy, reproduce, or create derivative works based on the Service without written permission.</p>

        <h2 style={s.h2}>9. Disclaimer of Warranties</h2>
        <p style={s.p}>THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE ERROR-FREE OR UNINTERRUPTED.</p>

        <h2 style={s.h2}>10. Limitation of Liability</h2>
        <p style={s.p}>TO THE MAXIMUM EXTENT PERMITTED BY LAW, {COMPANY.toUpperCase()} SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS OR DATA, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT PAID BY YOU IN THE 12 MONTHS PRECEDING THE CLAIM.</p>

        <h2 style={s.h2}>11. Indemnification</h2>
        <p style={s.p}>You agree to indemnify and hold harmless {COMPANY}, its officers, directors, and employees from any claims, damages, or expenses (including attorney fees) arising from your use of the Service, Your Content, or your violation of these Terms.</p>

        <h2 style={s.h2}>12. Termination</h2>
        <p style={s.p}>We may suspend or terminate your account immediately for violation of these Terms, non-payment, or conduct harmful to other users. Upon termination, your access to the Service ceases. You may request an export of Your Content within 30 days of termination.</p>

        <h2 style={s.h2}>13. Governing Law</h2>
        <p style={s.p}>These Terms are governed by the laws of the State of Arizona, United States, without regard to conflict of law principles. Any disputes shall be resolved exclusively in the state or federal courts located in Maricopa County, Arizona.</p>

        <h2 style={s.h2}>14. Changes to Terms</h2>
        <p style={s.p}>We may update these Terms at any time. We will notify you of material changes by email and by posting a notice in the Service. Continued use of the Service after the effective date of changes constitutes acceptance.</p>

        <h2 style={s.h2}>15. Contact</h2>
        <p style={s.p}>{COMPANY}<br />Email: <a href={`mailto:${EMAIL}`} style={{ color: '#D4A017' }}>{EMAIL}</a><br />Website: <a href={APP_URL} style={{ color: '#D4A017' }}>{APP_URL}</a></p>

        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 48, paddingTop: 24, display: 'flex', gap: 24 }}>
          <Link href="/legal/privacy" style={{ color: '#D4A017', fontSize: 14 }}>Privacy Policy</Link>
          <Link href="/legal/data-deletion" style={{ color: '#D4A017', fontSize: 14 }}>Data Deletion</Link>
        </div>
      </div>
    </div>
  )
}
