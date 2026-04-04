'use client';
/**
 * Saguaro Field — Laser Measure Tool
 * Connect Leica/Bosch BLE laser measures, log measurements, link to takeoff.
 * Real API: /api/laser/measurements
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';

const BASE = '#F8F9FB';
const CARD = '#F8F9FB';
const CARD_GLASS = 'rgba(26,31,46,0.7)';
const GOLD = '#C8960F';
const GREEN = '#22C55E';
const BLUE = '#3B82F6';
const RED = '#EF4444';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#EEF0F3';
const RADIUS = 16;

const glass: React.CSSProperties = {
  background: CARD_GLASS,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${BORDER}`,
  borderRadius: RADIUS,
};

const inp: React.CSSProperties = {
  width: '100%', background: 'rgba(15,20,25,0.8)', border: `1px solid ${BORDER}`,
  borderRadius: 10, padding: '11px 14px', color: TEXT, fontSize: 15, outline: 'none', boxSizing: 'border-box',
};

type Unit = 'ft/in' | 'mm' | 'm' | 'cm';

interface Measurement {
  id: string;
  value_mm: number;
  unit: Unit;
  label: string;
  device_name: string;
  room: string;
  takeoff_item: string;
  created_at: string;
  project_id: string;
}

interface ConnectedDevice {
  name: string;
  id: string;
  battery?: number;
  server?: any;
}

const LEICA_SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
const LEICA_CHAR = '0000fff1-0000-1000-8000-00805f9b34fb';

function convertFromMM(mm: number, unit: Unit): string {
  switch (unit) {
    case 'mm': return mm.toFixed(0);
    case 'cm': return (mm / 10).toFixed(1);
    case 'm': return (mm / 1000).toFixed(3);
    case 'ft/in': {
      const totalInches = mm / 25.4;
      const feet = Math.floor(totalInches / 12);
      const inches = totalInches % 12;
      const wholeInches = Math.floor(inches);
      const frac = inches - wholeInches;
      // Show nearest 1/16
      const sixteenths = Math.round(frac * 16);
      if (sixteenths === 0 || sixteenths === 16) {
        const adj = sixteenths === 16 ? 1 : 0;
        return `${feet}' ${wholeInches + adj}"`;
      }
      // Simplify fraction
      let num = sixteenths, den = 16;
      while (num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; }
      return `${feet}' ${wholeInches} ${num}/${den}"`;
    }
    default: return mm.toFixed(0);
  }
}

function convertToMM(value: string, unit: Unit): number {
  const num = parseFloat(value);
  if (isNaN(num)) return 0;
  switch (unit) {
    case 'mm': return num;
    case 'cm': return num * 10;
    case 'm': return num * 1000;
    case 'ft/in': return num * 304.8; // treat as feet decimal for manual
    default: return num;
  }
}

function unitLabel(unit: Unit): string {
  switch (unit) {
    case 'ft/in': return 'ft / in';
    case 'mm': return 'millimeters';
    case 'm': return 'meters';
    case 'cm': return 'centimeters';
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  return days + 'd ago';
}

type Tab = 'measure' | 'history';
type HistoryFilter = 'all' | 'linked' | 'unlinked';

function LaserPage() {
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState<Tab>('measure');
  const [unit, setUnit] = useState<Unit>('ft/in');
  const [currentValueMM, setCurrentValueMM] = useState(0);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [device, setDevice] = useState<ConnectedDevice | null>(null);
  const [bleSupported, setBleSupported] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState('');
  const [room, setRoom] = useState('');
  const [takeoffItem, setTakeoffItem] = useState('');

  // History
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  useEffect(() => {
    const pid = localStorage.getItem('sag_active_project') || '';
    setProjectId(pid);
    if (typeof navigator !== 'undefined' && !(navigator as any).bluetooth) {
      setBleSupported(false);
    }
  }, []);

  // Fetch measurements
  const fetchMeasurements = useCallback(async () => {
    if (!projectId) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/laser/measurements?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setMeasurements(data.measurements || data.data || []);
      }
    } catch {
      // network error
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) fetchMeasurements();
  }, [projectId, fetchMeasurements]);

  // BLE scan
  const handleScan = async () => {
    if (!(navigator as any).bluetooth) {
      setBleSupported(false);
      return;
    }
    setScanning(true);
    try {
      const bleDevice = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { services: [LEICA_SERVICE] },
          { namePrefix: 'DISTO' },
          { namePrefix: 'Bosch' },
          { namePrefix: 'GLM' },
        ],
        optionalServices: [LEICA_SERVICE, 'battery_service'],
      });

      const server = await bleDevice.gatt?.connect();
      if (!server) throw new Error('Failed to connect GATT');

      let battery: number | undefined;
      try {
        const battService = await server.getPrimaryService('battery_service');
        const battChar = await battService.getCharacteristic('battery_level');
        const battVal = await battChar.readValue();
        battery = battVal.getUint8(0);
      } catch {
        // battery service not available
      }

      setDevice({
        name: bleDevice.name || 'Laser Measure',
        id: bleDevice.id,
        battery,
        server,
      });

      // Listen for measurement updates
      try {
        const service = await server.getPrimaryService(LEICA_SERVICE);
        const char = await service.getCharacteristic(LEICA_CHAR);
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', (event: Event) => {
          const target = event.target as any;
          const value = target.value;
          if (value) {
            // Parse distance in mm (float32 LE)
            const mm = value.getFloat32(0, true);
            if (mm > 0 && mm < 999999) {
              setCurrentValueMM(mm);
            }
          }
        });
      } catch {
        // characteristic not available
      }
    } catch (err) {
      // user cancelled or device not found
      console.log('BLE scan cancelled or failed:', err);
    } finally {
      setScanning(false);
    }
  };

  // Manual entry submit
  const handleManualSubmit = () => {
    if (!manualValue) return;
    const mm = convertToMM(manualValue, unit);
    setCurrentValueMM(mm);
    setManualEntry(false);
    setManualValue('');
  };

  // Save measurement
  const handleSave = async () => {
    if (currentValueMM <= 0 || !projectId) return;
    setSaving(true);
    try {
      await fetch('/api/laser/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          value_mm: currentValueMM,
          unit,
          label: label || undefined,
          room: room || undefined,
          takeoff_item: takeoffItem || undefined,
          device_name: device?.name || 'Manual',
        }),
      });
      setCurrentValueMM(0);
      setLabel('');
      setRoom('');
      setTakeoffItem('');
      await fetchMeasurements();
    } catch {
      // error saving
    } finally {
      setSaving(false);
    }
  };

  // Delete measurement
  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/laser/measurements?id=${id}`, { method: 'DELETE' });
      setMeasurements(prev => prev.filter(m => m.id !== id));
    } catch {
      // error
    }
  };

  // Update label
  const handleUpdateLabel = async (id: string) => {
    try {
      await fetch(`/api/laser/measurements`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, label: editLabel }),
      });
      setMeasurements(prev => prev.map(m => m.id === id ? { ...m, label: editLabel } : m));
      setEditingId(null);
      setEditLabel('');
    } catch {
      // error
    }
  };

  // Filter measurements
  const filteredMeasurements = measurements.filter(m => {
    if (historyFilter === 'linked') return !!m.takeoff_item;
    if (historyFilter === 'unlinked') return !m.takeoff_item;
    return true;
  });

  // Stats
  const vals = measurements.map(m => m.value_mm).filter(v => v > 0);
  const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const min = vals.length > 0 ? Math.min(...vals) : 0;
  const max = vals.length > 0 ? Math.max(...vals) : 0;

  if (!projectId) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: DIM }}>
        <p style={{ fontSize: 14 }}>No project selected. Choose a project from the header.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 14px 100px', maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 900, color: TEXT }}>Laser Measure</h1>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: DIM }}>BLE laser connection & measurement logging</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#F8F9FB', borderRadius: 12, padding: 3 }}>
        {(['measure', 'history'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: tab === t ? 'rgba(212,160,23,0.15)' : 'transparent',
              color: tab === t ? GOLD : DIM,
              fontSize: 14, fontWeight: tab === t ? 700 : 500,
              transition: 'all 0.2s',
            }}>
            {t === 'measure' ? 'Measure' : `History${measurements.length > 0 ? ` (${measurements.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* ── MEASURE TAB ── */}
      {tab === 'measure' && (
        <>
          {/* Big measurement display */}
          <div style={{ ...glass, padding: '32px 20px', textAlign: 'center', marginBottom: 16 }}>
            {currentValueMM > 0 ? (
              <>
                <div style={{ fontSize: 48, fontWeight: 900, color: GOLD, fontVariantNumeric: 'tabular-nums', letterSpacing: -2, lineHeight: 1 }}>
                  {convertFromMM(currentValueMM, unit)}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: DIM, fontWeight: 500 }}>{unitLabel(unit)}</p>
              </>
            ) : (
              <>
                <div style={{ fontSize: 48, fontWeight: 900, color: '#E5E7EB', lineHeight: 1 }}>
                  {'0\' 0"'}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: DIM, fontWeight: 500 }}>
                  {device ? 'Waiting for measurement...' : 'Connect a device or enter manually'}
                </p>
              </>
            )}
          </div>

          {/* Unit toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#F8F9FB', borderRadius: 10, padding: 3 }}>
            {(['ft/in', 'mm', 'm', 'cm'] as Unit[]).map(u => (
              <button key={u} onClick={() => setUnit(u)}
                style={{
                  flex: 1, padding: '8px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: unit === u ? 'rgba(59,130,246,0.15)' : 'transparent',
                  color: unit === u ? BLUE : DIM,
                  fontSize: 13, fontWeight: unit === u ? 700 : 500,
                }}>
                {u}
              </button>
            ))}
          </div>

          {/* Connected device info */}
          {device && (
            <div style={{ ...glass, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, boxShadow: `0 0 6px ${GREEN}` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: TEXT }}>{device.name}</p>
                <p style={{ margin: 0, fontSize: 11, color: DIM }}>Connected via Bluetooth</p>
              </div>
              {device.battery !== undefined && (
                <div style={{
                  background: device.battery > 20 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700,
                  color: device.battery > 20 ? GREEN : RED,
                }}>
                  {device.battery}%
                </div>
              )}
            </div>
          )}

          {/* Scan button */}
          {!device && (
            bleSupported ? (
              <button onClick={handleScan} disabled={scanning}
                style={{
                  width: '100%', padding: '14px 20px', marginBottom: 10,
                  ...glass, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  color: BLUE, fontSize: 14, fontWeight: 700,
                }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6.5 6.5l11 11M17.5 6.5l-11 11M12 2v20M2 12h20" />
                </svg>
                {scanning ? 'Scanning...' : 'Scan for Devices'}
              </button>
            ) : (
              <div style={{ ...glass, padding: 14, marginBottom: 10, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 13, color: DIM }}>
                  BLE requires Chrome or the Saguaro native app
                </p>
              </div>
            )
          )}

          {/* Manual entry */}
          {manualEntry ? (
            <div style={{ ...glass, padding: 14, marginBottom: 12 }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Manual Entry ({unit})</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" value={manualValue} onChange={e => setManualValue(e.target.value)}
                  placeholder={unit === 'ft/in' ? 'Feet (decimal)' : `Value in ${unit}`}
                  style={{ ...inp, flex: 1 }}
                  onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
                  autoFocus />
                <button onClick={handleManualSubmit}
                  style={{ background: GREEN, border: 'none', borderRadius: 10, padding: '0 16px', color: '#000', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>
                  Set
                </button>
                <button onClick={() => setManualEntry(false)}
                  style={{ background: '#EEF0F3', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '0 12px', color: DIM, cursor: 'pointer', fontSize: 13 }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setManualEntry(true)}
              style={{
                width: '100%', padding: '12px 16px', marginBottom: 12,
                background: '#F8F9FB', border: `1px solid ${BORDER}`,
                borderRadius: 12, color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Manual Entry
            </button>
          )}

          {/* Optional fields */}
          {currentValueMM > 0 && (
            <div style={{ ...glass, padding: 14, marginBottom: 12 }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Save Details (Optional)</p>
              <div style={{ marginBottom: 8 }}>
                <input type="text" value={label} onChange={e => setLabel(e.target.value)}
                  placeholder="Label (e.g., Kitchen width)" style={inp} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input type="text" value={room} onChange={e => setRoom(e.target.value)}
                  placeholder="Room" style={{ ...inp, flex: 1 }} />
                <input type="text" value={takeoffItem} onChange={e => setTakeoffItem(e.target.value)}
                  placeholder="Takeoff item" style={{ ...inp, flex: 1 }} />
              </div>
            </div>
          )}

          {/* Save button */}
          <button onClick={handleSave} disabled={currentValueMM <= 0 || saving}
            style={{
              width: '100%', padding: '16px 20px',
              background: currentValueMM > 0
                ? `linear-gradient(135deg, ${GOLD} 0%, #EF8C1A 100%)`
                : '#EEF0F3',
              border: 'none', borderRadius: RADIUS,
              color: currentValueMM > 0 ? '#000' : DIM,
              fontSize: 16, fontWeight: 800, cursor: currentValueMM > 0 ? 'pointer' : 'default',
              opacity: saving ? 0.6 : 1,
            }}>
            {saving ? 'Saving...' : 'Save Measurement'}
          </button>
        </>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <>
          {/* Summary stats */}
          {measurements.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
              {[
                { label: 'Total', value: measurements.length.toString(), color: GOLD },
                { label: 'Average', value: convertFromMM(avg, unit), color: BLUE },
                { label: 'Min', value: convertFromMM(min, unit), color: GREEN },
                { label: 'Max', value: convertFromMM(max, unit), color: RED },
              ].map(s => (
                <div key={s.label} style={{ ...glass, padding: '10px 8px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 10, color: DIM, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>{s.label}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: '#F8F9FB', borderRadius: 10, padding: 3 }}>
            {([
              { key: 'all', label: 'All' },
              { key: 'linked', label: 'Linked' },
              { key: 'unlinked', label: 'Unlinked' },
            ] as { key: HistoryFilter; label: string }[]).map(f => (
              <button key={f.key} onClick={() => setHistoryFilter(f.key)}
                style={{
                  flex: 1, padding: '7px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: historyFilter === f.key ? 'rgba(212,160,23,0.12)' : 'transparent',
                  color: historyFilter === f.key ? GOLD : DIM,
                  fontSize: 12, fontWeight: historyFilter === f.key ? 700 : 500,
                }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Loading skeleton */}
          {historyLoading && (
            <div>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ ...glass, padding: 14, marginBottom: 8 }}>
                  <div style={{ height: 20, width: '40%', background: '#EEF0F3', borderRadius: 8, marginBottom: 8 }} />
                  <div style={{ height: 12, width: '60%', background: '#F3F4F6', borderRadius: 6 }} />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!historyLoading && filteredMeasurements.length === 0 && (
            <div style={{ ...glass, padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>{'\uD83D\uDCCF'}</div>
              <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: TEXT }}>No Measurements Yet</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM, lineHeight: 1.5 }}>
                Connect your laser measure or enter values manually to start logging
              </p>
              <button onClick={() => setTab('measure')}
                style={{
                  background: `linear-gradient(135deg, ${GOLD} 0%, #EF8C1A 100%)`,
                  border: 'none', borderRadius: 12, padding: '12px 24px',
                  color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                }}>
                Take a Measurement
              </button>
            </div>
          )}

          {/* Measurement list */}
          {!historyLoading && filteredMeasurements.map(m => (
            <div key={m.id} style={{ ...glass, padding: 12, marginBottom: 8 }}>
              {editingId === m.id ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={editLabel} onChange={e => setEditLabel(e.target.value)}
                    placeholder="Label" style={{ ...inp, flex: 1, padding: '8px 12px', fontSize: 13 }}
                    autoFocus onKeyDown={e => e.key === 'Enter' && handleUpdateLabel(m.id)} />
                  <button onClick={() => handleUpdateLabel(m.id)}
                    style={{ background: GREEN, border: 'none', borderRadius: 8, padding: '0 12px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>Save</button>
                  <button onClick={() => setEditingId(null)}
                    style={{ background: '#EEF0F3', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '0 10px', color: DIM, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>
                          {convertFromMM(m.value_mm, m.unit || unit)}
                        </span>
                        <span style={{ fontSize: 11, color: DIM }}>{m.unit || 'mm'}</span>
                      </div>
                      {m.label && <p style={{ margin: '2px 0 0', fontSize: 12, color: TEXT, fontWeight: 600 }}>{m.label}</p>}
                      <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: DIM }}>
                        <span>{m.device_name || 'Manual'}</span>
                        <span>{timeAgo(m.created_at)}</span>
                        {m.room && <span style={{ color: BLUE }}>Room: {m.room}</span>}
                        {m.takeoff_item && (
                          <span style={{
                            background: 'rgba(34,197,94,0.12)', color: GREEN,
                            borderRadius: 6, padding: '1px 6px', fontWeight: 600,
                          }}>Linked</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => { setEditingId(m.id); setEditLabel(m.label || ''); }}
                        style={{ background: '#F3F4F6', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: DIM }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={() => handleDelete(m.id)}
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: RED }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: '12px 14px', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ height: 22, width: '50%', background: '#EEF0F3', borderRadius: 8, marginBottom: 16 }} />
      <div style={{
        background: CARD_GLASS, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: '32px 20px', textAlign: 'center', marginBottom: 16,
      }}>
        <div style={{ height: 48, width: '40%', background: '#EEF0F3', borderRadius: 10, margin: '0 auto' }} />
      </div>
      {[1, 2].map(i => (
        <div key={i} style={{
          background: CARD_GLASS, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: 14, marginBottom: 8,
        }}>
          <div style={{ height: 14, width: '60%', background: '#F3F4F6', borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

export default function LaserPageWrapper() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <LaserPage />
    </Suspense>
  );
}
