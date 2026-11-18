// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const player = vi.hoisted(() => ({
  load: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  destroy: vi.fn(),
  setSpeed: vi.fn(),
  goToAndStop: vi.fn(),
}));
vi.mock("lottie-web/build/player/lottie_light", () => ({
  default: { loadAnimation: player.load },
}));
import { AuthAnimation } from "./AuthAnimation";

let root: Root,
  container: HTMLDivElement,
  reduced = false;
let events: Map<string, () => void>;
let visibility: (entries: { isIntersecting: boolean }[]) => void;
let hiddenDescriptor: PropertyDescriptor | undefined;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  reduced = false;
  events = new Map();
  player.load.mockReturnValue({
    ...player,
    addEventListener: (name: string, callback: () => void) =>
      events.set(name, callback),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof visibility) {
        visibility = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  if (hiddenDescriptor)
    Object.defineProperty(document, "hidden", hiddenDescriptor);
  else Reflect.deleteProperty(document, "hidden");
});
async function renderAnimation() {
  await act(async () =>
    root.render(<AuthAnimation src="/animations/business-team.json" />),
  );
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  await act(async () => events.get("DOMLoaded")?.());
}
it("lets users pause, pauses offscreen and releases the renderer on unmount", async () => {
  await renderAnimation();
  expect(player.play).toHaveBeenCalled();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Tạm dừng hoạt ảnh"]')!
      .click(),
  );
  expect(player.pause).toHaveBeenCalled();
  expect(
    container.querySelector('[aria-label="Phát hoạt ảnh"]'),
  ).not.toBeNull();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Phát hoạt ảnh"]')!
      .click(),
  );
  player.pause.mockClear();
  visibility([{ isIntersecting: false }]);
  expect(player.pause).toHaveBeenCalledOnce();
  await act(async () => root.render(null));
  expect(player.destroy).toHaveBeenCalledOnce();
});
it("shows a still frame for reduced motion until the user explicitly starts playback", async () => {
  reduced = true;
  await renderAnimation();
  expect(player.goToAndStop).toHaveBeenCalledWith(45, true);
  expect(player.play).not.toHaveBeenCalled();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Phát hoạt ảnh"]')!
      .click(),
  );
  expect(player.play).toHaveBeenCalledOnce();
});
