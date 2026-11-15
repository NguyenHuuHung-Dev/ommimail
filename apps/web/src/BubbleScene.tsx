import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  bubbleShapes,
  bubbleTargets,
  type BubbleShape,
} from "./bubble-geometry";

const labels: Record<BubbleShape, string> = {
  cloud: "Đám mây",
  heart: "Trái tim",
  orbit: "Quỹ đạo",
  flower: "Bông hoa",
};
const palette = [
  [226, 123, 165],
  [241, 164, 191],
  [250, 192, 191],
  [245, 218, 229],
  [226, 232, 234],
  [205, 101, 148],
];

export function BubbleScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<((shape: BubbleShape) => void) | null>(null);
  const pointer = useRef({ x: -10, y: -10 });
  const [shape, setShape] = useState<BubbleShape>("cloud");
  const currentShape = useRef<BubbleShape>("cloud");
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0,
      height = 0,
      frame = 0,
      last = 0,
      burstUntil = 0,
      visible = true;
    const count = window.matchMedia("(max-width: 650px)").matches ? 52 : 84;
    let targets = bubbleTargets(currentShape.current, count);
    const balls = targets.map((point, i) => ({
      ...point,
      vx: 0,
      vy: 0,
      radius: 0.105 + (((i * 37) % 101) / 101) * 0.115,
      color: palette[i % palette.length],
      phase: i * 1.71,
    }));
    function draw(time: number) {
      const ctx = context!;
      const dt = Math.min(
        2,
        Math.max(0.25, (time - (last || time - 16)) / 16.67),
      );
      last = time;
      const scale = Math.min(width * 0.32, height * 0.44);
      ctx.clearRect(0, 0, width, height);
      // The ground shadow separates the floating cluster from the pink glow.
      ctx.save();
      ctx.translate(width / 2, height * 0.87);
      ctx.scale(1, 0.12);
      const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, scale * 1.2);
      shadow.addColorStop(0, "rgba(136,62,95,.14)");
      shadow.addColorStop(1, "rgba(136,62,95,0)");
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(0, 0, scale * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      balls.forEach((ball, i) => {
        const target = targets[i];
        if (reduced.matches) {
          ball.x = target.x;
          ball.y = target.y;
        } else {
          const dx = ball.x - pointer.current.x,
            dy = ball.y - pointer.current.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 0.6 && distance > 0.001) {
            ball.vx += (dx / distance) * (0.6 - distance) * 0.027;
            ball.vy += (dy / distance) * (0.6 - distance) * 0.027;
          }
          if (time > burstUntil) {
            ball.vx += (target.x - ball.x) * 0.014 * dt;
            ball.vy += (target.y - ball.y) * 0.014 * dt;
          }
          ball.vx *= Math.pow(0.88, dt);
          ball.vy *= Math.pow(0.88, dt);
          ball.x += ball.vx * dt;
          ball.y += ball.vy * dt;
        }
      });
      [...balls]
        .sort((a, b) => a.z - b.z)
        .forEach((ball) => {
          const depth = 1 + ball.z * 0.2;
          const float = reduced.matches
            ? 0
            : Math.sin(time * 0.0007 + ball.phase) * 0.025;
          const x = width / 2 + ball.x * scale * depth;
          const y = height * 0.49 + (ball.y + float) * scale;
          const radius = ball.radius * scale * depth;
          const [r, g, b] = ball.color;
          const light = (v: number) => Math.round(v + (255 - v) * 0.65);
          const dark = (v: number) => Math.round(v * 0.76);
          const surface = ctx.createRadialGradient(
            x - radius * 0.38,
            y - radius * 0.45,
            radius * 0.06,
            x,
            y,
            radius,
          );
          surface.addColorStop(0, `rgb(${light(r)},${light(g)},${light(b)})`);
          surface.addColorStop(0.5, `rgb(${r},${g},${b})`);
          surface.addColorStop(1, `rgb(${dark(r)},${dark(g)},${dark(b)})`);
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.shadowColor = "rgba(132,57,92,.19)";
          ctx.shadowBlur = radius * 0.35;
          ctx.shadowOffsetY = radius * 0.12;
          ctx.fillStyle = surface;
          ctx.fill();
          ctx.shadowColor = "transparent";
          ctx.strokeStyle = "rgba(255,255,255,.35)";
          ctx.lineWidth = 0.6;
          ctx.stroke();
          const sheen = ctx.createRadialGradient(
            x - radius * 0.32,
            y - radius * 0.45,
            0,
            x - radius * 0.32,
            y - radius * 0.45,
            radius * 0.5,
          );
          sheen.addColorStop(0, "rgba(255,255,255,.4)");
          sheen.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = sheen;
          ctx.beginPath();
          ctx.arc(
            x - radius * 0.32,
            y - radius * 0.45,
            radius * 0.5,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        });
    }
    function animate(time: number) {
      frame = 0;
      if (!visible || document.hidden) return;
      // Avoid doubling the rendering cost on 120/144 Hz screens.
      if (!reduced.matches && last && time - last < 15) {
        frame = requestAnimationFrame(animate);
        return;
      }
      draw(time);
      if (!reduced.matches) frame = requestAnimationFrame(animate);
    }
    function wake() {
      last = 0;
      if (!frame && visible && !document.hidden)
        frame = requestAnimationFrame(animate);
    }
    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);
      wake();
    }
    engine.current = (next) => {
      targets = bubbleTargets(next, count);
      burstUntil = performance.now() + 280;
      balls.forEach((ball, i) => {
        const angle = i * 2.399;
        ball.vx = Math.cos(angle) * 0.12;
        ball.vy = Math.sin(angle) * 0.12;
      });
      pointer.current = { x: -10, y: -10 };
      wake();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else wake();
    });
    intersection.observe(canvas);
    const visibility = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      wake();
    };
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", visibility);
    resize();
    return () => {
      engine.current = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", visibility);
    };
  }, []);
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(rect.width * 0.32, rect.height * 0.44);
    pointer.current = {
      x: (event.clientX - rect.left - rect.width / 2) / scale,
      y: (event.clientY - rect.top - rect.height * 0.49) / scale,
    };
  };
  const morph = () => {
    const next =
      bubbleShapes[
        (bubbleShapes.indexOf(currentShape.current) + 1) % bubbleShapes.length
      ];
    currentShape.current = next;
    setShape(next);
    engine.current?.(next);
  };
  return (
    <div className="bubble-art">
      <button
        className="bubble-scene"
        type="button"
        onPointerMove={move}
        onPointerLeave={() => {
          pointer.current = { x: -10, y: -10 };
        }}
        onClick={morph}
        aria-label={`Bong bóng: ${labels[shape]}. Bấm để đổi hình.`}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
        <span className="bubble-hint">Di chuột để chạm · Bấm để đổi hình</span>
      </button>
      <span className="bubble-live" role="status" aria-live="polite">
        {labels[shape]}
      </span>
      <span className="floating-heart heart-one" aria-hidden="true">
        ♥
      </span>
      <span className="floating-heart heart-two" aria-hidden="true">
        ♥
      </span>
      <span className="floating-heart heart-three" aria-hidden="true">
        ♥
      </span>
      <span className="floating-envelope envelope-one" aria-hidden="true" />
      <span className="floating-envelope envelope-two" aria-hidden="true" />
    </div>
  );
}
