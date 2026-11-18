import {
  ArrowUp,
  Facebook,
  Github,
  Globe,
  Instagram,
  Inbox,
  Link2,
  Mail,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { CubeCluster3D } from "./CubeCluster3D";
import { SiteHeader, type SiteHeaderProps } from "./SiteHeader";
import "./home-landing.css";
import "./bubble-hero.css";

function LandingPushPin({
  tone,
}: {
  tone: "blue" | "mint" | "amber" | "violet";
}) {
  return (
    <span
      className={`landing-pin landing-pin--${tone}`}
      aria-hidden="true"
    >
      <i className="landing-pin-shadow" />
      <i className="landing-pin-base" />
      <i className="landing-pin-stem" />
      <i className="landing-pin-head" />
    </span>
  );
}

function IsometricCube({
  x,
  y,
  size = 24,
  top,
  left,
  right,
  shadow,
}: {
  x: number;
  y: number;
  size?: number;
  top: string;
  left: string;
  right: string;
  shadow: string;
}) {
  const dx = size * 0.866;
  const dy = size * 0.5;
  const h = size;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <polygon
        points={`7,${dy * 2 + h + 5} ${dx + 7},${dy + h + 5} 7,${h + 5} ${-dx + 7},${dy + h + 5}`}
        fill={shadow}
      />
      <polygon
        points={`0,0 ${dx},${dy} 0,${dy * 2} ${-dx},${dy}`}
        fill={top}
        stroke="#162535"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <polygon
        points={`${-dx},${dy} 0,${dy * 2} 0,${dy * 2 + h} ${-dx},${dy + h}`}
        fill={left}
        stroke="#162535"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <polygon
        points={`0,${dy * 2} ${dx},${dy} ${dx},${dy + h} 0,${dy * 2 + h}`}
        fill={right}
        stroke="#162535"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </g>
  );
}

function LandingCubeCluster({
  variant,
}: {
  variant: "features" | "steps" | "faq" | "start" | "hero-left" | "hero-right";
}) {
  if (variant === "hero-left") {
    return (
      <svg
        className="landing-cubes hero-cubes hero-cubes--left"
        viewBox="0 0 132 110"
        width="132"
        height="110"
        aria-hidden="true"
      >
        <IsometricCube
          x={40}
          y={44}
          size={22}
          top="#dfedfa"
          left="#9cc0ea"
          right="#315e97"
          shadow="#cfdce8"
        />
        <IsometricCube
          x={84}
          y={14}
          size={24}
          top="#e9e5ff"
          left="#b9adfb"
          right="#674cfb"
          shadow="#d5cff5"
        />
      </svg>
    );
  }
  if (variant === "hero-right") {
    return (
      <svg
        className="landing-cubes hero-cubes hero-cubes--right"
        viewBox="0 0 132 110"
        width="132"
        height="110"
        aria-hidden="true"
      >
        <IsometricCube
          x={46}
          y={16}
          size={23}
          top="#fff4d6"
          left="#f1d286"
          right="#c49234"
          shadow="#e7dec1"
        />
        <IsometricCube
          x={88}
          y={46}
          size={21}
          top="#e8f5ef"
          left="#9cd8c2"
          right="#226d5c"
          shadow="#cde6db"
        />
      </svg>
    );
  }
  if (variant === "features") {
    return (
      <svg
        className="landing-cubes landing-cubes--features"
        viewBox="0 0 156 108"
        width="156"
        height="108"
        aria-hidden="true"
      >
        <IsometricCube
          x={44}
          y={28}
          size={24}
          top="#dfedfa"
          left="#9ec2ec"
          right="#5381bd"
          shadow="#cfdce8"
        />
        <IsometricCube
          x={108}
          y={24}
          size={22}
          top="#fff4d6"
          left="#f1d286"
          right="#c49234"
          shadow="#e7dec1"
        />
        <IsometricCube
          x={76}
          y={4}
          size={26}
          top="#e9e5ff"
          left="#b9adfb"
          right="#674cfb"
          shadow="#d5cff5"
        />
      </svg>
    );
  }
  if (variant === "steps") {
    return (
      <svg
        className="landing-cubes landing-cubes--steps"
        viewBox="0 0 164 88"
        width="164"
        height="88"
        aria-hidden="true"
      >
        <IsometricCube
          x={32}
          y={26}
          size={20}
          top="#dfedfa"
          left="#a2c5ed"
          right="#315e97"
          shadow="#d5e1ec"
        />
        <IsometricCube
          x={82}
          y={14}
          size={22}
          top="#e9e5ff"
          left="#b9adfb"
          right="#674cfb"
          shadow="#d8d1f7"
        />
        <IsometricCube
          x={132}
          y={24}
          size={20}
          top="#e8f5ef"
          left="#9cd8c2"
          right="#226d5c"
          shadow="#cde6db"
        />
      </svg>
    );
  }
  if (variant === "faq") {
    return (
      <svg
        className="landing-cubes landing-cubes--faq"
        viewBox="0 0 116 92"
        width="116"
        height="92"
        aria-hidden="true"
      >
        <IsometricCube
          x={40}
          y={22}
          size={22}
          top="#e8f5ef"
          left="#9fd8c3"
          right="#226d5c"
          shadow="#d1e6dd"
        />
        <IsometricCube
          x={78}
          y={8}
          size={24}
          top="#e9e5ff"
          left="#b9adfb"
          right="#674cfb"
          shadow="#d8d1f7"
        />
      </svg>
    );
  }
  return (
    <svg
      className="landing-cubes landing-cubes--start"
      viewBox="0 0 104 96"
      width="104"
      height="96"
      aria-hidden="true"
    >
      <IsometricCube
        x={52}
        y={14}
        size={28}
        top="#fff4d6"
        left="#eed083"
        right="#c59436"
        shadow="#e2d9bd"
      />
    </svg>
  );
}

