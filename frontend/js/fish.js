// 아주 단순한 물고기 그림(콩눈 + 몸통 + 꼬리 + 지느러미). 색만 바꿔서 여러 마리를 만든다.
const NS = "http://www.w3.org/2000/svg";
import { getMeColor, FRIEND_COLOR } from "./settings.js";

const s = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

export function fish(color, { size = 32, crown = false } = {}) {
  const svg = s("svg", { viewBox: "0 -8 64 48", width: size, height: (size * 48) / 64, "aria-hidden": "true", focusable: "false" });
  const shade = "rgba(0,0,0,.14)";
  svg.append(
    s("path", { d: "M18 21 L2 8 Q7 21 2 34 Z", fill: color }),
    s("path", { d: "M18 21 L2 8 Q7 21 2 34 Z", fill: shade }),
    s("ellipse", { cx: 36, cy: 21, rx: 23, ry: 14, fill: color }),
    s("path", { d: "M27 9 Q36 -2 47 9 Z", fill: color }),
    s("path", { d: "M27 9 Q36 -2 47 9 Z", fill: shade }),
    s("ellipse", { cx: 37, cy: 28, rx: 14, ry: 5, fill: "#fff", opacity: ".28" }),
    s("circle", { cx: 53, cy: 25, r: 3, fill: "#ff9aa8", opacity: ".6" }),
    s("ellipse", { cx: 49, cy: 17, rx: 2.2, ry: 2.8, fill: "#1b2a41" }),
  );
  if (crown) {
    svg.append(
      s("polygon", { points: "37,3 39,-5 43,0 47,-5 49,3", fill: "#ffd23f", stroke: "#e0a800", "stroke-width": 1, "stroke-linejoin": "round" }),
    );
  }
  return svg;
}

export function school(container) {
  // 내 물고기 1마리(내가 고른 색) + 친구 9마리(모두 같은 색)
  const colors = [getMeColor(), ...Array(9).fill(FRIEND_COLOR)];
  container.replaceChildren(...colors.map((c, i) => {
    const w = document.createElement("span");
    w.className = "school-fish";
    w.style.animationDelay = `${i * -0.45}s`;
    w.append(fish(c, { size: 34 }));
    return w;
  }));
}
