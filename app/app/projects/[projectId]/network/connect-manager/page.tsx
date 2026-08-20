'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';

const BASE = '#0d1117';
const CARD = '#161b22';
const CARD2 = '#1c2128';
const GOLD = '#C8960F';
const GREEN = '#22C55E';
const BLUE = '#3B82F6';
const RED = '#EF4444';
const ORANGE = '#F59E0B';
const BORDER = '#1E3A5F';
const DIM = '#8BAAC8';
const TEXT = '#F0F4FF';
const SURFACE = '#0F2336';

type Tab = 'profiles' | 'links' | 'send' | 'log';

interface Connection {
  id: string; name: string; network_type: string; ssid: string | null; password: string;
  security_type: string; frequency: string; wifi_hidden: boolean; vlan_id: number | null;
  gateway: string | null; dns: string | null; notes: string | null; is_active: boolean;
  vpn_enabled: boolean; vpn_type: string; vpn_port: number; vpn_dns: string;
  vpn_allowed_ips: string; vpn_preshared_key: string | null; vpn_client_ip_pool: string;
  wireguard_endpoint: string | null; wireguard_public_key: string | null;
  token_expires_hours: number; active_token_count: number;
  created_at: string; updated_at: string;
}

interface Token {
  id: string; token: string; connection_id: string; issued_to_name: string; issued_to_email: string;
  issued_to_role: string; expires_at: string; last_used_at: string | null; use_count: number;
  status: string; label: string | null; created_at: string;
  network_connections?: { name: string; ssid: string; network_type: string };
}

interface LogEntry {
  id: string; user_name: string; event_type: string; ip_address: string; platform: string;
  user_agent: string; created_at: string; connection_id: string;
}

interface TeamMember {
  id: string; first_name: string; last_name: string; email: string; role: string;
  avatar_url?: string; last_active?: string;
}

const cardStyle: React.CSSProperties = {
  background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: SURFACE, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none',
};

const btnGold: React.CSSProperties = {
  padding: '10px 20px', background: `linear-gradient(135deg, #B8860B, ${GOLD})`,
  border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
};

const btnOutline: React.CSSProperties = {
  padding: '8px 14px', background: 'transparent', border: `1px solid ${BORDER}`,
  borderRadius: 8, color: DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

function timeLeft(expiresAt: string): { text: string; status: 'active' | 'expiring' | 'expired' } {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { text: 'Expired', status: 'expired' };
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const status = diff < 7200000 ? 'expiring' : 'active';
  return { text: h > 0 ? `${h}h ${m}m` : `${m}m`, status };
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    active: { bg: 'rgba(34,197,94,.12)', text: GREEN },
    expiring: { bg: 'rgba(245,158,11,.12)', text: ORANGE },
    expired: { bg: 'rgba(139,148,158,.12)', text: '#8b949e' },
    revoked: { bg: 'rgba(239,68,68,.12)', text: RED },
    viewed: { bg: 'rgba(59,130,246,.12)', text: BLUE },
    connected: { bg: 'rgba(34,197,94,.12)', text: GREEN },
    error: { bg: 'rgba(239,68,68,.12)', text: RED },
  };
  const c = colors[status] || colors.active;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.text, textTransform: 'capitalize',
      textDecoration: status === 'revoked' ? 'line-through' : 'none',
    }}>
      {status}
    </span>
  );
}

function PlatformIcon({ platform }: { platform: string }) {
  const icons: Record<string, string> = { ios: '\uD83D\uDCF1', android: '\uD83E\uDD16', windows: '\uD83D\uDCBB', mac: '\uD83D\uDCBB', desktop: '\uD83D\uDCBB' };
  return <span>{icons[platform] || '\uD83D\uDCBB'}</span>;
}

