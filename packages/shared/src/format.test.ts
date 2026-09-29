import { describe, expect, it } from 'vitest';
import {
  formatCompact,
  formatDuration,
  formatPercent,
  formatPrice,
  formatUsd,
  placeholderLogo,
  shortAddress,
} from './format';

describe('T-S1-U1 · format', () => {
  it('compact numbers', () => {
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(1200)).toBe('1.2K');
    expect(formatCompact(12_400)).toBe('12.4K');
    expect(formatUsd(1.25e6)).toBe('$1.25M');
    expect(formatUsd(-2500)).toBe('-$2.5K');
    expect(formatCompact(null)).toBe('—');
    expect(formatCompact('3400000000')).toBe('3.4B');
  });

  it('durations', () => {
    expect(formatDuration(3753)).toBe('1:02:33');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(0)).toBe('0:00');
  });

  it('prices keep significant digits for tiny values', () => {
    expect(formatPrice('0.00001234567')).toBe('$0.00001235');
    expect(formatPrice(1.5)).toBe('$1.5');
    expect(formatPrice('0.5')).toBe('$0.5');
  });

  it('percent and addresses', () => {
    expect(formatPercent(3.456)).toBe('+3.46%');
    expect(formatPercent(-1)).toBe('-1.00%');
    expect(shortAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678');
    expect(shortAddress('9uNmRWtgQ8oZ4yA7zRk8b7T5mR9dQh1wM3uF2cV6nK4p')).toBe('9uNm…nK4p');
  });
});

describe('T-S1-U3 · placeholder logo', () => {
  it('uses ticker initials and a colour that is stable per contract', () => {
    const a = placeholderLogo('PEPE', '0xAbC');
    expect(a.initials).toBe('PE');
    expect(placeholderLogo('OTHER', '0xabc').hue).toBe(a.hue);
    expect(placeholderLogo(null, 'x').initials).toBe('?');
    expect(placeholderLogo('$W', 'x').initials).toBe('W');
  });
});
