'use client';
/**
 * Saguaro Field — Punch List
 * Create, view, and update punch list items. Offline queue.
 * Enhanced: Batch ops, assignee notifications, advanced filters, statistics.
 */
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';
const PURPLE = '#A855F7';

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const STATUSES   = ['open', 'in_progress', 'ready_to_inspect', 'complete'];
const STATUS_LABELS: Record<string, string> = { open: 'Open', in_progress: 'In Progress', ready_to_inspect: 'Ready to Inspect', complete: 'Complete' };
const PRIORITY_COLORS: Record<string, string> = { Critical: RED, High: AMBER, Medium: BLUE, Low: DIM };
const STATUS_COLORS: Record<string, string>   = { open: RED, in_progress: AMBER, ready_to_inspect: BLUE, complete: GREEN };

const TRADES = ['General Contractor', 'Concrete', 'Framing / Carpentry', 'Roofing', 'Electrical', 'Plumbing', 'HVAC', 'Drywall', 'Painting', 'Flooring', 'Tile', 'Landscaping', 'Other'];

interface PunchItem {
  id: string;
  description: string;
  location: string;
  trade: string;
  priority: string;
  status: string;
  due_date?: string;
  notes?: string;
  created_at: string;
  photo_urls?: string[];
  assignee?: string;
}

interface FilterPreset {
  name: string;
  statuses: string[];
  priorities: string[];
  trades: string[];
  assignee: string;
  dateField: string;
  dateFrom: string;
  dateTo: string;
}

type View = 'list' | 'new' | 'detail';

