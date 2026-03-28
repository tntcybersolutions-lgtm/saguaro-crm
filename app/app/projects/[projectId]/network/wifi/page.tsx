'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const BASE = '#0F1419';
const CARD = '#1A1F2E';
const GOLD = '#D4A017';
const GREEN = '#22C55E';
const BLUE = '#3B82F6';
const RED = '#EF4444';
const BORDER = 'rgba(255,255,255,0.08)';
const DIM = '#8fa3c0';
const TEXT = '#e8edf8';

interface WifiNetwork {
  id: string;
  network_project_id: string;
  ssid: string;
  security_type: string;
  password: string;
  vlan_id: string;
  vlan_name?: string;
  band: string;
  hidden: boolean;
  client_isolation: boolean;
  bandwidth_limit_mbps: number;
  enabled: boolean;
  client_count?: number;
  created_at: string;
}

interface AccessPoint {
  id: string;
  network_project_id: string;
  name: string;
  model: string;
  floor: number;
  x_position: number;
  y_position: number;
  coverage_radius: number;
  channel: number;
  power_dbm: number;
  status: string;
  ssid_ids: string[];
}

const SECURITY_TYPES = ['wpa3_enterprise', 'wpa3_personal', 'wpa2_enterprise', 'wpa2_personal', 'open'];
const BANDS = ['2.4ghz', '5ghz', 'dual', '6ghz'];

const SECURITY_COLORS: Record<string, { bg: string; text: string }> = {
  wpa3_enterprise: { bg: `${GREEN}20`, text: GREEN },
  wpa3_personal: { bg: `${GREEN}15`, text: GREEN },
  wpa2_enterprise: { bg: `${BLUE}20`, text: BLUE },
  wpa2_personal: { bg: `${BLUE}15`, text: BLUE },
  open: { bg: `${RED}20`, text: RED },
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: BASE, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  color: DIM, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4,
};

