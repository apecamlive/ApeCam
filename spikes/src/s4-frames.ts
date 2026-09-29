/**
 * Spike S4 — frame checks for Stream to Earn "video actually live" (ADR 004), local part only.
 * LiveKit Egress → R2 upload needs a LiveKit project and R2 bucket (blocked on accounts).
 * Here we validate the analysis: black frame, static frame, normal frame, on 320×180 JPEGs.
 */
import sharp from 'sharp';

const W = 320;
const H = 180;

/** Grayscale 32×18 thumbnail — enough signal, cheap enough to run for every snapshot. */
async function signature(jpeg: Buffer) {
  const { data } = await sharp(jpeg)
    .resize(32, 18, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

export async function analyzeFrame(jpeg: Buffer, previous?: Buffer) {
  const sig = await signature(jpeg);
  const n = sig.length;
  const mean = sig.reduce((a, v) => a + v, 0) / n;
  const stdev = Math.sqrt(sig.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
  let diff: number | undefined;
  if (previous) {
    const prev = await signature(previous);
    diff = sig.reduce((a, v, i) => a + Math.abs(v - prev[i]!), 0) / n;
  }
  const black = mean < 10 && stdev < 5;
  return {
    mean: +mean.toFixed(1),
    stdev: +stdev.toFixed(1),
    diff: diff === undefined ? undefined : +diff.toFixed(2),
    black,
  };
}

// Synthetic test frames.
function noise(seed: number, brightness = 128, spread = 100) {
  const px = Buffer.alloc(W * H * 3);
  let s = seed;
  for (let i = 0; i < px.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    px[i] = Math.max(0, Math.min(255, brightness + ((s % (2 * spread)) - spread)));
  }
  return sharp(px, { raw: { width: W, height: H, channels: 3 } })
    .jpeg({ quality: 70 })
    .toBuffer();
}
const solid = (v: number) =>
  sharp({ create: { width: W, height: H, channels: 3, background: { r: v, g: v, b: v } } })
    .jpeg()
    .toBuffer();

async function main() {
  const black = await solid(0);
  const nearBlack = await noise(1, 4, 3); // camera covered: tiny sensor noise
  const gray = await solid(120); // static slide / frozen screen
  const live1 = await noise(7);
  const live2 = await noise(99); // next snapshot of a live camera: different content

  const cases: [string, Buffer, Buffer | undefined, string][] = [
    ['black', black, undefined, 'black=true'],
    ['camera covered (near black)', nearBlack, undefined, 'black=true'],
    ['solid gray (not black)', gray, undefined, 'black=false'],
    ['live frame', live1, undefined, 'black=false'],
    ['same frame twice (frozen)', live1, live1, 'diff≈0 → static'],
    ['two different live frames', live2, live1, 'diff high → moving'],
  ];
  for (const [name, img, prev, expected] of cases) {
    const t = performance.now();
    const r = await analyzeFrame(img, prev);
    console.log(
      `${name.padEnd(30)} ${JSON.stringify(r).padEnd(62)} expected: ${expected}  (${Math.round(performance.now() - t)}ms, ${img.length} bytes)`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
