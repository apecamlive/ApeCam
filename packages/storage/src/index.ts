import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

export interface R2Config {
  endpoint: string; // https://<account>.r2.cloudflarestorage.com
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Public base URL of the bucket (custom domain or r2.dev), used for <img src>. */
  publicBaseUrl: string;
}

export function r2ConfigFromEnv(env: Record<string, string | undefined>): R2Config | null {
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL } = env;
  if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_BASE_URL)
    return null;
  return {
    endpoint: R2_ENDPOINT,
    bucket: R2_BUCKET,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    publicBaseUrl: R2_PUBLIC_BASE_URL.replace(/\/$/, ''),
  };
}

/** Cloudflare R2 (S3-compatible) reader for stream snapshots written by LiveKit Egress. */
export class R2SnapshotStore {
  private readonly s3: S3Client;

  constructor(private readonly cfg: R2Config) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  publicUrl(key: string) {
    return `${this.cfg.publicBaseUrl}/${key}`;
  }

  /** Newest object under `prefix`. Egress names files with a timestamp suffix, so the last key is the newest. */
  async latest(prefix: string) {
    let token: string | undefined;
    let last: string | undefined;
    do {
      const page = await this.s3.send(
        new ListObjectsV2Command({ Bucket: this.cfg.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const obj of page.Contents ?? []) if (obj.Key && (!last || obj.Key > last)) last = obj.Key;
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return last ? { key: last, url: this.publicUrl(last) } : null;
  }
}
