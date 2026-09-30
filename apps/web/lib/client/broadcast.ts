export type BroadcastSource = 'camera' | 'screen' | 'screen_camera';

export interface BroadcastSupport {
  camera: boolean;
  screen: boolean;
  /** Tab/system audio with screen share: Chromium desktop only (ADR 003). */
  systemAudio: boolean;
  mobile: boolean;
  sources: BroadcastSource[];
}

/**
 * What this browser can broadcast. Pure so it can be unit tested (T-S2-U3):
 * iOS/Android have no getDisplayMedia, so mobile streams are camera only.
 */
export function detectBroadcastSupport(env: {
  userAgent: string;
  hasGetUserMedia: boolean;
  hasGetDisplayMedia: boolean;
  maxTouchPoints: number;
}): BroadcastSupport {
  const ua = env.userAgent;
  const mobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1);
  const chromium = /Chrome\/|Edg\//.test(ua) && !/OPR\/|Firefox\//.test(ua);
  const camera = env.hasGetUserMedia;
  const screen = env.hasGetDisplayMedia && !mobile;
  const sources: BroadcastSource[] = [];
  if (camera) sources.push('camera');
  if (screen) sources.push('screen');
  if (screen && camera) sources.push('screen_camera');
  return { camera, screen, systemAudio: screen && chromium, mobile, sources };
}

export function browserBroadcastSupport(): BroadcastSupport {
  if (typeof navigator === 'undefined') {
    return { camera: false, screen: false, systemAudio: false, mobile: false, sources: [] };
  }
  return detectBroadcastSupport({
    userAgent: navigator.userAgent,
    hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia,
    hasGetDisplayMedia: !!navigator.mediaDevices?.getDisplayMedia,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });
}

export const SOURCE_LABELS: Record<BroadcastSource, { title: string; hint: string }> = {
  camera: { title: 'Camera', hint: 'Camera + mic' },
  screen: { title: 'Screen', hint: 'Whole screen, a window or a tab' },
  screen_camera: { title: 'Screen + camera', hint: 'Screen with your camera in a bubble' },
};
