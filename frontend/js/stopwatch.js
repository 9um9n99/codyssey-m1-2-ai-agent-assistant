// 스톱워치: 일시정지는 잠깐 멈추기, 완료는 지금까지 잰 시간을 바로 오늘 기록에 더하기.
import { $, toast } from "./util.js";
import { addToToday } from "./pomodoro.js";
import { setBadge, isActive, setLive } from "./badge.js";

const KEY = "deepfin.watch";
const BASE_TITLE = "DeepFin";
const BASE_TITLE_FULL = document.title;
let st = { status: "idle", startedAt: 0, acc: 0 }; // acc: 이전까지 쌓인 시간(ms), startedAt: 지금 구간을 시작한 시각
let timer = null;
let busy = false;

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (_) { return null; } };
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) { /* 저장 불가여도 동작 */ } };

const elapsed = () => st.acc + (st.status === "running" ? Date.now() - st.startedAt : 0);

function fmt(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

function render() {
  const ms = elapsed();
  setLive("watch", st.status === "idle" ? 0 : ms / 60000);
  $("#watch-time").textContent = fmt(ms);
  $("#watch-start").textContent = st.status === "running" ? "일시정지" : st.status === "paused" ? "이어서" : "측정 시작";
  $("#watch-save").hidden = st.status === "idle";
  $("#watch-save").disabled = busy;
  $("#watch-reset").disabled = st.status === "idle" && ms === 0;
  const on = st.status !== "idle";
  setBadge("watch", on ? { label: `${st.status === "paused" ? "일시정지" : "측정"} ${fmt(ms)}`, mode: st.status === "paused" ? "paused" : "watch" } : null);
  if (st.status === "running") document.title = `${fmt(ms)} 측정 · ${BASE_TITLE}`;
  else if (document.title.endsWith(`측정 · ${BASE_TITLE}`)) document.title = BASE_TITLE_FULL;
}

function startTicking() { stopTicking(); timer = setInterval(render, 500); }
function stopTicking() { if (timer) { clearInterval(timer); timer = null; } }

function start() {
  if (isActive("pomo")) { toast("뽀모도로가 진행 중이에요. 먼저 끝내거나 초기화해 주세요.", true); return; }
  st.startedAt = Date.now();
  st.status = "running";
  persist(); startTicking(); render();
}

function pause() {
  st.acc = elapsed(); st.startedAt = 0; st.status = "paused";
  stopTicking(); persist(); render();
}

function reset() {
  stopTicking();
  st = { status: "idle", startedAt: 0, acc: 0 };
  persist(); render();
}

async function save() {
  const minutes = Math.min(1440, Math.floor(elapsed() / 60000));
  if (busy) return;
  if (minutes < 1) { reset(); toast("1분 미만이라 기록하지 않았어요."); return; }
  busy = true; render();
  try {
    await addToToday(minutes, "스톱워치");
    toast(`${minutes}분을 오늘 기록에 더했어요.`);
    reset();
  } catch (e) { toast(`기록하지 못했어요. ${e.message}`, true); }
  finally { busy = false; render(); }
}

export function initStopwatch() {
  const saved = load();
  if (saved && typeof saved === "object") st = { ...st, ...saved };
  if (st.status === "running") startTicking();
  render();
  $("#watch-start").addEventListener("click", () => (st.status === "running" ? pause() : start()));
  $("#watch-reset").addEventListener("click", reset);
  $("#watch-save").addEventListener("click", save);
  document.addEventListener("visibilitychange", render);
}
