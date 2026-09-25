/**
 * Token storage — currently localStorage.
 *
 * KNOWN LIMITATION (documented deliberately, not an oversight):
 * localStorage is readable by any JS running on the page, so it's vulnerable
 * to XSS-based token theft. The more secure approach is httpOnly cookies set
 * by the server, which JS can never read. We're using localStorage now to
 * keep Phase 4 scoped and simple while the team is still learning — this is
 * a real trade-off to explain in viva, not something to hide.
 *
 * Upgrade path (future phase): switch SimpleJWT to set tokens via httpOnly
 * cookies instead of returning them in the JSON body.
 */

const ACCESS_KEY = "smartfarming_access";
const REFRESH_KEY = "smartfarming_refresh";

export const tokenStorage = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  setTokens: (access, refresh) => {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  setAccess: (access) => localStorage.setItem(ACCESS_KEY, access),
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};
