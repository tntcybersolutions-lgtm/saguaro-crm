'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const GOLD = '#d4a017';
const DARK = '#0d1117';
const RAISED = '#161b22';
const CARD2 = '#21262d';
const BORDER = '#30363d';
const DIM = '#8b949e';
const TEXT = '#e6edf3';
const MUTED = '#484f58';
const GREEN = '#2ea043';
const RED = '#f85149';
const AMBER = '#e3b341';
const BLUE = '#388bfd';
const PURPLE = '#a371f7';

interface BidInsight {
  csi_division: string;
  csi_description: string;
  sample_size: number;
  avg_variance_pct: number;
  over_bid_count: number;
  under_bid_count: number;
  vendor_count: number;
  recommendation: 'over_bid' | 'under_bid' | 'accurate' | 'no_data';
  suggested_contingency_pct: number;
}

interface BidSummary {
  total_historical_projects: number;
  total_bid_packages: number;
  overall_accuracy_pct: number;
  most_over_bid: string | null;
  most_under_bid: string | null;
}

function RecommendationBadge({ rec }: { rec: string }) {
  const config: Record<string, { bg: string; border: string; color: string; label: string }> = {
    over_bid:  { bg: 'rgba(248,81,73,0.1)',  border: 'rgba(248,81,73,0.3)',  color: RED,   label: 'OVER-BID' },
    under_bid: { bg: 'rgba(56,139,253,0.1)',  border: 'rgba(56,139,253,0.3)', color: BLUE,  label: 'UNDER-BID' },
    accurate:  { bg: 'rgba(46,160,67,0.1)',   border: 'rgba(46,160,67,0.3)',  color: GREEN, label: 'ACCURATE' },
    no_data:   { bg: 'rgba(139,148,158,0.1)', border: 'rgba(139,148,158,0.3)', color: DIM,  label: 'NO DATA' },
  };
  const c = config[rec] || config.no_data;
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
      padding: '2px 8px', borderRadius: 20,
      background: c.bg, border: `1px solid ${c.border}`, color: c.color,
    }}>
      {c.label}
    </span>
  );
}

function varianceColor(v: number): string {
  if (v > 5) return RED;
  if (v < -5) return BLUE;
  return GREEN;
}

