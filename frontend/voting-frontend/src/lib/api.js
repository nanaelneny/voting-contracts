// Talks to the backend. Every call goes to /api, which Vite forwards to the backend.

const TOKEN_KEY = "secret-ballot:token";

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: stay logged in for this tab only */
  }
};

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * @param {object} opts
 * @param {boolean} opts.anonymous  send no login token (used for casting a ballot)
 */
async function request(method, path, { body, anonymous = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = anonymous ? null : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // A ballot must not carry cookies or other credentials either.
      credentials: anonymous ? "omit" : "same-origin",
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check that the backend is running.", "NETWORK");
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !anonymous && token) setToken(null);
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data.code);
  }
  return data;
}

export const api = {
  // Accounts
  register: (body) => request("POST", "/auth/register", { body }),
  login: (body) => request("POST", "/auth/login", { body }),
  me: () => request("GET", "/auth/me"),

  // Elections (public)
  listElections: () => request("GET", "/elections"),
  getElection: (id) => request("GET", `/elections/${id}`),
  getResults: (id) => request("GET", `/elections/${id}/results`),
  getGroup: (id) => request("GET", `/elections/${id}/group`, { anonymous: true }),

  // Voter registration
  getMyRegistration: (id) => request("GET", `/elections/${id}/registration`),
  registerForElection: (id, commitment) => request("POST", `/elections/${id}/registration`, { body: { commitment } }),

  // Ballot: sent with no login token, so the server can't tie it to an account
  castBallot: (id, proof) => request("POST", `/elections/${id}/votes`, { body: { proof }, anonymous: true }),

  // Admin
  createElection: (body) => request("POST", "/elections", { body }),
  updateElection: (id, body) => request("PUT", `/elections/${id}`, { body }),
  deleteElection: (id) => request("DELETE", `/elections/${id}`),
  addCandidate: (id, body) => request("POST", `/elections/${id}/candidates`, { body }),
  removeCandidate: (id, candidateId) => request("DELETE", `/elections/${id}/candidates/${candidateId}`),
  listRegistrations: (id, status) => request("GET", `/elections/${id}/registrations${status ? `?status=${status}` : ""}`),
  reviewRegistrations: (id, ids, status) => request("POST", `/elections/${id}/registrations/review`, { body: { ids, status } }),
  publish: (id) => request("POST", `/elections/${id}/publish`),
  syncVoters: (id) => request("POST", `/elections/${id}/sync-voters`),
  cancel: (id) => request("POST", `/elections/${id}/cancel`),
  finalize: (id) => request("POST", `/elections/${id}/finalize`),
  relayStats: () => request("GET", "/admin/relay-stats"),
};
