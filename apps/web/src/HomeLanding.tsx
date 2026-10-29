import {
  ArrowRight,
  Facebook,
  Github,
  Instagram,
  Inbox,
  ShieldCheck,
  AtSign,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { SiteHeader, type SiteHeaderProps } from "./SiteHeader";
import "./home-landing.css";

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
      <div className="poster-home original-home">
        <SiteHeader {...header} variant="home" />
        <main className="poster-stage" aria-labelledby="home-title">
          <section className="poster-copy">
            <div className="poster-copy-label">
              <strong>Live mail</strong>
              <i />
              <span>Unified inbox</span>
            </div>
            <h1 id="home-title">
              <span>Every inbox.</span>
              <br />
              <em>One signal.</em>
            </h1>
            <p>Gmail, Outlook and temporary mail in one focused workspace.</p>
            <form
              className="poster-mail-search"
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
          <figure
            className="poster-product"
            aria-label="OmniMail unified inbox"
          >
            <img
              src="/homepage-760.png"
              width="760"
              height="1187"
              alt="OmniMail character"
              fetchPriority="high"
            />
          </figure>
          <span className="poster-side-label">READ · REFRESH · REPEAT</span>
          <div className="poster-socials">
            <a
              href="https://www.facebook.com/zingne1302"
              target="_blank"
              rel="noreferrer"
              aria-label="Facebook của Hữu Hưng"
            >
              <Facebook />
            </a>
            <a
              href="https://www.instagram.com/huuhungstart/"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram của Hữu Hưng"
            >
              <Instagram />
            </a>
            <a
              href="https://github.com/NguyenHuuHung-Dev"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
            >
              <Github />
            </a>
          </div>
        </main>
      </div>

      <div className="landing-content">
        <section
          className="landing-features"
          aria-labelledby="landing-features-title"
        >
          <header className="landing-section-heading">
            <span>ONE WORKSPACE. EVERY INBOX.</span>
            <h2 id="landing-features-title">
              Ít tab hơn.
              <br />
              <em>Nhiều tập trung hơn.</em>
            </h2>
            <p>
              Những công cụ bạn cần, cùng xuất hiện trong một không gian quen
              thuộc.
            </p>
          </header>
          <div className="landing-feature-grid">
            <article>
              <span className="landing-feature-number">01 / CONNECT</span>
              <Inbox />
              <h3>Gmail & Outlook</h3>
              <p>
                Kết nối các hộp thư bạn đang sử dụng. Chuyển giữa tài khoản, đọc
                và tìm thư trong cùng một giao diện.
              </p>
              <Link to="/app/connect">
                Kết nối hộp thư <ArrowRight size={16} />
              </Link>
            </article>
            <article>
              <span className="landing-feature-number">02 / TEMPORARY</span>
              <AtSign />
              <h3>Một địa chỉ tạm thời</h3>
              <p>
                Tạo Temp Mail cho những nhu cầu ngắn hạn. Nhận thư và theo dõi
                nội dung ngay trong OmniMail.
              </p>
              <Link to="/app/temp-mail">
                Khám phá Temp Mail <ArrowRight size={16} />
              </Link>
            </article>
            <article>
              <span className="landing-feature-number">03 / SHARE</span>
              <ShieldCheck />
              <h3>Chia sẻ có kiểm soát</h3>
              <p>
                Cấp quyền xem hộp thư hoặc chia sẻ một tin nhắn. Theo dõi quyền
                truy cập và thu hồi khi không còn cần thiết.
              </p>
              <Link to="/app/mail-sharing">
                Tìm hiểu chia sẻ <ArrowRight size={16} />
              </Link>
            </article>
          </div>
        </section>

        <section className="landing-how" aria-labelledby="landing-how-title">
          <div className="landing-section-heading">
            <span>GET STARTED</span>
            <h2 id="landing-how-title">
              Kết nối một lần.
              <br />
              <em>Theo dõi ở một nơi.</em>
            </h2>
            <Link className="landing-button home-primary" to={startPath}>
              {member
                ? "Mở Mailboxes"
                : pending
                  ? "Tiếp tục xác minh"
                  : "Tạo tài khoản miễn phí"}
              <ArrowRight size={18} />
            </Link>
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h3>Tạo tài khoản và xác minh email</h3>
                <p>
                  Bắt đầu bằng email của bạn, rồi mở liên kết xác minh trong hộp
                  thư.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Kết nối hộp thư</h3>
                <p>
                  Thêm Gmail, Outlook hoặc tạo một địa chỉ Temp Mail theo nhu
                  cầu.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Mở thư, tìm kiếm, chia sẻ</h3>
                <p>
                  Chọn mailbox để đọc thư và quản lý quyền xem trong cùng một
                  không gian.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className="landing-faq" aria-labelledby="landing-faq-title">
          <header className="landing-section-heading">
            <span>A FEW THINGS TO KNOW</span>
            <h2 id="landing-faq-title">Trước khi bắt đầu.</h2>
          </header>
          <div>
            <details>
              <summary>Tài khoản mới có cần xác minh email không?</summary>
              <p>
                Có. Sau khi đăng ký, bạn cần mở liên kết xác minh được gửi tới
                email trước khi sử dụng các tính năng hộp thư.
              </p>
            </details>
            <details>
              <summary>Ngắt kết nối có xóa thư gốc của tôi không?</summary>
              <p>
                Không. Ngắt kết nối Gmail hoặc Outlook chỉ gỡ kết nối khỏi
                OmniMail; thư gốc vẫn ở nhà cung cấp của bạn.
              </p>
            </details>
            <details>
              <summary>Người được chia sẻ có thể sửa hộp thư không?</summary>
              <p>
                Quyền chia sẻ trong OmniMail là quyền xem. Bạn có thể thu hồi
                quyền truy cập khi không còn cần thiết.
              </p>
            </details>
          </div>
        </section>

        <section className="landing-start">
          <span>LESS NOISE. MORE FOCUS.</span>
          <h2>
            Mọi hộp thư.
            <br />
            <em>Một nơi để bắt đầu.</em>
          </h2>
          <div>
            <Link className="landing-button" to={startPath}>
              {member
                ? "Vào hộp thư"
                : pending
                  ? "Xác minh email"
                  : "Bắt đầu với OmniMail"}
              <ArrowRight size={18} />
            </Link>
            {!member && !pending && (
              <Link className="landing-signin" to="/login">
                Đã có tài khoản? Đăng nhập ↗
              </Link>
            )}
          </div>
        </section>
        <footer className="landing-footer">
          <Link to="/" className="landing-footer-brand">
            OmniMail<span>.</span>
          </Link>
          <span>Every inbox. One signal.</span>
          <nav aria-label="Thông tin OmniMail">
            <Link to="/security">Bảo mật</Link>
            <Link to="/privacy">Quyền riêng tư</Link>
          </nav>
          <small>© 2026 OmniMail</small>
        </footer>
      </div>
    </div>
  );
}
