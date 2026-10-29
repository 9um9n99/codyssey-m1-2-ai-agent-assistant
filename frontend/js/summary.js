import { api } from "./api.js";
import { ME_NAME } from "./state.js";
import { $, el, emit, fmtMinutes, fmtHours, toast } from "./util.js";
import { fish } from "./fish.js";
import { paintBadges, openTimer, getLive } from "./badge.js";
import { getMeColor, FRIEND_COLOR } from "./settings.js";

const body = () => $("#summary-body");

const trendEl = (t) => {
  if (!t || t.change_pct == null) return el("span", { class: "trend", text: t?.label || "" });
  const cls = t.label === "증가" ? "up" : t.label === "감소" ? "down" : "";
  const sign = t.change_pct > 0 ? "+" : "";
  return el("span", { class: `trend ${cls}`, text: `최근 14일 ${t.label} ${sign}${t.change_pct.toFixed(0)}%` });
};

// 수심 규칙(놀이 규칙): 오늘 공부한 시간만큼 깊어지고, 매일 자정에 얕은 물로 돌아간다.
const LEVELS = [
  { min: 0, name: "얕은 물", depth: 1 },
  { min: 60, name: "햇살층", depth: 10 },
  { min: 120, name: "산호숲", depth: 30 },
  { min: 240, name: "푸른 바다", depth: 100 },
  { min: 360, name: "어두운 바다", depth: 300 },
  { min: 480, name: "심해", depth: 1000 },
];
let prevLevel = null;
let lastSummary = null;

const todayTotal = (s) => s.today?.me_minutes ?? 0;
// 기록 + 진행 중인 타이머 시간(분, 소수 포함). 게이지가 시간이 흐르는 대로 움직이게 한다.
const liveTotal = (s) => todayTotal(s) + getLive();

function bowlState(s) {
  const total = liveTotal(s);
  const lv = levelOf(total);
  const cur = LEVELS[lv], next = LEVELS[lv + 1];
  const pct = next ? Math.min(100, ((total - cur.min) / (next.min - cur.min)) * 100) : 100;
  const whole = Math.floor(total);
  return {
    lv, cur, pct,
    nextText: next ? `${fmtMinutes(Math.ceil(next.min - total))} 더 공부하면 '${next.name.replace(/ /g, "\u00a0")}'에 닿아요.` : "오늘 가장 깊은 곳에 도착했어요!",
    sumText: whole > 0 ? `오늘 ${fmtMinutes(whole)} 공부했어요` : "오늘 아직 기록이 없어요",
  };
}

function levelOf(total) {
  let i = 0;
  LEVELS.forEach((l, idx) => { if (total >= l.min) i = idx; });
  return i;
}

function weed(cls, d) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 30 70");
  svg.setAttribute("class", `deco ${cls}`);
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", d);
  p.setAttribute("fill", "none");
  p.setAttribute("stroke-width", "6");
  p.setAttribute("stroke-linecap", "round");
  svg.append(p);
  return svg;
}

// 오늘 순위(같은 시각까지 쌓은 시간 기준). 어항 카드와 순위 목록이 같은 값을 쓴다.
function rankRows(s) {
  const td = s.today;
  const rows = [{ person: s.me_name, minutes: td.me_minutes ?? 0, me: true }, ...td.friends.map((f) => ({ person: f.person, minutes: f.minutes }))];
  // 공부한 시간이 같으면 내가 앞서고, 0분이면(아직 공부 전) 꼴찌로 둔다.
  const tie = (r) => (r.me ? (r.minutes > 0 ? -1 : 1) : 0);
  rows.sort((a, b) => b.minutes - a.minutes || tie(a) - tie(b));
  return rows;
}

function bowlRank(s) {
  const td = s.today;
  if (!td) return el("p", { class: "bowl-line", id: "bowl-rank", text: "기록을 남기면 내 물고기가 깊은 바다로 내려가기 시작해요." });
  const rows = rankRows(s);
  return el("div", { class: "bowl-rank", id: "bowl-rank" },
    el("p", { class: "rk-main" }, "오늘 ", el("b", { text: `${rows.findIndex((r) => r.me) + 1}위` }), ` / ${rows.length}명`),
    el("p", { class: "rk-sub", text: `${td.as_of} 기준` }));
}

