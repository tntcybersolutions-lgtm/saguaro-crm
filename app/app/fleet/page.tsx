'use client';
/**
 * Fleet Management (web) — unified vehicles + equipment registry with maintenance,
 * documents, expiration warnings, and last-known location. VIN auto-decode (free
 * NHTSA). Math from the proven lib/fleet engine. RLS-scoped browser client.
 * À-la-carte: hidden from the sidebar unless the tenant has features.fleet.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { getSupabaseBrowser, ensureBrowserSession } from '@/lib/supabase-browser';
import { fleetSummary, assetHealth, expiryStatus, tripStats, STATUS_COLOR, type Asset, type MaintenanceRecord, type AssetDoc } from '@/lib/fleet';
import { Truck, Wrench, Plus, MagnifyingGlass, PencilSimple, Trash, X, Warning, MapPin, FileText, Barcode, ArrowSquareOut, CalendarBlank, FilePdf, Broadcast, Copy, Check, CurrencyDollar } from '@phosphor-icons/react';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/errors';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';

const GOLD = 'var(--brand-primary)', DARK = 'var(--bg-base)', RAISED = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.12)';
const DIM = 'var(--text-secondary)', TEXT = 'var(--text-primary)', GREEN = 'var(--success)', RED = 'var(--danger)', AMBER = 'var(--warning)';
/* eslint-disable @typescript-eslint/no-explicit-any */
const usd = (c: number) => '$' + Math.round((c || 0) / 100).toLocaleString();
const now = () => new Date().toISOString();
const fmt = (s: string | null) => s ? new Date(s + (s.length === 10 ? 'T12:00:00' : '')).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const EXPIRIES: [string, string][] = [['warranty_expires', 'Warranty'], ['registration_expires', 'Registration'], ['insurance_expires', 'Insurance'], ['contract_expires', 'Contract']];
const ago = (iso: string | null | undefined) => { if (!iso) return null; const ms = Date.now() - Date.parse(iso); if (!Number.isFinite(ms)) return null; const m = Math.max(0, Math.round(ms / 60000)); if (m < 60) return `${m}m ago`; const h = Math.round(m / 60); if (h < 24) return `${h}h ago`; const d = Math.round(h / 24); return d < 30 ? `${d}d ago` : `${Math.round(d / 30)}mo ago`; };
const STATUS_LABEL: Record<string, string> = { active: 'Active', in_shop: 'In Shop', retired: 'Retired', out_of_service: 'Out of Service' };

