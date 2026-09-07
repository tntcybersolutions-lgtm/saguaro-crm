import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How to Get Started — Saguaro Control Systems — Construction Management & Project Controls',
  description: 'Step-by-step guide to setting up Saguaro: sign up, log in, invite your team, install on your phone, and run your first AI takeoff.',
};

export default function HowToGetStartedPage() {
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --dark: #0a0a0a; --gold: #F59E0B; --text: #FFFFFF;
          --dim: #CBD5E1; --border: rgba(255,255,255,0.08); --raised: #141416;
          --green: #22c55e; --font: system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        }
        body { background: var(--dark); color: var(--text); font-family: var(--font); }
        a { color: var(--gold); }
        .nav {
          position: sticky; top: 0; z-index: 100;
          height: 64px; display: flex; align-items: center;
          justify-content: space-between; padding: 0 32px;
          background: rgba(20,20,22,0.95); backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }
        .logo { font-weight: 600; font-size: 16px; text-decoration: none;
          color: var(--text); letter-spacing: 0.5px; }
        .nav-cta {
          padding: 9px 22px; background: var(--gold);
          border-radius: 8px; color: #0a0a0a; font-weight: 600; font-size: 13px;
          text-decoration: none;
        }
        .container { max-width: 860px; margin: 0 auto; padding: 72px 24px; }
        .hero { text-align: center; margin-bottom: 80px; }
        .badge {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 14px; background: transparent;
          border: 1px solid rgba(255,255,255,0.14); border-radius: 20px;
          font-size: 11px; font-weight: 500; color: var(--dim);
          letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 24px;
        }
        .badge .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--gold); }
        .hero h1 { font-size: clamp(26px,4vw,30px); font-weight: 600; line-height: 1.2; margin-bottom: 16px; letter-spacing: -0.5px; }
        .hero p { font-size: 17px; color: var(--dim); max-width: 560px; margin: 0 auto; line-height: 1.65; }

        .section { margin-bottom: 72px; }
        .section-label {
          font-size: 11px; font-weight: 600; color: var(--dim);
          letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px;
        }
        .section h2 { font-size: 21px; font-weight: 600; color: var(--text); margin-bottom: 8px; }
        .section .sub { font-size: 15px; color: var(--dim); line-height: 1.65; margin-bottom: 24px; }

        .card {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; padding: 24px 28px; margin-bottom: 16px;
        }
        .card-gold { border-color: rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); }

        .step-row { display: flex; gap: 20px; align-items: flex-start; }
        .step-num {
          width: 40px; height: 40px; flex-shrink: 0;
          border-radius: 50%; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; font-weight: 600; color: var(--text);
        }
        .step-body h3 { font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
        .step-body p { font-size: 14px; color: var(--dim); line-height: 1.65; }
        .step-body .note {
          margin-top: 12px; padding: 10px 14px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px; font-size: 13px; color: var(--dim);
        }
        .step-body .note strong { color: var(--text); }

        .device-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 28px; }
        .device-card {
          padding: 0; background: transparent;
          border: none; border-radius: 0;
        }
        .device-card .icon { font-size: 22px; margin-bottom: 10px; opacity: 0.9; }
        .device-card h4 { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
        .device-card ol { padding-left: 16px; }
        .device-card li { font-size: 12px; color: var(--dim); line-height: 1.6; margin-bottom: 2px; }

        .cta-box {
          text-align: center; padding: 64px 32px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 16px;
          margin-bottom: 48px;
        }
        .cta-box h2 { font-size: 22px; font-weight: 600; margin-bottom: 12px; }
        .cta-box p { font-size: 15px; color: var(--dim); margin-bottom: 28px; line-height: 1.65; }
        .btn-primary {
          display: inline-block; padding: 11px 26px;
          background: var(--gold);
          border-radius: 8px; color: #0a0a0a; font-weight: 600; font-size: 15px;
          text-decoration: none; box-shadow: none;
          margin-bottom: 12px;
        }
        .trust-row { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; margin-top: 16px; }
        .trust-item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--dim); }

        .faq-item { border-bottom: 1px solid var(--border); padding: 20px 0; }
        .faq-item:last-child { border-bottom: none; }
        .faq-q { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 8px; }
        .faq-a { font-size: 14px; color: var(--dim); line-height: 1.7; }

        @media(max-width: 600px) {
          .container { padding: 40px 16px; }
          .nav { padding: 0 16px; }
        }
      `}</style>

      {/* Nav */}
      <nav className="nav">
        <Link href="/" className="logo">SAGUARO</Link>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/login" style={{ fontSize: 13, color: 'var(--dim)', textDecoration: 'none', fontWeight: 600 }}>Log In</Link>
          <Link href="/signup" className="nav-cta">Start Free Trial</Link>
        </div>
      </nav>

      <div className="container">

        {/* Hero */}
        <div className="hero">
          <div className="badge"><span className="dot" />Complete Setup Guide</div>
          <h1>How to Get Started with Saguaro</h1>
          <p>From sign-up to running your first AI takeoff — everything you need to know in one place.</p>
        </div>

        {/* WHAT IS SAGUARO */}
        <div className="section">
          <div className="card card-gold">
            <div className="section-label">First — important to know</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Saguaro is a web-based platform — nothing to download</h2>
            <p style={{ fontSize: 14, color: 'var(--dim)', lineHeight: 1.7, marginBottom: 16 }}>
              Unlike traditional software, the Saguaro platform runs entirely in your web browser — just like Gmail, QuickBooks Online, or Procore. There is no installer and no .exe file to run on your computer.
            </p>
            <p style={{ fontSize: 14, color: 'var(--dim)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text)' }}>To access Saguaro:</strong> Open any browser (Chrome, Safari, Edge, Firefox) on any device and go to <a href="https://saguarocontrol.net/app">saguarocontrol.net/app</a>. Log in and your full platform is right there. Bookmark it.
            </p>
          </div>
        </div>

        {/* STEP 1: SIGN UP */}
        <div className="section">
          <div className="section-label">Step 1</div>
          <h2>Create Your Account</h2>
          <p className="sub">Takes 30 seconds. No credit card required — your 30-day free trial starts immediately.</p>
          <div className="card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { n: '1', t: 'Go to saguarocontrol.net/signup', d: 'Open your browser and navigate to the signup page.' },
                { n: '2', t: 'Enter your name, work email, and password', d: 'Use your real work email — this is where confirmation and billing notices will be sent.' },
                { n: '3', t: 'Enter your company name and team size', d: 'This sets up your company workspace. You can change it later.' },
                { n: '4', t: 'Click "Start Free Trial"', d: 'Your account is created instantly. You\'ll receive a confirmation email — click the link inside to activate.' },
                { n: '5', t: 'Confirm your email', d: 'Check your inbox for an email from Saguaro. Click the confirmation link. You\'re in.' },
              ].map(s => (
                <div key={s.n} className="step-row">
                  <div className="step-num">{s.n}</div>
                  <div className="step-body">
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* STEP 2: ACCESS */}
        <div className="section">
          <div className="section-label">Step 2</div>
          <h2>Log In and Access Your Dashboard</h2>
          <p className="sub">Your platform is ready the moment your account is confirmed — no setup required on your end.</p>
          <div className="card card-gold">
            <div className="step-row">
              <div className="step-num" style={{ fontSize: 20 }}>🌐</div>
              <div className="step-body">
                <h3>Open your browser → go to saguarocontrol.net/app</h3>
                <p>Works in Chrome, Safari, Edge, Firefox — on Windows, Mac, iPhone, iPad, Android, and Chromebook. No software install. No IT department. Just a browser.</p>
                <div className="note">
                  <strong>Bookmark this now:</strong> saguarocontrol.net/app — this is your homepage for everything. Add it to your browser favorites and your phone home screen.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* STEP 3: PHONE */}
        <div className="section">
          <div className="section-label">Step 3 (Recommended)</div>
          <h2>Get the Field App on Your Phone</h2>
          <p className="sub">Saguaro Control Systems — Construction Management & Project Controls is a native iOS app — free on Apple TestFlight while we finish the public App Store release. Your crew gets GPS clock-in, daily logs, photos, and RFIs, fully offline-capable. (Android coming soon.)</p>
          <div className="device-grid">
            <div className="device-card">
              <div className="icon">🍎</div>
              <h4>iPhone / iPad</h4>
              <ol>
                <li>Go to <strong>saguarocontrol.net/get-the-app</strong></li>
                <li>Tap <strong>Join the iOS Beta</strong></li>
                <li>Install Apple&apos;s free <strong>TestFlight</strong> app</li>
                <li>Tap <strong>Install</strong> on Saguaro Control Systems — Construction Management & Project Controls</li>
                <li>Open the app and sign in</li>
              </ol>
            </div>
            <div className="device-card">
              <div className="icon">🤖</div>
              <h4>Android</h4>
              <ol>
                <li><strong>Coming soon</strong></li>
                <li>An Android build is on the roadmap</li>
                <li>For now, open the field app in Chrome at <strong>saguarocontrol.net/field</strong></li>
              </ol>
            </div>
            <div className="device-card">
              <div className="icon">💻</div>
              <h4>Desktop / Browser</h4>
              <ol>
                <li>Prefer a bigger screen?</li>
                <li>Open <strong>saguarocontrol.net/field</strong></li>
                <li>Runs in any browser — nothing to install</li>
              </ol>
            </div>
            <div className="device-card">
              <div className="icon">📋</div>
              <h4>For Your Crew</h4>
              <ol>
                <li>Text or email your crew the TestFlight link</li>
                <li>They install it the same way</li>
                <li>Invite them from your dashboard</li>
                <li>Free for unlimited crew members</li>
              </ol>
            </div>
          </div>
        </div>

        {/* STEP 4: SETUP */}
        <div className="section">
          <div className="section-label">Step 4</div>
          <h2>Complete Your 5-Minute Company Setup</h2>
          <p className="sub">After logging in, Saguaro walks you through a quick setup wizard. Here's what it covers:</p>
          <div className="card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { n: '1', t: 'Company profile', d: 'Add your company name, logo, license number, and default state. This appears on all pay apps, lien waivers, and bid documents you generate.' },
                { n: '2', t: 'Create your first project', d: 'Add a project name, address, owner info, and contract value. Takes 2 minutes. You can import from Procore or spreadsheets too.' },
                { n: '3', t: 'Upload a blueprint (optional)', d: 'Drop any PDF blueprint to try the AI Takeoff. Sage reads every dimension and builds your material list automatically — no manual counting.' },
                { n: '4', t: 'Invite your team', d: 'Add your PMs, estimators, supers, and office staff. They\'ll receive an email invite. Unlimited users — no extra cost.' },
              ].map(s => (
                <div key={s.n} className="step-row">
                  <div className="step-num">{s.n}</div>
                  <div className="step-body">
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* STEP 5: BILLING */}
        <div className="section">
          <div className="section-label">Step 5</div>
          <h2>Choosing a Plan (After Your Free Trial)</h2>
          <p className="sub">Your 30-day free trial gives you full access to everything. No credit card is required to start. When your trial ends, choose a plan to keep access.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {[
              { name: 'Starter', price: '$499/mo', desc: 'Unlimited users, up to 15 projects, 150 AI pages/mo, pay apps, lien waivers, mobile app. Best for small GCs.', href: '/signup' },
              { name: 'Professional', price: '$750/mo', desc: 'Unlimited projects, unlimited AI, certified payroll, bid intelligence, owner portals, all documents.', href: '/signup', popular: true },
            ].map(p => (
              <div key={p.name} className="card" style={{ borderColor: p.popular ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)' }}>
                {p.popular && <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--dim)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Most Popular</div>}
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>{p.price}</div>
                <p style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.6, marginBottom: 16 }}>{p.desc}</p>
                <a href={p.href} style={{ display: 'block', padding: '10px', textAlign: 'center', background: p.popular ? 'var(--gold)' : 'transparent', border: p.popular ? 'none' : '1px solid rgba(255,255,255,0.14)', borderRadius: 8, color: p.popular ? '#0a0a0a' : 'var(--dim)', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
                  Start Free Trial →
                </a>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: '16px 20px', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, fontSize: 13, color: 'var(--dim)' }}>
            Payment is handled securely via Stripe. Your card is never charged during the free trial. Cancel anytime — your data is preserved for 30 days after cancellation.
          </div>
        </div>

        {/* FAQ */}
        <div className="section">
          <div className="section-label">FAQ</div>
          <h2>Common Questions</h2>
          <div className="card" style={{ padding: '8px 28px' }}>
            {[
              { q: 'Do I need to download or install anything?', a: 'No. Saguaro is entirely web-based. You access it at saguarocontrol.net in any browser. The only optional "install" is adding the site to your phone home screen, which takes 10 seconds.' },
              { q: 'What browser should I use?', a: 'Chrome or Safari give the best experience. Edge and Firefox also work fully. Internet Explorer is not supported.' },
              { q: 'Can my field crew use it without a computer?', a: 'Yes — that\'s exactly what the mobile app is for. Add saguarocontrol.net to their iPhone or Android home screen and they can clock in with GPS, submit daily logs, take photos, and file RFIs from the job site.' },
              { q: 'How many users can I add?', a: 'Unlimited. Your flat subscription covers every person at your company — PMs, estimators, supers, field crew, accounting, and owners. We will never charge you per seat.' },
              { q: 'What happens when my trial ends?', a: 'You\'ll be prompted to choose a plan and enter payment info. If you don\'t, your account is paused (not deleted) and your data is preserved for 30 days. No surprise charges.' },
              { q: 'Can I migrate from Procore or Buildertrend?', a: 'Yes — and it\'s free. We migrate your projects, contacts, documents, and history. Our team handles everything and gets you live in 1 business day. Email support@saguarocontrol.net to start.' },
            ].map((f, i) => (
              <div key={i} className="faq-item">
                <div className="faq-q">{f.q}</div>
                <div className="faq-a">{f.a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="cta-box">
          <h2>Ready to get started?</h2>
          <p>Sign up in 30 seconds. No credit card required. Your whole team is live in under 5 minutes.</p>
          <Link href="/signup" className="btn-primary">Start Free Trial →</Link>
          <div className="trust-row">
            {['30 days free', 'No credit card', 'Unlimited users', 'Free migration', 'Cancel anytime'].map(t => (
              <div key={t} className="trust-item">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="8" fill="rgba(34,197,94,0.15)" />
                  <path d="M4.5 8l2.5 2.5 4-5" stroke="#22c55e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* Support */}
        <div style={{ textAlign: 'center', paddingBottom: 32 }}>
          <p style={{ fontSize: 14, color: 'var(--dim)' }}>
            Still have questions?{' '}
            <a href="mailto:support@saguarocontrol.net">support@saguarocontrol.net</a>
            {' '}— we respond within 48 hours.
          </p>
        </div>

      </div>
    </>
  );
}
