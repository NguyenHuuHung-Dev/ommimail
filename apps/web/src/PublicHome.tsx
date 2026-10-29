import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Seo } from "./Seo";

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
