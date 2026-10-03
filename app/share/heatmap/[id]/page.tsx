'use client';
/**
 * Public, read-only coverage design — what a GC / owner sees from a share link.
 * No auth, no editing; token-gated by the /api/heatmap/share/[id] route.
 */
import { useEffect, useMemo, useState } from 'react';
import { humanError } from '@/lib/errors';
import { useParams, useSearchParams } from 'next/navigation';
import type { HeatmapProject } from '@/lib/heatmap/types';
import { computeCoverage } from '@/lib/heatmap/engine';
import { computeBom } from '@/lib/heatmap/bom';
import { planSchedule } from '@/lib/heatmap/network';
import { DEVICE_REGISTRY } from '@/lib/heatmap/models';
import { calibrateModel } from '@/lib/heatmap/calibrate';
import { calibrationNote, engineStamp } from '@/lib/heatmap/meta';

const GOLD = 'var(--brand-primary)';
const NAVY = '#0A0A00'; // text on gold fills

type ProjSnap = HeatmapProject & { snapshot?: string };
type MultiData = { multifloor: true; floors: { id: string; name: string; proj: ProjSnap | null }[]; activeFloor?: string };
type Design = { id: string; name: string; data: ProjSnap | MultiData; updated_at?: string };

/** A shared design is either a single project (legacy) or a multi-floor building.
 *  Return every floor that actually has a plan so we never silently drop floors. */
function extractFloors(data: Design['data'] | null): { name: string; proj: ProjSnap }[] {
  const md = data as MultiData | null;
  if (md && md.multifloor && Array.isArray(md.floors)) {
    return md.floors
      .filter((f) => f.proj && Array.isArray(f.proj.devices))
      .map((f) => ({ name: f.name || 'Floor', proj: f.proj as ProjSnap }));
  }
  const single = data as ProjSnap | null;
  if (single && Array.isArray(single.devices)) return [{ name: single.name || 'Design', proj: single }];
  return [];
}

