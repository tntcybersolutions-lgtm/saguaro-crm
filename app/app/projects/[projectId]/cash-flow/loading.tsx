'use client';

const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const GOLD = '#C8960F';
const DARK = '#F8F9FB';

function Pulse({ w, h, mb }: { w: string; h: number; mb?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 4,
        background: BORDER,
        animation: 'skeletonPulse 1.4s ease-in-out infinite',
        marginBottom: mb ?? 0,
      }}
    />
  );
}

export default function CashFlowLoading() {
  return (
    <>
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .3; }
        }
      `}</style>
      <div style={{ minHeight: '100vh', background: DARK }}>
        {/* Gold loading bar */}
        <div
          style={{
            position: 'fixed',
            top: 56,
            left: 0,
            right: 0,
            height: 2,
            zIndex: 200,
            background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
            animation: 'skeletonPulse 1s ease-in-out infinite',
          }}
        />

        {/* Header skeleton */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <Pulse w="80px" h={11} mb={6} />
              <Pulse w="220px" h={22} mb={4} />
              <Pulse w="300px" h={13} />
            </div>
            <Pulse w="160px" h={40} />
          </div>
        </div>

        {/* KPI row */}
        <div style={{ padding: '0 28px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: RAISED,
                borderRadius: 8,
                padding: '16px 20px',
                border: `1px solid ${BORDER}`,
              }}
            >
              <Pulse w="70%" h={11} mb={8} />
              <Pulse w="50%" h={22} />
            </div>
          ))}
        </div>

        {/* Chart skeleton */}
        <div style={{ padding: '0 28px', marginBottom: 24 }}>
          <div style={{
            background: RAISED, borderRadius: 10, border: `1px solid ${BORDER}`,
            padding: '20px 24px',
          }}>
            <Pulse w="200px" h={14} mb={16} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 160 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', gap: 3, alignItems: 'flex-end', justifyContent: 'center' }}>
                  <div style={{
                    width: 24, height: 40 + Math.random() * 80, borderRadius: '4px 4px 0 0',
                    background: BORDER, animation: 'skeletonPulse 1.4s ease-in-out infinite',
                    animationDelay: `${i * 0.15}s`,
                  }} />
                  <div style={{
                    width: 24, height: 30 + Math.random() * 60, borderRadius: '4px 4px 0 0',
                    background: BORDER, animation: 'skeletonPulse 1.4s ease-in-out infinite',
                    animationDelay: `${i * 0.15 + 0.1}s`,
                  }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Table skeleton */}
        <div style={{ padding: '0 28px 40px' }}>
          <div style={{
            background: RAISED, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden',
          }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
              <Pulse w="120px" h={14} />
            </div>
            <div style={{ padding: '10px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 30 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Pulse key={i} w={`${60 + i * 10}px`} h={11} />
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  padding: '14px 20px', borderBottom: `1px solid rgba(38,51,71,0.4)`,
                  display: 'flex', gap: 30, alignItems: 'center',
                }}
              >
                {Array.from({ length: 5 }).map((_, j) => (
                  <Pulse key={j} w={`${50 + j * 12}px`} h={13} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
