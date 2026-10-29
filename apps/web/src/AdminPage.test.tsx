// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { AdminOverview, AdminUser } from "@omnimail/shared";
const api = vi.hoisted(() => ({
  admin: vi.fn(),
  setUserDisabled: vi.fn(),
  deleteUser: vi.fn(),
  setUserRole: vi.fn(),
}));
vi.mock("./api", () => ({ api }));
import { AdminPage } from "./AdminPage";
let root: Root, container: HTMLDivElement, qc: QueryClient;
const entry = (userId: string, extra: Partial<AdminUser> = {}): AdminUser => ({
  userId,
  email: `${userId}@example.com`,
  displayName: `User ${userId}`,
  role: "basic",
  disabled: false,
  emailVerified: true,
  providers: ["password"],
  accounts: [],
  sharedAccountIds: [],
  ...extra,
});
const overview = (): AdminOverview => ({
  users: 3,
  currentUserId: "self",
  connectedAccounts: 0,
  serviceStatus: "healthy",
  directory: [
    entry("self", { role: "admin" }),
    entry("pending", { emailVerified: false }),
    entry("disabled", { disabled: true }),
  ],
});
async function render(data = overview()) {
  api.admin.mockResolvedValue(data);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function click(name: string) {
  const control = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (button) =>
      button.getAttribute("aria-label") === name ||
      button.textContent?.trim() === name,
  );
  expect(control).toBeDefined();
  await act(async () => {
    control!.click();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function fill(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  api.setUserDisabled.mockResolvedValue({});
  api.deleteUser.mockResolvedValue({ deleted: true });
  api.setUserRole.mockResolvedValue({});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  qc?.clear();
  container.remove();
});

describe("admin account controls", () => {
  it("shows verified, pending and blocked accounts with clear status labels", async () => {
    await render();
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("Được bảo vệ");
    expect(rows[1].textContent).toContain("Chờ xác minh");
    expect(rows[2].textContent).toContain("Đã khóa");
    expect(
      container.querySelector('[aria-label="Xóa self@example.com"]'),
    ).toBeNull();
  });
  it("searches accounts and shows an actionable empty state", async () => {
    await render();
    await fill('[aria-label="Tìm người dùng"]', "pending@example.com");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    await fill('[aria-label="Tìm người dùng"]', "missing@example.com");
    expect(container.textContent).toContain("Không tìm thấy người dùng");
    await click("Xóa bộ lọc");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
  });
  it("does not delete anything until the exact email is entered and confirmed", async () => {
    await render();
    await click("Xóa pending@example.com");
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("pending@example.com");
    const submit = dialog.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    expect(submit.disabled).toBe(true);
    expect(api.deleteUser).not.toHaveBeenCalled();
    await fill('[aria-label="Xác nhận xóa tài khoản"]', "wrong@example.com");
    expect(submit.disabled).toBe(true);
    await fill('[aria-label="Xác nhận xóa tài khoản"]', "pending@example.com");
    expect(submit.disabled).toBe(false);
    await click("Xóa vĩnh viễn");
    expect(api.deleteUser).toHaveBeenCalledWith(
      "pending",
      "pending@example.com",
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Đã xóa tài khoản",
    );
  });
  it("requires confirmation before locking and allows cancellation", async () => {
    await render();
    await click("Khóa");
    expect(api.setUserDisabled).not.toHaveBeenCalled();
    await click("Hủy");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await click("Khóa");
    await click("Khóa tài khoản");
    expect(api.setUserDisabled).toHaveBeenCalledWith("pending", true);
  });
  it("unlocks the selected blocked account", async () => {
    await render();
    await click("Mở khóa");
    await click("Mở khóa tài khoản");
    expect(api.setUserDisabled).toHaveBeenCalledWith("disabled", false);
  });
  it("keeps a failed deletion open with its error and confirmation", async () => {
    api.deleteUser.mockRejectedValueOnce(new Error("Thử lại sau"));
    await render();
    await click("Xóa pending@example.com");
    await fill('[aria-label="Xác nhận xóa tài khoản"]', "pending@example.com");
    await click("Xóa vĩnh viễn");
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Thử lại sau",
    );
    expect(
      container.querySelector<HTMLInputElement>(
        '[aria-label="Xác nhận xóa tài khoản"]',
      )?.value,
    ).toBe("pending@example.com");
  });
  it("paginates without silently hiding search matches", async () => {
    const data = overview();
    data.directory = Array.from({ length: 12 }, (_, index) =>
      entry(`member-${index}`),
    );
    await render(data);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(10);
    await click("Trang sau");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    await fill('[aria-label="Tìm người dùng"]', "member-0@example.com");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(container.querySelector(".admin-pagination")?.textContent).toContain(
      "Trang 1 / 1",
    );
  });
});
