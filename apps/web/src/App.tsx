import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { MailApp } from "./MailApp";
import { AuthPage } from "./AuthPage";
import { auth } from "./firebase";
function Guard() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser) await nextUser.getIdToken(true);
      if (active) setUser(nextUser);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  if (user === undefined)
    return <div className="app-loading">Loading OmniMail…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <MailApp />;
}
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
      <Route path="/app/*" element={<Guard />} />
      <Route path="*" element={<Navigate to="/app/home" replace />} />
    </Routes>
  );
}
