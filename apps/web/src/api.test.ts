import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({
  auth: {
    authStateReady: vi.fn().mockResolvedValue(undefined),
    currentUser: null as null | { getIdToken: () => Promise<string> },
  },
}));
vi.mock("./firebase", () => ({ auth }));
import { api } from "./api";

beforeEach(() => {
  vi.clearAllMocks();
  auth.currentUser = null;
  auth.authStateReady.mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("API session restoration", () => {
  it("waits for the saved session before requesting private data", async () => {
    let restore!: () => void;
    auth.authStateReady.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          restore = resolve;
        }),
    );
    const response = api.me();
    expect(fetch).not.toHaveBeenCalled();
    auth.currentUser = {
      getIdToken: vi.fn().mockResolvedValue("restored-token"),
    };
    restore();
    await response;
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/me"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer restored-token",
        }),
      }),
    );
  });

  it("does not invent a local admin token for signed-out visitors", async () => {
    await api.health();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/health"),
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
});
