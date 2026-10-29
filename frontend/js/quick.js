import { api } from "./api.js";
import { ME_NAME } from "./state.js";
import { $, emit, toast, todayStr, nowHM } from "./util.js";

// 직접 입력: 누를 때마다 오늘 기록에 한 건씩 추가된다. (하루에 몇 번이든 가능)
export function initQuick() {
  $("#q-submit").textContent = "기록하기";
  $("#quick").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#q-error");
    err.textContent = "";
    const hh = Number($("#q-hours").value || 0), mm = Number($("#q-minutes").value || 0);
    const value = hh * 60 + mm;
    if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || mm < 0 || mm > 59 || value > 1440) {
      err.textContent = "시간은 0~24시간, 분은 0~59로 입력해 주세요.";
      return;
    }
    if (value === 0) {
      err.textContent = "공부한 시간을 입력해 주세요.";
      return;
    }
    const btn = $("#q-submit");
    btn.disabled = true;
    try {
      await api.createData({ person: ME_NAME, date: todayStr(), value, memo: "", at: nowHM() });
      toast("오늘 기록에 추가했어요.");
      emit("data:changed");
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });
}
