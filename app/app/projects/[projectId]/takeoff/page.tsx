'use client';
import React, { useState } from 'react';

const GOLD='#D4A017',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';

const MATS = [
  {cat:'Framing',item:'2x6 KD Stud 92-5/8" Doug Fir #2',qty:2024,unit:'EA',cost:15888},
  {cat:'Framing',item:'2x6 KD Plate 16ft',qty:2419,unit:'LF',cost:2782},
  {cat:'Concrete',item:'Ready-Mix Concrete 3000 PSI',qty:46,unit:'CY',cost:6670},
  {cat:'Concrete',item:'Rebar #4 Grade 60 Deformed',qty:3080,unit:'LF',cost:2618},
  {cat:'Roofing',item:'Architectural Shingle 30-Year Class A Impact',qty:32,unit:'SQ',cost:5280},
  {cat:'Sheathing',item:'OSB 7/16" 4x8 Sheet APA Exposure 1',qty:323,unit:'SHT',cost:9206},
  {cat:'Drywall',item:'Drywall 1/2" 4x8 Mold Resistant ASTM C1396',qty:762,unit:'SHT',cost:11049},
  {cat:'Insulation',item:'R-21 Kraft Batt 6-1/4" 15"',qty:5280,unit:'SF',cost:4488},
  {cat:'Windows',item:'Vinyl Double-Hung Window 3040 LowE2 U=0.28',qty:18,unit:'EA',cost:6930},
  {cat:'Electrical',item:'Romex NM-B 12/2 Copper 250ft Roll',qty:15,unit:'ROLL',cost:1770},
  {cat:'Plumbing',item:'PVC DWV Pipe 3" Schedule 40',qty:322,unit:'LF',cost:1352},
  {cat:'Flooring',item:'3/4"x3-1/4" Oak Hardwood Pre-Finished',qty:1320,unit:'SF',cost:11220},
  {cat:'Painting',item:'Interior Latex Eggshell - Sherwin Williams',qty:57,unit:'GAL',cost:4104},
  {cat:'Fasteners',item:'Framing Nails 16d Sinker 5-LB Box',qty:189,unit:'LBS',cost:350},
];

type Stage = 'upload' | 'processing' | 'complete';

export default function TakeoffPage() {
  const [stage, setStage] = useState<Stage>('upload');
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState(0);

  const STEPS = [
    'Detecting scale: 1/4"=1\'-0" on Sheet A1.0...',
    'Measuring rooms — Living 22\'x18\', Kitchen 16\'x14\'...',
    'Framing: 1,840 studs + 10% waste = 2,024 EA...',
    'Computing concrete, roofing, drywall, MEP rough-in...',
    'Pricing at 2025-26 contractor wholesale rates...',
  ];

  function runDemo() {
    setStage('processing'); setProgress(0); setStep(0);
    let p = 0, s = 0;
    const iv = setInterval(() => {
      p += Math.random() * 8 + 5;
      if (p >= 100) p = 100;
      setProgress(Math.round(p));
      if (p > s * 20 && s < STEPS.length - 1) { s++; setStep(s); }
      if (p >= 100) { clearInterval(iv); setTimeout(() => setStage('complete'), 600); }
    }, 400);
  }

  const total = MATS.reduce((s, m) => s + m.cost, 0);

  if (stage === 'upload') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)', padding: 40 }}>
      <div onClick={runDemo} style={{ border: '2px dashed rgba(212,160,23,.4)', borderRadius: 14, padding: '60px 80px', textAlign: 'center', cursor: 'pointer', maxWidth: 560, width: '100%', background: 'rgba(212,160,23,.02)' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>📐</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, marginBottom: 8 }}>Drop Your Blueprint Here</div>
        <div style={{ fontSize: 14, color: DIM, marginBottom: 24 }}>PDF, JPG, PNG — Claude reads every dimension automatically</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
          {['PDF', 'JPG', 'PNG', 'WebP', 'TIFF'].map(f => <span key={f} style={{ background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER}`, padding: '3px 10px', borderRadius: 5, fontSize: 11, color: DIM }}>{f}</span>)}
        </div>
        <button style={{ padding: '13px 32px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 8, color: '#0d1117', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
          Upload Blueprint / Run Demo
        </button>
      </div>
    </div>
  );

  if (stage === 'processing') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)', padding: 40 }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},#2272c3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🤖</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>Claude is reading your blueprint</div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{STEPS[step]}</div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: GOLD }}>{progress}%</div>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 4, marginBottom: 24 }}>
          <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg,${GOLD},#F0C040)`, borderRadius: 4, transition: 'width .3s' }} />
        </div>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, marginBottom: 8, background: i < step ? 'rgba(26,138,74,.06)' : i === step ? 'rgba(212,160,23,.08)' : 'rgba(255,255,255,.02)', border: `1px solid ${i < step ? 'rgba(26,138,74,.3)' : i === step ? 'rgba(212,160,23,.3)' : 'rgba(38,51,71,.5)'}` }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, background: i < step ? 'rgba(26,138,74,.2)' : i === step ? 'rgba(212,160,23,.15)' : 'rgba(255,255,255,.05)', color: i < step ? '#3dd68c' : i === step ? GOLD : DIM }}>
              {i < step ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 13, color: i <= step ? TEXT : DIM }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // COMPLETE
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <div style={{ background: 'linear-gradient(135deg,rgba(212,160,23,.12),rgba(26,95,168,.2))', borderBottom: '1px solid rgba(212,160,23,.3)', padding: '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: GOLD }}>✅ Takeoff complete in 47 seconds — {MATS.length} materials calculated</div>
          <div style={{ fontSize: 12, color: DIM }}>Traditional estimating: 4–8 hours · You saved $450–$900 in estimating time</div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[{ l: 'Materials', v: '$' + total.toLocaleString() }, { l: 'Labor Est.', v: '$142,000' }, { l: 'Total', v: '$' + (total + 142000).toLocaleString() }, { l: 'Cost/SF', v: '$165' }].map(k => (
            <div key={k.l} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: .5 }}>{k.l}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>{k.v}</div>
            </div>
          ))}
          <button style={{ padding: '8px 16px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 7, color: '#0d1117', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Auto-Build Project →</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#0a1117', position: 'sticky', top: 0, zIndex: 5 }}>
              {['Category', 'Material / Specification', 'Qty (w/ waste)', 'Unit', 'Total Cost'].map((h, i) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: i >= 2 ? 'right' : 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: DIM, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATS.map((m, i) => (
              <tr key={i} style={{ borderBottom: `1px solid rgba(38,51,71,.4)` }}>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 3, background: 'rgba(212,160,23,.1)', color: GOLD }}>{m.cat}</span>
                </td>
                <td style={{ padding: '10px 14px', color: TEXT }}>{m.item}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: GOLD, fontWeight: 700 }}>{m.qty.toLocaleString()}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: DIM }}>{m.unit}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: TEXT }}>${m.cost.toLocaleString()}</td>
              </tr>
            ))}
            <tr style={{ background: 'rgba(212,160,23,.06)', borderTop: '2px solid rgba(212,160,23,.3)' }}>
              <td colSpan={4} style={{ padding: '12px 14px', fontWeight: 800, color: GOLD }}>TOTAL — {MATS.length} LINE ITEMS</td>
              <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, fontSize: 16, color: GOLD }}>${total.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
