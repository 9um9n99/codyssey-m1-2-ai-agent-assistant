import { api } from "./api.js";
import { $, el, emit, toast, fmtDateTime, confirmDialog } from "./util.js";

let currentId = null;
const body = () => $("#history-body");

export function setCurrent(id) {
  currentId = id;
  document.querySelectorAll(".hist-item").forEach((b) => {
    b.setAttribute("aria-current", String(b.dataset.id === id));
  });
}

export async function refreshHistory() {
  try {
    const items = await api.listConversations(30);
    render(items);
  } catch (e) {
    body().replaceChildren(el("div", { class: "empty-note" }, "채팅 목록을 불러오지 못했어요. ", el("button", { class: "btn-line", onclick: refreshHistory }, "다시 시도")));
  }
}

function render(items) {
  if (!items.length) {
    body().replaceChildren(el("p", { class: "empty-note", text: "아직 채팅이 없어요." }));
    return;
  }
  const list = el("ul");
  for (const c of items) {
    const item = el("button", {
      type: "button", class: "hist-item", "data-id": c.id, "aria-current": String(c.id === currentId),
      onclick: () => emit("conversation:open", c.id),
    },
      el("span", { class: "hist-title", text: c.title || "제목 없음" }),
      el("span", { class: "hist-meta", text: `${fmtDateTime(c.updated_at)} · 메시지 ${c.message_count}개` }));
    const del = el("button", {
      type: "button", class: "hist-del", "aria-label": `${c.title} 채팅 삭제`, text: "✕",
      onclick: async () => {
        if (!(await confirmDialog("채팅을 삭제할까요?", `"${c.title}" 채팅이 지워져요. 되돌릴 수 없어요.`))) return;
        try {
          await api.deleteConversation(c.id);
          toast("채팅을 삭제했어요.");
          emit("conversation:deleted", c.id);
          refreshHistory();
        } catch (e) { toast(e.message, true); }
      },
    });
    list.append(el("li", { class: "hist-wrap" }, item, del));
  }
  body().replaceChildren(list);
}

export function initHistory() {
  document.addEventListener("conversations:changed", refreshHistory);
  refreshHistory();
}
