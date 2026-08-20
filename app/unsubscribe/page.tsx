'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const unsubscribe = async (type?: string) => {
    setLoading(true);
    await fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, type }),
    });
    setDone(true);
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: '40px 48px',
        maxWidth: 480,
        width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,.08)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#D4A017', marginBottom: 24 }}>
          Saguaro
        </div>

        {done ? (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>&#x2705;</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
              Unsubscribed
            </h2>
            <p style={{ color: '#64748b', fontSize: 14 }}>
              Your email preferences have been updated. You can re-enable notifications
              in your account settings.
            </p>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
              Email Preferences
            </h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 32 }}>
              Managing notifications for <strong>{email}</strong>
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              <button
                onClick={() => unsubscribe()}
                disabled={loading}
                style={{
                  padding: '12px',
                  background: '#0f172a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Unsubscribe from all emails
              </button>
              <button
                onClick={() => unsubscribe('marketing')}
                disabled={loading}
                style={{
                  padding: '12px',
                  background: 'transparent',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                  borderRadius: 8,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Unsubscribe from marketing only (keep project notifications)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <p style={{ color: '#64748b' }}>Loading...</p>
      </div>
    }>
      <UnsubscribeContent />
    </Suspense>
  );
}
