'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';

/**
 * Saguaro Radio — guest page (public, token-gated, no auth, no app shell).
 *
 * Outsiders (inspectors, vendors, owner reps) open /portals/radio/<token>
 * from a link a staff member created. The page polls the guest feed,
 * plays voice traffic, shows transcripts/translations, and — when the
 * link allows talking — offers text send plus hold-to-talk voice.
 */

/* ── Design tokens (gold-on-black, matches the portal family) ── */
const GOLD = 'var(--brand-primary)', DARK = 'var(--bg-base)', RAISED = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.12)', DIM = 'var(--text-secondary)', TEXT = '#FFFFFF';
const GREEN = '#4ADE80', RED = '#F87171', AMBER = '#FBBF24';

const card = (extra?: React.CSSProperties): React.CSSProperties => ({ background: RAISED, backgroundImage: 'linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, boxShadow: '0 4px 14px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)', ...extra });
const btnS = (color: string): React.CSSProperties => ({ background: color, backgroundImage: color === GOLD ? 'var(--brand-primary)' : 'linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0) 55%)', color: color === GOLD ? '#101722' : '#fff', border: 'none', borderRadius: 9, padding: '11px 20px', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: color === GOLD ? '0 4px 14px color-mix(in srgb, var(--brand-primary) 28%, transparent), inset 0 1px 0 rgba(255,255,255,0.35)' : '0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.12)' });
const inputS: React.CSSProperties = { width: '100%', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '10px 14px', color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' };

/* Pseudo-waveform for voice rows: deterministic bars seeded by message id. */
function RadioWave({ seed, color }: { seed: string; color: string }) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const bars = Array.from({ length: 26 }, () => { h = (Math.imul(h, 1103515245) + 12345) >>> 0; return 5 + (h % 15); });
  return (
    <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 2, height: 22, marginBottom: 4 }}>
      {bars.map((b, i) => <div key={i} style={{ width: 3, height: b, borderRadius: 2, background: color, opacity: 0.35 + (b - 5) / 28, flexShrink: 0 }} />)}
    </div>
  );
}