export default function SharedHeatmap() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const [design, setDesign] = useState<Design | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [floorIdx, setFloorIdx] = useState(0);
  // ── Approve → auto-creates the install bid for the team (the design-to-money loop) ──
  const [approverName, setApproverName] = useState('');
  const [approverEmail, setApproverEmail] = useState('');
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [approveErr, setApproveErr] = useState('');
  const doApprove = async () => {
    const id = params?.id, t = sp.get('t'), e = sp.get('e');
    if (!id || !t || !e) return;
    if (!approverName.trim()) { setApproveErr('Please type your name to approve.'); return; }
    setApproving(true); setApproveErr('');
    try {
      const r = await fetch('/api/heatmap/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, t, e, approverName: approverName.trim(), approverEmail: approverEmail.trim() || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) setApproveErr(d.error || 'Could not submit your approval. Please try again.');
      else setApproved(true);
    } catch { setApproveErr('Network error — please try again.'); }
    finally { setApproving(false); }
  };

  useEffect(() => {
    const id = params?.id, t = sp.get('t'), e = sp.get('e');
    if (!id || !t || !e) { setErr('This share link is incomplete.'); setLoading(false); return; }
    fetch(`/api/heatmap/share/${id}?t=${encodeURIComponent(t)}&e=${encodeURIComponent(e)}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else setDesign(d.design); })
      .catch((e) => { console.error(e); setErr(humanError(e, "Couldn't load this shared design. The link may have expired.")); })
      .finally(() => setLoading(false));
  }, [params?.id, sp]);

  const floors = useMemo(() => extractFloors(design?.data ?? null), [design]);
  const project = floors.length ? floors[Math.min(floorIdx, floors.length - 1)].proj : null;
  const cov = useMemo(() => { try { return project ? computeCoverage(project) : null; } catch { return null; } }, [project]);
  const bom = useMemo(() => (project ? computeBom(project.devices) : null), [project]);
  const sched = useMemo(() => (project ? planSchedule(project.devices) : null), [project]);
  // Recompute the survey calibration from the persisted readings so the client sees the same validated accuracy.
  const cal = useMemo(() => {
    if (!project || !project.scale || !project.measured || !project.measured.length) return null;
    try { return calibrateModel(project, project.measured); } catch { return null; }
  }, [project]);
  const s = cov?.stats;

  if (loading) return <Shell><p style={{ color: '#8b949e' }}>Loading design…</p></Shell>;
  if (err || !project) return <Shell><h2 style={{ margin: '0 0 6px' }}>Can&apos;t Open This Design</h2><p style={{ color: '#8b949e' }}>{err || 'Not found.'}</p></Shell>;

  const img = project.snapshot || project.planDataUrl;
  return (
    <Shell>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', color: '#8b949e', fontSize: 13, margin: '2px 0 16px' }}>
        <span>Project: <b style={{ color: '#e6edf3' }}>{design?.name || project.name}</b></span>
        <span>Layer: <b style={{ color: '#e6edf3' }}>{DEVICE_REGISTRY[project.activeType]?.label || project.activeType}</b></span>
        <span>Environment: <b style={{ color: '#e6edf3' }}>{project.env}</b></span>
      </div>

      {floors.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 14px' }}>
          {floors.map((f, i) => (
            <button key={i} onClick={() => setFloorIdx(i)} style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${i === floorIdx ? GOLD : '#30363d'}`,
              background: i === floorIdx ? GOLD : 'transparent', color: i === floorIdx ? NAVY : '#e6edf3',
            }}>{f.name}</button>
          ))}
        </div>
      )}

      {img && <img src={img} alt="Coverage plan" style={{ width: '100%', border: '1px solid #30363d', borderRadius: 10 }} />}

      <H>Coverage Metrics</H>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Card k="Coverage" v={s ? `${s.pctCovered.toFixed(0)}%` : '—'} />
        <Card k="Health" v={s ? `${s.healthScore}` : '—'} />
        <Card k="Devices" v={`${project.devices.length}`} />
        <Card k="Dead Zones" v={s ? `${s.deadZones}` : '0'} />
        <Card k="Dead Area" v={s ? `${Math.round(s.deadArea)} ft²` : '0 ft²'} />
      </div>
      <div style={{ color: '#8b949e', fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>Coverage % is a predictive RF model{cal && cal.sampleCount > 0 ? ` — validated ±${cal.rmseAfter.toFixed(1)} dB against ${cal.sampleCount} survey point${cal.sampleCount === 1 ? '' : 's'}` : ''} — confirm with an on-site walk-test.</div>

      {bom && bom.rows.length > 0 && <>
        <H>Bill of Materials</H>
        <table style={tbl}>
          <thead><tr><Th>Item</Th><Th align="center">Qty</Th><Th align="right">Unit</Th><Th align="right">Ext</Th></tr></thead>
          <tbody>{bom.rows.map((r, i) => (
            <tr key={i}><Td>{r.item}</Td><Td align="center">{r.qty}</Td><Td align="right">{r.unit ? `$${r.unit.toLocaleString()}` : '—'}</Td><Td align="right">{r.ext ? `$${r.ext.toLocaleString()}` : '—'}</Td></tr>
          ))}</tbody>
          <tfoot>
            <tr><Td bold>Total (Hardware, Est.)</Td><Td /><Td /><Td align="right" bold>${bom.total.toLocaleString()}</Td></tr>
            <tr><Td bold>Turnkey Install (Hardware + Labor + O&amp;P)</Td><Td /><Td /><Td align="right" bold>${bom.turnkey.toLocaleString()}</Td></tr>
          </tfoot>
        </table>
      </>}

      {sched && sched.rows.length > 0 && <>
        <H>Network Schedule — IP · VLAN · Switch Port</H>
        <div style={{ color: '#8b949e', fontSize: 12, margin: '0 0 8px' }}>{sched.vlans.map((v) => `${v.name} — VLAN ${v.id} (${v.subnet}.0/24)`).join('  ·  ')}</div>
        <table style={tbl}>
          <thead><tr><Th>Device</Th><Th>VLAN</Th><Th>IP Address</Th><Th>Switch Port</Th><Th align="right">PoE</Th></tr></thead>
          <tbody>{sched.rows.map((r) => (
            <tr key={r.id}><Td>{r.label}</Td><Td>{r.vlan.id} · {r.vlan.name}</Td><Td>{r.ip}</Td><Td>{r.port}</Td><Td align="right">{r.poeW ? `${r.poeW} W` : '—'}</Td></tr>
          ))}</tbody>
          <tfoot><tr><Td bold>{sched.poePorts} PoE ports</Td><Td /><Td /><Td /><Td align="right" bold>{sched.poeTotal} W</Td></tr></tfoot>
        </table>
      </>}

      {/* ── Approve → auto-creates the install bid for the team (design-to-money loop) ── */}
      <div style={{ marginTop: 30, border: `1px solid ${GOLD}`, borderRadius: 12, padding: 18, background: 'color-mix(in srgb, var(--brand-primary) 6%, transparent)' }}>
        {approved ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>Design approved — thank you, {approverName}.</div>
            <div style={{ color: '#8b949e', fontSize: 13, marginTop: 6 }}>The team has been notified and will follow up with your install quote.</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Approve This Design</div>
            <div style={{ color: '#8b949e', fontSize: 13, margin: '4px 0 12px' }}>Type your name to approve the coverage design and request an install quote{bom ? ` — turnkey ~$${bom.turnkey.toLocaleString()}` : ''}.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <input value={approverName} onChange={(ev) => setApproverName(ev.target.value)} placeholder="Your full name" style={inputStyle} />
              <input value={approverEmail} onChange={(ev) => setApproverEmail(ev.target.value)} placeholder="Email (optional)" style={inputStyle} />
            </div>
            {approveErr && <div style={{ color: '#ff7b72', fontSize: 12.5, marginTop: 8 }}>{approveErr}</div>}
            <button onClick={doApprove} disabled={approving || !approverName.trim()} style={{ marginTop: 12, width: '100%', padding: 12, borderRadius: 10, border: 'none', background: GOLD, color: NAVY, fontWeight: 800, fontSize: 14, cursor: approving ? 'default' : 'pointer', opacity: approving || !approverName.trim() ? 0.6 : 1 }}>{approving ? 'Submitting…' : 'Approve & Request Install Quote'}</button>
          </>
        )}
      </div>

      <p style={{ color: '#6e7681', fontSize: 11, marginTop: 24, borderTop: '1px solid #21262d', paddingTop: 12 }}>
        {calibrationNote(cal)} Camera ranges per EN 62676-4 DORI. Prices are estimates. Read-only shared view.
      </p>
      <p style={{ color: '#484f58', fontSize: 10, marginTop: 6, fontFamily: 'ui-monospace,Consolas,monospace' }}>{engineStamp(project)}</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: '#e6edf3', fontFamily: 'system-ui,Segoe UI,sans-serif' }}>
      <div style={{ background: 'linear-gradient(100deg, var(--bg-base), #161b22)', padding: '18px 26px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" style={{ stroke: GOLD }} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M12 9c0-2 -1.6-3.5 -3.5-3.5S5 7 5 9v3c0 1.4 1.1 2.5 2.5 2.5S10 13.4 10 12M12 12c0-2 1.6-3.5 3.5-3.5S19 10 19 12v2c0 1.4-1.1 2.5-2.5 2.5S14 15.4 14 14" /></svg>
        <div>
          <div style={{ color: GOLD, fontSize: 11, fontWeight: 700 }}>Saguaro Control Systems</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Coverage Design</div>
        </div>
      </div>
      <div style={{ maxWidth: 940, margin: '0 auto', padding: '22px 20px 60px' }}>{children}</div>
    </div>
  );
}

