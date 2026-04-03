export interface Theme {
  background: string;    // screen/container background
  accent: string;        // primary: titles, chart lines, dots, arrows
  accentDim: string;     // inactive dots, cell dividers, dim row separators
  muted: string;         // secondary text: timestamps, axis labels
  islandFill: string;    // island polygon fill/stroke on map
  gridLine: string;      // chart grid lines
  textPrimary: string;   // readable value text (high contrast on background)
}

/** Red-on-black — dark cockpit, low-light conditions */
export const NIGHT_THEME: Theme = {
  background:  '#0a0000',
  accent:      '#ff3030',
  accentDim:   '#5a1010',
  muted:       '#883030',
  islandFill:  '#1f0808',
  gridLine:    '#1a0808',
  textPrimary: '#ffe8e8',
};

/** Blue-on-white — daylight readability */
export const DAY_THEME: Theme = {
  background:  '#f0f5fb',
  accent:      '#0066cc',
  accentDim:   '#99bbdd',
  muted:       '#3377aa',
  islandFill:  '#b0c8e0',
  gridLine:    '#d8e8f4',
  textPrimary: '#001133',
};

/**
 * Hawaii is UTC-10 (no DST).
 * Sunrise ≈ 06:00, sunset ≈ 18:30.
 */
export function getTheme(): Theme {
  const hiHour = ((Date.now() / 3_600_000) - 10 + 240) % 24;
  return hiHour >= 6.0 && hiHour < 18.5 ? DAY_THEME : NIGHT_THEME;
}
