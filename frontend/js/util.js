export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function fmtMinutes(m) {
  if (m === null || m === undefined) return "-";
  const h = Math.floor(m / 60), r = m % 60;
  if (h === 0) return `${r}분`;
  return r === 0 ? `${h}시간` : `${h}시간 ${r}분`;
}
export function fmtHours(m) {
  if (m === null || m === undefined) return "-";
  return `${(m / 60).toFixed(1)}h`;
}

export function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function todayStr() {
  // 서버(한국 시간 기준)와 같은 "오늘"을 쓰도록, 브라우저 시간대와 상관없이 한국 날짜로 계산한다.
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch (_) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
}

export function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const now = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? `오늘 ${p(d.getHours())}:${p(d.getMinutes())}` : `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function toast(msg, isErr = false) {
  const box = $("#toasts");
  while (box.children.length >= 2) box.firstChild.remove(); // 알림이 쌓이지 않게 최대 2개만
  const t = el("div", { class: "toast" + (isErr ? " err" : ""), role: "status", text: msg });
  box.append(t);
  setTimeout(() => t.remove(), isErr ? 5000 : 2600);
}

export function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

export function confirmDialog(title, message, okLabel = "삭제") {
  const dlg = $("#dlg-confirm");
  $("#confirm-title").textContent = title;
  $("#confirm-msg").textContent = message;
  $("#confirm-ok").textContent = okLabel;
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), { once: true });
    dlg.returnValue = "cancel";
    dlg.showModal();
  });
}