function bowlCard(s, levelUp) {
  const { lv, cur, pct, nextText, sumText } = bowlState(s);

  const bob = el("div", { class: "bob" });
  bob.append(fish(getMeColor(), { size: 64, crown: lv === LEVELS.length - 1 }));
  const swimmer = el("div", { class: "swimmer", style: `--fs:${(0.75 + lv * 0.14).toFixed(2)}` }, bob);

  const scene = el("div", { class: "bowl-scene", "aria-hidden": "true" },
    [1, 2, 3, 4, 5].map((n) => el("span", { class: `bub b${n}` })),
    weed("w1", "M15 68 C5 55 25 45 15 32 C8 22 20 12 15 4"),
    weed("w2", "M15 68 C25 55 5 45 15 32 C22 22 10 12 15 4"),
    el("span", { class: "deco rock" }),
    el("span", { class: "deco coral" }),
    el("span", { class: "deco star" }),
    el("div", { class: "sand" }),
    swimmer);

  const line = bowlRank(s);

  const card = el("div", { class: "bowl" + (levelUp ? " levelup" : ""), "data-level": lv + 1 },
    scene,
    el("button", { type: "button", class: "pomo-badge scene-timer", hidden: true, "aria-label": "뽀모도로 타이머 열기", onclick: () => openTimer() }),
    el("div", { class: "bowl-info" },
      el("div", { class: "lv-row" }, el("span", { class: "lv-chip", text: `Lv.${lv + 1}` }), el("span", { class: "lv-name", text: cur.name }), el("span", { class: "lv-total", text: `수심 ${cur.depth.toLocaleString("ko-KR")}m` }), el("button", { type: "button", class: "info-btn", "aria-label": "어항과 수심 설명 보기", text: "i", onclick: () => emit("info:open") })),
      el("div", { class: "progress", role: "progressbar", "aria-label": "다음 수심까지", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(pct) }, el("i", { style: `width:${pct}%` })),
      el("div", { class: "lv-next" },
        el("p", { text: nextText }),
        el("p", { class: "lv-sum", text: sumText })),
      line));
  return { card, lv };
}

function ranking(s) {
  const td = s.today;
  if (!td) return el("div", { id: "rank-box" });
  const rows = rankRows(s);
  const max = Math.max(60, ...rows.map((p) => p.minutes));
  return el("div", { id: "rank-box" }, rows.map((p, i) => {
    const color = p.me ? getMeColor() : FRIEND_COLOR;
    const row = p.me ? el("div", { class: "rank-row me" }) : el("button", { type: "button", class: "rank-row friend", "aria-label": `${p.person} 소개 보기`, onclick: () => emit("friend:open", p.person) });
    row.append(
      el("span", { class: "no", text: i + 1 }),
      el("span", { class: "rk-fish" }, fish(color, { size: 28 })),
      el("span", { class: "name", text: p.person }),
      el("div", { class: "bar", role: "img", "aria-label": `${p.person} 오늘 ${fmtMinutes(p.minutes)}` }, el("i", { style: `width:${(p.minutes / max) * 100}%;background:${color}` })),
      el("span", { class: "val", text: fmtHours(p.minutes) }));
    return row;
  }));
}

// ---- 오늘 지금까지: 하루가 흘러가는 동안 친구들 값이 늘어난다 ----
function todayRows(td) {
  const max = Math.max(60, td.me_minutes ?? 0, ...td.friends.map((f) => f.minutes));
  const row = (name, minutes, color, cls = "") => el("div", { class: `td-row ${cls}` },
    el("span", { class: "td-fish" }, fish(color, { size: 24 })),
    el("span", { class: "td-name", text: name }),
    el("div", { class: "bar", role: "img", "aria-label": `${name} 오늘 ${fmtMinutes(minutes)}` }, el("i", { style: `width:${(minutes / max) * 100}%;background:${color}` })),
    el("span", { class: "val", text: minutes == null ? "-" : fmtMinutes(minutes) }));
  const rows = [row("나", td.me_minutes ?? 0, getMeColor(), "me"), row("친구 평균", td.friends_avg_minutes, FRIEND_COLOR)];
  return { rows, max, row };
}

