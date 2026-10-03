'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { Icon } from '@phosphor-icons/react';
import {
  Bank, Buildings, Cactus, CalendarBlank, CalendarCheck, CalendarDots, Car, CarProfile,
  CastleTurret, ChatCircle, Cloud, CloudSun, Coins, Crane, CurrencyDollar, DeviceMobile,
  Diamond, Envelope, Eye, FastForward, Fire, Flower, ForkKnife, Hammer, House, HouseLine,
  Leaf, Lightbulb, Lightning, Lock, Money, NotePencil, PersonSimpleWalk, Phone, Plant, Plus,
  Robot, Rocket, Ruler, Snowflake, Sparkle, Sun, SwimmingPool, Target, Thermometer, Tree,
  TreePalm, TrendUp, Trophy, Van,
} from '@phosphor-icons/react';

/* ─── Palette ─── */
const BG = 'var(--bg-base)', CARD = 'var(--bg-surface)', GOLD = 'var(--brand-primary)', GREEN = '#34C759';
const BORDER = 'rgba(255,255,255,0.12)', TEXT = '#FFFFFF', DIM = '#CBD5E1', DARK = 'var(--bg-base)';

const glass: React.CSSProperties = {
  background: `color-mix(in srgb, ${CARD} 80%, transparent)`, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${BORDER}`, borderRadius: 16,
};

/* ─── Sage Personality Responses ─── */
const SAGE_RESPONSES: Record<string, Record<string, string>> = {
  project_type: {
    new_build: "Starting from scratch? That's the best canvas! Let's design something extraordinary.",
    remodel: "Smart move. Remodels deliver 70–80% ROI on average. Let's maximize yours.",
    addition: "Expanding your space is exciting! An addition can add serious value to your home.",
    outdoor: "Outdoor living spaces are the #1 most-requested upgrade right now. Great pick!",
  },
  budget: {
    under_25k: "We can do amazing things in this range. Smart upgrades that punch above their weight.",
    '25k_50k': "This is the sweet spot for high-impact renovations. Let's make every dollar count.",
    '50k_100k': "Now we're talking! This budget opens up premium materials and smart home integration.",
    '100k_plus': "With this budget, we can create something truly custom and spectacular.",
  },
  priorities: {
    energy_savings: "Love it! The average smart home saves $1,400/year on energy. That adds up fast.",
    home_value: "Great strategy. Smart upgrades can increase home value by 5–15%.",
    comfort: "Comfort is king! Smart climate and lighting make your home feel like a resort.",
    security: "Peace of mind is priceless. Smart security reduces break-in risk by 300%.",
    aesthetics: "Beautiful spaces improve mood and productivity. Let's make it stunning.",
  },
  vehicles: {
    none: "No worries! We'll focus on making the most of your interior and outdoor spaces.",
    '1_2': "Standard setup. We'll plan for a clean, organized garage with smart charging ready.",
    '3_4': "Nice fleet! Let's talk about a well-organized multi-bay setup.",
    '5_plus': "Nice collection! We should talk about a climate-controlled workshop.",
  },
  outdoor_features: {
    pool: "Great choice! A pool adds $25K+ to home value in your area.",
    outdoor_kitchen: "Outdoor kitchens are the hottest trend. Average ROI is 100–200%!",
    fire_pit: "Fire pits create that perfect gathering spot. Affordable luxury at its finest.",
    garden: "Smart irrigation can cut water usage by 50%. Green thumb meets tech!",
    none: "That's fine! We'll focus on maximizing your indoor living experience.",
  },
  timeline: {
    asap: "We love the energy! Let's get this moving quickly with the right team.",
    '3_months': "Perfect timeline for planning. We'll have detailed blueprints ready in weeks.",
    '6_months': "Great timing. This gives us room to source the best materials at the best prices.",
    planning: "Smart approach. Good planning is the foundation of every great build.",
  },
  climate: {
    hot_dry: "In hot-dry climates, smart shading and insulation save 30–40% on cooling.",
    hot_humid: "Dehumidification and smart HVAC are game-changers in your climate zone.",
    temperate: "Temperate climate? You'll get the best ROI from solar and smart lighting.",
    cold: "Cold climate upgrades focus on insulation and smart heating. Huge savings potential!",
    mixed: "Mixed climates need adaptable systems. Smart HVAC with zoning is perfect for you.",
  },
  smart_interest: {
    beginner: "No worries! We'll start simple with high-impact smart basics like thermostat and lighting.",
    intermediate: "Perfect. We'll build on what you know with integrated automation.",
    advanced: "You know your stuff! Let's talk full home automation with voice control and scenes.",
    all_in: "A kindred spirit! We'll design a fully connected smart home from the ground up.",
  },
};

/* ─── Question shape ─── */
type QuestionOption = { value: string; label: string; icon: Icon };
type DiscoveryQuestion = { id: string; icon: Icon; question: string; options: QuestionOption[] };

/* The question set is replaced at runtime by /api/discovery/questions, whose rows
   carry `icon` as a plain string. Render the Phosphor component when we have one;
   otherwise fall through to the raw value exactly as this page did before. */
function QIcon({ icon, size }: { icon: Icon | string | undefined; size: number }) {
  if (!icon || typeof icon === 'string') return <>{icon}</>;
  const Glyph = icon;
  return <Glyph size={size} weight="duotone" color={GOLD} />;
}

/* ─── Fallback Questions ─── */
const FALLBACK_QUESTIONS: DiscoveryQuestion[] = [
  {
    id: 'project_type', icon: Crane,
    question: "What type of project are you envisioning?",
    options: [
      { value: 'new_build', label: 'New Build', icon: House },
      { value: 'remodel', label: 'Remodel', icon: Hammer },
      { value: 'addition', label: 'Addition', icon: Plus },
      { value: 'outdoor', label: 'Outdoor Living', icon: Tree },
    ],
  },
  {
    id: 'budget', icon: Money,
    question: "What's your ideal budget range?",
    options: [
      { value: 'under_25k', label: 'Under $25K', icon: CurrencyDollar },
      { value: '25k_50k', label: '$25K–$50K', icon: Coins },
      { value: '50k_100k', label: '$50K–$100K', icon: Diamond },
      { value: '100k_plus', label: '$100K+', icon: Trophy },
    ],
  },
  {
    id: 'priorities', icon: Target,
    question: "What matters most to you?",
    options: [
      { value: 'energy_savings', label: 'Energy Savings', icon: Lightning },
      { value: 'home_value', label: 'Home Value', icon: TrendUp },
      { value: 'comfort', label: 'Comfort', icon: Cloud },
      { value: 'security', label: 'Security', icon: Lock },
      { value: 'aesthetics', label: 'Aesthetics', icon: Sparkle },
    ],
  },
  {
    id: 'vehicles', icon: Car,
    question: "How many vehicles do you have?",
    options: [
      { value: 'none', label: 'None', icon: PersonSimpleWalk },
      { value: '1_2', label: '1–2', icon: Car },
      { value: '3_4', label: '3–4', icon: Van },
      { value: '5_plus', label: '5+', icon: CarProfile },
    ],
  },
  {
    id: 'outdoor_features', icon: SwimmingPool,
    question: "Any outdoor features you're dreaming about?",
    options: [
      { value: 'pool', label: 'Pool / Spa', icon: SwimmingPool },
      { value: 'outdoor_kitchen', label: 'Outdoor Kitchen', icon: ForkKnife },
      { value: 'fire_pit', label: 'Fire Pit', icon: Fire },
      { value: 'garden', label: 'Garden', icon: Flower },
      { value: 'none', label: 'Not Right Now', icon: FastForward },
    ],
  },
  {
    id: 'timeline', icon: CalendarBlank,
    question: "When are you looking to start?",
    options: [
      { value: 'asap', label: 'ASAP', icon: Rocket },
      { value: '3_months', label: 'Within 3 Months', icon: CalendarCheck },
      { value: '6_months', label: 'Within 6 Months', icon: CalendarDots },
      { value: 'planning', label: 'Just Planning', icon: NotePencil },
    ],
  },
  {
    id: 'climate', icon: Thermometer,
    question: "What best describes your climate?",
    options: [
      { value: 'hot_dry', label: 'Hot & Dry', icon: Sun },
      { value: 'hot_humid', label: 'Hot & Humid', icon: TreePalm },
      { value: 'temperate', label: 'Temperate', icon: CloudSun },
      { value: 'cold', label: 'Cold', icon: Snowflake },
      { value: 'mixed', label: 'Mixed Seasons', icon: Leaf },
    ],
  },
  {
    id: 'smart_interest', icon: Robot,
    question: "How smart-home savvy are you?",
    options: [
      { value: 'beginner', label: "What's a Smart Home?", icon: Plant },
      { value: 'intermediate', label: 'I Have a Few Devices', icon: DeviceMobile },
      { value: 'advanced', label: 'Pretty Connected Already', icon: Lightbulb },
      { value: 'all_in', label: 'Full Automation, Please!', icon: House },
    ],
  },
  {
    id: 'home_size', icon: Ruler,
    question: "How large is your home?",
    options: [
      { value: 'under_1500', label: 'Under 1,500 sq ft', icon: HouseLine },
      { value: '1500_2500', label: '1,500–2,500 sq ft', icon: Buildings },
      { value: '2500_4000', label: '2,500–4,000 sq ft', icon: CastleTurret },
      { value: '4000_plus', label: '4,000+ sq ft', icon: Bank },
    ],
  },
  {
    id: 'contact', icon: Phone,
    question: "Last one! How should we reach you?",
    options: [
      { value: 'email', label: 'Email Me', icon: Envelope },
      { value: 'call', label: 'Call Me', icon: DeviceMobile },
      { value: 'text', label: 'Text Me', icon: ChatCircle },
      { value: 'no_contact', label: 'Just Show Results', icon: Eye },
    ],
  },
];

type Rec = {
  id: string; title: string; description: string;
  estimated_cost: string; annual_savings: string; roi_years: number;
  status?: 'accepted' | 'rejected' | 'pending';
};

export default function DiscoverPage() {
  const [questions, setQuestions] = useState(FALLBACK_QUESTIONS);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sageReply, setSageReply] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [recommendations, setRecommendations] = useState<Rec[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [recError, setRecError] = useState(false);

  useEffect(() => {
    fetch('/api/discovery/questions').then(r => r.json())
      .then(data => { if (data?.questions?.length) setQuestions(data.questions); })
      .catch(() => {});
  }, []);

  const totalQ = questions.length;
  const q = questions[currentQ];
  const progress = ((currentQ) / totalQ) * 100;

  const handleAnswer = useCallback((value: string) => {
    const newAnswers = { ...answers, [q.id]: value };
    setAnswers(newAnswers);

    // Get Sage personality reply
    const responses = SAGE_RESPONSES[q.id];
    const reply = responses?.[value] || "Interesting choice! That tells me a lot about what you're looking for.";
    setSageReply(reply);
    setShowReply(true);

    setTimeout(() => {
      setShowReply(false);
      if (currentQ < totalQ - 1) {
        setCurrentQ(prev => prev + 1);
      } else {
        generateRecommendations(newAnswers);
      }
    }, 2800);
  }, [answers, currentQ, q, totalQ]);

  const generateRecommendations = async (allAnswers: Record<string, string>) => {
    setAnalyzing(true);
    setRecError(false);
    // Personalized recommendations are generated from the visitor's ACTUAL quiz
    // answers by /api/discovery/recommend (public). If that fails we show an
    // honest error state — we never fabricate a static recommendation set.
    try {
      const res = await fetch('/api/discovery/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: allAnswers }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.recommendations) && data.recommendations.length) {
        setRecommendations(data.recommendations.map((r: any) => ({
          ...r,
          roi_years: typeof r.roi_years === 'number' ? r.roi_years : Number(r.roi_years) || 0,
          status: 'pending',
        })));
      } else {
        setRecError(true);
        setRecommendations([]);
      }
    } catch {
      setRecError(true);
      setRecommendations([]);
    } finally {
      setAnalyzing(false);
      setShowResults(true);
    }
  };

  const handleRecAction = (id: string, action: 'accepted' | 'rejected') => {
    setRecommendations(prev => prev.map(r => r.id === id ? { ...r, status: action } : r));
  };

  // Analyzing screen
  if (analyzing) {
    return (
      <div style={{
        minHeight: '100vh', background: BG, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        padding: 40,
      }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}><Cactus size={64} weight="duotone" color={GREEN} /></div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: TEXT, marginBottom: 12 }}>
          Sage is analyzing your profile…
        </h2>
        <p style={{ color: DIM, fontSize: 16, marginBottom: 32 }}>
          Building personalized recommendations just for you
        </p>
        <div style={{
          width: 200, height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            width: '70%', height: '100%', background: GOLD, borderRadius: 2,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        </div>
        <style>{`@keyframes pulse { 0%,100% { width: 30%; } 50% { width: 90%; } }`}</style>
      </div>
    );
  }

  // Results screen
  if (showResults) {
    // Honest error/empty state — we could not generate real recommendations
    // from the answers, so we show nothing fabricated.
    if (recError || recommendations.length === 0) {
      return (
        <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '40px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...glass, padding: 40, maxWidth: 520, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}><Cactus size={48} weight="duotone" color={GREEN} /></div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
              We couldn&apos;t build your recommendations right now
            </h2>
            <p style={{ color: DIM, fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
              Sage hit a snag generating your personalized results. Please try again in a moment,
              or explore our smart building packages while we get back up.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => { setShowResults(false); setRecError(false); generateRecommendations(answers); }}
                style={{
                  padding: '14px 28px', background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-hover))',
                  color: '#0A0A00', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer',
                }}
              >
                Try Again
              </button>
              <Link href="/design/packages" style={{ textDecoration: 'none' }}>
                <button style={{
                  padding: '14px 24px', background: 'transparent', color: GOLD,
                  border: `2px solid ${GOLD}`, borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}>
                  Browse Packages
                </button>
              </Link>
            </div>
          </div>
        </div>
      );
    }
    const accepted = recommendations.filter(r => r.status === 'accepted');
    const totalSavings = accepted.reduce((s, r) => s + parseInt(r.annual_savings.replace(/[^0-9]/g, '')), 0);
    return (
      <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '40px 20px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}><Cactus size={48} weight="duotone" color={GREEN} /></div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
              Your Personalized <span style={{ color: GOLD }}>Recommendations</span>
            </h1>
            <p style={{ color: DIM }}>
              Tap the checkmark to accept or X to skip each recommendation.
            </p>
          </div>

          {recommendations.map(rec => (
            <div key={rec.id} style={{
              ...glass, padding: 24, marginBottom: 16, transition: 'all .3s',
              opacity: rec.status === 'rejected' ? 0.4 : 1,
              borderColor: rec.status === 'accepted' ? GREEN : BORDER,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
                    {rec.status === 'accepted' && <span style={{ color: GREEN, marginRight: 8 }}>&#10003;</span>}
                    {rec.status === 'rejected' && <span style={{ color: '#EF4444', marginRight: 8 }}>&#10007;</span>}
                    {rec.title}
                  </h3>
                  <p style={{ color: DIM, fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>{rec.description}</p>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <div><span style={{ fontSize: 12, color: DIM }}>Cost: </span><span style={{ fontWeight: 700 }}>{rec.estimated_cost}</span></div>
                    <div><span style={{ fontSize: 12, color: DIM }}>Annual Savings: </span><span style={{ fontWeight: 700, color: GREEN }}>{rec.annual_savings}</span></div>
                    <div><span style={{ fontSize: 12, color: DIM }}>ROI: </span><span style={{ fontWeight: 700, color: GOLD }}>{rec.roi_years} years</span></div>
                  </div>
                </div>
                {rec.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleRecAction(rec.id, 'accepted')} style={{
                      width: 44, height: 44, borderRadius: 12, border: `1px solid ${GREEN}`,
                      background: `${GREEN}20`, color: GREEN, fontSize: 20, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>&#10003;</button>
                    <button onClick={() => handleRecAction(rec.id, 'rejected')} style={{
                      width: 44, height: 44, borderRadius: 12, border: `1px solid #EF4444`,
                      background: '#EF444420', color: '#EF4444', fontSize: 20, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>&#10007;</button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {accepted.length > 0 && (
            <div style={{
              ...glass, padding: 24, marginTop: 24, textAlign: 'center',
              background: `${GREEN}10`, borderColor: GREEN,
            }}>
              <div style={{ fontSize: 14, color: DIM, marginBottom: 4 }}>Estimated Annual Savings</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: GREEN }}>
                ${totalSavings.toLocaleString()}/year
              </div>
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: 32, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/design/packages" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '16px 36px', background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-hover))',
                color: '#0A0A00', border: 'none', borderRadius: 12, fontWeight: 700,
                fontSize: 16, cursor: 'pointer',
              }}>
                See Your Smart Building Packages
              </button>
            </Link>
            <Link href="/design/roi" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '16px 28px', background: 'transparent', color: GOLD,
                border: `2px solid ${GOLD}`, borderRadius: 12, fontWeight: 700,
                fontSize: 14, cursor: 'pointer',
              }}>
                Calculate Full ROI
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Conversational flow
  return (
    <div style={{
      minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column',
      color: TEXT,
    }}>
      {/* Progress bar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: `color-mix(in srgb, ${DARK} 88%, transparent)`, backdropFilter: 'blur(8px)', padding: '12px 20px',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: DIM }}>Question {currentQ + 1} of {totalQ}</span>
            <span style={{ fontSize: 12, color: GOLD }}>{Math.round(progress)}%</span>
          </div>
          <div style={{ height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${progress}%`, height: '100%', background: GOLD,
              borderRadius: 2, transition: 'width .5s ease',
            }} />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '80px 20px 40px', maxWidth: 600, margin: '0 auto', width: '100%',
      }}>
        {/* Sage reply */}
        {showReply ? (
          <div style={{
            ...glass, padding: 28, width: '100%', textAlign: 'center',
            animation: 'fadeIn .4s ease',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}><Cactus size={40} weight="duotone" color={GREEN} /></div>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: TEXT, fontStyle: 'italic' }}>
              &ldquo;{sageReply}&rdquo;
            </p>
            <p style={{ fontSize: 13, color: GOLD, marginTop: 8, fontWeight: 600 }}>
              &mdash; Sage
            </p>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 56, marginBottom: 20 }}><QIcon icon={q?.icon} size={56} /></div>
            <h2 style={{
              fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 700,
              textAlign: 'center', marginBottom: 32, lineHeight: 1.3,
            }}>
              {q?.question}
            </h2>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 12, width: '100%',
            }}>
              {q?.options.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleAnswer(opt.value)}
                  style={{
                    ...glass, padding: '20px 14px', textAlign: 'center',
                    cursor: 'pointer', transition: 'all .2s',
                    borderColor: answers[q.id] === opt.value ? GOLD : BORDER,
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}><QIcon icon={opt.icon} size={28} /></div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{opt.label}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
