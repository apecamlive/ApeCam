'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth/auth-context';
import { Button, cx, Modal } from '@/components/ui';
import { api, ApiRequestError, REPORT_CATEGORIES } from '@/lib/client/api';

/** Report a stream (S2-3). Signed-in only; the server allows one report per user per stream. */
export function ReportButton({ streamId, isOwn }: { streamId: string; isOwn: boolean }) {
  const { signedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>('');
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (isOwn) return null;
  const disabledReason = !signedIn
    ? 'Connect your wallet to report'
    : state === 'done'
      ? 'Reported'
      : undefined;

  async function submit() {
    setState('sending');
    setError(null);
    try {
      await api('/api/reports', { body: { streamId, category, reason: reason.trim() || undefined } });
      setState('done');
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'ALREADY_REPORTED') setState('done');
      else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not send the report');
        setState('idle');
      }
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={!!disabledReason}
        title={disabledReason}
        onClick={() => setOpen(true)}
      >
        {state === 'done' ? 'Reported' : 'Report'}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Report this stream">
        {state === 'done' ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              Thanks. Moderators review reports quickly; streams reported by several people are blurred right
              away.
            </p>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div role="radiogroup" aria-label="What is wrong?" className="grid grid-cols-2 gap-2">
              {REPORT_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  role="radio"
                  aria-checked={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className={cx(
                    'rounded-card border px-3 py-2 text-left text-sm',
                    category === c.id ? 'border-live bg-live/15' : 'border-line hover:border-line-strong',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Anything moderators should know? (optional)"
              aria-label="Details"
              className="rounded-card border border-line bg-input p-3 text-sm focus:border-primary focus:outline-none"
            />
            {error && <p className="text-sm text-live">{error}</p>}
            <Button variant="danger" disabled={!category || state === 'sending'} onClick={submit}>
              {state === 'sending' ? 'Sending…' : 'Send report'}
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
