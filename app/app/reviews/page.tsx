'use client';
/*
 * app/app/reviews — customer reviews / reputation. The one sales feature the
 * competitor audit found fully missing. Lists the tenant's reviews with the
 * running average and a star composer to capture a new one. Reads/writes
 * /api/reviews (tenant-scoped; writes need Sales:Edit).
 */
import React from 'react';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/errors';
import { fmtDate as fmtDateSafe } from '@/lib/format-date';

const BG = 'var(--bg-base)', RAISED = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.12)';
const TEXT = '#FFFFFF', DIM = '#D4D4D8', GOLD = 'var(--brand-primary)', GREEN = '#2CFF7A';

type Review = {
  id: string; reviewer_name: string | null; rating: number; body: string | null;
  source: string | null; created_at: string;
};

const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18, marginBottom: 14 };
const Stars = ({ n, size = 16 }: { n: number; size?: number }) => (
  <span style={{ color: GOLD, fontSize: size, letterSpacing: 1 }} aria-label={`${n} of 5`}>
    {'★★★★★'.slice(0, n)}<span style={{ color: BORDER }}>{'★★★★★'.slice(n)}</span>
  </span>
);

export default function ReviewsPage() {
  const { showToast } = useToast();
  const [reviews, setReviews] = React.useState<Review[]>([]);
  const [avg, setAvg] = React.useState<number | null>(null);
  const [state, setState] = React.useState<'loading' | 'ok' | 'error'>('loading');

  const [rating, setRating] = React.useState(5);
  const [name, setName] = React.useState('');
  const [text, setText] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const r = await fetch('/api/reviews');
      if (!r.ok) throw new Error('load');
      const d = await r.json();
      setReviews((d.reviews || []) as Review[]);
      setAvg(d.avgRating ?? null);
      setState('ok');
    } catch { setState('error'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const submit = React.useCallback(async () => {
    if (saving) return;
    if (!name.trim() && !text.trim()) { showToast('Add a name or a review.', 'error'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, reviewer_name: name.trim(), body: text.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not save the review');
      showToast('Review added.', 'success');
      setName(''); setText(''); setRating(5);
      void load();
    } catch (e) {
      showToast(humanError(e, 'Could not save the review.'), 'error');
    } finally { setSaving(false); }
  }, [saving, name, text, rating, showToast, load]);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto', color: TEXT }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Reviews</div>
          <div style={{ color: DIM, fontSize: 14, marginTop: 2 }}>What your customers say — reputation, in one place.</div>
        </div>
        {avg != null && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: GOLD }}>{avg.toFixed(1)}<span style={{ fontSize: 15, color: DIM }}> / 5</span></div>
            <div style={{ fontSize: 12, color: DIM }}>{reviews.length} review{reviews.length === 1 ? '' : 's'}</div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 700, color: DIM, letterSpacing: 0.3, marginBottom: 10 }}>Add a Review</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)} aria-label={`${n} star`} style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 24, color: n <= rating ? GOLD : BORDER,
            }}>★</button>
          ))}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer / reviewer name"
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 13px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', marginBottom: 8 }} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What did they say?" rows={3}
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 13px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={submit} disabled={saving} style={{ padding: '9px 18px', background: GOLD, color: '#000', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Add Review'}
          </button>
        </div>
      </div>

      {/* List */}
      {state === 'loading' ? (
        <div style={{ ...card, color: DIM }}>Loading reviews…</div>
      ) : state === 'error' ? (
        <div style={{ ...card, color: DIM }}>Couldn’t load reviews. <button onClick={load} style={{ color: GOLD, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button></div>
      ) : reviews.length === 0 ? (
        <div style={{ ...card, color: DIM }}>No reviews yet. Add the first one above — it’s what turns a happy job into the next referral.</div>
      ) : (
        reviews.map((r) => (
          <div key={r.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{r.reviewer_name || 'Anonymous'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Stars n={Math.max(0, Math.min(5, r.rating))} />
                <span style={{ fontSize: 11, color: DIM }}>{r.created_at ? fmtDateSafe(r.created_at) : ''}</span>
              </span>
            </div>
            {r.body && <div style={{ fontSize: 13, color: DIM, marginTop: 6, whiteSpace: 'pre-wrap' }}>{r.body}</div>}
            {r.source && r.source !== 'internal' && <div style={{ fontSize: 10, color: GREEN, marginTop: 6}}>{r.source.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</div>}
          </div>
        ))
      )}
    </div>
  );
}
