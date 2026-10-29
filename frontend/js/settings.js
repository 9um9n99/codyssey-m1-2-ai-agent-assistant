// 설정: 내 물고기 색과 뽀모도로 시간(뽀모도로 화면에서 바꿈). 이 브라우저(localStorage)에만 저장된다.
import { $, el } from "./util.js";

export const MY_COLORS = ["#ff7a59", "#ffcf3f", "#ff8fb8", "#a58bff", "#4fd1a5", "#ffa63d", "#e86b6b", "#9ad84a"];
export const FRIEND_COLOR = "#5b9bd5"; // 친구 물고기는 모두 같은 색

const KEY = "deepfin.settings";
const DEFAULTS = { fishColor: MY_COLORS[0], focus: 25, brk: 5, auto: true };
let cur = { ...DEFAULTS };

try { cur = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (_) { /* 저장값이 없거나 깨져도 기본값 */ }

const clamp = (n, lo, hi, d) => (Number.isFinite(+n) ? Math.min(hi, Math.max(lo, Math.round(+n))) : d);
const validColor = (c) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);

function sanitize(s) {
  return {
    fishColor: validColor(s.fishColor) ? s.fishColor : DEFAULTS.fishColor,
    focus: clamp(s.focus, 5, 90, 25),
    brk: clamp(s.brk, 1, 30, 5),
    auto: !!s.auto,
  };
}
cur = sanitize(cur);

export const getSettings = () => ({ ...cur });
export const getMeColor = () => cur.fishColor;

export function applyColor() {
  document.documentElement.style.setProperty("--me", cur.fishColor);
}

export function updateSettings(patch) {
  cur = sanitize({ ...cur, ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (_) { /* 저장 불가여도 이번 방문에는 적용 */ }
  applyColor();
  // changed: 어떤 값이 바뀌었는지 알려 줘서, 듣는 쪽이 필요할 때만 다시 그리게 한다.
  document.dispatchEvent(new CustomEvent("settings:changed", { detail: { ...getSettings(), changed: Object.keys(patch) } }));
}

export function initSettings(makeFish) {
  applyColor();
  const dlg = $("#dlg-settings");
  const sw = $("#set-swatches");
  const preview = $("#set-preview");
  const draw = () => {
    preview.replaceChildren(makeFish(cur.fishColor, { size: 72 }));
    sw.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.color.toLowerCase() === cur.fishColor.toLowerCase())));
    $("#set-custom").value = cur.fishColor;
  };
  sw.replaceChildren(...MY_COLORS.map((c) => el("button", {
    type: "button", role: "radio", class: "swatch", "data-color": c, "aria-label": `물고기 색 ${c}`, style: `background:${c}`,
    onclick: () => { updateSettings({ fishColor: c }); draw(); },
  })));
  $("#set-custom").addEventListener("input", (e) => { updateSettings({ fishColor: e.target.value }); draw(); });
  $("#btn-settings").addEventListener("click", () => {
    draw();
    dlg.showModal();
  });
  $("#set-close").addEventListener("click", () => dlg.close());
}
