import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  CreditCard,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { PREMIUM_MONTHLY_PRICE_VND } from "@omnimail/shared";
import { api } from "./api";
import "./premium.css";

const formatDate = (value: string) => new Date(value).toLocaleString("vi-VN");
function openCheckout(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "pay.payos.vn")
    throw new Error("Địa chỉ thanh toán không hợp lệ.");
  window.location.assign(url.toString());
}
export function PremiumPage({ role }: { role: "basic" | "premium" }) {
  const client = useQueryClient();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const returnedCode = Number(params.get("orderCode"));
  const billing = useQuery({
    queryKey: ["premium-billing"],
    queryFn: api.premiumBilling,
    retry: false,
    refetchInterval: 30_000,
  });
  const request = useQuery({
    queryKey: ["upgrade-request"],
    queryFn: api.myUpgradeRequest,
    enabled: role === "basic",
    retry: false,
  });
  const manual = useMutation({
    mutationFn: api.requestUpgrade,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["upgrade-request"] }),
  });
  const checkout = useMutation({
    mutationFn: api.createPremiumCheckout,
    onSuccess: (order) => {
      void client.invalidateQueries({ queryKey: ["premium-billing"] });
      if (order.checkoutUrl) openCheckout(order.checkoutUrl);
    },
  });
  const orderCode =
    Number.isSafeInteger(returnedCode) && returnedCode > 0
      ? returnedCode
      : billing.data?.order?.orderCode;
  const verification = useQuery({
    queryKey: ["premium-payment", orderCode],
    queryFn: () => api.checkPremiumPayment(orderCode!),
    enabled: Boolean(orderCode && billing.data?.available),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING" ? 5_000 : false,
  });
  const order = verification.data ?? billing.data?.order;
  const expiresAt = billing.data?.premiumExpiresAt ?? order?.premiumExpiresAt;
  const active = Boolean(expiresAt && Date.parse(expiresAt) > now);
  const managed = billing.data?.managed === true;
  const pending =
    order?.status === "PENDING" && Date.parse(order.expiresAt) > now;
  const requestedAt = manual.data?.requestedAt ?? request.data?.requestedAt;
  const error =
    checkout.error ??
    verification.error ??
    billing.error ??
    manual.error ??
    request.error;
  useEffect(() => {
    if (verification.data?.status !== "PAID") return;
    void client.invalidateQueries({ queryKey: ["me"] });
    void client.invalidateQueries({ queryKey: ["premium-billing"] });
    void client.invalidateQueries({ queryKey: ["upgrade-request"] });
  }, [client, verification.data?.orderCode, verification.data?.status]);
  useEffect(() => {
    if (expiresAt && !active)
      void client.invalidateQueries({ queryKey: ["me"] });
  }, [client, expiresAt, active]);

  return (
    <main className="page-pane dashboard-page premium-page">
      <header className="premium-heading">
        <span>OMNIMAIL PREMIUM</span>
        <h1>
          {active || managed ? "Gói Premium của bạn" : "Nâng cấp lên Premium"}
        </h1>
        <p>
          Nhận quyền xem các mailbox được Admin chia sẻ, trong cùng không gian
          OmniMail quen thuộc.
        </p>
      </header>
      <div className="premium-grid">
        <section className="premium-plan" aria-labelledby="premium-plan-title">
          <span className="premium-plan-label">
            <ShieldCheck size={17} /> PREMIUM ACCESS
          </span>
          <h2 id="premium-plan-title">Thêm quyền cộng tác.</h2>
          <p className="premium-price">
            {PREMIUM_MONTHLY_PRICE_VND.toLocaleString("vi-VN")}
            <span>₫ / tháng</span>
          </p>
          <p className="premium-payment-note">
            Thanh toán từng tháng qua PayOS. Không tự động trừ tiền.
          </p>
          <ul>
            <li>
              <Check /> Giữ nguyên mailbox cá nhân và Temp Mail
            </li>
            <li>
              <Check /> Xem mailbox được Admin cấp quyền
            </li>
            <li>
              <Check /> Đọc và tìm thư trong mailbox được chia sẻ
            </li>
          </ul>
          <div className="premium-membership" role="status">
            {managed ? (
              <>
                <strong>Premium do Admin cấp</strong>
                <span>
                  Bạn đã có quyền Premium và không cần thanh toán gói này.
                </span>
              </>
            ) : active ? (
              <>
                <strong>Premium đang hoạt động</strong>
                <span>
                  Có hiệu lực đến {formatDate(expiresAt!)}. Gia hạn sớm sẽ cộng
                  thêm một tháng từ ngày hết hạn.
                </span>
              </>
            ) : expiresAt ? (
              <>
                <strong>Gói Premium đã hết hạn</strong>
                <span>
                  Gói trước kết thúc lúc {formatDate(expiresAt)}. Thanh toán để
                  mở lại Premium một tháng.
                </span>
              </>
            ) : (
              <>
                <strong>Một lần thanh toán, một tháng Premium</strong>
                <span>
                  Thời hạn bắt đầu khi hệ thống xác nhận đã nhận đủ tiền. Quyền
                  mailbox cụ thể do Admin cấp.
                </span>
              </>
            )}
          </div>
          {!managed && (
            <>
              <button
                className="premium-pay-button"
                type="button"
                disabled={
                  billing.isPending ||
                  !billing.data?.available ||
                  checkout.isPending ||
                  verification.isFetching
                }
                onClick={() =>
                  pending && order?.checkoutUrl
                    ? openCheckout(order.checkoutUrl)
                    : checkout.mutate()
                }
              >
                {checkout.isPending ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <CreditCard size={18} />
                )}
                {checkout.isPending
                  ? "Đang tạo thanh toán…"
                  : pending && order?.checkoutUrl
                    ? "Tiếp tục thanh toán PayOS"
                    : active
                      ? "Gia hạn — 2.000₫ / tháng"
                      : "Thanh toán 2.000₫ qua PayOS"}
                <ArrowUpRight size={18} />
              </button>
              {!billing.isPending && billing.data?.available === false && (
                <p className="premium-unavailable">
                  Thanh toán chưa được mở. Bạn vẫn có thể gửi yêu cầu nâng cấp
                  cho Admin.
                </p>
              )}
            </>
          )}
          {error && (
            <p className="premium-error" role="alert">
              {error.message}
            </p>
          )}
        </section>
        <aside className="premium-details">
          {order && (
            <section
              className="premium-order"
              aria-labelledby="premium-order-title"
            >
              <span>THANH TOÁN CỦA BẠN</span>
              <h2 id="premium-order-title">
                {order.status === "PAID"
                  ? "Đã xác nhận thanh toán"
                  : order.status === "CANCELLED"
                    ? "Thanh toán đã hủy"
                    : order.status === "EXPIRED"
                      ? "Link thanh toán đã hết hạn"
                      : "Đang chờ thanh toán"}
              </h2>
              <p>
                Mã đơn: <strong>{order.orderCode}</strong>
              </p>
              <p>
                {order.status === "PAID"
                  ? "Premium đã được cập nhật cho tài khoản của bạn."
                  : "Nếu đã chuyển tiền, hãy đợi hệ thống xác nhận và kiểm tra lại trước khi tạo thanh toán mới."}
              </p>
              <button
                type="button"
                disabled={!billing.data?.available || verification.isFetching}
                onClick={() => void verification.refetch()}
              >
                <RefreshCw
                  size={15}
                  className={verification.isFetching ? "spin" : ""}
                />{" "}
                Kiểm tra thanh toán
              </button>
            </section>
          )}
          <section className="premium-how">
            <span>BA BƯỚC ĐỂ BẮT ĐẦU</span>
            <ol>
              <li>
                <b>01</b>
                <div>
                  <strong>Mở trang PayOS</strong>
                  <p>
                    Kiểm tra đúng số tiền 2.000₫ và nội dung chuyển khoản của
                    đơn hàng.
                  </p>
                </div>
              </li>
              <li>
                <b>02</b>
                <div>
                  <strong>Thanh toán và xác nhận</strong>
                  <p>
                    Hệ thống kiểm tra giao dịch với PayOS và tự kích hoạt
                    Premium một tháng.
                  </p>
                </div>
              </li>
              <li>
                <b>03</b>
                <div>
                  <strong>Theo dõi và gia hạn</strong>
                  <p>
                    Quay lại trang này để xem hạn sử dụng. Hết hạn, tài khoản
                    trở về Basic; mailbox cá nhân được giữ nguyên.
                  </p>
                </div>
              </li>
            </ol>
          </section>
          {role === "basic" && !active && (
            <section className="premium-manual">
              <h2>Cần Admin hỗ trợ?</h2>
              <p>Bạn cũng có thể gửi yêu cầu để Admin xem xét cấp Premium.</p>
              <button
                type="button"
                disabled={
                  request.isPending || manual.isPending || Boolean(requestedAt)
                }
                onClick={() => manual.mutate()}
              >
                {manual.isPending
                  ? "Đang gửi…"
                  : requestedAt
                    ? "Đã gửi yêu cầu"
                    : "Yêu cầu Admin nâng cấp"}
              </button>
              {requestedAt && (
                <small>Đã gửi lúc {formatDate(requestedAt)}.</small>
              )}
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
