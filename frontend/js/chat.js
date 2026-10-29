import { api } from "./api.js";
import { ME_NAME } from "./state.js";
import { $, el, emit, toast } from "./util.js";
import { setCurrent } from "./history.js";
import { fish } from "./fish.js";

let conversationId = null;
let busy = false;

const scrollBox = () => $("#chat-scroll");
const list = () => $("#messages");

function scrollDown() {
  const s = scrollBox();
  s.scrollTop = s.scrollHeight;
}

function setTitle(t) { $("#chat-title").textContent = t || "새 채팅"; }

function bubble(role, text) {
  // 사용자 입력/AI 답변은 반드시 textContent로 넣는다(XSS 방지). 줄바꿈은 CSS pre-wrap.
  const b = el("div", { class: "bubble" });
  b.textContent = text;
  if (role === "user") return el("li", { class: "msg user" }, b);
  const avatar = el("span", { class: "avatar", "aria-hidden": "true" });
  avatar.append(fish("#7fd6f5", { size: 30 }));
  return el("li", { class: "msg assistant" }, avatar, el("div", { class: "msg-col" }, b));
}

function showEmpty(on) { $("#chat-empty").hidden = !on; }

export function newChat() {
  if (busy) return;
  emit("view:chat");
  conversationId = null;
  list().replaceChildren();
  showEmpty(true);
  setTitle("새 채팅");
  setCurrent(null);
  $("#chat-input").focus();
}

export async function openConversation(id) {
  if (busy) return;
  try {
    const c = await api.getConversation(id);
    conversationId = c.id;
    list().replaceChildren(...c.messages.map((m) => bubble(m.role, m.content)));
    showEmpty(false);
    setTitle(c.title);
    setCurrent(c.id);
    emit("view:chat");
    scrollDown();
  } catch (e) {
    toast(e.message, true);
  }
}

async function ask(text, node) {
  busy = true;
  $("#btn-send").disabled = true;
  const dots = el("span", { class: "dots", "aria-label": "답변 작성 중" }, el("i"), el("i"), el("i"));
  const b = node.querySelector(".bubble");
  const col = node.querySelector(".msg-col");
  b.replaceChildren(dots);
  node.classList.remove("error");
  node.querySelector(".msg-actions")?.remove();
  node.querySelector(".cold")?.remove();
  // Render 무료 서버는 한동안 쓰지 않으면 잠들어서 첫 응답이 느리다.
  const cold = setTimeout(() => {
    col.append(el("p", { class: "cold", text: "서버를 깨우는 중이에요. 첫 응답은 30초 정도 걸릴 수 있어요." }));
    scrollDown();
  }, 4000);
  try {
    const r = await api.chat({ message: text, conversation_id: conversationId, me: ME_NAME });
    b.textContent = r.reply;
    conversationId = r.conversation_id;
    setTitle(r.title);
    setCurrent(r.conversation_id);
    if (!r.saved) col.append(el("p", { class: "msg-note", text: "답변은 받았지만 이 채팅은 저장되지 못했어요. 새로 고침하면 사라질 수 있어요." }));
    emit("conversations:changed");
  } catch (e) {
    if (e.status === 404 && conversationId) {
      conversationId = null;
      setCurrent(null);
    }
    node.classList.add("error");
    b.textContent = e.message;
    // 채팅이 너무 길어진 경우(409)에는 다시 시도해도 같은 결과라서 새 채팅으로 이어가게 한다.
    col.append(el("div", { class: "msg-actions" }, e.status === 409
      ? el("button", { type: "button", class: "btn-line", text: "새 채팅으로 이어서 질문", onclick: () => { if (busy) return; newChat(); send(text); } })
      : el("button", { type: "button", class: "btn-line", text: "다시 시도", onclick: () => !busy && ask(text, node) })));
  } finally {
    clearTimeout(cold);
    node.querySelector(".cold")?.remove();
    busy = false;
    $("#btn-send").disabled = false;
    scrollDown();
  }
}

export function send(text) {
  text = text.trim();
  if (!text || busy) return;
  showEmpty(false);
  const u = bubble("user", text);
  const a = bubble("assistant", "");
  list().append(u, a);
  scrollDown();
  ask(text, a);
}

export function initChat() {
  const input = $("#chat-input");
  const counter = $("#chat-counter");
  const grow = () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
    counter.textContent = input.value.length > 800 ? `${input.value.length}/1000` : "";
  };
  input.addEventListener("input", grow);
  input.addEventListener("keydown", (e) => {
    // 한글 조합 중 Enter는 글자 확정이므로 전송하지 않는다.
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      $("#chat-form").requestSubmit();
    }
  });
  $("#chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) return;
    const t = input.value;
    if (!t.trim()) return;
    input.value = "";
    grow();
    send(t);
  });
  $("#btn-new").addEventListener("click", newChat);
  $("#btn-new-m").addEventListener("click", newChat);
  $("#btn-list").addEventListener("click", () => emit("view:chat-list"));
  document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => send(c.dataset.q)));
  document.addEventListener("conversation:open", (e) => openConversation(e.detail));
  document.addEventListener("conversation:deleted", (e) => { if (e.detail === conversationId) newChat(); });
  document.addEventListener("view:chat", () => {});
}
