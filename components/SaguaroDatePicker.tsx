'use client';
import React from 'react';
import DatePicker from 'react-datepicker';

const DARK = '#0d1117';
const BORDER = '#263347';
const TEXT = '#e8edf8';

const DEFAULT_INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: DARK,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  color: TEXT,
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
};

interface SaguaroDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
  placeholder?: string;
}

interface CustomInputProps {
  value?: string;
  onClick?: React.MouseEventHandler<HTMLInputElement>;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  inputStyle: React.CSSProperties;
}

const CustomInput = React.forwardRef<HTMLInputElement, CustomInputProps>(
  ({ value, onClick, onChange, placeholder, inputStyle }, ref) => (
    <input
      ref={ref}
      value={value ?? ''}
      onClick={onClick}
      onChange={onChange ?? (() => {})}
      placeholder={placeholder ?? 'MM/DD/YYYY'}
      style={inputStyle}
      readOnly
    />
  )
);
CustomInput.displayName = 'SaguaroDateInput';

function parseISOString(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISOString(d: Date | null): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function SaguaroDatePicker({ value, onChange, style, placeholder }: SaguaroDatePickerProps) {
  const selected = parseISOString(value);
  const inputStyle = { ...DEFAULT_INPUT_STYLE, ...style };

  return (
    <DatePicker
      selected={selected}
      onChange={(date: Date | null) => onChange(toISOString(date))}
      dateFormat="MM/dd/yyyy"
      placeholderText={placeholder ?? 'MM/DD/YYYY'}
      showPopperArrow={false}
      calendarClassName="saguaro-calendar"
      popperPlacement="bottom-start"
      customInput={<CustomInput inputStyle={inputStyle} />}
    />
  );
}
