'use client';
/**
 * Input — Saguaro design system input + textarea + select.
 * Consistent styling, focus states, labels, error messages.
 */
import React from 'react';
import { colors, font, radius } from '../../lib/design-tokens';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: font.size.sm,
  fontWeight: font.weight.semibold,
  color: colors.textMuted,
  marginBottom: 4,
};

const baseStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: colors.raised,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  color: colors.text,
  fontSize: font.size.md,
  fontFamily: font.family,
  outline: 'none',
  transition: 'border-color .15s, box-shadow .15s',
};

const errorBorderStyle = `1px solid ${colors.red}`;

function focusHandler(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>, hasError: boolean) {
  e.target.style.borderColor = hasError ? colors.red : colors.gold;
  e.target.style.boxShadow = hasError ? `0 0 0 2px rgba(239,68,68,.15)` : `0 0 0 2px rgba(212,160,23,.15)`;
}

function blurHandler(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>, hasError: boolean) {
  e.target.style.borderColor = hasError ? colors.red : colors.border;
  e.target.style.boxShadow = 'none';
}

export function Input({ label, error, hint, icon, style, ...props }: InputProps) {
  const hasError = !!error;
  return (
    <div>
      {label && <label style={labelStyle}>{label}{props.required && <span style={{ color: colors.red }}> *</span>}</label>}
      <div style={{ position: 'relative' }}>
        {icon && (
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: colors.textDim, display: 'flex', pointerEvents: 'none' }}>
            {icon}
          </span>
        )}
        <input
          {...props}
          aria-invalid={hasError}
          aria-describedby={error ? `${props.id}-error` : undefined}
          style={{
            ...baseStyle,
            border: hasError ? errorBorderStyle : baseStyle.border,
            paddingLeft: icon ? 36 : 12,
            ...style,
          }}
          onFocus={(e) => { focusHandler(e, hasError); props.onFocus?.(e); }}
          onBlur={(e) => { blurHandler(e, hasError); props.onBlur?.(e); }}
        />
      </div>
      {error && <div id={`${props.id}-error`} role="alert" style={{ fontSize: font.size.xs, color: colors.red, marginTop: 4 }}>{error}</div>}
      {hint && !error && <div style={{ fontSize: font.size.xs, color: colors.textDim, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Textarea({ label, error, hint, style, ...props }: TextareaProps) {
  const hasError = !!error;
  return (
    <div>
      {label && <label style={labelStyle}>{label}{props.required && <span style={{ color: colors.red }}> *</span>}</label>}
      <textarea
        {...props}
        aria-invalid={hasError}
        style={{
          ...baseStyle,
          border: hasError ? errorBorderStyle : baseStyle.border,
          resize: 'vertical',
          minHeight: 72,
          ...style,
        }}
        onFocus={(e) => { focusHandler(e, hasError); props.onFocus?.(e); }}
        onBlur={(e) => { blurHandler(e, hasError); props.onBlur?.(e); }}
      />
      {error && <div role="alert" style={{ fontSize: font.size.xs, color: colors.red, marginTop: 4 }}>{error}</div>}
      {hint && !error && <div style={{ fontSize: font.size.xs, color: colors.textDim, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Select({ label, error, hint, options, placeholder, style, ...props }: SelectProps) {
  const hasError = !!error;
  return (
    <div>
      {label && <label style={labelStyle}>{label}{props.required && <span style={{ color: colors.red }}> *</span>}</label>}
      <select
        {...props}
        aria-invalid={hasError}
        style={{
          ...baseStyle,
          border: hasError ? errorBorderStyle : baseStyle.border,
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%238fa3c0'%3E%3Cpath d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          paddingRight: 32,
          ...style,
        }}
        onFocus={(e) => { focusHandler(e, hasError); props.onFocus?.(e); }}
        onBlur={(e) => { blurHandler(e, hasError); props.onBlur?.(e); }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <div role="alert" style={{ fontSize: font.size.xs, color: colors.red, marginTop: 4 }}>{error}</div>}
      {hint && !error && <div style={{ fontSize: font.size.xs, color: colors.textDim, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
