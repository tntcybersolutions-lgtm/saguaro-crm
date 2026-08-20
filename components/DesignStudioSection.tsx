'use client'
import { useState, useRef, useCallback } from 'react'

const EXAMPLES = [
  {
    id: 'kitchen',
    label: 'Kitchen',
    icon: '🍳',
    before: 'https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=900&q=90',
    after:  'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=900&q=90',
    beforeAlt: 'Outdated kitchen with dark cabinets before renovation',
    afterAlt: 'Stunning modern kitchen after AI redesign',
    tag: 'Modern Farmhouse',
  },
  {
    id: 'living',
    label: 'Living Room',
    icon: '🛋️',
    before: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=900&q=90',
    after:  'https://images.unsplash.com/photo-1600210492493-0946911123ea?w=900&q=90',
    beforeAlt: 'Dark dated living room before renovation',
    afterAlt: 'Bright modern living room after AI redesign',
    tag: 'Contemporary',
  },
  {
    id: 'exterior',
    label: 'Exterior',
    icon: '🏠',
    before: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=900&q=90',
    after:  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=90',
    beforeAlt: 'Plain house exterior before renovation',
    afterAlt: 'Stunning modern home exterior after AI redesign',
    tag: 'Modern Craftsman',
  },
]

export default function DesignStudioSection() {
  const [active, setActive] = useState(0)
  const [sliderPct, setSliderPct] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const updateSlider = useCallback((clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    setSliderPct(pct)
  }, [])

  const onMouseDown = () => setIsDragging(true)
  const onMouseUp = () => setIsDragging(false)
  const onMouseMove = (e: React.MouseEvent) => { if (isDragging) updateSlider(e.clientX) }
  const onTouchMove = (e: React.TouchEvent) => updateSlider(e.touches[0].clientX)

  const ex = EXAMPLES[active]

  return (
    <section style={{
      padding: '80px 24px',
      background: 'linear-gradient(180deg, rgba(13,17,23,0) 0%, rgba(212,160,23,0.04) 50%, rgba(13,17,23,0) 100%)',
      textAlign: 'center',
    }}>

      {/* NEW badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'rgba(61,214,140,0.12)',
        border: '1px solid rgba(61,214,140,0.4)',
        borderRadius: 20, padding: '4px 12px',
        fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
        color: '#3DD68C', textTransform: 'uppercase', marginBottom: 20,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3DD68C', display: 'inline-block' }} />
        New Feature
      </div>

      {/* Heading */}
      <h2 style={{
        fontSize: 'clamp(28px, 5vw, 44px)',
        fontWeight: 900, color: '#fff',
        lineHeight: 1.15, marginBottom: 16, maxWidth: 640, marginLeft: 'auto', marginRight: 'auto',
      }}>
        Show Clients the Finished Product<br />
        <span style={{ color: '#D4A017' }}>Before You Break Ground</span>
      </h2>

      <p style={{
        fontSize: 16, color: 'rgba(255,255,255,0.6)',
        maxWidth: 520, margin: '0 auto 40px',
        lineHeight: 1.7,
      }}>
        Upload a photo of any space. Our AI generates photorealistic redesigns in seconds —
        helping you close more bids and align with clients before a single nail is driven.
      </p>

      {/* Example tabs */}
      <div style={{
        display: 'inline-flex', gap: 8,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: 4, marginBottom: 32,
      }}>
        {EXAMPLES.map((e, i) => (
          <button
            key={e.id}
            onClick={() => { setActive(i); setSliderPct(50) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 9,
              border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              transition: 'all 0.2s',
              background: active === i ? '#D4A017' : 'transparent',
              color: active === i ? '#0d1117' : 'rgba(255,255,255,0.5)',
            }}
          >
            {e.icon} {e.label}
          </button>
        ))}
      </div>

      {/* Before/After slider container */}
      <div style={{ maxWidth: 860, margin: '0 auto', position: 'relative' }}>

        {/* Style tag label */}
        <div style={{
          position: 'absolute', top: 16, right: 16, zIndex: 10,
          background: 'rgba(212,160,23,0.9)',
          color: '#0d1117', fontWeight: 800, fontSize: 12,
          padding: '5px 12px', borderRadius: 20, letterSpacing: '0.05em',
        }}>
          AI Style: {ex.tag}
        </div>

        {/* Main slider */}
        <div
          ref={containerRef}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseUp}
          onTouchMove={onTouchMove}
          style={{
            position: 'relative', width: '100%',
            aspectRatio: '16/9',
            borderRadius: 16, overflow: 'hidden',
            cursor: 'ew-resize',
            border: '1px solid rgba(255,255,255,0.1)',
            userSelect: 'none',
            boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
          }}
        >
          {/* AFTER image (full width, underneath) */}
          <img
            src={ex.after}
            alt={ex.afterAlt}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            draggable={false}
          />

          {/* BEFORE image (clipped to left side) */}
          <div style={{
            position: 'absolute', inset: 0,
            clipPath: `inset(0 ${100 - sliderPct}% 0 0)`,
            transition: isDragging ? 'none' : 'clip-path 0.05s',
          }}>
            <img
              src={ex.before}
              alt={ex.beforeAlt}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              draggable={false}
            />
          </div>

          {/* Slider line */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${sliderPct}%`, transform: 'translateX(-50%)',
            width: 3, background: '#fff',
            boxShadow: '0 0 12px rgba(0,0,0,0.6)',
            pointerEvents: 'none',
          }} />

          {/* Slider handle */}
          <div style={{
            position: 'absolute', top: '50%',
            left: `${sliderPct}%`,
            transform: 'translate(-50%, -50%)',
            width: 44, height: 44, borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', fontSize: 16,
          }}>
            ↔
          </div>

          {/* BEFORE label */}
          <div style={{
            position: 'absolute', bottom: 16, left: 16,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
            color: '#fff', fontWeight: 800, fontSize: 12,
            padding: '5px 12px', borderRadius: 20, letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Before
          </div>

          {/* AFTER label */}
          <div style={{
            position: 'absolute', bottom: 16, right: 16,
            background: 'rgba(212,160,23,0.85)', backdropFilter: 'blur(8px)',
            color: '#0d1117', fontWeight: 800, fontSize: 12,
            padding: '5px 12px', borderRadius: 20, letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            After — AI Generated
          </div>
        </div>

        {/* Drag instruction */}
        <p style={{
          marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600,
        }}>
          ← Drag the slider to compare →
        </p>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
        gap: 32, marginTop: 48, marginBottom: 40,
      }}>
        {[
          { val: '< 60 sec', label: 'Redesign generated' },
          { val: 'Unlimited', label: 'Styles to explore' },
          { val: '100%', label: 'Photorealistic output' },
          { val: 'Free', label: 'On Platinum plan' },
        ].map(s => (
          <div key={s.val} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#D4A017' }}>{s.val}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <a
        href="/design"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'linear-gradient(135deg, #D4A017, #F0C040)',
          color: '#0d1117', fontWeight: 800, fontSize: 15,
          padding: '14px 32px', borderRadius: 10,
          textDecoration: 'none',
          boxShadow: '0 8px 32px rgba(212,160,23,0.3)',
          transition: 'transform 0.15s',
        }}
      >
        ✨ Try AI Design Studio — Free
      </a>
      <p style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
        Interior &amp; exterior · Residential &amp; commercial · No account required
      </p>

    </section>
  )
}
