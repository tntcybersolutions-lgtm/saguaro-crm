'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';

const GOLD='#C8960F',DARK='#0d1117',RAISED='#161b22',BORDER='#30363d',DIM='#8B9DB8',TEXT='#F0F4FF';
const GREEN='#2ea043',PURPLE='#9F7AEA';

const SAFETY_TOPICS = [
  'Fall Protection — 100% Tie-Off Policy',
  'Struck-By Hazards — Working Around Equipment',
  'Heat Illness Prevention',
  'Electrical Safety — Lock Out Tag Out',
  'Scaffolding Safety — Erection and Use',
  'Personal Protective Equipment (PPE)',
  'Housekeeping — Keeping the Site Clean',
  'Ladder Safety',
  'Trenching and Excavation Safety',
  'Silica Dust — OSHA Regulations',
  'Chemical Hazards — SDS and Right to Know',
  'Eye and Face Protection',
  'Hand and Power Tool Safety',
  'Fire Prevention and Fire Extinguishers',
  'Emergency Action Plan — What to Do',
];

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: '#0d1117',
  border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
};

export default function ToolboxTalksPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [talks, setTalks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({
    topic: '', presenter: '', talk_date: new Date().toISOString().split('T')[0],
    duration_minutes: 15, content: '', attendee_count: 0, generate_ai: false,
  });

  async function load() {
    setLoading(true);
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/toolbox-talks/${projectId}`, { headers: h });
      const j = await r.json();
      setTalks(j.talks || []);
    } catch { setTalks([]); }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  async function saveTalk() {
    if (!form.topic || !form.talk_date) return;
    setGenerating(true);
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/toolbox-talks/${projectId}`, {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (j.talk) setTalks(prev => [j.talk, ...prev]);
      setShowAdd(false);
      setForm({
        topic: '', presenter: '', talk_date: new Date().toISOString().split('T')[0],
        duration_minutes: 15, content: '', attendee_count: 0, generate_ai: false,
      });
    } catch { /* ignore */ }
    setGenerating(false);
  }

  const totalAttendees = talks.reduce((s, t) => s + (t.attendee_count || 0), 0);
  const thisMonth = talks.filter(t => new Date(t.talk_date) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length;

  return (
    <div style={{ padding: '24px 32px', background: DARK, minHeight: '100vh', color: TEXT }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0 }}>Toolbox Talks</h1>
          <p style={{ color: DIM, fontSize: 14, margin: '4px 0 0' }}>
            {talks.length} talks · {totalAttendees} total attendees
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ background: GOLD, color: DARK, border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          + New Talk
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Talks', val: talks.length, color: TEXT },
          { label: 'This Month', val: thisMonth, color: GREEN },
          { label: 'Total Attendees', val: totalAttendees, color: GOLD },
        ].map(k => (
          <div key={k.label} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: DIM, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: DIM }}>Loading...</div>
      ) : talks.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🦺</div>
          <p style={{ color: DIM, marginBottom: 16 }}>No toolbox talks yet. Start your safety talk log.</p>
          <button onClick={() => setShowAdd(true)}
            style={{ background: GOLD, color: DARK, border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>
            + New Toolbox Talk
          </button>
        </div>
      ) : talks.map(talk => (
        <div key={talk.id} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
          <div onClick={() => setExpanded(expanded === talk.id ? null : talk.id)}
            style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🦺</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{talk.topic}</div>
              <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
                {new Date(talk.talk_date).toLocaleDateString()} · {talk.presenter || 'No presenter'} · {talk.attendee_count || 0} attendees · {talk.duration_minutes} min
              </div>
            </div>
            {talk.ai_generated_content && (
              <span style={{ fontSize: 10, color: PURPLE, background: 'rgba(159,122,234,.1)', padding: '3px 8px', borderRadius: 10, fontWeight: 700 }}>AI Generated</span>
            )}
            <span style={{ color: DIM }}>{expanded === talk.id ? '▲' : '▼'}</span>
          </div>
          {expanded === talk.id && (
            <div style={{ padding: '0 18px 16px', borderTop: `1px solid #21262d` }}>
              <div style={{ paddingTop: 14, fontSize: 14, color: TEXT, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {talk.ai_generated_content || talk.content || 'No content recorded.'}
              </div>
              {Array.isArray(talk.attendees) && talk.attendees.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6, textTransform: 'uppercase' }}>Attendees</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {talk.attendees.map((a: string, i: number) => (
                      <span key={i} style={{ fontSize: 12, background: '#21262d', padding: '3px 10px', borderRadius: 20, color: TEXT }}>{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, width: 540, maxHeight: '85vh', overflow: 'auto' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 20 }}>New Toolbox Talk</h3>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 6 }}>Quick Select Topic</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {SAFETY_TOPICS.slice(0, 8).map(t => (
                  <button key={t} type="button" onClick={() => setForm(f => ({ ...f, topic: t }))}
                    style={{ fontSize: 11, padding: '4px 10px', background: form.topic === t ? 'rgba(200,150,15,.2)' : '#0d1117', border: `1px solid ${form.topic === t ? GOLD : BORDER}`, borderRadius: 20, color: form.topic === t ? GOLD : DIM, cursor: 'pointer' }}>
                    {t}
                  </button>
                ))}
              </div>
              <input value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                placeholder="Or type a custom topic…" style={inp} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Date</label>
                <input type="date" value={form.talk_date} onChange={e => setForm(f => ({ ...f, talk_date: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Presenter</label>
                <input value={form.presenter} onChange={e => setForm(f => ({ ...f, presenter: e.target.value }))} placeholder="Superintendent name" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Duration (min)</label>
                <input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Attendee Count</label>
                <input type="number" value={form.attendee_count} onChange={e => setForm(f => ({ ...f, attendee_count: Number(e.target.value) }))} style={inp} />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14, padding: '10px 14px', background: form.generate_ai ? 'rgba(159,122,234,.1)' : '#0d1117', border: `1px solid ${form.generate_ai ? 'rgba(159,122,234,.4)' : BORDER}`, borderRadius: 8 }}>
              <input type="checkbox" checked={form.generate_ai} onChange={e => setForm(f => ({ ...f, generate_ai: e.target.checked }))} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: form.generate_ai ? PURPLE : TEXT }}>Generate with Sage AI</div>
                <div style={{ fontSize: 11, color: DIM }}>Auto-write a complete safety talk script for this topic</div>
              </div>
            </label>

            {!form.generate_ai && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Talk Notes / Content</label>
                <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={4} placeholder="Key points covered in the talk…" style={{ ...inp, resize: 'vertical' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)}
                style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: DIM, borderRadius: 7, padding: '8px 16px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveTalk} disabled={!form.topic || generating}
                style={{ background: form.topic && !generating ? GOLD : '#21262d', color: form.topic && !generating ? DARK : '#6e7681', border: 'none', borderRadius: 7, padding: '8px 20px', fontWeight: 700, cursor: form.topic && !generating ? 'pointer' : 'not-allowed' }}>
                {generating ? 'Generating…' : form.generate_ai ? 'Generate & Save' : 'Save Talk'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
