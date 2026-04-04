'use client';

const DARK = '#F8F9FB';
const BORDER = '#E2E5EA';
const GOLD = '#C8960F';

function Pulse({ w, h, mb, r }: { w: string; h: number; mb?: number; r?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: r ?? 4,
        background: BORDER,
        animation: 'skeletonPulse 1.4s ease-in-out infinite',
        marginBottom: mb ?? 0,
      }}
    />
  );
}

export default function FieldLoading() {
  return (
    <>
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .3; }
        }
      `}</style>
      <div style={{ minHeight: '100vh', background: DARK, padding: '16px 16px 80px' }}>
        {/* Header */}
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <Pulse w="140px" h={22} mb={8} />
          <Pulse w="200px" h={12} />
        </div>

        {/* Quick action cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: '#ffffff',
                borderRadius: 12,
                padding: '18px 14px',
                border: `1px solid ${BORDER}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Pulse w="36px" h={36} r={8} />
              <Pulse w="70px" h={12} />
            </div>
          ))}
        </div>

        {/* List items */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: '#ffffff',
              borderRadius: 10,
              padding: '14px 16px',
              border: `1px solid ${BORDER}`,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Pulse w="40px" h={40} r={8} />
            <div style={{ flex: 1 }}>
              <Pulse w="60%" h={14} mb={6} />
              <Pulse w="80%" h={11} />
            </div>
            <Pulse w="24px" h={24} r={4} />
          </div>
        ))}

        {/* Gold bar */}
        <div
          style={{
            position: 'fixed',
            top: 0,
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