export default function WifiManagerPage() {
  const { projectId } = useParams() as { projectId: string };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [networkProjectId, setNetworkProjectId] = useState('');
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [aps, setAps] = useState<AccessPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSsidForm, setShowSsidForm] = useState(false);
  const [showApForm, setShowApForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [placeMode, setPlaceMode] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState(1);

  const emptySsidForm = {
    ssid: '', security_type: 'wpa2_enterprise', password: '', vlan_id: '', band: 'dual',
    hidden: false, client_isolation: false, bandwidth_limit_mbps: 0,
  };
  const [ssidForm, setSsidForm] = useState(emptySsidForm);

  const emptyApForm = {
    name: '', model: '', floor: 1, x_position: 50, y_position: 50,
    coverage_radius: 80, channel: 1, power_dbm: 20,
  };
  const [apForm, setApForm] = useState(emptyApForm);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const npRes = await fetch(`/api/network/projects?projectId=${projectId}`);
      const npData = await npRes.json();
      if (!npData.networkProject) { setLoading(false); return; }
      setNetworkProjectId(npData.networkProject.id);
      const [wifiRes, apRes] = await Promise.all([
        fetch(`/api/network/wifi?networkProjectId=${npData.networkProject.id}`),
        fetch(`/api/network/access-points?networkProjectId=${npData.networkProject.id}`),
      ]);
      const [wifiData, apData] = await Promise.all([wifiRes.json(), apRes.json()]);
      setNetworks(wifiData.networks || []);
      setAps(apData.accessPoints || []);
    } catch { /* */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Heatmap rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Floor plan background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // Draw AP coverage
    const floorAps = aps.filter(ap => ap.floor === selectedFloor);
    floorAps.forEach(ap => {
      const cx = (ap.x_position / 100) * w;
      const cy = (ap.y_position / 100) * h;
      const r = (ap.coverage_radius / 100) * Math.min(w, h);

      // Coverage gradient
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(34, 197, 94, 0.3)');
      grad.addColorStop(0.4, 'rgba(234, 179, 8, 0.15)');
      grad.addColorStop(0.7, 'rgba(239, 68, 68, 0.08)');
      grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // AP dot
      ctx.fillStyle = ap.status === 'online' ? GREEN : ap.status === 'offline' ? RED : '#6B7280';
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = TEXT;
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(ap.name, cx, cy - 14);
      ctx.fillStyle = DIM;
      ctx.font = '9px system-ui';
      ctx.fillText(`Ch ${ap.channel} | ${ap.power_dbm}dBm`, cx, cy + 22);
    });

    // Legend
    if (floorAps.length > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(w - 160, h - 80, 150, 70);
      ctx.fillStyle = TEXT;
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText('Signal Strength', w - 150, h - 62);
      const legendItems = [
        { color: GREEN, label: 'Strong (-30 to -50 dBm)' },
        { color: GOLD, label: 'Medium (-50 to -70 dBm)' },
        { color: RED, label: 'Weak (-70 to -85 dBm)' },
      ];
      legendItems.forEach((item, i) => {
        ctx.fillStyle = item.color;
        ctx.fillRect(w - 150, h - 52 + i * 16, 10, 10);
        ctx.fillStyle = DIM;
        ctx.font = '9px system-ui';
        ctx.fillText(item.label, w - 136, h - 43 + i * 16);
      });
    }
  }, [aps, selectedFloor]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!placeMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setApForm({ ...apForm, x_position: Math.round(x), y_position: Math.round(y), floor: selectedFloor });
    setPlaceMode(false);
    setShowApForm(true);
  };

  const handleSsidSubmit = async () => {
    if (!ssidForm.ssid || !networkProjectId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/network/wifi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ssidForm, network_project_id: networkProjectId, enabled: true }),
      });
      if (res.ok) { setSsidForm(emptySsidForm); setShowSsidForm(false); fetchData(); }
    } catch { /* */ }
    setSaving(false);
  };

  const handleApSubmit = async () => {
    if (!apForm.name || !networkProjectId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/network/access-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...apForm, network_project_id: networkProjectId, status: 'planned' }),
      });
      if (res.ok) { setApForm(emptyApForm); setShowApForm(false); fetchData(); }
    } catch { /* */ }
    setSaving(false);
  };

  const cardStyle: React.CSSProperties = {
    background: `${CARD}cc`, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20,
  };

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div style={{ color: DIM }}>Loading WiFi...</div></div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/app/projects/${projectId}/network`} style={{ color: DIM, fontSize: 12, textDecoration: 'none' }}>Network &gt;</Link>
        <span style={{ color: TEXT, fontSize: 12, marginLeft: 4 }}>WiFi</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ color: TEXT, fontSize: 22, fontWeight: 700, margin: 0 }}>WiFi Manager</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSsidForm(!showSsidForm)} style={{
            padding: '10px 18px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`, color: '#000',
            border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>
            + Add SSID
          </button>
        </div>
      </div>

      {/* Add SSID Form */}
      {showSsidForm && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ color: TEXT, fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>Add WiFi Network (SSID)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>SSID Name *</label>
              <input value={ssidForm.ssid} onChange={e => setSsidForm({ ...ssidForm, ssid: e.target.value })} placeholder="Corporate-WiFi" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Security</label>
              <select value={ssidForm.security_type} onChange={e => setSsidForm({ ...ssidForm, security_type: e.target.value })} style={inputStyle}>
                {SECURITY_TYPES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Password</label>
              <input type="password" value={ssidForm.password} onChange={e => setSsidForm({ ...ssidForm, password: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>VLAN ID</label>
              <input value={ssidForm.vlan_id} onChange={e => setSsidForm({ ...ssidForm, vlan_id: e.target.value })} placeholder="10" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Band</label>
              <select value={ssidForm.band} onChange={e => setSsidForm({ ...ssidForm, band: e.target.value })} style={inputStyle}>
                {BANDS.map(b => <option key={b} value={b}>{b.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Bandwidth Limit (Mbps)</label>
              <input type="number" value={ssidForm.bandwidth_limit_mbps} onChange={e => setSsidForm({ ...ssidForm, bandwidth_limit_mbps: +e.target.value })} placeholder="0 = unlimited" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: TEXT, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={ssidForm.hidden} onChange={e => setSsidForm({ ...ssidForm, hidden: e.target.checked })} />
                Hidden SSID
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: TEXT, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={ssidForm.client_isolation} onChange={e => setSsidForm({ ...ssidForm, client_isolation: e.target.checked })} />
                Client Isolation
              </label>
            </div>
          </div>
          <button onClick={handleSsidSubmit} disabled={saving || !ssidForm.ssid} style={{
            marginTop: 16, padding: '10px 24px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`,
            color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            opacity: saving || !ssidForm.ssid ? 0.5 : 1,
          }}>
            {saving ? 'Saving...' : 'Save SSID'}
          </button>
        </div>
      )}

      {/* WiFi Networks List */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <h3 style={{ color: TEXT, fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>WiFi Networks</h3>
        {networks.length === 0 ? (
          <div style={{ color: DIM, fontSize: 13, textAlign: 'center', padding: 24 }}>No SSIDs configured yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {networks.map(net => {
              const sc = SECURITY_COLORS[net.security_type] || SECURITY_COLORS.wpa2_personal;
              return (
                <div key={net.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: `1px solid ${BORDER}`,
                }}>
                  <span style={{ fontSize: 22 }}>📡</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>
                      {net.ssid}
                      {net.hidden && <span style={{ fontSize: 10, color: DIM, marginLeft: 8 }}>(Hidden)</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600,
                        background: sc.bg, color: sc.text,
                      }}>{net.security_type.replace(/_/g, ' ').toUpperCase()}</span>
                      {net.vlan_name && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: DIM }}>VLAN: {net.vlan_name}</span>}
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: DIM }}>{net.band.toUpperCase()}</span>
                      {net.client_isolation && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: `${GOLD}15`, color: GOLD }}>Isolated</span>}
                      {net.bandwidth_limit_mbps > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: DIM }}>{net.bandwidth_limit_mbps} Mbps</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: TEXT, fontSize: 18, fontWeight: 700 }}>{net.client_count ?? 0}</div>
                    <div style={{ color: DIM, fontSize: 10 }}>clients</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Heatmap Section */}
      <div style={{ ...cardStyle }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: TEXT, fontSize: 15, fontWeight: 700, margin: 0 }}>WiFi Heatmap</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={selectedFloor} onChange={e => setSelectedFloor(+e.target.value)} style={{ ...inputStyle, width: 120 }}>
              {[1, 2, 3, 4, 5].map(f => <option key={f} value={f}>Floor {f}</option>)}
            </select>
            <button
              onClick={() => setPlaceMode(!placeMode)}
              style={{
                padding: '8px 14px', background: placeMode ? `${GREEN}20` : 'rgba(255,255,255,0.05)',
                color: placeMode ? GREEN : TEXT, border: `1px solid ${placeMode ? GREEN : BORDER}`,
                borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {placeMode ? 'Click to Place AP' : 'Place AP'}
            </button>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={800}
          height={500}
          onClick={handleCanvasClick}
          style={{
            width: '100%', height: 'auto', borderRadius: 8, border: `1px solid ${BORDER}`,
            cursor: placeMode ? 'crosshair' : 'default',
          }}
        />

        {/* Place AP Form */}
        {showApForm && (
          <div style={{ marginTop: 16, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: `1px solid ${BORDER}` }}>
            <h4 style={{ color: TEXT, fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>Configure Access Point</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div>
                <label style={labelStyle}>AP Name *</label>
                <input value={apForm.name} onChange={e => setApForm({ ...apForm, name: e.target.value })} placeholder="AP-F1-01" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Model</label>
                <input value={apForm.model} onChange={e => setApForm({ ...apForm, model: e.target.value })} placeholder="U6-Pro" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Coverage Radius</label>
                <input type="range" min={20} max={150} value={apForm.coverage_radius} onChange={e => setApForm({ ...apForm, coverage_radius: +e.target.value })} style={{ width: '100%' }} />
                <div style={{ color: DIM, fontSize: 11, textAlign: 'center' }}>{apForm.coverage_radius}px</div>
              </div>
              <div>
                <label style={labelStyle}>Channel</label>
                <input type="number" value={apForm.channel} onChange={e => setApForm({ ...apForm, channel: +e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Power (dBm)</label>
                <input type="number" value={apForm.power_dbm} onChange={e => setApForm({ ...apForm, power_dbm: +e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Position</label>
                <div style={{ color: DIM, fontSize: 12, fontFamily: 'monospace', padding: '10px 0' }}>X: {apForm.x_position}%, Y: {apForm.y_position}%</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={handleApSubmit} disabled={saving || !apForm.name} style={{
                padding: '10px 24px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`,
                color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: saving || !apForm.name ? 0.5 : 1,
              }}>
                {saving ? 'Saving...' : 'Save AP'}
              </button>
              <button onClick={() => setShowApForm(false)} style={{
                padding: '10px 24px', background: 'transparent', color: DIM,
                border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        )}

        {/* AP List */}
        {aps.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ color: DIM, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>ACCESS POINTS ({aps.filter(a => a.floor === selectedFloor).length} on Floor {selectedFloor})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {aps.filter(a => a.floor === selectedFloor).map(ap => (
                <div key={ap.id} style={{
                  padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: `1px solid ${BORDER}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ap.status === 'online' ? GREEN : ap.status === 'offline' ? RED : '#6B7280' }} />
                    <span style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{ap.name}</span>
                  </div>
                  <div style={{ color: DIM, fontSize: 11, marginTop: 4 }}>
                    {ap.model || 'Unknown'} &middot; Ch {ap.channel} &middot; {ap.power_dbm}dBm
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}