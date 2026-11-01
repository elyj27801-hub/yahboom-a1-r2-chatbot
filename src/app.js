import { StaticKnowledgeProvider } from "./providers/staticProvider.js";

const $ = (selector) => document.querySelector(selector);
const messages = $("#messages");
const form = $("#chat-form");
const questionInput = $("#question");
const submitButton = $("#submit-button");
const status = $("#app-status");
const suggestions = $("#suggestions");
const modelButtons = [...document.querySelectorAll(".model-button")];
const SESSION_KEY = "yahboom-support-session-v1";
const suggestionMap = {
  R2: ["SL_RESULT_OPERATION_TIMEOUT 오류가 발생해", "ROS 2 토픽이 안 보여", "/cmd_vel을 발행했는데 움직이지 않아", "카메라는 나오는데 ArUco가 인식되지 않아", "Nav2가 실행되지 않아"],
  A1: ["직진 명령에 오른쪽 뒷바퀴만 회전해", "HP60C uvc_open Busy 오류가 발생해", "T-MINI Plus /scan이 RViz와 달라", "A1 회전 보정에서 transform not ready가 나와"]
};

let provider;
let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return { model: saved?.model === "A1" ? "A1" : "R2", history: Array.isArray(saved?.history) ? saved.history.slice(-12) : [], lastEntryId: saved?.lastEntryId ?? null, lastEntryTitle: saved?.lastEntryTitle ?? "" };
  } catch { return { model: "R2", history: [], lastEntryId: null, lastEntryTitle: "" }; }
}

function saveState() { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); }
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }

function appendMessage(role, content, persist = true) {
  const wrapper = el("article", `message ${role}`);
  const bubble = el("div", "bubble");
  if (typeof content === "string") bubble.append(el("p", "", content)); else bubble.append(content);
  wrapper.append(bubble); messages.append(wrapper); messages.scrollTop = messages.scrollHeight;
  if (persist) { state.history.push({ role, text: typeof content === "string" ? content : null }); state.history = state.history.slice(-12); saveState(); }
}

function listSection(title, items, ordered = false) {
  const section = el("section", "answer-section"); section.append(el("h3", "", title));
  const list = el(ordered ? "ol" : "ul"); items.forEach((item) => list.append(el("li", "", item))); section.append(list); return section;
}

function commandSection(commands) {
  const section = el("section", "answer-section"); section.append(el("h3", "", "안전한 확인 명령어"));
  commands.forEach(({ os, cmd }) => {
    const box = el("div", "command"); box.append(el("small", "", os), document.createTextNode(cmd));
    const button = el("button", "copy-button", "복사"); button.type = "button"; button.setAttribute("aria-label", `${os} 명령어 복사`);
    button.addEventListener("click", async () => { try { await navigator.clipboard.writeText(cmd); button.textContent = "복사됨"; setTimeout(() => button.textContent = "복사", 1200); } catch { button.textContent = "선택 복사"; const range = document.createRange(); range.selectNodeContents(box); getSelection().removeAllRanges(); getSelection().addRange(range); } });
    box.append(button); section.append(box);
  }); return section;
}

function answerCard(entry, related) {
  const root = el("div"); const head = el("div", "answer-head");
  head.append(el("h2", "", entry.title), el("span", `badge ${entry.status === "unverified" ? "unverified" : ""}`, entry.statusLabel)); root.append(head);
  root.append(listSection("증상", entry.symptoms), listSection("가능한 원인", entry.causes));
  if (entry.diagnostics.length) root.append(commandSection(entry.diagnostics));
  root.append(listSection("결과별 해결 방법", entry.solutions, true), listSection("정상 동작 확인", entry.verification));
  const sourceSection = el("section", "answer-section sources"); sourceSection.append(el("h3", "", "참고 출처"));
  if (entry.sources.length) { const list = el("ul"); entry.sources.forEach((source) => { const item = el("li"); if (source.url) { const link = el("a", "", source.label); link.href = source.url; link.target = "_blank"; link.rel = "noreferrer"; item.append(link); } else item.append(document.createTextNode(source.label)); list.append(item); }); sourceSection.append(list); }
  else sourceSection.append(el("p", "", "확인된 A1 출처가 아직 없습니다.")); root.append(sourceSection);
  if (related.length) { const area = el("div", "related"); related.forEach(({ entry: item }) => { const button = el("button", "related-button", item.title); button.type = "button"; button.addEventListener("click", () => ask(item.title)); area.append(button); }); root.append(area); }
  return root;
}

