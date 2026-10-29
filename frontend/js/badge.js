// 진행 중인 타이머(뽀모도로 / 스톱워치)를 상단바 칩과 어항 안 알약에 같은 글로 보여 준다.
import { $, emit } from "./util.js";

const ORDER = ["pomo", "watch"];
const sources = {}; // name -> { label, mode } | null

export function setBadge(name, state) {
  sources[name] = state;
  paintBadges();
}

export const isActive = (name) => !!sources[name];

export function paintBadges() {
  const name = ORDER.find((n) => sources[n]);
  const s = name ? sources[name] : null;
  document.querySelectorAll(".pomo-badge").forEach((b) => {
    b.hidden = !s;
    if (!s) return;
    b.textContent = s.label;
    b.dataset.mode = s.mode;
    b.dataset.tab = name;
  });
}

export function openTimer(name) {
  emit("view:record", "log");
  $(`#lg-${name || ORDER.find((n) => sources[n]) || "pomo"}`).click();
}

export function initBadges() {
  $("#pomo-chip").addEventListener("click", () => openTimer());
}

// 아직 기록에 더하지 않은, 진행 중인 공부 시간(분). 어항 수심 게이지가 실시간으로 반영한다.
const live = {};
export function setLive(name, minutes) {
  const v = Math.max(0, minutes || 0);
  if (Math.abs((live[name] || 0) - v) < 0.01) return;
  live[name] = v;
  document.dispatchEvent(new CustomEvent("live:changed"));
}
export const getLive = () => Object.values(live).reduce((a, b) => a + b, 0);
