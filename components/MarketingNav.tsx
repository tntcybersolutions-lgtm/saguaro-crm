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
        transition: 'all 0.3s ease', height: '58px',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto', padding: '0 48px',
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: '36px', width: 'auto', objectFit: 'contain', borderRadius: '4px', flexShrink: 0 }} />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '0.1em', background: 'linear-gradient(90deg,#D4A017,#F0C040)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SAGUARO</span>
              <span style={{ fontSize: '7px', color: '#8fa3c0', letterSpacing: '0.25em', fontWeight: 600, textTransform: 'uppercase' }}>Control Systems</span>
            </span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }} className="mn-desktop">
            {navLinks.map(link => (
              <button key={link.label} onClick={() => scrollTo(link.href)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.65)', fontSize: '13px', fontWeight: 400, letterSpacing: '0.04em', padding: 0, transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,1)'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.65)'}
              >{link.label}</button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="mn-desktop">
            <Link href="/login" style={{ padding: '7px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '13px', fontWeight: 400, textDecoration: 'none' }}>Log In</Link>
            <Link href="/signup" style={{ padding: '7px 18px', background: '#D4A017', border: 'none', borderRadius: '6px', color: '#000', fontSize: '13px', fontWeight: 600, letterSpacing: '0.03em', textDecoration: 'none' }}>Free Trial</Link>
          </div>

          <button onClick={() => setMobileOpen(!mobileOpen)} className="mn-mobile"
            style={{ display: 'none', background: 'none', border: 'none', color: '#e8edf8', fontSize: '22px', cursor: 'pointer', padding: '8px', minWidth: '44px', minHeight: '44px', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Menu">{mobileOpen ? '✕' : '☰'}</button>
        </div>
      </nav>

      {mobileOpen && (
        <div style={{ position: 'fixed', top: '58px', left: 0, right: 0, zIndex: 9998, background: 'rgba(13,17,23,0.99)', borderBottom: '1px solid #263347', padding: '8px 0', backdropFilter: 'blur(12px)' }}>
          {[...navLinks, { label: 'Log In', href: '/login' }].map(link => (
            <button key={link.href} onClick={() => scrollTo(link.href)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '14px 24px', fontSize: '15px', fontWeight: 600, color: '#e8edf8', background: 'none', border: 'none', borderBottom: '1px solid rgba(38,51,71,0.5)', cursor: 'pointer' }}>
              {link.label}
            </button>
          ))}
          <div style={{ padding: '16px' }}>
            <Link href="/signup" onClick={() => setMobileOpen(false)}
              style={{ display: 'block', textAlign: 'center', padding: '13px', background: '#D4A017', borderRadius: '9px', color: '#000', fontWeight: 600, textDecoration: 'none', fontSize: '15px' }}>
              Start Free Trial →
            </Link>
          </div>
        </div>
      )}

      <div style={{ height: '58px' }} />

      <style>{`
        @media (max-width: 768px) {
          .mn-desktop { display: none !important; }
          .mn-mobile { display: flex !important; }
        }
      `}</style>
    </>
  );
}
