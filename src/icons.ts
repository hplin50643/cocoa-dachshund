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
  gift: '<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M12 9v12M2 9h20V6H2v3Zm10-3C8 6 6 5 6 3.8 6 2 8.3 2 9.5 3.2L12 6Zm0 0c4 0 6-1 6-2.2C18 2 15.7 2 14.5 3.2L12 6Z"/>',
  star: '<path d="m12 2.8 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4L2.8 9.5l6.4-.9L12 2.8Z"/>',
  ribbon: '<circle cx="12" cy="9" r="6"/><path d="m8 14-2 7 6-3 6 3-2-7M12 6.5v5m-2.5-2.5h5"/>',
  shirt: '<path d="m8 3-5 2-2 5 4 1v10h14V11l4-1-2-5-5-2a4 4 0 0 1-8 0Z"/>',
  home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z"/><path d="M9 21v-7h6v7"/>',
  book: '<path d="M12 6c-2-2-5-2.5-9-2v14c4-.5 7 0 9 2 2-2 5-2.5 9-2V4c-4-.5-7 0-9 2Zm0 0v14"/>',
  fire: '<path d="M12 21c4.5 0 7-2.8 7-6.4 0-3.1-1.7-5.2-3.8-6.9.2 2.4-1.1 3.3-1.8 3.5C14 7 11.5 4 9.8 3c.2 3.5-1.3 5.2-3.1 7-1.1 1.2-1.7 2.7-1.7 4.6C5 18.2 7.5 21 12 21Z"/><path d="M9.2 17.7c0-1.4.9-2.4 2.3-3.6.4 1.3 1.6 1.8 2.2 2.8.5.8.4 2.2-.3 3"/>',
  medal: '<circle cx="12" cy="9" r="5"/><path d="m8.8 13-1.4 8 4.6-2.5 4.6 2.5-1.4-8M12 6.8v4.4m-2.2-2.2h4.4"/>',
  brush: '<path d="M14.5 14.5 21 4a1.4 1.4 0 0 0-2-2l-10.5 6.5 6 6ZM9.5 9.5l5 5"/><path d="M9 13a4 4 0 0 0-4 4c0 1.5-.5 2.5-2 3 4 1 7 .5 8.5-1a4 4 0 0 0-2.5-6Z"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9H4Zm12 .5a4 4 0 0 1 0 5m2-8a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9H4Zm13 1 4 4m0-4-4 4"/>',
  bone: '<path d="M18.5 7.5a2.5 2.5 0 1 0-3.9-2.1l-9.2 9.2a2.5 2.5 0 1 0 2.1 3.9 2.5 2.5 0 0 0 3.9-2.1l4.8-4.8a2.5 2.5 0 0 0 2.3-4.1Z"/>',
  tag: '<path d="M3 4v6l9 9a3 3 0 0 0 4.2 0l3-3a3 3 0 0 0 0-4.2L10 3H4a1 1 0 0 0-1 1Z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2H18A3 3 0 0 0 21 11c0-4.4-4-8-9-8Z"/><circle cx="7.5" cy="10" r=".8"/><circle cx="10.5" cy="6.8" r=".8"/><circle cx="15" cy="7" r=".8"/><circle cx="18" cy="10" r=".8"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  party: '<path d="m4 20 3-10 7 7-10 3Zm4-7 3 3m1-12 1 3m5-3-2 3m5 5-4 1m0-4 2-1m-5 1 1-2"/>',
};

export function icon(name: string, className = ''): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="${name === 'paw' ? 'currentColor' : 'none'}" stroke="${name === 'paw' ? 'none' : 'currentColor'}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.paw}</svg>`;
}

export function dogPortrait(): string {
  return `<svg viewBox="0 0 120 120" role="img" aria-label="棕色臘腸狗頭像"><circle cx="60" cy="60" r="60" fill="#efe3d0"/><ellipse cx="60" cy="98" rx="34" ry="25" fill="#b57745"/><path d="M38 96q22 12 44 0" fill="none" stroke="#829785" stroke-width="7"/><ellipse cx="60" cy="61" rx="30" ry="35" fill="#bb7e49"/><ellipse cx="30" cy="65" rx="14" ry="31" fill="#875331" transform="rotate(-12 30 65)"/><ellipse cx="90" cy="65" rx="14" ry="31" fill="#875331" transform="rotate(12 90 65)"/><ellipse cx="60" cy="80" rx="22" ry="16" fill="#cd9460"/><ellipse cx="46" cy="59" rx="5.2" ry="6" fill="#30291f"/><ellipse cx="74" cy="59" rx="5.2" ry="6" fill="#30291f"/><circle cx="44.5" cy="57" r="1.8" fill="#fff"/><circle cx="72.5" cy="57" r="1.8" fill="#fff"/><path d="M52 75q8-5 16 0 1 9-8 9t-8-9" fill="#3c3027"/><path d="M60 84v4m-8 0q8 6 16 0" fill="none" stroke="#7e4b2f" stroke-width="2" stroke-linecap="round"/><circle cx="60" cy="105" r="6" fill="#d6b666"/></svg>`;
}
