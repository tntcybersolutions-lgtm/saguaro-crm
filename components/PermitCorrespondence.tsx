'use client';
/**
 * PermitCorrespondence — the tracked back-and-forth with architects and city /
 * AHJ officials for a project's permits.
 *
 * Log what you sent or received, attach the drawings/documents, and the whole
 * exchange is stored and auditable in one place (permit_correspondence) instead
 * of living in people's inboxes. Attachments reuse the project file store via
 * FileDropzone, so big drawing sets upload straight to storage.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { SectionCard, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { FileDropzone } from '@/components/FileDropzone';
import { PaperPlaneTilt, DownloadSimple, Plus, Paperclip } from '@phosphor-icons/react';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Corr {
  id: string;
  direction: string;
  party: string | null;
  party_name: string | null;
  subject: string;
  notes: string | null;
  document_ids: string[] | null;
  status: string | null;
  created_at: string;
  created_by_name: string | null;
}

const GOLD = '#F59E0B';
const BORDER = 'rgba(255,255,255,0.1)';
const PARTIES = ['Architect', 'City / AHJ', 'Engineer', 'Owner', 'Other'];

export default function PermitCorrespondence({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Corr[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound');
  const [party, setParty] = useState('Architect');
  const [partyName, setPartyName] = useState('');
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [docIds, setDocIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/permits/correspondence`);
      const d = await r.json().catch(() => ({}));
      setItems(Array.isArray(d.correspondence) ? d.correspondence : []);
    } catch { setItems([]); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setSubject(''); setNotes(''); setPartyName(''); setDocIds([]); setDirection('outbound'); setParty('Architect'); };

  const submit = async () => {
    if (!subject.trim()) { setMsg('Add a subject first.'); setTimeout(() => setMsg(''), 3000); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/permits/correspondence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, party, partyName, subject, notes, documentIds: docIds }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Could not record it');
      setMsg('Logged.'); setOpen(false); reset(); load();
    } catch (e: any) { setMsg(e?.message || 'Failed'); }
    setSaving(false);
    setTimeout(() => setMsg(''), 3500);
  };

  return (
    <SectionCard
      title="Architect & City Correspondence"
      subtitle="Every document and message sent to or received from the architect and the AHJ — tracked here."
      icon={<PaperPlaneTilt size={17} weight="duotone" color={GOLD} />}
      action={
        <button onClick={() => setOpen((v) => !v)} className="pmBtn" style={open ? ghostButtonStyle : goldButtonStyle}>
          {open ? 'Cancel' : <><Plus size={15} weight="bold" /> Log correspondence</>}
        </button>
      }
      style={{ marginBottom: 24 }}
    >
      {msg && <div style={{ marginBottom: 12, fontSize: 13, color: GOLD }}>{msg}</div>}

      {open && (
        <div style={{ display: 'grid', gap: 12, marginBottom: 18, padding: 16, border: `1px solid ${BORDER}`, borderRadius: 12, background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <select value={direction} onChange={(e) => setDirection(e.target.value as any)} aria-label="Direction">
              <option value="outbound">Sent — to them</option>
              <option value="inbound">Received — from them</option>
            </select>
            <select value={party} onChange={(e) => setParty(e.target.value)} aria-label="Party">
              {PARTIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="Name / firm (optional)" />
          </div>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject — e.g. Revised structural set, RFI response" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={3} style={{ padding: '10px 12px', resize: 'vertical' }} />
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Attach documents / drawings</div>
            <FileDropzone
              projectId={projectId}
              category="permit-correspondence"
              entityType="permit_correspondence"
              compact
              onUploaded={(rows) => setDocIds((prev) => [...prev, ...rows.map((r: any) => r.id).filter(Boolean)])}
            />
            {docIds.length > 0 && <div style={{ fontSize: 12, color: GOLD, marginTop: 6 }}><Paperclip size={12} weight="bold" /> {docIds.length} file{docIds.length === 1 ? '' : 's'} attached</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={submit} disabled={saving} className="pmBtn" style={{ ...goldButtonStyle, opacity: saving ? 0.6 : 1, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving…' : 'Log it'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 24, color: 'var(--text-tertiary)', fontSize: 13 }}>No correspondence logged yet. Use “Log correspondence” to record what you send to and receive from the architect or the city.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((c) => {
            const inbound = c.direction === 'inbound';
            const tone = inbound ? '#34D399' : GOLD;
            const n = Array.isArray(c.document_ids) ? c.document_ids.length : 0;
            return (
              <div key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}` }}>
                <span title={inbound ? 'Received' : 'Sent'} style={{ flexShrink: 0, marginTop: 2, color: tone }}>
                  {inbound ? <DownloadSimple size={16} weight="bold" /> : <PaperPlaneTilt size={16} weight="bold" />}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{c.subject}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    <span style={{ color: tone, fontWeight: 700 }}>{inbound ? 'From' : 'To'} {c.party_name || c.party || 'AHJ'}</span>
                    {' · '}{new Date(c.created_at).toLocaleDateString()}
                    {n > 0 && <> · <Paperclip size={11} weight="bold" /> {n}</>}
                    {c.created_by_name && <> · {c.created_by_name}</>}
                  </div>
                  {c.notes && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>{c.notes}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