export default function ConnectManagerPage() {
  const { projectId } = useParams() as { projectId: string };
  const [tab, setTab] = useState<Tab>('profiles');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const qrRef = useRef<HTMLCanvasElement>(null);

  // Form state
  const [form, setForm] = useState({
    name: '', ssid: '', password: '', security_type: 'WPA2', frequency: '5GHz',
    wifi_hidden: false, vlan_id: '', gateway: '', dns: '', notes: '',
    vpn_enabled: false, vpn_type: 'wireguard', wireguard_endpoint: '', wireguard_public_key: '',
    vpn_preshared_key: '', vpn_dns: '1.1.1.1', vpn_allowed_ips: '0.0.0.0/0', vpn_port: '51820',
    token_expires_hours: '12',
  });

  // Send state
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [sendNetwork, setSendNetwork] = useState('');
  const [sendExpiry, setSendExpiry] = useState('12');
  const [sendMessage, setSendMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ tokens_created: number; links: Array<{ user_id: string; url: string; expires_at: string }> } | null>(null);

  // Log filters
  const [logRange, setLogRange] = useState('7d');
  const [logEvent, setLogEvent] = useState('all');

  // Token filter
  const [tokenStatus, setTokenStatus] = useState('all');
  const [tokenSearch, setTokenSearch] = useState('');

  const fetchConnections = useCallback(async () => {
    const res = await fetch(`/api/network/connections?project_id=${projectId}`);
    const d = await res.json();
    setConnections(d.connections || []);
  }, [projectId]);

  const fetchTokens = useCallback(async () => {
    const res = await fetch(`/api/network/tokens?project_id=${projectId}`);
    const d = await res.json();
    setTokens(d.tokens || []);
  }, [projectId]);

  const fetchLogs = useCallback(async () => {
    const res = await fetch(`/api/network/access-log?project_id=${projectId}&range=${logRange}`);
    const d = await res.json();
    setLogs(d.logs || d.entries || []);
  }, [projectId, logRange]);

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/team`);
      const d = await res.json();
      setTeam(d.members || d.team || []);
    } catch { setTeam([]); }
  }, [projectId]);

  useEffect(() => {
    Promise.all([fetchConnections(), fetchTokens(), fetchLogs(), fetchTeam()])
      .finally(() => setLoading(false));
  }, [fetchConnections, fetchTokens, fetchLogs, fetchTeam]);

  // QR preview in form
  useEffect(() => {
    if (!form.ssid || !qrRef.current || !showForm) return;
    const qrData = `WIFI:T:${form.security_type};S:${form.ssid};P:${form.password};H:${form.wifi_hidden};;`;
    import('qrcode').then(QRCode => {
      QRCode.toCanvas(qrRef.current!, qrData, { width: 140, margin: 1 });
    }).catch(() => {});
  }, [form.ssid, form.password, form.security_type, form.wifi_hidden, showForm]);

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/field/network/connect?token=${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(''), 2000);
  };

  const resetForm = () => {
    setForm({ name: '', ssid: '', password: '', security_type: 'WPA2', frequency: '5GHz', wifi_hidden: false, vlan_id: '', gateway: '', dns: '', notes: '', vpn_enabled: false, vpn_type: 'wireguard', wireguard_endpoint: '', wireguard_public_key: '', vpn_preshared_key: '', vpn_dns: '1.1.1.1', vpn_allowed_ips: '0.0.0.0/0', vpn_port: '51820', token_expires_hours: '12' });
    setEditId(null);
    setShowForm(false);
  };

  const saveConnection = async () => {
    const payload = {
      ...form,
      project_id: projectId,
      vlan_id: form.vlan_id ? parseInt(form.vlan_id) : null,
      vpn_port: parseInt(form.vpn_port) || 51820,
      token_expires_hours: parseInt(form.token_expires_hours) || 12,
    };
    const url = editId ? `/api/network/connections/${editId}` : '/api/network/connections';
    const method = editId ? 'PUT' : 'POST';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    resetForm();
    fetchConnections();
  };

  const deleteConnection = async (id: string) => {
    if (!confirm('Deactivate this network profile?')) return;
    await fetch(`/api/network/connections/${id}`, { method: 'DELETE' });
    fetchConnections();
  };

  const editConnection = (c: Connection) => {
    setForm({
      name: c.name, ssid: c.ssid || '', password: '', security_type: c.security_type || 'WPA2',
      frequency: c.frequency || '5GHz', wifi_hidden: c.wifi_hidden || false,
      vlan_id: c.vlan_id ? String(c.vlan_id) : '', gateway: c.gateway || '', dns: c.dns || '',
      notes: c.notes || '', vpn_enabled: c.vpn_enabled || false, vpn_type: c.vpn_type || 'wireguard',
      wireguard_endpoint: c.wireguard_endpoint || '', wireguard_public_key: c.wireguard_public_key || '',
      vpn_preshared_key: '', vpn_dns: c.vpn_dns || '1.1.1.1', vpn_allowed_ips: c.vpn_allowed_ips || '0.0.0.0/0',
      vpn_port: String(c.vpn_port || 51820), token_expires_hours: String(c.token_expires_hours || 12),
    });
    setEditId(c.id);
    setShowForm(true);
  };

  const revokeToken = async (id: string) => {
    if (!confirm('Revoke this access link?')) return;
    await fetch(`/api/network/tokens/${id}/revoke`, { method: 'POST' });
    fetchTokens();
  };

  const sendLinks = async () => {
    if (!sendNetwork || selectedUsers.size === 0) return;
    setSending(true);
    try {
      const res = await fetch(`/api/network/connections/${sendNetwork}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_ids: Array.from(selectedUsers),
          expires_hours: parseInt(sendExpiry) || 12,
          message: sendMessage || undefined,
        }),
      });
      const d = await res.json();
      setSendResult(d);
      fetchTokens();
    } catch { /* handled */ }
    setSending(false);
  };

  const filteredTokens = tokens.filter(t => {
    if (tokenStatus !== 'all') {
      if (tokenStatus === 'active') {
        if (t.status !== 'active' || new Date(t.expires_at) <= new Date()) return false;
      } else if (tokenStatus === 'expired') {
        if (new Date(t.expires_at) > new Date() && t.status === 'active') return false;
      } else if (tokenStatus === 'revoked') {
        if (t.status !== 'revoked') return false;
      }
    }
    if (tokenSearch) {
      const s = tokenSearch.toLowerCase();
      if (!(t.issued_to_name || '').toLowerCase().includes(s) && !(t.network_connections?.name || '').toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const filteredLogs = logs.filter(l => {
    if (logEvent !== 'all' && l.event_type !== logEvent) return false;
    return true;
  });

  const exportCsv = () => {
    const rows = [['Time', 'User', 'Network', 'Event', 'IP', 'Platform']];
    filteredLogs.forEach(l => rows.push([
      new Date(l.created_at).toLocaleString(), l.user_name, l.connection_id, l.event_type, l.ip_address, l.platform,
    ]));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'network-access-log.csv';
    a.click();
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ color: DIM, fontSize: 14 }}>Loading network manager...</div>
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: 0 }}>Network Connect Manager</h1>
        <p style={{ fontSize: 13, color: DIM, marginTop: 4 }}>Manage WiFi profiles, access links, and connection logs</p>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${BORDER}`, marginBottom: 24 }}>
        {([
          { key: 'profiles', label: 'Network Profiles', icon: '\uD83D\uDCF6' },
          { key: 'links', label: 'Access Links', icon: '\uD83D\uDD17' },
          { key: 'send', label: 'Send to Team', icon: '\uD83D\uDCE4' },
          { key: 'log', label: 'Access Log', icon: '\uD83D\uDCCB' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '12px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            background: 'transparent', border: 'none',
            borderBottom: `2px solid ${tab === t.key ? GOLD : 'transparent'}`,
            color: tab === t.key ? GOLD : DIM, transition: 'all .2s',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB 1: PROFILES ═══ */}
      {tab === 'profiles' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, color: DIM }}>{connections.length} network profile{connections.length !== 1 ? 's' : ''}</div>
            <button onClick={() => { resetForm(); setShowForm(true); }} style={btnGold}>+ Add Profile</button>
          </div>

          {/* Add/Edit Form */}
          {showForm && (
            <div style={{ ...cardStyle, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: TEXT, margin: 0 }}>{editId ? 'Edit' : 'New'} Network Profile</h3>
                <button onClick={resetForm} style={{ background: 'none', border: 'none', color: DIM, fontSize: 18, cursor: 'pointer' }}>{'\u2715'}</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* WiFi Section */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: .5 }}>WiFi Settings</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name *</label>
                      <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Office WiFi" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>SSID *</label>
                      <input value={form.ssid} onChange={e => setForm({ ...form, ssid: e.target.value })} placeholder="MyNetwork-5G" style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Password</label>
                      <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Security</label>
                      <select value={form.security_type} onChange={e => setForm({ ...form, security_type: e.target.value })} style={inputStyle}>
                        <option value="WPA3">WPA3</option><option value="WPA2">WPA2</option><option value="WPA">WPA</option><option value="nopass">Open</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Frequency</label>
                      <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} style={inputStyle}>
                        <option value="5GHz">5GHz</option><option value="2.4GHz">2.4GHz</option><option value="Both">Both</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>VLAN ID</label>
                      <input type="number" value={form.vlan_id} onChange={e => setForm({ ...form, vlan_id: e.target.value })} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Gateway IP</label>
                      <input value={form.gateway} onChange={e => setForm({ ...form, gateway: e.target.value })} placeholder="192.168.1.1" style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'end' }}>
                      <label style={{ fontSize: 12, color: DIM, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.wifi_hidden} onChange={e => setForm({ ...form, wifi_hidden: e.target.checked })} />
                        Hidden Network
                      </label>
                    </div>
                  </div>

                  {/* VPN Section */}
                  <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14, marginTop: 4 }}>
                    <label style={{ fontSize: 12, color: TEXT, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.vpn_enabled} onChange={e => setForm({ ...form, vpn_enabled: e.target.checked })} />
                      Enable VPN for this network
                    </label>
                  </div>
                  {form.vpn_enabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: .5 }}>VPN Settings (WireGuard)</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Server Endpoint *</label>
                          <input value={form.wireguard_endpoint} onChange={e => setForm({ ...form, wireguard_endpoint: e.target.value })} placeholder="vpn.mysite.com" style={inputStyle} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Port</label>
                          <input type="number" value={form.vpn_port} onChange={e => setForm({ ...form, vpn_port: e.target.value })} style={inputStyle} />
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Server Public Key</label>
                        <input value={form.wireguard_public_key} onChange={e => setForm({ ...form, wireguard_public_key: e.target.value })} style={inputStyle} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>DNS</label>
                          <input value={form.vpn_dns} onChange={e => setForm({ ...form, vpn_dns: e.target.value })} style={inputStyle} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Allowed IPs</label>
                          <input value={form.vpn_allowed_ips} onChange={e => setForm({ ...form, vpn_allowed_ips: e.target.value })} style={inputStyle} />
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Pre-shared Key (optional)</label>
                        <input type="password" value={form.vpn_preshared_key} onChange={e => setForm({ ...form, vpn_preshared_key: e.target.value })} style={inputStyle} />
                      </div>
                    </div>
                  )}

                  {/* Access Control */}
                  <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 10 }}>Access Control</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Token Expiry</label>
                        <select value={form.token_expires_hours} onChange={e => setForm({ ...form, token_expires_hours: e.target.value })} style={inputStyle}>
                          <option value="1">1 hour</option><option value="4">4 hours</option><option value="8">8 hours</option>
                          <option value="12">12 hours</option><option value="24">24 hours</option><option value="168">7 days</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
                      <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={saveConnection} disabled={!form.name || !form.ssid} style={{ ...btnGold, opacity: (!form.name || !form.ssid) ? 0.5 : 1 }}>
                      {editId ? 'Update Profile' : 'Create Profile'}
                    </button>
                    <button onClick={resetForm} style={btnOutline}>Cancel</button>
                  </div>
                </div>

                {/* QR Preview */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 24 }}>
                  <div style={{ fontSize: 11, color: DIM, fontWeight: 600 }}>QR Preview</div>
                  <div style={{ background: '#fff', borderRadius: 8, padding: 8, display: 'inline-block' }}>
                    <canvas ref={qrRef} width={140} height={140} />
                  </div>
                  {form.ssid && <div style={{ fontSize: 10, color: DIM }}>{form.ssid}</div>}
                </div>
              </div>
            </div>
          )}

          {/* Connection Cards */}
          <div style={{ display: 'grid', gap: 12 }}>
            {connections.map(c => (
              <div key={c.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
                      {c.ssid || 'No SSID'} {'\u00B7'} {c.security_type || 'WPA2'} {'\u00B7'} {c.frequency || '5GHz'}
                      {c.vpn_enabled && <span style={{ color: BLUE, marginLeft: 8 }}>{'\uD83D\uDD12'} VPN</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(59,130,246,.12)', color: BLUE }}>
                      {c.active_token_count} active link{c.active_token_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => editConnection(c)} style={btnOutline}>Edit</button>
                  <button onClick={() => { setSendNetwork(c.id); setTab('send'); }} style={{ ...btnOutline, color: GOLD, borderColor: 'rgba(200,150,15,.3)' }}>Send Links</button>
                  <button onClick={() => deleteConnection(c.id)} style={{ ...btnOutline, color: RED, borderColor: 'rgba(239,68,68,.3)' }}>Delete</button>
                </div>
              </div>
            ))}
            {connections.length === 0 && (
              <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: DIM }}>
                No network profiles yet. Click "Add Profile" to create one.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ TAB 2: ACCESS LINKS ═══ */}
      {tab === 'links' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <select value={tokenStatus} onChange={e => setTokenStatus(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="all">All Statuses</option><option value="active">Active</option>
              <option value="expired">Expired</option><option value="revoked">Revoked</option>
            </select>
            <input placeholder="Search by name..." value={tokenSearch} onChange={e => setTokenSearch(e.target.value)} style={{ ...inputStyle, width: 200 }} />
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: DIM }}>{filteredTokens.length} link{filteredTokens.length !== 1 ? 's' : ''}</span>
          </div>

          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {['User', 'Network', 'Label', 'Created', 'Expires', 'Last Used', 'Uses', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: DIM, fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTokens.map(t => {
                  const tl = t.status === 'revoked' ? { text: 'Revoked', status: 'revoked' as const } : timeLeft(t.expires_at);
                  return (
                    <tr key={t.id} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                      <td style={{ padding: '10px 12px', color: TEXT, fontWeight: 600 }}>{t.issued_to_name || '\u2014'}</td>
                      <td style={{ padding: '10px 12px', color: DIM }}>{t.network_connections?.name || '\u2014'}</td>
                      <td style={{ padding: '10px 12px', color: DIM, fontSize: 11 }}>{t.label || '\u2014'}</td>
                      <td style={{ padding: '10px 12px', color: DIM, fontSize: 11 }}>{new Date(t.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: '10px 12px', color: DIM, fontSize: 11 }}>{tl.text}</td>
                      <td style={{ padding: '10px 12px', color: DIM, fontSize: 11 }}>{t.last_used_at ? new Date(t.last_used_at).toLocaleString() : 'Never'}</td>
                      <td style={{ padding: '10px 12px', color: DIM }}>{t.use_count || 0}</td>
                      <td style={{ padding: '10px 12px' }}><StatusBadge status={t.status === 'revoked' ? 'revoked' : tl.status} /></td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => copyLink(t.token)} style={{ ...btnOutline, padding: '4px 8px', fontSize: 11 }}>
                            {copied === t.token ? '\u2713' : '\uD83D\uDCCB'}
                          </button>
                          {t.status === 'active' && new Date(t.expires_at) > new Date() && (
                            <button onClick={() => revokeToken(t.id)} style={{ ...btnOutline, padding: '4px 8px', fontSize: 11, color: RED, borderColor: 'rgba(239,68,68,.3)' }}>{'\uD83D\uDEAB'}</button>
                          )}
                          <button onClick={() => window.open(`/field/network/connect?token=${t.token}`, '_blank')} style={{ ...btnOutline, padding: '4px 8px', fontSize: 11 }}>{'\uD83D\uDD17'}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredTokens.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: DIM }}>No access links found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ TAB 3: SEND TO TEAM ═══ */}
      {tab === 'send' && (
        <div>
          {sendResult ? (
            <div style={cardStyle}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>{'\u2705'}</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: 0 }}>Sent to {sendResult.tokens_created} team member{sendResult.tokens_created !== 1 ? 's' : ''}</h3>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {['Name', 'Expires', 'Link'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: DIM, fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sendResult.links.map(l => {
                    const member = team.find(m => m.id === l.user_id);
                    return (
                      <tr key={l.user_id} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                        <td style={{ padding: '8px 12px', color: TEXT }}>{member ? `${member.first_name} ${member.last_name}` : l.user_id}</td>
                        <td style={{ padding: '8px 12px', color: DIM, fontSize: 11 }}>{new Date(l.expires_at).toLocaleString()}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <button onClick={() => { navigator.clipboard.writeText(l.url); setCopied(l.user_id); setTimeout(() => setCopied(''), 2000); }}
                            style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }}>
                            {copied === l.user_id ? '\u2713 Copied' : 'Copy Link'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => {
                  const allLinks = sendResult.links.map(l => l.url).join('\n');
                  navigator.clipboard.writeText(allLinks);
                }} style={btnOutline}>Copy All Links</button>
                <button onClick={() => { setSendResult(null); setSelectedUsers(new Set()); }} style={btnGold}>Done</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Left: Team Selector */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: TEXT, margin: 0 }}>Select Team Members</h3>
                  <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(200,150,15,.12)', color: GOLD }}>
                    {selectedUsers.size} selected
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                  {[
                    { label: 'All Field', filter: (m: TeamMember) => ['field', 'foreman'].includes(m.role) },
                    { label: 'All Subs', filter: (m: TeamMember) => m.role === 'sub' },
                    { label: 'All PMs', filter: (m: TeamMember) => ['pm', 'admin'].includes(m.role) },
                    { label: 'Select All', filter: () => true },
                  ].map(q => (
                    <button key={q.label} onClick={() => {
                      const ids = team.filter(q.filter).map(m => m.id);
                      setSelectedUsers(new Set([...selectedUsers, ...ids]));
                    }} style={{ ...btnOutline, padding: '4px 10px', fontSize: 10 }}>
                      {q.label}
                    </button>
                  ))}
                  {selectedUsers.size > 0 && (
                    <button onClick={() => setSelectedUsers(new Set())} style={{ ...btnOutline, padding: '4px 10px', fontSize: 10, color: RED }}>Clear</button>
                  )}
                </div>
                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                  {team.map(m => (
                    <label key={m.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: 'pointer',
                      borderRadius: 8, transition: 'all .15s',
                      background: selectedUsers.has(m.id) ? 'rgba(200,150,15,.08)' : 'transparent',
                    }}>
                      <input type="checkbox" checked={selectedUsers.has(m.id)} onChange={e => {
                        const s = new Set(selectedUsers);
                        e.target.checked ? s.add(m.id) : s.delete(m.id);
                        setSelectedUsers(s);
                      }} />
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', background: SURFACE,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, color: GOLD,
                      }}>
                        {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{m.first_name} {m.last_name}</div>
                        <div style={{ fontSize: 11, color: DIM }}>{m.email}</div>
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: 'rgba(139,148,158,.12)', color: DIM, textTransform: 'capitalize' }}>
                        {m.role}
                      </span>
                    </label>
                  ))}
                  {team.length === 0 && (
                    <div style={{ padding: 24, textAlign: 'center', color: DIM, fontSize: 13 }}>No team members found for this project</div>
                  )}
                </div>
              </div>

              {/* Right: Send Settings */}
              <div style={cardStyle}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: TEXT, margin: '0 0 16px' }}>Send Settings</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Network *</label>
                    <select value={sendNetwork} onChange={e => setSendNetwork(e.target.value)} style={inputStyle}>
                      <option value="">Select network...</option>
                      {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.ssid})</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Token Expiry</label>
                    <select value={sendExpiry} onChange={e => setSendExpiry(e.target.value)} style={inputStyle}>
                      <option value="1">1 hour</option><option value="4">4 hours</option><option value="8">8 hours</option>
                      <option value="12">12 hours</option><option value="24">24 hours</option><option value="168">7 days</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: DIM, fontWeight: 600, display: 'block', marginBottom: 4 }}>Message (optional)</label>
                    <textarea value={sendMessage} onChange={e => setSendMessage(e.target.value)} placeholder="Here's your WiFi access for tomorrow's shift" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <button onClick={sendLinks} disabled={!sendNetwork || selectedUsers.size === 0 || sending}
                    style={{ ...btnGold, opacity: (!sendNetwork || selectedUsers.size === 0 || sending) ? 0.5 : 1, marginTop: 8 }}>
                    {sending ? 'Sending...' : `Send Access Links (${selectedUsers.size})`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB 4: ACCESS LOG ═══ */}
      {tab === 'log' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <select value={logRange} onChange={e => { setLogRange(e.target.value); }} style={{ ...inputStyle, width: 'auto' }}>
              <option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
            <select value={logEvent} onChange={e => setLogEvent(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="all">All Events</option><option value="viewed">Viewed</option>
              <option value="connected">Connected</option><option value="expired">Expired</option>
              <option value="revoked">Revoked</option><option value="error">Error</option>
            </select>
            <div style={{ flex: 1 }} />
            <button onClick={exportCsv} style={btnOutline}>{'\uD83D\uDCE5'} Export CSV</button>
            <span style={{ fontSize: 12, color: DIM }}>{filteredLogs.length} entries</span>
          </div>

          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {['Time', 'User', 'Event', 'IP Address', 'Platform'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: DIM, fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(l => (
                  <tr key={l.id} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                    <td style={{ padding: '10px 12px', color: DIM, fontSize: 11 }}>{new Date(l.created_at).toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', color: TEXT, fontWeight: 600 }}>{l.user_name || '\u2014'}</td>
                    <td style={{ padding: '10px 12px' }}><StatusBadge status={l.event_type} /></td>
                    <td style={{ padding: '10px 12px', color: DIM, fontFamily: 'monospace', fontSize: 11 }}>{l.ip_address}</td>
                    <td style={{ padding: '10px 12px', color: DIM }}><PlatformIcon platform={l.platform} /> {l.platform}</td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: DIM }}>No access logs found for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
