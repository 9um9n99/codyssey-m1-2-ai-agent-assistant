// 친구 소개: 어떤 유형의 가상 인물인지, 어떤 기준으로 만들었는지 보여 준다.
import { api } from "./api.js";
import { getLastSummary } from "./summary.js";
import { FRIEND_COLOR } from "./settings.js";
import { fish } from "./fish.js";
import { $, el, fmtMinutes } from "./util.js";

let cache = null;

function trendText(t) {
  if (!t || t.change_pct == null) return t?.label || "";
  return `${t.label} ${t.change_pct > 0 ? "+" : ""}${t.change_pct.toFixed(0)}%`;
}

function card(f, s) {
  const p = s?.people.find((x) => x.person === f.name);
  const td = s?.today?.friends.find((x) => x.person === f.name);
  const stats = [];
  if (p) stats.push(`하루 평균 ${fmtMinutes(p.average_minutes)}`, `최근 14일 ${trendText(p.trend)}`);
  if (td) stats.push(`오늘 지금까지 ${fmtMinutes(td.minutes)}`);
  const icon = el("span", { class: "fr-fish" });
  icon.append(fish(FRIEND_COLOR, { size: 44 }));
  return el("article", { class: "fr-card", "data-name": f.name },
    icon,
    el("div", { class: "fr-body" },
      el("h3", {}, f.name, el("span", { class: "fr-chip", text: f.label })),
      el("p", { class: "fr-intro", text: f.intro }),
      el("p", {}, el("b", { text: "하루 패턴 " }), f.pattern),
      el("p", {}, el("b", { text: "공부 시간대 " }), f.when),
      stats.length ? el("p", { class: "fr-stats" }, stats.map((t) => el("span", { text: t }))) : null));
}

async function open(name) {
  const dlg = $("#dlg-friends");
  const list = $("#fr-list");
  list.replaceChildren(el("p", { class: "muted", text: "불러오는 중..." }));
  dlg.showModal();
  try {
    cache = cache || (await api.friends());
    $("#fr-basis").replaceChildren(...cache.basis.split(/(?<=[.!?])\s+/).map((t) => el("p", { text: t })));
    const s = getLastSummary();
    list.replaceChildren(...cache.friends.map((f) => card(f, s)));
    if (name) {
      const target = list.querySelector(`[data-name="${CSS.escape(name)}"]`);
      if (target) { target.classList.add("hl"); target.scrollIntoView({ block: "center" }); }
    }
  } catch (e) {
    list.replaceChildren(el("div", { class: "errbox" }, `친구 소개를 불러오지 못했어요. ${e.message}`));
  }
}

export function initFriends() {
  document.addEventListener("friend:open", (e) => open(e.detail));
  $("#fr-close").addEventListener("click", () => $("#dlg-friends").close());
}
