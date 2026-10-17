'use client';
/**
 * Cost rates — the GC's learning unit costs. Edit a unit cost (manual) or press
 * "Learn from my jobs" to compute quantity-weighted rates from past takeoffs.
 * These override the book everywhere the takeoff engine prices.
 *
 *   list     GET    /api/takeoff/cost-rates
 *   set      POST   /api/takeoff/cost-rates          { costKey, materialCents }
 *   revert   DELETE /api/takeoff/cost-rates?costKey=
 *   learn    POST   /api/takeoff/cost-rates/learn
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkle, PencilSimple, BookOpen, Coins, ArrowClockwise, WarningCircle } from '@phosphor-icons/react';
import {
  PageShell, StatRow, Button, Badge, Toolbar, DataTable, EmptyState, Toast, useToast,
  type Column, type StatItem,
} from '@/components/ui/kit';
import { costKeyLabel } from '@/lib/takeoff/cost';

type Row = { cost_key: string; unit: string; note: string; bookCents: number; ownCents: number | null; source: string | null; samples: number };
type Show = 'all' | 'learned' | 'manual' | 'book';

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CSS = `
.crRate { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.crRateVal { font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.crRateVal[data-own="false"] { font-weight: 500; color: var(--text-secondary); }
.crDiff { font-size: 12px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.crDiff[data-dir="up"] { color: var(--warning); }
.crDiff[data-dir="down"] { color: var(--success); }
.crInput { width: 104px; }
.crName { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.crName small { font-size: 12px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

export default function CostRatesPage() {
  const [list, setList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [show, setShow] = useState<Show>('all');
  const { toast, show: showToast } = useToast(4200);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/takeoff/cost-rates');
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not load your cost rates.');
      setList(d.list || []);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load your cost rates.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveRate = async (k: string) => {
    const dollars = parseFloat(String(edit[k] ?? '').replace(/[$,\s]/g, ''));
    if (!(dollars >= 0)) { showToast('Enter a dollar amount.', 'bad'); return; }
    setSavingKey(k);
    try {
      const r = await fetch('/api/takeoff/cost-rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ costKey: k, materialCents: Math.round(dollars * 100) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save this rate.');
      setEdit((e) => { const n = { ...e }; delete n[k]; return n; });
      showToast(`${costKeyLabel(k)} set to ${money(Math.round(dollars * 100))}.`);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save this rate.', 'bad');
    } finally {
      setSavingKey(null);
    }
  };
  const revert = async (k: string) => {
    setSavingKey(k);
    try {
      const r = await fetch(`/api/takeoff/cost-rates?costKey=${encodeURIComponent(k)}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not reset this rate.');
      showToast(`${costKeyLabel(k)} is back on the book rate.`);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not reset this rate.', 'bad');
    } finally {
      setSavingKey(null);
    }
  };
  const learn = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/takeoff/cost-rates/learn', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || 'Could not learn from your jobs.');
      showToast(d.learned
        ? `Learned ${d.learned} rates from ${d.fromLines} line items${d.skippedManual ? ` · kept ${d.skippedManual} of yours` : ''}.`
        : (d.message || 'No past takeoffs to learn from yet.'));
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not learn from your jobs.', 'bad');
    } finally {
      setBusy(false);
    }
  };

  const learnedCount = list.filter((r) => r.source === 'learned').length;
  const manualCount = list.filter((r) => r.source === 'manual').length;
  const bookCount = list.length - learnedCount - manualCount;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      const src = r.source === 'learned' ? 'learned' : r.source === 'manual' ? 'manual' : 'book';
      if (show !== 'all' && src !== show) return false;
      if (!q) return true;
      return `${costKeyLabel(r.cost_key)} ${r.unit} ${r.note}`.toLowerCase().includes(q);
    });
  }, [list, search, show]);

  const pick = (s: Show) => setShow((cur) => (cur === s ? 'all' : s));
  const stats: StatItem[] = [
    { label: 'Learned', value: learnedCount, sub: 'From your jobs', icon: <Sparkle size={15} />, tone: learnedCount ? 'good' : 'default', onClick: () => pick('learned'), active: show === 'learned' },
    { label: 'Set by you', value: manualCount, sub: 'Manual rates', icon: <PencilSimple size={15} />, onClick: () => pick('manual'), active: show === 'manual' },
    { label: 'Book', value: bookCount, sub: 'National average', icon: <BookOpen size={15} />, onClick: () => pick('book'), active: show === 'book' },
  ];

  const columns: Column<Row>[] = [
    {
      key: 'item', header: 'Item', primary: true, sortable: true,
      accessor: (r) => costKeyLabel(r.cost_key),
      render: (r) => (
        <span className="crName">
          <span>{costKeyLabel(r.cost_key)}</span>
          {r.note && <small>{r.note}</small>}
        </span>
      ),
    },
    { key: 'unit', header: 'Unit', accessor: (r) => r.unit, width: 70, phone: 'show' },
    { key: 'book', header: 'Book', align: 'right', sortable: true, accessor: (r) => r.bookCents, render: (r) => money(r.bookCents), phone: 'hide' },
    {
      key: 'rate', header: 'Your rate', align: 'right', sortable: true, phone: 'show',
      accessor: (r) => r.ownCents ?? r.bookCents,
      render: (r) => {
        const editing = edit[r.cost_key] != null;
        const eff = r.ownCents ?? r.bookCents;
        const diff = r.ownCents != null && r.bookCents > 0 ? Math.round(((r.ownCents - r.bookCents) / r.bookCents) * 100) : 0;
        const busyRow = savingKey === r.cost_key;
        if (editing) {
          return (
            <span className="crRate" onClick={(e) => e.stopPropagation()}>
              <input
                className="k-input crInput"
                inputMode="decimal"
                aria-label={`${costKeyLabel(r.cost_key)} rate per ${r.unit}`}
                value={edit[r.cost_key]}
                autoFocus
                onChange={(e) => setEdit((x) => ({ ...x, [r.cost_key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveRate(r.cost_key);
                  if (e.key === 'Escape') setEdit((x) => { const n = { ...x }; delete n[r.cost_key]; return n; });
                }}
              />
              <Button size="sm" variant="primary" disabled={busyRow} onClick={() => saveRate(r.cost_key)}>{busyRow ? 'Saving…' : 'Save'}</Button>
              <Button size="sm" variant="ghost" onClick={() => setEdit((x) => { const n = { ...x }; delete n[r.cost_key]; return n; })}>Cancel</Button>
            </span>
          );
        }
        return (
          <span className="crRate">
            <span className="crRateVal" data-own={String(r.ownCents != null)}>{money(eff)}</span>
            {diff !== 0 && <span className="crDiff" data-dir={diff > 0 ? 'up' : 'down'}>{diff > 0 ? '+' : ''}{diff}%</span>}
          </span>
        );
      },
    },
    {
      key: 'source', header: 'Source', phone: 'show',
      accessor: (r) => (r.source === 'learned' ? 'Learned' : r.source === 'manual' ? 'Set by you' : 'Book'),
      render: (r) => r.source === 'learned'
        ? <Badge tone="ongoing">Learned · {r.samples} job{r.samples === 1 ? '' : 's'}</Badge>
        : r.source === 'manual' ? <Badge tone="closed">Set by you</Badge> : <Badge>Book</Badge>,
    },
  ];

  return (
    <PageShell
      crumbs={[{ label: 'Takeoff', href: '/app/takeoff' }, { label: 'Cost rates' }]}
      title="Cost rates"
      subtitle="Your rates price every takeoff."
      actions={
        <Button variant="primary" icon={<Sparkle size={15} weight="fill" />} disabled={busy} onClick={learn}>
          {busy ? 'Learning…' : 'Learn from my jobs'}
        </Button>
      }
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {!loading && !loadError && list.length > 0 && <StatRow items={stats} />}

      {loadError ? (
        <EmptyState
          icon={<WarningCircle size={20} />}
          title="Couldn't load your cost rates"
          text={loadError}
          action={<Button icon={<ArrowClockwise size={15} />} onClick={() => { setLoading(true); void load(); }}>Try again</Button>}
        />
      ) : (
        <>
          {list.length > 0 && <Toolbar search={search} onSearch={setSearch} placeholder="Search items…" />}
          <DataTable
            tableId="takeoff-cost-rates"
            columns={columns}
            rows={rows}
            loading={loading}
            rowKey={(r) => r.cost_key}
            exportName="cost-rates"
            rowActions={(r) => [
              { label: 'Edit', inline: true, icon: <PencilSimple size={14} />, onClick: () => setEdit((x) => ({ ...x, [r.cost_key]: ((r.ownCents ?? r.bookCents) / 100).toFixed(2) })) },
              ...(r.ownCents != null ? [{ label: 'Use book rate', icon: <BookOpen size={14} />, onClick: () => { void revert(r.cost_key); } }] : []),
            ]}
            empty={list.length === 0
              ? <EmptyState icon={<Coins size={20} />} title="No cost rates yet" action={<Button icon={<Sparkle size={15} />} disabled={busy} onClick={learn}>Learn from my jobs</Button>} />
              : <EmptyState icon={<Coins size={20} />} title="No items match" onClearFilters={() => { setSearch(''); setShow('all'); }} />}
          />
        </>
      )}
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
