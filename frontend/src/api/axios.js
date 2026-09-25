import axios from "axios";
import { tokenStorage } from "./tokenStorage";

const api = axios.create({
  baseURL: "http://localhost:8000/api/",
  timeout: 8000,
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
        const { data } = await axios.post("http://localhost:8000/api/auth/login/refresh/", {
          refresh: refreshToken,
        });
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
