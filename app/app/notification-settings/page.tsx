'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';

/* ── palette ── */
const GOLD   = '#D4A017';
const BG     = '#07101C';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';
const PURPLE = '#8B5CF6';

/* ── types ── */
type Channel = 'in-app' | 'email' | 'push';
type Frequency = 'instant' | 'hourly' | 'daily' | 'weekly';

interface TogglePref {
  enabled: boolean;
}

interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
}

interface ModuleDef {
  module: string;
  icon: string;
  events: string[];
}

interface Preferences {
  globalEnabled: boolean;
  channels: Record<Channel, Record<string, TogglePref>>;
  frequency: Frequency;
  quietHours: QuietHours;
}

/* ── event types applied to every module ── */
const STANDARD_EVENTS = [
  'Created',
  'Updated',
  'Due Soon',
  'Overdue',
  'Assigned to Me',
  'Mentioned',
  'Approved',
  'Rejected',
];

/* ── module definitions ── */
const MODULE_DEFS: ModuleDef[] = [
  { module: 'RFIs',           icon: '❓', events: [...STANDARD_EVENTS] },
  { module: 'Submittals',     icon: '📦', events: [...STANDARD_EVENTS] },
  { module: 'Daily Logs',     icon: '📋', events: [...STANDARD_EVENTS] },
  { module: 'Change Orders',  icon: '🔄', events: [...STANDARD_EVENTS] },
  { module: 'Pay Apps',       icon: '💰', events: [...STANDARD_EVENTS] },
  { module: 'Schedule',       icon: '📅', events: [...STANDARD_EVENTS] },
  { module: 'Safety',         icon: '🦺', events: [...STANDARD_EVENTS] },
  { module: 'Documents',      icon: '📁', events: [...STANDARD_EVENTS] },
  { module: 'Budget',         icon: '📊', events: [...STANDARD_EVENTS] },
  { module: 'Punch List',     icon: '✅', events: [...STANDARD_EVENTS] },
  { module: 'Inspections',    icon: '🔍', events: [...STANDARD_EVENTS] },
  { module: 'Contracts',      icon: '📜', events: [...STANDARD_EVENTS] },
];

const CHANNELS: { key: Channel; label: string; icon: string }[] = [
  { key: 'in-app', label: 'In-App',  icon: '🔔' },
  { key: 'email',  label: 'Email',   icon: '✉️' },
  { key: 'push',   label: 'Push',    icon: '📲' },
];

const FREQUENCIES: { key: Frequency; label: string; desc: string }[] = [
  { key: 'instant', label: 'Instant',         desc: 'Get notified immediately when events occur' },
  { key: 'hourly',  label: 'Hourly Digest',   desc: 'Receive a summary every hour' },
  { key: 'daily',   label: 'Daily Digest',    desc: 'One summary email per day at 8 AM' },
  { key: 'weekly',  label: 'Weekly Summary',  desc: 'Weekly roundup every Monday morning' },
];

/* ── helpers ── */
function eventKey(mod: string, ev: string): string {
  return `${mod}::${ev}`;
}

function buildAllEventKeys(): string[] {
  const keys: string[] = [];
  for (const m of MODULE_DEFS) {
    for (const e of m.events) {
      keys.push(eventKey(m.module, e));
    }
  }
  return keys;
}

function buildDefaultPrefs(): Preferences {
  const channels: Preferences['channels'] = {} as Preferences['channels'];
  for (const ch of CHANNELS) {
    const map: Record<string, TogglePref> = {};
    for (const m of MODULE_DEFS) {
      for (const e of m.events) {
        map[eventKey(m.module, e)] = { enabled: true };
      }
    }
    channels[ch.key] = map;
  }
  return {
    globalEnabled: true,
    channels,
    frequency: 'instant',
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
  };
}

