'use client';
/**
 * Browse a connected external store and import files into the current project.
 * Pick a connection → navigate folders → import a file (downloads from the
 * provider server-side and stores it as a project_files row). Calls onImported
 * with each new file row so the media library can prepend it.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { T } from '@/components/ui/shell';
import { Folder, FileText, X, CaretRight, House, DownloadSimple, CloudArrowDown, Spinner } from '@phosphor-icons/react';

/* eslint-disable @typescript-eslint/no-explicit-any */
const fmtSize = (b?: number | null) => { if (!b) return ''; const u = ['B', 'KB', 'MB', 'GB']; let i = 0, n = b; while (n >= 1024 && i < 3) { n /= 1024; i++; } return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`; };

export function ExternalBrowser({ projectId, onImported, onClose }: { projectId?: string | null; onImported?: (row: any) => void; onClose: () => void }) {
  const [connectors, setConnectors] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [stack, setStack] = useState<{ path: string | null; name: string }[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => { fetch('/api/storage/connectors').then((r) => r.json()).then((j) => setConnectors((j.connectors || []).filter((c: any) => c.connected))); }, []);

  const browse = useCallback(async (conn: any, p: string | null) => {
    setLoading(true); setErr('');
    try {
      const res = await fetch(`/api/storage/connectors/${conn.id}/browse${p ? `?path=${encodeURIComponent(p)}` : ''}`);
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setItems(j.items || []); setPath(p);
    } catch (e: any) { setErr(e.message); setItems([]); }
    setLoading(false);
  }, []);

  const open = (conn: any) => { setActive(conn); setStack([{ path: null, name: conn.display_name }]); browse(conn, null); };
  const into = (item: any) => { setStack((s) => [...s, { path: item.path, name: item.name }]); browse(active, item.path); };
  const upTo = (idx: number) => { const target = stack[idx]; setStack((s) => s.slice(0, idx + 1)); browse(active, target.path); };

  const importFile = async (item: any) => {
    setImporting(item.path);
    try {
      const res = await fetch(`/api/storage/connectors/${active.id}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: item.path, projectId, folder: null }) });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      onImported?.(j.file);
    } catch (e: any) { setErr(e.message); }
    setImporting(null);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: `1px solid ${T.border}`, borderRadius: 14, width: 'min(680px,100%)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
          <CloudArrowDown size={20} color={T.gold} weight="fill" />
          <div style={{ fontWeight: 800, fontSize: 16, marginLeft: 8, flex: 1, color: T.white }}>Import from Cloud Storage</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color={T.muted} /></button>
        </div>

        {!active ? (
          <div style={{ padding: 16 }}>
            {connectors.length === 0 ? (
              <div style={{ color: T.muted, fontSize: 14, padding: 12 }}>No connected storage. Add one in <a href="/app/settings/storage" style={{ color: T.gold }}>Settings → External Storage</a>.</div>
            ) : connectors.map((c) => (
              <button key={c.id} onClick={() => open(c)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, marginBottom: 8, cursor: 'pointer', color: T.white }}>
                <Folder size={18} color={T.gold} /><span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{c.display_name}</span><CaretRight size={15} color={T.muted} />
              </button>
            ))}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 16px', flexWrap: 'wrap', fontSize: 12.5, borderBottom: `1px solid ${T.border}` }}>
              <button onClick={() => { setActive(null); setItems([]); }} style={{ background: 'none', border: 'none', color: T.gold, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}><House size={13} />Connections</button>
              {stack.map((s, i) => (<React.Fragment key={i}><CaretRight size={11} color={T.muted} /><button onClick={() => upTo(i)} style={{ background: 'none', border: 'none', color: i === stack.length - 1 ? T.white : T.gold, cursor: 'pointer' }}>{s.name}</button></React.Fragment>))}
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 8, minHeight: 260 }}>
              {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={26} color={T.gold} className="spin" /></div>
                : err ? <div style={{ color: T.red, fontSize: 13, padding: 16 }}>{err}</div>
                  : items.length === 0 ? <div style={{ color: T.muted, fontSize: 13, padding: 16 }}>Empty folder.</div>
                    : items.map((it, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: it.kind === 'folder' ? 'pointer' : 'default' }}
                        onClick={() => it.kind === 'folder' && into(it)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = T.bg)} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                        {it.kind === 'folder' ? <Folder size={17} color={T.gold} /> : <FileText size={17} color={T.muted} />}
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, color: T.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>{it.kind === 'file' && it.size ? <div style={{ fontSize: 11.5, color: T.muted }}>{fmtSize(it.size)}</div> : null}</div>
                        {it.kind === 'folder' ? <CaretRight size={14} color={T.muted} />
                          : <button onClick={(e) => { e.stopPropagation(); importFile(it); }} disabled={!!importing} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: T.gold, color: T.bg, border: 'none', borderRadius: 7, padding: '6px 11px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{importing === it.path ? '…' : <><DownloadSimple size={13} weight="bold" />Import</>}</button>}
                      </div>
                    ))}
            </div>
          </>
        )}
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
