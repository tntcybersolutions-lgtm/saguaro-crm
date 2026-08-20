'use client';
/**
 * Saguaro Field — Laser Measure Tool
 * Connect Leica/Bosch BLE laser measures, log measurements, link to takeoff.
 * Real API: /api/laser/measurements
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { F } from '@/lib/field-tokens';

const RADIUS = 16;

const glass: React.CSSProperties = {
  background: F.card,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${F.border}`,
  borderRadius: RADIUS,
};

const inp: React.CSSProperties = {
  width: '100%', background: 'rgba(15,20,25,0.8)', border: `1px solid ${F.border}`,
  borderRadius: 10, padding: '11px 14px', color: F.text, fontSize: 16, outline: 'none', boxSizing: 'border-box',
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

type Tab = 'measure' | 'calculator' | 'history';
type HistoryFilter = 'all' | 'linked' | 'unlinked';

function LaserPage() {
  const searchParams = useSearchParams();
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState<Tab>('measure');
  const [unit, setUnit] = useState<Unit>('ft/in');
  const [currentValueMM, setCurrentValueMM] = useState(0);
  const [manualEntry, setManualEntry] = useState(false);
  // Calculator state
  const [calcLength, setCalcLength] = useState('');
  const [calcWidth, setCalcWidth] = useState('');
  const [calcHeight, setCalcHeight] = useState('');
  const [calcWaste, setCalcWaste] = useState('10');
  const [calcUnitSize, setCalcUnitSize] = useState('32');
  const [calcUnitCost, setCalcUnitCost] = useState('');
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
    const pid = searchParams.get('projectId')
      || (typeof window !== 'undefined' ? localStorage.getItem('sag_active_project') : '')
      || '';
    setProjectId(pid);
    if (typeof navigator !== 'undefined' && !(navigator as any).bluetooth) {
      setBleSupported(false);
    }
  }, [searchParams]);

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
      <div className="field-page-enter" style={{ padding: 20, textAlign: 'center', color: F.dim }}>
        <p style={{ fontSize: 14 }}>No project selected. Choose a project from the header.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 14px 100px', maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 900, color: F.text }}>Laser Measure</h1>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: F.dim }}>BLE laser connection & measurement logging</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#0d1117', borderRadius: 12, padding: 3 }}>
        {(['measure', 'history'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: tab === t ? 'rgba(212,160,23,0.15)' : 'transparent',
              color: tab === t ? F.gold : F.dim,
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
                <div style={{ fontSize: 48, fontWeight: 900, color: F.gold, fontVariantNumeric: 'tabular-nums', letterSpacing: -2, lineHeight: 1 }}>
                  {convertFromMM(currentValueMM, unit)}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: F.dim, fontWeight: 500 }}>{unitLabel(unit)}</p>
              </>
            ) : (
              <>
                <div style={{ fontSize: 48, fontWeight: 900, color: '#E5E7EB', lineHeight: 1 }}>
                  {'0\' 0"'}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: F.dim, fontWeight: 500 }}>
                  {device ? 'Waiting for measurement...' : 'Connect a device or enter manually'}
                </p>
              </>
            )}
          </div>

          {/* Unit toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#0d1117', borderRadius: 10, padding: 3 }}>
            {(['ft/in', 'mm', 'm', 'cm'] as Unit[]).map(u => (
              <button key={u} onClick={() => setUnit(u)}
                style={{
                  flex: 1, padding: '8px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: unit === u ? 'rgba(59,130,246,0.15)' : 'transparent',
                  color: unit === u ? F.blue : F.dim,
                  fontSize: 13, fontWeight: unit === u ? 700 : 500,
                }}>
                {u}
              </button>
            ))}
          </div>

          {/* Connected device info */}
          {device && (
            <div style={{ ...glass, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: F.green, boxShadow: `0 0 6px ${F.green}` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: F.text }}>{device.name}</p>
                <p style={{ margin: 0, fontSize: 11, color: F.dim }}>Connected via Bluetooth</p>
              </div>
              {device.battery !== undefined && (
                <div style={{
                  background: device.battery > 20 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700,
                  color: device.battery > 20 ? F.green : F.red,
                }}>
                  {device.battery}%
                </div>
              )}
            </div>
          )}

          {/* Leica Disto integration banner */}
          {!device && (
            <div style={{ ...glass, padding: 16, marginBottom: 10, textAlign: 'center', border: `1px solid ${F.gold}33` }}>
              <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.5 }}>{'\uD83D\uDCE1'}</div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: F.gold }}>Leica Disto BLE Integration</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: F.dim, lineHeight: 1.5 }}>
                Bluetooth laser measure pairing is in development. Use manual entry below to log measurements now.
              </p>
            </div>
          )}

          {/* Manual entry */}
          {manualEntry ? (
            <div style={{ ...glass, padding: 14, marginBottom: 12 }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: F.dim, textTransform: 'uppercase', letterSpacing: 0.8 }}>Manual Entry ({unit})</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" value={manualValue} onChange={e => setManualValue(e.target.value)}
                  placeholder={unit === 'ft/in' ? 'Feet (decimal)' : `Value in ${unit}`}
                  style={{ ...inp, flex: 1 }}
                  onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
                  autoFocus />
                <button onClick={handleManualSubmit}
                  style={{ background: F.green, border: 'none', borderRadius: 10, padding: '0 16px', color: '#000', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>
                  Set
                </button>
                <button onClick={() => setManualEntry(false)}
                  style={{ background: '#30363d', border: `1px solid ${F.border}`, borderRadius: 10, padding: '0 12px', color: F.dim, cursor: 'pointer', fontSize: 13 }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setManualEntry(true)}
              style={{
                width: '100%', padding: '12px 16px', marginBottom: 12,
                background: '#0d1117', border: `1px solid ${F.border}`,
                borderRadius: 12, color: F.dim, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Manual Entry
            </button>
          )}

          {/* Optional fields */}
          {currentValueMM > 0 && (
            <div style={{ ...glass, padding: 14, marginBottom: 12 }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: F.dim, textTransform: 'uppercase', letterSpacing: 0.8 }}>Save Details (Optional)</p>
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
                ? `linear-gradient(135deg, ${F.gold} 0%, #EF8C1A 100%)`
                : '#30363d',
              border: 'none', borderRadius: RADIUS,
              color: currentValueMM > 0 ? '#000' : F.dim,
              fontSize: 16, fontWeight: 800, cursor: currentValueMM > 0 ? 'pointer' : 'default',
              opacity: saving ? 0.6 : 1,
            }}>
            {saving ? 'Saving...' : 'Save Measurement'}
          </button>
        </>
      )}

      {/* ── CALCULATOR TAB ── */}
      {tab === 'calculator' && (() => {
        const L = parseFloat(calcLength) || 0;
        const W = parseFloat(calcWidth) || 0;
        const H = parseFloat(calcHeight) || 0;
        const wastePct = parseFloat(calcWaste) || 0;
        const unitSz = parseFloat(calcUnitSize) || 1;
        const unitCst = parseFloat(calcUnitCost) || 0;
        const area = L * W;
        const volume = L * W * H;
        const perimeter = 2 * (L + W);
        const wallArea = perimeter * H;
        const adjustedArea = area * (1 + wastePct / 100);
        const unitsNeeded = Math.ceil(adjustedArea / unitSz);
        const totalCost = unitsNeeded * unitCst;
        const results = [
          { label: 'Area (L x W)', value: `${area.toFixed(2)} SF`, show: L > 0 && W > 0 },
          { label: 'Perimeter', value: `${perimeter.toFixed(2)} LF`, show: L > 0 && W > 0 },
          { label: 'Wall Area (Perimeter x H)', value: `${wallArea.toFixed(2)} SF`, show: perimeter > 0 && H > 0 },
          { label: 'Volume (L x W x H)', value: `${volume.toFixed(2)} CF`, show: L > 0 && W > 0 && H > 0 },
          { label: `Adjusted Area (+${wastePct}% waste)`, value: `${adjustedArea.toFixed(2)} SF`, show: area > 0 },
          { label: `Units Needed (${unitSz} SF/unit)`, value: `${unitsNeeded} units`, show: area > 0 && unitSz > 0 },
          { label: 'Total Cost', value: `$${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, show: unitsNeeded > 0 && unitCst > 0 },
        ];
        return (
          <div style={{ ...glass, padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: F.text, marginBottom: 14 }}>Construction Calculator</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: F.dim, fontWeight: 600, display: 'block', marginBottom: 4 }}>LENGTH (FT)</label>
                <input value={calcLength} onChange={e => setCalcLength(e.target.value)} type="number" placeholder="0" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: F.dim, fontWeight: 600, display: 'block', marginBottom: 4 }}>WIDTH (FT)</label>
                <input value={calcWidth} onChange={e => setCalcWidth(e.target.value)} type="number" placeholder="0" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: F.dim, fontWeight: 600, display: 'block', marginBottom: 4 }}>HEIGHT (FT)</label>
                <input value={calcHeight} onChange={e => setCalcHeight(e.target.value)} type="number" placeholder="0" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: F.dim, fontWeight: 600, display: 'block', marginBottom: 4 }}>WASTE %</label>
                <input value={calcWaste} onChange={e => setCalcWaste(e.target.value)} type="number" placeholder="10" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: F.dim, fontWeight: 600, display: 'block', marginBottom: 4 }}>UNIT SIZE (SF)</label>
                <input value={calcUnitSize} onChange={e => setCalcUnitSize(e.target.value)} type="number" placeholder="32" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: F.dim, fontWeight: 600, display: 'block', marginBottom: 4 }}>UNIT COST ($)</label>
                <input value={calcUnitCost} onChange={e => setCalcUnitCost(e.target.value)} type="number" placeholder="0.00" style={inp} />
              </div>
            </div>
            {results.filter(r => r.show).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {results.filter(r => r.show).map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(15,20,25,0.6)', borderRadius: 10, border: `1px solid ${F.border}` }}>
                    <span style={{ fontSize: 13, color: F.dim }}>{r.label}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: r.label.includes('Cost') ? F.gold : F.text, cursor: 'pointer' }}
                      onClick={() => { navigator.clipboard.writeText(r.value.replace(/[^0-9.]/g, '')); }}>
                      {r.value}
                    </span>
                  </div>
                ))}
                <div style={{ marginTop: 4, fontSize: 10, color: F.dim, textAlign: 'center' }}>Tap any value to copy</div>
              </div>
            )}
            {results.filter(r => r.show).length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: F.dim, fontSize: 13 }}>Enter dimensions above to see calculations</div>
            )}
          </div>
        );
      })()}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <>
          {/* Summary stats */}
          {measurements.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
              {[
                { label: 'Total', value: measurements.length.toString(), color: F.gold },
                { label: 'Average', value: convertFromMM(avg, unit), color: F.blue },
                { label: 'Min', value: convertFromMM(min, unit), color: F.green },
                { label: 'Max', value: convertFromMM(max, unit), color: F.red },
              ].map(s => (
                <div key={s.label} style={{ ...glass, padding: '10px 8px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 10, color: F.dim, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>{s.label}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: '#0d1117', borderRadius: 10, padding: 3 }}>
            {([
              { key: 'all', label: 'All' },
              { key: 'linked', label: 'Linked' },
              { key: 'unlinked', label: 'Unlinked' },
            ] as { key: HistoryFilter; label: string }[]).map(f => (
              <button key={f.key} onClick={() => setHistoryFilter(f.key)}
                style={{
                  flex: 1, padding: '7px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: historyFilter === f.key ? 'rgba(212,160,23,0.12)' : 'transparent',
                  color: historyFilter === f.key ? F.gold : F.dim,
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
                  <div style={{ height: 20, width: '40%', background: '#30363d', borderRadius: 8, marginBottom: 8 }} />
                  <div style={{ height: 12, width: '60%', background: '#1e2a3a', borderRadius: 6 }} />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!historyLoading && filteredMeasurements.length === 0 && (
            <div style={{ ...glass, padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>{'\uD83D\uDCCF'}</div>
              <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: F.text }}>No Measurements Yet</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: F.dim, lineHeight: 1.5 }}>
                Connect your laser measure or enter values manually to start logging
              </p>
              <button onClick={() => setTab('measure')}
                style={{
                  background: `linear-gradient(135deg, ${F.gold} 0%, #EF8C1A 100%)`,
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
                    style={{ background: F.green, border: 'none', borderRadius: 8, padding: '0 12px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>Save</button>
                  <button onClick={() => setEditingId(null)}
                    style={{ background: '#30363d', border: `1px solid ${F.border}`, borderRadius: 8, padding: '0 10px', color: F.dim, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: F.gold, fontVariantNumeric: 'tabular-nums' }}>
                          {convertFromMM(m.value_mm, m.unit || unit)}
                        </span>
                        <span style={{ fontSize: 11, color: F.dim }}>{m.unit || 'mm'}</span>
                      </div>
                      {m.label && <p style={{ margin: '2px 0 0', fontSize: 12, color: F.text, fontWeight: 600 }}>{m.label}</p>}
                      <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: F.dim }}>
                        <span>{m.device_name || 'Manual'}</span>
                        <span>{timeAgo(m.created_at)}</span>
                        {m.room && <span style={{ color: F.blue }}>Room: {m.room}</span>}
                        {m.takeoff_item && (
                          <span style={{
                            background: 'rgba(34,197,94,0.12)', color: F.green,
                            borderRadius: 6, padding: '1px 6px', fontWeight: 600,
                          }}>Linked</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => { setEditingId(m.id); setEditLabel(m.label || ''); }}
                        style={{ background: '#1e2a3a', border: `1px solid ${F.border}`, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: F.dim }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={() => handleDelete(m.id)}
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: F.red }}>
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
      <div style={{ height: 22, width: '50%', background: '#30363d', borderRadius: 8, marginBottom: 16 }} />
      <div style={{
        background: F.card, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${F.border}`, borderRadius: RADIUS, padding: '32px 20px', textAlign: 'center', marginBottom: 16,
      }}>
        <div style={{ height: 48, width: '40%', background: '#30363d', borderRadius: 10, margin: '0 auto' }} />
      </div>
      {[1, 2].map(i => (
        <div key={i} style={{
          background: F.card, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${F.border}`, borderRadius: RADIUS, padding: 14, marginBottom: 8,
        }}>
          <div style={{ height: 14, width: '60%', background: '#1e2a3a', borderRadius: 6 }} />
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
