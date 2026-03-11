'use client';
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '200px', padding: '40px 24px', textAlign: 'center',
        }}>
          <div>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
            <div style={{ color: '#e8edf8', fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>Something went wrong</div>
            <div style={{ color: '#8fa3c0', fontSize: '14px', marginBottom: '20px' }}>Please refresh the page to continue.</div>
            <button onClick={() => window.location.reload()}
              style={{ padding: '10px 24px', background: 'linear-gradient(135deg,#D4A017,#F0C040)', border: 'none', borderRadius: '8px', color: '#0d1117', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