function fillToday(box, s) {
  const td = s.today;
  if (!td) { box.hidden = true; return; }
  box.hidden = false;
  const { rows, row } = todayRows(td);
  let verdict;
  if (td.me_minutes == null) verdict = "오늘 기록이 아직 없어요.";
  else {
    const diff = td.me_minutes - td.friends_avg_minutes;
    verdict = diff === 0 ? "지금 시각의 친구 평균과 같아요." : `지금 시각 기준 친구 평균보다 ${fmtMinutes(Math.abs(diff))} ${diff > 0 ? "많아요" : "적어요"}.`;
  }
  const detail = el("details", { class: "td-more" }, el("summary", { text: "친구별로 보기" }),
    ...td.friends.map((f) => row(`${f.person}`, f.minutes, FRIEND_COLOR)));
  box.replaceChildren(
    el("div", { class: "sec-title" }, "오늘 지금까지",
      el("span", {}, `${td.as_of} 기준 `, el("button", { type: "button", class: "link-btn", onclick: () => emit("view:record", "log"), text: "기록하러 가기" }))),
    ...rows, el("p", { class: "td-verdict", text: verdict }), detail);
}

function todaySection(s) {
  const box = el("section", { class: "today", id: "today-box" });
  fillToday(box, s);
  return box;
}


// ---- 어항·수심 설명 (i 버튼) ----
function openInfo() {
  const s = lastSummary;
  const now = levelOf(s ? todayTotal(s) : 0);
  const sec = (title, ...lines) => el("section", { class: "info-sec" }, el("h3", { text: title }), ...lines.map((t) => el("p", { text: t })));
  const table = el("ol", { class: "lv-table" }, LEVELS.map((l, i) => el("li", { class: i === now ? "now" : "" },
    el("b", { text: `Lv.${i + 1}` }),
    el("span", { class: "lt-name", text: l.name }),
    el("span", { class: "lt-depth", text: `수심 ${l.depth.toLocaleString("ko-KR")}m` }),
    el("span", { class: "lt-min", text: i === 0 ? "시작" : `오늘 ${l.min / 60}시간부터` }))));
  $("#info-body").replaceChildren(
    sec("수심은 하루 단위예요", "내 물고기는 오늘 공부한 시간만큼 깊은 바다로 내려가요.", "매일 자정이 되면 다시 얕은 물에서 시작해요.", "기록을 수정하거나 지우면 수심도 바로 바뀌어요."),
    el("section", { class: "info-sec" }, el("h3", { text: "수심 단계" }), table),
    sec("순위도 오늘 기준이에요", "순위는 오늘 같은 시각까지 공부한 시간이 많은 순서예요.", "나와 친구 9명, 모두 10명을 비교해요.", "친구들의 시간은 하루가 흐르는 동안 조금씩 늘어나서, 순위가 바뀔 수 있어요.", "아침에는 모두 0분에서 시작하니까, 먼저 공부하면 앞서가요."),
    sec("지난 기록은 어디서 봐요?", "공부 기록 화면의 한눈에 보기에서 최근 7일 평균과 하루별 그래프로 볼 수 있어요.", "공부하지 않은 날은 0분으로 계산돼요."),
    sec("친구는 누구예요?", "친구 9명은 가상 인물이고, 기록도 이 서비스를 위해 만든 예시 데이터예요.", "실제 사람의 공부 시간이 아니에요."));
  $("#dlg-info").showModal();
}

let pollTimer = null;
async function poll() {
  if (document.visibilityState !== "visible" || !lastSummary) return;
  try {
    const s = await api.summary();
    const structural = s.period !== lastSummary.period || (s.me?.count ?? 0) !== (lastSummary.me?.count ?? 0) || s.rank_total !== lastSummary.rank_total || s.today?.date !== lastSummary.today?.date; // 자정이 지나면 수심도 다시 시작
    lastSummary = s;
    if (structural) render(s);
    else {
      const box = document.getElementById("today-box"); if (box) fillToday(box, s);
      document.getElementById("rank-box")?.replaceWith(ranking(s)); // 친구 시간이 늘어나면 순위도 바뀐다
      document.getElementById("bowl-rank")?.replaceWith(bowlRank(s));
    }
    document.dispatchEvent(new CustomEvent("summary:loaded", { detail: s }));
  } catch (_) { /* 조용히 다음 주기에 다시 시도 */ }
}

export const getLastSummary = () => lastSummary;

