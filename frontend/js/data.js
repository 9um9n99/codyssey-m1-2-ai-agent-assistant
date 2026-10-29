import { api } from "./api.js";
import { ME_NAME } from "./state.js";
import { $, el, emit, toast, todayStr, fmtMinutes, confirmDialog } from "./util.js";

const PAGE = 30;
let limit = PAGE;
let editing = null;

const readDur = (h, m) => {
  const hh = Number(h.value || 0), mm = Number(m.value || 0);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || mm < 0 || mm > 59 || hh > 24) return null;
  const total = hh * 60 + mm;
  return total > 1440 ? null : total;
};

const WD = ["일", "월", "화", "수", "목", "금", "토"];
function dateLabel(s) {
  const [y, m, d] = s.split("-").map(Number);
  const wd = WD[new Date(y, m - 1, d).getDay()];
  return `${y === Number(todayStr().slice(0, 4)) ? "" : `${y}년 `}${m}월 ${d}일 (${wd})`;
}

async function loadList() {
  const ul = $("#data-list");
  try {
    const rows = await api.listData(ME_NAME, limit);
    $("#data-count").textContent = rows.length ? `내 기록 ${rows.length}일${rows.length >= limit ? " 이상" : ""}` : "내 기록";
    ul.replaceChildren(...(rows.length ? rows.map(row) : [el("li", { class: "empty-note", text: "아직 기록이 없어요." })]));
    $("#data-more").hidden = rows.length < limit;
  } catch (e) {
    ul.replaceChildren(el("li", { class: "empty-note" }, `목록을 불러오지 못했어요. ${e.message} `, el("button", { class: "btn-line", onclick: loadList }, "다시 시도")));
  }
}

