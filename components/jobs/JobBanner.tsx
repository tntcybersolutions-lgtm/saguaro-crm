'use client';
/**
 * JobBanner — the top of a job's home page: the job's picture edge to edge,
 * the facts beside it (below it on a phone), the site's 4-day weather with
 * stop-work days flagged, and the faces of the people on the job.
 *
 * Data (each part fails on its own and simply hides; nothing is invented):
 *   GET  /api/projects/[id]/banner    cover or newest photo, recent pictures, team faces
 *   POST /api/projects/[id]/banner    { photoId } set / clear the cover
 *   GET  /api/projects/[id]/weather   NWS outlook, today + 3 days
 *
 * Words never sit on the photo. The photo is cropped only when it is already
 * a wide band (lib/job-banner photoFit); otherwise it is shown whole over a
 * soft blur of itself.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import {
  Sun, Cloud, CloudSun, CloudRain, CloudLightning, CloudFog, Snowflake, Wind, Moon, MapPin, Hash, Camera, ImageSquare, Plus, WarningCircle,
} from '@phosphor-icons/react';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { humanError } from '@/lib/errors';
import { stopWorkFlags, trimTeam, initials, photoFit, type WeatherDay, type TeamFace } from '@/lib/job-banner';

type BannerData = {
  photo: { url: string; source: 'cover' | 'latest'; id: string | null } | null;
  recent: { id: string; url: string; thumbnail_url: string | null; title: string | null }[];
  team: TeamFace[];
};
type Outlook = { available: false } | { available: true; days: WeatherDay[] };

export type JobBannerFacts = {
  name: string;
  number: string | null;
  stage: string;
  stageTone?: 'success' | 'info';
  address: string | null;
  contract: string | null;      // formatted, or null while loading / unknown
  pctComplete: number | null;
  daysLeft: number | null;      // null = no finish date or the job is closed
};

const fetcher = async (url: string) => {
  const r = await fetch(url, { headers: await getAuthHeaders() });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error || `Request failed (${r.status})`);
  return body;
};

function WeatherIcon({ d }: { d: WeatherDay }) {
  const c = String(d.conditions || '').toLowerCase();
  const p = { size: 26, weight: 'duotone' as const, 'aria-hidden': true };
  if (/thunder|storm/.test(c)) return <CloudLightning {...p} className="jb-wi" data-k="storm" />;
  if (/snow|sleet|ice|flurr/.test(c)) return <Snowflake {...p} className="jb-wi" data-k="cold" />;
  if (/rain|shower|drizzle/.test(c)) return <CloudRain {...p} className="jb-wi" data-k="rain" />;
  if (/fog|haze|smoke|dust/.test(c)) return <CloudFog {...p} className="jb-wi" data-k="cloud" />;
  if (/wind|breez|gust/.test(c)) return <Wind {...p} className="jb-wi" data-k="cloud" />;
  if (/partly|mostly sunny|mostly clear/.test(c)) return <CloudSun {...p} className="jb-wi" data-k="sun" />;
  if (/cloud|overcast/.test(c)) return <Cloud {...p} className="jb-wi" data-k="cloud" />;
  if (/clear/.test(c) && d.highF == null) return <Moon {...p} className="jb-wi" data-k="cloud" />;
  return <Sun {...p} className="jb-wi" data-k="sun" />;
}

const dayShort = (d: WeatherDay, i: number) => (i === 0 ? 'Today' : new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }));

function Weather({ days }: { days: WeatherDay[] }) {
  return (
    <ol className="jb-wx" aria-label="Job site weather">
      {days.map((d, i) => {
        const flag = stopWorkFlags(d);
        const label = `${dayShort(d, i)}: ${d.conditions || 'forecast'}${d.highF != null ? `, high ${d.highF}°` : ''}${d.lowF != null ? `, low ${d.lowF}°` : ''}${d.rainPct != null ? `, rain ${d.rainPct}%` : ''}${d.wind ? `, wind ${d.wind}` : ''}${flag ? `. ${flag.level === 'stop' ? 'Likely stops work' : 'Watch'}: ${flag.reasons.join(', ')}` : ''}`;
        return (
          <li key={d.date} className="jb-wd" data-flag={flag?.level} title={label} aria-label={label}>
            <span className="jb-wd-n">{dayShort(d, i)}</span>
            <WeatherIcon d={d} />
            <span className="jb-wd-t"><b>{d.highF != null ? `${d.highF}°` : '—'}</b>{d.lowF != null && <span>{d.lowF}°</span>}</span>
            <span className="jb-wd-s">
              {flag ? flag.reasons[0] : [d.rainPct != null ? `${d.rainPct}%` : null, d.windMph != null ? `${d.windMph} mph` : null].filter(Boolean).join(' · ') || ' '}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Faces({ team, href }: { team: TeamFace[]; href: string }) {
  const { shown, more } = trimTeam(team, 6);
  if (!shown.length) return <Link href={href} className="jb-team-empty"><Plus size={14} weight="bold" aria-hidden="true" />Add people to this job</Link>;
  return (
    <Link href={href} className="jb-team" aria-label={`Team: ${team.length} ${team.length === 1 ? 'person' : 'people'}. Open the team page`}>
      <span className="jb-faces">
        {shown.map((f) => (
          <span key={f.key} className="jb-face" data-tip={f.role ? `${f.name} · ${f.role}` : f.name} title={f.role ? `${f.name} · ${f.role}` : f.name}>
            {f.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={f.avatarUrl} alt={f.name} loading="lazy" />
              : <span className="jb-ini" aria-label={f.name}>{initials(f.name)}</span>}
          </span>
        ))}
        {more > 0 && <span className="jb-face jb-more" aria-label={`${more} more`}>+{more}</span>}
      </span>
      <span className="jb-team-l">Team · {team.length}</span>
    </Link>
  );
}

/** The picture: whole unless it already is a wide band; never any words on it. */
function Photo({ url, alt }: { url: string; alt: string }) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [fit, setFit] = useState<'cover' | 'contain'>('contain');
  const measure = useCallback(() => {
    const b = box.current?.getBoundingClientRect();
    const i = img.current;
    if (!b || !i || !i.naturalWidth) return;
    setFit(photoFit(i.naturalWidth, i.naturalHeight, b.width, b.height));
  }, []);
  useEffect(() => {
    if (!box.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [measure]);
  return (
    <div className="jb-photo" ref={box} data-fit={fit}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {fit === 'contain' && <img className="jb-photo-bg" src={url} alt="" aria-hidden="true" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={img} className="jb-photo-img" src={url} alt={alt} onLoad={measure} />
    </div>
  );
}

export default function JobBanner({ projectId, facts, action }: { projectId: string; facts: JobBannerFacts; action?: React.ReactNode }) {
  const base = `/app/projects/${projectId}`;
  const { data: b, error: bErr, mutate } = useSWR<BannerData>(projectId ? `/api/projects/${projectId}/banner` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: wx } = useSWR<Outlook>(projectId ? `/api/projects/${projectId}/weather` : null, fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  async function setCover(photoId: string | null) {
    setBusy(photoId || 'clear'); setErr('');
    try {
      const r = await fetch(`/api/projects/${projectId}/banner`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) }, body: JSON.stringify({ photoId }) });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error || "The cover didn't change.");
      await mutate();
      setPicking(false);
    } catch (e) {
      setErr(humanError(e, "The cover didn't change. Try again."));
    } finally { setBusy(null); }
  }

  const photo = b?.photo ?? null;
  const loadingPhoto = !b && !bErr;
  const days = wx && wx.available ? wx.days : [];
  const late = facts.daysLeft != null && facts.daysLeft < 0;

  return (
    <section className="jb" aria-label="Job banner" data-nophoto={(!photo && !loadingPhoto) || undefined}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="jb-grid" data-wx={days.length > 0 || undefined}>
        {loadingPhoto ? <div className="jb-photo" data-loading="true" aria-busy="true" aria-label="Loading the job photo" />
          : photo ? <Photo url={photo.url} alt={`${facts.name} job site`} />
          : (
            <div className="jb-photo jb-nophoto">
              <ImageSquare size={36} weight="duotone" aria-hidden="true" />
              <Link href={`${base}/photos?add=1`} className="fl-act" data-k="primary"><Camera size={16} weight="bold" aria-hidden="true" />Add job photo</Link>
            </div>
          )}

        <div className="jb-facts">
          <div className="jb-title">
            <h1 className="k-title">{facts.name}</h1>
            <span className="jx-pill" data-tone={facts.stageTone}>{facts.stage}</span>
            {action && <span className="jb-action">{action}</span>}
          </div>
          {(facts.number || facts.address) && (
            <p className="jb-meta">
              {facts.number && <span><Hash size={14} weight="bold" aria-hidden="true" />{facts.number}</span>}
              {facts.address && <span><MapPin size={14} weight="bold" aria-hidden="true" />{facts.address}</span>}
            </p>
          )}
          <dl className="jb-nums">
            <div><dt>Contract</dt><dd>{facts.contract ?? <i className="jx-skel-val" />}</dd></div>
            {facts.pctComplete != null && <div><dt>Complete</dt><dd>{Math.round(facts.pctComplete)}%</dd></div>}
            {facts.daysLeft != null && (
              <div data-late={late || undefined}><dt>{late ? 'Past finish' : 'Days left'}</dt><dd>{Math.abs(facts.daysLeft).toLocaleString('en-US')}{late ? ' late' : ''}</dd></div>
            )}
          </dl>
          <div className="jb-foot">
            {b && <Faces team={b.team} href={`${base}/team`} />}
            {b && b.recent.length > 0 && (
              <button type="button" className="jb-link" aria-expanded={picking} onClick={() => setPicking((v) => !v)}>
                <ImageSquare size={14} weight="bold" aria-hidden="true" />{photo?.source === 'cover' ? 'Change cover' : 'Set cover'}
              </button>
            )}
            {bErr && <span className="jb-err"><WarningCircle size={14} weight="fill" aria-hidden="true" />Photo and team didn&apos;t load. <button type="button" className="jb-link" onClick={() => { void mutate(); }}>Retry</button></span>}
          </div>
        </div>

        {days.length > 0 && <div className="jb-wxwrap"><Weather days={days} /></div>}
      </div>

      {picking && b && (
        <div className="jb-pick" role="group" aria-label="Choose the cover photo">
          <ul>
            {b.recent.map((r) => (
              <li key={r.id}>
                <button type="button" className="jb-thumb" data-on={photo?.source === 'cover' && photo.id === r.id || undefined} disabled={!!busy} aria-label={`Use ${r.title || 'this photo'} as the cover`} onClick={() => void setCover(r.id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.thumbnail_url || r.url} alt="" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
          <div className="jb-pick-acts">
            <Link href={`${base}/photos?add=1`} className="jb-link"><Plus size={14} weight="bold" aria-hidden="true" />Add photo</Link>
            {photo?.source === 'cover' && <button type="button" className="jb-link" disabled={!!busy} onClick={() => void setCover(null)}>{busy === 'clear' ? 'Saving…' : 'Use newest photo'}</button>}
            {busy && busy !== 'clear' && <span className="jb-note" role="status">Saving…</span>}
            {err && <span className="jb-err" role="alert">{err}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

/* Injected with dangerouslySetInnerHTML (tools/check-style-escapes.mjs). */
const CSS = `
.jb{margin:0 calc(-1 * var(--page-gutter)) 12px;border-top:1px solid var(--fl-line);border-bottom:1px solid var(--fl-line);background:var(--bg-surface)}
.jb-grid{display:grid;grid-template-columns:minmax(0,1fr);grid-template-areas:"photo" "facts" "wx"}
.jb-photo{grid-area:photo;position:relative;overflow:hidden;height:200px;background:var(--bg-base)}
.jb-photo[data-loading]{animation:jx-pulse 1.2s ease-in-out infinite;background:var(--fl-line)}
.jb-photo-img{position:relative;display:block;width:100%;height:100%;object-position:center}
.jb-photo[data-fit=cover] .jb-photo-img{object-fit:cover}
.jb-photo[data-fit=contain] .jb-photo-img{object-fit:contain}
.jb-photo-bg{position:absolute;inset:-24px;width:calc(100% + 48px);height:calc(100% + 48px);object-fit:cover;filter:blur(22px) brightness(.5) saturate(1.1)}
.jb-nophoto{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--text-tertiary);background:var(--bg-surface-2)}
.jb-nophoto .fl-act{min-height:44px;padding:0 18px;font-size:14px;text-decoration:none}
.jb-facts{grid-area:facts;min-width:0;display:flex;flex-direction:column;gap:8px;padding:14px var(--page-gutter) 12px}
.jb-title{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;min-width:0}
.jb .jb-title h1{margin:0;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.jb-action{margin-left:auto}
.jb-meta{display:flex;flex-wrap:wrap;gap:4px 16px;margin:0;font-size:14px;color:var(--text-secondary);line-height:1.35}
.jb-meta>span{display:inline-flex;align-items:center;gap:5px;min-width:0}
.jb-meta svg{flex:none;color:var(--text-tertiary)}
.jb-nums{display:flex;flex-wrap:wrap;gap:4px 28px;margin:2px 0 0}
.jb-nums>div{display:flex;flex-direction:column-reverse;gap:1px;min-width:0}
.jb-nums dt{font-size:12px;font-weight:600;color:var(--text-tertiary)}
.jb-nums dd{margin:0;font-size:20px;font-weight:800;color:var(--text-primary);font-variant-numeric:tabular-nums;line-height:1.15}
.jb-nums [data-late] dd{color:var(--danger)}
.jb-foot{display:flex;align-items:center;flex-wrap:wrap;gap:8px 16px;margin-top:auto}
.jb-team,.jb-team-empty{display:inline-flex;align-items:center;gap:10px;min-height:44px;text-decoration:none;color:var(--text-secondary);font-size:13px;font-weight:650}
.jb-team:hover .jb-team-l,.jb-team-empty:hover{color:var(--text-primary)}
.jb-team:focus-visible,.jb-team-empty:focus-visible,.jb-link:focus-visible,.jb-thumb:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;border-radius:8px}
.jb-faces{display:inline-flex;align-items:center}
.jb-face{position:relative;display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;border:2px solid var(--bg-surface);background:var(--bg-surface-2);color:var(--text-primary);font-size:12px;font-weight:800;flex:none}
.jb-face+.jb-face{margin-left:-8px}
.jb-face img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}
.jb-ini{letter-spacing:.02em}
.jb-more{background:var(--bg-base);color:var(--text-secondary)}
.jb-face[data-tip]:hover::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);white-space:nowrap;padding:5px 8px;border-radius:6px;background:var(--bg-base);border:1px solid var(--border-default);color:var(--text-primary);font-size:12px;font-weight:600;z-index:5;pointer-events:none}
.jb-link{display:inline-flex;align-items:center;gap:5px;min-height:44px;padding:0;background:none;border:0;font:inherit;font-size:13px;font-weight:650;color:var(--text-secondary);cursor:pointer;text-decoration:none}
.jb-link:hover:not([disabled]){color:var(--text-primary)}
.jb-link[disabled]{opacity:.6;cursor:default}
.jb-err{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--danger)}
.jb-note{font-size:13px;color:var(--text-secondary)}
.jb-wxwrap{grid-area:wx;min-width:0;border-top:1px solid var(--fl-line)}
.jb-wx{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}
.jb-wd{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 4px;min-width:0;text-align:center}
.jb-wd+.jb-wd{border-left:1px solid var(--fl-line)}
.jb-wd::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:transparent}
.jb-wd[data-flag=stop]::before{background:var(--danger)}
.jb-wd[data-flag=watch]::before{background:var(--warning)}
.jb-wd[data-flag=stop]{background:var(--danger-bg)}
.jb-wd-n{font-size:12px;font-weight:700;color:var(--text-secondary)}
.jb-wi{color:var(--text-secondary)}
.jb-wi[data-k=sun]{color:var(--warning)}
.jb-wi[data-k=storm]{color:var(--danger)}
.jb-wd-t{display:inline-flex;align-items:baseline;gap:5px;font-variant-numeric:tabular-nums}
.jb-wd-t b{font-size:15px;font-weight:800;color:var(--text-primary)}
.jb-wd-t span{font-size:13px;color:var(--text-tertiary)}
.jb-wd-s{font-size:12px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.jb-wd[data-flag=stop] .jb-wd-s{color:var(--danger);font-weight:700}
.jb-wd[data-flag=watch] .jb-wd-s{color:var(--warning);font-weight:700}
.jb-pick{border-top:1px solid var(--fl-line);padding:10px var(--page-gutter) 4px}
.jb-pick ul{list-style:none;margin:0;padding:0 0 4px;display:flex;gap:8px;overflow-x:auto;scrollbar-width:thin}
.jb-thumb{display:block;width:96px;height:72px;padding:0;border-radius:8px;border:2px solid transparent;background:var(--bg-base);cursor:pointer;overflow:hidden}
.jb-thumb[data-on]{border-color:var(--brand-primary)}
.jb-thumb:hover:not([disabled]){border-color:var(--border-default)}
.jb-thumb[data-on]:hover{border-color:var(--brand-primary)}
.jb-thumb img{width:100%;height:100%;object-fit:contain;display:block}
.jb-pick-acts{display:flex;flex-wrap:wrap;align-items:center;gap:4px 18px}
@media (min-width:760px){
  .jb-grid{grid-template-columns:minmax(0,40%) minmax(0,1fr);grid-template-areas:"photo facts" "wx wx"}
  .jb-photo{height:200px}
  .jb-facts{padding:16px var(--page-gutter) 10px 22px;min-height:200px;box-sizing:border-box}
}
@media (min-width:1200px){
  .jb-grid[data-wx]{grid-template-columns:minmax(0,40%) minmax(0,1fr) minmax(280px,340px);grid-template-areas:"photo facts wx"}
  .jb-grid[data-wx] .jb-facts{padding-right:20px}
  .jb-grid[data-wx] .jb-wxwrap{border-top:0;border-left:1px solid var(--fl-line);display:flex;align-items:stretch;margin-right:0}
  .jb-grid[data-wx] .jb-wx{width:100%}
}
@media (prefers-reduced-motion:reduce){.jb-photo[data-loading]{animation:none}}
`;
