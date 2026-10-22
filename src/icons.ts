const paths: Record<string, string> = {
  paw: '<ellipse cx="12" cy="16" rx="5" ry="4"/><ellipse cx="5" cy="10" rx="2" ry="3" transform="rotate(-25 5 10)"/><ellipse cx="10" cy="5" rx="2" ry="3"/><ellipse cx="16" cy="5.5" rx="2" ry="3"/><ellipse cx="20" cy="11" rx="2" ry="3" transform="rotate(25 20 11)"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  bowl: '<path d="M3 12h18l-2 8H5l-2-8Z"/><path d="M2 12h20M7 4v3m5-4v4m5-3v3"/>',
  hand: '<path d="M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v9c0 4-2.5 6-6 6h-1c-2 0-3-1-4-2l-5-6a2 2 0 0 1 3-3l3 3"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M5 5c7 1 13 7 14 14M3 13c5 0 10-5 10-10m-2 18c0-5 5-10 10-10"/>',
  drop: '<path d="M12 3c-2 4-7 8-7 12a7 7 0 0 0 14 0c0-4-5-8-7-12Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
  moon: '<path d="M20 14.1A8.5 8.5 0 0 1 9.9 4 8.5 8.5 0 1 0 20 14.1Z"/><path d="M17 3v4m-2-2h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  settings: '<path d="m9 3-.5 3-2 .9L4 6l-2 3 2.5 2v2L2 15l2 3 2.5-.9 2 .9.5 3h6l.5-3 2-.9L20 18l2-3-2.5-2v-2L22 9l-2-3-2.5.9-2-.9L15 3H9Z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="m16 3 5 5M3 21l5-1L21 7a2 2 0 0 0-5-4L3 16v5Z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  leaf: '<path d="M20 3C5 2 1 10 6 16s15 1 14-13Z"/><path d="M3 21 15 9"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  reset: '<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/>',
  expand: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6"/>',
  trophy: '<path d="M7 3h10v7a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v5m-4 1h8"/>',
  sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7 0v4m-2-2h4"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
  upload: '<path d="M12 15V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M7 3v4m10-4v4M7 14h3m4 0h3m-10 3h3"/>',
};

export function icon(name: string, className = ''): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="${name === 'paw' ? 'currentColor' : 'none'}" stroke="${name === 'paw' ? 'none' : 'currentColor'}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.paw}</svg>`;
}

export function dogPortrait(): string {
  return `<svg viewBox="0 0 120 120" role="img" aria-label="棕色臘腸狗頭像"><circle cx="60" cy="60" r="60" fill="#efe3d0"/><ellipse cx="60" cy="98" rx="34" ry="25" fill="#b57745"/><path d="M38 96q22 12 44 0" fill="none" stroke="#829785" stroke-width="7"/><ellipse cx="60" cy="61" rx="30" ry="35" fill="#bb7e49"/><ellipse cx="30" cy="65" rx="14" ry="31" fill="#875331" transform="rotate(-12 30 65)"/><ellipse cx="90" cy="65" rx="14" ry="31" fill="#875331" transform="rotate(12 90 65)"/><ellipse cx="60" cy="80" rx="22" ry="16" fill="#cd9460"/><ellipse cx="46" cy="59" rx="5.2" ry="6" fill="#30291f"/><ellipse cx="74" cy="59" rx="5.2" ry="6" fill="#30291f"/><circle cx="44.5" cy="57" r="1.8" fill="#fff"/><circle cx="72.5" cy="57" r="1.8" fill="#fff"/><path d="M52 75q8-5 16 0 1 9-8 9t-8-9" fill="#3c3027"/><path d="M60 84v4m-8 0q8 6 16 0" fill="none" stroke="#7e4b2f" stroke-width="2" stroke-linecap="round"/><circle cx="60" cy="105" r="6" fill="#d6b666"/></svg>`;
}
