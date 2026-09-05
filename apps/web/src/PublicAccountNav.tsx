import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";

type Account = Pick<User, "displayName" | "email" | "photoURL">;

export function PublicAccountActions({
  user,
}: {
  user: Account | null | undefined;
}) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const name = user?.displayName?.trim() || user?.email || "Tài khoản OmniMail";
  const initials =
    (user?.displayName?.trim() || user?.email || "")
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toLocaleUpperCase("vi") || "OM";

  // Wait for Firebase to restore the session instead of flashing guest actions.
  if (user === undefined) {
    return (
      <div
        className="public-nav-actions public-account-loading"
        aria-busy="true"
        aria-label="Đang tải tài khoản"
      />
    );
  }

  return (
    <div className="public-nav-actions">
      {user ? (
        <Link
          className="public-account-avatar"
          to="/app/home"
          aria-label={`Vào tài khoản ${name}`}
          title={name}
        >
          {user.photoURL && failedPhoto !== user.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setFailedPhoto(user.photoURL)}
            />
          ) : (
            initials
          )}
        </Link>
      ) : (
        <Link className="public-login" to="/login">
          Đăng nhập
        </Link>
      )}
      <Link
        className="public-button small"
        to={user ? "/app/home" : "/register"}
      >
        {user ? "Vào" : "Dùng thử"} <ArrowRight aria-hidden="true" />
      </Link>
    </div>
  );
}

export default function PublicAccountNav() {
  const [user, setUser] = useState<User | null | undefined>(
    () => auth.currentUser ?? undefined,
  );
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return <PublicAccountActions user={user} />;
}
