// Vercel 빌드 때 실행: 환경변수 API_BASE_URL로 frontend/js/config.js를 만든다.
// (로컬에서는 이 파일을 실행하지 않고, config.js의 localhost 주소를 그대로 쓴다.)
const fs = require("fs");
const path = require("path");

const api = (process.env.API_BASE_URL || "").trim().replace(/\/+$/, "");
if (!/^https?:\/\//.test(api)) {
  console.error("API_BASE_URL 환경변수가 없거나 http(s)로 시작하지 않습니다. Vercel 프로젝트 설정에서 넣어 주세요.");
  process.exit(1);
}
const me = (process.env.ME_NAME || "나").trim();
const body = `// Vercel 빌드에서 자동으로 만든 파일입니다.\nwindow.APP_CONFIG = {\n  API_BASE_URL: ${JSON.stringify(api)},\n  ME: ${JSON.stringify(me)},\n};\n`;
fs.writeFileSync(path.join(__dirname, "..", "frontend", "js", "config.js"), body);
console.log("config.js 생성:", api);
