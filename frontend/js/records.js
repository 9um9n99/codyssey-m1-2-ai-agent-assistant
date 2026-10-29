// 공부 기록 → 한눈에 보기
// 사용자가 알고 싶은 것: "요즘 나는 친구들에 비해 어느 정도 공부하고 있지?"
//   1) 최근 7일 하루 평균: 나 vs 친구 평균 (한 줄 결론 포함)
//   2) 하루별 공부 시간 그래프: 내 막대 + 친구 평균 선 (2주 / 한 달)
//   3) 이번 주 합계, 연속 공부일
import { api } from "./api.js";
import { ME_NAME } from "./state.js";
import { $, el, emit, fmtMinutes, todayStr } from "./util.js";
import { getLastSummary } from "./summary.js";

const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  kids.forEach((c) => c && n.append(c.nodeType ? c : document.createTextNode(String(c))));
  return n;
};

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n) => String(n).padStart(2, "0");
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmtD(d); };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const short = (s) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const hh = (m) => `${(m / 60).toFixed(1)}h`;

let mine = new Map(); // 날짜 → 내 분
let friends = new Map(); // 날짜 → 친구 평균 분(끝난 날)
let loaded = false;
let failed = null;
let range = 14; // 그래프에 보여 줄 일수
let chartW = 640; // 컨테이너 너비에 맞춰 1:1로 그려서 글자가 줄어들지 않게 한다

function aggregate(rows) {
  mine = new Map();
  const sum = new Map(), cnt = new Map();
  for (const r of rows) {
    if (r.person === ME_NAME) { mine.set(r.date, r.value); continue; }
    sum.set(r.date, (sum.get(r.date) || 0) + r.value);
    cnt.set(r.date, (cnt.get(r.date) || 0) + 1);
  }
  friends = new Map([...sum].map(([d, v]) => [d, Math.round(v / cnt.get(d))]));
}

export async function refreshRecords() {
  try {
    // 전체를 한 번에 받으면 친구 9명 때문에 내 기록이 잘리므로 내 기록은 따로 받는다.
    const [mineRows, allRows] = await Promise.all([api.listData(ME_NAME, 500), api.listData("", 500)]);
    aggregate([...mineRows, ...allRows.filter((r) => r.person !== ME_NAME)]);
    loaded = true; failed = null;
  } catch (e) { failed = e.message; }
  render();
}

// 그날 친구 평균. 오늘은 하루가 끝나지 않았으니 '지금까지' 값(요약 API)을 쓴다.
function friendAvg(date) {
  const td = getLastSummary()?.today;
  if (td && td.date === date) return td.friends_avg_minutes;
  return friends.get(date) ?? null;
}

/* ---------- 1) 최근 7일 하루 평균: 나 vs 친구 ---------- */
function compareCard() {
  const today = todayStr();
  const first = [...mine.keys()].sort()[0];
  const sec = el("section", { class: "rec-sec cmp" });
  if (!first || first > today) {
    sec.append(el("h2", { text: "최근 7일 하루 평균" }),
      el("div", { class: "rec-empty" },
        el("div", {}, el("p", { text: "아직 내 기록이 없어요." }), el("p", { text: "오늘 공부한 시간을 기록하면 친구들과 비교해 보여 줘요." })),
        el("button", { type: "button", class: "btn-primary", text: "오늘 기록하기", onclick: () => emit("view:record", "log") })));
    return sec;
  }
  const winStart = addDays(today, -6);
  const start = first > winStart ? first : winStart; // 기록을 시작하기 전 날짜는 0분으로 세지 않는다
  const n = daysBetween(start, today) + 1;
  let me = 0, fr = 0, frn = 0;
  for (let i = 0; i < n; i++) {
    const d = addDays(start, i);
    me += mine.get(d) || 0;
    const f = friendAvg(d);
    if (f != null) { fr += f; frn++; }
  }
  const meAvg = Math.round(me / n);
  const frAvg = frn ? Math.round(fr / frn) : null;
  const max = Math.max(60, meAvg, frAvg || 0);
  const row = (name, v, color) => el("div", { class: "cmp-row" },
    el("span", { class: "cmp-name" }, el("i", { class: "cmp-dot", style: `background:${color}` }), name),
    el("div", { class: "bar", role: "img", "aria-label": `${name} 하루 평균 ${fmtMinutes(v)}` }, el("i", { style: `width:${(v / max) * 100}%;background:${color}` })),
    el("span", { class: "val", text: fmtMinutes(v) }));
  let verdict = "";
  if (frAvg != null) {
    const diff = meAvg - frAvg;
    verdict = Math.abs(diff) < 5 ? "친구 평균과 비슷해요." : `친구 평균보다 ${fmtMinutes(Math.abs(diff))} ${diff > 0 ? "많아요" : "적어요"}.`;
  }
  sec.append(...[
    el("h2", {}, n < 7 ? `${short(start)}부터 하루 평균` : "최근 7일 하루 평균"),
    row("나", meAvg, "var(--me)"),
    frAvg != null ? row("친구 평균", frAvg, "var(--friend)") : null,
    verdict ? el("p", { class: "cmp-verdict", text: verdict }) : null].filter(Boolean));
  return sec;
}

