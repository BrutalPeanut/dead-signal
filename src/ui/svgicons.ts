/** Hand-drawn 24×24 stroke icons for the lobby chrome (emoji render inconsistently across devices). */
const P: Record<string, string> = {
  battle:
    '<path d="M5 19l9-9M14 4l6 0 0 6-6 6-4-4z" fill="currentColor" fill-opacity=".25"/><path d="M4 20l3-3M7 14l3 3"/>',
  armory: '<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" fill="currentColor" fill-opacity=".2"/><path d="M12 8v8M9 11h6"/>',
  talents: '<path d="M13 2L5 13h6l-1 9 8-11h-6z" fill="currentColor" fill-opacity=".25"/>',
  supply:
    '<path d="M3 8l9-4 9 4v9l-9 4-9-4z" fill="currentColor" fill-opacity=".2"/><path d="M3 8l9 4 9-4M12 12v9M7.5 6l9 4"/>',
  missions:
    '<rect x="5" y="4" width="14" height="17" rx="2" fill="currentColor" fill-opacity=".2"/><path d="M9 4V3h6v1M8.5 11l2 2 4-4M8.5 17h7"/>',
  relay:
    '<path d="M12 12v9M9 21h6"/><circle cx="12" cy="10" r="2" fill="currentColor"/><path d="M8 6.5a5 5 0 000 7M16 6.5a5 5 0 010 7M5 4a9 9 0 000 12M19 4a9 9 0 010 12"/>',
  daily:
    '<rect x="4" y="9" width="16" height="11" rx="2" fill="currentColor" fill-opacity=".2"/><path d="M3 9h18v-3H3zM12 6v14M12 6c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1"/>',
  crate:
    '<rect x="3" y="9" width="18" height="11" rx="2" fill="currentColor" fill-opacity=".2"/><path d="M2 6h20v3H2zM12 9v11M3 14h18"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  pass:
    '<path d="M4 7a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4z" fill="currentColor" fill-opacity=".2"/><path d="M12 7.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" fill-opacity=".25"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="currentColor" fill-opacity=".15"/><path d="M9 4v14M15 6v14"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  skull:
    '<path d="M12 3c-4.4 0-8 3.1-8 7.5 0 2.4 1.1 4.2 3 5.3V19h10v-3.2c1.9-1.1 3-2.9 3-5.3C20 6.1 16.4 3 12 3z" fill="currentColor" fill-opacity=".2"/><circle cx="9" cy="11" r="1.6" fill="currentColor"/><circle cx="15" cy="11" r="1.6" fill="currentColor"/><path d="M10 19v-2M14 19v-2"/>',
};

export function icon(name: keyof typeof P | string, size = 24): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;
}
