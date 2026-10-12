/**
 * Home's own styles, on top of components/ui/flat.tsx. Theme variables only.
 *
 * The flat primitives read --sg-text / --sg-text-2 / --sg-text-3 / --sg-border,
 * which the app only defines inside .sgUi or on a white-label theme. Home
 * bridges them: .fh takes the theme's value when there is one and the
 * platform token (globals.css) when not, and .fh-in hands it back to the
 * primitives under their own names. Two steps, because a custom property
 * can't fall back to itself.
 */
export const HOME_CSS = `
.fh{--fhx-text:var(--sg-text,var(--text-primary));--fhx-text-2:var(--sg-text-2,var(--text-secondary));--fhx-text-3:var(--sg-text-3,var(--text-tertiary));--fhx-border:var(--sg-border,var(--border-default));--fhx-border-strong:var(--sg-border-strong,var(--border-strong));--fhx-surface:var(--sg-surface-solid,var(--bg-solid))}
.fh-in{--sg-text:var(--fhx-text);--sg-text-2:var(--fhx-text-2);--sg-text-3:var(--fhx-text-3);--sg-border:var(--fhx-border);--sg-border-strong:var(--fhx-border-strong);--sg-surface-solid:var(--fhx-surface);color:var(--sg-text);font-size:15px}
.fh-in .fl-row,.fh-in .fl-skel{background:transparent}
/* flat.tsx's row action reaches 42px with its border; Home needs the full 44. */
.fh-in .fl-act::after{inset:-6px -2px}
/* globals.css styles every h2 in the app; Home's section headings take flat.tsx's lit look. */
.fh-in h2.fl-sec{margin:0}
.fh-in .fl-sec .fl-sec-act{position:relative}
.fh-in .fl-sec .fl-sec-act::after{content:'';position:absolute;inset:-6px -8px}
.fh-in .fl-sec small{font-size:12.5px;font-weight:600;letter-spacing:0;text-transform:none;color:var(--sg-text-3);text-shadow:none}
.fh-in .fl-brief{margin:6px 0 14px}
.fh-in [data-tone=bad]{color:var(--danger)} .fh-in [data-tone=warn]{color:var(--warning)} .fh-in [data-tone=good]{color:var(--success)}
.fh-in .fl-strip [data-tone] span{color:var(--sg-text-2)}
.fh-in .fl-strip b span{display:inline;font-size:inherit;color:inherit}
.fh-in .fl-strip{grid-auto-flow:row;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;border:0;margin:4px 0 14px}
.fh-in .fl-strip>div{position:relative;padding:12px;border:1px solid var(--border-default);border-radius:12px;background:var(--bg-surface);box-shadow:var(--shadow-sm)}
.fh-in .fl-strip>div:last-child{border-right:1px solid var(--border-default)}
.fh-in .fl-strip b{font-size:22px;font-weight:800;color: var(--text-primary)}
.fh-in .fl-strip span{margin-top:2px;font-size:13px;font-weight:600;letter-spacing:0;text-transform:none}
.fh-ticker{margin:0;min-width:0}
.fh-in .hf{margin:14px 0 8px}
.fh-in .fl-tabs button{flex:1 1 auto;min-width:0;padding:0 6px;overflow:hidden;text-overflow:ellipsis}

/* Header: one controls row (view · job · +), then the greeting — the shared
   page title (.k-title: --title-page, --fs-title). */
.fh-head{margin-bottom:var(--head-gap)}
.fh-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;min-height:44px}
/* The day and date above the greeting — neon, like the section headings (Chad, 2026-10-11). */
.fh-date{font-size:15px;font-weight:800;color: var(--text-secondary);letter-spacing:.005em;white-space:nowrap}
.fh-ctrls{display:flex;align-items:center;gap:6px;margin-left:auto;min-width:0}
.fh .fh-hello{margin:2px 0 0}
.fh-chip{position:relative;display:inline-flex;align-items:center;gap:5px;height:30px;max-width:150px;padding:0 10px;border:1px solid var(--sg-border);border-radius:15px;background:transparent;color:var(--sg-text);font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent}
.fh-chip::after{content:'';position:absolute;inset:-9px -3px}
.fh-chip>span{overflow:hidden;text-overflow:ellipsis;min-width:0}
.fh-chip i{font-style:normal;color:var(--sg-text-3);font-size: 12px;flex:none}
.fh-chip[aria-expanded=true]{border-color:var(--sg-border-strong)}
.fh-chip:focus-visible,.fh-plus:focus-visible,.fh-menu button:focus-visible,.fh-menu a:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.fh-chip select{position:absolute;z-index:1;inset:-9px -3px;width:calc(100% + 6px);height:calc(100% + 18px);opacity:0;cursor:pointer;font-size:16px;appearance:none;-webkit-appearance:none;border:0}
.fh-plus{position:relative;flex:none;width:30px;height:30px;border-radius:15px;display:grid;place-items:center;border:1px solid var(--sg-border);background:transparent;color: var(--text-secondary);cursor:pointer;padding:0}
.fh-plus::after{content:'';position:absolute;inset:-9px}
.fh-pop{position:relative}
.fh-menu{position:absolute;top:calc(100% + 8px);z-index:60;min-width:220px;max-width:calc(100vw - 32px);padding:4px 0;background:var(--sg-surface-solid);border:1px solid var(--sg-border-strong);border-radius:10px;box-shadow:var(--shadow-lg)}
.fh-menu[data-side=right]{right:0}
.fh-menu[data-side=left]{left:0}
.fh-menu h3{font-size:12.5px;font-weight:700;letter-spacing:0;color:var(--sg-text-3);padding:10px 14px 4px;margin:0}
.fh-menu hr{border:0;border-top:1px solid var(--sg-border);margin:4px 0}
.fh-menu button,.fh-menu a,.fh-menu .fh-off{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:44px;padding:0 14px;background:none;border:0;font:inherit;font-size:14.5px;font-weight:550;color:var(--sg-text);text-align:left;text-decoration:none;cursor:pointer}
.fh-menu button:active,.fh-menu a:active{background:var(--sg-border)}
.fh-menu [aria-checked=true]::after{content:'✓';color:var(--brand-primary);font-weight:700}
.fh-menu .fh-off{color:var(--sg-text-3);cursor:default}
.fh-menu p{font-size:12.5px;color:var(--sg-text-3);padding:6px 14px 8px;margin:0;max-width:260px}

/* Body: one column on a phone (sections in phone order), two on a wide screen. */
.fh-cols{display:flex;flex-direction:column}
.fh-main,.fh-side{display:contents}
.fh-sec{min-width:0}
.fh-row2{display:flex;align-items:center}
.fh-row2>.fh-grow{flex:1;min-width:0}
.fh-row2>.fh-act{flex:none;padding-right:16px}
.fh-more{display:flex;align-items:center;min-height:44px;padding:0;background:none;border:0;font:inherit;font-size:13.5px;font-weight:600;color: var(--link);cursor:pointer}
.fh-fail{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:12px 0;font-size:13.5px;color:var(--sg-text-2);border-top:1px solid var(--sg-border);border-bottom:1px solid var(--sg-border)}
.fh-fail button,.fh-empty a,.fh-fail a{position:relative;background:none;border:0;padding:0;font:inherit;font-weight:650;color: var(--link);cursor:pointer;text-decoration:none}
.fh-fail button::after,.fh-empty a::after{content:'';position:absolute;inset:-12px -8px}
.fh-empty{padding:12px 0;font-size:13.5px;color:var(--sg-text-2);border-top:1px solid var(--sg-border);border-bottom:1px solid var(--sg-border)}
.fh-skel-line{display:block;height:12px;border-radius:6px;background:var(--sg-border);animation:fl-pulse 1.2s ease-in-out infinite}
.fh-foot{display:flex;flex-wrap:wrap;align-items:center;gap:4px 14px;padding:18px 0 4px;font-size:12.5px;color:var(--sg-text-3)}
.fh-foot button,.fh-foot a{position:relative;display:inline-flex;align-items:center;min-height:32px;background:none;border:0;padding:0;font:inherit;color: var(--link);font-weight:600;cursor:pointer;text-decoration:none}
.fh-foot button::after,.fh-foot a::after{content:'';position:absolute;inset:-6px -4px}
.fh-notice{margin:0 0 8px;font-size:13px;color:var(--sg-text-2)}
.fh-notice button{background:none;border:0;padding:0;font:inherit;font-weight:650;color: var(--link);cursor:pointer;min-height:32px}
@media (prefers-reduced-motion:reduce){.fh-skel-line{animation:none}}
@media (pointer:coarse){.fh-foot button,.fh-foot a{min-height:44px}}

@media (min-width:1100px){
  .fh-cols{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);gap:0 40px;align-items:start}
  .fh-main,.fh-side{display:block;min-width:0}
  .fh-side{padding-top:6px}
  .fh-side .fh-sec:first-child .fl-strip{margin-top:6px}
  .fh-in .hf{margin:16px 0 10px}
  .fh-in .fl-strip{margin:6px 0 14px}
  .fh-in .fl-brief{margin-top:10px}
}
`;
