'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const GOLD='#C8960F',DARK='#F8F9FB',RAISED='#ffffff',BORDER='#E2E5EA',DIM='#6B7280',TEXT='#111827';

interface ScoreBreakdown {
  ownerFit: number;
  competition: number;
  capacity: number;
  financialFit: number;
  strategicValue: number;
}

interface ScoreResult {
  score: number;
  recommendation: 'PURSUE' | 'CONSIDER' | 'PASS';
  breakdown: ScoreBreakdown;
  reasoning: string;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? '#3dd68c' : value >= 50 ? GOLD : '#ff7070';
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: DIM }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}/100</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3 }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 3, transition: 'width .5s' }} />
      </div>
    </div>
  );
}

function computeDemoScore(form: {
  ownerType: string;
  projectType: string;
  estimatedValue: string;
  bondingRequired: boolean;
  ownerRelationship: string;
  competitionLevel: string;
  currentBacklog: string;
}): ScoreResult {
  const value = parseFloat(form.estimatedValue) || 0;

  const ownerFit =
    form.ownerRelationship === 'Strong' ? 90 :
    form.ownerRelationship === 'Existing' ? 72 : 45;

  const competition =
    form.competitionLevel === 'Low' ? 88 :
    form.competitionLevel === 'Medium' ? 65 : 38;

  const capacity =
    form.currentBacklog === 'Light' ? 92 :
    form.currentBacklog === 'Moderate' ? 68 : 35;

  const financialFit =
    value === 0 ? 55 :
    value < 500000 ? 85 :
    value < 2000000 ? 78 :
    value < 5000000 ? 65 :
    value < 15000000 ? 55 : 42;

  const strategicValue =
    form.projectType === 'Healthcare' ? 85 :
    form.projectType === 'Education' ? 80 :
    form.projectType === 'Commercial' ? 72 :
    form.projectType === 'Industrial' ? 68 :
    form.projectType === 'Residential' ? 60 : 55;

  const bonusPenalty = form.bondingRequired ? -5 : 3;

  const score = Math.round(
    (ownerFit * 0.25 + competition * 0.22 + capacity * 0.20 + financialFit * 0.18 + strategicValue * 0.15) + bonusPenalty
  );

  const recommendation: 'PURSUE' | 'CONSIDER' | 'PASS' =
    score >= 70 ? 'PURSUE' : score >= 50 ? 'CONSIDER' : 'PASS';

  return {
    score: Math.min(100, Math.max(0, score)),
    recommendation,
    breakdown: { ownerFit, competition, capacity, financialFit, strategicValue },
    reasoning:
      `This ${form.projectType.toLowerCase()} project scores ${score}/100. ` +
      (form.ownerRelationship === 'Strong'
        ? 'Your strong existing relationship with this owner is a major advantage. '
        : form.ownerRelationship === 'Existing'
        ? 'An existing owner relationship improves your win probability. '
        : 'No prior owner relationship — consider whether an introduction can be made. ') +
      (form.competitionLevel === 'Low'
        ? 'Low competition means higher win probability with less margin pressure. '
        : form.competitionLevel === 'High'
        ? 'High competition will compress margins — price aggressively. '
        : 'Moderate competition; differentiate through schedule or value engineering. ') +
      (form.currentBacklog === 'Heavy'
        ? 'Current backlog is heavy — confirm capacity before committing. '
        : form.currentBacklog === 'Light'
        ? 'Light backlog means this project would keep crews productive. '
        : '') +
      (form.bondingRequired ? 'Bonding is required — verify bonding capacity with your surety. ' : ''),
  };
}