export default function RadioGuestPage() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [channel, setChannel] = useState<any>(null);
  const [label, setLabel] = useState('');
  const [canTalk, setCanTalk] = useState(false);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [lang, setLang] = useState<'en' | 'es'>('en');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [toast, setToast] = useState('');
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

  const recRef = useRef<MediaRecorder | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const idsRef = useRef<Set<string>>(new Set());
  const sentIdsRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);
  const deniedRef = useRef(false);
  const interactedRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const voiceSupported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  const showToast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); }, []);

  /* ── Tone beep: WebAudio, armed by the first user gesture (autoplay guard —
     browsers reject AudioContext playback before any interaction). ── */
  useEffect(() => {
    const arm = () => { interactedRef.current = true; };
    window.addEventListener('pointerdown', arm, { once: true });
    window.addEventListener('keydown', arm, { once: true });
    return () => { window.removeEventListener('pointerdown', arm); window.removeEventListener('keydown', arm); };
  }, []);
  const playToneBeep = useCallback((tone: string) => {
    if (!interactedRef.current || typeof window === 'undefined') return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = audioCtxRef.current || (audioCtxRef.current = new AC());
      if (ctx.state === 'suspended') void ctx.resume();
      const freqs = tone === 'negative' ? [330, 247] : tone === 'comein' ? [660, 880] : [880];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        const t0 = ctx.currentTime + i * 0.14;
        osc.type = 'sine'; osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + 0.14);
      });
    } catch { /* audio unavailable: the chip still renders */ }
  }, []);

  /* ── Feed: fetch immediately, poll every 4s. Signed audio URLs are kept
     from first sight per id so an <audio> element mid-playback never has
     its src swapped out under it by a re-signed URL. ── */
  useEffect(() => {
    if (!token) return;
    let stop = false;
    const load = async () => {
      if (stop || deniedRef.current) return;
      try {
        const res = await fetch(`/api/radio/guest?guestToken=${encodeURIComponent(token)}&after=`);
        if (stop) return;
        if (res.status === 401) { deniedRef.current = true; setDenied(true); setLoading(false); return; }
        if (!res.ok) return;
        const d = await res.json();
        if (stop || d.error) return;
        setChannel(d.channel || null);
        setLabel(d.label || '');
        setCanTalk(d.canTalk !== false);
        const incoming = (d.messages || []) as any[];
        // Unread-style flash: ids this session has never rendered (skip the first fill).
        const freshMsgs = primedRef.current ? incoming.filter((m: any) => m.id && !idsRef.current.has(m.id)) : [];
        const fresh = freshMsgs.map((m: any) => m.id);
        const freshTone = freshMsgs.find((m: any) => m.kind === 'tone');
        if (freshTone) playToneBeep(String(freshTone.body || ''));
        incoming.forEach((m: any) => { if (m.id) idsRef.current.add(m.id); });
        primedRef.current = true;
        if (fresh.length) {
          setFlashIds(prev => { const n = new Set(prev); fresh.forEach((id: string) => n.add(id)); return n; });
          setTimeout(() => setFlashIds(prev => { const n = new Set(prev); fresh.forEach((id: string) => n.delete(id)); return n; }), 2600);
        }
        setMsgs(prev => {
          const seen = new Map(prev.map((p: any) => [p.id, p]));
          const merged = incoming.map((m: any) => { const k: any = seen.get(m.id); return k && k.audio_url ? { ...m, audio_url: k.audio_url } : m; });
          // Keep our own just-sent messages that a racing poll snapshot missed.
          const known = new Set(merged.map((m: any) => m.id));
          const pendingOwn = prev.filter((p: any) => p.id && !known.has(p.id) && sentIdsRef.current.has(p.id));
          return [...merged, ...pendingOwn];
        });
        setLoading(false);
      } catch { /* transient network error: keep last-good feed, retry next tick */ }
    };
    load();
    const iv = setInterval(load, 4000);
    return () => { stop = true; clearInterval(iv); };
  }, [token]);

  useEffect(() => { if (channel?.name) document.title = `${channel.name} - Saguaro Radio`; }, [channel?.name]);
  useEffect(() => { const el = feedRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length]);

  /* ── Send text ── */
  const sendText = async () => {
    const body = text.trim();
    if (!body || sending || !token) return;
    setSending(true);
    try {
      const res = await fetch(`/api/radio/guest?guestToken=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
      const d = await res.json().catch(() => ({}));
      if (d.message) {
        if (d.message.id) { idsRef.current.add(d.message.id); sentIdsRef.current.add(d.message.id); }
        setMsgs(prev => [...prev, d.message]);
        setText('');
      } else showToast(d.error || 'Failed to send.');
    } catch { showToast('Network error.'); }
    setSending(false);
  };

  /* ── Hold-to-talk: negotiated MediaRecorder mime, extension to match ── */
  const startRec = async () => {
    if (recording || !canTalk || !voiceSupported || !token) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || '';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const started = Date.now();
      rec.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        recRef.current = null;
        const secs = Math.max(1, Math.round((Date.now() - started) / 1000));
        const type = rec.mimeType || mime || 'audio/webm';
        const ext = /mp4|aac/i.test(type) ? 'm4a' : /ogg/i.test(type) ? 'ogg' : /mpeg/i.test(type) ? 'mp3' : 'webm';
        const blob = new Blob(chunks, { type });
        if (blob.size < 200) return;
        const form = new FormData();
        form.append('file', new File([blob], `clip.${ext}`, { type }));
        form.append('durationSecs', String(secs));
        try {
          const res = await fetch(`/api/radio/guest?guestToken=${encodeURIComponent(token)}`, { method: 'POST', body: form });
          const d = await res.json().catch(() => ({}));
          if (d.message) {
            if (d.message.id) { idsRef.current.add(d.message.id); sentIdsRef.current.add(d.message.id); }
            setMsgs(prev => [...prev, d.message]);
          } else showToast(d.error || 'Voice message failed.');
        } catch { showToast('Network error.'); }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch { showToast('Microphone unavailable — check permissions.'); }
  };

  const stopRec = () => {
    setRecording(false);
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  };

  /* ── Expired / revoked: clean full-page state ── */
  if (denied) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.01em', marginBottom: 6 }}>Saguaro</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 22 }}>Radio</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>This Radio Link Is No Longer Active</div>
        <div style={{ fontSize: 14, color: DIM, marginTop: 10, lineHeight: 1.6 }}>The invitation has expired or was revoked by the project team. Ask your contact at the general contractor for a fresh link.</div>
      </div>
    </div>
  );

  /* ── Loading ── */
  if (loading) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'sgSpin 1s linear infinite', margin: '0 auto 16px' }} />
        <div style={{ color: DIM, fontSize: 14 }}>Tuning in…</div>
        <style>{`@keyframes sgSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  const guestSender = `${label || 'Guest'} (guest)`;

  return (
    <div style={{ minHeight: '100vh', background: DARK, fontFamily: 'system-ui,sans-serif', display: 'flex', flexDirection: 'column' }}>
      <style>{`@keyframes sgRadioFlash{0%{background:color-mix(in srgb, var(--brand-primary) 16%, transparent)}100%{background:transparent}}@keyframes sgRadioRing{0%{box-shadow:0 0 0 3px color-mix(in srgb, var(--brand-primary) 45%, transparent)}100%{box-shadow:0 0 0 0 transparent}}@keyframes sgLivePulse{0%{box-shadow:0 0 0 0 rgba(74,222,128,0.55)}70%{box-shadow:0 0 0 7px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}`}</style>

      {/* ── Branded header ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${BORDER}`, padding: '12px 16px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Saguaro</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: DIM }}>Radio</span>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel?.name || 'Project Channel'}</div>
            {label && <div style={{ fontSize: 12, color: DIM, marginTop: 1 }}>Guest access: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{label}</span></div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: GREEN + '14', border: `1px solid ${GREEN}44`, borderRadius: 20, padding: '5px 12px', flexShrink: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, animation: 'sgLivePulse 1.8s ease-out infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 800, color: GREEN }}>Live</span>
          </div>
        </div>
      </header>

      {/* ── Feed ── */}
      <main style={{ flex: 1, width: '100%', maxWidth: 760, margin: '0 auto', padding: 16, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...card(), flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: DIM }}>Live channel traffic updates every few seconds.</div>
            <div style={{ display: 'flex', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
              {(['en', 'es'] as const).map(l => (
                <button key={l} onClick={() => setLang(l)} style={{ padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, letterSpacing: .6, background: lang === l ? GOLD : 'transparent', color: lang === l ? '#101722' : DIM }}>{l.toUpperCase()}</button>
              ))}
            </div>
          </div>

          <div ref={feedRef} style={{ flex: 1, minHeight: 260, maxHeight: '58vh', overflowY: 'auto', padding: '4px 0', marginBottom: 12 }}>
            {msgs.length === 0 && <div style={{ color: DIM, fontSize: 13, textAlign: 'center', padding: 40 }}>No radio traffic yet.{canTalk ? ' Say something below.' : ''}</div>}
            {msgs.map((m: any) => {
              const mine = !!m.sender_name && m.sender_name === guestSender;
              const t = m.translations || {};
              const shown = t[lang] || m.body || m.transcript || '';
              if (m.kind === 'panic' || m.kind === 'alert') {
                const c = m.kind === 'panic' ? RED : AMBER;
                return (
                  <div key={m.id} style={{ padding: '10px 14px', background: c + '11', border: `1px solid ${c}55`, borderRadius: 8, marginBottom: 10, ...(flashIds.has(m.id) ? { animation: 'sgRadioRing 2.4s ease-out' } : {}) }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: c, marginBottom: 4 }}>{'\u26A0'} {m.kind === 'panic' ? 'Panic' : 'Alert'} &middot; {m.sender_name || 'Unknown'}{m.patched_from ? <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', background: `color-mix(in srgb, ${GOLD} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${GOLD} 27%, transparent)`, borderRadius: 10, padding: '1px 7px', letterSpacing: .5, verticalAlign: 'middle' }}>Via Patched Channel</span> : null}</div>
                    {shown && <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{shown}</div>}
                    <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>{new Date(m.created_at).toLocaleTimeString()}</div>
                  </div>
                );
              }
              if (m.kind === 'tone') {
                const tone = String(m.body || '');
                const tc = tone === 'negative' ? RED : tone === 'comein' ? AMBER : GREEN;
                const tl = tone === 'negative' ? 'Negative' : tone === 'comein' ? 'Come In' : 'Ack';
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 10, ...(flashIds.has(m.id) ? { animation: 'sgRadioFlash 2.4s ease-out', borderRadius: 10 } : {}) }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: tc + '14', border: `1px solid ${tc}55`, borderRadius: 20, flexWrap: 'wrap' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: tc, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: tc }}>{tl}</span>
                      <span style={{ fontSize: 12, color: DIM }}>{mine ? 'You' : (m.sender_name || 'Unknown')} &middot; {new Date(m.created_at).toLocaleTimeString()}</span>
                      {m.patched_from && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', background: `color-mix(in srgb, ${GOLD} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${GOLD} 27%, transparent)`, borderRadius: 10, padding: '1px 7px', letterSpacing: .5 }}>Via Patched Channel</span>}
                    </div>
                  </div>
                );
              }
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 10, ...(flashIds.has(m.id) ? { animation: 'sgRadioFlash 2.4s ease-out', borderRadius: 10 } : {}) }}>
                  <div style={{ maxWidth: '82%', padding: '10px 14px', borderRadius: 12, background: mine ? `color-mix(in srgb, ${GOLD} 10%, transparent)` : DARK, border: `1px solid ${mine ? `color-mix(in srgb, ${GOLD} 27%, transparent)` : BORDER}`, borderBottomRightRadius: mine ? 2 : 12, borderBottomLeftRadius: mine ? 12 : 2 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: mine ? 'var(--text-primary)' : DIM, marginBottom: 4 }}>{mine ? 'You' : (m.sender_name || 'Unknown')}{m.patched_from ? <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', background: `color-mix(in srgb, ${GOLD} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${GOLD} 27%, transparent)`, borderRadius: 10, padding: '1px 7px', letterSpacing: .5, verticalAlign: 'middle' }}>Via Patched Channel</span> : null}</div>
                    {m.kind === 'voice' ? (
                      <div>
                        <RadioWave seed={String(m.id || '')} color={mine ? GOLD : DIM} />
                        {m.audio_url ? <audio controls preload="none" src={m.audio_url} style={{ width: 230, maxWidth: '100%', height: 36, display: 'block' }} /> : <div style={{ fontSize: 12, color: DIM }}>Voice message</div>}
                        <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>{m.audio_duration_secs ? `${m.audio_duration_secs}s voice` : 'voice'}</div>
                        {(t[lang] || m.transcript) && (
                          <div style={{ fontSize: 12, color: DIM, marginTop: 6, lineHeight: 1.5, fontStyle: t[lang] ? 'normal' : 'italic', borderLeft: `2px solid ${BORDER}`, paddingLeft: 8 }}>
                            {t[lang] && <span style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 12, letterSpacing: .8, marginRight: 6 }}>{lang.toUpperCase()}</span>}
                            &ldquo;{t[lang] || m.transcript}&rdquo;
                          </div>
                        )}
                      </div>
                    ) : m.kind === 'image' ? (
                      <div>
                        {m.image_url && <a href={m.image_url} target="_blank" rel="noreferrer"><img src={m.image_url} alt="radio attachment" style={{ maxWidth: 220, width: '100%', borderRadius: 8, display: 'block' }} /></a>}
                        {shown && <div style={{ fontSize: 13, color: TEXT, marginTop: 6, lineHeight: 1.5 }}>{shown}</div>}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{shown}</div>
                    )}
                    <div style={{ fontSize: 12, color: DIM, marginTop: 4, textAlign: mine ? 'right' : 'left' }}>{new Date(m.created_at).toLocaleTimeString()}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Composer / listen-only note ── */}
          {canTalk ? (
            <div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }} placeholder="Message the channel…" style={{ ...inputS, flex: 1 }} />
                <button onClick={sendText} disabled={sending} style={btnS(GOLD)}>{sending ? '…' : 'Send'}</button>
              </div>
              {voiceSupported && (
                <button
                  onMouseDown={startRec} onMouseUp={stopRec} onMouseLeave={stopRec}
                  onTouchStart={e => { e.preventDefault(); startRec(); }} onTouchEnd={e => { e.preventDefault(); stopRec(); }} onContextMenu={e => e.preventDefault()}
                  style={{ ...btnS(recording ? RED : GOLD), width: '100%', marginTop: 12, userSelect: 'none', touchAction: 'none' }}>
                  {recording ? '● Recording — Release to Send' : '≋ Hold to Talk'}
                </button>
              )}
            </div>
          ) : (
            <div style={{ padding: '10px 14px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 9, color: DIM, fontSize: 12, textAlign: 'center' }}>
              Listen-only access &mdash; you can follow the channel but cannot transmit.
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={{ textAlign: 'center', padding: '10px 16px 18px' }}>
        <div style={{ fontSize: 12, color: DIM }}>Powered by <strong style={{ color: 'var(--text-primary)' }}>Saguaro Control Systems</strong></div>
      </footer>

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: RAISED, border: `1px solid color-mix(in srgb, ${GOLD} 33%, transparent)`, color: TEXT, padding: '10px 20px', borderRadius: 9, fontSize: 13, fontWeight: 600, zIndex: 100, boxShadow: '0 6px 20px rgba(0,0,0,0.5)', maxWidth: '90vw' }}>{toast}</div>
      )}
    </div>
  );
}
