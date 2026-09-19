import { randomBytes } from 'crypto';

export const CELES_MARK_SVG = `<svg class="celes-mark" viewBox="0 0 256 256" width="24" height="24" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="celes-hdr-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4F46E5"/>
      <stop offset="0.55" stop-color="#6D28D9"/>
      <stop offset="1" stop-color="#0E7490"/>
    </linearGradient>
    <linearGradient id="celes-hdr-gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.26"/>
      <stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="240" height="240" rx="58" fill="url(#celes-hdr-bg)"/>
  <rect x="8" y="8" width="240" height="240" rx="58" fill="url(#celes-hdr-gloss)"/>
  <polyline points="176,74 116,64 74,110 82,168 132,196 180,182" fill="none" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>
  <g fill="#FFFFFF">
    <circle cx="116" cy="64" r="13"/>
    <circle cx="74" cy="110" r="17"/>
    <circle cx="82" cy="168" r="13"/>
    <circle cx="132" cy="196" r="11"/>
    <circle cx="180" cy="182" r="9"/>
    <path d="M176 44 L182 66 L204 72 L182 78 L176 100 L170 78 L148 72 L170 66 Z"/>
  </g>
</svg>`;

function glyph(body: string, extraClass = ''): string {
  const cls = extraClass ? `celes-icon ${extraClass}` : 'celes-icon';
  return `<svg class="${cls}" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Inline SVG glyphs used across the webviews (no emoji, so they inherit theme colors). */
export const CELES_ICONS = {
  refresh: glyph('<path d="M13.5 8a5.5 5.5 0 1 1-1.7-3.96"/><path d="M13.6 2.4V5.3H10.7"/>'),
  tree: glyph('<path d="M3 3.5h3"/><path d="M4.5 3.5v8.5h3"/><path d="M4.5 7.75h3"/><path d="M8.5 2.25h4.5"/><path d="M8.5 7.75h4.5"/><path d="M8.5 12h4.5"/>'),
  list: glyph('<path d="M3 4h10"/><path d="M3 8h10"/><path d="M3 12h10"/>'),
  trash: glyph('<path d="M2.75 4.25h10.5"/><path d="M6.5 4.25V2.75h3v1.5"/><path d="M4.25 4.25l.6 8.1a.9.9 0 0 0 .9.9h4.5a.9.9 0 0 0 .9-.9l.6-8.1"/>'),
  pencil: glyph('<path d="M11.1 2.6a1.4 1.4 0 0 1 2 2l-7 7-2.7.7.7-2.7z"/>'),
  branch: glyph('<circle cx="4.5" cy="3.5" r="1.6"/><circle cx="4.5" cy="12.5" r="1.6"/><circle cx="11.5" cy="4.75" r="1.6"/><path d="M4.5 5.1v5.8"/><path d="M11.5 6.35v.9a3.4 3.4 0 0 1-3.4 3.4H4.5"/>'),
  cloud: glyph('<path d="M4.6 12.25a2.85 2.85 0 0 1-.3-5.68 3.6 3.6 0 0 1 6.86-.83 2.75 2.75 0 0 1 .34 5.4z"/>'),
  archive: glyph('<path d="M2.25 4.25h11.5v2.2H2.25z"/><path d="M3.25 6.45v6.3h9.5v-6.3"/><path d="M6.5 9h3"/>'),
  arrowUp: glyph('<path d="M8 13V3.5"/><path d="M4.25 7.25 8 3.5l3.75 3.75"/>'),
  arrowDown: glyph('<path d="M8 3v9.5"/><path d="M4.25 8.75 8 12.5l3.75-3.75"/>'),
  check: glyph('<path d="M3 8.5 6.5 12 13 4.5"/>'),
  plus: glyph('<path d="M8 3.25v9.5"/><path d="M3.25 8h9.5"/>'),
  minus: glyph('<path d="M3.25 8h9.5"/>')
} as const;

export const CELES_ICON_CSS = `
    .celes-icon { vertical-align: -2px; flex-shrink: 0; }
    button .celes-icon { pointer-events: none; }
`;

export function celesStripHtml(options: { badgeId?: string; badgeText?: string }): string {
  const badgeId = options.badgeId ?? 'celesBadge';
  const badgeText = options.badgeText ?? '';
  return `<div class="celes-strip">
    ${CELES_MARK_SVG}
    <span class="celes-wordmark">Celes \u2013 Git Manager</span>
    <span class="celes-badge" id="${badgeId}" title="Current branch">${CELES_ICONS.branch}<span></span></span>
  </div>`.replace('<span></span>', `<span>${badgeText}</span>`);
}

/**
 * The strip bleeds to the edges of whichever panel hosts it, so the host sets
 * --celes-pad to its own body padding.
 */
export const CELES_STRIP_CSS = `
    .celes-strip {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      box-sizing: border-box;
      padding: 11px 12px;
      margin: calc(var(--celes-pad, 10px) * -1) calc(var(--celes-pad, 10px) * -1) 10px;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(135deg, rgba(79, 70, 229, 0.16), rgba(14, 116, 144, 0.12));
    }
    .celes-strip .celes-mark { flex-shrink: 0; width: 30px; height: 30px; border-radius: 8px; }
    .celes-strip .celes-wordmark {
      flex: 1;
      min-width: 0;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: linear-gradient(90deg, #A78BFA, #22D3EE);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .celes-strip .celes-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
      max-width: 55%;
      padding: 3px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--vscode-input-background, var(--input-bg));
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
${CELES_ICON_CSS}`;

/** Nonce for the webview Content-Security-Policy, so only our inline script runs. */
export function createNonce(): string {
  return randomBytes(16).toString('base64');
}

export function cspMeta(cspSource: string, nonce: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src 'nonce-${nonce}';">`;
}
