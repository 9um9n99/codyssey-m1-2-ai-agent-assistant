// 뽀모도로: 집중 → 휴식을 반복. 끝까지 마친 집중만 "오늘 기록"에 더한다.
import { api } from "./api.js";
import { ME_NAME } from "./state.js";
import { getSettings, updateSettings } from "./settings.js";
import { $, emit, toast, todayStr, nowHM } from "./util.js";
import { setBadge, isActive, setLive } from "./badge.js";

const KEY = "deepfin.pomo";
const STALE_MS = 10 * 60 * 1000; // 이 시간보다 오래전에 끝난 타이머는 자리를 비운 것으로 보고 기록하지 않는다
const BASE_TITLE = document.title;

let st = { mode: "focus", status: "idle", endAt: 0, remaining: 0, startedAt: 0, day: "", cycles: 0 };
let timer = null;
let audio = null;

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* 저장 불가여도 동작 */ } };

const dur = (mode) => (mode === "focus" ? getSettings().focus : getSettings().brk) * 60000;

function persist() { save(KEY, st); }

function resetDay() {
  const d = todayStr();
  if (st.day !== d) { st.day = d; st.cycles = 0; }
}

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function beep() {
  try {
    if (!audio) return;
    [0, 0.28].forEach((t) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "sine"; o.frequency.value = t ? 660 : 880;
      g.gain.setValueAtTime(0.0001, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.24);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.26);
    });
  } catch (_) { /* 소리가 안 나도 기능에는 영향 없음 */ }
}

export async function addToToday(minutes, memo = "뽀모도로") {
  await api.createData({ person: ME_NAME, date: todayStr(), value: minutes, memo, at: nowHM() });
  emit("data:changed");
}

async function completeFocus(endAt) {
  const minutes = Math.round(dur("focus") / 60000);
  resetDay();
  st.cycles += 1;
  st.mode = "break"; st.status = "idle"; st.remaining = dur("break"); st.startedAt = 0;
  persist(); render();
  beep();
  try {
    await addToToday(minutes);
    toast(`집중 ${minutes}분 완료! 오늘 기록에 더했어요.`);
  } catch (e) {
    toast(`집중은 끝났지만 기록에 더하지 못했어요. ${e.message}`, true);
    $("#pomo-note").textContent = `${minutes}분이 기록되지 않았어요. '직접 입력'에서 추가해 주세요.`;
  }
}

function completeBreak() {
  st.mode = "focus"; st.status = "idle"; st.remaining = dur("focus"); st.startedAt = 0;
  persist(); render(); beep();
  toast("휴식이 끝났어요. 다시 집중해 볼까요?");
}

function tick() {
  if (st.status !== "running") return;
  const left = st.endAt - Date.now();
  if (left <= 0) {
    stopTicking();
    const endAt = st.endAt;
    if (st.mode === "focus") completeFocus(endAt); else completeBreak();
    return;
  }
  paint(left);
}

function startTicking() { stopTicking(); timer = setInterval(tick, 250); }
function stopTicking() { if (timer) { clearInterval(timer); timer = null; } }

let lastLeft = 0;

// 상단바 칩, 어항 안 알약 모두 같은 글을 보여 준다. 어항 카드는 다시 그려질 때마다 새로 만들어져서 밖에서도 부를 수 있게 export 한다.
function paintPomoBadges() {
  const on = st.status !== "idle";
  setBadge("pomo", on ? { label: `${st.status === "paused" ? "일시정지" : st.mode === "focus" ? "집중" : "휴식"} ${fmt(lastLeft)}`, mode: st.status === "paused" ? "paused" : st.mode } : null);
}

function paint(left) {
  lastLeft = left;
  // 진행 중인 집중 시간은 아직 기록 전이라도 어항 게이지에 바로 반영한다(취소하면 다시 0)
  setLive("pomo", st.mode === "focus" && st.status !== "idle" ? (dur("focus") - left) / 60000 : 0);
  paintPomoBadges();
  $("#pomo-time").textContent = fmt(left);
  const total = dur(st.mode);
  $("#pomo-fill").style.width = `${Math.min(100, Math.max(0, (1 - left / total) * 100))}%`;
  document.title = st.status === "running" ? `${fmt(left)} ${st.mode === "focus" ? "집중" : "휴식"} · DeepFin` : BASE_TITLE;
}

// ---- 시간 설정(집중/휴식 분, 자주 쓰는 조합, 자동 기록) ----
const FOCUS_MIN = 5, FOCUS_MAX = 90, BREAK_MIN = 1, BREAK_MAX = 30;

function renderSettings() {
  const cfg = getSettings();
  const locked = st.status !== "idle";
  const f = $("#ps-focus"), b = $("#ps-break");
  if (document.activeElement !== f) f.value = cfg.focus;
  if (document.activeElement !== b) b.value = cfg.brk;
  $("#pomo-set").disabled = locked;
  $("#ps-lock").hidden = !locked;
}

