import { createChainAdapters } from '@apecam/chain';
import { createDb } from '@apecam/db';
import { PriceService } from '@apecam/pricing';
import { R2SnapshotStore, r2ConfigFromEnv } from '@apecam/storage';
import { ApiError, type KeyValueStore } from '@apecam/shared';
import { createConfigLoader } from './config';
import { consoleLogger, type CoreDeps } from './deps';
import { LiveKitStreaming, type StreamingProvider } from './streaming';

/** Used when LiveKit is not configured (local dev before accounts exist): everything else still works. */
export class StreamingNotConfigured implements StreamingProvider {
  readonly wsUrl = '';
  private fail(): never {
    throw new ApiError(503, 'STREAMING_UNAVAILABLE', 'LiveKit is not configured on this server');
  }
  createRoom = async () => this.fail();
  deleteRoom = async () => {};
  removeParticipant = async () => {};
  sendData = async () => {};
  listParticipantIdentities = async () => [];
  publisherToken = async () => this.fail();
  viewerToken = async () => this.fail();
  receiveWebhook = async () => this.fail();
  roomExists = async () => false;
  startSnapshots = async () => null;
  stopEgress = async () => {};
}

export function streamingFromEnv(env: Record<string, string | undefined>): StreamingProvider {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET)
    return new StreamingNotConfigured();
  const r2 =
    env.R2_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
      ? {
          endpoint: env.R2_ENDPOINT,
          bucket: env.R2_BUCKET,
          accessKey: env.R2_ACCESS_KEY_ID,
          secret: env.R2_SECRET_ACCESS_KEY,
        }
      : undefined;
  return new LiveKitStreaming({
    url: env.LIVEKIT_URL,
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
    snapshots: r2,
  });
}

/** The CoreDeps both Railway services build from their environment. */
export function coreDepsFromEnv(
  env: Record<string, string | undefined>,
  kv: KeyValueStore,
): CoreDeps & { close: () => Promise<void> } {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const { db, pool } = createDb(env.DATABASE_URL);
  const r2 = r2ConfigFromEnv(env);
  return {
    db,
    chains: createChainAdapters(env),
    prices: new PriceService(kv),
    streaming: streamingFromEnv(env),
    kv,
    snapshots: r2 ? new R2SnapshotStore(r2) : undefined,
    config: createConfigLoader(db),
    log: consoleLogger,
    close: () => pool.end(),
  };
}
