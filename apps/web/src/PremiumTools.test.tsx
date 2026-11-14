// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MailAccount } from "@omnimail/shared";
const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  messageOtp: vi.fn(),
  mailboxOrganization: vi.fn(),
  saveMailboxOrganization: vi.fn(),
}));
vi.mock("./api", () => ({ api: mocks }));
import {
  groupMailboxes,
  MailboxOrganizationPanel,
  OtpCard,
} from "./PremiumTools";
const accounts: MailAccount[] = [
  {
    id: "gmail",
    emailAddress: "personal@example.com",
    provider: "gmail",
    status: "connected",
    unreadCount: 0,
  },
  {
    id: "outlook",
    emailAddress: "work@example.com",
    provider: "microsoft",
    status: "connected",
    unreadCount: 0,
  },
];
let root: Root, container: HTMLDivElement, client: QueryClient;
const writeText = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  mocks.me.mockResolvedValue({ userId: "user", role: "premium" });
  mocks.messageOtp.mockResolvedValue({
    codes: ["012345"],
    receivedAt: new Date().toISOString(),
  });
  mocks.mailboxOrganization.mockResolvedValue([]);
  mocks.saveMailboxOrganization.mockImplementation(async (value) => {
    mocks.mailboxOrganization.mockResolvedValue([value]);
    return value;
  });
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});
async function settle() {
  for (let attempt = 0; attempt < 20; attempt++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    if (!client.isFetching() && !client.isMutating()) break;
  }
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}
async function render(content = <OtpCard messageId="message-1" />) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>{content}</QueryClientProvider>,
    ),
  );
  await settle();
}

describe("Premium tools", () => {
  it("copies the exact server code including leading zeroes and handles clipboard denial", async () => {
    await render();
    const button = container.querySelector<HTMLButtonElement>(
      '[aria-label="Sao chép mã 012345"]',
    )!;
    await act(async () => button.click());
    expect(writeText).toHaveBeenCalledWith("012345");
    expect(container.textContent).toContain("Đã sao chép");
    writeText.mockRejectedValueOnce(new Error("denied"));
    await act(async () => button.click());
    expect(container.textContent).toContain("sao chép thủ công");
  });
  it("never fetches or displays OTP tools for Basic", async () => {
    mocks.me.mockResolvedValue({ userId: "user", role: "basic" });
    await render();
    expect(mocks.messageOtp).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });
  it("does not continue displaying cached codes after losing Premium", async () => {
    await render();
    expect(container.textContent).toContain("012345");
    await act(async () => {
      client.setQueryData(["me"], { userId: "user", role: "basic" });
    });
    await settle();
    expect(container.textContent).toBe("");
  });
  it("distinguishes ambiguous codes, no code and lookup failure", async () => {
    mocks.messageOtp.mockResolvedValueOnce({ codes: ["111111", "222222"] });
    await render();
    expect(container.textContent).toContain("Tìm thấy nhiều mã");
    mocks.messageOtp.mockResolvedValueOnce({ codes: [] });
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["message-otp"] });
    });
    await settle();
    expect(container.textContent).toContain("Không tìm thấy mã rõ ràng");
    mocks.messageOtp.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["message-otp"] });
    });
    await settle();
    expect(container.textContent).toContain("Thử lại");
  });
  it("pins a mailbox and restores its group after remounting", async () => {
    const select = vi.fn();
    mocks.mailboxOrganization.mockResolvedValue([
      { accountId: "outlook", group: "Công việc", pinned: false },
    ]);
    const panel = (
      <MailboxOrganizationPanel
        accounts={accounts}
        selectedId="outlook"
        onSelect={select}
        userId="user"
      />
    );
    await render(panel);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Ghim work@example.com"]',
        )!
        .click(),
    );
    await settle();
    expect(mocks.saveMailboxOrganization).toHaveBeenCalledWith(
      { accountId: "outlook", group: "Công việc", pinned: true },
      expect.anything(),
    );
    expect(container.querySelector(".organized-group h3")?.textContent).toBe(
      "Đã ghim",
    );
    await render(<></>);
    await render(panel);
    expect(
      container.querySelector<HTMLInputElement>("#mailbox-group-name")?.value,
    ).toBe("Công việc");
    expect(
      container.querySelector('[aria-label="Bỏ ghim work@example.com"]'),
    ).not.toBeNull();
  });
  it("shows save errors and keeps existing organization", async () => {
    mocks.saveMailboxOrganization.mockRejectedValueOnce(
      new Error("Không thể lưu"),
    );
    await render(
      <MailboxOrganizationPanel
        accounts={accounts}
        selectedId="gmail"
        onSelect={() => {}}
        userId="user"
      />,
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Ghim personal@example.com"]',
        )!
        .click(),
    );
    await settle();
    expect(container.textContent).toContain("Không thể lưu");
    expect(
      container.querySelector('[aria-label="Ghim personal@example.com"]'),
    ).not.toBeNull();
  });
  it("filters custom groups and sorts pinned accounts across providers without dropping Basic accounts", () => {
    const prefs = [{ accountId: "outlook", group: "Work", pinned: true }];
    expect(groupMailboxes(accounts, prefs, "")[0].accounts[0].id).toBe(
      "outlook",
    );
    expect(
      groupMailboxes(accounts, prefs, "Work").flatMap(
        (group) => group.accounts,
      ),
    ).toEqual([accounts[1]]);
    expect(
      groupMailboxes(accounts, [], "").flatMap((group) => group.accounts),
    ).toHaveLength(2);
  });
});
