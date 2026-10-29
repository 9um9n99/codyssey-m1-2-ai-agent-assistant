import { ME_NAME } from "./state.js";

const BASE = (window.APP_CONFIG?.API_BASE_URL || "").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const FRIENDLY = {
  404: "찾을 수 없어요. 이미 삭제됐을 수 있어요.",
  409: "이미 있는 기록이에요. 같은 이름·날짜는 수정으로 바꿔 주세요.",
  429: "질문이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.",
  502: "AI 서버가 응답하지 못했어요. 잠시 뒤에 다시 시도해 주세요.",
  503: "서버 설정에 문제가 있어요. 잠시 뒤에 다시 시도해 주세요.",
  504: "AI 응답이 너무 늦어요. 다시 시도해 주세요.",
};

function fromDetail(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    const field = (first.loc || []).slice(1).join(".");
    return `입력값을 확인해 주세요${field ? ` (${field})` : ""}.`;
  }
  return null;
}

async function request(method, path, body, { timeout = 90000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ApiError(0, e.name === "AbortError"
      ? "서버 응답이 너무 늦어요. 잠시 뒤에 다시 시도해 주세요."
      : "서버에 연결할 수 없어요. 인터넷 연결이나 서버 상태를 확인해 주세요.");
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch (_) { /* 본문 없음 */ }
  if (!res.ok) {
    throw new ApiError(res.status, FRIENDLY[res.status] || fromDetail(data?.detail) || `요청에 실패했어요. (${res.status})`);
  }
  return data;
}

const q = (params) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== "" && v != null) s.set(k, v);
  const t = s.toString();
  return t ? `?${t}` : "";
};

export const api = {
  health: () => request("GET", "/health", null, { timeout: 60000 }),
  friends: () => request("GET", "/api/friends"),
  summary: () => request("GET", `/api/data/summary${q({ me: ME_NAME })}`),
  listData: (person, limit = 50) => request("GET", `/api/data${q({ person, limit })}`),
  createData: (b) => request("POST", "/api/data", b),
  updateData: (id, b) => request("PUT", `/api/data/${encodeURIComponent(id)}`, b),
  updateEntry: (id, eid, b) => request("PUT", `/api/data/${encodeURIComponent(id)}/entries/${encodeURIComponent(eid)}`, b),
  deleteEntry: (id, eid) => request("DELETE", `/api/data/${encodeURIComponent(id)}/entries/${encodeURIComponent(eid)}`),
  deleteData: (id) => request("DELETE", `/api/data/${encodeURIComponent(id)}`),
  listConversations: (limit = 30) => request("GET", `/api/conversations${q({ limit })}`),
  getConversation: (id) => request("GET", `/api/conversations/${encodeURIComponent(id)}`),
  deleteConversation: (id) => request("DELETE", `/api/conversations/${encodeURIComponent(id)}`),
  chat: (b) => request("POST", "/api/chat", b, { timeout: 90000 }),
};
