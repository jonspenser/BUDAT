/**
 * Client-side BPM estimation from an audio file URI using Web Audio API.
 * Works on Expo Web; on native it returns undefined (RN lacks WebAudio).
 */
export async function estimateBPM(fileUri: string): Promise<number | undefined> {
  if (typeof AudioContext === 'undefined' && typeof (window as any).webkitAudioContext === 'undefined') {
    return undefined; // Native — skip analysis
  }

  const AudioCtx: typeof AudioContext =
    (window as any).AudioContext ?? (window as any).webkitAudioContext;
  const ctx = new AudioCtx();

  const res = await fetch(fileUri);
  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // Peak-based naive BPM estimator
  const threshold = 0.3;
  const minInterval = sampleRate * 0.3; // min 0.3s between beats (~200 BPM max)
  const peaks: number[] = [];
  let lastPeak = -minInterval;

  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > threshold && i - lastPeak > minInterval) {
      peaks.push(i);
      lastPeak = i;
    }
  }

  if (peaks.length < 2) return undefined;

  const intervals = peaks.slice(1).map((p, i) => p - peaks[i]);
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const bpm = Math.round((sampleRate / avgInterval) * 60);

  ctx.close();
  return bpm > 40 && bpm < 220 ? bpm : undefined;
}

/** Extract a readable filename as song title */
export function fileNameToTitle(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')           // remove extension
    .replace(/[-_]/g, ' ')             // dashes/underscores → spaces
    .replace(/\s+/g, ' ')
    .trim();
}
