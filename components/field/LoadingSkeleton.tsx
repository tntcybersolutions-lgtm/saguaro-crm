'use client';
import React from 'react';

interface SkeletonProps {
  type?: 'list' | 'card' | 'form' | 'detail' | 'grid';
  rows?: number;
}

const shimmer = `
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
`;

const Bar = ({ w = '100%', h = 12, mb = 8 }: { w?: string | number; h?: number; mb?: number }) => (
  <div style={{
    width: typeof w === 'number' ? `${w}%` : w,
    height: h,
    borderRadius: 6,
    background: 'linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 75%)',
    backgroundSize: '800px 100%',
    animation: 'shimmer 1.5s infinite linear',
    marginBottom: mb,
  }} />
);

export default function LoadingSkeleton({ type = 'list', rows = 5 }: SkeletonProps) {
  return (
    <>
      <style>{shimmer}</style>
      <div style={{ padding: '16px' }}>
        {type === 'list' && Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 75%)', backgroundSize: '800px 100%', animation: 'shimmer 1.5s infinite linear', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <Bar w={60 + Math.random() * 30} h={13} mb={6} />
              <Bar w={40 + Math.random() * 20} h={10} mb={0} />
            </div>
          </div>
        ))}

        {type === 'card' && Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: 16, marginBottom: 10 }}>
            <Bar w={70} h={14} mb={10} />
            <Bar w={90} h={10} mb={6} />
            <Bar w={50} h={10} mb={0} />
          </div>
        ))}

        {type === 'form' && (
          <>
            <Bar w={30} h={10} mb={6} />
            <Bar h={38} mb={16} />
            <Bar w={30} h={10} mb={6} />
            <Bar h={38} mb={16} />
            <Bar w={30} h={10} mb={6} />
            <Bar h={80} mb={16} />
            <Bar w={40} h={42} mb={0} />
          </>
        )}

        {type === 'detail' && (
          <>
            <Bar w={50} h={20} mb={12} />
            <Bar w={80} h={12} mb={8} />
            <Bar w={60} h={12} mb={20} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ background: 'rgba(255,255,255,.03)', borderRadius: 10, padding: 14 }}>
                  <Bar w={40} h={9} mb={6} />
                  <Bar w={60} h={16} mb={0} />
                </div>
              ))}
            </div>
            <Bar h={200} mb={0} />
          </>
        )}

        {type === 'grid' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 10, padding: 12 }}>
                <Bar w={70} h={12} mb={6} />
                <Bar w={40} h={10} mb={0} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
