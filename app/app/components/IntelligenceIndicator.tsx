'use client';
import { useState, useEffect, useRef } from 'react';

export type IndicatorVariant =
  | 'scanning'    // Blueprint scan animation
  | 'generating'  // Purple rotating rings + ✨
  | 'calculating' // Cascading gold digits
  | 'loading'     // Arc spinner
  | 'uploading'   // Particles rising to cloud
  | 'processing'  // Assembly line steps
  | 'thinking'    // Brain wave pulses
  | 'syncing';    // Connected nodes animation

export type IndicatorSize = 'xs' | 'sm' | 'md' | 'lg' | 'full';

export interface SequentialItem {
  label: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  count?: number;
  detail?: string;
}

interface IntelligenceIndicatorProps {
  variant?: IndicatorVariant;
  size?: IndicatorSize;
  message?: string;
  subMessage?: string;
  progress?: number;
  showProgress?: boolean;
  items?: SequentialItem[];
  onItemClick?: (idx: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

const DIMS: Record<IndicatorSize, { icon: number; font: number; sub: number }> = {
  xs:   { icon: 20,  font: 11, sub: 10 },
  sm:   { icon: 32,  font: 12, sub: 11 },
  md:   { icon: 56,  font: 15, sub: 12 },
  lg:   { icon: 80,  font: 18, sub: 13 },
  full: { icon: 110, font: 22, sub: 14 },
};

const DEFAULTS: Record<IndicatorVariant, { msg: string; sub: string; color: string }> = {
  scanning:    { msg: 'Sage AI is scanning your plans...', sub: 'Reading every sheet, every dimension, every note', color: '#d4a017' },
  generating:  { msg: 'Sage AI is generating...', sub: 'Writing professional construction documentation', color: '#a371f7' },
  calculating: { msg: 'Calculating...', sub: 'Computing quantities, costs, and markups', color: '#d4a017' },
  loading:     { msg: 'Loading your data...', sub: 'Fetching records from your project', color: '#388bfd' },
  uploading:   { msg: 'Uploading to secure storage...', sub: 'File encrypted and stored in your account', color: '#2ea043' },
  processing:  { msg: 'Processing...', sub: 'Building your document', color: '#d4a017' },
  thinking:    { msg: 'Sage AI is analyzing...', sub: 'Reviewing project data and context', color: '#a371f7' },
  syncing:     { msg: 'Syncing with connected modules...', sub: 'Updating bid packages, RFIs, and punch list', color: '#388bfd' },
};

/* ── SCANNING: Blueprint grid + gold scan line ─────────── */
function ScanningIcon({ dim }: { dim: number }) {
  return (
    <svg width={dim} height={dim * 0.75} viewBox="0 0 100 75">
      <defs>
        <pattern id="bpGrid" width="12.5" height="12.5" patternUnits="userSpaceOnUse">
          <path d="M 12.5 0 L 0 0 0 12.5" fill="none"
            stroke="rgba(212,160,23,0.18)" strokeWidth="0.6"/>
        </pattern>
        <linearGradient id="scanFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4a017" stopOpacity="0.8"/>
          <stop offset="100%" stopColor="#d4a017" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <rect width="100" height="75" fill="url(#bpGrid)" rx="4"/>
      <rect x="12" y="10" width="76" height="55" fill="none"
        stroke="rgba(212,160,23,0.5)" strokeWidth="1.2"
        strokeDasharray="264" strokeDashoffset="264">
        <animate attributeName="stroke-dashoffset"
          values="264;0" dur="1.8s" fill="freeze" calcMode="spline"
          keySplines="0.42 0 0.58 1"/>
      </rect>
      {[22,42,62].map((x,i) => [18,34,50].map((y,j) => (
        <rect key={`${i}-${j}`} x={x} y={y} width="12" height="9"
          fill="none" stroke="rgba(212,160,23,0.35)" strokeWidth="0.8"
          opacity="0">
          <animate attributeName="opacity"
            values="0;1" dur="0.3s" fill="freeze"
            begin={`${0.8 + i * 0.15 + j * 0.1}s`}/>
        </rect>
      )))}
      <rect x="0" y="0" width="100" height="3" fill="url(#scanFade)">
        <animateTransform attributeName="transform" type="translate"
          values="0 0;0 72;0 0" dur="2.2s" repeatCount="indefinite"/>
      </rect>
      <rect x="0" y="0" width="100" height="1" fill="#d4a017" opacity="0.9">
        <animateTransform attributeName="transform" type="translate"
          values="0 0;0 72;0 0" dur="2.2s" repeatCount="indefinite"/>
      </rect>
    </svg>
  );
}

/* ── GENERATING: Three concentric purple rings + ✨ ──── */
function GeneratingIcon({ dim }: { dim: number }) {
  return (
    <div style={{ position: 'relative', width: dim, height: dim }}>
      <svg style={{ position: 'absolute', inset: 0, animation: 'intRotate 4s linear infinite' }}
        width={dim} height={dim} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="none"
          stroke="rgba(163,113,247,0.25)" strokeWidth="1.5"
          strokeDasharray="60 230"/>
        <circle cx="50" cy="50" r="46" fill="none"
          stroke="rgba(163,113,247,0.1)" strokeWidth="1.5"
          strokeDasharray="120 170" strokeDashoffset="60"/>
      </svg>
      <svg style={{ position: 'absolute', inset: 0, animation: 'intRotate 2.5s linear infinite reverse' }}
        width={dim} height={dim} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="35" fill="none"
          stroke="rgba(163,113,247,0.4)" strokeWidth="2"
          strokeDasharray="40 180"/>
      </svg>
      <svg style={{ position: 'absolute', inset: 0, animation: 'intRotate 1.8s linear infinite' }}
        width={dim} height={dim} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="24" fill="none"
          stroke="rgba(210,168,255,0.5)" strokeWidth="1.5"
          strokeDasharray="25 126"/>
      </svg>
      <div style={{
        position: 'absolute', inset: '25%', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(163,113,247,0.25) 0%, transparent 70%)',
        animation: 'intPulse 2s ease-in-out infinite',
      }}/>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: dim * 0.32,
        animation: 'intPulse 2.5s ease-in-out infinite',
        filter: 'drop-shadow(0 0 8px rgba(163,113,247,0.6))',
      }}>✨</div>
    </div>
  );
}

