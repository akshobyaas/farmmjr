import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../api/axios";
import { tokenStorage } from "../api/tokenStorage";
import i18n from "../i18n";
import { languageStorage } from "../i18n/languageStorage";

// Exported (not just the usual `useAuth` hook below) so LanguageSwitcher can
// read it with a plain `useContext` instead of the throwing `useAuth()`.
// AppHeader (and so LanguageSwitcher) is always rendered inside a real
// AuthProvider in the actual app, but it's also rendered by many pages'
// tests that don't mock AuthContext (they never needed to before, since
// AppHeader's old per-page `icon` prop didn't touch auth state) -- for a
// language switcher specifically, "no provider" and "logged out" are the
// same situation (can't persist to an account that may not exist yet), so
// it degrades to that instead of throwing.
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true while we check for an existing session

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get("auth/me/");
      setUser(data);
    } catch {
      setUser(null);
      tokenStorage.clear();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tokenStorage.getAccess()) {
      fetchMe();
    } else {
      setLoading(false);
    }

    const handleForcedLogout = () => setUser(null);
    window.addEventListener("smartfarming:logout", handleForcedLogout);
    return () => window.removeEventListener("smartfarming:logout", handleForcedLogout);
  }, [fetchMe]);

  // Phase 18 -- the logged-in user's saved preference drives the UI
  // language on login/session-restore, and any subsequent save from a
  // LanguageSwitcher (Profile page's own, or the always-visible one in
  // AppHeader/Login/Register) takes effect immediately (updateProfile below
  // sets `user` from the response, which re-runs this). This also runs once
  // on mount while still logged out (`user` is null then), which used to
  // hardcode "en" -- stomping right back over whatever languageStorage.get()
  // the i18n module had already set as the initial language a moment
  // earlier, so a returning logged-out visitor saw a flash of English before
  // their saved choice "won" again on the next real change. Falling back to
  // languageStorage here too (instead of straight to "en") fixes that.
  useEffect(() => {
    i18n.changeLanguage(user?.preferred_language || languageStorage.get() || "en");
  }, [user?.preferred_language]);

  const login = async (username, password) => {
    const { data } = await api.post("auth/login/", { username, password });
    tokenStorage.setTokens(data.access, data.refresh);
    await fetchMe();
  };

  const register = async (formData) => {
    const { data } = await api.post("auth/register/", formData);
    return data;
  };

  const logout = async () => {
    const refresh = tokenStorage.getRefresh();
    try {
      if (refresh) {
        await api.post("auth/logout/", { refresh });
      }
    } catch {
      // Even if the server call fails, still clear the local session.
    }
    tokenStorage.clear();
    setUser(null);
  };

  const requestPasswordReset = async (email) => {
    const { data } = await api.post("auth/password-reset/request/", { email });
    return data;
  };

  const confirmPasswordReset = async (uid, token, newPassword, newPasswordConfirm) => {
    const { data } = await api.post("auth/password-reset/confirm/", {
      uid, token, new_password: newPassword, new_password_confirm: newPasswordConfirm,
    });
    return data;
  };

  const resendVerification = async (email) => {
    const { data } = await api.post("auth/verify-email/resend/", { email });
    return data;
  };

  const confirmEmailVerification = async (uid, token) => {
    const { data } = await api.post("auth/verify-email/confirm/", { uid, token });
    return data;
  };

  const changeUnverifiedEmail = async (username, password, newEmail) => {
    const { data } = await api.post("auth/verify-email/change-email/", {
      username, password, new_email: newEmail,
    });
    return data;
  };

  const getProfile = async () => {
    const { data } = await api.get(`auth/profile/${user.id}/`);
    return data;
  };

  const updateProfile = async (fields) => {
    const { data } = await api.patch(`auth/profile/${user.id}/`, fields);
    setUser(data);
    return data;
  };

  return (
    <AuthContext.Provider
      value={{
        user, loading, login, register, logout,
        requestPasswordReset, confirmPasswordReset,
        resendVerification, confirmEmailVerification, changeUnverifiedEmail,
        getProfile, updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
