'use client';
/**
 * Network › Firewall — the packet-filtering policy in rule order. Rules are
 * numbered in steps of 10, reordered with the arrows, and switched on/off
 * without deleting.
 *
 * Reads  GET   /api/network/projects?projectId=  →  GET /api/network/firewall?networkProjectId=
 * Writes POST  /api/network/firewall              (new rule, next number = max + 10, or 100)
 *        PATCH /api/network/firewall/:id          { enabled } | { rule_number } (swap on move)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  PageShell, StatRow, Badge, Button, Tabs, DataTable, EmptyState, Select, Field, Input, Textarea,
  FormGrid, FormModal, Toast, useToast,
  type Column, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { ShieldCheck, CheckCircle, Prohibit, ClipboardText, Plus, CaretUp, CaretDown, Power, WarningCircle } from '@phosphor-icons/react';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import NetworkTabs, { networkCrumbs, NetworkNotSetUp } from '../_components/NetworkTabs';

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

const ACTION_TONE: Record<string, BadgeTone> = { allow: 'ongoing', deny: 'overdue', drop: 'closed' };
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const mono: React.CSSProperties = { fontFamily: 'var(--font-mono, monospace)' };

/** On/off switch drawn from tokens; role="switch" so it reads as a toggle. */
function EnabledSwitch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      style={{
        width: 40, height: 22, borderRadius: 11, border: '1px solid var(--border-default)', cursor: 'pointer', padding: 0,
        background: on ? 'var(--success)' : 'var(--bg-surface-2)', position: 'relative', transition: 'background .2s', flexShrink: 0,
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: '50%', background: 'var(--text-primary)',
        position: 'absolute', top: 2, left: on ? 20 : 2, transition: 'left .2s',
      }} />
    </button>
  );
}

