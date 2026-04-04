'use client';

const GOLD = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';

export default function EstimateLoading() {
  return (
    <div style={{ display: 'flex', height: '100vh', background: DARK, overflow: 'hidden' }}>
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

      {/* Left sidebar skeleton */}
      <div style={{
        width: 300,
        minWidth: 300,
        borderRight: `1px solid ${BORDER}`,
        padding: '20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        {/* Sidebar header skeleton */}
        <div style={{
          height: 20,
          width: 140,
          background: RAISED,
          borderRadius: 4,
          marginBottom: 8,
          animation: 'pulse 1.6s ease-in-out infinite',
        }} />

        {/* Sheet card skeletons */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: RAISED,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              animation: 'pulse 1.6s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
            }}
          >
            {/* Thumbnail placeholder */}
            <div style={{
              width: '100%',
              height: 80,
              background: `${BORDER}`,
              borderRadius: 6,
            }} />
            {/* Title line */}
            <div style={{
              height: 14,
              width: '70%',
              background: BORDER,
              borderRadius: 4,
            }} />
            {/* Subtitle line */}
            <div style={{
              height: 10,
              width: '50%',
              background: BORDER,
              borderRadius: 3,
            }} />
          </div>
        ))}
      </div>

      {/* Main area skeleton */}
      <div style={{ flex: 1, padding: '24px 32px', overflow: 'hidden' }}>
        {/* Top toolbar skeleton */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}>
          <div style={{
            height: 24,
            width: 220,
            background: RAISED,
            borderRadius: 6,
            animation: 'pulse 1.6s ease-in-out infinite',
          }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{
              height: 36,
              width: 100,
              background: RAISED,
              borderRadius: 6,
              animation: 'pulse 1.6s ease-in-out infinite',
              animationDelay: '0.1s',
            }} />
            <div style={{
              height: 36,
              width: 100,
              background: RAISED,
              borderRadius: 6,
              animation: 'pulse 1.6s ease-in-out infinite',
              animationDelay: '0.2s',
            }} />
          </div>
        </div>

        {/* Table header skeleton */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '80px 2fr 80px 60px 100px 100px 80px',
          gap: 12,
          padding: '12px 16px',
          borderBottom: `1px solid ${BORDER}`,
          marginBottom: 4,
        }}>
          {['CSI', 'Description', 'Qty', 'Unit', 'Unit Cost', 'Total', 'Labor'].map((_, idx) => (
            <div
              key={idx}
              style={{
                height: 12,
                width: '80%',
                background: RAISED,
                borderRadius: 3,
                animation: 'pulse 1.6s ease-in-out infinite',
                animationDelay: `${idx * 0.05}s`,
              }}
            />
          ))}
        </div>

        {/* Table row skeletons */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 2fr 80px 60px 100px 100px 80px',
              gap: 12,
              padding: '14px 16px',
              borderBottom: `1px solid ${BORDER}40`,
              animation: 'pulse 1.6s ease-in-out infinite',
              animationDelay: `${i * 0.12}s`,
            }}
          >
            <div style={{ height: 14, width: '90%', background: RAISED, borderRadius: 4 }} />
            <div style={{ height: 14, width: `${60 + (i % 3) * 15}%`, background: RAISED, borderRadius: 4 }} />
            <div style={{ height: 14, width: '60%', background: RAISED, borderRadius: 4 }} />
            <div style={{ height: 14, width: '50%', background: RAISED, borderRadius: 4 }} />
            <div style={{ height: 14, width: '70%', background: RAISED, borderRadius: 4 }} />
            <div style={{ height: 14, width: '75%', background: RAISED, borderRadius: 4 }} />
            <div style={{ height: 14, width: '55%', background: RAISED, borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
