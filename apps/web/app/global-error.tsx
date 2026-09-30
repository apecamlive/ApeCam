'use client';

/** Last-resort boundary when the root layout itself fails. No providers or app CSS are available here. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ background: '#050508', color: '#f4f4f5', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ maxWidth: 480, margin: '15vh auto', padding: 16, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>APECAM is having a moment</h1>
          <p style={{ color: '#a1a1aa', fontSize: 14 }}>
            Something went wrong while loading the app.{error.digest ? ` Reference: ${error.digest}` : ''}
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: '10px 20px',
              borderRadius: 999,
              border: 0,
              background: '#fff',
              color: '#000',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