export default function FleetPage() {
  const { showToast } = useToast();
  const sb = getSupabaseBrowser();
  const [assets, setAssets] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [pings, setPings] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addingMaint, setAddingMaint] = useState(false);
  const [addingDoc, setAddingDoc] = useState(false);
  const [f, setF] = useState<any>({ type: 'vehicle' });
  const [m, setM] = useState<any>({ kind: 'service', performed_at: new Date().toISOString().slice(0, 10) });
  const [doc, setDoc] = useState<any>({ category: 'warranty' });
  const [vinBusy, setVinBusy] = useState(false);
  const [showIntegrate, setShowIntegrate] = useState(false);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [genBusy, setGenBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const ingestBase = typeof window !== 'undefined' ? `${window.location.origin}/api/fleet/ingest` : '/api/fleet/ingest';
  const loadIntegrations = useCallback(async () => { const { data } = await sb.from('fleet_integrations').select('*').order('created_at', { ascending: false }); setIntegrations(data ?? []); }, [sb]);
  const openIntegrate = () => { setShowIntegrate(true); loadIntegrations(); };
  const genToken = async (provider: string) => { setGenBusy(true); try { const { error } = await sb.rpc('fleet_generate_ingest_token', { p_provider: provider }); if (error) throw error; await loadIntegrations(); } catch (e: any) { console.error(e); showToast(humanError(e, 'Could not generate a token. Please try again.'), 'error'); } setGenBusy(false); };
  /* Every write below reads its { error }. supabase-js resolves rather than
     throwing, so the try/catch these sat in never fired: the dialog closed,
     the list reloaded, and the asset, the service record or the document was
     simply not there. Same failure the payroll screen had. */
  const toggleIntegration = async (id: string, active: boolean) => {
    const { error } = await sb.from('fleet_integrations').update({ active }).eq('id', id);
    if (error) { console.error(error); showToast(humanError(error, 'Could not change that integration.'), 'error'); return; }
    loadIntegrations();
  };
  const copyText = async (text: string, key: string) => { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600); } catch { /* */ } };

  const load = useCallback(async () => {
    await ensureBrowserSession();
    const [a, r, d] = await Promise.all([
      sb.from('fleet_assets').select('*').order('name'),
      sb.from('fleet_maintenance').select('*').order('performed_at', { ascending: false }),
      sb.from('fleet_documents').select('*'),
    ]);
    setAssets(a.data ?? []); setRecords(r.data ?? []); setDocs(d.data ?? []);
    // Fleet docs + asset photos are stored as PUBLIC urls on a PRIVATE bucket (they 400
    // on open). Batch-sign them so the links actually work.
    const urls = [...(d.data ?? []).map((x: any) => x.file_url), ...(a.data ?? []).map((x: any) => x.photo_url)].filter(Boolean);
    if (urls.length) {
      try { const res = await fetch('/api/files/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }) }); const j = await res.json(); if (j.signed) setSigned((prev) => ({ ...prev, ...j.signed })); } catch { /* leave unsigned */ }
    }
  }, [sb]);
  const sign = useCallback((u: string | null | undefined) => (u ? signed[u] || u : u), [signed]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (selId) sb.from('fleet_locations').select('*').eq('asset_id', selId).order('at', { ascending: false }).limit(50).then(({ data }) => setPings(data ?? [])); else setPings([]); }, [selId, sb]);

  const summary = useMemo(() => fleetSummary(assets as Asset[], records as MaintenanceRecord[], docs as AssetDoc[], now()), [assets, records, docs]);
  const filtered = useMemo(() => { const ql = q.trim().toLowerCase(); return assets.filter((a) => !ql || (`${a.name} ${a.make ?? ''} ${a.model ?? ''} ${a.license_plate ?? ''} ${a.vin ?? ''}`).toLowerCase().includes(ql)); }, [assets, q]);
  const sel = assets.find((a) => a.id === selId);
  const health = sel ? assetHealth(sel as Asset, records as MaintenanceRecord[], docs as AssetDoc[], now()) : null;
  const selRecords = records.filter((r) => r.asset_id === selId);
  const selDocs = docs.filter((d) => d.asset_id === selId);
  const trip = tripStats(pings.map((p) => ({ lat: p.lat, lng: p.lng, speed_mph: p.speed_mph, at: p.at })));

  const decodeVin = async () => { if (!f.vin || f.vin.length < 11) return; setVinBusy(true); try { const r = await fetch(`/api/fleet/vin?vin=${encodeURIComponent(f.vin)}`); const d = await r.json(); if (!d.error) setF((s: any) => ({ ...s, year: d.year ?? s.year, make: d.make ?? s.make, model: d.model ?? s.model, category: s.category || d.bodyClass, notes: [s.notes, d.engine ? `Engine: ${d.engine}` : null].filter(Boolean).join(' ') })); } catch { /* */ } setVinBusy(false); };
  const addAsset = async () => { if (!f.name?.trim() && !(f.make || f.model)) { if (f.make || f.model) f.name = `${f.year ?? ''} ${f.make ?? ''} ${f.model ?? ''}`.trim(); else return; } const { data, error } = await sb.from('fleet_assets').insert({ type: f.type, name: f.name || `${f.year ?? ''} ${f.make ?? ''} ${f.model ?? ''}`.trim(), category: f.category || null, make: f.make || null, model: f.model || null, year: parseInt(f.year) || null, vin: f.vin || null, serial_number: f.serial_number || null, license_plate: f.license_plate || null, odometer: parseFloat(f.odometer) || null, status: 'active', notes: f.notes || null }).select('id').maybeSingle(); if (error) { console.error(error); showToast(humanError(error, 'Could not add that asset.'), 'error'); return; } setAdding(false); setF({ type: 'vehicle' }); await load(); if (data?.id) setSelId(data.id); };
  const patch = async (payload: any) => {
    if (!selId) return;
    const { error } = await sb.from('fleet_assets').update(payload).eq('id', selId);
    if (error) { console.error(error); showToast(humanError(error, 'Could not save that change.'), 'error'); return; }
    load();
  };
  const saveEdit = async () => { await patch({ name: f.name, make: f.make || null, model: f.model || null, year: parseInt(f.year) || null, license_plate: f.license_plate || null, serial_number: f.serial_number || null, vin: f.vin || null, odometer: parseFloat(f.odometer) || null, status: f.status, category: f.category || null, warranty_expires: f.warranty_expires || null, registration_expires: f.registration_expires || null, insurance_expires: f.insurance_expires || null, contract_expires: f.contract_expires || null, notes: f.notes || null }); setEditing(false); };
  const addMaint = async () => {
    if (!selId) return;
    const { error } = await sb.from('fleet_maintenance').insert({ asset_id: selId, kind: m.kind, description: m.description || null, vendor: m.vendor || null, performed_at: m.performed_at ? new Date(m.performed_at).toISOString() : null, odometer_at: parseFloat(m.odometer_at) || null, cost_cents: Math.round((parseFloat(m.cost) || 0) * 100), next_due_odometer: parseFloat(m.next_due_odometer) || null, next_due_date: m.next_due_date || null });
    if (error) { console.error(error); showToast(humanError(error, 'Could not log that service record.'), 'error'); return; }
    setAddingMaint(false); setM({ kind: 'service', performed_at: new Date().toISOString().slice(0, 10) }); load();
  };
  const [docUploading, setDocUploading] = useState(false);
  const uploadDocFile = async (file: File) => {
    if (!selId || !file) return;
    setDocUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('projectId', selId);
      const r = await fetch('/api/files/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (d.error || !d.file?.url) throw new Error(d.error || 'upload failed');
      setDoc((prev: any) => ({ ...prev, file_url: d.file.url, file_name: file.name, label: prev.label || file.name, category: prev.category === 'warranty' && /\.(jpe?g|png|heic|webp)$/i.test(file.name) ? 'photo' : prev.category }));
    } catch (e: any) { console.error(e); showToast(humanError(e, 'Upload failed. Please try again.'), 'error'); }
    setDocUploading(false);
  };
  const addDocument = async () => {
    if (!selId) return;
    const { error } = await sb.from('fleet_documents').insert({ asset_id: selId, category: doc.category, label: doc.label || null, file_url: doc.file_url || null, file_name: doc.file_name || null, expires_at: doc.expires_at || null });
    if (error) { console.error(error); showToast(humanError(error, 'Could not attach that document.'), 'error'); return; }
    setAddingDoc(false); setDoc({ category: 'warranty' }); load();
  };
  const delAsset = async (id: string) => {
    const { error } = await sb.from('fleet_assets').delete().eq('id', id);
    if (error) { console.error(error); showToast(humanError(error, 'Could not delete that asset.'), 'error'); return; }
    if (selId === id) setSelId(null); load();
  };

  const exportReport = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const rows = assets.map((a) => { const h = assetHealth(a as Asset, records as MaintenanceRecord[], docs as AssetDoc[], now()); const col = (STATUS_COLOR as any)[h.overall]; const nextM = h.maintenance.status !== 'unknown' && h.maintenance.status !== 'ok' ? `${h.maintenance.label || 'service'} (${h.maintenance.remainingMiles != null ? (h.maintenance.remainingMiles < 0 ? Math.abs(h.maintenance.remainingMiles) + ' mi over' : h.maintenance.remainingMiles + ' mi') : ''}${h.maintenance.remainingDays != null ? ` ${h.maintenance.remainingDays}d` : ''})` : '—'; const exp = EXPIRIES.map(([c, l]) => { const e = expiryStatus(a[c], now()); return e.status === 'expired' ? `${l} expired` : e.status === 'soon' ? `${l} ${e.daysUntil}d` : null; }).filter(Boolean).join(', ') || '—'; return `<tr><td style="border:1px solid #ccc;padding:5px 8px"><b>${a.name}</b><div style="color:#666;font-size:10px">${[a.make, a.model, a.year].filter(Boolean).join(' ')}</div></td><td style="border:1px solid #ccc;padding:5px 8px">${a.type}</td><td style="border:1px solid #ccc;padding:5px 8px;text-align:right">${a.odometer ? Math.round(a.odometer).toLocaleString() : '—'}</td><td style="border:1px solid #ccc;padding:5px 8px">${a.status}</td><td style="border:1px solid #ccc;padding:5px 8px;color:${nextM === '—' ? '#111' : 'var(--brand-primary-strong)'}">${nextM}</td><td style="border:1px solid #ccc;padding:5px 8px">${exp}</td><td style="border:1px solid #ccc;padding:5px 8px"><span style="display:inline-block;width:9px;height:9px;border-radius:5px;background:${col}"></span></td></tr>`; }).join('');
    w.document.write(`<html><head><title>Fleet Report</title></head><body style="font-family:Arial;padding:24px;color:#111">
      <h2 style="margin:0">Fleet Report</h2><div style="color:#555;font-size:12px;margin-bottom:16px">Generated ${new Date().toLocaleString()}</div>
      <div style="display:flex;gap:24px;margin-bottom:18px;font-size:13px">
        <div><b style="font-size:20px">${summary.total}</b><br>Assets</div>
        <div><b style="font-size:20px;color:#FF3B30">${summary.maintenanceOverdue}</b><br>Maint. Overdue</div>
        <div><b style="font-size:20px;color:#b8860b">${summary.maintenanceSoon}</b><br>Due Soon</div>
        <div><b style="font-size:20px;color:#FF3B30">${summary.docsExpired}</b><br>Docs Expired</div>
        <div><b style="font-size:20px;color:#b8860b">${summary.docsExpiringSoon}</b><br>Expiring</div>
        <div><b style="font-size:20px">${usd(summary.totalMaintenanceCostCents)}</b><br>Maint. Cost</div>
      </div>
      ${summary.needsAttention.length ? `<div style="background:#fff4e5;border-left:3px solid #b8860b;padding:8px 12px;margin-bottom:14px;font-size:13px"><b>Needs attention:</b> ${summary.needsAttention.join(', ')}</div>` : ''}
      <table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#0E0F12;color:#fff">${['Asset', 'Type', 'Odometer', 'Status', 'Next Maintenance', 'Expiring', ''].map((h) => `<th style="border:1px solid #ccc;padding:6px 8px;text-align:left">${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      </body></html>`);
    w.document.close(); w.focus(); w.print();
  };

  const inp: React.CSSProperties = { background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, padding: '9px 11px', fontSize: 14, width: '100%' };
  const btn: React.CSSProperties = { background: 'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))', color: 'var(--on-brand)', fontWeight: 700, border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 14 };

  return (
    <>
      <PremiumSurface maxWidth={2200}>

        {/* Header */}
        <ModuleHero
          eyebrow="Fleet Management"
          eyebrowIcon={<Truck size={13} weight="fill" color={GOLD} />}
          title="Fleet"
          accent="Registry"
          subtitle="Maintenance, documents, and last-known location."
          actions={<>
            <button onClick={openIntegrate} style={ghostButtonStyle} className="pmBtn"><Broadcast size={15} weight="fill" color={GOLD} />GPS Integration</button>
            {assets.length > 0 && <button onClick={exportReport} style={ghostButtonStyle} className="pmBtn"><FilePdf size={15} />Report</button>}
            <button data-tour="add-asset" onClick={() => { setF({ type: 'vehicle' }); setAdding(true); }} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" />Add Asset</button>
          </>}
        />

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 20 }}>
          <StatCard icon={<Truck size={19} weight="duotone" color={GOLD} />} label="Assets" value={summary.total} accent={GOLD} sub={`${summary.byType.vehicle || 0} vehicle${(summary.byType.vehicle || 0) === 1 ? '' : 's'} · ${summary.byType.equipment || 0} equipment${summary.byStatus.in_shop ? ` · ${summary.byStatus.in_shop} in shop` : ''}`} delay={0.02}  href="/app/fleet"/>
          <StatCard icon={<Warning size={19} weight="duotone" color={summary.maintenanceOverdue ? RED : GOLD} />} label="Maint. Overdue" value={summary.maintenanceOverdue} accent={summary.maintenanceOverdue ? RED : undefined} sub={summary.needsAttention.length ? summary.needsAttention.slice(0, 2).join(', ') + (summary.needsAttention.length > 2 ? ` +${summary.needsAttention.length - 2}` : '') : 'All caught up'} delay={0.06}  href="/app/fleet"/>
          <StatCard icon={<Wrench size={19} weight="duotone" color={summary.maintenanceSoon ? AMBER : GOLD} />} label="Due Soon" value={summary.maintenanceSoon} accent={summary.maintenanceSoon ? AMBER : undefined} sub="Within 500 mi or 14 days" delay={0.10}  href="/app/fleet"/>
          <StatCard icon={<FileText size={19} weight="duotone" color={summary.docsExpired ? RED : GOLD} />} label="Docs Expired" value={summary.docsExpired} accent={summary.docsExpired ? RED : undefined} sub={summary.docsExpired ? 'Renew to stay road-legal' : 'Registrations & insurance current'} delay={0.14}  href="/app/fleet"/>
          <StatCard icon={<CalendarBlank size={19} weight="duotone" color={summary.docsExpiringSoon ? AMBER : GOLD} />} label="Expiring" value={summary.docsExpiringSoon} accent={summary.docsExpiringSoon ? AMBER : undefined} sub="Docs inside the 30-day window" delay={0.18}  href="/app/fleet"/>
          <StatCard icon={<CurrencyDollar size={19} weight="duotone" color={GOLD} />} label="Maint. Cost" value={usd(summary.totalMaintenanceCostCents)} sub={`Across ${records.length} service record${records.length === 1 ? '' : 's'}`} delay={0.22}  href="/app/fleet"/>
        </div>

        {assets.some((a) => a.last_lat) ? <SectionCard flat title="Live Map" icon={<MapPin size={17} weight="duotone" color={GOLD} />} style={{ marginBottom: 16 }}><FleetMap assets={assets} pings={selId ? pings : []} selId={selId} onSelect={setSelId} /></SectionCard> : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)', gap: 16, marginTop: 16, alignItems: 'start' }}>
          {/* registry */}
          <SectionCard title="Fleet Registry" icon={<Truck size={17} weight="duotone" color={GOLD} />} bodyStyle={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}><MagnifyingGlass size={16} color={DIM} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fleet…" style={{ background: 'none', border: 'none', color: TEXT, outline: 'none', flex: 1, fontSize: 14 }} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '68vh', overflowY: 'auto' }}>
              {filtered.length === 0 ? (assets.length ? <div style={{ color: DIM, fontSize: 13, padding: 12 }}>No matches</div> : <PremiumEmpty compact icon={<Truck size={30} weight="duotone" color={GOLD} />} title="No assets yet" description="Add your first vehicle or piece of equipment — the registry tracks maintenance schedules, expiring documents, GPS location, and lifetime cost per asset." action={<button onClick={() => { setF({ type: 'vehicle' }); setAdding(true); }} style={{ ...goldButtonStyle, padding: '8px 14px', fontSize: 13 }} className="pmBtn"><Plus size={14} weight="bold" />Add Asset</button>} />) : filtered.map((a) => {
                const h = assetHealth(a as Asset, records as MaintenanceRecord[], docs as AssetDoc[], now());
                const mnt = h.maintenance;
                const badExp = h.expiries.find((x) => x.status === 'expired') || h.expiries.find((x) => x.status === 'soon');
                const issue = mnt.status === 'overdue' || mnt.status === 'soon'
                  ? `${mnt.label || 'Service'} ${mnt.status === 'overdue' ? 'overdue' : 'due soon'}`
                  : badExp ? `${badExp.category} ${badExp.status === 'expired' ? 'expired' : `expires in ${badExp.daysUntil}d`}` : null;
                const seen = ago(a.last_location_at);
                return (
                <button key={a.id} onClick={() => setSelId(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: selId === a.id ? 'var(--brand-primary-12)' : RAISED, border: `1px solid ${selId === a.id ? GOLD : BORDER}`, borderRadius: 10, padding: 10, cursor: 'pointer', color: TEXT }}>
                  {a.type === 'vehicle' ? <Truck size={20} color={DIM} /> : <Wrench size={20} color={DIM} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      {a.status && a.status !== 'active' ? <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: 'color-mix(in srgb, var(--warning) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)', color: 'var(--warning)' }}>{STATUS_LABEL[a.status] || a.status}</span> : null}
                    </div>
                    <div style={{ color: DIM, fontSize: 12.5 }}>{[a.license_plate, a.odometer ? `${Math.round(a.odometer).toLocaleString()} ${a.odometer_unit || 'mi'}` : null].filter(Boolean).join(' · ') || a.category || a.type}</div>
                    {issue ? <div style={{ fontSize: 11.5, color: h.overall === 'overdue' ? RED : AMBER, marginTop: 2 }}>{issue}</div> : null}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span title={h.overall} style={{ width: 10, height: 10, borderRadius: 5, background: (STATUS_COLOR as any)[h.overall] }} />
                    <span style={{ fontSize: 10, color: DIM, whiteSpace: 'nowrap' }}>{seen ? <><MapPin size={9} style={{ verticalAlign: -1 }} /> {seen}</> : 'No GPS'}</span>
                  </div>
                </button>
              ); })}
            </div>
          </SectionCard>

          {/* detail */}
          <div>
            {!sel ? <SectionCard flat><PremiumEmpty icon={<Truck size={30} weight="duotone" color={GOLD} />} title="Select an asset" description="Choose a vehicle or piece of equipment from the registry to view its full record — maintenance history, documents, warnings, and last-known location." /></SectionCard> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SectionCard>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {sel.type === 'vehicle' ? <Truck size={26} weight="fill" color={GOLD} /> : <Wrench size={26} weight="fill" color={GOLD} />}
                    <div style={{ flex: 1 }}><div style={{ fontSize: 19, fontWeight: 800 }}>{sel.name}</div><div style={{ color: DIM, fontSize: 13.5 }}>{[sel.make, sel.model, sel.year].filter(Boolean).join(' · ') || sel.category}</div></div>
                    <button onClick={() => { setF({ ...sel, year: String(sel.year ?? ''), odometer: String(sel.odometer ?? '') }); setEditing(true); }} style={{ ...ghostButtonStyle, padding: '8px 13px', fontSize: 13 }} className="pmBtn"><PencilSimple size={14} />Edit</button>
                    <button onClick={() => delAsset(sel.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Trash size={17} color={RED} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap', fontSize: 13 }}>
                    {[['VIN', sel.vin], ['Plate', sel.license_plate], ['S/N', sel.serial_number], ['Odometer', sel.odometer ? `${Math.round(sel.odometer).toLocaleString()} ${sel.odometer_unit || 'mi'}` : null], ['Status', STATUS_LABEL[sel.status] || sel.status], ['Services', selRecords.length ? `${selRecords.length} logged` : null], ['Lifetime Maint.', selRecords.some((r) => r.cost_cents) ? usd(selRecords.reduce((s, r) => s + (Number(r.cost_cents) || 0), 0)) : null], ['Docs', selDocs.length ? `${selDocs.length} on file` : null], ['Last Seen', ago(sel.last_location_at)]].filter((x) => x[1]).map(([k, v]) => <div key={k as string}><div style={{ color: DIM, fontSize: 11 }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div></div>)}
                  </div>
                </SectionCard>

                {/* warnings */}
                {(() => { const warns = EXPIRIES.map(([col, label]) => ({ label, ...expiryStatus(sel[col], now()) })).filter((w) => w.status === 'soon' || w.status === 'expired'); const mnt = health?.maintenance; const show = warns.length || (mnt && (mnt.status === 'soon' || mnt.status === 'overdue')); return show ? (
                  <div style={{ background: 'color-mix(in srgb, var(--warning) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)', borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 12, color: AMBER, fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Warning size={15} weight="fill" />Attention</div>
                    {mnt && (mnt.status === 'soon' || mnt.status === 'overdue') ? <div style={{ fontSize: 13.5, color: mnt.status === 'overdue' ? RED : AMBER, marginBottom: 4 }}>Maintenance {mnt.status}: {mnt.label || 'service'}{mnt.remainingMiles != null ? ` (${mnt.remainingMiles < 0 ? Math.abs(mnt.remainingMiles) + ' mi over' : mnt.remainingMiles + ' mi left'})` : ''}{mnt.remainingDays != null ? ` (${mnt.remainingDays < 0 ? Math.abs(mnt.remainingDays) + ' days over' : mnt.remainingDays + ' days'})` : ''}</div> : null}
                    {warns.map((w) => <div key={w.label} style={{ fontSize: 13.5, color: w.status === 'expired' ? RED : AMBER }}>{w.label} {w.status === 'expired' ? `expired ${Math.abs(w.daysUntil!)} days ago` : `expires in ${w.daysUntil} days`}</div>)}
                  </div>
                ) : null; })()}

                {/* location */}
                <SectionCard flat title="Last Known Location" icon={<MapPin size={17} weight="duotone" color={GOLD} />} action={sel.last_lat ? <a href={`https://maps.google.com/?q=${sel.last_lat},${sel.last_lng}`} target="_blank" rel="noreferrer" style={{ color: GOLD, fontSize: 13, textDecoration: 'none', display: 'inline-flex', gap: 5, alignItems: 'center' }}>Open in Maps <ArrowSquareOut size={13} /></a> : null}>
                  {sel.last_lat ? (
                    <div style={{ fontSize: 13.5 }}><MapPin size={15} color={GOLD} weight="fill" style={{ verticalAlign: -2 }} /> {sel.last_lat.toFixed(5)}, {sel.last_lng.toFixed(5)} · <span style={{ color: DIM }}>{fmt(sel.last_location_at)}{sel.last_speed_mph ? ` · ${Math.round(sel.last_speed_mph)} mph` : ''}</span>
                      {trip.points > 1 ? <div style={{ color: DIM, fontSize: 12.5, marginTop: 6 }}>Recent trip: {trip.distanceMiles} mi · max {trip.maxSpeedMph} mph · {trip.durationMin} min ({trip.points} pings)</div> : null}
                    </div>
                  ) : <span style={{ color: DIM, fontSize: 13 }}>No location yet — the phone reports GPS while the asset is checked out (telematics adds live speed/trips).</span>}
                </SectionCard>

                {/* maintenance */}
                <SectionCard flat title="Maintenance" icon={<Wrench size={17} weight="duotone" color={GOLD} />} action={<button onClick={() => setAddingMaint(true)} style={{ ...goldButtonStyle, padding: '7px 13px', fontSize: 13 }} className="pmBtn">+ Log Service</button>}>
                  {selRecords.length === 0 ? <span style={{ color: DIM, fontSize: 13 }}>No maintenance logged.</span> : selRecords.map((r) => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${BORDER}`, fontSize: 13.5 }}>
                      <Wrench size={15} color={DIM} />
                      <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{r.description || r.kind}</div><div style={{ color: DIM, fontSize: 12 }}>{fmt(r.performed_at)}{r.odometer_at ? ` · ${Math.round(r.odometer_at).toLocaleString()} mi` : ''}{r.next_due_odometer ? ` · next @ ${Math.round(r.next_due_odometer).toLocaleString()} mi` : ''}{r.next_due_date ? ` · next ${fmt(r.next_due_date)}` : ''}</div></div>
                      {r.cost_cents ? <span style={{ fontWeight: 700 }}>{usd(r.cost_cents)}</span> : null}
                    </div>
                  ))}
                </SectionCard>

                {/* documents */}
                <SectionCard title="Documents" icon={<FileText size={17} weight="duotone" color={GOLD} />} action={<button onClick={() => setAddingDoc(true)} style={{ ...goldButtonStyle, padding: '7px 13px', fontSize: 13 }} className="pmBtn">+ Add Doc</button>}>
                  {selDocs.length === 0 ? <span style={{ color: DIM, fontSize: 13 }}>No documents. Add titles, warranties, insurance, contracts — with expirations for auto-warnings.</span> : selDocs.map((d) => { const e = expiryStatus(d.expires_at, now()); return (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${BORDER}`, fontSize: 13.5 }}>
                      <FileText size={15} color={DIM} />
                      <div style={{ flex: 1 }}><div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{d.label || d.category}</div>{d.expires_at ? <div style={{ color: e.status === 'expired' ? RED : e.status === 'soon' ? AMBER : DIM, fontSize: 12 }}><CalendarBlank size={11} style={{ verticalAlign: -1 }} /> {e.status === 'expired' ? 'Expired' : 'Expires'} {fmt(d.expires_at)}</div> : null}</div>
                      {d.file_url ? <a href={sign(d.file_url) || d.file_url} target="_blank" rel="noreferrer" style={{ color: GOLD }}><ArrowSquareOut size={15} /></a> : null}
                    </div>
                  ); })}
                </SectionCard>
              </div>
            )}
          </div>
        </div>
      </PremiumSurface>

      {(adding || editing) && (
        <Modal title={adding ? 'Add Asset' : 'Edit Asset'} onClose={() => { setAdding(false); setEditing(false); }}>
          {adding && <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>{['vehicle', 'equipment'].map((t) => <button key={t} onClick={() => setF({ ...f, type: t })} style={{ ...btn, flex: 1, background: f.type === t ? GOLD : 'transparent', color: f.type === t ? 'var(--on-brand)' : TEXT, border: `1px solid ${BORDER}`, textTransform: 'capitalize' }}>{t}</button>)}</div>}
          {f.type === 'vehicle' && <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}><input value={f.vin ?? ''} onChange={(e) => setF({ ...f, vin: e.target.value.toUpperCase() })} placeholder="VIN (auto-fills)" style={{ ...inp, fontFamily: 'monospace' }} /><button onClick={decodeVin} disabled={vinBusy} style={{ ...btn, background: 'var(--brand-primary-strong)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Barcode size={16} />{vinBusy ? '…' : 'Decode'}</button></div>}
          <input value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name / nickname (e.g. Truck 12)" style={inp} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><input value={f.make ?? ''} onChange={(e) => setF({ ...f, make: e.target.value })} placeholder="Make" style={inp} /><input value={f.model ?? ''} onChange={(e) => setF({ ...f, model: e.target.value })} placeholder="Model" style={inp} /><input value={f.year ?? ''} onChange={(e) => setF({ ...f, year: e.target.value })} placeholder="Year" style={{ ...inp, width: 80 }} /></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><input value={f.license_plate ?? ''} onChange={(e) => setF({ ...f, license_plate: e.target.value })} placeholder="Plate" style={inp} /><input value={f.serial_number ?? ''} onChange={(e) => setF({ ...f, serial_number: e.target.value })} placeholder="Serial #" style={inp} /><input value={f.odometer ?? ''} onChange={(e) => setF({ ...f, odometer: e.target.value })} placeholder="Odometer" style={{ ...inp, width: 110 }} /></div>
          {editing && <>
            <div style={{ color: DIM, fontSize: 12, marginTop: 12, marginBottom: 4 }}>Expirations (for Warnings)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{EXPIRIES.map(([col, label]) => <label key={col} style={{ flex: 1, minWidth: 130, fontSize: 12, color: DIM }}>{label}<SaguaroDatePicker value={f[col] ?? ''} onChange={(v) => setF({ ...f, [col]: v })} style={{ ...inp, marginTop: 2 }} /></label>)}</div>
          </>}
          <button onClick={adding ? addAsset : saveEdit} style={{ ...btn, marginTop: 14, width: '100%' }}>{adding ? 'Add Asset' : 'Save'}</button>
        </Modal>
      )}
      {addingMaint && (
        <Modal title="Log Service" onClose={() => setAddingMaint(false)}>
          <select value={m.kind} onChange={(e) => setM({ ...m, kind: e.target.value })} style={inp}>{['service', 'repair', 'inspection', 'other'].map((k) => <option key={k} value={k}>{k}</option>)}</select>
          <input value={m.description ?? ''} onChange={(e) => setM({ ...m, description: e.target.value })} placeholder="Description (e.g. Oil change)" style={{ ...inp, marginTop: 8 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><SaguaroDatePicker value={m.performed_at} onChange={(v) => setM({ ...m, performed_at: v })} style={inp} /><input value={m.odometer_at ?? ''} onChange={(e) => setM({ ...m, odometer_at: e.target.value })} placeholder="Odometer" style={inp} /><input value={m.cost ?? ''} onChange={(e) => setM({ ...m, cost: e.target.value })} placeholder="Cost $" style={inp} /></div>
          <div style={{ color: DIM, fontSize: 12, marginTop: 12, marginBottom: 4 }}>Next Due (Triggers a Warning)</div>
          <div style={{ display: 'flex', gap: 8 }}><input value={m.next_due_odometer ?? ''} onChange={(e) => setM({ ...m, next_due_odometer: e.target.value })} placeholder="Next @ odometer" style={inp} /><SaguaroDatePicker value={m.next_due_date ?? ''} onChange={(v) => setM({ ...m, next_due_date: v })} style={inp} /></div>
          <button onClick={addMaint} style={{ ...btn, marginTop: 14, width: '100%' }}>Log It</button>
        </Modal>
      )}
      {addingDoc && (
        <Modal title="Add Document" onClose={() => setAddingDoc(false)}>
          <select value={doc.category} onChange={(e) => setDoc({ ...doc, category: e.target.value })} style={inp}>{['title', 'warranty', 'insurance', 'registration', 'contract', 'receipt', 'manual', 'photo', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <input value={doc.label ?? ''} onChange={(e) => setDoc({ ...doc, label: e.target.value })} placeholder="Label" style={{ ...inp, marginTop: 8 }} />
          <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) uploadDocFile(f); }} style={{ display: 'block', marginTop: 8, border: `1.5px dashed ${doc.file_url && !/^https?:\/\//.test(doc.file_url) ? DIM : BORDER}`, borderRadius: 10, padding: 16, textAlign: 'center', cursor: docUploading ? 'wait' : 'pointer', color: DIM, fontSize: 13, background: DARK }}>
            {docUploading ? 'Uploading…' : doc.file_name ? `Uploaded: ${doc.file_name}` : 'Drag a photo or PDF here, or click to upload'}
            <input type="file" accept="image/*,application/pdf" disabled={docUploading} style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDocFile(f); }} />
          </label>
          <input value={doc.file_url ?? ''} onChange={(e) => setDoc({ ...doc, file_url: e.target.value })} placeholder="…or paste a file URL" style={{ ...inp, marginTop: 8 }} />
          <label style={{ fontSize: 12, color: DIM, marginTop: 10, display: 'block' }}>Expires (for Warnings)<SaguaroDatePicker value={doc.expires_at ?? ''} onChange={(v) => setDoc({ ...doc, expires_at: v })} style={{ ...inp, marginTop: 2 }} /></label>
          <button onClick={addDocument} style={{ ...btn, marginTop: 14, width: '100%' }}>Add</button>
        </Modal>
      )}
      {showIntegrate && (
        <Modal title="GPS / Telematics Integration" onClose={() => setShowIntegrate(false)}>
          <p style={{ color: DIM, fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
            Connect <b>any</b> GPS provider — Bouncie, Samsara, Motive, or a plain tracker — without handing us your login.
            Generate a connect key, then paste your <b>ingest URL</b> into that provider's <b>webhook</b> setting.
            Each ping is matched to a vehicle by <b>VIN, plate, serial, or asset tag</b> and drops onto the live map with speed &amp; trips.
          </p>

          <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, margin: '12px 0' }}>
            <div style={{ color: DIM, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Your Ingest URL</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ flex: 1, fontSize: 12, color: GREEN, wordBreak: 'break-all', fontFamily: 'monospace' }}>{ingestBase}</code>
              <button onClick={() => copyText(ingestBase, 'url')} style={{ ...btn, padding: '6px 10px', background: 'transparent', color: TEXT, border: `1px solid ${BORDER}`, display: 'inline-flex', gap: 4, alignItems: 'center' }}>{copied === 'url' ? <Check size={14} color={GREEN} /> : <Copy size={14} />}{copied === 'url' ? 'Copied' : 'Copy'}</button>
            </div>
            <div style={{ color: DIM, fontSize: 12, marginTop: 8 }}>POST JSON: <code style={{ color: DIM }}>{`{ token, vin|plate|serial|asset_tag, lat, lng, speed_mph?, odometer?, at? }`}</code> — or a <code style={{ color: DIM }}>pings:[…]</code> batch.</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: 6, marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: DIM, fontWeight: 700, flex: 1 }}>Connect Keys</div>
            <button onClick={() => genToken('generic')} disabled={genBusy} style={{ ...btn, padding: '6px 12px', fontSize: 13, display: 'inline-flex', gap: 5, alignItems: 'center' }}><Plus size={14} weight="bold" />{genBusy ? '…' : 'New Key'}</button>
          </div>

          {integrations.length === 0 ? (
            <div style={{ color: DIM, fontSize: 13, padding: '10px 0' }}>No keys yet. Generate one, then paste it (with the URL above) into your provider.</div>
          ) : integrations.map((it) => (
            <div key={it.id} style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: it.active ? GREEN : DIM }} />
                <code style={{ flex: 1, fontSize: 12.5, color: it.active ? TEXT : DIM, wordBreak: 'break-all', fontFamily: 'monospace' }}>{it.ingest_token}</code>
                <button onClick={() => copyText(it.ingest_token, it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: DIM, display: 'inline-flex', gap: 3, alignItems: 'center', fontSize: 12 }}>{copied === it.id ? <Check size={14} color={GREEN} /> : <Copy size={14} />}</button>
                <button onClick={() => toggleIntegration(it.id, !it.active)} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '3px 9px', cursor: 'pointer', color: it.active ? AMBER : GREEN, fontSize: 12, fontWeight: 700 }}>{it.active ? 'Disable' : 'Enable'}</button>
              </div>
              <div style={{ color: DIM, fontSize: 11.5, marginTop: 6 }}>{it.provider} · {(it.ping_count ?? 0).toLocaleString()} pings{it.last_ping_at ? ` · last ${fmt(it.last_ping_at)}` : ' · no pings yet'}</div>
            </div>
          ))}
          <div style={{ color: DIM, fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>Match a tracker to a vehicle by setting that vehicle's <b>plate / VIN / serial / asset tag</b> to what your provider sends. Treat a key like a password — disable it to cut a provider off instantly.</div>
        </Modal>
      )}
    </>
  );
}

