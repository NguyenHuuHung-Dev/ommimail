// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  setShape: vi.fn(),
  setPointer: vi.fn(),
  setVisible: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("./bubble-webgl", () => ({ createBubbleWorld: mocks.create }));
import { BubbleScene } from "./BubbleScene";
import { HomeLanding } from "./HomeLanding";
import { bubbleRadius, bubbleTargets } from "./bubble-geometry";
let root: Root, container: HTMLDivElement;
let intersection: (entries: { isIntersecting: boolean }[]) => void;
const disconnect = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  mocks.create.mockReturnValue({
    setShape: mocks.setShape,
    setPointer: mocks.setPointer,
    setVisible: mocks.setVisible,
    dispose: mocks.dispose,
  });
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
  vi.unstubAllGlobals();
});
async function render(node: ReactNode = <BubbleScene />) {
  await act(async () => root.render(node));
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}
it("loads the 3D renderer and cycles through formations without hearts", async () => {
  await render();
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(container.querySelector(".floating-heart")).toBeNull();
  const button = container.querySelector("button")!;
  for (const [shape, name] of [
    ["orbit", "Quỹ đạo"],
    ["flower", "Bông hoa"],
    ["cloud", "Đám mây"],
  ]) {
    await act(async () => button.click());
    expect(button.getAttribute("aria-label")).toContain(name);
    expect(mocks.setShape).toHaveBeenLastCalledWith(shape);
  }
});
it("pauses offscreen and disposes GPU resources when leaving Home", async () => {
  await render();
  intersection([{ isIntersecting: false }]);
  expect(mocks.setVisible).toHaveBeenLastCalledWith(false);
  intersection([{ isIntersecting: true }]);
  expect(mocks.setVisible).toHaveBeenLastCalledWith(true);
  await render(null);
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(disconnect).toHaveBeenCalledOnce();
});
it("keeps mailbox search separate from the interactive decoration", async () => {
  const onSearch = vi.fn();
  await render(
    <MemoryRouter>
      <HomeLanding mode="member" onSearchMail={onSearch} />
    </MemoryRouter>,
  );
  container.querySelector<HTMLInputElement>('[name="mailQuery"]')!.value =
    "work@example.com";
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
it("retains a decorative fallback and working search if WebGL cannot initialize", async () => {
  mocks.create.mockImplementation(() => {
    throw new Error("No WebGL");
  });
  await render(
    <MemoryRouter>
      <HomeLanding mode="guest" />
    </MemoryRouter>,
  );
  expect(container.querySelectorAll(".bubble-fallback i")).toHaveLength(8);
  expect(container.querySelector('[name="mailQuery"]')).not.toBeNull();
});
it.each([28, 44])(
  "packs all %i sphere targets without deep intersections",
  (count) => {
    const points = bubbleTargets("cloud", count);
    expect(points).toHaveLength(count);
    points.forEach((point, i) => {
      expect(Number.isFinite(point.x + point.y + point.z)).toBe(true);
      points.slice(0, i).forEach((other, j) => {
        expect(
          Math.hypot(point.x - other.x, point.y - other.y),
        ).toBeGreaterThanOrEqual((bubbleRadius(i) + bubbleRadius(j)) * 0.94);
      });
    });
  },
);