function fmtClock(at) {
  if (!at) return "";
  const [h, m] = at.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(m).padStart(2, "0")}`;
}

const SOURCE_NAME = { 뽀모도로: "뽀모도로", 스톱워치: "스톱워치" };

function entryRow(r, e) {
  const label = `${dateLabel(r.date)} ${fmtClock(e.at)}`.trim();
  const src = SOURCE_NAME[e.memo];
  const note = src ? "" : e.memo;
  return el("li", { class: "entry" },
    el("div", {},
      el("div", { class: "d-main" }, fmtClock(e.at) || "시각 없음", src ? el("span", { class: "tag-src", text: src }) : null),
      note ? el("div", { class: "d-sub", text: note }) : null),
    el("b", { class: "d-dur", text: fmtMinutes(e.minutes) }),
    el("div", { class: "d-act" },
      el("button", { type: "button", text: "수정", "aria-label": `${label} 기록 수정`, onclick: () => openEdit(r, e) }),
      el("button", { type: "button", class: "del", text: "삭제", "aria-label": `${label} 기록 삭제`, onclick: () => remove(r, e) })));
}

// 날짜별로 접고 펼치는 목록. 펼친 상태는 새로 불러와도 유지하고, 오늘은 처음에 펼쳐 둔다.
const opened = new Set([todayStr()]);

function row(r) {
  const isToday = r.date === todayStr();
  const entries = (r.entries || []).slice().sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const det = el("details", { class: "day" },
    el("summary", {},
      el("span", { class: "d-main" }, dateLabel(r.date), isToday ? el("span", { class: "tag-me", text: "오늘" }) : null),
      el("span", { class: "d-cnt", text: `${entries.length}번` }),
      el("b", { class: "d-dur", text: fmtMinutes(r.value) })),
    el("ul", { class: "entry-list" }, ...entries.map((e) => entryRow(r, e))));
  det.open = opened.has(r.date);
  det.addEventListener("toggle", () => { det.open ? opened.add(r.date) : opened.delete(r.date); });
  return el("li", { class: "day-item" }, det);
}

async function remove(r, e) {
  if (!(await confirmDialog("기록을 삭제할까요?", `${dateLabel(r.date)} ${fmtClock(e.at)} ${fmtMinutes(e.minutes)} 기록이 지워져요.`.replace(/\s+/g, " ")))) return;
  try {
    await api.deleteEntry(r.id, e.id);
    toast("기록을 삭제했어요.");
    emit("data:changed");
  } catch (ex) { toast(ex.message, true); }
}

function openEdit(r, e) {
  editing = { r, e };
  $("#edit-who").textContent = `${dateLabel(r.date)} ${fmtClock(e.at)}`.trim();
  $("#e-hours").value = Math.floor(e.minutes / 60);
  $("#e-minutes").value = e.minutes % 60;
  $("#e-memo").value = e.memo || "";
  $("#e-error").textContent = "";
  $("#dlg-edit").showModal();
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportData(kind) {
  try {
    const rows = (await api.listData(ME_NAME, 500)).slice().sort((a, b) => a.date.localeCompare(b.date));
    if (!rows.length) return toast("저장할 기록이 없어요.");
    const name = `deepfin-${todayStr()}`;
    const flat = rows.flatMap((r) => (r.entries || []).map((e) => ({ date: r.date, at: e.at || "", minutes: e.minutes, memo: e.memo || "" })));
    if (kind === "json") {
      download(`${name}.json`, JSON.stringify(flat, null, 2), "application/json");
    } else {
      const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const body = flat.map((r) => [r.date, r.at, r.minutes, r.memo].map(cell).join(",")).join("\r\n");
      download(`${name}.csv`, "\ufeff" + "date,time,minutes,memo\r\n" + body, "text/csv;charset=utf-8");
    }
    toast(`${flat.length}건을 저장했어요.`);
  } catch (e) { toast(e.message); }
}

export function initData() {
  $("#export-csv").addEventListener("click", () => exportData("csv"));
  $("#export-json").addEventListener("click", () => exportData("json"));
  $("#f-date").value = todayStr();
  $("#f-date").max = todayStr();
  const form = $("#data-form"), openBtn = $("#add-past-btn");
  const toggle = (open) => {
    form.hidden = !open;
    openBtn.hidden = open;
    openBtn.setAttribute("aria-expanded", String(open));
    $("#f-error").textContent = "";
    if (open) $("#f-date").focus();
  };
  openBtn.addEventListener("click", () => toggle(true));
  $("#f-cancel").addEventListener("click", () => toggle(false));

  $("#data-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#f-error");
    err.textContent = "";
    const date = $("#f-date").value;
    const value = readDur($("#f-hours"), $("#f-minutes"));
    if (!date) return (err.textContent = "날짜를 선택해 주세요.");
    if (value == null) return (err.textContent = "시간은 0~24시간, 분은 0~59로 입력해 주세요.");
    const btn = $("#f-submit");
    btn.disabled = true;
    try {
      await api.createData({ person: ME_NAME, date, value, memo: $("#f-memo").value.trim() });
      toast("기록을 추가했어요.");
      $("#f-memo").value = "";
      toggle(false);
      emit("data:changed");
    } catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; }
  });

  $("#edit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#e-error");
    const value = readDur($("#e-hours"), $("#e-minutes"));
    if (value == null) return (err.textContent = "시간은 0~24시간, 분은 0~59로 입력해 주세요.");
    $("#e-save").disabled = true;
    try {
      await api.updateEntry(editing.r.id, editing.e.id, { minutes: value, memo: $("#e-memo").value.trim() });
      $("#dlg-edit").close();
      toast("기록을 수정했어요.");
      emit("data:changed");
    } catch (ex) { err.textContent = ex.message; }
    finally { $("#e-save").disabled = false; }
  });
  $("#e-cancel").addEventListener("click", () => $("#dlg-edit").close());

  $("#data-more").addEventListener("click", () => { limit += PAGE; loadList(); });

  document.addEventListener("data:changed", loadList);
  document.addEventListener("summary:loaded", (e) => {
    $("#f-date").max = todayStr(); // 자정을 넘겨 켜 둔 경우에도 오늘까지 고를 수 있게
  });
  loadList();
}
