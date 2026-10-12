'use client';
/**
 * Signup — Pass 4 on the kit. Same flow as before: POST /api/auth/signup,
 * confirmed / demo accounts land straight on /app, everyone else sees the
 * check-your-email state.
 */
import React, { useState } from 'react';
import { SUB_TRADES, SUB_TRADES_BY_DIVISION } from '@/lib/construction-intelligence';
import { TRIAL_DAYS } from '@/lib/plans';
import Link from 'next/link';
import MarketingNav from '@/components/MarketingNav';
import { Check, Warning, User, Monitor, DeviceMobile, UsersThree, CheckCircle } from '@phosphor-icons/react';
import { Card, Field, Input, Select, Button, FormGrid, Badge } from '@/components/ui/kit';
import { FlowSteps } from '@/components/ui/premium';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const HOW_IT_WORKS = [
  { title: 'Create Your Account', desc: 'Fill out the form — takes about 30 seconds. No credit card needed.', icon: User },
  { title: 'Log In — It\'s Ready Instantly', desc: 'No download. No install. Open your browser, go to saguarocontrol.net, and log in. Your full platform is live.', icon: Monitor },
  { title: 'Install on Your Phone (Optional)', desc: 'Download Saguaro Control Systems free from Apple TestFlight on your iPhone. On Android, open it in Chrome.', icon: DeviceMobile },
  { title: 'Invite Your Team', desc: 'Add unlimited users — PMs, estimators, field crew. Everyone gets access for free.', icon: UsersThree },
];

const CSS = `
.suPage { min-height: 100vh; background: var(--bg-base); }
.suGrid { display: grid; grid-template-columns: 1fr 1fr; min-height: calc(100vh - 60px); max-width: 1100px; margin: 0 auto; padding: 0 16px; gap: 48px; align-items: start; }
.suLeft { padding: 48px 0 40px; position: sticky; top: 80px; }
.suRight { padding: 48px 0 40px; }
.suTrial { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 24px; }
.suH1 { font-size: clamp(26px, 3.4vw, 36px); font-weight: 800; color: var(--text-primary); line-height: 1.15; margin: 0 0 12px; letter-spacing: -0.02em; }
.suH1 b { color: var(--text-primary); }
.suLead { font-size: var(--fs-md); color: var(--text-secondary); line-height: 1.7; margin: 0 0 32px; }
.suLead b { color: var(--text-primary); }
.suSteps { display: flex; flex-direction: column; gap: 20px; margin-bottom: 32px; }
.suStep { display: flex; gap: 14px; align-items: flex-start; }
.suStepIcon { width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; background: var(--bg-surface-2); border: 1px solid var(--glass-border); color: var(--text-tertiary); }
.suStepTitle { font-size: var(--fs-md); font-weight: 600; color: var(--text-primary); margin-bottom: 3px; }
.suStepNum { color: var(--text-tertiary); font-size: var(--fs-xs); font-weight: 600; margin-right: 6px; }
.suStepDesc { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.6; }
.suTrust { display: flex; flex-wrap: wrap; gap: 14px; }
.suTrust span { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--text-tertiary); }
.suTrust svg { color: var(--status-ongoing); }
.suQuote { margin-top: 32px; }
.suQuote p { font-size: var(--fs-sm); color: var(--text-secondary); line-height: 1.7; margin: 0 0 10px; font-style: italic; }
.suQuote b { font-size: var(--fs-xs); color: var(--text-primary); }
.suQuote b span { color: var(--text-tertiary); font-weight: 400; }
.suHead { margin-bottom: 20px; }
.suHead h2 { font-size: 22px; font-weight: 700; color: var(--text-primary); margin: 0 0 6px; }
.suHead p { font-size: var(--fs-sm); color: var(--text-tertiary); margin: 0; }
.suMsg { display: flex; align-items: flex-start; gap: 8px; padding: 10px 14px; border-radius: var(--radius-sm); font-size: var(--fs-sm); margin-bottom: 16px; background: rgba(255,77,94,.08); border: 1px solid rgba(255,77,94,.35); color: var(--status-overdue); }
.suMsg > svg { flex-shrink: 0; margin-top: 1px; }
.suSubmit { width: 100%; justify-content: center; min-height: 46px; margin-top: 6px; }
.suNext { margin-top: 18px; }
.suFoot { margin-top: 16px; text-align: center; font-size: var(--fs-sm); color: var(--text-tertiary); }
.suFoot a { color: var(--link); text-decoration: none; font-weight: 600; }
.suLegal { margin-top: 8px; text-align: center; font-size: var(--fs-xs); color: var(--text-tertiary); }
.suLegal a { color: var(--text-tertiary); text-decoration: underline; text-underline-offset: 3px; }
.suDone { min-height: 100vh; background: var(--bg-base); display: flex; align-items: center; justify-content: center; padding: 24px 16px; }
.suDoneWrap { width: 100%; max-width: 480px; text-align: center; }
.suDoneIcon { width: 72px; height: 72px; border-radius: 50%; background: rgba(74,222,128,.10); border: 1px solid rgba(74,222,128,.3); display: grid; place-items: center; margin: 0 auto 20px; color: var(--status-ongoing); }
.suDoneWrap h1 { font-size: 26px; font-weight: 700; color: var(--text-primary); margin: 0 0 12px; }
.suDoneWrap p { color: var(--text-secondary); font-size: var(--fs-md); line-height: 1.7; margin: 0 0 24px; }
.suDoneWrap p b { color: var(--text-primary); }
.suDoneList { text-align: left; margin-bottom: 20px; }
.suDoneList div { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: var(--fs-sm); color: var(--text-secondary); }
.suDoneList svg { color: var(--status-ongoing); flex-shrink: 0; }
.suLink { all: unset; color: var(--link); cursor: pointer; font-weight: 600; }
.suLink:focus-visible { outline: 2px solid var(--link); }
.suPage select.k-select optgroup { color: var(--text-tertiary); }
@media (max-width: 760px) { .suGrid { grid-template-columns: 1fr; gap: 32px; } .suLeft { position: static; padding-bottom: 0; } .suRight { padding-top: 0; } }
@media (max-width: 640px) { .suPage .k-btn, .suPage .k-input, .suPage select.k-select { min-height: 44px; } }
`;

