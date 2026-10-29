import { $$ } from "./util.js";

// 화면 모드(라이트/다크)는 설정창의 선택 버튼에서 바꾼다.
export function initTheme() {
  const btns = $$("#set-theme button");
  const apply = (t) => {
    document.documentElement.setAttribute("data-theme", t);
    btns.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themeVal === t)));
  };
  apply(document.documentElement.getAttribute("data-theme") || "light");
  btns.forEach((b) => b.addEventListener("click", () => {
    apply(b.dataset.themeVal);
    try { localStorage.setItem("theme", b.dataset.themeVal); } catch (_) { /* 저장 불가여도 동작 */ }
  }));
}