export function HomeLanding({
  onSearchMail,
  ...header
}: SiteHeaderProps & { onSearchMail?: (value: string) => void }) {
  const navigate = useNavigate();
  const member = header.mode === "member";
  const pending = header.mode === "unverified";
  const startPath = member
    ? "/app/mailboxes"
    : pending
      ? "/verify-email"
      : "/register";
  return (
    <div className="home-landing">
      <div className="poster-home original-home bubble-home">
        <SiteHeader {...header} variant="home" />
        <main className="bubble-hero" aria-labelledby="home-title">
          <span className="bubble-word" aria-hidden="true">
            CONNECT
          </span>
          <div className="hero-illustration" aria-hidden="true">
            <img
              src="/illustrations/marketing.svg"
              width="512"
              height="512"
              alt=""
              draggable={false}
            />
          </div>
          <div className="hero-provider-icons" aria-hidden="true">
            <img
              className="hero-provider-icon hero-provider-icon--facebook"
              src="/icons/facebook-3d.webp"
              width="512"
              height="512"
              alt=""
              draggable={false}
            />
            <img
              className="hero-provider-icon hero-provider-icon--instagram"
              src="/icons/instagram-3d.webp"
              width="512"
              height="512"
              alt=""
              draggable={false}
            />
            <img
              className="hero-provider-icon hero-provider-icon--outlook"
              src="/icons/outlook-3d.webp"
              width="512"
              height="512"
              alt=""
              draggable={false}
            />
            <img
              className="hero-provider-icon hero-provider-icon--gmail"
              src="/icons/gmail-3d.webp"
              width="512"
              height="512"
              alt=""
              draggable={false}
            />
          </div>
          <section className="bubble-copy">
            <h1 id="home-title">
              <span>Every inbox.</span> <em>One signal.</em>
            </h1>
            <p>Gmail, Outlook and temporary mail in one focused workspace.</p>
            <form
              className="bubble-mail-search"
              onSubmit={(event) => {
                event.preventDefault();
                const input =
                  event.currentTarget.elements.namedItem("mailQuery");
                if (member)
                  onSearchMail?.(
                    input instanceof HTMLInputElement ? input.value : "",
                  );
                else navigate(pending ? "/verify-email" : "/login");
              }}
            >
              <input
                name="mailQuery"
                inputMode="email"
                placeholder="Enter mailbox email address"
                aria-label="Search mailbox by email address"
              />
              <button className="poster-copy-action" type="submit">
                <span>Open mailbox</span>
                <b aria-hidden="true">→</b>
              </button>
            </form>
          </section>
          <span className="poster-side-label">READ · REFRESH · REPEAT</span>
          <LandingCubeCluster variant="hero-left" />
          <LandingCubeCluster variant="hero-right" />
          <nav className="poster-socials" aria-label="Mạng xã hội">
            <a
              href="https://www.facebook.com/zingne1302"
              target="_blank"
              rel="noreferrer"
              aria-label="Facebook của Hữu Hưng"
            >
              <Facebook aria-hidden="true" />
            </a>
            <a
              href="https://www.instagram.com/huuhungstart/"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram của Hữu Hưng"
            >
              <Instagram aria-hidden="true" />
            </a>
            <a
              className="hero-github-link"
              href="https://github.com/NguyenHuuHung-Dev"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
            >
              <Github />
            </a>
          </nav>
        </main>
      </div>

      <div className="landing-content">
        <section
          className="landing-features"
          aria-labelledby="landing-features-title"
        >
          <header className="landing-section-heading landing-features-heading">
            <div className="landing-heading-main">
              <h2 id="landing-features-title">
                Ít tab hơn.
                <br />
                <em>Nhiều tập trung hơn.</em>
              </h2>
            </div>
            <div className="landing-heading-aside">
              <LandingCubeCluster variant="features" />
              <p>
                Những công cụ bạn cần, cùng xuất hiện trong một không gian quen
                thuộc.
              </p>
            </div>
          </header>
          <div className="landing-feature-board">
            <svg
              className="landing-pin-trail landing-pin-trail--features"
              viewBox="0 0 1200 180"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M 190 48 C 340 135, 460 142, 600 72 C 745 6, 865 24, 1010 56" />
            </svg>
            <div className="landing-feature-grid">
              <article className="landing-feature-card landing-feature-card--connect">
                <LandingPushPin tone="blue" />
                <div className="landing-feature-inner">
                  <div className="landing-feature-head">
                    <span className="landing-feature-index">01</span>
                    <i className="landing-feature-pip" aria-hidden="true" />
                  </div>
                  <div
                    className="landing-feature-art feature-inboxes"
                    aria-hidden="true"
                  >
                    <div>
                      <span className="feature-icon-well">
                        <img src="/icons/gmail-3d.webp" alt="" />
                      </span>
                      <span className="feature-skeleton-lines">
                        <i />
                        <i />
                      </span>
                      <span className="feature-inbox-box">
                        <Inbox />
                      </span>
                    </div>
                    <div>
                      <span className="feature-icon-well">
                        <img src="/icons/outlook-3d.webp" alt="" />
                      </span>
                      <span className="feature-skeleton-lines">
                        <i />
                        <i />
                      </span>
                      <span className="feature-inbox-box">
                        <Inbox />
                      </span>
                    </div>
                    <b>ONE INBOX. ALL CONNECTED.</b>
                  </div>
                  <div className="landing-feature-body">
                    <h3>Gmail & Outlook</h3>
                    <p>
                      Kết nối các hộp thư bạn đang sử dụng. Chuyển giữa tài
                      khoản, đọc và tìm thư trong cùng một giao diện.
                    </p>
                  </div>
                  <Link className="landing-feature-link" to="/app/connect">
                    <span>Kết nối hộp thư</span>
                    <span className="landing-square-arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </div>
              </article>
              <article className="landing-feature-card landing-feature-card--temp">
                <LandingPushPin tone="mint" />
                <div className="landing-feature-inner">
                  <div className="landing-feature-head">
                    <span className="landing-feature-index">02</span>
                    <i className="landing-feature-pip" aria-hidden="true" />
                  </div>
                  <div
                    className="landing-feature-art feature-temporary"
                    aria-hidden="true"
                  >
                    <span className="feature-timer-box">
                      <Timer />
                    </span>
                    <span>Ready when you are.</span>
                    <div>
                      <i /> your-next-inbox@mail.tm
                    </div>
                  </div>
                  <div className="landing-feature-body">
                    <h3>Một địa chỉ tạm thời</h3>
                    <p>
                      Tạo Temp Mail cho những nhu cầu ngắn hạn. Nhận thư và theo
                      dõi nội dung ngay trong OmniMail.
                    </p>
                  </div>
                  <Link className="landing-feature-link" to="/app/temp-mail">
                    <span>Khám phá Temp Mail</span>
                    <span className="landing-square-arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </div>
              </article>
              <article className="landing-feature-card landing-feature-card--share">
                <LandingPushPin tone="amber" />
                <div className="landing-feature-inner">
                  <div className="landing-feature-head">
                    <span className="landing-feature-index">03</span>
                    <i className="landing-feature-pip" aria-hidden="true" />
                  </div>
                  <div
                    className="landing-feature-art feature-sharing"
                    aria-hidden="true"
                  >
                    <div>
                      <span>YOU</span>
                      <span className="feature-link-node">
                        <Link2 />
                      </span>
                      <span>TEAM</span>
                    </div>
                    <b>
                      <ShieldCheck /> Read-only access
                    </b>
                  </div>
                  <div className="landing-feature-body">
                    <h3>Chia sẻ có kiểm soát</h3>
                    <p>
                      Cấp quyền xem hộp thư hoặc chia sẻ một tin nhắn. Theo dõi
                      quyền truy cập và thu hồi khi không còn cần thiết.
                    </p>
                  </div>
                  <Link className="landing-feature-link" to="/app/mail-sharing">
                    <span>Tìm hiểu chia sẻ</span>
                    <span className="landing-square-arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="landing-how" aria-labelledby="landing-how-title">
          <div className="landing-how-inner">
            <div className="landing-section-heading landing-how-intro">
              <h2 id="landing-how-title">
                Kết nối một lần.
                <br />
                <em>Theo dõi ở một nơi.</em>
              </h2>
              <div className="landing-how-actions">
                <Link className="landing-button home-primary" to={startPath}>
                  <span>
                    {member
                      ? "Mở Mailboxes"
                      : pending
                        ? "Tiếp tục xác minh"
                        : "Tạo tài khoản miễn phí"}
                  </span>
                  <span className="landing-button-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
                <LandingCubeCluster variant="steps" />
              </div>
            </div>
            <div className="landing-steps-board">
              <svg
                className="landing-pin-trail landing-pin-trail--steps"
                viewBox="0 0 480 460"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d="M 185 88 C 330 98, 365 162, 295 215 C 215 268, 120 302, 185 375" />
              </svg>
              <ol>
                <li>
                  <LandingPushPin tone="blue" />
                  <div className="landing-step-inner">
                    <span>01</span>
                    <div>
                      <h3>Tạo tài khoản và xác minh email</h3>
                      <p>
                        Bắt đầu bằng email của bạn, rồi mở liên kết xác minh
                        trong hộp thư.
                      </p>
                    </div>
                  </div>
                </li>
                <li>
                  <LandingPushPin tone="violet" />
                  <div className="landing-step-inner">
                    <span>02</span>
                    <div>
                      <h3>Kết nối hộp thư</h3>
                      <p>
                        Thêm Gmail, Outlook hoặc tạo một địa chỉ Temp Mail theo
                        nhu cầu.
                      </p>
                    </div>
                  </div>
                </li>
                <li>
                  <LandingPushPin tone="amber" />
                  <div className="landing-step-inner">
                    <span>03</span>
                    <div>
                      <h3>Mở thư, tìm kiếm, chia sẻ</h3>
                      <p>
                        Chọn mailbox để đọc thư và quản lý quyền xem trong cùng
                        một không gian.
                      </p>
                    </div>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section className="landing-faq" aria-labelledby="landing-faq-title">
          <header className="landing-section-heading landing-faq-intro">
            <h2 id="landing-faq-title">Trước khi bắt đầu.</h2>
            <p className="landing-faq-note">
              Những câu hỏi thường gặp về xác minh tài khoản, đồng bộ hộp thư và
              quyền chia sẻ.
            </p>
            <LandingCubeCluster variant="faq" />
          </header>
          <div className="landing-faq-grid">
            <details>
              <summary>
                <span>Tài khoản mới có cần xác minh email không?</span>
              </summary>
              <p>
                Có. Sau khi đăng ký, bạn cần mở liên kết xác minh được gửi tới
                email trước khi sử dụng các tính năng hộp thư.
              </p>
            </details>
            <details>
              <summary>
                <span>Ngắt kết nối có xóa thư gốc của tôi không?</span>
              </summary>
              <p>
                Không. Ngắt kết nối Gmail hoặc Outlook chỉ gỡ kết nối khỏi
                OmniMail; thư gốc vẫn ở nhà cung cấp của bạn.
              </p>
            </details>
            <details>
              <summary>
                <span>Người được chia sẻ có thể sửa hộp thư không?</span>
              </summary>
              <p>
                Quyền chia sẻ trong OmniMail là quyền xem. Bạn có thể thu hồi
                quyền truy cập khi không còn cần thiết.
              </p>
            </details>
          </div>
        </section>

        <section className="landing-start">
          <div className="landing-start-stage">
            <LandingCubeCluster variant="start" />
            <div className="landing-start-frame">
              <LandingPushPin tone="violet" />
              <div className="landing-start-body">
                <h2>
                  Mọi hộp thư.
                  <br />
                  <em>Một nơi để bắt đầu.</em>
                </h2>
                <div className="landing-start-actions">
                  <Link className="landing-button" to={startPath}>
                    <span>
                      {member
                        ? "Vào hộp thư"
                        : pending
                          ? "Xác minh email"
                          : "Bắt đầu với OmniMail"}
                    </span>
                    <span className="landing-button-arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                  {!member && !pending && (
                    <Link className="landing-signin" to="/login">
                      Đã có tài khoản? Đăng nhập ↗
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
        <footer className="landing-footer">
          <div className="landing-footer-inner">
            <div className="landing-footer-top">
              <div className="landing-footer-about">
                <Link to="/" className="landing-footer-brand">
                  <img src="/logo.png" width="28" height="28" alt="" />
                  <span>
                    OmniMail<span>.</span>
                  </span>
                </Link>
                <span className="landing-footer-kicker">
                  EVERY INBOX · ONE SIGNAL
                </span>
                <p className="landing-footer-desc">
                  Không gian đọc và quản lý tập trung cho Gmail, Microsoft
                  Outlook và email tạm thời mail.tm — giúp bạn theo dõi nhiều
                  hộp thư, lấy mã OTP nhanh và chia sẻ quyền xem an toàn trong
                  một cửa sổ gọn gàng.
                </p>
                <ul
                  className="landing-footer-badges"
                  aria-label="Nền tảng và chế độ hỗ trợ"
                >
                  <li>Gmail OAuth &amp; App Password</li>
                  <li>Outlook / Azure</li>
                  <li>mail.tm Temp Mail</li>
                  <li>Chỉ đọc an toàn</li>
                </ul>
                <div className="landing-footer-contact">
                  <span>
                    <Mail size={14} aria-hidden="true" />
                    Liên hệ:{" "}
                    <a href="mailto:hung130225qn@gmail.com">
                      hung130225qn@gmail.com
                    </a>
                  </span>
                  <span>
                    <Globe size={14} aria-hidden="true" />
                    Portfolio:{" "}
                    <a
                      href="https://lazingday.me"
                      target="_blank"
                      rel="noreferrer"
                    >
                      lazingday.me ↗
                    </a>
                  </span>
                  <small>
                    Thao tác ngắt kết nối hoặc thu hồi quyền không bao giờ xóa
                    thư gốc tại nhà cung cấp email.
                  </small>
                </div>
              </div>

              <nav
                className="landing-footer-col"
                aria-label="Tính năng OmniMail"
              >
                <h3>Không gian hộp thư</h3>
                <ul>
                  <li>
                    <Link to="/app/mailboxes">Hộp thư hợp nhất</Link>
                    <small>
                      Đọc Gmail &amp; Outlook dạng danh sách 2 dòng rõ ràng,
                      tách riêng Thư chính và Spam.
                    </small>
                  </li>
                  <li>
                    <Link to="/app/connect">Kết nối tài khoản</Link>
                    <small>
                      Thêm nhiều tài khoản qua Google OAuth 2.0, App Password 16
                      ký tự hoặc Refresh Token.
                    </small>
                  </li>
                  <li>
                    <Link to="/app/temp-mail">Email tạm thời</Link>
                    <small>
                      Tạo nhanh hộp thư dùng một lần mail.tm và tự động làm mới
                      thư mới mỗi 3 giây.
                    </small>
                  </li>
                  <li>
                    <Link to="/app/mail-sharing">Chia sẻ có kiểm soát</Link>
                    <small>
                      Chia sẻ riêng từng thư hoặc quyền xem mailbox theo tài
                      khoản chỉ đọc.
                    </small>
                  </li>
                </ul>
              </nav>

              <nav
                className="landing-footer-col"
                aria-label="Tài khoản và hướng dẫn"
              >
                <h3>Tài khoản &amp; Bắt đầu</h3>
                <ul>
                  <li>
                    <Link to="/login">Truy cập tài khoản</Link>
                    <small>
                      Đăng nhập bằng email hoặc Google, Facebook, Microsoft để
                      tiếp tục làm việc.
                    </small>
                  </li>
                  <li>
                    <Link to="/register">Đăng ký miễn phí</Link>
                    <small>
                      Khởi tạo tài khoản OmniMail Basic, xác minh email nhanh và
                      kết nối hộp thư đầu tiên.
                    </small>
                  </li>
                  <li>
                    <Link to="/forgot-password">Khôi phục mật khẩu</Link>
                    <small>
                      Nhận liên kết đặt lại mật khẩu an toàn trực tiếp tới email
                      đăng ký.
                    </small>
                  </li>
                  <li>
                    <Link to="/app/mail-admin">Gói OmniMail Premium</Link>
                    <small>
                      Tự động tách mã OTP, ghim nhóm hộp thư riêng và mở khóa
                      chia sẻ mailbox.
                    </small>
                  </li>
                </ul>
              </nav>

              <div className="landing-footer-col landing-footer-col--trust">
                <nav aria-label="Thông tin OmniMail">
                  <h3>Bảo mật &amp; Minh bạch</h3>
                  <ul>
                    <li>
                      <Link to="/security">Bảo mật</Link>
                      <small>
                        Kết nối HTTPS, mã hóa thông tin nhạy cảm ở máy chủ và
                        xác thực lại quyền trên từng yêu cầu API.
                      </small>
                    </li>
                    <li>
                      <Link to="/privacy">Quyền riêng tư</Link>
                      <small>
                        Minh bạch phạm vi dữ liệu đồng bộ, tìm kiếm và cơ chế
                        ngắt kết nối chủ động.
                      </small>
                    </li>
                  </ul>
                </nav>

                <div className="landing-footer-trust-card">
                  <div className="landing-footer-trust-head">
                    <ShieldCheck size={16} aria-hidden="true" />
                    <strong>Nguyên tắc chỉ đọc</strong>
                    <CubeCluster3D variant="badge" />
                  </div>
                  <p>
                    OmniMail ưu tiên bảo toàn hộp thư gốc của bạn: không tự động
                    gửi thư hay xóa email trên Gmail và Outlook, đồng thời cho
                    phép thu hồi quyền chia sẻ ngay lập tức.
                  </p>
                </div>
              </div>
            </div>

            <div className="landing-footer-bottom">
              <div className="landing-footer-copy">
                <small>© 2026 OmniMail. Mọi quyền được bảo lưu.</small>
                <span>Nền tảng đọc &amp; quản lý đa hộp thư tập trung.</span>
              </div>
              <div className="landing-footer-bottom-meta">
                <a
                  href="https://lazingday.me"
                  target="_blank"
                  rel="noreferrer"
                >
                  lazingday.me ↗
                </a>
                <a href="mailto:hung130225qn@gmail.com">
                  hung130225qn@gmail.com
                </a>
                <Link to="/app/accounts">Danh bạ mailbox</Link>
                <button
                  type="button"
                  className="landing-footer-top-btn"
                  onClick={() =>
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }
                >
                  <ArrowUp size={14} aria-hidden="true" />
                  <span>Về đầu trang</span>
                </button>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
