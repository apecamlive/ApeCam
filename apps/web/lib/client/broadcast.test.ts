import { describe, expect, it } from 'vitest';
import { detectBroadcastSupport } from './broadcast';

const desktop = { hasGetUserMedia: true, hasGetDisplayMedia: true, maxTouchPoints: 0 };
const UA = {
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; rv:141.0) Gecko/20100101 Firefox/141.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
};

describe('T-S2-U3 · broadcast support detection', () => {
  it('Chrome/Edge desktop: all sources + system audio', () => {
    for (const ua of [UA.chrome, UA.edge]) {
      expect(detectBroadcastSupport({ ...desktop, userAgent: ua })).toMatchObject({
        sources: ['camera', 'screen', 'screen_camera'],
        systemAudio: true,
        mobile: false,
      });
    }
  });

  it('Firefox and Safari desktop: screen share without system audio', () => {
    for (const ua of [UA.firefox, UA.safariMac]) {
      expect(detectBroadcastSupport({ ...desktop, userAgent: ua })).toMatchObject({
        screen: true,
        systemAudio: false,
      });
    }
  });

  it('phones: camera only', () => {
    for (const ua of [UA.iphone, UA.android]) {
      expect(detectBroadcastSupport({ ...desktop, userAgent: ua })).toMatchObject({
        sources: ['camera'],
        mobile: true,
      });
    }
  });

  it('iPad reporting a Mac user agent is treated as mobile', () => {
    expect(
      detectBroadcastSupport({ ...desktop, userAgent: UA.safariMac, maxTouchPoints: 5 }).sources,
    ).toEqual(['camera']);
  });

  it('no media devices (insecure context): nothing to broadcast', () => {
    expect(
      detectBroadcastSupport({
        userAgent: UA.chrome,
        hasGetUserMedia: false,
        hasGetDisplayMedia: false,
        maxTouchPoints: 0,
      }).sources,
    ).toEqual([]);
  });
});
