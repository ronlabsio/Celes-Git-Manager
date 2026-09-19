export const GITDECK_MARK_SVG = `<svg class="gd-mark" viewBox="0 0 256 256" width="26" height="26" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="gd-hdr-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7C3AED"/>
      <stop offset="0.5" stop-color="#4F46E5"/>
      <stop offset="1" stop-color="#06B6D4"/>
    </linearGradient>
    <linearGradient id="gd-hdr-gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.32"/>
      <stop offset="0.65" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gd-hdr-card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#E0E7FF"/>
    </linearGradient>
  </defs>
  <rect x="12" y="12" width="232" height="232" rx="56" fill="url(#gd-hdr-bg)"/>
  <rect x="12" y="12" width="232" height="232" rx="56" fill="url(#gd-hdr-gloss)"/>
  <rect x="86" y="74" width="112" height="24" rx="12" fill="url(#gd-hdr-card)" opacity="0.55"/>
  <rect x="72" y="106" width="126" height="24" rx="12" fill="url(#gd-hdr-card)" opacity="0.8"/>
  <rect x="58" y="138" width="140" height="44" rx="16" fill="url(#gd-hdr-card)"/>
  <g fill="none" stroke="#4F46E5" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
    <path d="M88 160 L88 92"/>
    <path d="M88 108 C88 92 100 84 116 84 L132 84"/>
  </g>
  <circle cx="88" cy="160" r="14" fill="#4F46E5"/>
  <circle cx="88" cy="92" r="8" fill="#4F46E5"/>
  <circle cx="140" cy="84" r="14" fill="#7C3AED"/>
  <path d="M140 98 L140 116 C140 132 152 140 166 140 L178 140" fill="none" stroke="#7C3AED" stroke-width="11" stroke-linecap="round"/>
  <circle cx="178" cy="140" r="14" fill="#06B6D4"/>
</svg>`;

export function gitdeckHeaderHtml(options: { subtitle?: string; badgeId?: string; badgeText?: string }): string {
  const subtitle = options.subtitle ? `<span class="gd-subtitle">${options.subtitle}</span>` : '';
  const badgeId = options.badgeId ?? 'gdBadge';
  const badgeText = options.badgeText ?? '';
  return `<header class="gd-header">
    ${GITDECK_MARK_SVG}
    <div class="gd-titles">
      <div class="gd-title-row">
        <span class="gd-title">GitDeck</span>
        ${subtitle}
      </div>
      <span class="gd-tagline">Visual Git, without the ceremony</span>
    </div>
    <span class="gd-badge" id="${badgeId}" title="Current branch">${badgeText}</span>
  </header>`;
}

export const GITDECK_HEADER_CSS = `
    .gd-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      margin: -10px -10px 10px -10px;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(135deg, rgba(124, 58, 237, 0.16), rgba(6, 182, 212, 0.12));
    }
    .gd-header .gd-mark { flex-shrink: 0; border-radius: 7px; }
    .gd-header .gd-titles { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .gd-header .gd-title-row { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
    .gd-header .gd-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.2px;
      background: linear-gradient(90deg, #A78BFA, #22D3EE);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .gd-header .gd-subtitle {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      opacity: 0.75;
      white-space: nowrap;
    }
    .gd-header .gd-tagline {
      font-size: 10px;
      opacity: 0.6;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gd-header .gd-badge {
      flex-shrink: 0;
      max-width: 45%;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--input-bg);
      font-size: 10px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
`;
