export const bubbleShapes = ["cloud", "heart"] as const;
export type BubbleShape = (typeof bubbleShapes)[number];
export type BubblePoint = { x: number; y: number; z: number };
const fraction = (value: number) => value - Math.floor(value);

// Equal-radius mirrored pairs keep the heart silhouette balanced. The free
// cluster retains the reference's varied, much larger sphere sizes.
export function heartRadius(index: number) {
  const pair = Math.floor(index / 2);
  return 0.31 + fraction(Math.sin((pair + 1) * 127.1) * 43758.5453) * 0.08;
}

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
      // Mirrored, staggered rows fill the heart instead of leaving a random
      // hollow outline. Each row narrows toward the tip; the first has a cleft.
      const rows =
        count <= 48
          ? [4, 8, 8, 8, 8, 6, 4, 2]
          : [6, 12, 14, 14, 12, 10, 6, 4, 2];
      const widths =
        count <= 48
          ? [1.7, 2.4, 2.6, 2.4, 2, 1.45, 0.85, 0.25]
          : [1.7, 2.4, 2.6, 2.5, 2.15, 1.75, 1.2, 0.7, 0.23];
      let row = 0,
        offset = i;
      while (row < rows.length - 1 && offset >= rows[row])
        offset -= rows[row++];
      const pair = Math.floor(offset / 2),
        half = rows[row] / 2;
      const inner = row === 0 ? 0.75 : 0.22;
      const x = inner + ((widths[row] - inner) * pair) / Math.max(1, half - 1);
      return {
        x: (row === rows.length - 1 ? 0.08 : x) * (offset % 2 === 0 ? 1 : -1),
        y:
          1.65 -
          row * (3.8 / (rows.length - 1)) +
          (row === 0 && pair === 1 ? 0.12 : 0),
        z: row === rows.length - 1 ? 0 : Math.sin(row * 2.1 + pair * 1.7) * 0.6,
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