// 진행 중인 타이머 시간이 바뀔 때마다 어항 카드를 다시 그리지 않고 필요한 부분만 고친다(물고기 움직임이 끊기지 않게).
function patchBowl() {
  const s = lastSummary, card = document.querySelector(".bowl");
  if (!s || !card) return;
  const { lv, cur, pct, nextText, sumText } = bowlState(s);
  const set = (sel, text) => { const n = card.querySelector(sel); if (n && n.textContent !== text) n.textContent = text; };
  set(".lv-chip", `Lv.${lv + 1}`);
  set(".lv-name", cur.name);
  set(".lv-total", `수심 ${cur.depth.toLocaleString("ko-KR")}m`);
  set(".lv-next p:first-child", nextText);
  set(".lv-sum", sumText);
  const bar = card.querySelector(".progress");
  if (bar) { bar.firstElementChild.style.width = `${pct}%`; bar.setAttribute("aria-valuenow", String(Math.round(pct))); }
  if (prevLevel !== null && lv !== prevLevel) {
    card.dataset.level = String(lv + 1);
    card.querySelector(".swimmer")?.style.setProperty("--fs", (0.75 + lv * 0.14).toFixed(2));
    document.body.dataset.depth = String(lv + 1);
    if (lv > prevLevel) toast(`수심 ${LEVELS[lv].depth}m, ${LEVELS[lv].name}에 도착! Lv.${lv + 1}`);
    prevLevel = lv;
  }
}

function render(s) {
  const m = s.metrics;
  const { card, lv } = bowlCard(s, prevLevel !== null && levelOf(liveTotal(s)) > prevLevel);
  if (prevLevel !== null && lv > prevLevel) toast(`수심 ${LEVELS[lv].depth}m, ${LEVELS[lv].name}에 도착! Lv.${lv + 1}`);
  prevLevel = lv;
  document.body.dataset.depth = String(lv + 1);

  const friends = el("section", { class: "sec" },
    el("div", { class: "sec-title" }, `친구 ${s.people_count}명`, el("button", { type: "button", class: "link-btn", onclick: () => emit("friend:open", null), text: "친구 소개" })));
  if (m) {
    const t = s.trend;
    const lines = [`친구 ${s.people_count}명은 하루 평균 ${fmtMinutes(m.average_minutes)} 공부해요.`];
    if (t.change_pct != null && t.label !== "데이터 부족") {
      const p = Math.abs(Math.round(t.change_pct));
      lines.push(p < 3 ? "최근 2주 공부 시간은 그 전과 비슷해요." : `최근 2주는 그 전 2주보다 ${p}% ${t.change_pct > 0 ? "늘었어요" : "줄었어요"}.`);
    }
    friends.append(el("div", { class: "friend-lines" }, lines.map((l) => el("p", { text: l }))));
  } else {
    friends.append(el("p", { class: "muted", text: "아직 친구 기록이 없어요." }));
  }
  friends.append(el("div", { class: "sub-title", text: "오늘 순위" }), ranking(s));

  body().replaceChildren(card, todaySection(s), friends);
  paintBadges();
}

export async function loadSummary() {
  try {
    const s = await api.summary();
    lastSummary = s;
    render(s);
    document.dispatchEvent(new CustomEvent("summary:loaded", { detail: s }));
  } catch (e) {
    body().replaceChildren(el("div", { class: "errbox" }, `요약을 불러오지 못했어요. ${e.message}`,
      el("div", {}, el("button", { class: "btn-line", onclick: loadSummary }, "다시 시도"))));
  }
}

export function initSummary() {
  document.addEventListener("info:open", openInfo);
  document.addEventListener("live:changed", patchBowl);
  $("#info-close").addEventListener("click", () => $("#dlg-info").close());
  document.addEventListener("data:changed", loadSummary);
  document.addEventListener("settings:changed", (e) => { if (lastSummary && e.detail?.changed?.includes("fishColor")) render(lastSummary); }); // 물고기 색만 바꿀 때는 서버를 다시 부르지 않는다
  loadSummary();
  if (!pollTimer) pollTimer = setInterval(poll, 60000); // 1분마다 '오늘 지금까지'를 새로 가져온다
  document.addEventListener("visibilitychange", poll); // 다른 탭에 있다 돌아오면 바로 최신 값으로
}
