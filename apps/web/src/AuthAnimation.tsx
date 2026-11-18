import { Inbox, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web";

export function AuthAnimation({ src }: { src: string }) {
  const container = useRef<HTMLDivElement>(null);
  const syncPlayback = useRef<() => void>(() => {});
  const [paused, setPaused] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  const pausedRef = useRef(paused);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );

  useEffect(() => {
    pausedRef.current = paused;
    syncPlayback.current();
  }, [paused]);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let visible = true;
    let animation: AnimationItem | undefined;
    const sync = () => {
      if (pausedRef.current || document.hidden || !visible) animation?.pause();
      else animation?.play();
    };
    syncPlayback.current = sync;
    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            sync();
          });
    if (container.current) observer?.observe(container.current);
    document.addEventListener("visibilitychange", sync);
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => setPaused(motion?.matches ?? false);
    motion?.addEventListener("change", onMotionChange);

    void Promise.all([
      import("lottie-web/build/player/lottie_light"),
      fetch(src, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error("Animation unavailable");
        return response.json();
      }),
    ])
      .then(([player, data]) => {
        if (disposed || !container.current) return;
        animation = player.default.loadAnimation({
          container: container.current,
          renderer: "svg",
          loop: true,
          autoplay: false,
          animationData: data,
          rendererSettings: {
            preserveAspectRatio: "xMidYMid meet",
            progressiveLoad: true,
          },
        });
        animation.setSpeed(0.85);
        animation.addEventListener("DOMLoaded", () => {
          if (disposed) return;
          if (pausedRef.current) animation?.goToAndStop(45, true);
          setStatus("ready");
          sync();
        });
        animation.addEventListener("data_failed", () => {
          if (!disposed) setStatus("failed");
        });
      })
      .catch(() => {
        if (!disposed) setStatus("failed");
      });

    return () => {
      disposed = true;
      controller.abort();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motion?.removeEventListener("change", onMotionChange);
      animation?.destroy();
      syncPlayback.current = () => {};
    };
  }, [src]);

  return (
    <div className="auth-animation">
      {status !== "ready" && (
        <div className="auth-animation-poster" aria-hidden="true">
          <Inbox />
        </div>
      )}
      <div
        ref={container}
        className="auth-animation-canvas"
        aria-hidden="true"
      />
      {status === "ready" && (
        <button
          type="button"
          className="auth-animation-toggle"
          onClick={() => setPaused((value) => !value)}
          aria-label={paused ? "Phát hoạt ảnh" : "Tạm dừng hoạt ảnh"}
          title={paused ? "Phát hoạt ảnh" : "Tạm dừng hoạt ảnh"}
        >
          {paused ? (
            <Play size={13} aria-hidden="true" />
          ) : (
            <Pause size={13} aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