/* ── CALCULATING: Gold number cascade ──────────────── */
function CalculatingIcon({ dim }: { dim: number }) {
  const targets = ['$', '8', '9', ',', '2', '0', '0'];
  const [nums, setNums] = useState(targets);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const randomize = () => {
      if (!mounted.current) return;
      setNums(targets.map((t, i) =>
        t === '$' || t === ',' ? t : String(Math.floor(Math.random() * 10))
      ));
    };
    const iv = setInterval(randomize, 100);
    const to = setTimeout(() => { clearInterval(iv); if (mounted.current) setNums(targets); }, 1200);
    return () => { mounted.current = false; clearInterval(iv); clearTimeout(to); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: dim * 0.26, fontWeight: 800, color: '#d4a017',
      display: 'flex', alignItems: 'center', gap: 1,
      textShadow: '0 0 24px rgba(212,160,23,0.5)', letterSpacing: '-1px',
    }}>
      {nums.map((n, i) => (
        <span key={i} style={{ display: 'inline-block' }}>{n}</span>
      ))}
    </div>
  );
}

/* ── UPLOADING: Particles rising from doc to cloud ──── */
function UploadingIcon({ dim }: { dim: number }) {
  const h = dim * 0.75;
  return (
    <div style={{ position: 'relative', width: dim, height: h }}>
      <div style={{ position: 'absolute', bottom: 4, left: '10%', fontSize: dim * 0.3 }}>📄</div>
      <div style={{ position: 'absolute', top: 4, right: '10%', fontSize: dim * 0.3 }}>☁️</div>
      {[0,1,2,3,4,5].map(i => (
        <div key={i} style={{
          position: 'absolute', bottom: '25%', left: `${16 + i * 13}%`,
          width: dim * 0.07, height: dim * 0.07, borderRadius: '50%',
          background: i % 2 === 0 ? '#2ea043' : '#d4a017',
          animation: `intParticleRise 1.8s ease-in infinite`,
          animationDelay: `${i * 0.28}s`, opacity: 0,
        }}/>
      ))}
    </div>
  );
}

