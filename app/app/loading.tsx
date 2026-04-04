'use client';

const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const GOLD = '#C8960F';

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

export default function AppLoading() {
  return (
    <>
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .3; }
        }
      `}</style>
      <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
        {/* Header skeleton */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <Pulse w="140px" h={10} mb={10} />
            <Pulse w="200px" h={24} mb={8} />
            <Pulse w="260px" h={12} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Pulse w="120px" h={38} />
            <Pulse w="100px" h={38} />
          </div>
        </div>

        {/* KPI row skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: RAISED,
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                padding: '18px 20px',
              }}
            >
              <Pulse w="60%" h={10} mb={10} />
              <Pulse w="45%" h={28} mb={6} />
              <Pulse w="70%" h={10} />
            </div>
          ))}
        </div>

        {/* Action items skeleton */}
        <div
          style={{
            background: RAISED,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            overflow: 'hidden',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              borderBottom: `1px solid ${BORDER}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Pulse w="180px" h={14} />
            <Pulse w="60px" h={20} />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 18px',
                borderBottom: `1px solid ${BORDER}`,
              }}
            >
              <Pulse w="20px" h={20} />
              <div style={{ flex: 1 }}>
                <Pulse w="55%" h={14} mb={8} />
                <Pulse w="75%" h={11} />
              </div>
              <Pulse w="80px" h={30} />
            </div>
          ))}
        </div>

        {/* Bottom grid skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                background: RAISED,
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
                <Pulse w="120px" h={14} />
              </div>
              <div style={{ padding: 16 }}>
                {Array.from({ length: 2 }).map((_, j) => (
                  <div
                    key={j}
                    style={{
                      padding: '14px 16px',
                      background: DARK,
                      borderRadius: 8,
                      border: `1px solid ${BORDER}`,
                      marginBottom: 10,
                    }}
                  >
                    <Pulse w="60%" h={14} mb={8} />
                    <Pulse w="80%" h={11} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Gold loading bar at top */}
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
      </div>
    </>
  );
}
