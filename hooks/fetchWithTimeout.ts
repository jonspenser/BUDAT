// Buoy/wind endpoints occasionally take a while to respond — give them at
// least this long before aborting, so a slow-but-live server isn't mistaken
// for an offline one.
export const MIN_FETCH_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = MIN_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
