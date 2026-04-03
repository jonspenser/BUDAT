import { useState, useEffect } from 'react';
import { Theme, getTheme } from '../constants/colors';

/**
 * Returns the active theme based on Hawaii local time.
 * Re-evaluates every minute so the switch happens automatically
 * at sunrise (~06:00 HST) and sunset (~18:30 HST).
 */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(getTheme);

  useEffect(() => {
    const id = setInterval(() => setTheme(getTheme()), 60_000);
    return () => clearInterval(id);
  }, []);

  return theme;
}
