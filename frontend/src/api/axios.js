import axios from "axios";
import { tokenStorage } from "./tokenStorage";

// Overridable via VITE_API_BASE_URL (see .env.example) -- e.g. pointing at
// an ngrok tunnel to the backend instead of the local dev server. Falls
// back to the same localhost default every page has always used, so
// normal local dev needs no .env file at all. Must end with a trailing
// slash, same as the hardcoded value this replaces -- every call site
// below passes a path with no leading slash (api.post("auth/login/")),
// which only resolves correctly against a baseURL that already ends in one.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/";

// ngrok's free tier serves an HTML "Visit Site" interstitial to any request
// that looks like it's from a browser, instead of forwarding it -- this
// header is ngrok's own documented way to opt a request out of that page.
// Harmless against a non-ngrok backend (plain localhost ignores unknown
// headers), so it's left on unconditionally rather than gated behind an
// env check.
const NGROK_SKIP_HEADER = { "ngrok-skip-browser-warning": "true" };

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
  headers: NGROK_SKIP_HEADER,
});

// Attach the access token to every outgoing request automatically.
api.interceptors.request.use((config) => {
  const access = tokenStorage.getAccess();
  if (access) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

// Track requests currently waiting on a token refresh, so simultaneous
// 401s don't each trigger their own separate refresh call.
let isRefreshing = false;
let pendingQueue = [];

function resolveQueue(newAccessToken, error) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(newAccessToken);
  });
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    const isAuthEndpoint =
      originalRequest.url?.includes("auth/login") ||
      originalRequest.url?.includes("auth/register");

    if (status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      const refreshToken = tokenStorage.getRefresh();
      if (!refreshToken) {
        tokenStorage.clear();
        window.dispatchEvent(new Event("smartfarming:logout"));
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(
          `${API_BASE_URL}auth/login/refresh/`,
          { refresh: refreshToken },
          { headers: NGROK_SKIP_HEADER }
        );
        tokenStorage.setTokens(data.access, data.refresh);
        resolveQueue(data.access, null);
        originalRequest.headers.Authorization = `Bearer ${data.access}`;
        return api(originalRequest);
      } catch (refreshError) {
        resolveQueue(null, refreshError);
        tokenStorage.clear();
        window.dispatchEvent(new Event("smartfarming:logout"));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
