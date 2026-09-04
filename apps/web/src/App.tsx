import { lazy, Suspense } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { PrivacyPage, PublicHome, SecurityPage } from "./PublicHome";
import { Seo } from "./Seo";

const Guard = lazy(() =>
  import("./PrivatePages").then((module) => ({ default: module.Guard })),
);
const AuthRoute = lazy(() =>
  import("./PrivatePages").then((module) => ({ default: module.AuthRoute })),
);

function PrivateFallback() {
  return <div className="app-loading">Loading OmniMail…</div>;
}
function NotFound() {
  return (
    <main className="not-found-page">
      <Seo
        title="Không tìm thấy trang | OmniMail"
        description="Trang bạn yêu cầu không tồn tại."
        noIndex
      />
      <div>
        <strong>404</strong>
        <h1>Không tìm thấy trang</h1>
        <p>Đường dẫn này không tồn tại hoặc đã được thay đổi.</p>
        <Link to="/">Về trang chủ</Link>
      </div>
    </main>
  );
}
export function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/security" element={<SecurityPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route
        path="/login"
        element={
          <Suspense fallback={<PrivateFallback />}>
            <AuthRoute mode="login" />
          </Suspense>
        }
      />
      <Route
        path="/register"
        element={
          <Suspense fallback={<PrivateFallback />}>
            <AuthRoute mode="register" />
          </Suspense>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <Suspense fallback={<PrivateFallback />}>
            <AuthRoute mode="forgot" />
          </Suspense>
        }
      />
      <Route
        path="/app/*"
        element={
          <Suspense fallback={<PrivateFallback />}>
            <Guard />
          </Suspense>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
