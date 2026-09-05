import {
  ArrowRight,
  Eye,
  Inbox,
  LockKeyhole,
  Mail,
  Search,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { omnimailSchema, Seo } from "./Seo";

const features = [
  {
    icon: Inbox,
    title: "Một hộp thư tập trung",
    copy: "Theo dõi Gmail, Outlook và email tạm thời trong cùng một không gian làm việc.",
  },
  {
    icon: Search,
    title: "Tìm kiếm nhanh",
    copy: "Lọc thư theo tài khoản và tìm đúng cuộc hội thoại mà không phải đổi qua nhiều tab.",
  },
  {
    icon: Eye,
    title: "Trải nghiệm chỉ đọc",
    copy: "OmniMail tập trung vào đọc, theo dõi và chia sẻ quyền xem thay vì gửi thư thay bạn.",
  },
  {
    icon: ShieldCheck,
    title: "Phân quyền rõ ràng",
    copy: "Vai trò Basic, Premium và Admin giúp giới hạn dữ liệu theo đúng nhu cầu sử dụng.",
  },
  {
    icon: Mail,
    title: "Email tạm thời",
    copy: "Tạo địa chỉ tạm và nhận thư trực tiếp khi cần đăng ký hoặc kiểm thử nhanh.",
  },
  {
    icon: Zap,
    title: "Đồng bộ thuận tiện",
    copy: "Làm mới mailbox từ một giao diện thống nhất, tối ưu cho cả máy tính và điện thoại.",
  },
];

export function PublicHome() {
  return (
    <div className="public-home">
      <Seo
        title="OmniMail – Quản lý Gmail, Outlook và email tạm thời"
        description="OmniMail giúp bạn đọc và quản lý Gmail, Outlook cùng email tạm thời trong một giao diện tập trung, bảo mật và dễ sử dụng."
        schema={omnimailSchema}
      />
      <header className="public-nav">
        <Link className="public-brand" to="/" aria-label="Trang chủ OmniMail">
          <img src="/logo.jpg" width="40" height="42" alt="Logo OmniMail" />
          <strong>OmniMail</strong>
          <span>.</span>
        </Link>
        <nav aria-label="Điều hướng chính">
          <a href="#tinh-nang">Tính năng</a>
          <a href="#cach-hoat-dong">Cách hoạt động</a>
          <Link to="/security">Bảo mật</Link>
        </nav>
        <div className="public-nav-actions">
          <Link className="public-login" to="/login">
            Đăng nhập
          </Link>
          <Link className="public-button small" to="/register">
            Dùng thử <ArrowRight />
          </Link>
        </div>
      </header>

      <main>
        <section className="public-hero">
          <div className="public-hero-copy">
            <h1>
              Mọi hộp thư.
              <br />
              <em>Một nơi quản lý.</em>
            </h1>
            <p>Đọc Gmail, Outlook và sử dụng email tạm thời ngay tại đây.</p>
            <div className="public-hero-actions">
              <Link className="public-button" to="/register">
                Tạo tài khoản <ArrowRight />
              </Link>
              <a className="public-button ghost" href="#tinh-nang">
                Xem tính năng
              </a>
            </div>
          </div>
          <div
            className="public-visual"
            aria-label="Minh họa ứng dụng OmniMail"
          >
            <span className="public-orbit orbit-one">Gmail</span>
            <span className="public-orbit orbit-two">Outlook</span>
            <img
              src="/homepage-760.png"
              width="760"
              height="1187"
              fetchPriority="high"
              decoding="async"
              alt="Nhân vật minh họa cho hộp thư hợp nhất OmniMail"
            />
            <div className="public-live-card">
              <strong>Temp Mail</strong>
            </div>
          </div>
        </section>

        <section
          className="public-provider-strip"
          aria-label="Các dịch vụ được hỗ trợ"
        >
          <span>Kết nối và quản lý</span>
          <strong>Gmail</strong>
          <i />
          <strong>Microsoft Outlook</strong>
          <i />
          <strong>Temporary Mail</strong>
        </section>

        <section className="public-section" id="tinh-nang">
          <div className="public-section-heading">
            <h2>Tính năng</h2>
          </div>
          <div className="public-feature-grid">
            {features.map(({ icon: Icon, title, copy }) => (
              <article key={title}>
                <Icon />
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="public-how" id="cach-hoat-dong">
          <div className="public-how-intro">
            <h2>Cách sử dụng</h2>
          </div>
          <ol>
            <li>
              <b>01</b>
              <div>
                <strong>Tạo tài khoản</strong>
                <p>
                  Đăng ký OmniMail bằng email hoặc nhà cung cấp đăng nhập được
                  hỗ trợ.
                </p>
              </div>
            </li>
            <li>
              <b>02</b>
              <div>
                <strong>Kết nối mailbox</strong>
                <p>
                  Thêm Gmail, Microsoft hoặc tạo một địa chỉ email tạm thời.
                </p>
              </div>
            </li>
            <li>
              <b>03</b>
              <div>
                <strong>Đọc và quản lý</strong>
                <p>
                  Tìm kiếm, làm mới và kiểm soát quyền xem ngay trên dashboard.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className="public-security">
          <div className="public-security-icon">
            <LockKeyhole />
          </div>
          <div>
            <h2>Bạn quyết định ai được xem thư.</h2>
            <p>
              Chia sẻ quyền xem hộp thư với người cần và thu hồi khi muốn. Thông
              tin kết nối email được mã hóa khi lưu trữ.
            </p>
          </div>
          <Link className="public-button light" to="/security">
            Tìm hiểu về bảo mật <ArrowRight />
          </Link>
        </section>

        <section className="public-faq">
          <div className="public-section-heading compact">
            <h2>Câu hỏi thường gặp</h2>
          </div>
          <div>
            <details>
              <summary>OmniMail có gửi email thay tôi không?</summary>
              <p>
                Không. Ứng dụng hiện tập trung vào đọc, đồng bộ, tìm kiếm và
                chia sẻ quyền xem email.
              </p>
            </details>
            <details>
              <summary>Tôi có thể kết nối những loại email nào?</summary>
              <p>
                OmniMail hỗ trợ Gmail, Microsoft Outlook và địa chỉ email tạm
                thời từ dịch vụ được tích hợp.
              </p>
            </details>
            <details>
              <summary>
                Trang này có sử dụng được trên điện thoại không?
              </summary>
              <p>
                Có. Giao diện được thiết kế thích ứng cho cả màn hình máy tính
                và thiết bị di động.
              </p>
            </details>
          </div>
        </section>

        <section className="public-final-cta">
          <h2>Bắt đầu dùng OmniMail</h2>
          <Link className="public-button light" to="/register">
            Tạo tài khoản <ArrowRight />
          </Link>
        </section>
      </main>

      <footer className="public-footer">
        <Link className="public-brand inverse" to="/">
          <strong>OmniMail</strong>
          <span>.</span>
        </Link>
        <p>
          Quản lý Gmail, Outlook và email tạm thời trong một giao diện tập
          trung.
        </p>
        <nav aria-label="Liên kết cuối trang">
          <Link to="/security">Bảo mật</Link>
          <Link to="/privacy">Quyền riêng tư</Link>
          <Link to="/login">Đăng nhập</Link>
        </nav>
        <small>© 2026 OmniMail</small>
      </footer>
    </div>
  );
}

export function SecurityPage() {
  return (
    <PublicInfoPage
      path="/security"
      eyebrow="Bảo mật"
      title="Bảo mật và kiểm soát truy cập tại OmniMail"
      description="Tìm hiểu cách OmniMail bảo vệ thông tin kết nối email, kiểm tra quyền sở hữu mailbox và giới hạn quyền truy cập."
    >
      <h2>Cách OmniMail bảo vệ tài khoản</h2>
      <p>
        Thông tin xác thực được gửi tới API qua kết nối HTTPS. Thông tin kết nối
        nhạy cảm được mã hóa ở phía máy chủ trước khi lưu trữ.
      </p>
      <h2>Kiểm tra quyền trên máy chủ</h2>
      <p>
        Mỗi yêu cầu tới mailbox được xác thực lại tại API. Việc ẩn nút trên giao
        diện không được xem là một cơ chế phân quyền.
      </p>
      <h2>Quyền xem có giới hạn</h2>
      <p>
        OmniMail hiện là trải nghiệm chỉ đọc. Quyền truy cập mailbox hoặc tin
        nhắn được chia sẻ cho từng tài khoản và có thể bị thu hồi.
      </p>
      <h2>Khuyến nghị dành cho người dùng</h2>
      <p>
        Không chia sẻ mật khẩu hoặc App Password. Nếu nghi ngờ thông tin kết nối
        bị lộ, hãy thu hồi thông tin đó tại nhà cung cấp email và kết nối lại.
      </p>
    </PublicInfoPage>
  );
}

export function PrivacyPage() {
  return (
    <PublicInfoPage
      path="/privacy"
      eyebrow="Quyền riêng tư"
      title="Thông tin quyền riêng tư của OmniMail"
      description="Thông tin tổng quan về dữ liệu OmniMail sử dụng để xác thực tài khoản, kết nối mailbox và cung cấp tính năng ứng dụng."
    >
      <h2>Dữ liệu được sử dụng</h2>
      <p>
        OmniMail sử dụng thông tin tài khoản để xác thực người dùng và thông tin
        kết nối mailbox để tải những email mà người dùng được phép xem.
      </p>
      <h2>Mục đích xử lý</h2>
      <p>
        Dữ liệu được xử lý nhằm cung cấp chức năng đăng nhập, đồng bộ hộp thư,
        tìm kiếm, email tạm thời và chia sẻ quyền xem.
      </p>
      <h2>Quyền kiểm soát của bạn</h2>
      <p>
        Bạn có thể ngắt kết nối mailbox trong ứng dụng. Việc này không xóa thư
        gốc khỏi Gmail hoặc Outlook.
      </p>
      <h2>Liên hệ</h2>
      <p>
        Nếu có câu hỏi về dữ liệu hoặc muốn yêu cầu hỗ trợ, hãy liên hệ{" "}
        <a href="mailto:ommimail@gmail.com">ommimail@gmail.com</a>.
      </p>
    </PublicInfoPage>
  );
}

function PublicInfoPage({
  path,
  eyebrow,
  title,
  description,
  children,
}: {
  path: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="public-home info-page">
      <Seo
        title={`${title} | OmniMail`}
        description={description}
        path={path}
      />
      <header className="public-nav">
        <Link className="public-brand" to="/">
          <img src="/logo.jpg" width="40" height="42" alt="Logo OmniMail" />
          <strong>OmniMail</strong>
          <span>.</span>
        </Link>
        <div className="public-nav-actions">
          <Link className="public-login" to="/login">
            Đăng nhập
          </Link>
          <Link className="public-button small" to="/register">
            Dùng thử <ArrowRight />
          </Link>
        </div>
      </header>
      <main className="info-main">
        <Link className="info-back" to="/">
          ← Về trang chủ
        </Link>
        <span className="public-kicker">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="info-lead">{description}</p>
        <article>{children}</article>
      </main>
      <footer className="public-footer">
        <Link className="public-brand inverse" to="/">
          <strong>OmniMail</strong>
          <span>.</span>
        </Link>
        <nav>
          <Link to="/security">Bảo mật</Link>
          <Link to="/privacy">Quyền riêng tư</Link>
        </nav>
        <small>© 2026 OmniMail</small>
      </footer>
    </div>
  );
}
