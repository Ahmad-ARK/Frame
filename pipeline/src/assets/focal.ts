import sharp from "sharp";
import smartcrop from "smartcrop-sharp";

// Content-aware focal point. smartcrop scores regions by edges, saturation and
// SKIN (faces), so the returned crop centers on the subject wherever it sits in
// the frame. We return the crop CENTER as a 0..1 focal point; the renderer maps
// it to CSS object-position so `cover` keeps the subject framed instead of
// blindly center-cropping (which slices off-center faces).

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Returns { x, y } in 0..1 (subject center), or undefined if analysis fails. */
export async function computeFocal(filePath: string): Promise<{ x: number; y: number } | undefined> {
  try {
    const meta = await sharp(filePath).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (!W || !H) return undefined;
    const side = Math.max(50, Math.min(W, H));
    const result = await smartcrop.crop(filePath, { width: side, height: side });
    const c = result?.topCrop;
    if (!c) return undefined;
    return { x: clamp((c.x + c.width / 2) / W), y: clamp((c.y + c.height / 2) / H) };
  } catch {
    return undefined;
  }
}
