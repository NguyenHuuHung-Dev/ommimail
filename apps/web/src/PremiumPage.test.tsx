// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  premiumBilling: vi.fn(),
  myUpgradeRequest: vi.fn(),
  requestUpgrade: vi.fn(),
  createPremiumCheckout: vi.fn(),
  checkPremiumPayment: vi.fn(),
}));
vi.mock("./api", () => ({ api: mocks }));
import { PremiumPage } from "./PremiumPage";

let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  mocks.premiumBilling.mockResolvedValue({
    available: true,
    price: 2000,
    currency: "VND",
    managed: false,
  });
  mocks.myUpgradeRequest.mockResolvedValue({});
  mocks.requestUpgrade.mockResolvedValue({
    requestedAt: "2026-11-14T12:00:00.000Z",
    status: "pending",
  });
  mocks.checkPremiumPayment.mockResolvedValue({
    orderCode: 123,
    amount: 2000,
    status: "PENDING",
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
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
async function render(
  role: "basic" | "premium" = "basic",
  path = "/app/mail-admin",
) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <PremiumPage role={role} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    if (client.isFetching() === 0) break;
  }
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}
const payButton = () =>
  container.querySelector<HTMLButtonElement>(".premium-pay-button")!;
describe("monthly Premium checkout page", () => {
  it("shows 2,000 VND per month without creating a payment on page load", async () => {
    await render();
    expect(container.querySelector(".premium-price")?.textContent).toContain(
      "2.000",
    );
    expect(container.textContent).toContain("Không tự động trừ tiền");
    expect(payButton().disabled).toBe(false);
    expect(mocks.createPremiumCheckout).not.toHaveBeenCalled();
  });
  it("disables unconfigured checkout and retains the Admin request option", async () => {
    mocks.premiumBilling.mockResolvedValueOnce({
      available: false,
      price: 2000,
      currency: "VND",
      managed: false,
    });
    await render();
    expect(payButton().disabled).toBe(true);
    expect(container.textContent).toContain("Thanh toán chưa được mở");
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(".premium-manual button")!
        .click(),
    );
    expect(mocks.requestUpgrade).toHaveBeenCalledOnce();
  });
  it("does not activate Premium from a forged return URL", async () => {
    await render(
      "basic",
      "/app/mail-admin?orderCode=123&status=PAID&payment=return",
    );
    expect(mocks.checkPremiumPayment).toHaveBeenCalledWith(123);
    expect(container.textContent).toContain("Đang chờ thanh toán");
    expect(container.textContent).not.toContain("Premium đang hoạt động");
  });
  it("refreshes access only after the API confirms a paid order", async () => {
    mocks.checkPremiumPayment.mockResolvedValueOnce({
      orderCode: 123,
      amount: 2000,
      status: "PAID",
      premiumExpiresAt: "2099-12-14T12:00:00.000Z",
      expiresAt: new Date().toISOString(),
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await render("basic", "/app/mail-admin?orderCode=123");
    expect(container.textContent).toContain("Đã xác nhận thanh toán");
    expect(container.textContent).toContain("Premium đang hoạt động");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["me"] });
  });
  it("lets paid Premium members renew while preserving their remaining period", async () => {
    mocks.premiumBilling.mockResolvedValueOnce({
      available: true,
      price: 2000,
      managed: false,
      premiumExpiresAt: "2099-12-14T12:00:00.000Z",
    });
    await render("premium");
    expect(payButton().textContent).toContain("Gia hạn");
    expect(container.textContent).toContain("từ ngày hết hạn");
    expect(container.querySelector(".premium-manual")).toBeNull();
  });
  it("does not offer a redundant checkout to Admin-granted Premium users", async () => {
    mocks.premiumBilling.mockResolvedValueOnce({
      available: true,
      price: 2000,
      managed: true,
    });
    await render("premium");
    expect(container.textContent).toContain("Premium do Admin cấp");
    expect(container.querySelector(".premium-pay-button")).toBeNull();
  });
});
