// @vitest-environment jsdom
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IdTokenResult, User } from "firebase/auth";

const firebase = vi.hoisted(() => ({
  observer: undefined as undefined | ((user: unknown) => void),
  errorObserver: undefined as undefined | (() => void),
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  auth: { currentUser: null as unknown },
}));

vi.mock("./firebase", () => ({ auth: firebase.auth }));
vi.mock("firebase/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/auth")>()),
  onIdTokenChanged: vi.fn((_auth, observer, onError) => {
    firebase.observer = observer;
    firebase.errorObserver = onError;
    return () => {
      firebase.observer = undefined;
    };
  }),
  sendEmailVerification: firebase.sendEmailVerification,
  signOut: firebase.signOut,
  signInWithEmailAndPassword: firebase.signInWithEmailAndPassword,
  createUserWithEmailAndPassword: firebase.createUserWithEmailAndPassword,
  updateProfile: firebase.updateProfile,
}));
vi.mock("./api", () => ({
  api: {
    health: vi.fn().mockResolvedValue({}),
    registrationPolicy: vi.fn().mockResolvedValue({ allowed: true }),
  },
}));
vi.mock("./MailApp", () => ({
  MailApp: () => <div data-testid="workspace">Authenticated workspace</div>,
}));

import { App } from "./App";
import { AuthSession } from "./AuthSession";
import { AuthPage } from "./AuthPage";
import { refreshVerification } from "./email-verification";
import { useUI } from "./store";

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let counter = 0;

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

async function render(path: string, content: ReactNode = <App />) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <AuthSession>
            <MemoryRouter initialEntries={[path]}>
              {content}
              <Location />
            </MemoryRouter>
          </AuthSession>
        </QueryClientProvider>
      </StrictMode>,
    );
  });
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

async function restored(user: User | null) {
  firebase.auth.currentUser = user;
  await act(async () => {
    firebase.observer?.(user);
  });
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

function tokenResult(verified: boolean): IdTokenResult {
  return {
    authTime: "2026-10-29T00:00:00Z",
    expirationTime: "2026-10-29T01:00:00Z",
    issuedAtTime: "2026-10-29T00:00:00Z",
    signInProvider: "password",
    signInSecondFactor: null,
    token: "signed-token",
    claims: { email_verified: verified },
  };
}

function user(verified: boolean) {
  return {
    uid: `user-${++counter}`,
    email: "test@gmail.com",
    emailVerified: verified,
    reload: vi.fn().mockResolvedValue(undefined),
    getIdToken: vi.fn().mockResolvedValue("fresh-token"),
    getIdTokenResult: vi.fn().mockResolvedValue(tokenResult(verified)),
  } as unknown as User;
}

function location() {
  return container.querySelector("output")?.textContent;
}
async function click(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );
  expect(button).toBeDefined();
  await act(async () => {
    button!.click();
  });
}

async function fill(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector);
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitForm() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  sessionStorage.clear();
  firebase.auth.currentUser = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client?.clear();
  container.remove();
});