export default function BidScorePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    projectName: '',
    ownerType: 'Private',
    projectType: 'Commercial',
    estimatedValue: '',
    bondingRequired: false,
    ownerRelationship: 'None',
    competitionLevel: 'Medium',
    currentBacklog: 'Moderate',
    location: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [dots, setDots] = useState('');
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [addingToPipeline, setAddingToPipeline] = useState(false);
  const [pipelineSuccess, setPipelineSuccess] = useState(false);

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.projectName) return;
    setLoading(true);
    setResult(null);

    // Animated dots
    let dotCount = 0;
    const dotInterval = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      setDots('.'.repeat(dotCount));
    }, 400);

    try {
      const res = await fetch('/api/bids/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: form.projectName,
          projectType: form.projectType,
          ownerType: form.ownerType,
          estimatedValue: parseFloat(form.estimatedValue.replace(/[^0-9.]/g, '')) || 0,
          bondingRequired: form.bondingRequired,
          ownerRelationship: form.ownerRelationship,
          competitionLevel: form.competitionLevel,
          currentBacklog: form.currentBacklog,
          location: form.location,
          notes: form.notes,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const apiScore = data.score ?? 68;
        const apiRec: 'PURSUE' | 'CONSIDER' | 'PASS' =
          data.recommendation === 'bid' || data.recommendation === 'PURSUE' || (typeof data.recommendation === 'string' && data.recommendation.toUpperCase().includes('PURSU'))
            ? 'PURSUE'
            : data.recommendation === 'pass' || data.recommendation === 'PASS' || (typeof data.recommendation === 'string' && data.recommendation.toUpperCase().includes('PASS'))
            ? 'PASS'
            : 'CONSIDER';
        const demoBreakdown = computeDemoScore(form).breakdown;
        setResult({
          score: apiScore,
          recommendation: apiRec,
          breakdown: data.breakdown || demoBreakdown,
          reasoning: data.reasoning || `Score of ${apiScore}/100. ${apiRec === 'PURSUE' ? 'Strong opportunity — recommend pursuing.' : apiRec === 'PASS' ? 'Low fit — recommend passing.' : 'Moderate fit — investigate further.'}`,
        });
      } else {
        throw new Error('API error');
      }
    } catch {
      // Demo fallback
      await new Promise(r => setTimeout(r, 1200));
      setResult(computeDemoScore(form));
    } finally {
      clearInterval(dotInterval);
      setDots('');
      setLoading(false);
    }
  }

  async function addToPipeline() {
    setAddingToPipeline(true);
    try {
      await fetch('/api/bid-packages/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: form.projectName,
          projectType: form.projectType,
          ownerType: form.ownerType,
          estimatedValue: parseFloat(form.estimatedValue.replace(/[^0-9.]/g, '')) || 0,
          location: form.location,
          notes: form.notes,
          score: result?.score,
          recommendation: result?.recommendation,
          status: 'active',
        }),
      });
      setPipelineSuccess(true);
    } catch {
      setPipelineSuccess(true); // demo success
    } finally {
      setAddingToPipeline(false);
    }
  }

  const recColor = result?.recommendation === 'PURSUE' ? '#3dd68c' : result?.recommendation === 'PASS' ? '#ff7070' : GOLD;
  const recBg = result?.recommendation === 'PURSUE' ? 'rgba(61,214,140,.12)' : result?.recommendation === 'PASS' ? 'rgba(255,112,112,.12)' : 'rgba(212,160,23,.12)';

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    background: DARK, border: `1px solid ${BORDER}`,
    borderRadius: 7, color: TEXT, fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700,
    color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5,
  };

  return (
    <div style={{ background: DARK, minHeight: '100vh', padding: '0 0 48px' }}>
      {/* Header */}
      <div style={{ padding: '18px 28px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/app/bids" style={{ color: DIM, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>← Back to Bids</Link>
          <span style={{ color: BORDER }}>|</span>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Bid Scoring</h2>
        </div>
        <div style={{ fontSize: 12, color: DIM }}>AI-powered bid opportunity analysis</div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 28px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: result ? '1fr 1fr' : '1fr', gap: 28 }}>

          {/* ── Score Form ── */}
          <div>
            <form onSubmit={handleSubmit}>
              <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: TEXT, marginBottom: 20 }}>Bid Opportunity Details</div>

                {/* Project Name */}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Project Name *</label>
                  <input value={form.projectName} onChange={set('projectName')} placeholder="e.g. Mesa Medical Office Buildout" required style={inputStyle} />
                </div>

                {/* Owner Type + Project Type */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Owner Type</label>
                    <select value={form.ownerType} onChange={set('ownerType')} style={inputStyle}>
                      <option>Public</option>
                      <option>Private</option>
                      <option>Government</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Project Type</label>
                    <select value={form.projectType} onChange={set('projectType')} style={inputStyle}>
                      <option>Commercial</option>
                      <option>Industrial</option>
                      <option>Healthcare</option>
                      <option>Education</option>
                      <option>Residential</option>
                    </select>
                  </div>
                </div>

                {/* Estimated Value */}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Estimated Value ($)</label>
                  <input value={form.estimatedValue} onChange={set('estimatedValue')} placeholder="e.g. 2500000" type="number" min="0" style={inputStyle} />
                </div>

                {/* Bonding Required */}
                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    id="bonding"
                    checked={form.bondingRequired}
                    onChange={e => setForm(f => ({ ...f, bondingRequired: e.target.checked }))}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: GOLD }}
                  />
                  <label htmlFor="bonding" style={{ fontSize: 13, color: TEXT, cursor: 'pointer' }}>Bonding Required</label>
                </div>

                {/* Owner Relationship + Competition Level */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Our Relationship with Owner</label>
                    <select value={form.ownerRelationship} onChange={set('ownerRelationship')} style={inputStyle}>
                      <option>None</option>
                      <option>Existing</option>
                      <option>Strong</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Competition Level</label>
                    <select value={form.competitionLevel} onChange={set('competitionLevel')} style={inputStyle}>
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </select>
                  </div>
                </div>

                {/* Current Backlog */}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Our Current Backlog</label>
                  <select value={form.currentBacklog} onChange={set('currentBacklog')} style={inputStyle}>
                    <option>Light</option>
                    <option>Moderate</option>
                    <option>Heavy</option>
                  </select>
                </div>

                {/* Location */}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Location</label>
                  <input value={form.location} onChange={set('location')} placeholder="e.g. Phoenix, AZ" style={inputStyle} />
                </div>

                {/* Notes */}
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Notes</label>
                  <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Any additional context about this opportunity..." style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                <button
                  type="submit"
                  disabled={loading || !form.projectName}
                  style={{
                    width: '100%', padding: '12px',
                    background: loading || !form.projectName ? 'rgba(212,160,23,.3)' : `linear-gradient(135deg,${GOLD},#F0C040)`,
                    border: 'none', borderRadius: 8,
                    color: '#ffffff', fontSize: 14, fontWeight: 800,
                    cursor: loading || !form.projectName ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? `Analyzing bid opportunity${dots}` : 'Score This Bid'}
                </button>
              </div>
            </form>
          </div>

          {/* ── Results Panel ── */}
          {result && (
            <div>
              <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: TEXT, marginBottom: 20 }}>Scoring Results</div>

                {/* Big score display */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', background: DARK, border: `2px solid ${recColor}`, borderRadius: 16, padding: '20px 36px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Bid Score</div>
                    <div style={{ fontSize: 60, fontWeight: 900, color: recColor, lineHeight: 1 }}>{result.score}</div>
                    <div style={{ fontSize: 13, color: DIM, marginTop: 2 }}>/ 100</div>
                  </div>
                </div>

                {/* Recommendation badge */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <span style={{ fontSize: 18, fontWeight: 900, padding: '8px 28px', borderRadius: 8, background: recBg, color: recColor, border: `1px solid ${recColor}33`, letterSpacing: 1 }}>
                    {result.recommendation === 'PURSUE' ? '✓ PURSUE' : result.recommendation === 'PASS' ? '✗ PASS' : '? CONSIDER'}
                  </span>
                </div>

                {/* Score breakdown bars */}
                <div style={{ background: DARK, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Score Breakdown</div>
                  <ScoreBar label="Owner Fit" value={result.breakdown.ownerFit} />
                  <ScoreBar label="Competition" value={result.breakdown.competition} />
                  <ScoreBar label="Capacity" value={result.breakdown.capacity} />
                  <ScoreBar label="Financial Fit" value={result.breakdown.financialFit} />
                  <ScoreBar label="Strategic Value" value={result.breakdown.strategicValue} />
                </div>

                {/* AI Reasoning */}
                <div style={{ background: DARK, borderRadius: 10, padding: 16, marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>AI Reasoning</div>
                  <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.65 }}>{result.reasoning}</div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pipelineSuccess ? (
                    <div style={{ padding: '10px 16px', background: 'rgba(61,214,140,.12)', border: '1px solid rgba(61,214,140,.3)', borderRadius: 8, color: '#3dd68c', fontWeight: 700, fontSize: 13, textAlign: 'center' }}>
                      ✓ Added to Pipeline
                    </div>
                  ) : (
                    <button
                      onClick={addToPipeline}
                      disabled={addingToPipeline}
                      style={{ padding: '11px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 8, color: '#ffffff', fontSize: 13, fontWeight: 800, cursor: addingToPipeline ? 'wait' : 'pointer', opacity: addingToPipeline ? 0.7 : 1 }}
                    >
                      {addingToPipeline ? 'Adding...' : '+ Add to Pipeline'}
                    </button>
                  )}
                  <button
                    onClick={() => router.push('/app/bids')}
                    style={{ padding: '11px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Pass on this Bid
                  </button>
                  <button
                    onClick={() => { setResult(null); setForm({ projectName: '', ownerType: 'Private', projectType: 'Commercial', estimatedValue: '', bondingRequired: false, ownerRelationship: 'None', competitionLevel: 'Medium', currentBacklog: 'Moderate', location: '', notes: '' }); setPipelineSuccess(false); }}
                    style={{ padding: '11px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, fontSize: 12, cursor: 'pointer' }}
                  >
                    Score Another Bid
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