function initPomoSettings() {
  const err = $("#ps-error");
  const apply = (patch) => { err.textContent = ""; updateSettings(patch); renderSettings(); };
  const read = (input, lo, hi, label) => {
    const n = Number(input.value);
    if (!Number.isInteger(n) || n < lo || n > hi) {
      err.textContent = `${label}은 ${lo}~${hi}분 사이의 정수로 정해 주세요.`;
      return null;
    }
    return n;
  };
  $("#ps-focus").addEventListener("change", () => { const n = read($("#ps-focus"), FOCUS_MIN, FOCUS_MAX, "집중 시간"); if (n != null) apply({ focus: n }); else renderSettings(); });
  $("#ps-break").addEventListener("change", () => { const n = read($("#ps-break"), BREAK_MIN, BREAK_MAX, "휴식 시간"); if (n != null) apply({ brk: n }); else renderSettings(); });
  const step = (key, delta, lo, hi) => () => apply({ [key]: Math.min(hi, Math.max(lo, getSettings()[key === "focus" ? "focus" : "brk"] + delta)) });
  $("#ps-f-dec").addEventListener("click", step("focus", -5, FOCUS_MIN, FOCUS_MAX));
  $("#ps-f-inc").addEventListener("click", step("focus", 5, FOCUS_MIN, FOCUS_MAX));
  $("#ps-b-dec").addEventListener("click", step("brk", -1, BREAK_MIN, BREAK_MAX));
  $("#ps-b-inc").addEventListener("click", step("brk", 1, BREAK_MIN, BREAK_MAX));
}

function render() {
  resetDay();
  renderSettings();
  const left = st.status === "running" ? st.endAt - Date.now() : st.remaining;
  $("#pomo-mode").textContent = st.mode === "focus" ? "집중" : "휴식";
  $("#pomo-mode").dataset.mode = st.mode;
  $("#pomo-count").textContent = `오늘 ${st.cycles}회 완료`;
  $("#pomo-start").textContent = st.status === "running" ? "일시정지" : st.status === "paused" ? "이어서" : st.mode === "focus" ? "집중 시작" : "휴식 시작";
  $("#pomo-skip").hidden = st.mode !== "break";
  $("#pomo-stop").hidden = !(st.mode === "focus" && st.status !== "idle");
  $("#pomo-reset").textContent = "취소";
  $("#pomo-reset").disabled = st.status === "idle";
  paint(left);
  if (st.status !== "running") document.title = BASE_TITLE;
}

function start() {
  if (isActive("watch")) { toast("스톱워치가 진행 중이에요. 먼저 기록하거나 초기화해 주세요.", true); return; }
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch (_) { /* 무음으로 진행 */ }
  const now = Date.now();
  if (st.status === "idle") st.remaining = dur(st.mode);
  if (st.mode === "focus" && !st.startedAt) st.startedAt = now;
  st.endAt = now + st.remaining;
  st.status = "running";
  $("#pomo-note").textContent = "";
  persist(); startTicking(); render();
}

function pause() {
  st.remaining = Math.max(0, st.endAt - Date.now());
  st.status = "paused";
  stopTicking(); persist(); render();
}

function reset() {
  const wasFocus = st.mode === "focus" && st.status !== "idle";
  stopTicking();
  st.status = "idle"; st.remaining = dur(st.mode); st.startedAt = 0;
  $("#pomo-note").textContent = wasFocus ? "취소해서 기록하지 않았어요." : "";
  persist(); render();
}

// 종료: 지금까지 집중한 시간만큼만 오늘 기록에 더한다(휴식 시간은 포함하지 않는다).
async function stopAndSave() {
  if (st.mode !== "focus" || st.status === "idle") return;
  const left = st.status === "running" ? st.endAt - Date.now() : st.remaining;
  const minutes = Math.floor(Math.max(0, dur("focus") - left) / 60000);
  stopTicking();
  st.status = "idle"; st.remaining = dur("focus"); st.startedAt = 0;
  $("#pomo-note").textContent = "";
  persist(); render();
  if (minutes < 1) { toast("1분 미만이라 기록하지 않았어요."); return; }
  try {
    await addToToday(minutes);
    toast(`${minutes}분을 오늘 기록에 더했어요.`);
  } catch (e) {
    toast(`기록하지 못했어요. ${e.message}`, true);
    $("#pomo-note").textContent = `${minutes}분이 기록되지 않았어요. '직접 입력'에서 추가해 주세요.`;
  }
}

export function initPomodoro() {
  const saved = load(KEY, null);
  if (saved && typeof saved === "object") st = { ...st, ...saved };
  resetDay();
  if (st.status === "running") {
    const overdue = Date.now() - st.endAt;
    if (overdue >= 0) {
      if (overdue > STALE_MS) {
        st.status = "idle"; st.remaining = dur(st.mode); st.startedAt = 0;
        $("#pomo-note").textContent = "자리를 비운 사이 끝난 타이머는 기록하지 않았어요.";
      } else if (st.mode === "focus") { completeFocus(st.endAt); } else { completeBreak(); }
    } else { startTicking(); }
  }
  if (st.status === "idle" && !st.remaining) st.remaining = dur(st.mode);
  render();

  initPomoSettings();
  $("#pomo-start").addEventListener("click", () => (st.status === "running" ? pause() : start()));
  $("#pomo-reset").addEventListener("click", reset);
  $("#pomo-stop").addEventListener("click", stopAndSave);
  $("#pomo-skip").addEventListener("click", () => { stopTicking(); completeBreakSilent(); });
  document.addEventListener("settings:changed", () => {
    if (st.status === "idle") { st.remaining = dur(st.mode); persist(); render(); }
  });
  document.addEventListener("visibilitychange", tick);
}

function completeBreakSilent() {
  st.mode = "focus"; st.status = "idle"; st.remaining = dur("focus"); st.startedAt = 0;
  persist(); render();
}
