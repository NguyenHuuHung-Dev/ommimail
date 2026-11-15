export const bubbleShapes = ["cloud", "orbit", "flower"] as const;
export type BubbleShape = (typeof bubbleShapes)[number];
export type BubblePoint = { x: number; y: number; z: number };
export function bubbleRadius(index: number) {
  return (
    [0.34, 0.29, 0.25, 0.31][index] ?? 0.12 + (((index * 31) % 97) / 97) * 0.115
  );
}

// Stable geometry keeps resizing and hydration from shuffling the composition.
export function bubbleTargets(
  shape: BubbleShape,
  count: number,
): BubblePoint[] {
  const points: BubblePoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = i * Math.PI * (3 - Math.sqrt(5));
    const r = Math.sqrt((i + 0.5) / count);
    const z = Math.sin(i * 2.399) * 0.65;
    if (shape === "orbit") {
      points.push({
        x: 1.42 * Math.cos(t),
        y: 0.7 * Math.sin(t),
        z: Math.sin(t) * 0.8 + Math.cos(i * 3) * 0.22,
      });
    } else if (shape === "flower") {
      const petal = r * (0.85 + 0.3 * Math.cos(5 * t));
      points.push({ x: petal * Math.cos(t), y: petal * Math.sin(t), z });
    } else {
      // Place the largest spheres first, then pack the smaller ones around them.
      // Controlled spacing prevents the old pile of intersecting circles.
      for (let step = 0; step < 12000; step++) {
        const angle = step * 2.39996 + i * 0.73;
        const distance = Math.sqrt(step) * 0.027;
        const point = {
          x: Math.cos(angle) * distance * 1.65,
          y: Math.sin(angle) * distance * 0.82,
          z,
        };
        if (
          points.every(
            (other, j) =>
              Math.hypot(point.x - other.x, point.y - other.y) >=
              (bubbleRadius(i) + bubbleRadius(j)) * 0.94,
          )
        ) {
          points.push(point);
          break;
        }
      }
    }
  }
  return points;
}
