import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onIdTokenChanged, type User } from "firebase/auth";
import { useQueryClient } from "@tanstack/react-query";
import { auth } from "./firebase";
import { useUI } from "./store";

type Session = {
  user: User | null;
  verified: boolean;
  loading: boolean;
  error: string;
};
const SessionContext = createContext<Session>({
  user: null,
  verified: false,
  loading: true,
  error: "",
});

export function AuthSession({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session>({
    user: null,
    verified: false,
    loading: true,
    error: "",
  });

  useEffect(() => {
    let previousUid: string | null | undefined;
    let revision = 0;
    const unsubscribe = onIdTokenChanged(
      auth,
      (user) => {
        const currentRevision = ++revision;
        if (previousUid !== user?.uid) {
          queryClient.clear();
          useUI
            .getState()
            .set({
              selectedAccount: null,
              selectedMessage: null,
              search: "",
              sidebar: false,
            });
          setSession({
            user,
            verified: false,
            loading: Boolean(user?.emailVerified),
            error: "",
          });
        }
        previousUid = user?.uid;
        if (!user || !user.emailVerified) {
          setSession({ user, verified: false, loading: false, error: "" });
          return;
        }
        // reload() can notify listeners before the JWT has been refreshed.
        // Use the cached signed claim so mailboxes only mount when the API will
        // accept the token. No forced network refresh is needed on navigation.
        void user
          .getIdTokenResult()
          .then(({ claims }) => {
            if (currentRevision !== revision) return;
            setSession({
              user,
              verified: claims.email_verified === true,
              loading: false,
              error: "",
            });
          })
          .catch(() => {
            if (currentRevision !== revision) return;
            setSession({
              user,
              verified: false,
              loading: false,
              error:
                "Không thể khôi phục phiên đăng nhập. Hãy tải lại trang để thử lại.",
            });
          });
      },
      () => {
        revision++;
        queryClient.clear();
        setSession({
          user: null,
          verified: false,
          loading: false,
          error:
            "Không thể khôi phục phiên đăng nhập. Hãy tải lại trang để thử lại.",
        });
      },
    );
    return () => {
      revision++;
      unsubscribe();
    };
  }, [queryClient]);

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

export function useAuthSession() {
  return useContext(SessionContext);
}

export function SessionLoading() {
  return (
    <div className="app-loading" role="status">
      Đang khôi phục phiên đăng nhập…
    </div>
  );
}

export function SessionError() {
  const { error } = useAuthSession();
  return (
    <div className="app-loading" role="alert">
      {error} <button onClick={() => window.location.reload()}>Tải lại</button>
    </div>
  );
}