/* ── component ── */
export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<Preferences>(buildDefaultPrefs);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const [resetting, setResetting] = useState(false);

  const allEventKeys = useMemo(() => buildAllEventKeys(), []);

  /* ── load preferences ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const res = await fetch('/api/notification-preferences');
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        const data = await res.json();
        if (!cancelled && data && data.channels) {
          setPrefs(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load preferences';
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── derived counts ── */
  const channelCounts = useMemo(() => {
    const counts: Record<Channel, { enabled: number; total: number }> = {} as any;
    for (const ch of CHANNELS) {
      const map = prefs.channels[ch.key];
      let enabled = 0;
      for (const k of allEventKeys) {
        if (map?.[k]?.enabled) enabled++;
      }
      counts[ch.key] = { enabled, total: allEventKeys.length };
    }
    return counts;
  }, [prefs, allEventKeys]);

  const totalEnabled = useMemo(() => {
    let total = 0;
    for (const ch of CHANNELS) {
      total += channelCounts[ch.key].enabled;
    }
    return total;
  }, [channelCounts]);

  const totalPossible = allEventKeys.length * CHANNELS.length;

  /* ── filtered modules ── */
  const filteredModules = useMemo(() => {
    if (!searchFilter.trim()) return MODULE_DEFS;
    const q = searchFilter.toLowerCase();
    return MODULE_DEFS.filter(m =>
      m.module.toLowerCase().includes(q) ||
      m.events.some(e => e.toLowerCase().includes(q))
    );
  }, [searchFilter]);

  /* ── handlers ── */
  const toggleEvent = useCallback((channel: Channel, mod: string, ev: string) => {
    const k = eventKey(mod, ev);
    setPrefs(prev => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channel]: {
          ...prev.channels[channel],
          [k]: { enabled: !prev.channels[channel][k]?.enabled },
        },
      },
    }));
  }, []);

  const toggleGlobal = useCallback(() => {
    setPrefs(prev => {
      const newEnabled = !prev.globalEnabled;
      if (!newEnabled) {
        const channels = { ...prev.channels };
        for (const ch of CHANNELS) {
          const map = { ...channels[ch.key] };
          for (const k of allEventKeys) {
            map[k] = { enabled: false };
          }
          channels[ch.key] = map;
        }
        return { ...prev, globalEnabled: false, channels };
      }
      const channels = { ...prev.channels };
      for (const ch of CHANNELS) {
        const map = { ...channels[ch.key] };
        for (const k of allEventKeys) {
          map[k] = { enabled: true };
        }
        channels[ch.key] = map;
      }
      return { ...prev, globalEnabled: true, channels };
    });
  }, [allEventKeys]);

  const toggleModuleExpand = useCallback((mod: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod); else next.add(mod);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedModules(new Set(MODULE_DEFS.map(m => m.module)));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedModules(new Set());
  }, []);

  const toggleAllForModule = useCallback((mod: string, channel: Channel) => {
    setPrefs(prev => {
      const chMap = { ...prev.channels[channel] };
      const modDef = MODULE_DEFS.find(m => m.module === mod);
      if (!modDef) return prev;
      const allOn = modDef.events.every(e => chMap[eventKey(mod, e)]?.enabled);
      for (const e of modDef.events) {
        chMap[eventKey(mod, e)] = { enabled: !allOn };
      }
      return { ...prev, channels: { ...prev.channels, [channel]: chMap } };
    });
  }, []);

  const toggleAllForChannel = useCallback((channel: Channel) => {
    setPrefs(prev => {
      const chMap = { ...prev.channels[channel] };
      const allOn = allEventKeys.every(k => chMap[k]?.enabled);
      for (const k of allEventKeys) {
        chMap[k] = { enabled: !allOn };
      }
      return { ...prev, channels: { ...prev.channels, [channel]: chMap } };
    });
  }, [allEventKeys]);

  const setFrequency = useCallback((f: Frequency) => {
    setPrefs(prev => ({ ...prev, frequency: f }));
  }, []);

  const setQuietHours = useCallback((patch: Partial<QuietHours>) => {
    setPrefs(prev => ({ ...prev, quietHours: { ...prev.quietHours, ...patch } }));
  }, []);

  const resetToDefaults = useCallback(async () => {
    setResetting(true);
    const defaults = buildDefaultPrefs();
    setPrefs(defaults);
    try {
      await fetch('/api/notification-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaults),
      });
    } catch {
      /* best-effort */
    }
    setResetting(false);
  }, []);

  const savePrefs = useCallback(async () => {
    setSaving(true);
    setSaveSuccess(false);
    setSaveError(null);
    try {
      const res = await fetch('/api/notification-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error(`Save failed with status ${res.status}`);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      setSaveError(msg);
      setTimeout(() => setSaveError(null), 5000);
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  /* ── styles ── */
  const s = {
    page: {
      minHeight: '100vh',
      background: BG,
      color: TEXT,
      padding: '32px 40px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    } as React.CSSProperties,
    header: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 28,
      flexWrap: 'wrap' as const,
      gap: 16,
    } as React.CSSProperties,
    title: {
      fontSize: 26,
      fontWeight: 700,
      color: TEXT,
      margin: 0,
    } as React.CSSProperties,
    subtitle: {
      fontSize: 14,
      color: DIM,
      marginTop: 4,
    } as React.CSSProperties,
    card: {
      background: RAISED,
      border: `1px solid ${BORDER}`,
      borderRadius: 10,
      padding: '20px 24px',
      marginBottom: 20,
    } as React.CSSProperties,
    sectionTitle: {
      fontSize: 16,
      fontWeight: 600,
      color: GOLD,
      marginBottom: 14,
      margin: 0,
    } as React.CSSProperties,
    toggle: (on: boolean) => ({
      width: 44,
      height: 24,
      borderRadius: 12,
      cursor: 'pointer',
      border: 'none',
      background: on ? GREEN : '#374151',
      position: 'relative' as const,
      transition: 'background 0.2s ease',
      flexShrink: 0,
      outline: 'none',
    }) as React.CSSProperties,
    toggleDot: (on: boolean) => ({
      width: 18,
      height: 18,
      borderRadius: '50%',
      background: '#fff',
      position: 'absolute' as const,
      top: 3,
      left: on ? 23 : 3,
      transition: 'left 0.2s ease',
      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    }) as React.CSSProperties,
    btn: (variant: 'gold' | 'outline' | 'red' | 'blue' | 'green' | 'amber') => {
      const map: Record<string, { bg: string; fg: string; bdr: string }> = {
        gold:    { bg: GOLD,        fg: '#000',  bdr: 'none' },
        outline: { bg: 'transparent', fg: DIM,   bdr: `1px solid ${BORDER}` },
        red:     { bg: RED,         fg: '#fff',  bdr: 'none' },
        blue:    { bg: BLUE,        fg: '#fff',  bdr: 'none' },
        green:   { bg: GREEN,       fg: '#fff',  bdr: 'none' },
        amber:   { bg: AMBER,       fg: '#000',  bdr: 'none' },
      };
      const v = map[variant] || map.outline;
      return {
        padding: '8px 18px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        background: v.bg,
        color: v.fg,
        border: v.bdr,
        transition: 'opacity 0.2s',
        whiteSpace: 'nowrap' as const,
      } as React.CSSProperties;
    },
    badge: (color: string) => ({
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 600,
      background: color + '22',
      color: color,
    }) as React.CSSProperties,
    moduleHeader: (expanded: boolean) => ({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 14px',
      cursor: 'pointer',
      borderRadius: 6,
      background: expanded ? `${BORDER}30` : 'transparent',
      transition: 'background 0.15s',
      userSelect: 'none' as const,
    }) as React.CSSProperties,
    eventRow: {
      display: 'grid',
      gridTemplateColumns: '1fr 60px 60px 60px',
      alignItems: 'center',
      padding: '8px 14px 8px 44px',
      borderBottom: `1px solid ${BORDER}20`,
      gap: 8,
    } as React.CSSProperties,
    channelHeader: {
      display: 'grid',
      gridTemplateColumns: '1fr 60px 60px 60px',
      alignItems: 'center',
      padding: '8px 14px 8px 44px',
      gap: 8,
      borderBottom: `2px solid ${BORDER}`,
      marginBottom: 4,
    } as React.CSSProperties,
    input: {
      background: RAISED,
      color: TEXT,
      border: `1px solid ${BORDER}`,
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 13,
      outline: 'none',
    } as React.CSSProperties,
    searchInput: {
      background: BG,
      color: TEXT,
      border: `1px solid ${BORDER}`,
      borderRadius: 6,
      padding: '8px 14px',
      fontSize: 13,
      outline: 'none',
      width: 260,
    } as React.CSSProperties,
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
      gap: 16,
      marginBottom: 24,
    } as React.CSSProperties,
    statCard: {
      background: RAISED,
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      padding: '16px 18px',
      textAlign: 'center' as const,
    } as React.CSSProperties,
    statValue: {
      fontSize: 24,
      fontWeight: 700,
    } as React.CSSProperties,
    statLabel: {
      fontSize: 11,
      color: DIM,
      textTransform: 'uppercase' as const,
      letterSpacing: 1,
      marginTop: 4,
    } as React.CSSProperties,
    errorBanner: {
      background: `${RED}18`,
      border: `1px solid ${RED}`,
      borderRadius: 8,
      padding: '12px 18px',
      marginBottom: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    } as React.CSSProperties,
    successBanner: {
      background: `${GREEN}18`,
      border: `1px solid ${GREEN}`,
      borderRadius: 8,
      padding: '12px 18px',
      marginBottom: 20,
      color: GREEN,
      fontSize: 14,
      fontWeight: 600,
    } as React.CSSProperties,
  };

  /* ── Toggle component ── */
  function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
    return (
      <button
        style={{
          ...s.toggle(on && !disabled),
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        onClick={disabled ? undefined : onToggle}
        aria-label={on ? 'Enabled' : 'Disabled'}
        type="button"
      >
        <div style={s.toggleDot(on && !disabled)} />
      </button>
    );
  }

  /* ── loading state ── */
  if (loading) {
    return (
      <div style={{
        ...s.page,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48,
            height: 48,
            border: `3px solid ${BORDER}`,
            borderTopColor: GOLD,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ color: DIM, fontSize: 15 }}>Loading notification preferences...</div>
        </div>
      </div>
    );
  }

  /* ── main render ── */
  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Notification Preferences</h1>
          <div style={s.subtitle}>
            Configure how and when you receive notifications for each module and event type.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            style={{
              ...s.btn('outline'),
              color: RED,
              borderColor: RED,
              opacity: resetting ? 0.6 : 1,
            }}
            onClick={resetToDefaults}
            disabled={resetting}
            type="button"
          >
            {resetting ? 'Resetting...' : 'Reset to Defaults'}
          </button>
          <button
            style={{ ...s.btn('gold'), opacity: saving ? 0.6 : 1 }}
            onClick={savePrefs}
            disabled={saving}
            type="button"
          >
            {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Preferences'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={s.errorBanner}>
          <span style={{ color: RED, fontSize: 14 }}>
            Failed to load preferences: {error}. Using defaults.
          </span>
          <button
            style={{ ...s.btn('outline'), padding: '4px 12px', fontSize: 12 }}
            onClick={() => setError(null)}
            type="button"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Save error banner */}
      {saveError && (
        <div style={s.errorBanner}>
          <span style={{ color: RED, fontSize: 14 }}>Save error: {saveError}</span>
          <button
            style={{ ...s.btn('outline'), padding: '4px 12px', fontSize: 12 }}
            onClick={() => setSaveError(null)}
            type="button"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Save success banner */}
      {saveSuccess && (
        <div style={s.successBanner}>
          Preferences saved successfully.
        </div>
      )}

      {/* Stats overview */}
      <div style={s.statsGrid}>
        <div style={s.statCard}>
          <div style={{ ...s.statValue, color: prefs.globalEnabled ? GREEN : RED }}>
            {prefs.globalEnabled ? 'ON' : 'OFF'}
          </div>
          <div style={s.statLabel}>Global Status</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statValue, color: GOLD }}>{totalEnabled}</div>
          <div style={s.statLabel}>Active / {totalPossible}</div>
        </div>
        {CHANNELS.map(ch => (
          <div key={ch.key} style={s.statCard}>
            <div style={{ ...s.statValue, color: BLUE }}>
              {channelCounts[ch.key].enabled}
            </div>
            <div style={s.statLabel}>{ch.label} Active</div>
          </div>
        ))}
        <div style={s.statCard}>
          <div style={{
            ...s.statValue,
            color: prefs.quietHours.enabled ? AMBER : DIM,
          }}>
            {prefs.quietHours.enabled ? 'ON' : 'OFF'}
          </div>
          <div style={s.statLabel}>Quiet Hours</div>
        </div>
      </div>

      {/* Global toggle */}
      <div style={{
        ...s.card,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
            Global Notifications
          </div>
          <div style={{ fontSize: 13, color: DIM }}>
            {prefs.globalEnabled
              ? 'All notifications are enabled. Toggle individual events below.'
              : 'All notifications are currently disabled. Enable to start receiving alerts.'}
          </div>
        </div>
        <Toggle on={prefs.globalEnabled} onToggle={toggleGlobal} />
      </div>

      {/* Frequency selector */}
      <div style={s.card}>
        <h3 style={{ ...s.sectionTitle, marginBottom: 14 }}>Delivery Frequency</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: 12,
        }}>
          {FREQUENCIES.map(f => {
            const active = prefs.frequency === f.key;
            return (
              <div
                key={f.key}
                onClick={() => setFrequency(f.key)}
                style={{
                  padding: '14px 18px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: `2px solid ${active ? GOLD : BORDER}`,
                  background: active ? `${GOLD}15` : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: active ? GOLD : TEXT,
                  marginBottom: 4,
                }}>
                  {f.label}
                </div>
                <div style={{ fontSize: 12, color: DIM }}>{f.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quiet Hours */}
      <div style={s.card}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: prefs.quietHours.enabled ? 16 : 0,
        }}>
          <div>
            <h3 style={{ ...s.sectionTitle, marginBottom: 2 }}>Quiet Hours</h3>
            <div style={{ fontSize: 12, color: DIM }}>
              Notifications received during quiet hours will be queued and delivered when quiet hours end.
            </div>
          </div>
          <Toggle
            on={prefs.quietHours.enabled}
            onToggle={() => setQuietHours({ enabled: !prefs.quietHours.enabled })}
          />
        </div>
        {prefs.quietHours.enabled && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            flexWrap: 'wrap',
            padding: '14px 16px',
            background: BG,
            borderRadius: 8,
            border: `1px solid ${BORDER}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: DIM, fontWeight: 500 }}>Start</span>
              <input
                type="time"
                value={prefs.quietHours.start}
                onChange={e => setQuietHours({ start: e.target.value })}
                style={s.input}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: DIM, fontWeight: 500 }}>End</span>
              <input
                type="time"
                value={prefs.quietHours.end}
                onChange={e => setQuietHours({ end: e.target.value })}
                style={s.input}
              />
            </div>
            <span style={{ fontSize: 12, color: AMBER, fontStyle: 'italic' }}>
              {prefs.quietHours.start} &ndash; {prefs.quietHours.end}
            </span>
          </div>
        )}
      </div>

      {/* Module notification matrix */}
      <div style={s.card}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <h3 style={{ ...s.sectionTitle, marginBottom: 0 }}>
            Module Notification Matrix
          </h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search modules or events..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              style={s.searchInput}
            />
            <button
              style={{ ...s.btn('outline'), padding: '6px 14px', fontSize: 12 }}
              onClick={expandAll}
              type="button"
            >
              Expand All
            </button>
            <button
              style={{ ...s.btn('outline'), padding: '6px 14px', fontSize: 12 }}
              onClick={collapseAll}
              type="button"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Channel column toggles */}
        <div style={{
          display: 'flex',
          gap: 8,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}>
          {CHANNELS.map(ch => {
            const allOn = allEventKeys.every(k => prefs.channels[ch.key][k]?.enabled);
            return (
              <button
                key={ch.key}
                style={{
                  ...s.btn(allOn ? 'green' : 'outline'),
                  padding: '6px 14px',
                  fontSize: 12,
                }}
                onClick={() => toggleAllForChannel(ch.key)}
                type="button"
              >
                {ch.icon} {allOn ? `Disable All ${ch.label}` : `Enable All ${ch.label}`}
              </button>
            );
          })}
        </div>

        {/* Column headers */}
        <div style={s.channelHeader}>
          <span style={{ fontSize: 12, fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: 1 }}>
            Event
          </span>
          {CHANNELS.map(ch => (
            <span
              key={ch.key}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: GOLD,
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {ch.icon}
            </span>
          ))}
        </div>

        {/* Module rows */}
        {filteredModules.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: 32,
            color: DIM,
            fontSize: 14,
          }}>
            No modules match &quot;{searchFilter}&quot;
          </div>
        )}

        {filteredModules.map(m => {
          const expanded = expandedModules.has(m.module);
          const moduleEnabledCounts: Record<Channel, number> = {} as any;
          for (const ch of CHANNELS) {
            moduleEnabledCounts[ch.key] = m.events.filter(
              e => prefs.channels[ch.key][eventKey(m.module, e)]?.enabled
            ).length;
          }
          const totalModuleEnabled = CHANNELS.reduce(
            (sum, ch) => sum + moduleEnabledCounts[ch.key], 0
          );
          const totalModulePossible = m.events.length * CHANNELS.length;

          return (
            <div
              key={m.module}
              style={{
                borderBottom: `1px solid ${BORDER}40`,
                marginBottom: 2,
              }}
            >
              {/* Module header row */}
              <div
                style={s.moduleHeader(expanded)}
                onClick={() => toggleModuleExpand(m.module)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                    display: 'inline-block',
                    fontSize: 12,
                    color: DIM,
                  }}>
                    &#9654;
                  </span>
                  <span style={{ fontSize: 18 }}>{m.icon}</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{m.module}</span>
                  <span style={s.badge(
                    totalModuleEnabled === totalModulePossible
                      ? GREEN
                      : totalModuleEnabled > 0
                      ? AMBER
                      : RED
                  )}>
                    {totalModuleEnabled}/{totalModulePossible}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {CHANNELS.map(ch => {
                    const allOn = m.events.every(
                      e => prefs.channels[ch.key][eventKey(m.module, e)]?.enabled
                    );
                    return (
                      <button
                        key={ch.key}
                        onClick={e => {
                          e.stopPropagation();
                          toggleAllForModule(m.module, ch.key);
                        }}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: `1px solid ${allOn ? GREEN : BORDER}`,
                          background: allOn ? `${GREEN}22` : 'transparent',
                          color: allOn ? GREEN : DIM,
                          fontSize: 12,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title={`Toggle all ${ch.label} for ${m.module}`}
                        type="button"
                      >
                        {allOn ? '✓' : '−'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Expanded event rows */}
              {expanded && m.events.map(ev => (
                <div key={ev} style={s.eventRow}>
                  <span style={{
                    fontSize: 13,
                    color: CHANNELS.some(
                      ch => prefs.channels[ch.key][eventKey(m.module, ev)]?.enabled
                    ) ? TEXT : DIM,
                  }}>
                    {ev}
                  </span>
                  {CHANNELS.map(ch => {
                    const k = eventKey(m.module, ev);
                    const on = prefs.channels[ch.key][k]?.enabled ?? false;
                    return (
                      <div
                        key={ch.key}
                        style={{
                          display: 'flex',
                          justifyContent: 'center',
                        }}
                      >
                        <Toggle
                          on={on}
                          onToggle={() => toggleEvent(ch.key, m.module, ev)}
                          disabled={!prefs.globalEnabled}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Bottom action bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        background: RAISED,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        position: 'sticky',
        bottom: 16,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ fontSize: 13, color: DIM }}>
          <span style={{ color: GOLD, fontWeight: 600 }}>{totalEnabled}</span> of{' '}
          <span style={{ fontWeight: 600 }}>{totalPossible}</span> notifications enabled
          {prefs.quietHours.enabled && (
            <span style={{ marginLeft: 12, color: AMBER }}>
              Quiet hours: {prefs.quietHours.start} &ndash; {prefs.quietHours.end}
            </span>
          )}
          {!prefs.globalEnabled && (
            <span style={{ marginLeft: 12, color: RED, fontWeight: 600 }}>
              (All notifications disabled)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            style={{
              ...s.btn('outline'),
              color: RED,
              borderColor: RED,
              opacity: resetting ? 0.6 : 1,
            }}
            onClick={resetToDefaults}
            disabled={resetting}
            type="button"
          >
            {resetting ? 'Resetting...' : 'Reset to Defaults'}
          </button>
          <button
            style={{ ...s.btn('gold'), opacity: saving ? 0.6 : 1 }}
            onClick={savePrefs}
            disabled={saving}
            type="button"
          >
            {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}
