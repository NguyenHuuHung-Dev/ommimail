import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, endRevokedSession } = vi.hoisted(() => ({
  endRevokedSession: vi.fn().mockResolvedValue(undefined),
  auth: {
    authStateReady: vi.fn().mockResolvedValue(undefined),
    currentUser: null as null | { getIdToken: () => Promise<string> },
  },
}));
vi.mock("./firebase", () => ({ auth }));
vi.mock("./session-access", () => ({ endRevokedSession }));
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
  it("ends a disabled account's existing session with the server reason", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: { code: "ACCOUNT_DISABLED", message: "Tài khoản đã bị khóa" },
      }),
    } as Response);
    await expect(api.me()).rejects.toThrow("Tài khoản đã bị khóa");
    expect(endRevokedSession).toHaveBeenCalledWith("ACCOUNT_DISABLED");
  });
  it("does not log users out for a temporary service outage", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error("HTML gateway response");
      },
    } as unknown as Response);
    await expect(api.me()).rejects.toThrow("Dịch vụ chưa phản hồi đúng");
    expect(endRevokedSession).not.toHaveBeenCalled();
  });
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