describe("session restoration and landing routes", () => {
  it.each(["/", "/login", "/register", "/app", "/app/home", "/app/mailboxes"])(
    "restores a verified session on %s without asking for a password",
    async (path) => {
      const account = user(true);
      await render(path);
      expect(container.textContent).toContain("Đang khôi phục phiên đăng nhập");
      expect(container.querySelector('[data-testid="workspace"]')).toBeNull();
      await restored(account);
      expect(location()).toBe(path === "/app/mailboxes" ? path : "/app/home");
      expect(
        container.querySelector('[data-testid="workspace"]'),
      ).not.toBeNull();
      expect(container.querySelector(".public-home")).toBeNull();
      expect(account.getIdToken).not.toHaveBeenCalled();
    },
  );

  it("takes visitors to sign-in without showing the discarded public landing", async () => {
    await render("/");
    await restored(null);
    expect(location()).toBe("/login");
    expect(container.querySelector(".public-home")).toBeNull();
    expect(container.querySelector(".poster-home")).toBeNull();
  });

  it("redirects a signed-out visitor away from private routes", async () => {
    await render("/app/mailboxes");
    await restored(null);
    expect(location()).toBe("/login");
    expect(container.querySelector('[data-testid="workspace"]')).toBeNull();
  });

  it("clears the previous user's cached mail and search when identity changes", async () => {
    await render("/app/mailboxes");
    await restored(user(true));
    client.setQueryData(["messages"], ["private message"]);
    useUI
      .getState()
      .set({ search: "private@gmail.com", selectedMessage: "message-1" });
    await restored(user(true));
    expect(client.getQueryData(["messages"])).toBeUndefined();
    expect(useUI.getState().search).toBe("");
    expect(useUI.getState().selectedMessage).toBeNull();
  });

  it("shows a retryable restoration error without a redirect loop", async () => {
    await render("/login");
    await act(async () => {
      firebase.errorObserver?.();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Không thể khôi phục phiên",
    );
    expect(location()).toBe("/login");
  });
});

describe("email ownership verification", () => {
  it("sends the verification email from signup even before the verification screen mounts", async () => {
    const account = user(false);
    firebase.createUserWithEmailAndPassword.mockResolvedValueOnce({ user: account });
    await render("/register", <AuthPage mode="register" />);
    await restored(null);
    expect(container.textContent).toContain("Bạn cần xác minh địa chỉ email");
    await fill('[autocomplete="name"]', "Nguyễn Văn An");
    await fill('[type="email"]', "new@gmail.com");
    await fill('[autocomplete="new-password"]', "password123");
    await fill('input[placeholder="Repeat your password"]', "password123");
    await submitForm();
    expect(firebase.sendEmailVerification).toHaveBeenCalledOnce();
    expect(firebase.sendEmailVerification).toHaveBeenCalledWith(account, {
      url: `${window.location.origin}/verify-email`,
    });
    expect(location()).toBe("/verify-email");
    expect(container.querySelector(".verification-card")).toBeNull();
    expect(container.querySelector('[data-testid="workspace"]')).toBeNull();
  });

  it("requires email verification immediately after email/password registration", async () => {
    const account = user(false);
    firebase.createUserWithEmailAndPassword.mockImplementationOnce(async () => {
      firebase.observer?.(account);
      return { user: account };
    });
    await render("/register");
    await restored(null);
    await fill('[autocomplete="name"]', "Nguyễn Văn An");
    await fill('[type="email"]', "new@gmail.com");
    await fill('[autocomplete="new-password"]', "password123");
    await fill('input[placeholder="Repeat your password"]', "password123");
    await submitForm();
    expect(firebase.createUserWithEmailAndPassword).toHaveBeenCalledWith(
      firebase.auth,
      "new@gmail.com",
      "password123",
    );
    expect(firebase.updateProfile).toHaveBeenCalledWith(account, {
      displayName: "Nguyễn Văn An",
    });
    expect(location()).toBe("/verify-email");
    expect(container.querySelector('[data-testid="workspace"]')).toBeNull();
    expect(firebase.sendEmailVerification).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "routes a successful password login according to email ownership (%s)",
    async (verified) => {
      const account = user(verified);
      firebase.signInWithEmailAndPassword.mockImplementationOnce(async () => {
        firebase.observer?.(account);
        return { user: account };
      });
      await render("/login");
      await restored(null);
      await fill('[type="email"]', "login@gmail.com");
      await fill('[autocomplete="current-password"]', "password123");
      await submitForm();
      expect(firebase.signInWithEmailAndPassword).toHaveBeenCalledWith(
        firebase.auth,
        "login@gmail.com",
        "password123",
      );
      expect(location()).toBe(verified ? "/app/home" : "/verify-email");
    },
  );

  it.each(["/", "/login", "/register", "/app/mailboxes", "/app/home"])(
    "blocks unverified accounts at %s and sends only one email even in StrictMode",
    async (path) => {
      await render(path);
      await restored(user(false));
      expect(location()).toBe("/verify-email");
      expect(container.querySelector('[data-testid="workspace"]')).toBeNull();
      expect(container.textContent).toContain("test@gmail.com");
      expect(firebase.sendEmailVerification).toHaveBeenCalledTimes(1);
      expect(firebase.sendEmailVerification).toHaveBeenCalledWith(
        expect.anything(),
        { url: `${window.location.origin}/verify-email` },
      );
    },
  );

  it("keeps an unverified user outside mailboxes after checking", async () => {
    const account = user(false);
    await render("/verify-email");
    await restored(account);
    await click("Tôi đã xác minh");
    expect(account.reload).toHaveBeenCalledOnce();
    expect(account.getIdToken).not.toHaveBeenCalled();
    expect(location()).toBe("/verify-email");
    expect(container.textContent).toContain("Email chưa được xác minh");
  });

  it("refreshes the signed token before entering mailboxes after verification", async () => {
    const account = user(false);
    vi.mocked(account.reload).mockImplementation(async () => {
      Object.assign(account, { emailVerified: true });
    });
    vi.mocked(account.getIdToken).mockImplementation(async () => {
      vi.mocked(account.getIdTokenResult).mockResolvedValue(tokenResult(true));
      firebase.observer?.(account);
      return "verified-token";
    });
    await render("/verify-email");
    await restored(account);
    await click("Tôi đã xác minh");
    expect(account.getIdToken).toHaveBeenCalledWith(true);
    expect(location()).toBe("/app/home");
  });

  it("does not treat a failed token refresh as successful verification", async () => {
    const account = user(true);
    vi.mocked(account.getIdToken).mockRejectedValue(new Error("network error"));
    await expect(refreshVerification(account)).rejects.toThrow("network error");
  });

  it("keeps mailboxes blocked when reload reports verification before the JWT is refreshed", async () => {
    const account = user(false);
    vi.mocked(account.reload).mockImplementation(async () => {
      Object.assign(account, { emailVerified: true });
      firebase.observer?.(account);
    });
    vi.mocked(account.getIdToken).mockRejectedValue(new Error("network error"));
    await render("/verify-email");
    await restored(account);
    await click("Tôi đã xác minh");
    expect(location()).toBe("/verify-email");
    expect(container.querySelector('[data-testid="workspace"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("ignores an old identity's token lookup after the user signs out", async () => {
    const account = user(true);
    let finishLookup!: (
      result: Awaited<ReturnType<User["getIdTokenResult"]>>,
    ) => void;
    vi.mocked(account.getIdTokenResult).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishLookup = resolve;
        }),
    );
    await render("/app/mailboxes");
    await restored(account);
    await restored(null);
    await act(async () => {
      finishLookup(tokenResult(true));
    });
    expect(location()).toBe("/login");
    expect(container.querySelector('[data-testid="workspace"]')).toBeNull();
  });

  it("lets users retry sending a verification email after delivery fails", async () => {
    firebase.sendEmailVerification.mockRejectedValueOnce({
      code: "auth/network-request-failed",
    });
    await render("/verify-email");
    await restored(user(false));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Kiểm tra mạng",
    );
    await click("Gửi lại email");
    expect(firebase.sendEmailVerification).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
