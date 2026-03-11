'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'How It Works', href: '#demo' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Compare', href: '/compare/procore' },
  ];

  const scrollTo = (href: string) => {
    if (href.startsWith('/')) { router.push(href); setMobileOpen(false); return; }
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setMobileOpen(false);
  };

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: scrolled ? 'rgba(13,17,23,0.97)' : 'rgba(13,17,23,0.85)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: scrolled ? '1px solid rgba(212,160,23,0.25)' : '1px solid rgba(38,51,71,0.8)',
        transition: 'all 0.3s ease', height: '60px',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto', padding: '0 24px',
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <span style={{ fontSize: '22px' }}>🌵</span>
            <span style={{ fontWeight: 900, fontSize: '16px', letterSpacing: '1px', color: '#D4A017' }}>SAGUARO</span>
            <span style={{ fontSize: '10px', background: '#D4A017', color: '#0d1117', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>CRM</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} className="mn-desktop">
            {navLinks.map(link => (
              <button key={link.label} onClick={() => scrollTo(link.href)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8fa3c0', fontSize: '13px', fontWeight: 600, padding: '6px 12px', borderRadius: '6px', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#e8edf8'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#8fa3c0'}
              >{link.label}</button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="mn-desktop">
            <Link href="/login" style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid #263347', borderRadius: '7px', color: '#e8edf8', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>Log In</Link>
            <Link href="/signup" style={{ padding: '7px 18px', background: 'linear-gradient(135deg,#D4A017,#F0C040)', border: 'none', borderRadius: '7px', color: '#0d1117', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>Free Trial</Link>
          </div>

          <button onClick={() => setMobileOpen(!mobileOpen)} className="mn-mobile"
            style={{ display: 'none', background: 'none', border: 'none', color: '#e8edf8', fontSize: '22px', cursor: 'pointer', padding: '8px', minWidth: '44px', minHeight: '44px', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Menu">{mobileOpen ? '✕' : '☰'}</button>
        </div>
      </nav>

      {mobileOpen && (
        <div style={{ position: 'fixed', top: '60px', left: 0, right: 0, zIndex: 9998, background: 'rgba(13,17,23,0.99)', borderBottom: '1px solid #263347', padding: '8px 0', backdropFilter: 'blur(12px)' }}>
          {[...navLinks, { label: 'Log In', href: '/login' }].map(link => (
            <button key={link.href} onClick={() => scrollTo(link.href)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '14px 24px', fontSize: '15px', fontWeight: 600, color: '#e8edf8', background: 'none', border: 'none', borderBottom: '1px solid rgba(38,51,71,0.5)', cursor: 'pointer' }}>
              {link.label}
            </button>
          ))}
          <div style={{ padding: '16px' }}>
            <Link href="/signup" onClick={() => setMobileOpen(false)}
              style={{ display: 'block', textAlign: 'center', padding: '13px', background: 'linear-gradient(135deg,#D4A017,#F0C040)', borderRadius: '9px', color: '#0d1117', fontWeight: 800, textDecoration: 'none', fontSize: '15px' }}>
              Start Free Trial →
            </Link>
          </div>
        </div>
      )}

      <div style={{ height: '60px' }} />

      <style>{`
        @media (max-width: 768px) {
          .mn-desktop { display: none !important; }
          .mn-mobile { display: flex !important; }
        }
      `}</style>
    </>
  );
}
