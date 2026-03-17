export type AuthRole = "user" | "admin";

export type AuthState = {
  role: AuthRole;
  email?: string;
  name?: string;
  phone?: string;
  user_role?: string;
  interests?: string[];
  loggedInAt: string;
  token?: string;
};

const AUTH_STORAGE_KEY = "saheli_auth";

export function getAuth(): AuthState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthState;
    if (!parsed?.role || !parsed?.loggedInAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  const auth = getAuth();
  if (!auth?.token) return false;
  return isTokenValid(auth.token);
}

export function setAuth(auth: AuthState) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

export function clearAuth() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getToken(): string | null {
  const token = getAuth()?.token ?? null;
  if (!token) return null;
  if (!isTokenValid(token)) {
    clearAuth();
    return null;
  }
  return token;
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join("")
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isTokenValid(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload) return false;
  const exp = payload?.exp;
  if (typeof exp !== "number") return false;
  const now = Math.floor(Date.now() / 1000);
  return exp > now;
}
