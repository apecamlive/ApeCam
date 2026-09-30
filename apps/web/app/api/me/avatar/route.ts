import { AVATAR_MAX_BYTES, setAvatar } from '@apecam/core';
import { ApiError } from '@apecam/shared';
import sharp from 'sharp';
import { requireSession, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/**
 * Avatar upload: images only, ≤ 1 MB, always re-encoded server-side to a 256px WebP. Re-encoding
 * strips metadata (EXIF/GPS) and anything hidden in the original file.
 */
export const POST = route(async (req, _ctx, deps) => {
  const session = await requireSession(req, deps);
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof Blob)) throw new ApiError(400, 'AVATAR_MISSING', 'Attach an image as "file"');
  if (!ALLOWED.has(file.type)) throw new ApiError(400, 'AVATAR_TYPE', 'Use a PNG, JPEG, WebP or GIF image');
  if (file.size > AVATAR_MAX_BYTES)
    throw new ApiError(400, 'AVATAR_TOO_BIG', 'Image must be 1 MB or smaller');

  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 4096 * 4096 })
      .rotate()
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new ApiError(400, 'AVATAR_INVALID', 'That file is not a readable image');
  }
  return setAvatar(deps, session.userId, new Uint8Array(webp));
});
