'use client';
import React, { useEffect, useState, useRef, useId } from 'react';

const GREEN = '#22C55E';
const GOLD = '#C8960F';
const RED = '#EF4444';
const DIM = '#8BAAC8';
const TEXT = '#F0F4FF';

interface HealthScoreRingProps {
  score: number;
  size?: number;
  label?: string;
  strokeWidth?: number;
}

function getScoreColor(score: number): string {
  if (score >= 80) return GREEN;
  if (score >= 50) return GOLD;
  return RED;
}

export default function HealthScoreRing({
  score,
  size = 80,
  label,
  strokeWidth,
}: HealthScoreRingProps) {
  const [animatedOffset, setAnimatedOffset] = useState(0);
  const mountedRef = useRef(false);
  const uniqueId = useId();
  const gradientId = `ring-grad-${uniqueId.replace(/:/g, '')}`;

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const sw = strokeWidth || Math.max(4, Math.round(size * 0.08));
  const radius = (size - sw) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference - (clampedScore / 100) * circumference;
  const color = getScoreColor(clampedScore);

  useEffect(() => {
    // Start fully hidden (full offset)
    setAnimatedOffset(circumference);
    mountedRef.current = true;

    // Trigger animation on next frame
    const raf = requestAnimationFrame(() => {
      setAnimatedOffset(targetOffset);
    });

    return () => cancelAnimationFrame(raf);
  }, [clampedScore, circumference, targetOffset]);

  const center = size / 2;
  const fontSize = Math.round(size * 0.28);
  const labelSize = Math.round(size * 0.13);

  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: label ? 6 : 0,
    }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(-90deg)' }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.7" />
            </linearGradient>
          </defs>

          {/* Background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#EEF0F3"
            strokeWidth={sw}
          />

          {/* Score arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={animatedOffset}
            style={{
              transition: mountedRef.current
                ? 'stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)'
                : 'none',
            }}
          />
        </svg>

        {/* Centered score text */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{
            fontSize,
            fontWeight: 800,
            color: TEXT,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {clampedScore}
          </span>
        </div>
      </div>

      {label && (
        <span style={{
          fontSize: labelSize,
          fontWeight: 600,
          color: DIM,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          textAlign: 'center',
          lineHeight: 1.2,
          maxWidth: size + 10,
        }}>
          {label}
        </span>
      )}
    </div>
  );
}
