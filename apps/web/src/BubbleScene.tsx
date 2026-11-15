import { useEffect, useRef, useState, type PointerEvent } from "react";
import { bubbleShapes, type BubbleShape } from "./bubble-geometry";
import type { BubbleWorld } from "./bubble-webgl";
const labels: Record<BubbleShape, string> = {
  cloud: "Đám mây",
  orbit: "Quỹ đạo",
  flower: "Bông hoa",
};
export function BubbleScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    engine = useRef<BubbleWorld | null>(null),
    current = useRef<BubbleShape>("cloud");
  const [shape, setShape] = useState<BubbleShape>("cloud"),
    [fallback, setFallback] = useState(false);
  useEffect(() => {
    let cancelled = false,
      visible = true;
    const canvas = canvasRef.current!;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      engine.current?.setVisible(visible);
    });
    observer.observe(canvas);
    // Keep the 3D renderer out of the initial application bundle.
    void import("./bubble-webgl")
      .then(({ createBubbleWorld }) => {
        if (cancelled) return;
        try {
          engine.current = createBubbleWorld(canvas, current.current);
          engine.current.setVisible(visible);
        } catch {
          setFallback(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFallback(true);
      });
    return () => {
      cancelled = true;
      observer.disconnect();
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    engine.current?.setPointer(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
  };
  const morph = () => {
    const next =
      bubbleShapes[
        (bubbleShapes.indexOf(current.current) + 1) % bubbleShapes.length
      ];
    current.current = next;
    setShape(next);
    engine.current?.setShape(next);
  };
  return (
    <div className="bubble-art">
      <button
        className="bubble-scene"
        type="button"
        onPointerMove={move}
        onPointerLeave={() => engine.current?.setPointer(99, 99)}
        onClick={morph}
        aria-label={`Bong bóng: ${labels[shape]}. Bấm để đổi hình.`}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
        {fallback && (
          <span className="bubble-fallback" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} />
            ))}
          </span>
        )}
        <span className="bubble-hint">Di chuột để chạm · Bấm để đổi hình</span>
      </button>
      <span className="bubble-live" role="status" aria-live="polite">
        {labels[shape]}
      </span>
      <span className="floating-envelope envelope-one" aria-hidden="true" />
      <span className="floating-envelope envelope-two" aria-hidden="true" />
    </div>
  );
}