// Live fleet map — free OpenStreetMap tiles via Leaflet loaded from CDN (no npm dep,
// no CSP set on this app). Markers = each asset's last-known GPS; the selected asset's
// recent pings draw as a trip line. Updates as assets report location from the phone.
function FleetMap({ assets, pings, selId, onSelect }: { assets: any[]; pings: any[]; selId: string | null; onSelect: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  useEffect(() => {
    let cancelled = false;
    const ensureLeaflet = async (): Promise<any> => {
      if ((window as any).L) return (window as any).L;
      await new Promise<void>((res) => {
        if (!document.getElementById('leaflet-css')) { const l = document.createElement('link'); l.id = 'leaflet-css'; l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l); }
        const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = () => res(); s.onerror = () => res(); document.head.appendChild(s);
      });
      return (window as any).L;
    };
    (async () => {
      const L = await ensureLeaflet(); if (cancelled || !L || !ref.current) return;
      const located = assets.filter((a) => a.last_lat != null && a.last_lng != null);
      if (!mapRef.current) {
        mapRef.current = L.map(ref.current, { attributionControl: false }).setView(located[0] ? [located[0].last_lat, located[0].last_lng] : [39.5, -98.35], located.length ? 11 : 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapRef.current);
        mapRef.current._layer = L.layerGroup().addTo(mapRef.current);
      }
      const map = mapRef.current; map._layer.clearLayers();
      const pts: [number, number][] = [];
      for (const a of located) { const mk = L.circleMarker([a.last_lat, a.last_lng], { radius: a.id === selId ? 10 : 7, color: a.id === selId ? 'var(--warning)' : 'var(--brand-primary)', fillColor: a.id === selId ? 'var(--warning)' : 'var(--brand-primary)', fillOpacity: 0.85, weight: 2 }).bindPopup(`<b>${a.name}</b><br>${a.last_location_at ? new Date(a.last_location_at).toLocaleString() : ''}${a.last_speed_mph ? `<br>${Math.round(a.last_speed_mph)} mph` : ''}`); mk.on('click', () => onSelect(a.id)); mk.addTo(map._layer); pts.push([a.last_lat, a.last_lng]); }
      if (pings && pings.length > 1) L.polyline(pings.map((p) => [p.lat, p.lng]), { color: 'var(--warning)', weight: 3, opacity: 0.8 }).addTo(map._layer);
      if (pts.length) map.fitBounds(pts, { padding: [34, 34], maxZoom: 14 });
      setTimeout(() => map.invalidateSize(), 100);
    })();
    return () => { cancelled = true; };
  }, [assets, pings, selId, onSelect]);
  return <div ref={ref} style={{ height: 340, borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}` }} />;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}><div onClick={(e) => e.stopPropagation()} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, width: 'min(500px, 100%)', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}><div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}><div style={{ fontWeight: 800, fontSize: 17, flex: 1 }}>{title}</div><button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color={DIM} /></button></div>{children}</div></div>;
}
