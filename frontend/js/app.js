import { api } from "./api.js";
import { $, $$ } from "./util.js";
import { initTheme } from "./theme.js";
import { initHistory } from "./history.js";
import { initChat } from "./chat.js";
import { initSummary } from "./summary.js";
import { initData } from "./data.js";
import { initQuick } from "./quick.js";
import { initPomodoro } from "./pomodoro.js";
import { initRecords } from "./records.js";
import { initStopwatch } from "./stopwatch.js";
import { initBadges } from "./badge.js";
import { initFriends } from "./friends.js";
import { fish, school } from "./fish.js";
import { getMeColor, initSettings } from "./settings.js";

const app = $("#app");
const chatView = $("#view-chat");
const recView = $("#view-record");

// 화면(view): chat = AI 채팅(채팅 목록 포함), record = 공부 기록(기록하기·한눈에 보기·기록 목록 포함), summary = 내 어항(모바일에서만 따로 보임)
function setView(view) {
  app.dataset.view = view;
  recView.hidden = view !== "record";
  $$(".topnav button, .bottom-nav button").forEach((b) => {
    // 데스크톱에서는 어항이 항상 옆에 보이므로 위쪽 메뉴에는 summary 항목이 없다.
    if (b.dataset.view === view) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
}

// 채팅 화면 안: 모바일에서는 채팅 목록과 채팅이 번갈아 보인다(데스크톱은 둘 다 보임).
function setPane(pane) { chatView.dataset.pane = pane; }

// 공부 기록 화면 안: log(기록하기) / view(한눈에 보기)
function setRecTab(tab) {
  recView.dataset.rtab = tab;
  $$(".rec-seg button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.rtab === tab)));
}

async function checkHealth() {
  const s = $("#status"), t = $("#status-text");
  s.dataset.state = "wait";
  t.textContent = "서버 확인 중";
  const slow = setTimeout(() => { t.textContent = "서버를 깨우는 중..."; }, 4000);
  try {
    await api.health();
    s.dataset.state = "ok";
    t.textContent = "서버 연결됨";
  } catch (_) {
    s.dataset.state = "down";
    t.textContent = "서버 연결 안 됨 (눌러서 다시 확인)";
  } finally { clearTimeout(slow); }
}

initTheme();
const drawBrand = () => {
  $("#wm-fish").replaceChildren(fish(getMeColor(), { size: 30 }));
  school($("#school"));
};
initSettings(fish);
drawBrand();
document.addEventListener("settings:changed", (e) => { if (e.detail?.changed?.includes("fishColor")) drawBrand(); });
$$(".topnav button, .bottom-nav button").forEach((b) => b.addEventListener("click", () => {
  setView(b.dataset.view);
  if (b.dataset.view === "chat") setPane("chat");
}));
$$(".rec-seg button").forEach((b) => b.addEventListener("click", () => setRecTab(b.dataset.rtab)));
document.addEventListener("view:chat", () => { setView("chat"); setPane("chat"); });
document.addEventListener("view:chat-list", () => { setView("chat"); setPane("list"); });
document.addEventListener("view:record", (e) => {
  setView("record");
  if (e.detail) setRecTab(e.detail);
  if (e.detail === "log") {
    const q = $("#quick");
    if (!q.hidden) setTimeout(() => $("#q-hours").focus({ preventScroll: false }), 0);
  }
});
$("#status").addEventListener("click", checkHealth);
setView("chat");
setPane("chat");
setRecTab("log");
initChat();
initHistory();
initSummary();
initData();
initQuick();
initPomodoro();
initStopwatch();
initBadges();
initRecords();
initFriends();
$$(".mini-seg button").forEach((b) => b.addEventListener("click", () => {
  const lg = b.dataset.lg;
  $("#quick").hidden = lg !== "manual";
  $("#pomo").hidden = lg !== "pomo";
  $("#watch").hidden = lg !== "watch";
  $$(".mini-seg button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
}));
checkHealth();
