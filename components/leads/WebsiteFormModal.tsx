'use client';
/**
 * Leads → Website Form: the link and the paste-in HTML for the company's
 * public "request a quote" form (lib/lead-intake). Submissions arrive as New
 * leads (source Website) and notify the team.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { FormModal, Button } from '@/components/ui/kit';
import { Copy, ArrowSquareOut, ArrowClockwise, Globe } from '@phosphor-icons/react';
import { confirmDialog } from '@/lib/ui/async-dialog';

type FormKey = { key: string | null; url: string | null; embedHtml: string | null; company: string };

export default function WebsiteFormModal({ open, onClose, onToast }: { open: boolean; onClose: () => void; onToast: (m: string, tone?: 'success' | 'error') => void }) {
  const [data, setData] = useState<FormKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/leads/form-key');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not load the website form.');
      setData(j);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the website form.'); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  async function make(rotate: boolean) {
    if (rotate && !(await confirmDialog({ title: 'Replace the link?', message: 'The current link and any form pasted into your website stop working. You will need to update your website with the new one.', danger: true }))) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/leads/form-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rotate }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not set up the website form.');
      setData(j);
      onToast(rotate ? 'New link made — the old one no longer works.' : 'Your website form is live.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not set up the website form.'); }
    finally { setBusy(false); }
  }

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); onToast(`${what} copied.`); }
    catch { onToast(`Could not copy — select the ${what.toLowerCase()} and copy it.`, 'error'); }
  };

  return (
    <FormModal open={open} onClose={() => { if (!busy) onClose(); }} title="Website Form"
      subtitle="People ask for a quote on your website; each request lands here as a New lead and your team is notified."
      busy={busy}
      footer={<>
        {error && <span className="k-error" role="alert" style={{ marginRight: 'auto', alignSelf: 'center' }}>{error}</span>}
        {data?.key && <Button variant="ghost" icon={<ArrowClockwise size={15} />} onClick={() => make(true)} disabled={busy}>Replace Link</Button>}
        <Button variant="primary" onClick={onClose} disabled={busy}>Done</Button>
      </>}>
      {!data ? <div className="k-hint" style={{ padding: 12 }}>{error ? '' : 'Loading…'}</div> : !data.key ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <p style={{ margin: 0, lineHeight: 1.55 }}>Turn it on to get a link you can put behind a &ldquo;Get a quote&rdquo; button, and a form you can paste into your website.</p>
          <Button variant="primary" icon={<Globe size={15} weight="bold" />} onClick={() => make(false)} disabled={busy}>{busy ? 'Setting up…' : 'Turn On Website Form'}</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div className="k-label">Link to your form</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
              <code style={{ flex: '1 1 260px', minWidth: 0, overflowWrap: 'anywhere', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-solid-2)', border: '1px solid var(--sg-border)', fontSize: 14 }}>{data.url}</code>
              <Button icon={<Copy size={15} />} onClick={() => copy(data.url!, 'Link')}>Copy</Button>
              <Button icon={<ArrowSquareOut size={15} />} onClick={() => window.open(data.url!, '_blank', 'noopener')}>Open</Button>
            </div>
          </div>
          <div>
            <div className="k-label">Or paste this into your website</div>
            <textarea readOnly value={data.embedHtml || ''} rows={7} aria-label="Form HTML" onFocus={(e) => e.currentTarget.select()}
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 10, borderRadius: 8, background: 'var(--bg-solid-2)', border: '1px solid var(--sg-border)', color: 'var(--text-primary)', fontFamily: 'ui-monospace, monospace', fontSize: 13 }} />
            <div style={{ marginTop: 8 }}><Button icon={<Copy size={15} />} onClick={() => copy(data.embedHtml || '', 'Form HTML')}>Copy HTML</Button></div>
          </div>
        </div>
      )}
    </FormModal>
  );
}
