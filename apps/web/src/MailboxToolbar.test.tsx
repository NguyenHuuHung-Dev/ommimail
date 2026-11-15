// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MailAccount } from "@omnimail/shared";
import { MailboxToolbar } from "./MailboxToolbar";

const account: MailAccount = {
  id: "gmail",
  emailAddress: "long.mailbox.address@example.com",
  provider: "gmail",
  status: "connected",
  unreadCount: 1,
};
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
const actions = () => ({
  onSelect: vi.fn(),
  onSearch: vi.fn(),
  onToggleSpam: vi.fn(),
  onRefresh: vi.fn(),
  onDisconnect: vi.fn(),
});
const button = (name: string) =>
  container.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;

it("keeps folder switching, counts and mailbox selection usable in the new toolbar", async () => {
  const callbacks = actions();
  function Toolbar() {
    const [folder, setFolder] = useState<"main" | "spam">("main");
    return (
      <MailboxToolbar
        accounts={[account]}
        account={account}
        folder={folder}
        spamCount={2}
        messageCount={folder === "main" ? 12 : 2}
        syncing={false}
        removing={false}
        searchOpen={false}
        {...callbacks}
        onToggleSpam={() => setFolder(folder === "main" ? "spam" : "main")}
      />
    );
  }
  await act(async () => root.render(<Toolbar />));
  expect(container.querySelector("select")?.value).toBe("gmail");
  expect(container.querySelector(".mailbox-message-count")?.textContent).toBe(
    "12 mails",
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".spam-toolbar-button")!.click(),
  );
  expect(container.querySelector(".spam-toolbar-button")?.textContent).toBe(
    "Inbox2",
  );
  expect(
    container
      .querySelector(".spam-toolbar-button")
      ?.getAttribute("aria-pressed"),
  ).toBe("true");
  expect(container.querySelector(".mailbox-message-count")?.textContent).toBe(
    "2 mails",
  );
  await act(async () => {
    button("Tìm mailbox").click();
    button("Refresh mailbox").click();
  });
  expect(callbacks.onSearch).toHaveBeenCalledOnce();
  expect(callbacks.onRefresh).toHaveBeenCalledOnce();
});

it.each([
  undefined,
  { ...account, access: "shared" as const },
  { ...account, id: "microsoft-live" },
])(
  "preserves restrictions on disconnecting unavailable, shared and server-managed mailboxes",
  async (current) => {
    const callbacks = actions();
    await act(async () =>
      root.render(
        <MailboxToolbar
          accounts={[account]}
          account={current}
          folder="main"
          spamCount={0}
          messageCount={0}
          syncing={false}
          removing={false}
          searchOpen
          {...callbacks}
        />,
      ),
    );
    expect(button("Ngắt kết nối mailbox").disabled).toBe(true);
    await act(async () => button("Ngắt kết nối mailbox").click());
    expect(callbacks.onDisconnect).not.toHaveBeenCalled();
    if (!current || current.access === "shared")
      expect(button("Refresh mailbox").disabled).toBe(true);
    expect(button("Tìm mailbox").getAttribute("aria-expanded")).toBe("true");
  },
);

it("prevents duplicate actions while a sync or disconnect is pending", async () => {
  const callbacks = actions();
  await act(async () =>
    root.render(
      <MailboxToolbar
        accounts={[account]}
        account={account}
        folder="main"
        spamCount={0}
        messageCount={0}
        syncing
        removing
        searchOpen={false}
        {...callbacks}
      />,
    ),
  );
  expect(button("Refresh mailbox").disabled).toBe(true);
  expect(button("Ngắt kết nối mailbox").disabled).toBe(true);
});
