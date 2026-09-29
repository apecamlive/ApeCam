/** Display formatting shared by every page (Sprint 1, S1-1). */

const UNITS: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

function trim(n: number, digits: number) {
  return n.toFixed(digits).replace(/\.?0+$/, '');
}

/** 999 → "999", 1200 → "1.2K", 1_250_000 → "1.25M". */
export function formatCompact(value: number | string | null | undefined, digits = 2): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  for (const [size, unit] of UNITS) {
    if (abs >= size) return `${n < 0 ? '-' : ''}${trim(abs / size, digits)}${unit}`;
  }
  return trim(n, abs < 1 ? 6 : digits);
}

export function formatUsd(value: number | string | null | undefined, digits = 2): string {
  const s = formatCompact(value, digits);
  if (s === '—') return s;
  return s.startsWith('-') ? `-$${s.slice(1)}` : `$${s}`;
}

/** Token price: small prices keep significant digits ($0.00001234), large ones are compact. */
export function formatPrice(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n >= 1) return formatUsd(n, 2);
  return `$${Number(n.toPrecision(4))
    .toString()
    .replace(/e-(\d+)/, (_, e) => `e-${e}`)}`;
}

export function formatPercent(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

/** Seconds → "1:02:33" (hours shown only when needed). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** 0x1234…abcd / 9uNm…nK4p */
export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  const head = address.startsWith('0x') ? chars + 2 : chars;
  return `${address.slice(0, head)}…${address.slice(-chars)}`;
}

/** Placeholder logo (Dev Brief fallback): ticker initials + a colour that is stable per contract. */
export function placeholderLogo(ticker: string | null | undefined, contract: string) {
  const initials =
    (ticker ?? '?')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 2)
      .toUpperCase() || '?';
  let hash = 0;
  for (const ch of contract.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { initials, hue: hash % 360 };
}
