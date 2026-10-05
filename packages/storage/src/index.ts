import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

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

/** Cloudflare R2 (S3-compatible): snapshot reader for LiveKit Egress output and public file uploads (avatars). */
export class R2Store {
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

  /** Uploads a public, immutable file (keys are unique per upload) and returns its public URL. */
  async read(key: string): Promise<Uint8Array> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
    return res.Body!.transformToByteArray();
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return this.publicUrl(key);
  }
}
