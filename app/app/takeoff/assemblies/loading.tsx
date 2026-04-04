'use client';

const GOLD = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';

export default function AssembliesLoading() {
  return (
    <div style={{ background: DARK, minHeight: '100vh', padding: '32px 40px' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes barSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      {/* Gold progress bar */}
      <div style={{
        position: 'fixed',
        top: 56,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 100,
        overflow: 'hidden',
        background: `${GOLD}15`,
      }}>
        <div style={{
          width: '40%',
          height: '100%',
          background: `linear-gradient(90deg, transparent 0%, ${GOLD} 50%, transparent 100%)`,
          animation: 'barSlide 1.5s ease-in-out infinite',
        }} />
      </div>

      {/* Header skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{
            height: 28,
            width: 200,
            background: RAISED,
            borderRadius: 6,
            marginBottom: 8,
            animation: 'pulse 1.6s ease-in-out infinite',
          }} />
          <div style={{
            height: 14,
            width: 320,
            background: RAISED,
            borderRadius: 4,
            animation: 'pulse 1.6s ease-in-out infinite',
            animationDelay: '0.1s',
          }} />
        </div>
        <div style={{
          height: 42,
          width: 140,
          background: RAISED,
          borderRadius: 8,
          animation: 'pulse 1.6s ease-in-out infinite',
          animationDelay: '0.15s',
        }} />
      </div>

      {/* Search bar skeleton */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <div style={{
          flex: 1,
          height: 44,
          background: RAISED,
          borderRadius: 8,
          border: `1px solid ${BORDER}`,
          animation: 'pulse 1.6s ease-in-out infinite',
          animationDelay: '0.05s',
        }} />
        <div style={{
          width: 180,
          height: 44,
          background: RAISED,
          borderRadius: 8,
          border: `1px solid ${BORDER}`,
          animation: 'pulse 1.6s ease-in-out infinite',
          animationDelay: '0.1s',
        }} />
        <div style={{
          width: 140,
          height: 44,
          background: RAISED,
          borderRadius: 8,
          border: `1px solid ${BORDER}`,
          animation: 'pulse 1.6s ease-in-out infinite',
          animationDelay: '0.15s',
        }} />
      </div>

      {/* Grid of 6 card skeletons (2x3) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 16,
      }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: RAISED,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: 20,
              animation: 'pulse 1.6s ease-in-out infinite',
              animationDelay: `${i * 0.1}s`,
            }}
          >
            {/* Card title + badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ height: 16, width: '55%', background: BORDER, borderRadius: 4 }} />
              <div style={{ height: 20, width: 60, background: BORDER, borderRadius: 4 }} />
            </div>
            {/* Division line */}
            <div style={{ height: 12, width: '40%', background: BORDER, borderRadius: 3, marginBottom: 16 }} />
            {/* Bottom row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 20 }}>
                <div>
                  <div style={{ height: 8, width: 24, background: BORDER, borderRadius: 2, marginBottom: 4 }} />
                  <div style={{ height: 14, width: 30, background: BORDER, borderRadius: 3 }} />
                </div>
                <div>
                  <div style={{ height: 8, width: 28, background: BORDER, borderRadius: 2, marginBottom: 4 }} />
                  <div style={{ height: 14, width: 20, background: BORDER, borderRadius: 3 }} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ height: 8, width: 50, background: BORDER, borderRadius: 2, marginBottom: 4, marginLeft: 'auto' }} />
                <div style={{ height: 18, width: 80, background: BORDER, borderRadius: 4 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