/* ─── Confirmation Dialog ─── */
function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.65)' }}>
      <div style={{ background: '#0D1D2E', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', maxWidth: 340, width: '90%' }}>
        <p style={{ margin: '0 0 20px', fontSize: 15, color: TEXT, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px', color: DIM, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, background: RED, border: 'none', borderRadius: 10, padding: '12px', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Assignee Picker Dialog ─── */
function AssigneePickerDialog({ assignees, onSelect, onCancel }: { assignees: string[]; onSelect: (a: string) => void; onCancel: () => void }) {
  const [custom, setCustom] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.65)' }}>
      <div style={{ background: '#0D1D2E', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', maxWidth: 380, width: '90%', maxHeight: '70vh', overflow: 'auto' }}>
        <p style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: TEXT }}>Reassign To</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {assignees.map((a) => (
            <button key={a} onClick={() => onSelect(a)} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', color: TEXT, fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>{a}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Or type a name..." style={{ ...inp, flex: 1 }} />
          <button onClick={() => { if (custom.trim()) onSelect(custom.trim()); }} disabled={!custom.trim()} style={{ background: custom.trim() ? GOLD : BORDER, border: 'none', borderRadius: 10, padding: '10px 16px', color: custom.trim() ? '#000' : DIM, fontWeight: 700, fontSize: 13, cursor: custom.trim() ? 'pointer' : 'default' }}>Assign</button>
        </div>
        <button onClick={onCancel} style={{ width: '100%', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px', color: DIM, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}

/* ─── Priority Picker Dialog ─── */
function PriorityPickerDialog({ onSelect, onCancel }: { onSelect: (p: string) => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.65)' }}>
      <div style={{ background: '#0D1D2E', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', maxWidth: 300, width: '90%' }}>
        <p style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: TEXT }}>Change Priority</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {PRIORITIES.map((p) => (
            <button key={p} onClick={() => onSelect(p)} style={{ background: 'transparent', border: `1px solid ${PRIORITY_COLORS[p] || BORDER}`, borderRadius: 10, padding: '12px 14px', color: PRIORITY_COLORS[p] || TEXT, fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>{p}</button>
          ))}
        </div>
        <button onClick={onCancel} style={{ width: '100%', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px', color: DIM, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}

/* ─── Notification Toast ─── */
function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', zIndex: 10000, background: GREEN, borderRadius: 10, padding: '10px 20px', color: '#000', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,.4)' }}>
      {message}
    </div>
  );
}

/* ─── Statistics Panel ─── */
function StatsPanel({ items }: { items: PunchItem[] }) {
  const [open, setOpen] = useState(false);
  const total = items.length;
  if (total === 0) return null;

  const openItems = items.filter((i) => i.status !== 'complete');
  const closedItems = items.filter((i) => i.status === 'complete');
  const openPct = total > 0 ? Math.round((openItems.length / total) * 100) : 0;

  // By priority
  const byPriority: Record<string, number> = {};
  openItems.forEach((i) => { byPriority[i.priority] = (byPriority[i.priority] || 0) + 1; });

  // By trade
  const byTrade: Record<string, number> = {};
  openItems.forEach((i) => { byTrade[i.trade] = (byTrade[i.trade] || 0) + 1; });
  const tradeEntries = Object.entries(byTrade).sort((a, b) => b[1] - a[1]);

  // Average age of open items (days)
  const now = new Date();
  const avgAgeDays = openItems.length > 0
    ? Math.round(openItems.reduce((sum, i) => sum + (now.getTime() - new Date(i.created_at).getTime()) / 86400000, 0) / openItems.length)
    : 0;

  // Overdue count
  const overdueCount = openItems.filter((i) => i.due_date && new Date(i.due_date) < now).length;

  return (
    <div style={{ marginBottom: 14 }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Statistics</span>
        <span style={{ color: DIM, fontSize: 18, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>›</span>
      </button>
      {open && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '14px' }}>
          {/* Pie chart - CSS conic gradient */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
              background: `conic-gradient(${RED} 0deg ${openPct * 3.6}deg, ${GREEN} ${openPct * 3.6}deg 360deg)`,
            }} />
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 14, color: RED, fontWeight: 700 }}>{openItems.length} Open ({openPct}%)</p>
              <p style={{ margin: 0, fontSize: 14, color: GREEN, fontWeight: 700 }}>{closedItems.length} Closed ({100 - openPct}%)</p>
            </div>
          </div>

          {/* Priority breakdown */}
          <p style={{ ...secLbl, marginBottom: 6 }}>By Priority (Open)</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {PRIORITIES.map((p) => byPriority[p] ? (
              <div key={p} style={{ background: `rgba(${hexRgb(PRIORITY_COLORS[p])}, .12)`, border: `1px solid rgba(${hexRgb(PRIORITY_COLORS[p])}, .3)`, borderRadius: 8, padding: '6px 12px' }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: PRIORITY_COLORS[p] }}>{byPriority[p]}</span>
                <span style={{ fontSize: 11, color: PRIORITY_COLORS[p], marginLeft: 5 }}>{p}</span>
              </div>
            ) : null)}
          </div>

          {/* Trade breakdown */}
          {tradeEntries.length > 0 && (
            <>
              <p style={{ ...secLbl, marginBottom: 6 }}>By Trade (Open)</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                {tradeEntries.slice(0, 6).map(([t, count]) => {
                  const pct = Math.round((count / openItems.length) * 100);
                  return (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ fontSize: 12, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>
                          <span style={{ fontSize: 12, color: DIM, flexShrink: 0, marginLeft: 6 }}>{count}</span>
                        </div>
                        <div style={{ height: 4, background: BORDER, borderRadius: 2 }}>
                          <div style={{ height: 4, background: GOLD, borderRadius: 2, width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Metrics row */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, background: `rgba(${hexRgb(BLUE)}, .08)`, border: `1px solid rgba(${hexRgb(BLUE)}, .2)`, borderRadius: 10, padding: '10px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: BLUE }}>{avgAgeDays}</p>
              <p style={{ margin: 0, fontSize: 10, color: DIM, textTransform: 'uppercase' }}>Avg Days Open</p>
            </div>
            <div style={{ flex: 1, background: `rgba(${hexRgb(overdueCount > 0 ? RED : GREEN)}, .08)`, border: `1px solid rgba(${hexRgb(overdueCount > 0 ? RED : GREEN)}, .2)`, borderRadius: 10, padding: '10px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: overdueCount > 0 ? RED : GREEN }}>{overdueCount}</p>
              <p style={{ margin: 0, fontSize: 10, color: DIM, textTransform: 'uppercase' }}>Overdue</p>
            </div>
            <div style={{ flex: 1, background: `rgba(${hexRgb(GOLD)}, .08)`, border: `1px solid rgba(${hexRgb(GOLD)}, .2)`, borderRadius: 10, padding: '10px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: GOLD }}>{total}</p>
              <p style={{ margin: 0, fontSize: 10, color: DIM, textTransform: 'uppercase' }}>Total Items</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Advanced Filter Panel ─── */
function AdvancedFilterPanel({
  show, onClose,
  filterStatuses, setFilterStatuses,
  filterPriorities, setFilterPriorities,
  filterTrades, setFilterTrades,
  filterAssignee, setFilterAssignee,
  filterDateField, setFilterDateField,
  filterDateFrom, setFilterDateFrom,
  filterDateTo, setFilterDateTo,
  assignees,
  onSavePreset,
  savedPresets,
  onLoadPreset,
  onDeletePreset,
  onClearAll,
}: {
  show: boolean; onClose: () => void;
  filterStatuses: string[]; setFilterStatuses: (v: string[]) => void;
  filterPriorities: string[]; setFilterPriorities: (v: string[]) => void;
  filterTrades: string[]; setFilterTrades: (v: string[]) => void;
  filterAssignee: string; setFilterAssignee: (v: string) => void;
  filterDateField: string; setFilterDateField: (v: string) => void;
  filterDateFrom: string; setFilterDateFrom: (v: string) => void;
  filterDateTo: string; setFilterDateTo: (v: string) => void;
  assignees: string[];
  onSavePreset: (name: string) => void;
  savedPresets: FilterPreset[];
  onLoadPreset: (p: FilterPreset) => void;
  onDeletePreset: (name: string) => void;
  onClearAll: () => void;
}) {
  const [presetName, setPresetName] = useState('');
  const [showSave, setShowSave] = useState(false);

  if (!show) return null;

  const toggleInList = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  const chipStyle = (active: boolean, color: string = GOLD): React.CSSProperties => ({
    background: active ? `rgba(${hexRgb(color)}, .2)` : 'transparent',
    border: `1px solid ${active ? color : BORDER}`,
    borderRadius: 20, padding: '5px 12px',
    color: active ? color : DIM,
    fontSize: 12, fontWeight: active ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', flexDirection: 'column', background: '#070E18' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: `1px solid ${BORDER}` }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT }}>Advanced Filters</h3>
        <button onClick={onClose} style={{ background: GOLD, border: 'none', borderRadius: 10, padding: '8px 18px', color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Apply</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {/* Saved Presets */}
        {savedPresets.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={secLbl}>Saved Presets</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {savedPresets.map((p) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <button onClick={() => onLoadPreset(p)} style={{ ...chipStyle(false, PURPLE), borderRadius: '20px 0 0 20px', borderRight: 'none' }}>{p.name}</button>
                  <button onClick={() => onDeletePreset(p.name)} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: '0 20px 20px 0', padding: '5px 8px', color: RED, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>x</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status multi-select */}
        <p style={secLbl}>Status</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => toggleInList(filterStatuses, s, setFilterStatuses)} style={chipStyle(filterStatuses.includes(s), STATUS_COLORS[s])}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Priority multi-select */}
        <p style={secLbl}>Priority</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {PRIORITIES.map((p) => (
            <button key={p} onClick={() => toggleInList(filterPriorities, p, setFilterPriorities)} style={chipStyle(filterPriorities.includes(p), PRIORITY_COLORS[p])}>
              {p}
            </button>
          ))}
        </div>

        {/* Trade multi-select */}
        <p style={secLbl}>Trade</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {TRADES.map((t) => (
            <button key={t} onClick={() => toggleInList(filterTrades, t, setFilterTrades)} style={chipStyle(filterTrades.includes(t))}>
              {t}
            </button>
          ))}
        </div>

        {/* Assignee */}
        <p style={secLbl}>Assignee</p>
        <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} style={{ ...inp, marginBottom: 16 }}>
          <option value="" style={{ background: '#0D1D2E' }}>All Assignees</option>
          {assignees.map((a) => <option key={a} value={a} style={{ background: '#0D1D2E' }}>{a}</option>)}
        </select>

        {/* Date range */}
        <p style={secLbl}>Date Range</p>
        <select value={filterDateField} onChange={(e) => setFilterDateField(e.target.value)} style={{ ...inp, marginBottom: 8 }}>
          <option value="" style={{ background: '#0D1D2E' }}>No Date Filter</option>
          <option value="created_at" style={{ background: '#0D1D2E' }}>Created Date</option>
          <option value="due_date" style={{ background: '#0D1D2E' }}>Due Date</option>
        </select>
        {filterDateField && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: DIM }}>From</label>
              <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: DIM }}>To</label>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={inp} />
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={onClearAll} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px', color: DIM, fontSize: 13, cursor: 'pointer' }}>Clear All</button>
          <button onClick={() => setShowSave(!showSave)} style={{ flex: 1, background: 'transparent', border: `1px solid ${GOLD}`, borderRadius: 10, padding: '12px', color: GOLD, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save Preset</button>
        </div>
        {showSave && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name..." style={{ ...inp, flex: 1 }} />
            <button onClick={() => { if (presetName.trim()) { onSavePreset(presetName.trim()); setPresetName(''); setShowSave(false); } }} style={{ background: GOLD, border: 'none', borderRadius: 10, padding: '10px 16px', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════ MAIN COMPONENT ════════════════════════════════ */

function PunchListPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [view, setView]       = useState<View>('list');
  const [items, setItems]     = useState<PunchItem[]>([]);
  const [selected, setSelected] = useState<PunchItem | null>(null);
  const [filter, setFilter]   = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [online, setOnline]   = useState(true);
  const [projectName, setProjectName] = useState('');

  // New item form
  const [desc, setDesc]         = useState('');
  const [location, setLocation] = useState('');
  const [trade, setTrade]       = useState('General Contractor');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate]   = useState('');
  const [notes, setNotes]       = useState('');
  const [assignee, setAssignee] = useState('');

  // Photo attachment
  const photoRef = useRef<HTMLInputElement>(null);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);

  // Batch/Bulk operations
  const [selectMode, setSelectMode]     = useState(false);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm]   = useState<{ message: string; action: () => void } | null>(null);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);

  // Toast
  const [toast, setToast] = useState('');

  // Advanced filters
  const [showAdvFilter, setShowAdvFilter] = useState(false);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterPriorities, setFilterPriorities] = useState<string[]>([]);
  const [filterTrades, setFilterTrades] = useState<string[]>([]);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterDateField, setFilterDateField] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [savedPresets, setSavedPresets] = useState<FilterPreset[]>([]);
  const [advancedActive, setAdvancedActive] = useState(false);

  // Gather unique assignees from items
  const uniqueAssignees = Array.from(new Set(items.map((i) => i.assignee).filter(Boolean) as string[]));

  // Load saved presets from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`punch-filter-presets-${projectId}`);
      if (raw) setSavedPresets(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [projectId]);

  const savePresetsToStorage = (presets: FilterPreset[]) => {
    setSavedPresets(presets);
    try { localStorage.setItem(`punch-filter-presets-${projectId}`, JSON.stringify(presets)); } catch { /* ignore */ }
  };

  const handleSavePreset = (name: string) => {
    const preset: FilterPreset = { name, statuses: filterStatuses, priorities: filterPriorities, trades: filterTrades, assignee: filterAssignee, dateField: filterDateField, dateFrom: filterDateFrom, dateTo: filterDateTo };
    const updated = [...savedPresets.filter((p) => p.name !== name), preset];
    savePresetsToStorage(updated);
  };

  const handleLoadPreset = (p: FilterPreset) => {
    setFilterStatuses(p.statuses); setFilterPriorities(p.priorities); setFilterTrades(p.trades);
    setFilterAssignee(p.assignee); setFilterDateField(p.dateField); setFilterDateFrom(p.dateFrom); setFilterDateTo(p.dateTo);
    setAdvancedActive(true);
    setFilter('advanced');
  };

  const handleDeletePreset = (name: string) => {
    savePresetsToStorage(savedPresets.filter((p) => p.name !== name));
  };

  const clearAdvancedFilters = () => {
    setFilterStatuses([]); setFilterPriorities([]); setFilterTrades([]);
    setFilterAssignee(''); setFilterDateField(''); setFilterDateFrom(''); setFilterDateTo('');
    setAdvancedActive(false);
    setFilter('all');
  };

  const applyAdvancedFilter = useCallback(() => {
    const hasAny = filterStatuses.length > 0 || filterPriorities.length > 0 || filterTrades.length > 0 || !!filterAssignee || !!filterDateField;
    setAdvancedActive(hasAny);
    if (hasAny) setFilter('advanced');
    else if (filter === 'advanced') setFilter('all');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatuses, filterPriorities, filterTrades, filterAssignee, filterDateField, filterDateFrom, filterDateTo]);

  // Quick preset helpers
  const applyQuickPreset = (preset: string) => {
    clearAdvancedFilters();
    const today = new Date().toISOString().split('T')[0];
    switch (preset) {
      case 'my-items':
        // Filter by current user - use assignee if available
        setFilterAssignee('me');
        setAdvancedActive(true);
        setFilter('advanced');
        break;
      case 'overdue': {
        setFilterStatuses(['open', 'in_progress', 'ready_to_inspect']);
        setFilterDateField('due_date');
        setFilterDateTo(today);
        setAdvancedActive(true);
        setFilter('advanced');
        break;
      }
      case 'created-today':
        setFilterDateField('created_at');
        setFilterDateFrom(today);
        setFilterDateTo(today);
        setAdvancedActive(true);
        setFilter('advanced');
        break;
      case 'high-priority':
        setFilterPriorities(['Critical', 'High']);
        setAdvancedActive(true);
        setFilter('advanced');
        break;
    }
  };

  // Send notification helper
  const sendNotification = async (recipientAssignee: string, message: string) => {
    try {
      await fetch(`/api/projects/${projectId}/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee: recipientAssignee, message }),
      });
      setToast(`Notification sent to ${recipientAssignee}`);
    } catch {
      // Enqueue for offline
      await enqueue({ url: `/api/projects/${projectId}/notifications`, method: 'POST', body: JSON.stringify({ assignee: recipientAssignee, message }), contentType: 'application/json', isFormData: false });
      setToast(`Notification queued for ${recipientAssignee}`);
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotoPreviews((prev) => [...prev, String(ev.target?.result || '')]);
        setPhotoFiles((prev) => [...prev, file]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removePhoto = (idx: number) => {
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
    setPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadPhotos = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of photoFiles) {
      try {
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('category', 'Punch');
        fd.append('caption', desc.trim().slice(0, 80));
        if (projectId) fd.append('projectId', projectId);
        const res = await fetch('/api/photos/upload', { method: 'POST', body: fd });
        if (res.ok) {
          const data = await res.json();
          urls.push(String(data.photo?.url || ''));
        }
      } catch { /* skip failed uploads */ }
    }
    return urls;
  };

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    fetch('/api/projects/list')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId); if (p) setProjectName(p.name); })
      .catch(() => {});
    loadItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/punch-list`);
      const d = await r.json();
      setItems(d.items || d.data || []);
    } catch { /* offline */ }
    setLoading(false);
  };

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim()) return;
    setSaving(true);

    // Upload photos first if online
    let photoUrls: string[] = [];
    if (photoFiles.length > 0 && online) {
      photoUrls = await uploadPhotos();
    }

    const payload = {
      projectId,
      description: desc.trim(),
      location: location.trim(),
      trade,
      priority,
      due_date: dueDate || null,
      notes: [notes.trim(), photoUrls.length ? `Photos: ${photoUrls.join(', ')}` : ''].filter(Boolean).join('\n'),
      status: 'open',
      photo_urls: photoUrls,
      assignee: assignee.trim() || null,
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/punch-list/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');

      // Send notification to assignee
      if (assignee.trim()) {
        await sendNotification(assignee.trim(), `New punch item assigned to you: "${desc.trim().slice(0, 60)}"`);
      }

      await loadItems();
      resetForm();
      setView('list');
    } catch {
      await enqueue({ url: '/api/punch-list/create', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });

      // Queue notification for assignee
      if (assignee.trim()) {
        await sendNotification(assignee.trim(), `New punch item assigned to you: "${desc.trim().slice(0, 60)}"`);
      }

      setItems((prev) => [{
        id: `local-${Date.now()}`,
        description: desc.trim(), location: location.trim(), trade, priority, status: 'open',
        due_date: dueDate || undefined, notes: notes.trim(), created_at: new Date().toISOString(),
        photo_urls: photoPreviews, assignee: assignee.trim() || undefined,
      }, ...prev]);
      resetForm();
      setView('list');
    }
    setSaving(false);
  };

  const updateStatus = async (item: PunchItem, newStatus: string) => {
    const optimistic = items.map((i) => i.id === item.id ? { ...i, status: newStatus } : i);
    setItems(optimistic);
    setSelected((prev) => prev ? { ...prev, status: newStatus } : null);

    try {
      if (!online) throw new Error('offline');
      await fetch(`/api/punch-list/${item.id}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      await enqueue({ url: `/api/punch-list/${item.id}/complete`, method: 'PATCH', body: JSON.stringify({ status: newStatus }), contentType: 'application/json', isFormData: false });
    }
  };

  const resetForm = () => { setDesc(''); setLocation(''); setTrade('General Contractor'); setPriority('Medium'); setDueDate(''); setNotes(''); setPhotoPreviews([]); setPhotoFiles([]); setAssignee(''); };

  /* ── Batch operations ── */
  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => { setSelectedIds(new Set(filtered.map((i) => i.id))); };
  const deselectAll = () => { setSelectedIds(new Set()); };

  const batchClose = async () => {
    setBatchBusy(true);
    const ids = Array.from(selectedIds);
    // Optimistic update
    setItems((prev) => prev.map((i) => ids.includes(i.id) ? { ...i, status: 'complete' } : i));
    try {
      if (!online) throw new Error('offline');
      await fetch(`/api/projects/${projectId}/punch-list/batch`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, update: { status: 'complete' } }),
      });
    } catch {
      await enqueue({ url: `/api/projects/${projectId}/punch-list/batch`, method: 'PATCH', body: JSON.stringify({ ids, update: { status: 'complete' } }), contentType: 'application/json', isFormData: false });
    }
    setSelectedIds(new Set());
    setSelectMode(false);
    setBatchBusy(false);
    setToast(`${ids.length} item(s) closed`);
  };

  const batchReassign = async (newAssignee: string) => {
    setBatchBusy(true);
    const ids = Array.from(selectedIds);
    setItems((prev) => prev.map((i) => ids.includes(i.id) ? { ...i, assignee: newAssignee } : i));
    try {
      if (!online) throw new Error('offline');
      await fetch(`/api/projects/${projectId}/punch-list/batch`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, update: { assignee: newAssignee } }),
      });
    } catch {
      await enqueue({ url: `/api/projects/${projectId}/punch-list/batch`, method: 'PATCH', body: JSON.stringify({ ids, update: { assignee: newAssignee } }), contentType: 'application/json', isFormData: false });
    }
    // Send notification
    await sendNotification(newAssignee, `${ids.length} punch item(s) have been reassigned to you.`);
    setSelectedIds(new Set());
    setSelectMode(false);
    setShowAssigneePicker(false);
    setBatchBusy(false);
  };

  const batchChangePriority = async (newPriority: string) => {
    setBatchBusy(true);
    const ids = Array.from(selectedIds);
    setItems((prev) => prev.map((i) => ids.includes(i.id) ? { ...i, priority: newPriority } : i));
    try {
      if (!online) throw new Error('offline');
      await fetch(`/api/projects/${projectId}/punch-list/batch`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, update: { priority: newPriority } }),
      });
    } catch {
      await enqueue({ url: `/api/projects/${projectId}/punch-list/batch`, method: 'PATCH', body: JSON.stringify({ ids, update: { priority: newPriority } }), contentType: 'application/json', isFormData: false });
    }
    setSelectedIds(new Set());
    setSelectMode(false);
    setShowPriorityPicker(false);
    setBatchBusy(false);
    setToast(`${ids.length} item(s) updated to ${newPriority}`);
  };

  const batchDelete = async () => {
    setBatchBusy(true);
    const ids = Array.from(selectedIds);
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    try {
      if (!online) throw new Error('offline');
      await fetch(`/api/projects/${projectId}/punch-list/batch`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    } catch {
      await enqueue({ url: `/api/projects/${projectId}/punch-list/batch`, method: 'DELETE', body: JSON.stringify({ ids }), contentType: 'application/json', isFormData: false });
    }
    setSelectedIds(new Set());
    setSelectMode(false);
    setBatchBusy(false);
    setToast(`${ids.length} item(s) deleted`);
  };

  // Detail view reassign
  const reassignItem = async (item: PunchItem, newAssignee: string) => {
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, assignee: newAssignee } : i));
    setSelected((prev) => prev ? { ...prev, assignee: newAssignee } : null);
    try {
      if (!online) throw new Error('offline');
      await fetch(`/api/punch-list/${item.id}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee: newAssignee }),
      });
    } catch {
      await enqueue({ url: `/api/punch-list/${item.id}/complete`, method: 'PATCH', body: JSON.stringify({ assignee: newAssignee }), contentType: 'application/json', isFormData: false });
    }
    await sendNotification(newAssignee, `Punch item reassigned to you: "${item.description.slice(0, 60)}"`);
  };

  /* ── Filtering logic ── */
  const getFiltered = (): PunchItem[] => {
    if (filter === 'advanced' || advancedActive) {
      return items.filter((i) => {
        if (filterStatuses.length > 0 && !filterStatuses.includes(i.status)) return false;
        if (filterPriorities.length > 0 && !filterPriorities.includes(i.priority)) return false;
        if (filterTrades.length > 0 && !filterTrades.includes(i.trade)) return false;
        if (filterAssignee && filterAssignee !== 'me' && i.assignee !== filterAssignee) return false;
        if (filterDateField && filterDateFrom) {
          const val = filterDateField === 'created_at' ? i.created_at : i.due_date;
          if (!val || val.slice(0, 10) < filterDateFrom) return false;
        }
        if (filterDateField && filterDateTo) {
          const val = filterDateField === 'created_at' ? i.created_at : i.due_date;
          if (!val || val.slice(0, 10) > filterDateTo) return false;
        }
        return true;
      });
    }
    if (filter === 'all') return items;
    return items.filter((i) => i.status === filter || i.priority.toLowerCase() === filter);
  };

  const filtered = getFiltered();
  const openCount = items.filter((i) => i.status !== 'complete').length;
  const criticalCount = items.filter((i) => i.priority === 'Critical' && i.status !== 'complete').length;

  // Detail view reassign state
  const [showDetailReassign, setShowDetailReassign] = useState(false);

  return (
    <div style={{ padding: '18px 16px', paddingBottom: selectMode && selectedIds.size > 0 ? 100 : 18 }}>
      <button onClick={() => router.back()} style={backBtn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg></button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Punch List</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: DIM }}>{projectName}</p>
        </div>
        {view === 'list' && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
              style={{ background: selectMode ? `rgba(${hexRgb(BLUE)}, .2)` : 'transparent', border: `1px solid ${selectMode ? BLUE : BORDER}`, borderRadius: 10, padding: '10px 14px', color: selectMode ? BLUE : DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </button>
            <button
              onClick={() => setView('new')}
              style={{ background: GOLD, border: 'none', borderRadius: 10, padding: '10px 16px', color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
            >
              + Add Item
            </button>
          </div>
        )}
      </div>

      {/* Stats chips */}
      {view === 'list' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <Chip label={`${openCount} Open`} color={openCount > 0 ? AMBER : GREEN} />
          {criticalCount > 0 && <Chip label={`${criticalCount} Critical`} color={RED} />}
          <Chip label={`${items.filter((i) => i.status === 'complete').length} Done`} color={GREEN} />
        </div>
      )}

      {/* Statistics Panel */}
      {view === 'list' && <StatsPanel items={items} />}

      {/* Filter chips */}
      {view === 'list' && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 6 }}>
          {['all', 'open', 'in_progress', 'ready_to_inspect', 'complete', 'Critical', 'High'].map((f) => (
            <button key={f} onClick={() => { setFilter(f); if (f !== 'advanced') setAdvancedActive(false); }}
              style={{ flexShrink: 0, background: filter === f && !advancedActive ? 'rgba(212,160,23,.2)' : 'transparent', border: `1px solid ${filter === f && !advancedActive ? GOLD : BORDER}`, borderRadius: 20, padding: '5px 12px', color: filter === f && !advancedActive ? GOLD : DIM, fontSize: 12, fontWeight: filter === f && !advancedActive ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {STATUS_LABELS[f] || f}
            </button>
          ))}
          <button onClick={() => setShowAdvFilter(true)}
            style={{ flexShrink: 0, background: advancedActive ? `rgba(${hexRgb(PURPLE)}, .2)` : 'transparent', border: `1px solid ${advancedActive ? PURPLE : BORDER}`, borderRadius: 20, padding: '5px 12px', color: advancedActive ? PURPLE : DIM, fontSize: 12, fontWeight: advancedActive ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Filters{advancedActive ? ' *' : ''}
          </button>
        </div>
      )}

      {/* Quick presets */}
      {view === 'list' && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
          {[
            { key: 'my-items', label: 'My Items' },
            { key: 'overdue', label: 'Overdue' },
            { key: 'created-today', label: 'Created Today' },
            { key: 'high-priority', label: 'High Priority' },
          ].map((p) => (
            <button key={p.key} onClick={() => applyQuickPreset(p.key)}
              style={{ flexShrink: 0, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '4px 11px', color: DIM, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Select all / deselect all */}
      {view === 'list' && selectMode && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button onClick={selectAll} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 12px', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Select All ({filtered.length})</button>
          <button onClick={deselectAll} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 12px', color: DIM, fontSize: 12, cursor: 'pointer' }}>Deselect All</button>
          {selectedIds.size > 0 && <span style={{ fontSize: 12, color: GOLD, alignSelf: 'center', fontWeight: 700 }}>{selectedIds.size} selected</span>}
        </div>
      )}

      {/* ── List view ── */}
      {view === 'list' && (
        loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: DIM }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
            <div style={{ display: 'flex', justifyContent: 'center', color: GREEN, marginBottom: 8, opacity: 0.6 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></div>
            <p style={{ margin: 0, fontSize: 14 }}>{filter === 'all' && !advancedActive ? 'No punch list items. Tap "+ Add Item" to log one.' : 'No items match this filter.'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((item) => (
              <div
                key={item.id}
                style={{ display: 'flex', alignItems: 'center', gap: 0 }}
              >
                {selectMode && (
                  <button
                    onClick={() => toggleSelectItem(item.id)}
                    style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', flexShrink: 0 }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: 6,
                      border: `2px solid ${selectedIds.has(item.id) ? GOLD : BORDER}`,
                      background: selectedIds.has(item.id) ? GOLD : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selectedIds.has(item.id) && <svg viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                  </button>
                )}
                <div
                  onClick={() => { if (selectMode) { toggleSelectItem(item.id); } else { setSelected(item); setView('detail'); } }}
                  style={{ flex: 1, background: RAISED, border: `1px solid ${item.priority === 'Critical' ? 'rgba(239,68,68,.3)' : BORDER}`, borderRadius: 12, padding: '14px', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: PRIORITY_COLORS[item.priority] || DIM, marginTop: 4, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT, lineHeight: 1.3 }}>{item.description}</p>
                      {item.location && <p style={{ margin: '3px 0 0', fontSize: 12, color: DIM, display: 'flex', alignItems: 'center', gap: 4 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx={12} cy={10} r={3}/></svg> {item.location}</p>}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <Tag label={item.trade} />
                        <Tag label={STATUS_LABELS[item.status] || item.status} color={STATUS_COLORS[item.status]} />
                        {item.assignee && <Tag label={item.assignee} color={BLUE} />}
                        {item.due_date && <Tag label={`Due ${new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`} color={new Date(item.due_date) < new Date() ? RED : DIM} />}
                      </div>
                    </div>
                    {!selectMode && <span style={{ color: DIM, fontSize: 18, flexShrink: 0 }}>›</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Batch action bar ── */}
      {view === 'list' && selectMode && selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#0A1628', borderTop: `1px solid ${BORDER}`,
          padding: '10px 16px', display: 'flex', gap: 8, overflowX: 'auto', zIndex: 999,
        }}>
          <button disabled={batchBusy} onClick={() => setShowConfirm({ message: `Close ${selectedIds.size} selected item(s)? They will be marked as complete.`, action: batchClose })}
            style={{ flexShrink: 0, background: GREEN, border: 'none', borderRadius: 10, padding: '10px 14px', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: batchBusy ? 0.5 : 1 }}>
            Close ({selectedIds.size})
          </button>
          <button disabled={batchBusy} onClick={() => setShowAssigneePicker(true)}
            style={{ flexShrink: 0, background: BLUE, border: 'none', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: batchBusy ? 0.5 : 1 }}>
            Reassign
          </button>
          <button disabled={batchBusy} onClick={() => setShowPriorityPicker(true)}
            style={{ flexShrink: 0, background: AMBER, border: 'none', borderRadius: 10, padding: '10px 14px', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: batchBusy ? 0.5 : 1 }}>
            Priority
          </button>
          <button disabled={batchBusy} onClick={() => setShowConfirm({ message: `Delete ${selectedIds.size} selected item(s)? This cannot be undone.`, action: batchDelete })}
            style={{ flexShrink: 0, background: RED, border: 'none', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: batchBusy ? 0.5 : 1 }}>
            Delete
          </button>
        </div>
      )}

      {/* ── New item form ── */}
      {view === 'new' && (
        <form onSubmit={submitNew}>
          <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 800, color: TEXT }}>New Punch List Item</h2>
          {!online && <OfflineBanner />}

          <div style={card}>
            <p style={secLbl}>Description</p>
            <Fld label="What needs to be fixed? *">
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe the deficiency, missing work, or issue..." rows={4} style={inp} required />
            </Fld>
            <Fld label="Location on Site">
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Level 2, Unit 204 bathroom" style={inp} />
            </Fld>
          </div>

          <div style={card}>
            <p style={secLbl}>Assignment</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Fld label="Responsible Trade">
                <select value={trade} onChange={(e) => setTrade(e.target.value)} style={inp}>
                  {TRADES.map((t) => <option key={t} value={t} style={{ background: '#0D1D2E' }}>{t}</option>)}
                </select>
              </Fld>
              <Fld label="Priority">
                <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inp}>
                  {PRIORITIES.map((p) => <option key={p} value={p} style={{ background: '#0D1D2E' }}>{p}</option>)}
                </select>
              </Fld>
            </div>
            <Fld label="Assignee">
              <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Name of responsible person" style={inp} list="assignee-list" />
              <datalist id="assignee-list">
                {uniqueAssignees.map((a) => <option key={a} value={a} />)}
              </datalist>
            </Fld>
            <Fld label="Due Date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inp} />
            </Fld>
            <Fld label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional details, spec reference..." rows={2} style={inp} />
            </Fld>
          </div>

          {/* Photo attachment */}
          <div style={card}>
            <p style={secLbl}>Photos</p>
            <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoCapture} style={{ display: 'none' }} />
            <button type="button" onClick={() => photoRef.current?.click()} style={{ width: '100%', background: 'transparent', border: `2px dashed rgba(212,160,23,.4)`, borderRadius: 10, padding: '14px', color: GOLD, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: photoPreviews.length ? 10 : 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx={12} cy={13} r={4}/></svg>
              Attach Photo
            </button>
            {photoPreviews.length > 0 && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {photoPreviews.map((src, i) => (
                  <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Photo ${i + 1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
                    <button type="button" onClick={() => removePhoto(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: RED, border: 'none', color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => { setView('list'); resetForm(); }} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px', color: DIM, fontSize: 15, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ flex: 2, background: saving ? '#1E3A5F' : GOLD, border: 'none', borderRadius: 12, padding: '16px', color: saving ? DIM : '#000', fontSize: 15, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving...' : '+ Add to Punch List'}
            </button>
          </div>
        </form>
      )}

      {/* ── Detail / Update view ── */}
      {view === 'detail' && selected && (
        <div>
          <button onClick={() => setView('list')} style={backBtn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg></button>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <Tag label={selected.priority} color={PRIORITY_COLORS[selected.priority]} large />
            <Tag label={STATUS_LABELS[selected.status] || selected.status} color={STATUS_COLORS[selected.status]} large />
            {selected.assignee && <Tag label={selected.assignee} color={BLUE} large />}
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: TEXT, lineHeight: 1.3 }}>{selected.description}</h2>
          {selected.location && <p style={{ margin: '0 0 4px', fontSize: 14, color: DIM, display: 'flex', alignItems: 'center', gap: 5 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx={12} cy={10} r={3}/></svg> {selected.location}</p>}
          <p style={{ margin: '0 0 16px', fontSize: 14, color: DIM, display: 'flex', alignItems: 'center', gap: 5 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg> {selected.trade}</p>
          {selected.due_date && <p style={{ margin: '0 0 16px', fontSize: 14, color: new Date(selected.due_date) < new Date() ? RED : DIM, display: 'flex', alignItems: 'center', gap: 5 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><rect x={3} y={4} width={18} height={18} rx={2}/><line x1={16} y1={2} x2={16} y2={6}/><line x1={8} y1={2} x2={8} y2={6}/><line x1={3} y1={10} x2={21} y2={10}/></svg> Due {new Date(selected.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</p>}
          {selected.notes && <p style={{ margin: '0 0 16px', fontSize: 14, color: TEXT, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', whiteSpace: 'pre-wrap' }}>{selected.notes}</p>}

          {/* Attached photos */}
          {selected.photo_urls && selected.photo_urls.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={secLbl}>Attached Photos</p>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                {selected.photo_urls.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={url} alt={`Photo ${i + 1}`} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 10, border: `1px solid ${BORDER}`, flexShrink: 0 }} />
                ))}
              </div>
            </div>
          )}

          {/* Reassign button */}
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setShowDetailReassign(true)} style={{ width: '100%', background: 'transparent', border: `1px solid ${BLUE}`, borderRadius: 12, padding: '12px 16px', color: BLUE, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx={9} cy={7} r={4}/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              {selected.assignee ? `Reassign (current: ${selected.assignee})` : 'Assign To'}
            </button>
          </div>

          <p style={secLbl}>Update Status</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(selected, s)}
                style={{ background: selected.status === s ? `rgba(${hexRgb(STATUS_COLORS[s])}, .15)` : 'transparent', border: `2px solid ${selected.status === s ? STATUS_COLORS[s] : BORDER}`, borderRadius: 12, padding: '14px 16px', color: selected.status === s ? STATUS_COLORS[s] : DIM, fontSize: 15, fontWeight: selected.status === s ? 800 : 400, cursor: 'pointer', textAlign: 'left', transition: 'all .1s' }}
              >
                {selected.status === s ? '● ' : '○ '}{STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Dialogs / Overlays ── */}
      {showConfirm && <ConfirmDialog message={showConfirm.message} onConfirm={() => { showConfirm.action(); setShowConfirm(null); }} onCancel={() => setShowConfirm(null)} />}
      {showAssigneePicker && <AssigneePickerDialog assignees={uniqueAssignees} onSelect={batchReassign} onCancel={() => setShowAssigneePicker(false)} />}
      {showPriorityPicker && <PriorityPickerDialog onSelect={batchChangePriority} onCancel={() => setShowPriorityPicker(false)} />}
      {showDetailReassign && selected && <AssigneePickerDialog assignees={uniqueAssignees} onSelect={(a) => { reassignItem(selected, a); setShowDetailReassign(false); }} onCancel={() => setShowDetailReassign(false)} />}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
      <AdvancedFilterPanel
        show={showAdvFilter}
        onClose={() => { setShowAdvFilter(false); applyAdvancedFilter(); }}
        filterStatuses={filterStatuses} setFilterStatuses={setFilterStatuses}
        filterPriorities={filterPriorities} setFilterPriorities={setFilterPriorities}
        filterTrades={filterTrades} setFilterTrades={setFilterTrades}
        filterAssignee={filterAssignee} setFilterAssignee={setFilterAssignee}
        filterDateField={filterDateField} setFilterDateField={setFilterDateField}
        filterDateFrom={filterDateFrom} setFilterDateFrom={setFilterDateFrom}
        filterDateTo={filterDateTo} setFilterDateTo={setFilterDateTo}
        assignees={uniqueAssignees}
        onSavePreset={handleSavePreset}
        savedPresets={savedPresets}
        onLoadPreset={handleLoadPreset}
        onDeletePreset={handleDeletePreset}
        onClearAll={() => { clearAdvancedFilters(); setShowAdvFilter(false); }}
      />
    </div>
  );
}

export default function FieldPunchPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}><PunchListPage /></Suspense>;
}

// Shared helpers
function Chip({ label, color }: { label: string; color: string }) {
  return <div style={{ background: `rgba(${hexRgb(color)}, .12)`, border: `1px solid rgba(${hexRgb(color)}, .3)`, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700, color }}>{label}</div>;
}
function Tag({ label, color = DIM, large }: { label: string; color?: string; large?: boolean }) {
  return <span style={{ background: `rgba(${hexRgb(color)}, .12)`, border: `1px solid rgba(${hexRgb(color)}, .25)`, borderRadius: 20, padding: large ? '4px 12px' : '2px 8px', fontSize: large ? 13 : 11, fontWeight: 700, color }}>{label}</span>;
}
function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}><label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>{label}</label>{children}</div>;
}
function OfflineBanner() {
  return <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: RED, fontWeight: 600 }}>Offline — will sync when reconnected</div>;
}

const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 14px 6px', marginBottom: 12 };
const secLbl: React.CSSProperties = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 };
const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '11px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: '8px', marginLeft: -8, display: 'flex', alignItems: 'center', marginBottom: 4 };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
