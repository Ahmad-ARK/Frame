import { interpolate, spring } from "remotion";

export type Easing = [number, number, number, number];

/**
 * Returns 0→1 progress clamped to a time window (in frames).
 */
export function frameWindow(
  frame: number,
  startFrame: number,
  endFrame: number
): number {
  return interpolate(frame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/**
 * Spring entrance starting at a given frame.
 */
export function springFrom(
  frame: number,
  fps: number,
  startFrame: number,
  config = { damping: 20, stiffness: 90 }
): number {
  return spring({ frame: frame - startFrame, fps, config });
}

/**
 * Converts milliseconds to frames.
 */
export function msToFrames(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

/**
 * Cubic-bezier easing interpolation approximation using interpolate's built-in easing.
 * For use with named easings from the style guide.
 */
export function easedInterpolate(
  frame: number,
  [startFrame, endFrame]: [number, number],
  [from, to]: [number, number],
  easing: Easing
): number {
  return interpolate(frame, [startFrame, endFrame], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => cubicBezier(easing, t),
  });
}

function cubicBezier(
  [x1, y1, x2, y2]: Easing,
  t: number
): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const sample = (a: number, b: number, u: number) =>
    3 * u * (1 - u) * (1 - u) * a + 3 * u * u * (1 - u) * b + u * u * u;
  // Solve Bx(u) = t for u via a FIXED 30 bisection steps (u resolved to ~1e-9),
  // then return By(u). Never falls back to raw t — an early-exit/fallback solver
  // alternates between the eased value and linear t on steep curves frame-to-frame,
  // which shows up as visible motion jitter.
  let lo = 0;
  let hi = 1;
  let u = t;
  for (let i = 0; i < 30; i++) {
    u = (lo + hi) / 2;
    if (sample(x1, x2, u) < t) lo = u;
    else hi = u;
  }
  return sample(y1, y2, u);
}
