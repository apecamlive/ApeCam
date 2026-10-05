import { streams } from '@apecam/db';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { CoreDeps } from './deps';
import { terminateStream } from './streams';

/** 32×18 grayscale thumbnail of a snapshot: enough to spot black/frozen video, cheap to compute. */
async function signature(image: Uint8Array) {
  const { data } = await sharp(image)
    .resize(32, 18, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}

export interface FrameAnalysis {
  mean: number;
  stdev: number;
  /** Mean absolute difference to the previous snapshot (undefined for the first one). */
  diff?: number;
  black: boolean;
  /** Changed less than the static threshold since the previous snapshot. */
  unchanged: boolean;
  signature: string;
}

/** ADR 004 thresholds: black = mean < 10 and stdev < 5; unchanged = diff < 0.5. Recalibrate on real Egress images. */
export async function analyzeFrame(image: Uint8Array, previousSignature?: string): Promise<FrameAnalysis> {
  const sig = await signature(image);
  const mean = sig.reduce((a, v) => a + v, 0) / sig.length;
  const stdev = Math.sqrt(sig.reduce((a, v) => a + (v - mean) ** 2, 0) / sig.length);
  let diff: number | undefined;
  if (previousSignature) {
    const prev = Buffer.from(previousSignature, 'base64');
    if (prev.length === sig.length)
      diff = sig.reduce((a, v, i) => a + Math.abs(v - prev[i]!), 0) / sig.length;
  }
  return {
    mean,
    stdev,
    diff,
    black: mean < 10 && stdev < 5,
    unchanged: diff !== undefined && diff < 0.5,
    signature: Buffer.from(sig).toString('base64'),
  };
}

/** Frozen for this many consecutive snapshots (60s apart) = static video (ADR 004). */
const STATIC_SNAPSHOTS = 3;

/**
 * frame-check (every minute): the newest Egress snapshot becomes the thumbnail and decides whether the
 * video is "actually live" for Stream to Earn (`last_frame_ok_at`). A stream whose snapshots are black or
 * frozen for `go_live.no_video_end_sec` is ended. Streams without snapshot egress are never ended here:
 * a storage outage must not take down every stream.
 */
export async function frameCheck(deps: CoreDeps) {
  if (!deps.snapshots) return { skipped: 'no snapshot storage configured' };
  const config = await deps.config();
  const now = deps.now?.() ?? new Date();
  const live = await deps.db.select().from(streams).where(eq(streams.status, 'live'));
  const summary = { live: live.length, ok: 0, bad: 0, ended: 0 };

  for (const s of live) {
    try {
      const latest = await deps.snapshots.latest(`thumbs/${s.id}/`);
      const seenKey = `frame:last:${s.id}`;
      if (latest && (await deps.kv.get(seenKey)) !== latest.key) {
        await deps.kv.set(seenKey, latest.key, 3600);
        const prevSig = (await deps.kv.get(`frame:sig:${s.id}`)) ?? undefined;
        const a = await analyzeFrame(await deps.snapshots.read(latest.key), prevSig);
        await deps.kv.set(`frame:sig:${s.id}`, a.signature, 3600);
        const staticRun = a.unchanged ? Number((await deps.kv.get(`frame:static:${s.id}`)) ?? 0) + 1 : 0;
        await deps.kv.set(`frame:static:${s.id}`, String(staticRun), 3600);

        const ok = !a.black && staticRun < STATIC_SNAPSHOTS;
        await deps.db
          .update(streams)
          .set(ok ? { thumbnailUrl: latest.url, lastFrameOkAt: now } : { thumbnailUrl: latest.url })
          .where(eq(streams.id, s.id));
        if (ok) summary.ok++;
        else summary.bad++;
        if (ok) continue;
      }

      const since = (s.lastFrameOkAt ?? s.startedAt ?? s.createdAt).getTime();
      if (s.egressId && now.getTime() - since > config['go_live.no_video_end_sec'] * 1000) {
        await terminateStream(deps, s, 'ended', 'no_video');
        summary.ended++;
      }
    } catch (err) {
      deps.log?.warn({ streamId: s.id, err: String(err) }, 'frame-check failed');
    }
  }
  return summary;
}