/* ---------- 2) 하루별 그래프 ---------- */
function niceTop(maxH) {
  for (const step of [1, 2, 4, 6]) if (Math.ceil(maxH / step) <= 4) return { step, top: Math.max(2, Math.ceil(maxH / step)) * step };
  return { step: 6, top: Math.ceil(maxH / 6) * 6 };
}

function dailyChart() {
  const today = todayStr();
  const days = Array.from({ length: range }, (_, i) => addDays(today, i - (range - 1)));
  const vals = days.map((d) => mine.get(d));
  const fr = days.map((d) => friendAvg(d));
  const maxH = Math.max(1, ...vals.map((v) => (v || 0) / 60), ...fr.map((v) => (v || 0) / 60));
  const { step, top } = niceTop(maxH);
  const W = chartW, narrow = W < 480, H = narrow ? 230 : 260, L = 34, R = 6, T = 18, B = narrow ? 34 : 44;
  const iw = W - L - R, ih = H - T - B, band = iw / days.length, bw = Math.min(26, band * 0.62);
  const y = (h) => T + ih - (h / top) * ih;
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": `최근 ${range}일 하루별 내 공부 시간(막대)과 친구 평균(선)` });

  days.forEach((d, i) => { // 주말 배경
    const wd = parse(d).getDay();
    if (wd === 0 || wd === 6) s.append(svg("rect", { x: L + band * i, y: T, width: band, height: ih, class: "wk" }));
  });
  for (let h = 0; h <= top; h += step) {
    s.append(svg("line", { x1: L, x2: W - R, y1: y(h), y2: y(h), class: h === 0 ? "ax" : "grid" }),
      svg("text", { x: L - 6, y: y(h) + 4, class: "tick", "text-anchor": "end" }, `${h}h`));
  }
  const maxV = Math.max(0, ...vals.map((v) => v || 0));
  const maxIdx = maxV > 0 ? vals.findIndex((v) => v === maxV) : -1; // 가장 많이 한 날 하나만 값 표시
  days.forEach((d, i) => {
    const cx = L + band * i + band / 2, v = vals[i], isToday = d === today, wd = parse(d).getDay();
    const tip = [`${short(d)} (${WD[wd]})${isToday ? " · 오늘, 진행 중" : ""}`, v != null ? `나 ${fmtMinutes(v)}` : "나 기록 없음", fr[i] != null ? `친구 평균 ${fmtMinutes(fr[i])}${isToday ? " (지금까지)" : ""}` : "친구 기록 없음"].join("\n");
    const g = svg("g", { "data-tip": tip });
    g.append(svg("rect", { x: L + band * i, y: T, width: band, height: ih + B - 8, fill: "transparent" }));
    if (v) {
      const h = Math.max(2, (v / 60 / top) * ih), r = Math.min(4, bw / 2, h);
      g.append(svg("path", { class: isToday ? "bar-me today" : "bar-me", d: `M${cx - bw / 2},${T + ih} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${bw - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z` }));
      if (isToday || (i === maxIdx && range <= 14)) g.append(svg("text", { x: cx, y: Math.min(T + ih - h, fr[i] != null ? y(fr[i] / 60) : 1e9) - 8, class: "val-label", "text-anchor": "middle" }, hh(v)));
    }
    const every = band < 12 ? 5 : band < 20 ? 2 : 1; // 칸이 좁으면 날짜를 건너뛰며 표시
    const showLab = isToday ? true : (i % every === 0 && (days.length - 1 - i) >= (every > 1 ? 2 : 0));
    const lab = isToday ? "오늘" : (i === 0 || parse(d).getDate() === 1) ? short(d) : String(parse(d).getDate());
    if (showLab) g.append(svg("text", { x: cx, y: H - B + 16, class: isToday ? "tick today-tick" : "tick", "text-anchor": "middle" }, lab));
    if (band >= 16 && (every === 1 || isToday)) g.append(svg("text", { x: cx, y: H - B + 31, class: wd === 0 || wd === 6 ? "tick wkd" : "tick", "text-anchor": "middle" }, WD[wd]));
    s.append(g);
  });
  // 친구 평균 선 (값이 있는 날만 이어서)
  let path = "";
  fr.forEach((v, i) => {
    if (v == null) return;
    const cx = L + band * i + band / 2;
    path += `${path && fr[i - 1] != null ? "L" : "M"}${cx},${y(v / 60)} `;
  });
  if (path) s.append(svg("path", { d: path, class: "line-fr" }));
  fr.forEach((v, i) => {
    if (v == null) return;
    s.append(svg("circle", { class: days[i] === today ? "dot-fr hollow" : "dot-fr", cx: L + band * i + band / 2, cy: y(v / 60), r: range <= 14 ? 4 : 3 }));
  });

  const table = el("table", { class: "sr-only" }, el("caption", { text: `최근 ${range}일 하루별 공부 시간` }),
    el("thead", {}, el("tr", {}, el("th", { text: "날짜" }), el("th", { text: "나" }), el("th", { text: "친구 평균" }))),
    el("tbody", {}, days.map((d, i) => el("tr", {}, el("td", { text: d }), el("td", { text: vals[i] != null ? fmtMinutes(vals[i]) : "기록 없음" }), el("td", { text: fr[i] != null ? fmtMinutes(fr[i]) : "-" })))));

  const toggle = el("div", { class: "mini-seg range-seg", role: "radiogroup", "aria-label": "기간" },
    [[14, "2주"], [30, "한 달"]].map(([n, t]) => el("button", { type: "button", role: "radio", "aria-checked": String(range === n), text: t, onclick: () => { range = n; render(); } })));
  return el("section", { class: "rec-sec" },
    el("div", { class: "rec-sec-head" }, el("h2", { text: "하루별 공부 시간" }), toggle),
    el("div", { class: "legend" },
      el("span", {}, el("i", { class: "sw sw-me" }), "나"),
      el("span", {}, el("i", { class: "sw sw-fr" }), "친구 9명 평균"),
      el("span", { class: "legend-note" }, "회색 배경은 주말")),
    s, table);
}

