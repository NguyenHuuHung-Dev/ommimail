// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BubbleScene } from "./BubbleScene";
import { HomeLanding } from "./HomeLanding";

let root: Root,
  container: HTMLDivElement,
  reduced = false,
  frameId = 0;
let intersection: (entries: { isIntersecting: boolean }[]) => void;
const frames = new Map<number, FrameRequestCallback>();
const arc = vi.fn();
const disconnect = vi.fn();
const context = new Proxy(
  { arc, createRadialGradient: () => ({ addColorStop: vi.fn() }) },
  {
    get: (target, key) =>
      key in target ? target[key as keyof typeof target] : vi.fn(),
    set: () => true,
  },
);
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  reduced = false;
  frames.clear();
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "getBoundingClientRect",
  ).mockReturnValue({ width: 800, height: 360 } as DOMRect);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("reduced-motion") && reduced;
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: () => void) {}
      observe() {
        this.callback();
      }
      disconnect = disconnect;
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof intersection) {
        intersection = callback;
      }
      observe() {
        intersection([{ isIntersecting: true }]);
      }
      disconnect = disconnect;
    },
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(node: ReactNode = <BubbleScene />) {
  await act(async () => root.render(node));
}
function tick(time = 1000) {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(time));
}

it("cycles through all formations and paints them without a perpetual loop in reduced motion", async () => {
  reduced = true;
  await render();
  tick();
  const cloud = arc.mock.calls.map((args) => args.slice(0, 3));
  expect(frames.size).toBe(0);
  const button = container.querySelector("button")!;
  for (const name of ["Trái tim", "Quỹ đạo", "Bông hoa", "Đám mây"]) {
    arc.mockClear();
    await act(async () => button.click());
    tick();
    expect(button.getAttribute("aria-label")).toContain(name);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(name);
    expect(arc).toHaveBeenCalled();
    expect(frames.size).toBe(0);
    if (name === "Trái tim")
      expect(arc.mock.calls.map((args) => args.slice(0, 3))).not.toEqual(cloud);
  }
});

it("pauses offscreen and cancels animation and observers on unmount", async () => {
  await render();
  tick();
  expect(frames.size).toBe(1);
  intersection([{ isIntersecting: false }]);
  expect(frames.size).toBe(0);
  intersection([{ isIntersecting: true }]);
  expect(frames.size).toBe(1);
  await render(null);
  expect(frames.size).toBe(0);
  expect(disconnect).toHaveBeenCalledTimes(2);
});

it("keeps mailbox search separate from the interactive decoration", async () => {
  const onSearch = vi.fn();
  await render(
    <MemoryRouter>
      <HomeLanding mode="member" onSearchMail={onSearch} />
    </MemoryRouter>,
  );
  const input =
    container.querySelector<HTMLInputElement>('[name="mailQuery"]')!;
  input.value = "work@example.com";
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(onSearch).toHaveBeenCalledWith("work@example.com");
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".bubble-scene")!.click(),
  );
  expect(onSearch).toHaveBeenCalledTimes(1);
});

it("leaves navigation and search usable if canvas rendering is unavailable", async () => {
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
  await render(
    <MemoryRouter>
      <HomeLanding mode="guest" />
    </MemoryRouter>,
  );
  expect(container.querySelector('input[name="mailQuery"]')).not.toBeNull();
  expect(container.querySelectorAll(".site-nav-link").length).toBeGreaterThan(
    0,
  );
  expect(frames.size).toBe(0);
});