function renderSuggestions() {
  suggestions.replaceChildren(); suggestionMap[state.model].forEach((text) => { const button = el("button", "suggestion", text); button.type = "button"; button.addEventListener("click", () => ask(text)); suggestions.append(button); });
}

function selectModel(model, announce = true) {
  state.model = model; state.lastEntryId = null; state.lastEntryTitle = "";
  modelButtons.forEach((button) => { const active = button.dataset.model === model; button.classList.toggle("active", active); button.setAttribute("aria-checked", String(active)); });
  renderSuggestions(); saveState();
  if (provider) status.textContent = `${provider.entries.filter((entry) => entry.model === model).length}개 ${model} 문서를 사용할 수 있습니다.`;
  if (announce) appendMessage("assistant", model === "A1" ? "A1을 선택했습니다. Ubuntu 22.04 기반 · ROS 2 Humble · HP60C · T-MINI Plus 경험 기록만 검색하며 R2 설정을 섞지 않습니다." : "R2를 선택했습니다. Jetson Orin Nano Super · Ubuntu 24.04 · ROS 2 Jazzy 기록을 기준으로 검색합니다.");
}

async function ask(question) {
  const clean = question.trim(); if (!clean || !provider) return;
  appendMessage("user", clean); questionInput.value = ""; submitButton.disabled = true; status.textContent = "브라우저 지식베이스를 검색하는 중…";
  try {
    const response = await provider.answer(clean, state);
    if (response.type === "not-found") appendMessage("assistant", response.message);
    else { state.lastEntryId = response.primary.id; state.lastEntryTitle = response.primary.title; appendMessage("assistant", answerCard(response.primary, response.results.slice(1))); saveState(); }
    status.textContent = "외부 API 호출 없이 검색을 완료했습니다.";
  } catch (error) { appendMessage("assistant", "지식베이스를 검색하는 중 오류가 발생했습니다. 페이지를 새로고침해 다시 시도해 주세요."); status.textContent = `검색 오류: ${error.message}`; }
  finally { submitButton.disabled = false; questionInput.focus(); }
}

modelButtons.forEach((button) => button.addEventListener("click", () => selectModel(button.dataset.model)));
form.addEventListener("submit", (event) => { event.preventDefault(); ask(questionInput.value); });
questionInput.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });

async function init() {
  selectModel(state.model, false);
  try {
    const response = await fetch("./data/knowledge-base.json"); if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const kb = await response.json(); provider = new StaticKnowledgeProvider(kb.entries);
    if (!state.history.length) appendMessage("assistant", `${state.model} 문제를 입력해 주세요. 증상 → 원인 → 확인 명령 → 해결 → 검증 순서로 근거가 있는 문서를 찾아드립니다.`, false);
    else state.history.filter((item) => item.text).forEach((item) => appendMessage(item.role, item.text, false));
    status.textContent = `${kb.entries.filter((entry) => entry.model === state.model).length}개 ${state.model} 문서를 사용할 수 있습니다.`;
  } catch (error) { status.textContent = `지식베이스 로딩 실패: ${error.message}`; appendMessage("assistant", "지식베이스 파일을 불러오지 못했습니다. file://로 열지 말고 로컬 서버로 실행해 주세요.", false); }
}

init();
