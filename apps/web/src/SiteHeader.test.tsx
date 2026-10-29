// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader, type SiteHeaderProps } from "./SiteHeader";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(path: string, props: SiteHeaderProps = {}) {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <SiteHeader {...props} />
      </MemoryRouter>,
    ),
  );
}
describe("shared website navigation", () => {
  it("offers real login and registration links to visitors and highlights Home", async () => {
    await render("/");
    expect(container.querySelector(".site-login")?.getAttribute("href")).toBe(
      "/login",
    );
    expect(
      container.querySelector(".site-register")?.getAttribute("href"),
    ).toBe("/register");
    expect(
      container
        .querySelector('.site-nav-link[aria-current="page"]')
        ?.getAttribute("href"),
    ).toBe("/");
    expect(container.querySelector('a[href="/app/mail-admin"]')).toBeNull();
  });
  it.each(["/app/mail-sharing", "/app/mailbox-sharing"])(
    "highlights only Sharing for %s",
    async (path) => {
      await render(path, { mode: "member", role: "admin" });
      const active = container.querySelectorAll(
        '.site-nav-link[aria-current="page"]',
      );
      expect(active).toHaveLength(1);
      expect(active[0].textContent).toBe("Sharing");
    },
  );
  it("shows the user directory only to an admin and keeps its active state accurate", async () => {
    await render("/app/mail-admin", { mode: "member", role: "admin" });
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe(
      "Người dùng",
    );
    expect(container.querySelector(".site-login")).toBeNull();
  });
  it("keeps profile and logout actions usable without route changes", async () => {
    const onOpenProfile = vi.fn(),
      onLogout = vi.fn();
    await render("/app/temp-mail", {
      mode: "member",
      role: "premium",
      profileInitials: "LA",
      onOpenProfile,
      onLogout,
    });
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe(
      "Temp Mail",
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Quản lý hồ sơ"]')!
        .click(),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Đăng xuất"]')!
        .click(),
    );
    expect(onOpenProfile).toHaveBeenCalledOnce();
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
