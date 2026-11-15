export const bubbleShapes = ["cloud", "heart", "orbit", "flower"] as const;
export type BubbleShape = (typeof bubbleShapes)[number];
export type BubblePoint = { x: number; y: number; z: number };

// Stable geometry keeps resizing and hydration from shuffling the composition.
export function bubbleTargets(
  shape: BubbleShape,
  count: number,
): BubblePoint[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i * Math.PI * (3 - Math.sqrt(5));
    const r = Math.sqrt((i + 0.5) / count);
    const z = Math.sin(i * 2.399) * 0.65;
    if (shape === "heart")
      return {
        x: 1.4 * r * Math.pow(Math.sin(t), 3),
        y:
          (-r *
            (13 * Math.cos(t) -
              5 * Math.cos(2 * t) -
              2 * Math.cos(3 * t) -
              Math.cos(4 * t))) /
            17 -
          0.08,
        z,
      };
    if (shape === "orbit")
      return {
        x: 1.25 * Math.cos(t),
        y: 0.62 * Math.sin(t),
        z: Math.sin(t) * 0.8 + Math.cos(i * 3) * 0.22,
      };
    if (shape === "flower") {
      const petal = r * (0.85 + 0.3 * Math.cos(5 * t));
      return { x: petal * Math.cos(t), y: petal * Math.sin(t), z };
    }
    return { x: 1.3 * r * Math.cos(t), y: 0.67 * r * Math.sin(t), z };
  });
}