export default function BidIntelligencePage() {
  const params = useParams();
  const projectId = params['projectId'] as string;
  const [insights, setInsights] = useState<BidInsight[]>([]);
  const [summary, setSummary] = useState<BidSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/bid-analytics/${projectId}`)
      .then(r => r.json())
      .then(d => {
        if (d.insights) setInsights(d.insights);
        if (d.summary) setSummary(d.summary);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div style={{ padding: 40, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: 'pulse 2s ease-in-out infinite' }}>📊</div>
          <div style={{ fontSize: 14, color: DIM }}>Loading bid intelligence...</div>
        </div>
      </div>
    );
  }

  if (!summary || insights.length === 0) {
    return (
      <div style={{ padding: '40px 28px', maxWidth: 700 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'linear-gradient(135deg, #388bfd, #a371f7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
            }}>📊</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: 0 }}>Bid Intelligence</h1>
          </div>
        </div>
        <div style={{
          background: RAISED, border: `1px solid ${BORDER}`,
          borderRadius: 12, padding: '40px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 14, opacity: 0.3 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
            No bid data yet
          </div>
          <div style={{ fontSize: 13, color: DIM, maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
            Complete your first project to see bid intelligence. Saguaro will analyze your historical
            bid accuracy by CSI division, helping you estimate more accurately on future projects.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, #388bfd, #a371f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, boxShadow: '0 0 20px rgba(56,139,253,0.3)',
          }}>📊</div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: 0 }}>Bid Intelligence</h1>
            <p style={{ fontSize: 13, color: DIM, margin: 0 }}>
              Historical bid accuracy analysis by CSI division
            </p>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(56,139,253,0.05), rgba(163,113,247,0.05))',
        border: '1px solid rgba(56,139,253,0.2)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 24,
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Projects Analyzed
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: BLUE, marginTop: 4 }}>
              {summary.total_historical_projects}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Bid Packages
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: PURPLE, marginTop: 4 }}>
              {summary.total_bid_packages}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Overall Accuracy
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: varianceColor(summary.overall_accuracy_pct), marginTop: 4 }}>
              {summary.overall_accuracy_pct > 0 ? '+' : ''}{summary.overall_accuracy_pct}%
            </div>
          </div>
          {summary.most_over_bid && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Most Over-Bid
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: RED, marginTop: 4 }}>
                Div {summary.most_over_bid}
              </div>
            </div>
          )}
          {summary.most_under_bid && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Most Under-Bid
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: BLUE, marginTop: 4 }}>
                Div {summary.most_under_bid}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Division Table */}
      <div style={{
        background: RAISED, border: `1px solid ${BORDER}`,
        borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 24px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Division Breakdown</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
              {insights.length} CSI divisions analyzed
            </div>
          </div>
        </div>

        {/* Table Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '60px 1fr 90px 90px 80px 120px 100px',
          padding: '10px 24px', borderBottom: `1px solid ${BORDER}`,
          fontSize: 9, fontWeight: 700, color: DIM, textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          <div>Div</div>
          <div>Description</div>
          <div style={{ textAlign: 'right' }}>Avg Variance</div>
          <div style={{ textAlign: 'right' }}>Samples</div>
          <div style={{ textAlign: 'right' }}>Vendors</div>
          <div style={{ textAlign: 'center' }}>Status</div>
          <div style={{ textAlign: 'right' }}>Contingency</div>
        </div>

        {/* Table Rows */}
        {insights.map((insight, i) => (
          <div
            key={insight.csi_division}
            style={{
              display: 'grid', gridTemplateColumns: '60px 1fr 90px 90px 80px 120px 100px',
              padding: '12px 24px',
              borderBottom: i < insights.length - 1 ? `1px solid ${BORDER}` : 'none',
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: BLUE, fontFamily: 'monospace' }}>
              {insight.csi_division}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{insight.csi_description}</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                {insight.over_bid_count} over · {insight.under_bid_count} under
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: varianceColor(insight.avg_variance_pct), fontFamily: 'monospace' }}>
              {insight.avg_variance_pct > 0 ? '+' : ''}{insight.avg_variance_pct}%
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: DIM }}>
              {insight.sample_size}
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: DIM }}>
              {insight.vendor_count}
            </div>
            <div style={{ textAlign: 'center' }}>
              <RecommendationBadge rec={insight.recommendation} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{
                fontSize: 11, fontWeight: 700,
                padding: '3px 8px', borderRadius: 6,
                background: 'rgba(212,160,23,0.1)',
                border: '1px solid rgba(212,160,23,0.2)',
                color: GOLD,
              }}>
                {insight.suggested_contingency_pct}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        marginTop: 20, padding: '14px 20px',
        background: 'rgba(56,139,253,0.04)',
        border: `1px solid rgba(56,139,253,0.1)`,
        borderRadius: 10,
        display: 'flex', gap: 24, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 11, color: DIM }}>
          <span style={{ fontWeight: 700, color: TEXT }}>Legend:</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: RED, display: 'inline-block' }} />
          <span style={{ fontSize: 11, color: DIM }}>Over-bid (&gt;+5%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, display: 'inline-block' }} />
          <span style={{ fontSize: 11, color: DIM }}>Accurate (±5%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: BLUE, display: 'inline-block' }} />
          <span style={{ fontSize: 11, color: DIM }}>Under-bid (&lt;-5%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: GOLD, display: 'inline-block' }} />
          <span style={{ fontSize: 11, color: DIM }}>Suggested contingency %</span>
        </div>
      </div>

      {/* Tips */}
      <div style={{
        marginTop: 16, padding: '16px 20px',
        background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8 }}>
          💡 How to use bid intelligence
        </div>
        <div style={{ fontSize: 12, color: DIM, lineHeight: 1.7 }}>
          Review the average variance for each CSI division before estimating your next project.
          Divisions marked <span style={{ color: RED, fontWeight: 600 }}>OVER-BID</span> suggest you can
          tighten your numbers. <span style={{ color: BLUE, fontWeight: 600 }}>UNDER-BID</span> divisions
          need more contingency. The suggested contingency % accounts for historical variance plus a safety margin.
          As you complete more projects, the data becomes more reliable — aim for 5+ samples per division.
        </div>
      </div>
    </div>
  );
}
