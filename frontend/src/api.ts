/**
 * Centralised Axios instance.
 *
 * - Sends cookies automatically (withCredentials)
 * - Global 401 interceptor: redirects to / so the LoginPage renders.
 *   Skipped for /auth/status and /setup/status (those are the auth-check calls themselves).
 * - Errors are re-thrown so individual callers can still handle them if needed.
 */
import axios, { AxiosError } from "axios";

const api = axios.create({
  // In production both frontend and backend are on the same origin,
  // so baseURL is "" (relative). In local dev VITE_API_BASE=http://localhost:8001.
  // Use ?? instead of || so an intentional empty string isn't overridden.
  baseURL:         import.meta.env.VITE_API_BASE ?? "",
  withCredentials: true,
  timeout:         15_000,
});

// Paths that are allowed to receive a 401 without triggering a logout redirect
const AUTH_CHECK_PATHS = ["/auth/status", "/setup/status", "/auth/login"];

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    const path     = err.config?.url ?? "";
    const isCheck  = AUTH_CHECK_PATHS.some((p) => path.includes(p));
    const is401    = err.response?.status === 401;

    if (is401 && !isCheck) {
      // Session expired or revoked — reload to root so bootApp() re-runs
      window.location.replace("/");
    }

    return Promise.reject(err);
  },
);

export default api;
