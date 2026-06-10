import { createContext, useContext, type ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';

// Small auth abstraction so the UI doesn't depend directly on Privy. In normal
// mode it is backed by Privy; in "preview" mode (no VITE_PRIVY_APP_ID set) it is
// a stub, letting the full themed app render for a visual look without a Privy app.
export interface Auth {
  ready: boolean;
  authenticated: boolean;
  preview: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<Auth>({
  ready: true,
  authenticated: false,
  preview: true,
  login: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

/// Backs the auth context with Privy. Must be rendered inside <PrivyProvider>.
export function PrivyAuthBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy();
  return (
    <AuthContext.Provider value={{ ready, authenticated, preview: false, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/// Stub auth used in preview mode (no Privy app configured).
export function PreviewAuthProvider({ children }: { children: ReactNode }) {
  const value: Auth = {
    ready: true,
    authenticated: false,
    preview: true,
    login: () =>
      alert('Preview mode — set VITE_PRIVY_APP_ID in app/.env to enable wallet login.'),
    logout: () => {},
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
