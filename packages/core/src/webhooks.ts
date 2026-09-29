import { streams } from '@apecam/db';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { CoreDeps } from './deps';
import { identity, streamIdFromRoom, terminateStream } from './streams';

/** Minimal shape of a LiveKit webhook event (livekit-server-sdk `WebhookEvent`). */
export interface LivekitEvent {
  event: string;
  id?: string;
  room?: { name: string };
  participant?: { identity: string };
}

const isViewer = (id: string) => id.startsWith('u_') || id.startsWith('a_');

/**
 * Keeps stream state in sync with LiveKit. Webhooks can arrive twice or not at all, so every
 * handler is idempotent and viewer counts are recomputed from LiveKit instead of incremented.
 */
export async function handleLivekitEvent(deps: CoreDeps, event: LivekitEvent) {
  const streamId = event.room?.name ? streamIdFromRoom(event.room.name) : null;
  if (!streamId) return { handled: false };
  const [stream] = await deps.db.select().from(streams).where(eq(streams.id, streamId));
  if (!stream) return { handled: false };
  const now = deps.now?.() ?? new Date();
  const who = event.participant?.identity ?? '';

  switch (event.event) {
    case 'track_published': {
      if (!who.startsWith('pub_')) return { handled: false };
      await deps.db
        .update(streams)
        .set({ status: 'live', startedAt: stream.startedAt ?? now })
        .where(and(eq(streams.id, streamId), eq(streams.status, 'starting')));
      if (!stream.egressId && stream.status !== 'ended') {
        const egressId = await deps.streaming
          .startSnapshots(stream.livekitRoom, who, stream.source, `thumbs/${streamId}/`)
          .catch((err) => {
            deps.log?.warn({ err: String(err), streamId }, 'snapshot egress failed to start');
            return null;
          });
        if (egressId) {
          await deps.db
            .update(streams)
            .set({ egressId })
            .where(and(eq(streams.id, streamId), isNull(streams.egressId)));
        }
      }
      return { handled: true };
    }
    case 'participant_joined':
    case 'participant_left': {
      if (!isViewer(who)) return { handled: false };
      await syncViewerCount(deps, stream.id, stream.livekitRoom, stream.userId);
      return { handled: true };
    }
    case 'room_finished': {
      if (stream.status === 'starting' || stream.status === 'live') {
        await terminateStream(deps, stream, 'ended', 'disconnected');
      }
      return { handled: true };
    }
    default:
      return { handled: false };
  }
}

/** Current viewers = everyone in the room except the streamer (and the streamer's own viewer tabs). */
export async function syncViewerCount(
  deps: CoreDeps,
  streamId: string,
  room: string,
  streamerUserId: string,
) {
  const ids = await deps.streaming.listParticipantIdentities(room);
  const viewers = ids.filter((id) => isViewer(id) && identity.userIdOf(id) !== streamerUserId).length;
  await deps.db
    .update(streams)
    .set({ currentViewers: viewers, peakViewers: sql`greatest(${streams.peakViewers}, ${viewers})` })
    .where(and(eq(streams.id, streamId), inArray(streams.status, ['starting', 'live'])));
  return viewers;
}
