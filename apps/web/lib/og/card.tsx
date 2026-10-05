import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * Shared OG card. Deliberately text-only: token logos are third-party URLs, and fetching them while
 * rendering would let anyone make the server request arbitrary hosts.
 */
export function ogCard({
  kicker,
  title,
  subtitle,
  live,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  live?: boolean;
}) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: 'radial-gradient(circle at 20% 0%, #1d4ed8 0%, #050508 55%)',
        color: '#f4f4f5',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, fontWeight: 900 }}>
        <div style={{ display: 'flex' }}>
          APE<span style={{ color: '#60a5fa' }}>CAM</span>
        </div>
        {live && (
          <div
            style={{
              display: 'flex',
              background: '#ef4444',
              borderRadius: 999,
              padding: '6px 18px',
              fontSize: 24,
              color: '#fff',
            }}
          >
            ● LIVE
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 28, color: '#a1a1aa' }}>{kicker}</div>
        <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1 }}>{title.slice(0, 24)}</div>
        <div style={{ fontSize: 34, color: '#d4d4d8' }}>{subtitle.slice(0, 80)}</div>
      </div>
      <div style={{ fontSize: 26, color: '#a1a1aa' }}>Hold it. Stream it.</div>
    </div>,
    OG_SIZE,
  );
}