/* ---------- 3) 이번 주 / 연속 ---------- */
function insightList() {
  const today = todayStr();
  const dow = (parse(today).getDay() + 6) % 7; // 월=0
  const weekStart = addDays(today, -dow);
  const sum = (from, n) => { let t = 0; for (let i = 0; i < n; i++) t += mine.get(addDays(from, i)) || 0; return t; };
  const thisWeek = sum(weekStart, dow + 1);
  const lastWeek = sum(addDays(weekStart, -7), dow + 1); // 지난주 같은 요일까지
  let streak = 0, d = (mine.get(today) || 0) > 0 ? today : addDays(today, -1);
  while ((mine.get(d) || 0) > 0) { streak++; d = addDays(d, -1); }
  const diff = thisWeek - lastWeek;
  const rows = [];
  if (thisWeek || lastWeek) {
    rows.push(el("li", {},
      el("span", { class: "il-l", text: "이번 주 (월요일부터 오늘까지)" }),
      el("span", { class: "il-v" }, fmtMinutes(thisWeek), el("em", { class: diff > 0 ? "up" : diff < 0 ? "down" : "", text: diff === 0 ? " 지난주와 같아요" : ` 지난주 같은 요일까지보다 ${diff > 0 ? "+" : "-"}${fmtMinutes(Math.abs(diff))}` }))));
  }
  if (streak > 0) rows.push(el("li", {}, el("span", { class: "il-l", text: "연속으로 공부한 날" }), el("span", { class: "il-v", text: `${streak}일째` })));
  return rows.length ? el("section", { class: "rec-sec" }, el("ul", { class: "insights" }, rows)) : null;
}

function render() {
  const box = $("#records");
  if (failed) {
    box.replaceChildren(el("div", { class: "errbox" }, `기록을 불러오지 못했어요. ${failed}`, el("div", {}, el("button", { class: "btn-line", onclick: refreshRecords }, "다시 시도"))));
    return;
  }
  if (!loaded) return;
  const cs = getComputedStyle(box);
  const inner = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  chartW = inner > 0 ? Math.max(290, Math.round(Math.min(inner, 800) - 4)) : 640;
  const tip = $("#tip") || el("div", { id: "tip", class: "tip", role: "tooltip", hidden: true });
  const hasMine = mine.size > 0;
  box.replaceChildren(el("div", { class: "rec-inner" }, compareCard(), hasMine ? dailyChart() : null, hasMine ? insightList() : null), tip);
}

export function initRecords() {
  const box = $("#records");
  const show = (e) => {
    const t = e.target.closest?.("[data-tip]");
    const tip = $("#tip");
    if (!tip) return;
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute("data-tip");
    tip.hidden = false;
    const r = box.getBoundingClientRect();
    const x = Math.min(e.clientX - r.left + 12, r.width - tip.offsetWidth - 8);
    tip.style.left = `${Math.max(4, x)}px`;
    tip.style.top = `${e.clientY - r.top + box.scrollTop - tip.offsetHeight - 10}px`;
  };
  let lastW = box.clientWidth;
  new ResizeObserver(() => { // 화면 너비가 바뀌거나 숨겨졌던 탭이 보이면 그래프를 다시 그린다
    if (Math.abs(box.clientWidth - lastW) > 6) { lastW = box.clientWidth; if (loaded && lastW) render(); }
  }).observe(box);
  box.addEventListener("pointermove", show);
  box.addEventListener("pointerleave", () => { const t = $("#tip"); if (t) t.hidden = true; });
  box.addEventListener("click", show);
  document.addEventListener("data:changed", refreshRecords);
  document.addEventListener("summary:loaded", () => { if (loaded) render(); }); // 1분마다 갱신되는 '오늘 지금까지' 반영
  document.addEventListener("settings:changed", (e) => { if (e.detail?.changed?.includes("fishColor")) render(); });
  refreshRecords();
}
