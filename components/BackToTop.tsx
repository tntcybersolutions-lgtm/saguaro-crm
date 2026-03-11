'use client';
import { useState, useEffect } from 'react';

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{
        position: 'fixed', bottom: '32px', right: '32px',
        width: '48px', height: '48px', borderRadius: '50%',
        background: 'linear-gradient(135deg, #D4A017, #F0C040)',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '20px', color: '#0A0E14', fontWeight: '900',
        boxShadow: '0 4px 20px rgba(212,160,23,0.4)', zIndex: 9997,
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 28px rgba(212,160,23,0.6)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(212,160,23,0.4)';
      }}
      aria-label="Back to top"
    >↑</button>
  );
}