/* ── PROCESSING: Assembly line steps ───────────────── */
function ProcessingIcon({ dim }: { dim: number }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % 3), 800);
    return () => clearInterval(t);
  }, []);
  const steps = [
    { icon: '📋', label: 'Collect' },
    { icon: '⚙️', label: 'Build' },
    { icon: '📄', label: 'Package' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '6px 10px',
            background: step === i ? 'rgba(212,160,23,0.15)' : 'rgba(22,27,34,0.8)',
            border: `1px solid ${step === i ? 'rgba(212,160,23,0.4)' : '#30363d'}`,
            borderRadius: 8, transition: 'all 0.3s ease',
          }}>
            <span style={{ fontSize: dim * 0.22 }}>{s.icon}</span>
            <span style={{
              fontSize: dim * 0.1, fontWeight: 600,
              color: step === i ? '#d4a017' : '#6e7681',
            }}>{s.label}</span>
          </div>
          {i < 2 && (
            <div style={{
              fontSize: dim * 0.12,
              color: step > i ? '#2ea043' : '#484f58',
              transition: 'color 0.3s ease',
            }}>→</div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── THINKING: Brain wave pulses ────────────────────── */
function ThinkingIcon({ dim }: { dim: number }) {
  return (
    <div style={{ position: 'relative', width: dim, height: dim * 0.6 }}>
      <svg width={dim} height={dim * 0.6} viewBox="0 0 120 60">
        <polyline points="0,30 15,30" fill="none" stroke="#484f58" strokeWidth="1.5"/>
        <polyline points="15,30 22,30 28,10 34,50 40,20 46,40 52,30 58,30"
          fill="none" stroke="#a371f7" strokeWidth="2"
          strokeDasharray="200" strokeDashoffset="200">
          <animate attributeName="stroke-dashoffset"
            values="200;0;0;200" dur="2s" repeatCount="indefinite"
            keyTimes="0;0.4;0.7;1"/>
        </polyline>
        <polyline points="58,30 120,30" fill="none" stroke="#484f58" strokeWidth="1.5"/>
        <circle cx="58" cy="30" r="4" fill="#a371f7" opacity="0.8">
          <animate attributeName="opacity"
            values="0;1;0" dur="2s" repeatCount="indefinite"
            keyTimes="0;0.4;1"/>
        </circle>
      </svg>
    </div>
  );
}

/* ── SYNCING: Connected nodes ──────────────────────── */
function SyncingIcon({ dim }: { dim: number }) {
  const nodes = [
    { x: 60, y: 10, label: 'Takeoff' },
    { x: 10, y: 45, label: 'Bids' },
    { x: 110, y: 45, label: 'RFIs' },
    { x: 35, y: 80, label: 'Punch' },
    { x: 85, y: 80, label: 'SOV' },
  ];
  const edges: [number,number][] = [[0,1],[0,2],[0,3],[0,4],[1,3],[2,4]];
  return (
    <svg width={dim} height={dim * 0.9} viewBox="0 0 120 95">
      {edges.map(([a,b],i) => (
        <line key={i}
          x1={nodes[a].x} y1={nodes[a].y}
          x2={nodes[b].x} y2={nodes[b].y}
          stroke="rgba(56,139,253,0.3)" strokeWidth="1"
          strokeDasharray="4 4">
          <animate attributeName="stroke-dashoffset"
            values="8;0" dur="1s" repeatCount="indefinite"/>
        </line>
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r="9"
            fill={i === 0 ? 'rgba(212,160,23,0.2)' : 'rgba(56,139,253,0.15)'}
            stroke={i === 0 ? '#d4a017' : '#388bfd'} strokeWidth="1.5">
            <animate attributeName="r"
              values="9;11;9" dur="2s" repeatCount="indefinite"
              begin={`${i * 0.4}s`}/>
          </circle>
          <text x={n.x} y={n.y + 22}
            textAnchor="middle" fill="#6e7681"
            fontSize="7" fontWeight="600">
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ── VARIANT DISPATCHER ────────────────────────────── */
function VariantIcon({ variant, dim }: { variant: IndicatorVariant; dim: number }) {
  switch (variant) {
    case 'scanning':    return <ScanningIcon dim={dim} />;
    case 'generating':  return <GeneratingIcon dim={dim} />;
    case 'calculating': return <CalculatingIcon dim={dim} />;
    case 'uploading':   return <UploadingIcon dim={dim} />;
    case 'processing':  return <ProcessingIcon dim={dim} />;
    case 'thinking':    return <ThinkingIcon dim={dim} />;
    case 'syncing':     return <SyncingIcon dim={dim} />;
    default: {
      const c = DEFAULTS.loading.color;
      return (
        <svg width={dim} height={dim} viewBox="0 0 100 100"
          style={{ animation: 'intRotate 1.1s linear infinite' }}>
          <circle cx="50" cy="50" r="44" fill="none" stroke="#21262d" strokeWidth="5"/>
          <circle cx="50" cy="50" r="44" fill="none" stroke={c}
            strokeWidth="5" strokeLinecap="round" strokeDasharray="90 190"
            style={{ filter: `drop-shadow(0 0 8px ${c}88)` }}/>
        </svg>
      );
    }
  }
}

/* ── GLOBAL CSS KEYFRAMES ──────────────────────────── */
const KEYFRAMES = `
@keyframes intRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes intPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .6; transform: scale(0.92); } }
@keyframes intParticleRise {
  0%   { transform: translateY(0) scale(1); opacity: 0; }
  15%  { opacity: 1; }
  85%  { opacity: 0.8; }
  100% { transform: translateY(-50px) scale(0.3); opacity: 0; }
}
@keyframes intShimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;

/* ── MAIN EXPORT ───────────────────────────────────── */
export function IntelligenceIndicator({
  variant = 'loading',
  size = 'md',
  message,
  subMessage,
  progress,
  showProgress = false,
  items = [],
  onItemClick,
  style,
}: IntelligenceIndicatorProps) {
  const [displayedItems, setDisplayedItems] = useState<SequentialItem[]>(items);
  const prevRef = useRef(items);

  useEffect(() => {
    prevRef.current = items;
    setDisplayedItems(items);
  }, [items]);

  const d = DIMS[size];
  const def = DEFAULTS[variant];
  const primaryMsg = message || def.msg;
  const subMsg = subMessage || def.sub;
  const accentColor = def.color;
  const isInline = size === 'xs' || size === 'sm';

  if (isInline) return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
        <VariantIcon variant={variant} dim={d.icon} />
        <span style={{ fontSize: d.font, color: accentColor, fontWeight: 600 }}>
          {primaryMsg}
        </span>
      </div>
    </>
  );

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: size === 'full' ? '60px 40px' : size === 'lg' ? '40px 32px' : '28px 24px',
        gap: size === 'full' ? 20 : 14, ...style,
      }}>
        <VariantIcon variant={variant} dim={d.icon} />

        <div style={{
          fontSize: d.font, fontWeight: 700, color: accentColor,
          textAlign: 'center', letterSpacing: '-0.01em',
        }}>
          {primaryMsg}
        </div>

        {subMsg && (size === 'md' || size === 'lg' || size === 'full') && (
          <div style={{
            fontSize: d.sub, color: '#8b949e', textAlign: 'center',
            maxWidth: 380, lineHeight: 1.65,
          }}>
            {subMsg}
          </div>
        )}

        {showProgress && progress !== undefined && (
          <div style={{ width: '100%', maxWidth: size === 'lg' || size === 'full' ? 360 : 260 }}>
            <div style={{ height: 6, background: '#21262d', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${Math.max(4, progress)}%`, borderRadius: 3,
                background: variant === 'generating' || variant === 'thinking'
                  ? 'linear-gradient(90deg, #a371f7, #d2a8ff)'
                  : variant === 'scanning' || variant === 'calculating' || variant === 'processing'
                  ? 'linear-gradient(90deg, #d4a017, #f0c040)'
                  : variant === 'uploading'
                  ? 'linear-gradient(90deg, #2ea043, #39d353)'
                  : '#388bfd',
                transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)',
                  backgroundSize: '200% 100%', animation: 'intShimmer 1.5s linear infinite',
                }}/>
              </div>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              marginTop: 5, fontSize: 11, color: '#6e7681',
            }}>
              <span>{progress < 100 ? 'In progress...' : 'Complete'}</span>
              <span style={{ color: accentColor, fontWeight: 700 }}>{progress}%</span>
            </div>
          </div>
        )}

        {displayedItems.length > 0 && (size === 'lg' || size === 'full') && (
          <div style={{
            width: '100%', maxWidth: size === 'full' ? 480 : 380,
            background: '#161b22', border: '1px solid #30363d',
            borderRadius: 10, overflow: 'hidden', marginTop: 4,
          }}>
            {displayedItems.map((item, idx) => (
              <div key={idx} onClick={() => onItemClick?.(idx)} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '11px 16px',
                borderBottom: idx < displayedItems.length - 1 ? '1px solid #21262d' : 'none',
                background: item.status === 'running' ? 'rgba(212,160,23,0.05)'
                  : item.status === 'complete' ? 'rgba(46,160,67,0.03)' : 'transparent',
                transition: 'background 0.35s ease',
                cursor: onItemClick ? 'pointer' : 'default',
              }}>
                <span style={{
                  fontSize: 15, flexShrink: 0, marginTop: 1, fontWeight: 700,
                  color: item.status === 'complete' ? '#2ea043'
                    : item.status === 'running' ? '#d4a017'
                    : item.status === 'failed' ? '#f85149' : '#484f58',
                  animation: item.status === 'running' ? 'intPulse 1.5s ease-in-out infinite' : 'none',
                }}>
                  {item.status === 'complete' ? '✓' : item.status === 'running' ? '⟳'
                    : item.status === 'failed' ? '✕' : '○'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: item.status === 'running' ? 700 : 500,
                    color: item.status === 'complete' ? '#6e7681'
                      : item.status === 'running' ? '#e6edf3' : '#484f58',
                    textDecoration: item.status === 'complete' ? 'line-through' : 'none',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {item.label}
                  </div>
                  {item.detail && item.status === 'running' && (
                    <div style={{ fontSize: 10, color: '#8b949e', marginTop: 2 }}>
                      {item.detail}
                    </div>
                  )}
                </div>
                {item.count !== undefined && item.count > 0 && item.status === 'complete' && (
                  <span style={{
                    background: 'rgba(212,160,23,0.15)',
                    border: '1px solid rgba(212,160,23,0.3)',
                    color: '#d4a017', fontSize: 10, fontWeight: 700,
                    padding: '2px 7px', borderRadius: 20, flexShrink: 0,
                  }}>+{item.count}</span>
                )}
                {item.status === 'running' && (
                  <span style={{
                    fontSize: 10, color: '#d4a017', fontWeight: 600, flexShrink: 0,
                    animation: 'intPulse 1.5s ease-in-out infinite',
                  }}>Working</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
