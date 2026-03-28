'use client';

import { useState, useEffect, useCallback } from 'react';
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

interface FirewallRule {
  id: string;
  network_project_id: string;
  rule_number: number;
  name: string;
  action: string;
  direction: string;
  source_network: string;
  source_port: string;
  destination_network: string;
  destination_port: string;
  protocol: string;
  category: string;
  enabled: boolean;
  logging: boolean;
  description: string;
  created_at: string;
}

const CATEGORIES = ['all', 'internet', 'inter-vlan', 'guest', 'voip', 'cameras', 'management'];

const ACTION_STYLES: Record<string, { bg: string; text: string }> = {
  allow: { bg: `${GREEN}20`, text: GREEN },
  deny: { bg: `${RED}20`, text: RED },
  drop: { bg: '#6B728020', text: '#9CA3AF' },
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: BASE, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  color: DIM, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4,
};

export default function FirewallRulesPage() {
  const { projectId } = useParams() as { projectId: string };
  const [networkProjectId, setNetworkProjectId] = useState('');
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');

  const emptyForm = {
    name: '', action: 'allow', direction: 'inbound', source_network: 'any', source_port: 'any',
    destination_network: 'any', destination_port: '', protocol: 'tcp', category: 'internet',
    logging: true, description: '',
  };
  const [form, setForm] = useState(emptyForm);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const npRes = await fetch(`/api/network/projects?projectId=${projectId}`);
      const npData = await npRes.json();
      if (!npData.networkProject) { setLoading(false); return; }
      setNetworkProjectId(npData.networkProject.id);
      const res = await fetch(`/api/network/firewall?networkProjectId=${npData.networkProject.id}`);
      const data = await res.json();
      setRules((data.rules || []).sort((a: FirewallRule, b: FirewallRule) => a.rule_number - b.rule_number));
    } catch { /* */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async () => {
    if (!form.name || !networkProjectId) return;
    setSaving(true);
    try {
      const nextRuleNum = rules.length > 0 ? Math.max(...rules.map(r => r.rule_number)) + 10 : 100;
      const res = await fetch('/api/network/firewall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, rule_number: nextRuleNum, network_project_id: networkProjectId, enabled: true }),
      });
      if (res.ok) {
        setForm(emptyForm);
        setShowForm(false);
        fetchData();
      }
    } catch { /* */ }
    setSaving(false);
  };

  const toggleEnabled = async (rule: FirewallRule) => {
    try {
      await fetch(`/api/network/firewall/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      fetchData();
    } catch { /* */ }
  };

  const moveRule = async (rule: FirewallRule, direction: 'up' | 'down') => {
    const idx = rules.findIndex(r => r.id === rule.id);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === rules.length - 1)) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const swapRule = rules[swapIdx];
    try {
      await Promise.all([
        fetch(`/api/network/firewall/${rule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rule_number: swapRule.rule_number }),
        }),
        fetch(`/api/network/firewall/${swapRule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rule_number: rule.rule_number }),
        }),
      ]);
      fetchData();
    } catch { /* */ }
  };

  const filteredRules = activeCategory === 'all' ? rules : rules.filter(r => r.category === activeCategory);

  const cardStyle: React.CSSProperties = {
    background: `${CARD}cc`, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20,
  };

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div style={{ color: DIM }}>Loading firewall rules...</div></div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/app/projects/${projectId}/network`} style={{ color: DIM, fontSize: 12, textDecoration: 'none' }}>Network &gt;</Link>
        <span style={{ color: TEXT, fontSize: 12, marginLeft: 4 }}>Firewall</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ color: TEXT, fontSize: 22, fontWeight: 700, margin: 0 }}>Firewall Rules</h1>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '10px 18px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`, color: '#000',
          border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}>
          {showForm ? 'Cancel' : '+ Add Rule'}
        </button>
      </div>

      {/* Add Rule Form */}
      {showForm && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ color: TEXT, fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>Add Firewall Rule</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>Rule Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Allow HTTPS Out" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Action</label>
              <select value={form.action} onChange={e => setForm({ ...form, action: e.target.value })} style={inputStyle}>
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
                <option value="drop">Drop</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Direction</label>
              <select value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })} style={inputStyle}>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Source Network</label>
              <input value={form.source_network} onChange={e => setForm({ ...form, source_network: e.target.value })} placeholder="any / 192.168.10.0/24" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Source Port</label>
              <input value={form.source_port} onChange={e => setForm({ ...form, source_port: e.target.value })} placeholder="any" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Dest Network</label>
              <input value={form.destination_network} onChange={e => setForm({ ...form, destination_network: e.target.value })} placeholder="any / 10.0.0.0/8" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Dest Port</label>
              <input value={form.destination_port} onChange={e => setForm({ ...form, destination_port: e.target.value })} placeholder="443, 80" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Protocol</label>
              <select value={form.protocol} onChange={e => setForm({ ...form, protocol: e.target.value })} style={inputStyle}>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="icmp">ICMP</option>
                <option value="any">Any</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inputStyle}>
                {CATEGORIES.filter(c => c !== 'all').map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1).replace('-', ' ')}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: TEXT, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.logging} onChange={e => setForm({ ...form, logging: e.target.checked })} />
                Enable Logging
              </label>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <button onClick={handleSubmit} disabled={saving || !form.name} style={{
            marginTop: 16, padding: '10px 24px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`,
            color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            opacity: saving || !form.name ? 0.5 : 1,
          }}>
            {saving ? 'Saving...' : 'Add Rule'}
          </button>
        </div>
      )}

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '6px 14px', border: `1px solid ${activeCategory === cat ? GOLD : BORDER}`,
              borderRadius: 8, background: activeCategory === cat ? `${GOLD}15` : 'transparent',
              color: activeCategory === cat ? GOLD : DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {cat.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* Rules List */}
      <div style={{ ...cardStyle }}>
        {filteredRules.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: DIM, fontSize: 13 }}>No firewall rules found.</div>
        ) : (
          filteredRules.map((rule, idx) => {
            const as = ACTION_STYLES[rule.action] || ACTION_STYLES.allow;
            return (
              <div
                key={rule.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  background: !rule.enabled ? 'rgba(255,255,255,0.02)' : 'transparent',
                  opacity: rule.enabled ? 1 : 0.5,
                  borderBottom: idx < filteredRules.length - 1 ? `1px solid ${BORDER}` : 'none',
                }}
              >
                {/* Reorder buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button onClick={() => moveRule(rule, 'up')} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }}>&#9650;</button>
                  <button onClick={() => moveRule(rule, 'down')} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }}>&#9660;</button>
                </div>

                {/* Rule Number */}
                <div style={{ color: DIM, fontSize: 12, fontFamily: 'monospace', fontWeight: 700, width: 40, textAlign: 'center' }}>
                  #{rule.rule_number}
                </div>

                {/* Action Badge */}
                <span style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 700,
                  background: as.bg, color: as.text, textTransform: 'uppercase', width: 60, textAlign: 'center',
                }}>{rule.action}</span>

                {/* Name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{rule.name}</div>
                  <div style={{ color: DIM, fontSize: 11, marginTop: 2 }}>
                    {rule.source_network}:{rule.source_port || '*'} → {rule.destination_network}:{rule.destination_port || '*'} ({rule.protocol.toUpperCase()})
                  </div>
                </div>

                {/* Category */}
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.05)',
                  color: DIM, textTransform: 'capitalize', fontWeight: 600,
                }}>{rule.category}</span>

                {/* Logging */}
                {rule.logging && <span style={{ fontSize: 10, color: DIM }}>LOG</span>}

                {/* Enabled Toggle */}
                <button
                  onClick={() => toggleEnabled(rule)}
                  style={{
                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: rule.enabled ? GREEN : '#374151', position: 'relative', transition: 'background .2s',
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3, left: rule.enabled ? 21 : 3, transition: 'left .2s',
                  }} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}