export default function SignupPage(){
  const [form, setForm] = useState({name:'',email:'',password:'',company:'',phone:'',role:'General Contractor',state:'AZ',size:'1-10'});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function update(k:string,v:string){ setForm(p=>({...p,[k]:v})); }

  async function handleSubmit(e: React.FormEvent){
    e.preventDefault();
    if(!form.name||!form.email||!form.password||!form.company){ setError('Full name, email, password, and company name are required.'); return; }
    if(form.password.length < 8){ setError('Password must be at least 8 characters.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Signup failed. Please try again.'); setLoading(false); return; }
      /* STRAIGHT INTO THE WORKSPACE. The dashboard carries the guided journey,
         so the first screen after a signup form is the product itself. */
      if (data.confirmed || data.demo) { window.location.href = '/app'; return; }
      setSuccess(true);
    } catch {
      setError('Signup failed. Please check your connection and try again.');
    }
    setLoading(false);
  }

  if(success) return (
    <div className="suDone">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="suDoneWrap">
        <div className="suDoneIcon"><Check size={32} weight="bold" /></div>
        <h1>Check Your Email</h1>
        <p>We sent a confirmation link to <b>{form.email}</b>.<br/>Click it to activate your account — then log in at <b>saguarocontrol.net/login</b>.</p>
        <Card title="What Happens Next">
          <div className="suDoneList">
            {['Click the link in your email to confirm.', 'Log in at saguarocontrol.net — no download needed.', 'Complete your 5-minute company setup.', 'Invite your team — unlimited users, always free.'].map((t,i)=>(
              <div key={i}><CheckCircle size={15} weight="fill" />{t}</div>
            ))}
          </div>
          <Button variant="primary" href="/login" className="suSubmit">Go to Login →</Button>
        </Card>
        <p style={{ fontSize: 'var(--fs-xs)', marginTop: 16, marginBottom: 0 }}>Didn't get it? Check spam or <button type="button" className="suLink" onClick={()=>setSuccess(false)}>try again</button>.</p>
      </div>
    </div>
  );

  return (
    <div className="suPage">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* One professional nav across every marketing page (fixed, 58px). */}
      <MarketingNav />
      <div style={{ height: 58 }} />

      <div className="suGrid">
        {/* ── LEFT: How it works ── */}
        <div className="suLeft">
          <div className="suTrial"><Badge tone="ongoing" dot>{TRIAL_DAYS}-Day Free Trial — No Credit Card</Badge></div>
          <h1 className="suH1">The <b>Fastest Way</b> to Run Your Construction Company</h1>
          <p className="suLead">Saguaro is a <b>web-based platform</b> — nothing to download or install on a computer. Sign up, log in from any browser, and your whole team is running in minutes.</p>

          <div className="suSteps">
            {HOW_IT_WORKS.map((s,i)=>(
              <div key={i} className="suStep">
                <div className="suStepIcon"><s.icon size={20} /></div>
                <div>
                  <div className="suStepTitle"><span className="suStepNum">Step {i + 1}</span>{s.title}</div>
                  <div className="suStepDesc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="suTrust">
            {['No credit card required','Cancel anytime','Unlimited users included','Free migration from Procore'].map(t=>(
              <span key={t}><CheckCircle size={13} weight="fill" />{t}</span>
            ))}
          </div>

          <div className="suQuote">
            <Card>
              <p>"We compared Saguaro to Procore and Buildertrend. Saguaro has everything we need at a fraction of the cost — and the AI features actually work."</p>
              <b>David K. <span>— Owner, Mid-Size GC, Denver CO</span></b>
            </Card>
          </div>
        </div>

        {/* ── RIGHT: Signup form ── */}
        <div className="suRight">
          <div className="suHead">
            <h2>Start Your Free Trial</h2>
            <p>Takes 30 seconds. No credit card required.</p>
          </div>

          <Card>
            {error && <div className="suMsg" role="alert"><Warning size={15} weight="fill" /><span>{error}</span></div>}

            <form onSubmit={handleSubmit}>
              <FormGrid cols={2}>
                <Field label="Your Full Name" required span>
                  <Input placeholder="John Smith" value={form.name} onChange={e=>update('name',e.target.value)} required autoComplete="name" />
                </Field>
                <Field label="Work Email" required>
                  <Input type="email" placeholder="you@company.com" value={form.email} onChange={e=>update('email',e.target.value)} required autoComplete="email" />
                </Field>
                <Field label="Password" required hint="At least 8 characters.">
                  <Input type="password" placeholder="8+ characters" value={form.password} onChange={e=>update('password',e.target.value)} required autoComplete="new-password" />
                </Field>
                <Field label="Company Name" required span>
                  <Input placeholder="Acme Construction LLC" value={form.company} onChange={e=>update('company',e.target.value)} required autoComplete="organization" />
                </Field>
                <Field label="Phone">
                  <Input type="tel" placeholder="(480) 555-0100" value={form.phone} onChange={e=>update('phone',e.target.value)} autoComplete="tel" />
                </Field>
                <Field label="State">
                  <Select aria-label="State" value={form.state} onChange={e=>update('state',e.target.value)} options={US_STATES} />
                </Field>
                <Field label="Company Type">
                  {/* Native select — the trade list is grouped by CSI division, which the kit Select does not render. */}
                  <select className="k-select" aria-label="Company type" value={form.role} onChange={e=>update('role',e.target.value)}>
                    {form.role&&!['General Contractor','Developer / Owner','Specialty Contractor','Other'].includes(form.role)&&!SUB_TRADES.includes(form.role)&&<option value={form.role}>{form.role}</option>}
                    <optgroup label="Company Type">
                      {['General Contractor','Developer / Owner','Specialty Contractor','Other'].map(r=><option key={r} value={r}>{r}</option>)}
                    </optgroup>
                    {SUB_TRADES_BY_DIVISION.map(g=>(
                      <optgroup key={g.division} label={g.division+' — '+g.name}>
                        {g.trades.map(t=><option key={t} value={t}>{t}</option>)}
                      </optgroup>
                    ))}
                    <optgroup label="Other / Specialty">
                      {SUB_TRADES.filter(t=>!SUB_TRADES_BY_DIVISION.some(g=>g.trades.includes(t))).map(t=><option key={t} value={t}>{t}</option>)}
                    </optgroup>
                  </select>
                </Field>
                <Field label="Team Size">
                  <Select aria-label="Team size" value={form.size} onChange={e=>update('size',e.target.value)} options={['1-10','11-25','26-50','51-100','100+']} />
                </Field>
              </FormGrid>

              <Button type="submit" variant="primary" className="suSubmit" disabled={loading}>{loading ? 'Creating your account…' : 'Start Free Trial →'}</Button>
            </form>

            <div className="suNext">
              <FlowSteps title="After You Sign Up" steps={[
                { title: 'Confirm your email', desc: "You're in instantly." },
                { title: 'Log in at saguarocontrol.net', desc: 'Works in any browser.' },
                { title: 'Optional: the iOS field app', desc: 'Free on TestFlight.' },
              ]} />
            </div>

            <div className="suFoot">Already have an account? <Link href="/login">Log In →</Link></div>
            <div className="suLegal">By signing up you agree to our <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
