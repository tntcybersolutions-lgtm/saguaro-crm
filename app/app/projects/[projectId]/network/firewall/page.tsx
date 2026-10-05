'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck, CheckCircle, Prohibit, ClipboardText, Plus, X,
  CaretUp, CaretDown, CaretRight,
} from '@phosphor-icons/react';
import {
  PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, FlowStrip,
  goldButtonStyle, ghostButtonStyle,
} from '@/components/ui/premium';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';

const BASE = 'var(--bg-surface-2)';
const GOLD = 'var(--brand-primary)';
const GREEN = '#2CFF7A';
const RED = '#FF3B30';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = 'var(--text-secondary)';
const TEXT = 'var(--text-primary)';

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

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All', internet: 'Internet', 'inter-vlan': 'Inter-VLAN', guest: 'Guest',
  voip: 'VoIP', cameras: 'Cameras', management: 'Management',
};
const categoryLabel = (c: string) => CATEGORY_LABELS[c] || c;

const ACTION_STYLES: Record<string, { bg: string; text: string }> = {
  allow: { bg: `${GREEN}20`, text: GREEN },
  deny: { bg: `${RED}20`, text: RED },
  drop: { bg: '#6B728020', text: 'var(--status-closed)' },
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

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `network-firewall:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSubmit(),
  });

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

  // Dead-space kill (spec 4.1): an empty policy opens straight into the
  // add-rule composer. One-shot per visit so Cancel stays cancelled.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!loading && networkProjectId && rules.length === 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setShowForm(true);
    }
  }, [loading, networkProjectId, rules.length]);

  const handleSubmit = async (): Promise<boolean> => {
    if (!form.name || !networkProjectId) return false;
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
        guard.clearDraft();
        setSaving(false);
        return true;
      }
    } catch { /* */ }
    setSaving(false);
    return false;
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

  // Derived KPIs (presentation-only; computed from existing state)
  const enabledCount = rules.filter(r => r.enabled).length;
  const blockingCount = rules.filter(r => r.action !== 'allow').length;
  const loggingCount = rules.filter(r => r.logging).length;

  if (loading) {
    return (
      <PremiumSurface maxWidth={2200}>
        <ModuleSkeleton kpis={4} rows={5} />
      </PremiumSurface>
    );
  }

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <Link href={`/app/projects/${projectId}/network`} style={{ color: DIM, fontSize: 12, textDecoration: 'none' }}>Network</Link>
        <CaretRight size={11} weight="bold" color="rgba(255,255,255,0.4)" />
        <span style={{ color: TEXT, fontSize: 12, fontWeight: 600 }}>Firewall</span>
      </div>

      {/* Header */}
      <ModuleHero
        eyebrow="Network"
        eyebrowIcon={<ShieldCheck size={13} weight="fill" color={GOLD} />}
        title="Firewall"
        accent="Rules"
        subtitle="Define, order, and toggle the packet-filtering policy."
        actions={
          <button onClick={() => setShowForm(!showForm)} style={showForm ? ghostButtonStyle : goldButtonStyle} className="pmBtn">
            {showForm ? <><X size={15} weight="bold" /> Cancel</> : <><Plus size={15} weight="bold" /> Add Rule</>}
          </button>
        }
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard
          icon={<ShieldCheck size={19} weight="duotone" color={GOLD} />}
          label="Total Rules" value={String(rules.length)} accent={GOLD}
          sub="Across all categories" delay={0.02}
         href={`/app/projects/${projectId}/network/firewall`}/>
        <StatCard
          icon={<CheckCircle size={19} weight="duotone" color={GREEN} />}
          label="Enabled" value={String(enabledCount)} accent={enabledCount ? GREEN : undefined}
          sub={`${rules.length - enabledCount} disabled`} delay={0.06}
         href={`/app/projects/${projectId}/network/firewall`}/>
        <StatCard
          icon={<Prohibit size={19} weight="duotone" color={RED} />}
          label="Blocking" value={String(blockingCount)} accent={blockingCount ? RED : undefined}
          sub="Deny / drop" delay={0.10}
         href={`/app/projects/${projectId}/network/firewall`}/>
        <StatCard
          icon={<ClipboardText size={19} weight="duotone" color={GOLD} />}
          label="Logging" value={String(loggingCount)}
          sub="Rules logged" delay={0.14}
         href={`/app/projects/${projectId}/network/firewall`}/>
      </div>

      {/* Add Rule Form */}
      {showForm && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Add Firewall Rule" icon={<Plus size={17} weight="bold" color={GOLD} />}>
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
                  {CATEGORIES.filter(c => c !== 'all').map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
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
            <button onClick={handleSubmit} disabled={saving || !form.name} className="pmBtn" style={{
              ...goldButtonStyle, marginTop: 16, opacity: saving || !form.name ? 0.5 : 1,
              cursor: saving || !form.name ? 'not-allowed' : 'pointer',
            }}>
              {saving ? 'Saving…' : <><Plus size={15} weight="bold" /> Add Rule</>}
            </button>
          </SectionCard>
        </div>
      )}

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '6px 14px', border: `1px solid ${activeCategory === cat ? 'color-mix(in srgb, var(--brand-primary) 45%, transparent)' : BORDER}`,
              borderRadius: 999, background: activeCategory === cat ? 'var(--brand-primary-12)' : 'rgba(255,255,255,0.03)',
              color: activeCategory === cat ? GOLD : DIM, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            {categoryLabel(cat)}
          </button>
        ))}
      </div>

      {/* Rules List */}
      <SectionCard
        title="Firewall Rules"
        icon={<ShieldCheck size={17} weight="duotone" color={GOLD} />}
        action={<span style={{ fontSize: 12, fontWeight: 700, color: DIM }}>{filteredRules.length} {filteredRules.length === 1 ? 'rule' : 'rules'}</span>}
        flush
      >
        {filteredRules.length === 0 ? (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>
                <ShieldCheck size={16} weight="duotone" color={GOLD} style={{ marginRight: 7, verticalAlign: 'text-bottom' }} />
                {rules.length === 0 ? 'No firewall rules yet' : 'No rules in this category'}
                <span style={{ fontWeight: 400, color: DIM }}>
                  {rules.length === 0
                    ? (showForm ? ' — define the first rule in the form above; numbering spaces by 10 automatically.' : ' — add the first rule to start the packet-filtering policy.')
                    : ' — try a different category, or add a rule to this one.'}
                </span>
              </div>
              {!showForm && (
                <button onClick={() => setShowForm(true)} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Add Rule</button>
              )}
            </div>
            {rules.length === 0 && (
              <FlowStrip steps={[
                { title: 'Add Rules', desc: 'Numbered in steps of 10' },
                { title: 'Order Matters', desc: 'Reorder with the arrows' },
                { title: 'Toggle Without Deleting', desc: 'Disable to test' },
                { title: 'Policy Exports', desc: 'Into the as-built docs' },
              ]} />
            )}
          </div>
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
                  borderBottom: idx < filteredRules.length - 1 ? `1px solid rgba(255,255,255,0.06)` : 'none',
                }}
              >
                {/* Reorder buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button onClick={() => moveRule(rule, 'up')} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 0, lineHeight: 1, display: 'flex' }}><CaretUp size={12} weight="bold" /></button>
                  <button onClick={() => moveRule(rule, 'down')} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 0, lineHeight: 1, display: 'flex' }}><CaretDown size={12} weight="bold" /></button>
                </div>

                {/* Rule Number */}
                <div style={{ color: DIM, fontSize: 12, fontFamily: 'monospace', fontWeight: 700, width: 40, textAlign: 'center' }}>
                  #{rule.rule_number}
                </div>

                {/* Action Badge */}
                <span style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 700,
                  background: as.bg, color: as.text, textTransform: 'capitalize', width: 60, textAlign: 'center',
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
                  fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.06)',
                  color: DIM, fontWeight: 600,
                }}>{categoryLabel(rule.category)}</span>

                {/* Logging */}
                {rule.logging && <span style={{ fontSize: 10, color: DIM }}>Log</span>}

                {/* Enabled Toggle */}
                <button
                  onClick={() => toggleEnabled(rule)}
                  style={{
                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: rule.enabled ? GREEN : 'rgba(255,255,255,0.18)', position: 'relative', transition: 'background .2s',
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', background: 'var(--text-primary)',
                    position: 'absolute', top: 3, left: rule.enabled ? 21 : 3, transition: 'left .2s',
                  }} />
                </button>
              </div>
            );
          })
        )}
      </SectionCard>
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
