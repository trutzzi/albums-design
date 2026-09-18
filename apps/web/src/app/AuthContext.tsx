import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  DEMO_STUDIO_ID,
  login as loginRequest,
  registerAccount as registerRequest,
} from "../lib/api";
import { clearSession, loadSession, saveSession, type StoredSession } from "../lib/auth-storage";

interface AuthContextValue {
  /** True once a real person has logged in — false for the baked-in demo key. */
  isAuthenticated: boolean;
  /** The active studio: the logged-in user's own, or the build's demo studio. */
  studioId: string;
  /** The logged-in person's own name, for a personal greeting — empty when not authenticated. */
  name: string;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => loadSession());

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: session !== null,
      studioId: session?.studioId ?? DEMO_STUDIO_ID,
      name: session?.name ?? "",
      login: async (email, password) => {
        const result = await loginRequest({ email, password });
        saveSession(result);
        setSession(result);
      },
      register: async (name, email, password) => {
        const result = await registerRequest({ name, email, password });
        saveSession(result);
        setSession(result);
      },
      logout: () => {
        clearSession();
        setSession(null);
      },
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider.");
  return context;
}
