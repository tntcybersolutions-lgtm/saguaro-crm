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

export default function ProjectLoading() {
  return (
    <>
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .3; }
        }
      `}</style>
      <div style={{ minHeight: '100vh', background: DARK }}>
        {/* Page header skeleton */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <Pulse w="180px" h={20} mb={6} />
            <Pulse w="240px" h={12} />
          </div>
          <Pulse w="120px" h={36} />
        </div>

        {/* KPI row */}
        <div style={{ padding: '20px 24px 0', display: 'flex', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: RAISED,
                borderRadius: 8,
                padding: '14px 24px',
                border: `1px solid ${BORDER}`,
                flex: 1,
              }}
            >
              <Pulse w="50%" h={20} mb={6} />
              <Pulse w="60%" h={11} />
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div style={{ padding: '16px 24px 40px' }}>
          <div
            style={{
              background: '#F8F9FB',
              padding: '10px 14px',
              borderBottom: `1px solid ${BORDER}`,
              display: 'flex',
              gap: 20,
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <Pulse key={i} w={`${60 + i * 15}px`} h={11} />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              style={{
                padding: '12px 14px',
                borderBottom: `1px solid rgba(38,51,71,.4)`,
                display: 'flex',
                gap: 20,
                alignItems: 'center',
              }}
            >
              {Array.from({ length: 6 }).map((_, j) => (
                <Pulse key={j} w={`${50 + j * 12}px`} h={13} />
              ))}
            </div>
          ))}
        </div>

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
      </div>
    </>
  );
}