export default function FirewallRulesPage() {
  const { projectId } = useParams() as { projectId: string };
  const { ctx } = useProjectContext(projectId);
  const { toast, show } = useToast();
  const [networkProjectId, setNetworkProjectId] = useState('');
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const emptyForm = {
    name: '', action: 'allow', direction: 'inbound', source_network: 'any', source_port: 'any',
    destination_network: 'any', destination_port: '', protocol: 'tcp', category: 'internet',
    logging: true, description: '',
  };
  const [form, setForm] = useState(emptyForm);

  /* Unsaved-work guard: the composer holds real typing, so leaving the page
   * confirms first and the draft is kept on this device either way. */
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
    setLoadError('');
    try {
      const npRes = await fetch(`/api/network/projects?projectId=${projectId}`);
      const npData = await npRes.json();
      if (!npData.networkProject) { setLoading(false); return; }
      setNetworkProjectId(npData.networkProject.id);
      const res = await fetch(`/api/network/firewall?networkProjectId=${npData.networkProject.id}`);
      const data = await res.json();
      setRules((data.rules || []).sort((a: FirewallRule, b: FirewallRule) => a.rule_number - b.rule_number));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load firewall rules");
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // An empty policy opens straight into the add-rule form. One-shot per visit
  // so Cancel stays cancelled.
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
    setFormError('');
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
        show('Rule added');
        return true;
      }
      const j = await res.json().catch(() => ({}));
      setFormError(j.error || "Couldn't add the rule.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't add the rule.");
    }
    setSaving(false);
    return false;
  };

  const toggleEnabled = async (rule: FirewallRule) => {
    try {
      const res = await fetch(`/api/network/firewall/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (!res.ok) show("Couldn't change the rule", 'bad');
      fetchData();
    } catch {
      show("Couldn't change the rule", 'bad');
    }
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
    } catch {
      show("Couldn't reorder the rules", 'bad');
    }
  };

  const filteredRules = activeCategory === 'all' ? rules : rules.filter(r => r.category === activeCategory);

  const enabledCount = rules.filter(r => r.enabled).length;
  const blockingCount = rules.filter(r => r.action !== 'allow').length;
  const loggingCount = rules.filter(r => r.logging).length;

  const stats: StatItem[] = [
    { label: 'Total rules', value: loading ? '—' : String(rules.length), sub: 'Across all categories', icon: <ShieldCheck size={15} />, onClick: () => setActiveCategory('all'), active: activeCategory === 'all' },
    { label: 'Enabled', value: loading ? '—' : String(enabledCount), sub: loading ? undefined : `${rules.length - enabledCount} disabled`, tone: enabledCount ? 'good' : 'default', icon: <CheckCircle size={15} /> },
    { label: 'Blocking', value: loading ? '—' : String(blockingCount), sub: 'Deny / drop', icon: <Prohibit size={15} /> },
    { label: 'Logging', value: loading ? '—' : String(loggingCount), sub: 'Rules logged', icon: <ClipboardText size={15} /> },
  ];

  const position = (r: FirewallRule) => rules.findIndex(x => x.id === r.id);

  const columns: Column<FirewallRule>[] = [
    { key: 'order', header: 'Order', width: 76, sortable: false, groupable: false, phone: 'hide', render: (r) => (
      <span style={{ display: 'inline-flex', gap: 2 }} onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="sm" icon={<CaretUp size={13} weight="bold" />} aria-label={`Move ${r.name} up`} title="Move up" disabled={position(r) === 0} onClick={() => moveRule(r, 'up')} />
        <Button variant="ghost" size="sm" icon={<CaretDown size={13} weight="bold" />} aria-label={`Move ${r.name} down`} title="Move down" disabled={position(r) === rules.length - 1} onClick={() => moveRule(r, 'down')} />
      </span>
    ) },
    { key: 'rule_number', header: '#', width: 70, groupable: false, render: (r) => <span style={mono}>#{r.rule_number}</span> },
    { key: 'action', header: 'Action', phone: 'show', accessor: (r) => cap(r.action), render: (r) => <Badge tone={ACTION_TONE[r.action] || 'neutral'}>{cap(r.action)}</Badge> },
    { key: 'name', header: 'Rule', primary: true, phone: 'show', render: (r) => (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span>{r.name}</span>
        <span style={{ ...mono, fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>
          {r.source_network}:{r.source_port || '*'} → {r.destination_network}:{r.destination_port || '*'} ({(r.protocol || '').toUpperCase()})
        </span>
      </span>
    ) },
    { key: 'direction', header: 'Direction', hidden: true, accessor: (r) => cap(r.direction) },
    { key: 'category', header: 'Category', accessor: (r) => categoryLabel(r.category), render: (r) => <Badge>{categoryLabel(r.category)}</Badge> },
    { key: 'logging', header: 'Logging', accessor: (r) => (r.logging ? 'Log' : ''), render: (r) => (r.logging ? 'Log' : null) },
    { key: 'enabled', header: 'Enabled', align: 'center', phone: 'show', accessor: (r) => (r.enabled ? 'On' : 'Off'), render: (r) => (
      <EnabledSwitch on={r.enabled} onToggle={() => toggleEnabled(r)} label={`${r.enabled ? 'Disable' : 'Enable'} ${r.name}`} />
    ) },
  ];

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm({ ...form, [k]: v });
  const openForm = () => { setFormError(''); setShowForm(true); };

  if (!loading && !loadError && !networkProjectId) {
    return (
      <PageShell crumbs={networkCrumbs(projectId, ctx?.project?.name, 'Firewall')} title="Firewall rules" subtitle={ctx?.project?.name || undefined}>
        <NetworkTabs projectId={projectId} value="firewall" />
        <NetworkNotSetUp projectId={projectId} />
      </PageShell>
    );
  }

  return (
    <PageShell
      crumbs={networkCrumbs(projectId, ctx?.project?.name, 'Firewall')}
      title="Firewall rules"
      subtitle={ctx?.project?.name || undefined}
      actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openForm}>Add rule</Button>}
    >
      <NetworkTabs projectId={projectId} value="firewall" />
      {!loadError && <StatRow items={stats} />}

      {!loadError && rules.length > 0 && (
        <Tabs
          tabs={CATEGORIES.map(c => ({ key: c, label: categoryLabel(c), count: c === 'all' ? rules.length : rules.filter(r => r.category === c).length }))}
          value={activeCategory}
          onChange={setActiveCategory}
        />
      )}

      {loadError ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load firewall rules" text={loadError} action={<Button onClick={fetchData}>Try again</Button>} />
      ) : (
        <DataTable<FirewallRule>
          tableId="project-network-firewall"
          exportName="firewall-rules"
          columns={columns}
          rows={filteredRules}
          loading={loading}
          rowKey={(r) => r.id}
          defaultSort={{ key: 'rule_number', dir: 'asc' }}
          rowStyle={(r) => (r.enabled ? undefined : { opacity: 0.55 })}
          rowActions={(r) => [
            { label: 'Move up', icon: <CaretUp size={14} />, disabled: position(r) === 0, onClick: () => moveRule(r, 'up') },
            { label: 'Move down', icon: <CaretDown size={14} />, disabled: position(r) === rules.length - 1, onClick: () => moveRule(r, 'down') },
            { label: r.enabled ? 'Disable rule' : 'Enable rule', icon: <Power size={14} />, onClick: () => toggleEnabled(r) },
          ]}
          empty={
            rules.length === 0 ? (
              <EmptyState icon={<ShieldCheck size={22} />} title="No firewall rules yet"
                action={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openForm}>Add rule</Button>} />
            ) : (
              <EmptyState title="No rules in this category"
                action={<Button onClick={() => setActiveCategory('all')}>Show all rules</Button>} />
            )
          }
        />
      )}

      <FormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Add firewall rule"
        onSubmit={async () => { await handleSubmit(); }}
        submitLabel="Add rule"
        busy={saving}
        error={formError}
      >
        <FormGrid cols={3}>
          <Field label="Rule name" required>
            <Input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Allow HTTPS Out" />
          </Field>
          <Field label="Action">
            <Select value={form.action} onChange={e => set('action', e.target.value)} options={[{ value: 'allow', label: 'Allow' }, { value: 'deny', label: 'Deny' }, { value: 'drop', label: 'Drop' }]} />
          </Field>
          <Field label="Direction">
            <Select value={form.direction} onChange={e => set('direction', e.target.value)} options={[{ value: 'inbound', label: 'Inbound' }, { value: 'outbound', label: 'Outbound' }, { value: 'both', label: 'Both' }]} />
          </Field>
          <Field label="Source network">
            <Input value={form.source_network} onChange={e => set('source_network', e.target.value)} placeholder="any / 192.168.10.0/24" />
          </Field>
          <Field label="Source port">
            <Input value={form.source_port} onChange={e => set('source_port', e.target.value)} placeholder="any" />
          </Field>
          <Field label="Protocol">
            <Select value={form.protocol} onChange={e => set('protocol', e.target.value)} options={[{ value: 'tcp', label: 'TCP' }, { value: 'udp', label: 'UDP' }, { value: 'icmp', label: 'ICMP' }, { value: 'any', label: 'Any' }]} />
          </Field>
          <Field label="Dest network">
            <Input value={form.destination_network} onChange={e => set('destination_network', e.target.value)} placeholder="any / 10.0.0.0/8" />
          </Field>
          <Field label="Dest port">
            <Input value={form.destination_port} onChange={e => set('destination_port', e.target.value)} placeholder="443, 80" />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={e => set('category', e.target.value)} options={CATEGORIES.filter(c => c !== 'all').map(c => ({ value: c, label: categoryLabel(c) }))} />
          </Field>
          <Field label="Description" span>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
          </Field>
          <label className="k-span-all" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer', minHeight: 44 }}>
            <input type="checkbox" checked={form.logging} onChange={e => set('logging', e.target.checked)} />
            Enable logging
          </label>
        </FormGrid>
      </FormModal>

      <UnsavedGuardModal guard={guard} />
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
