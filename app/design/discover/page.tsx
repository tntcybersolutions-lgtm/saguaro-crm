'use client';
import React, { useState, useEffect, useCallback } from 'react';

/* ─── Palette ─── */
const BG = '#F8F9FB', CARD = '#F8F9FB', GOLD = '#C8960F', GREEN = '#22C55E';
const BORDER = '#2A3040', TEXT = '#F0F4FF', DIM = '#8B9DB8', DARK = '#141922';

const glass: React.CSSProperties = {
  background: `${CARD}CC`, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${BORDER}`, borderRadius: 16,
};

/* ─── Sage Personality Responses ─── */
const SAGE_RESPONSES: Record<string, Record<string, string>> = {
  project_type: {
    new_build: "Starting from scratch? That's the best canvas! Let's design something extraordinary.",
    remodel: "Smart move. Remodels deliver 70-80% ROI on average. Let's maximize yours.",
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
    home_value: "Great strategy. Smart upgrades can increase home value by 5-15%.",
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
    outdoor_kitchen: "Outdoor kitchens are the hottest trend. Average ROI is 100-200%!",
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
    hot_dry: "In hot-dry climates, smart shading and insulation save 30-40% on cooling.",
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

/* ─── Fallback Questions ─── */
const FALLBACK_QUESTIONS = [
  {
    id: 'project_type', icon: '🏗️',
    question: "What type of project are you envisioning?",
    options: [
      { value: 'new_build', label: 'New Build', icon: '🏠' },
      { value: 'remodel', label: 'Remodel', icon: '🔨' },
      { value: 'addition', label: 'Addition', icon: '➕' },
      { value: 'outdoor', label: 'Outdoor Living', icon: '🌳' },
    ],
  },
  {
    id: 'budget', icon: '💰',
    question: "What's your ideal budget range?",
    options: [
      { value: 'under_25k', label: 'Under $25K', icon: '💵' },
      { value: '25k_50k', label: '$25K - $50K', icon: '💰' },
      { value: '50k_100k', label: '$50K - $100K', icon: '💎' },
      { value: '100k_plus', label: '$100K+', icon: '🏆' },
    ],
  },
  {
    id: 'priorities', icon: '🎯',
    question: "What matters most to you?",
    options: [
      { value: 'energy_savings', label: 'Energy Savings', icon: '⚡' },
      { value: 'home_value', label: 'Home Value', icon: '📈' },
      { value: 'comfort', label: 'Comfort', icon: '☁️' },
      { value: 'security', label: 'Security', icon: '🔒' },
      { value: 'aesthetics', label: 'Aesthetics', icon: '✨' },
    ],
  },
  {
    id: 'vehicles', icon: '🚗',
    question: "How many vehicles do you have?",
    options: [
      { value: 'none', label: 'None', icon: '🚶' },
      { value: '1_2', label: '1-2', icon: '🚗' },
      { value: '3_4', label: '3-4', icon: '🚙' },
      { value: '5_plus', label: '5+', icon: '🏎️' },
    ],
  },
  {
    id: 'outdoor_features', icon: '🏊',
    question: "Any outdoor features you're dreaming about?",
    options: [
      { value: 'pool', label: 'Pool / Spa', icon: '🏊' },
      { value: 'outdoor_kitchen', label: 'Outdoor Kitchen', icon: '🍖' },
      { value: 'fire_pit', label: 'Fire Pit', icon: '🔥' },
      { value: 'garden', label: 'Garden', icon: '🌻' },
      { value: 'none', label: 'Not Right Now', icon: '⏩' },
    ],
  },
  {
    id: 'timeline', icon: '📅',
    question: "When are you looking to start?",
    options: [
      { value: 'asap', label: 'ASAP', icon: '🚀' },
      { value: '3_months', label: 'Within 3 Months', icon: '📆' },
      { value: '6_months', label: 'Within 6 Months', icon: '🗓️' },
      { value: 'planning', label: 'Just Planning', icon: '📝' },
    ],
  },
  {
    id: 'climate', icon: '🌡️',
    question: "What best describes your climate?",
    options: [
      { value: 'hot_dry', label: 'Hot & Dry', icon: '☀️' },
      { value: 'hot_humid', label: 'Hot & Humid', icon: '🌴' },
      { value: 'temperate', label: 'Temperate', icon: '🌤️' },
      { value: 'cold', label: 'Cold', icon: '❄️' },
      { value: 'mixed', label: 'Mixed Seasons', icon: '🍂' },
    ],
  },
  {
    id: 'smart_interest', icon: '🤖',
    question: "How smart-home savvy are you?",
    options: [
      { value: 'beginner', label: "What's a smart home?", icon: '🌱' },
      { value: 'intermediate', label: 'I have a few devices', icon: '📱' },
      { value: 'advanced', label: 'Pretty connected already', icon: '💡' },
      { value: 'all_in', label: 'Full automation please!', icon: '🏠' },
    ],
  },
  {
    id: 'home_size', icon: '📐',
    question: "How large is your home?",
    options: [
      { value: 'under_1500', label: 'Under 1,500 sq ft', icon: '🏡' },
      { value: '1500_2500', label: '1,500 - 2,500 sq ft', icon: '🏘️' },
      { value: '2500_4000', label: '2,500 - 4,000 sq ft', icon: '🏰' },
      { value: '4000_plus', label: '4,000+ sq ft', icon: '🏛️' },
    ],
  },
  {
    id: 'contact', icon: '📞',
    question: "Last one! How should we reach you?",
    options: [
      { value: 'email', label: 'Email Me', icon: '📧' },
      { value: 'call', label: 'Call Me', icon: '📱' },
      { value: 'text', label: 'Text Me', icon: '💬' },
      { value: 'no_contact', label: 'Just Show Results', icon: '👀' },
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
    try {
      const res = await fetch('/api/recommendations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: allAnswers }),
      });
      const data = await res.json();
      if (data?.recommendations) {
        setRecommendations(data.recommendations.map((r: any) => ({ ...r, status: 'pending' })));
      } else throw new Error('No data');
    } catch {
      setRecommendations([
        { id: '1', title: 'Smart Climate System', description: 'AI-powered thermostat with zoning for optimal comfort and savings', estimated_cost: '$3,200 - $5,800', annual_savings: '$840', roi_years: 4.5, status: 'pending' },
        { id: '2', title: 'Solar Panel Array', description: '8kW system with battery backup for energy independence', estimated_cost: '$18,000 - $24,000', annual_savings: '$2,400', roi_years: 8, status: 'pending' },
        { id: '3', title: 'Smart Lighting Package', description: 'Whole-home LED with automated scenes and circadian rhythm', estimated_cost: '$1,800 - $3,200', annual_savings: '$420', roi_years: 5, status: 'pending' },
        { id: '4', title: 'EV Charging Station', description: 'Level 2 home charger with smart scheduling and load management', estimated_cost: '$1,200 - $2,400', annual_savings: '$600', roi_years: 3, status: 'pending' },
        { id: '5', title: 'Smart Security System', description: 'Camera network, smart locks, and AI-powered monitoring', estimated_cost: '$2,400 - $4,800', annual_savings: '$360', roi_years: 8, status: 'pending' },
      ]);
    } finally {
      setTimeout(() => { setAnalyzing(false); setShowResults(true); }, 2500);
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
        <div style={{ fontSize: 64, marginBottom: 24 }}>🌵</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: TEXT, marginBottom: 12 }}>
          Sage is analyzing your profile...
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
    const accepted = recommendations.filter(r => r.status === 'accepted');
    const totalSavings = accepted.reduce((s, r) => s + parseInt(r.annual_savings.replace(/[^0-9]/g, '')), 0);
    return (
      <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '40px 20px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🌵</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
              Your Personalized <span style={{ color: GOLD }}>Recommendations</span>
            </h1>
            <p style={{ color: DIM }}>
              Tap the checkmark to accept or X to skip each recommendation
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
            <a href="/design/packages" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '16px 36px', background: `linear-gradient(135deg, ${GOLD}, #B8860B)`,
                color: '#000', border: 'none', borderRadius: 12, fontWeight: 700,
                fontSize: 16, cursor: 'pointer',
              }}>
                See Your Smart Building Packages
              </button>
            </a>
            <a href="/design/roi" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '16px 28px', background: 'transparent', color: GOLD,
                border: `2px solid ${GOLD}`, borderRadius: 12, fontWeight: 700,
                fontSize: 14, cursor: 'pointer',
              }}>
                Calculate Full ROI
              </button>
            </a>
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
        background: `${DARK}E0`, backdropFilter: 'blur(8px)', padding: '12px 20px',
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
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌵</div>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: TEXT, fontStyle: 'italic' }}>
              &ldquo;{sageReply}&rdquo;
            </p>
            <p style={{ fontSize: 13, color: GOLD, marginTop: 8, fontWeight: 600 }}>
              &mdash; Sage
            </p>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 56, marginBottom: 20 }}>{q?.icon}</div>
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
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{opt.icon}</div>
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
