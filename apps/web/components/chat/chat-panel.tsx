'use client';

import { useDataChannel } from '@livekit/components-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/auth-context';
import { Button, cx } from '@/components/ui';
import { api, ApiRequestError, type ChatMessage } from '@/lib/client/api';

/** Receives live messages over the LiveKit data channel; must be inside <LiveKitRoom>. */
export function LiveChatFeed({
  onMessage,
  onDelete,
}: {
  onMessage: (m: ChatMessage) => void;
  onDelete: (id: number) => void;
}) {
  useDataChannel('chat', (msg) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload)) as {
        type: string;
        message?: ChatMessage;
        id?: number;
      };
      if (data.type === 'chat' && data.message) onMessage(data.message);
      if (data.type === 'chat_delete' && data.id) onDelete(data.id);
    } catch {
      // ignore malformed payloads
    }
  });
  return null;
}

export function ChatPanel({
  streamId,
  live,
  deleted,
  className,
}: {
  streamId: string;
  live: ChatMessage[];
  /** Message ids removed by moderators (live chat_delete events + local deletes). */
  deleted: Set<number>;
  className?: string;
}) {
  const { signedIn, me } = useAuth();
  const isStaff = me?.user?.role === 'moderator' || me?.user?.role === 'admin';
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const qc = useQueryClient();
  const history = useQuery({
    queryKey: ['chat', streamId],
    queryFn: () => api<{ messages: ChatMessage[] }>(`/api/streams/${streamId}/chat`),
  });
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  const seen = new Set<number>();
  const messages = [...(history.data?.messages ?? []), ...live].filter((m) =>
    seen.has(m.id) || deleted.has(m.id) || removed.has(m.id) ? false : seen.add(m.id),
  );

  async function remove(id: number) {
    await api(`/api/admin/chat/${id}`, { method: 'DELETE' }).catch(() => undefined);
    setRemoved((prev) => new Set(prev).add(id));
  }

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await api<{ message: ChatMessage }>(`/api/streams/${streamId}/chat`, {
        body: { body: text },
      });
      // Show it immediately; the LiveKit echo of the same id is de-duplicated above.
      qc.setQueryData<{ messages: ChatMessage[] }>(['chat', streamId], (prev) => ({
        messages: [...(prev?.messages ?? []), res.message],
      }));
      setText('');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not send');
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className={cx('glass flex min-h-[320px] flex-col rounded-card', className)} aria-label="Chat">
      <div className="border-b border-line px-4 py-3 font-semibold">Chat</div>
      <div ref={list} className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
        {messages.length === 0 && <p className="text-muted">No messages yet. Say gm.</p>}
        {messages.map((m) => (
          <p key={m.id} className="group break-words">
            <span className="mr-1 font-semibold text-primary-light">{m.name}</span>
            <span className="text-fg-soft">{m.body}</span>
            {isStaff && (
              <button
                onClick={() => remove(m.id)}
                className="ml-2 hidden text-xs text-live hover:underline group-hover:inline"
                aria-label={`Delete message from ${m.name}`}
              >
                delete
              </button>
            )}
          </p>
        ))}
      </div>
      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {signedIn ? (
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              placeholder="Send a message"
              aria-label="Chat message"
              className="h-10 min-w-0 flex-1 rounded-full border border-line bg-input px-4 text-sm focus:border-primary focus:outline-none"
            />
            <Button type="submit" variant="primary" size="md" disabled={sending || !text.trim()}>
              Send
            </Button>
          </div>
        ) : (
          <p className="text-center text-sm text-muted">Connect your wallet to chat.</p>
        )}
        {error && <p className="mt-2 text-xs text-live">{error}</p>}
      </form>
    </aside>
  );
}
