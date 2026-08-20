'use client';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { F } from '@/lib/field-tokens';

const glass: React.CSSProperties = { background: F.card, border: `1px solid ${F.border}`, borderRadius: 16 };

function detectPlatform(): 'ios' | 'android' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

interface ConnectPackage {
  connection: {
    name: string;
    ssid: string | null;
    wifi_password: string | null;
    wifi_security: string;
    wifi_hidden: boolean;
    frequency: string;
    wifi_qr_data: string | null;
    vpn_enabled: boolean;
    vpn_type: string;
    wireguard_config: string | null;
    gateway_ip: string | null;
    notes: string | null;
  };
  expires_at: string;
  project_name: string;
  token_id: string;
  issued_to?: string;
  message?: string;
}

type Step = 'loading' | 'wifi' | 'vpn' | 'done' | 'error';
type InstrTab = 'ios' | 'android' | 'windows' | 'mac';

function ConnectContent() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>('loading');
  const [data, setData] = useState<ConnectPackage | null>(null);
  const [error, setError] = useState('');
  const [errorType, setErrorType] = useState<'expired' | 'revoked' | 'invalid'>('invalid');
  const [showPass, setShowPass] = useState(false);
  const [copied, setCopied] = useState('');
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const [instrTab, setInstrTab] = useState<InstrTab>('ios');
  const [timeLeft, setTimeLeft] = useState('');
  const [timeUrgent, setTimeUrgent] = useState(false);
  const wifiQrRef = useRef<HTMLCanvasElement>(null);
  const vpnQrRef = useRef<HTMLCanvasElement>(null);

  // Detect platform and set initial instruction tab
  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);
    if (p === 'ios') setInstrTab('ios');
    else if (p === 'android') setInstrTab('android');
    else setInstrTab('windows');
  }, []);

  // Fetch credentials on mount
  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) { setError('No access token in this link.'); setErrorType('invalid'); setStep('error'); return; }

    fetch(`/api/network/connect/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setError(d.error);
          if (d.expired) setErrorType('expired');
          else if (d.error.includes('revoked')) setErrorType('revoked');
          else setErrorType('invalid');
          setStep('error');
        } else {
          setData(d);
          setStep('wifi');
        }
      })
      .catch(() => { setError('Network error loading credentials. Check your internet connection.'); setErrorType('invalid'); setStep('error'); });
  }, [searchParams]);

  // Expiry countdown
  useEffect(() => {
    if (!data?.expires_at) return;
    const update = () => {
      const diff = new Date(data.expires_at).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Expired'); setTimeUrgent(true); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeUrgent(diff < 3600000);
      setTimeLeft(h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [data?.expires_at]);

  // Generate WiFi QR
  useEffect(() => {
    if (!data?.connection.wifi_qr_data || !wifiQrRef.current) return;
    import('qrcode').then(QRCode => {
      QRCode.toCanvas(wifiQrRef.current!, data.connection.wifi_qr_data!, {
        width: 220, margin: 2, color: { dark: '#0d1117', light: '#ffffff' },
      });
    }).catch(() => {});
  }, [data?.connection.wifi_qr_data, step]);

  // Generate VPN QR
  useEffect(() => {
    if (!data?.connection.wireguard_config || !vpnQrRef.current || step !== 'vpn') return;
    import('qrcode').then(QRCode => {
      QRCode.toCanvas(vpnQrRef.current!, data.connection.wireguard_config!, {
        width: 200, margin: 2, color: { dark: '#0d1117', light: '#ffffff' },
      });
    }).catch(() => {});
  }, [data?.connection.wireguard_config, step]);

  const handleCopy = async (text: string, field: string) => {
    await copyText(text);
    setCopied(field);
    setTimeout(() => setCopied(''), 2000);
  };

  const downloadConfig = () => {
    if (!data?.connection.wireguard_config) return;
    const blob = new Blob([data.connection.wireguard_config], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(data.project_name || 'saguaro').replace(/\s+/g, '-')}-vpn.conf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openWifiSettings = () => {
    if (platform === 'ios') window.location.href = 'App-prefs:root=WIFI';
    else if (platform === 'android') {
      try { window.location.href = 'intent://settings#Intent;scheme=android-app;package=com.android.settings;action=android.settings.WIFI_SETTINGS;end'; }
      catch { window.location.href = 'content://settings/wifi'; }
    } else alert('Open Settings \u2192 WiFi on your device');
  };

  const CopyBtn = ({ text, field }: { text: string; field: string }) => (
    <button onClick={() => handleCopy(text, field)} style={{
      background: copied === field ? F.greenBg : 'rgba(200,150,15,.1)',
      border: `1px solid ${copied === field ? 'rgba(34,197,94,.3)' : F.goldBorder}`,
      borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
      color: copied === field ? F.green : F.gold, minWidth: 64, transition: 'all .2s',
    }}>
      {copied === field ? '\u2713 Copied' : 'Copy'}
    </button>
  );

  // ─── LOADING ───
  if (step === 'loading') return (
    <div style={{ minHeight: '100vh', background: F.dark, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: F.dim }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDD0C'}</div>
        <div style={{ width: 36, height: 36, border: '3px solid rgba(200,150,15,.2)', borderTopColor: F.gold, borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 16px' }} />
        <div style={{ fontSize: 14 }}>Loading network access...</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
      </div>
    </div>
  );

  // ─── ERROR ───
  if (step === 'error') return (
    <div style={{ minHeight: '100vh', background: F.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ ...glass, padding: 32, maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>
          {errorType === 'expired' ? '\u23F0' : errorType === 'revoked' ? '\u26D4' : '\u26A0\uFE0F'}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: F.text, margin: '0 0 8px' }}>
          {errorType === 'expired' ? 'Access Link Expired' : errorType === 'revoked' ? 'Access Revoked' : 'Invalid Link'}
        </h2>
        <p style={{ fontSize: 14, color: F.dim, margin: '0 0 20px', lineHeight: 1.6 }}>{error}</p>
        {errorType === 'expired' && (
          <p style={{ fontSize: 13, color: F.dim, lineHeight: 1.5 }}>Access links are valid for 12 hours. Contact your project manager for a new link.</p>
        )}
        {errorType === 'revoked' && (
          <p style={{ fontSize: 13, color: F.dim, lineHeight: 1.5 }}>This link was deactivated by your administrator.</p>
        )}
        <a href="/field" style={{
          display: 'inline-block', marginTop: 16, padding: '12px 24px',
          background: F.raised, border: `1px solid ${F.border}`, borderRadius: 10,
          color: F.dim, fontSize: 13, fontWeight: 600, textDecoration: 'none',
        }}>Return to App</a>
      </div>
    </div>
  );

  // ─── DONE ───
  if (step === 'done') return (
    <div style={{ minHeight: '100vh', background: F.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>{'\u2705'}</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: F.text, margin: '0 0 8px' }}>You're Connected!</h1>
        <div style={{ ...glass, padding: 20, marginTop: 20, textAlign: 'left' }}>
          {[
            { label: 'Network', value: data?.connection.ssid || data?.connection.name },
            { label: 'VPN', value: data?.connection.vpn_enabled ? 'Active \u2713' : 'Not configured' },
            { label: 'Project', value: data?.project_name },
            { label: 'Access expires', value: data?.expires_at ? new Date(data.expires_at).toLocaleString() : '' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${F.borderDim}` }}>
              <span style={{ fontSize: 13, color: F.dim }}>{r.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: r.label === 'VPN' && data?.connection.vpn_enabled ? F.green : F.text }}>{r.value}</span>
            </div>
          ))}
        </div>
        <a href="/field" style={{
          display: 'block', marginTop: 24, padding: '14px', textAlign: 'center',
          background: `linear-gradient(135deg, #B8860B, ${F.gold})`, border: 'none', borderRadius: 12,
          color: '#fff', fontSize: 16, fontWeight: 800, textDecoration: 'none',
        }}>Open Saguaro Field App {'\u2192'}</a>
      </div>
    </div>
  );

  // ─── WIFI STEP ───
  if (step === 'wifi' && data) return (
    <div style={{ minHeight: '100vh', background: F.dark, padding: '24px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ ...glass, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>{'\uD83D\uDD0C'}</span>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: F.text, margin: 0 }}>Network Access</h1>
              <p style={{ fontSize: 12, color: F.dim, margin: '2px 0 0' }}>{data.project_name}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: timeUrgent ? F.amber : F.green }}>
                {'\u23F1'} {timeLeft}
              </div>
            </div>
          </div>
          {data.issued_to && <p style={{ fontSize: 12, color: F.dim, margin: '8px 0 0' }}>Welcome, {data.issued_to}</p>}
          {data.message && <p style={{ fontSize: 11, color: F.dim, margin: '6px 0 0', fontStyle: 'italic' }}>{data.message}</p>}
        </div>

        {/* QR Code */}
        {data.connection.wifi_qr_data && (
          <div style={{ ...glass, padding: 24, marginBottom: 16, textAlign: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 16, display: 'inline-block' }}>
              <canvas ref={wifiQrRef} />
            </div>
            <p style={{ fontSize: 11, color: F.dim, marginTop: 8 }}>{'\uD83D\uDCF7'} Scan with your camera to connect automatically</p>
          </div>
        )}

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
          <div style={{ flex: 1, height: 1, background: F.borderDim }} />
          <span style={{ fontSize: 11, color: F.faint }}>Or connect manually</span>
          <div style={{ flex: 1, height: 1, background: F.borderDim }} />
        </div>

        {/* Manual Credentials */}
        <div style={{ ...glass, padding: 20, marginBottom: 16 }}>
          {/* SSID */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: F.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>Network Name</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, padding: '10px 14px', background: F.surface, borderRadius: 8, border: `1px solid ${F.borderDim}`, fontSize: 15, fontWeight: 700, color: F.text }}>
                {data.connection.ssid || data.connection.name}
              </div>
              {data.connection.ssid && <CopyBtn text={data.connection.ssid} field="ssid" />}
            </div>
          </div>

          {/* Password */}
          {data.connection.wifi_password && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: F.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>Password</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, padding: '10px 14px', background: F.surface, borderRadius: 8, border: `1px solid ${F.borderDim}`, fontSize: 15, fontWeight: 700, color: F.text, fontFamily: 'monospace' }}>
                  {showPass ? data.connection.wifi_password : '\u2022'.repeat(Math.min(data.connection.wifi_password.length, 12))}
                </div>
                <button onClick={() => setShowPass(p => !p)} style={{
                  background: 'transparent', border: `1px solid ${F.border}`, borderRadius: 8,
                  padding: '8px 10px', fontSize: 14, color: F.dim, cursor: 'pointer', minWidth: 40,
                }}>
                  {showPass ? '\uD83D\uDE48' : '\uD83D\uDC41'}
                </button>
                <CopyBtn text={data.connection.wifi_password} field="password" />
              </div>
            </div>
          )}

          {/* Info row */}
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: F.dim }}>
            <span>Security: <strong style={{ color: F.text }}>{data.connection.wifi_security}</strong></span>
            <span>Band: <strong style={{ color: F.text }}>{data.connection.frequency}</strong></span>
          </div>
        </div>

        {/* Open WiFi Settings */}
        {platform !== 'desktop' && (
          <button onClick={openWifiSettings} style={{
            width: '100%', padding: '14px', marginBottom: 16,
            background: `linear-gradient(135deg, #B8860B, ${F.gold})`, border: 'none', borderRadius: 12,
            color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', minHeight: 48,
          }}>
            {'\uD83D\uDCF1'} Open WiFi Settings
          </button>
        )}

        {/* Platform Instructions */}
        <div style={{ ...glass, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 0, marginBottom: 12 }}>
            {(['ios', 'android', 'windows', 'mac'] as InstrTab[]).map(tab => (
              <button key={tab} onClick={() => setInstrTab(tab)} style={{
                flex: 1, padding: '8px 4px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: 'transparent', border: 'none', borderBottom: `2px solid ${instrTab === tab ? F.gold : 'transparent'}`,
                color: instrTab === tab ? F.gold : F.dim, textTransform: 'capitalize', transition: 'all .2s',
              }}>
                {tab === 'ios' ? 'iOS' : tab === 'android' ? 'Android' : tab === 'windows' ? 'Windows' : 'Mac'}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: F.dim, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
            {instrTab === 'ios' && `1. Open Settings app\n2. Tap WiFi\n3. Find "${data.connection.ssid}" in the list\n4. Tap it and enter your password\n5. Tap Join`}
            {instrTab === 'android' && `1. Open Settings app\n2. Tap Network & Internet \u2192 WiFi\n3. Find "${data.connection.ssid}" in the list\n4. Tap it and enter your password\n5. Tap Connect`}
            {instrTab === 'windows' && `1. Click the WiFi icon in taskbar (bottom right)\n2. Click "${data.connection.ssid}"\n3. Click Connect\n4. Enter password \u2192 Next`}
            {instrTab === 'mac' && `1. Click WiFi icon in menu bar (top right)\n2. Click "${data.connection.ssid}"\n3. Enter password \u2192 Join`}
          </div>
        </div>

        {/* Continue / Done Button */}
        <button onClick={() => data.connection.vpn_enabled ? setStep('vpn') : setStep('done')} style={{
          width: '100%', padding: '16px', marginBottom: 24,
          background: data.connection.vpn_enabled ? F.blue : F.green, border: 'none', borderRadius: 12,
          color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', minHeight: 52,
        }}>
          {data.connection.vpn_enabled ? 'Connected \u2713 \u2014 Set Up VPN \u2192' : '\u2713 I\'m Connected \u2014 Done'}
        </button>
      </div>
    </div>
  );

  // ─── VPN STEP ───
  if (step === 'vpn' && data) return (
    <div style={{ minHeight: '100vh', background: F.dark, padding: '24px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ ...glass, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>{'\uD83D\uDD12'}</span>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: F.text, margin: 0 }}>VPN Setup</h1>
              <p style={{ fontSize: 12, color: F.dim, margin: '2px 0 0' }}>Secure your job site connection</p>
            </div>
          </div>
        </div>

        {/* Step 1: Install WireGuard */}
        <div style={{ ...glass, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: F.gold, marginBottom: 8 }}>STEP 1</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: F.text, marginBottom: 12 }}>Install WireGuard First</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="https://apps.apple.com/app/wireguard/id1441195209" target="_blank" rel="noopener" style={{
              flex: 1, padding: '12px', background: F.surface, border: `1px solid ${F.border}`,
              borderRadius: 10, color: F.text, fontSize: 13, fontWeight: 700, textDecoration: 'none', textAlign: 'center',
            }}>
              {'\uD83D\uDCF1'} App Store
            </a>
            <a href="https://play.google.com/store/apps/details?id=com.wireguard.android" target="_blank" rel="noopener" style={{
              flex: 1, padding: '12px', background: F.surface, border: `1px solid ${F.border}`,
              borderRadius: 10, color: F.text, fontSize: 13, fontWeight: 700, textDecoration: 'none', textAlign: 'center',
            }}>
              {'\uD83E\uDD16'} Google Play
            </a>
          </div>
        </div>

        {/* Step 2: QR or Download */}
        <div style={{ ...glass, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: F.gold, marginBottom: 8 }}>STEP 2</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: F.text, marginBottom: 12 }}>Scan QR Code in WireGuard</div>

          {data.connection.wireguard_config && (
            <>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ background: '#fff', borderRadius: 12, padding: 16, display: 'inline-block' }}>
                  <canvas ref={vpnQrRef} />
                </div>
                <p style={{ fontSize: 11, color: F.dim, marginTop: 8 }}>Open WireGuard {'\u2192'} tap + {'\u2192'} Scan from QR code</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0' }}>
                <div style={{ flex: 1, height: 1, background: F.borderDim }} />
                <span style={{ fontSize: 11, color: F.faint }}>Or download config file</span>
                <div style={{ flex: 1, height: 1, background: F.borderDim }} />
              </div>

              <button onClick={downloadConfig} style={{
                width: '100%', padding: '12px', background: F.surface,
                border: `1px solid ${F.goldBorder}`, borderRadius: 10,
                color: F.gold, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>
                {'\u2B07'} Download .conf File
              </button>
            </>
          )}
        </div>

        {/* Step 3: Platform Instructions */}
        <div style={{ ...glass, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: F.gold, marginBottom: 8 }}>STEP 3</div>
          <div style={{ display: 'flex', gap: 0, marginBottom: 12 }}>
            {(['ios', 'android'] as const).map(tab => (
              <button key={tab} onClick={() => setInstrTab(tab)} style={{
                flex: 1, padding: '8px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: 'transparent', border: 'none',
                borderBottom: `2px solid ${instrTab === tab ? F.gold : 'transparent'}`,
                color: instrTab === tab ? F.gold : F.dim,
              }}>
                {tab === 'ios' ? 'iOS' : 'Android'}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: F.dim, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
            {instrTab === 'ios' && `1. Tap "Download .conf File" above\n2. Tap the Share icon \u2192 "Copy to WireGuard"\n3. OR: Open WireGuard \u2192 + \u2192 Scan QR code\n4. Tap "Allow" when asked about VPN configuration\n5. Toggle the tunnel to ON`}
            {instrTab === 'android' && `1. Open WireGuard app\n2. Tap the + button \u2192 "Scan from QR code"\n3. Scan the QR code above\n4. Give the tunnel a name \u2192 tap "Create"\n5. Toggle the tunnel to ON`}
            {(instrTab !== 'ios' && instrTab !== 'android') && `1. Open WireGuard app\n2. Import the .conf file\n3. Activate the tunnel`}
          </div>
        </div>

        {/* Done button */}
        <button onClick={() => setStep('done')} style={{
          width: '100%', padding: '16px', marginBottom: 12,
          background: F.green, border: 'none', borderRadius: 12,
          color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', minHeight: 52,
        }}>
          {'\uD83D\uDD12'} VPN Active \u2014 Done {'\u2713'}
        </button>

        <button onClick={() => setStep('done')} style={{
          width: '100%', padding: '12px', background: 'transparent', border: 'none',
          color: F.dim, fontSize: 13, cursor: 'pointer',
        }}>
          Skip VPN for now
        </button>
      </div>
    </div>
  );

  return null;
}

export default function NetworkConnectPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#8BAAC8' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDD0C'}</div>
          <div style={{ fontSize: 14 }}>Loading...</div>
        </div>
      </div>
    }>
      <ConnectContent />
    </Suspense>
  );
}
