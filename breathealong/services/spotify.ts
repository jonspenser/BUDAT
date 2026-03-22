export interface SpotifyTrackInfo {
  title: string;
  artist: string;
  bpm?: number;
  energy?: number;
  valence?: number;
  albumArt?: string;
}

/** Extract Spotify track ID from a Spotify URL or URI */
function extractTrackId(input: string): string | null {
  // https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh
  const urlMatch = input.match(/spotify\.com\/track\/([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  // spotify:track:4iV5W9uYEdYUVa79Axb7Rh
  const uriMatch = input.match(/spotify:track:([A-Za-z0-9]+)/);
  if (uriMatch) return uriMatch[1];
  return null;
}

/** Fetch a Spotify client-credentials token */
async function getSpotifyToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Spotify auth failed');
  return data.access_token;
}

/**
 * Fetch track metadata + audio features from Spotify.
 * Requires EXPO_PUBLIC_SPOTIFY_CLIENT_ID and EXPO_PUBLIC_SPOTIFY_CLIENT_SECRET.
 * Falls back gracefully if credentials are missing (returns title/artist only).
 */
export async function fetchSpotifyTrack(spotifyUrl: string): Promise<SpotifyTrackInfo> {
  const trackId = extractTrackId(spotifyUrl);
  if (!trackId) throw new Error('Not a valid Spotify track URL');

  const clientId = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    // No credentials — return minimal info parsed from URL
    return { title: 'Unknown Song', artist: 'Unknown Artist' };
  }

  const token = await getSpotifyToken(clientId, clientSecret);

  const [trackRes, featuresRes] = await Promise.all([
    fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  const track = await trackRes.json();
  const features = await featuresRes.json();

  return {
    title: track.name ?? 'Unknown',
    artist: track.artists?.[0]?.name ?? 'Unknown',
    albumArt: track.album?.images?.[0]?.url,
    bpm: features.tempo ? Math.round(features.tempo) : undefined,
    energy: features.energy,
    valence: features.valence,
  };
}