const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 2 };
const inputStyle: React.CSSProperties = { flex: 1, minWidth: 160, padding: '10px 12px', borderRadius: 8, border: '1px solid #30363d', background: '#0a0a0a', color: '#e6edf3', fontSize: 14, outline: 'none' };
function H({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 12, color: '#e6edf3', borderBottom: `2px solid ${GOLD}`, paddingBottom: 5, display: 'inline-block', margin: '26px 0 10px' }}>{children}</h2>;
}
function Card({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ flex: 1, minWidth: 120, border: '1px solid #21262d', borderRadius: 8, padding: '11px 13px', background: '#0a0a0a' }}>
      <div style={{ fontSize: 10.5, color: '#8b949e' }}>{k}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 3 }}>{v}</div>
    </div>
  );
}
function Th({ children, align }: { children?: React.ReactNode; align?: 'center' | 'right' }) {
  return <th style={{ textAlign: align || 'left', background: '#0a0a0a', color: '#8b949e', fontSize: 11, padding: '7px 9px', borderBottom: '1px solid #21262d' }}>{children}</th>;
}
function Td({ children, align, bold }: { children?: React.ReactNode; align?: 'center' | 'right'; bold?: boolean }) {
  return <td style={{ textAlign: align || 'left', padding: '7px 9px', borderBottom: '1px solid #161b22', fontWeight: bold ? 800 : 400, fontVariantNumeric: 'tabular-nums' }}>{children}</td>;
}
