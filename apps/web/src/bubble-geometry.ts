export const bubbleShapes = ["cloud", "heart"] as const;
export type BubbleShape = (typeof bubbleShapes)[number];
export type BubblePoint = { x: number; y: number; z: number };
const fraction = (value: number) => value - Math.floor(value);

// The original reference uses 0.27–0.87 world-unit radii. Retain that scale
// instead of shrinking every sphere to fit a two-dimensional packing grid.
export function bubbleRadius(index: number) {
  // Independent hashes prevent large radii correlating with the spiral angle
  // and making one lobe of the heart consistently heavier than the other.
  const sample = fraction(Math.sin((index + 1) * 127.1) * 43758.5453);
  const variation = fraction(Math.sin((index + 1) * 311.7) * 73129.232);
  return sample < 0.3
    ? 0.27 + variation * 0.12
    : sample < 0.8
      ? 0.42 + variation * 0.18
      : 0.66 + variation * 0.21;
}

export function bubbleTargets(
  shape: BubbleShape,
  count: number,
): BubblePoint[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    if (shape === "heart") {
      const fill = Math.sqrt((i + 0.5) / count);
      const x = Math.pow(Math.sin(angle), 3) * 3.0 * fill;
      const y =
        ((13 * Math.cos(angle) -
          5 * Math.cos(2 * angle) -
          2 * Math.cos(3 * angle) -
          Math.cos(4 * angle)) /
          18) *
          2.6 *
          fill +
        0.25;
      // Keep the cleft clear even when the largest spheres sit near the top.
      const top = 0.55 + 1.45 * Math.min(Math.abs(x) / 1.5, 1);
      return {
        x,
        y: Math.min(y, top - bubbleRadius(i) * 0.65),
        z: Math.sin(i * 1.71) * 0.75,
      };
    }
    // A filled ellipsoid with several layers along Z; these are only starting
    // positions. The live cluster is formed by gravity and 3D sphere collisions.
    const latitude = 1 - (2 * (i + 0.5)) / count;
    const ring = Math.sqrt(1 - latitude * latitude);
    const volume = Math.cbrt(0.25 + 0.75 * fraction((i + 1) * 0.754877666));
    return {
      x: Math.cos(angle) * ring * 3.1 * volume,
      y: latitude * 1.5 * volume,
      z: Math.sin(angle) * ring * 1.9 * volume,
    };
  });
}
