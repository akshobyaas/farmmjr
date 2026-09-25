import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../api/axios";
import { tokenStorage } from "../api/tokenStorage";
import i18n from "../i18n";

const AuthContext = createContext(null);

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
  // language on login/session-restore, and any subsequent save on the
  // Profile page's language switcher takes effect immediately (updateProfile
  // below sets `user` from the response, which re-runs this).
  useEffect(() => {
    i18n.changeLanguage(user?.preferred_language || "en");
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
        resendVerification, confirmEmailVerification,
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
