const {
  MAX_COLS,
  MAX_CURVES,
  candidateById,
  backupFileName,
  buildBackupPayload,
  clampDayCount,
  createDownload,
  curveLabel,
  ensurePracticesShape,
  escapeHtml,
  filteredCandidates,
  formatCreatedDateLabel,
  loadRecentCandidateIds,
  loadState,
  parseBackupPayload,
  pushRecentCandidate,
  saveRecentCandidateIds,
  saveState,
  todayLocalISO,
} = window.PianoPracticeShared;

const createdEl = document.getElementById("created-date");
const startEl = document.getElementById("start-date");
const dayEl = document.getElementById("day-count");
const curve0 = document.getElementById("curve-0");
const curve1 = document.getElementById("curve-1");
const extraWrap = document.getElementById("extra-curves");
const addCurveBtn = document.getElementById("add-curve-btn");
const dayShortcutBtns = document.querySelectorAll(".day-shortcuts button");
const printLink = document.getElementById("open-print-btn");
const backupExportBtn = document.getElementById("backup-export-btn");
const backupImportBtn = document.getElementById("backup-import-btn");
const backupImportFile = document.getElementById("backup-import-file");
const stickyStatusEl = document.getElementById("sticky-status");
const editorShell = document.querySelector(".shell");
const createdDateDisplayEl = document.getElementById("created-date-display");
const candidateSheet = document.getElementById("candidate-sheet");
const candidateSheetCloseBtn = document.getElementById("candidate-sheet-close");
const candidateSheetSub = document.getElementById("candidate-sheet-sub");
const candidateSearchInput = document.getElementById("candidate-search-input");
const candidateRecentList = document.getElementById("candidate-recent-list");
const candidateMasterList = document.getElementById("candidate-master-list");
const candidateRecentGroup = document.getElementById("candidate-group-recent");
const practiceAccordionList = document.getElementById("practice-accordion-list");

let state = loadState();
let stickyStatusTimer = 0;
const candidateUiState = { curveIndex: null };

init();

function init() {
  state.createdDate = todayLocalISO();
  state.startDate = state.createdDate;
  persistStateOnly();
  initDayCountOptions();
  bindEvents();
  render();
}

function initDayCountOptions() {
  if (!dayEl || dayEl.tagName !== "SELECT" || dayEl.options.length > 0) return;
  for (let value = 14; value <= MAX_COLS; value += 1) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = String(value);
    dayEl.appendChild(option);
  }
}

function bindEvents() {
  createdEl?.addEventListener("change", () => {
    if (!startEl.value) startEl.value = createdEl.value;
    collectStateFromInputs();
    persistAndRender();
  });

  startEl?.addEventListener("change", () => {
    collectStateFromInputs();
    persistAndRender();
  });

  dayEl?.addEventListener("change", () => {
    dayEl.value = String(clampDayCount(dayEl.value));
    collectStateFromInputs();
    persistAndRender();
  });

  dayShortcutBtns.forEach((button) => {
    button.addEventListener("click", () => {
      dayEl.value = button.dataset.day || "21";
      collectStateFromInputs();
      persistAndRender();
    });
  });

  [curve0, curve1].forEach((input) => {
    input?.addEventListener("input", handleCurveInput);
    input?.addEventListener("change", handleCurveInput);
  });

  extraWrap?.addEventListener("input", handleCurveInput);
  extraWrap?.addEventListener("change", handleCurveInput);
  extraWrap?.addEventListener("click", handleExtraCurveClick);

  editorShell?.addEventListener("input", handleEditorInput);
  editorShell?.addEventListener("change", handleEditorInput);
  editorShell?.addEventListener("click", handleEditorClick);

  addCurveBtn?.addEventListener("click", handleAddCurve);
  candidateSheetCloseBtn?.addEventListener("click", closeCandidatePicker);
  candidateSheet?.addEventListener("click", handleCandidateSheetClick);
  candidateSearchInput?.addEventListener("input", renderCandidatePicker);
  document.addEventListener("keydown", handleKeydown);
  backupExportBtn?.addEventListener("click", exportBackupJson);
  backupImportBtn?.addEventListener("click", () => backupImportFile?.click());
  backupImportFile?.addEventListener("change", handleBackupFileSelected);
  printLink?.addEventListener("click", handleOpenPrintPage);
}

function handleOpenPrintPage(event) {
  collectStateFromInputs();
  persistStateOnly();
  const href = printLink?.getAttribute("href");
  if (!href) return;

  event.preventDefault();
  const targetUrl = new URL(href, window.location.href);
  targetUrl.searchParams.set("autoprint", "1");

  const opened = window.open(targetUrl.toString(), "_blank", "noopener");
  if (!opened) window.location.href = targetUrl.toString();
}

function handleCurveInput() {
  collectStateFromInputs();
  persistAndRender();
}

function handleExtraCurveClick(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const button = target?.closest("[data-delete-curve-index]");
  if (!button) return;
  const curveIndex = Number(button.getAttribute("data-delete-curve-index") || NaN);
  if (!Number.isInteger(curveIndex) || curveIndex < 2) return;
  collectStateFromInputs();
  state.curves.splice(curveIndex, 1);
  state.practices.splice(curveIndex, 1);
  state.collapsedCurveIndices = state.collapsedCurveIndices
    .filter((index) => index !== curveIndex)
    .map((index) => (index > curveIndex ? index - 1 : index));
  persistAndRender();
}

function handleEditorInput(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;
  if (target.closest(".practice-mini") || target === curve0 || target === curve1 || target.closest("#extra-curves")) {
    collectStateFromInputs();
    persistStateOnly();
  }
}

function handleEditorClick(event) {
  const target = event.target instanceof HTMLElement ? event.target : event.target?.parentElement;
  if (!target) return;

  if (dispatchAccordionToggle(target, event)) return;
  if (dispatchRowAction(target, event)) return;
  if (dispatchAddMode(target, event)) return;
  if (dispatchClearCurve(target, event)) return;
}

function dispatchAccordionToggle(target, event) {
  const head = target.closest(".accordion-head");
  if (!head || target.closest("button, a, input, select, textarea, label")) return false;
  const accordion = head.closest(".accordion-item[data-curve-index]");
  const curveIndex = Number(accordion?.dataset.curveIndex || NaN);
  if (!Number.isInteger(curveIndex) || curveIndex < 0) return true;
  event.preventDefault();
  toggleAccordion(curveIndex);
  return true;
}

function dispatchRowAction(target, event) {
  const button = target.closest("[data-row-action]");
  if (!button) return false;
  const row = button.closest(".practice-mini");
  const accordion = button.closest(".accordion-item[data-curve-index]");
  const curveIndex = Number(accordion?.dataset.curveIndex || NaN);
  const rowIndex = Number(row?.dataset.practiceIndex || NaN);
  const action = button.getAttribute("data-row-action") || "";
  if (!Number.isInteger(curveIndex) || !Number.isInteger(rowIndex) || !action) return true;
  event.preventDefault();
  handleRowAction(curveIndex, rowIndex, action);
  return true;
}

function dispatchAddMode(target, event) {
  const button = target.closest("[data-add-mode]");
  if (!button) return false;
  const accordion = button.closest(".accordion-item[data-curve-index]");
  const curveIndex = Number(accordion?.dataset.curveIndex || NaN);
  const mode = button.getAttribute("data-add-mode") || "";
  if (!Number.isInteger(curveIndex) || curveIndex < 0) return true;
  event.preventDefault();

  if (mode === "candidate") {
    openCandidatePicker(curveIndex);
    return true;
  }

  if (mode === "new") {
    collectStateFromInputs();
    state.practices[curveIndex].push(["新しい練習", ""]);
    persistAndRender();
    focusPracticeTitle(curveIndex, state.practices[curveIndex].length - 1);
    return true;
  }

  return false;
}

function dispatchClearCurve(target, event) {
  const button = target.closest("[data-clear-curve-slot]");
  if (!button) return false;
  const slot = Number(button.getAttribute("data-clear-curve-slot") || NaN);
  if (!Number.isInteger(slot) || slot < 0 || slot > 1) return true;
  event.preventDefault();
  collectStateFromInputs();
  state.curves[slot] = "";
  persistAndRender();
  (slot === 0 ? curve0 : curve1)?.focus();
  return true;
}

function handleRowAction(curveIndex, rowIndex, action) {
  collectStateFromInputs();
  const rows = state.practices[curveIndex];
  if (!Array.isArray(rows) || !Array.isArray(rows[rowIndex])) return;

  if (action === "up" && rowIndex > 0) {
    [rows[rowIndex - 1], rows[rowIndex]] = [rows[rowIndex], rows[rowIndex - 1]];
  }
  if (action === "down" && rowIndex < rows.length - 1) {
    [rows[rowIndex + 1], rows[rowIndex]] = [rows[rowIndex], rows[rowIndex + 1]];
  }
  if (action === "duplicate") {
    const [title, desc] = rows[rowIndex];
    rows.splice(rowIndex + 1, 0, [String(title || ""), String(desc || "")]);
  }
  if (action === "delete") {
    rows.splice(rowIndex, 1);
    if (rows.length === 0) rows.push(["新しい練習", ""]);
  }

  persistAndRender();
  const nextIndex = action === "duplicate"
    ? rowIndex + 1
    : Math.max(0, Math.min(rowIndex, state.practices[curveIndex].length - 1));
  focusPracticeTitle(curveIndex, nextIndex);
}

function toggleAccordion(curveIndex) {
  collectStateFromInputs();
  const set = new Set(state.collapsedCurveIndices || []);
  if (set.has(curveIndex)) set.delete(curveIndex);
  else set.add(curveIndex);
  state.collapsedCurveIndices = Array.from(set).sort((a, b) => a - b);
  persistAndRender();
}

function handleAddCurve() {
  collectStateFromInputs();
  if (state.curves.length >= MAX_CURVES) return;
  state.curves.push("");
  state.practices.push([["新しい練習", ""]]);
  persistAndRender();
  requestAnimationFrame(() => {
    extraWrap?.querySelector(".extra-curve-input:last-of-type")?.focus();
  });
}

function handleCandidateSheetClick(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;
  if (target === candidateSheet) {
    closeCandidatePicker();
    return;
  }
  const button = target.closest("[data-candidate-id]");
  if (!button) return;
  const curveIndex = Number(candidateUiState.curveIndex);
  const candidate = candidateById.get(button.getAttribute("data-candidate-id") || "");
  if (!Number.isInteger(curveIndex) || curveIndex < 0 || !candidate) return;
  collectStateFromInputs();
  state.practices[curveIndex].push([candidate.title, candidate.desc || ""]);
  pushRecentCandidate(candidate.id);
  persistAndRender();
  closeCandidatePicker();
  focusPracticeTitle(curveIndex, state.practices[curveIndex].length - 1);
}

function handleKeydown(event) {
  if (event.key === "Escape" && candidateSheet && !candidateSheet.hidden) {
    event.preventDefault();
    closeCandidatePicker();
  }
}

function render() {
  state = ensurePracticesShape(state);
  renderMetaFields();
  renderCurves();
  renderPracticeAccordions();
  renderCandidatePicker();
}

function renderMetaFields() {
  createdEl.value = state.createdDate;
  startEl.value = state.startDate;
  dayEl.value = String(clampDayCount(state.dayCount));
  curve0.value = state.curves[0] || "";
  curve1.value = state.curves[1] || "";
  if (createdDateDisplayEl) createdDateDisplayEl.textContent = formatCreatedDateLabel(createdEl.value || "");
}

function renderCurves() {
  extraWrap.innerHTML = state.curves
    .slice(2)
    .map((value, index) => extraCurveRowHtml(index + 2, value))
    .join("");
  if (addCurveBtn) {
    addCurveBtn.disabled = state.curves.length >= MAX_CURVES;
    addCurveBtn.textContent = state.curves.length >= MAX_CURVES ? "5曲まで" : "＋曲を追加";
  }
}

function renderPracticeAccordions() {
  if (!practiceAccordionList) return;
  practiceAccordionList.innerHTML = state.curves
    .map((curveName, curveIndex) => accordionHtml(curveIndex, curveName, state.practices[curveIndex] || [], state.collapsedCurveIndices.includes(curveIndex)))
    .join("");
}

function accordionHtml(curveIndex, curveName, rows, collapsed) {
  const rowList = (Array.isArray(rows) ? rows : []).map((row, practiceIndex) => practiceRowHtml(curveIndex, practiceIndex, row)).join("");
  return `
    <div class="accordion-item ${collapsed ? "is-collapsed" : ""}" data-curve-index="${curveIndex}">
      <div class="accordion-head" aria-expanded="${collapsed ? "false" : "true"}">
        <div>
          <p class="accordion-title">${escapeHtml(curveLabel(curveName, curveIndex))}</p>
          <p class="accordion-sub">${rows.length}行 / ${collapsed ? "閉じている" : "開いている"}</p>
        </div>
        <div class="caret">${collapsed ? "▼" : "▲"}</div>
      </div>
      <div class="accordion-body" ${collapsed ? "hidden" : ""}>
        <div class="chips" style="margin-top: 0;">
          <button type="button" class="chip" data-add-mode="candidate">＋候補から追加</button>
          <button type="button" class="chip" data-add-mode="new">＋新規追加</button>
        </div>
        <div class="practice-list">${rowList}</div>
      </div>
    </div>
  `;
}

function practiceRowHtml(curveIndex, practiceIndex, row) {
  const title = Array.isArray(row) ? row[0] : "";
  const desc = Array.isArray(row) ? row[1] : "";
  return `
    <div class="practice-mini" data-curve-index="${curveIndex}" data-practice-index="${practiceIndex}">
      <p class="t"><input class="practice-title-input" type="text" value="${escapeHtml(title)}" /></p>
      <p class="d"><input class="practice-desc-input" type="text" value="${escapeHtml(desc)}" /></p>
      <div class="mini-tools">
        <button type="button" data-row-action="up">↑</button>
        <button type="button" data-row-action="down">↓</button>
        <button type="button" data-row-action="duplicate">複製</button>
        <button type="button" data-row-action="delete">削除</button>
      </div>
    </div>
  `;
}

function extraCurveRowHtml(index, value) {
  return `
    <div class="field-row with-tail" data-curve-index="${index}">
      <div class="label">${index + 1}曲目</div>
      <div class="field"><input class="field-input extra-curve-input" type="text" value="${escapeHtml(value || "")}" /></div>
      <button type="button" class="curve-tail-btn" data-delete-curve-index="${index}" aria-label="${index + 1}曲目を削除">×</button>
    </div>
  `;
}

function collectStateFromInputs() {
  const curves = [curve0?.value?.trim() || "", curve1?.value?.trim() || ""];
  extraWrap?.querySelectorAll(".extra-curve-input").forEach((input) => curves.push(input.value.trim()));
  state.curves = curves.slice(0, MAX_CURVES);

  const practiceMap = state.curves.map(() => []);
  practiceAccordionList?.querySelectorAll(".practice-mini[data-curve-index]").forEach((card) => {
    const curveIndex = Number(card.dataset.curveIndex || 0);
    const practiceIndex = Number(card.dataset.practiceIndex || 0);
    const title = card.querySelector(".practice-title-input")?.value?.trim() || "";
    const desc = card.querySelector(".practice-desc-input")?.value?.trim() || "";
    if (!practiceMap[curveIndex]) practiceMap[curveIndex] = [];
    practiceMap[curveIndex][practiceIndex] = [title, desc];
  });

  state.practices = practiceMap.map((rows) => (Array.isArray(rows) ? rows.filter((row) => Array.isArray(row)) : []));
  state.createdDate = createdEl?.value || todayLocalISO();
  state.startDate = startEl?.value || state.createdDate;
  state.dayCount = clampDayCount(dayEl?.value || state.dayCount);
  state = ensurePracticesShape(state);
}

function persistStateOnly() {
  state = saveState(state);
}

function persistAndRender() {
  persistStateOnly();
  render();
}

function setStickyStatus(message) {
  if (!stickyStatusEl) return;
  stickyStatusEl.textContent = String(message || "");
  if (stickyStatusTimer) clearTimeout(stickyStatusTimer);
  if (!message) return;
  stickyStatusTimer = window.setTimeout(() => {
    if (stickyStatusEl.textContent === message) stickyStatusEl.textContent = "";
  }, 2800);
}

function exportBackupJson() {
  collectStateFromInputs();
  const payload = buildBackupPayload(state);
  createDownload(backupFileName(payload.state), JSON.stringify(payload, null, 2));
  setStickyStatus("JSONを保存しました");
}

function handleBackupFileSelected(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || "");
      if (text.length > 2_000_000) throw new Error("backup too large");
      const parsed = JSON.parse(text);
      const payload = parseBackupPayload(parsed);
      if (!payload) throw new Error("backup format");
      state = payload.state;
      saveState(state);
      saveRecentCandidateIds(payload.recentCandidateIds);
      render();
      closeCandidatePicker();
      setStickyStatus("JSONから復元しました");
    } catch {
      setStickyStatus("復元できませんでした（JSON形式を確認）");
    } finally {
      if (backupImportFile) backupImportFile.value = "";
    }
  };
  reader.onerror = () => {
    setStickyStatus("ファイルを読み込めませんでした");
    if (backupImportFile) backupImportFile.value = "";
  };
  reader.readAsText(file, "utf-8");
}

function openCandidatePicker(curveIndex) {
  if (!candidateSheet) return;
  candidateUiState.curveIndex = curveIndex;
  if (candidateSheetSub) {
    candidateSheetSub.textContent = `${curveLabel(state.curves[curveIndex], curveIndex)} に追加する候補を選択`;
  }
  if (candidateSearchInput) candidateSearchInput.value = "";
  renderCandidatePicker();
  candidateSheet.hidden = false;
  candidateSheet.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => candidateSearchInput?.focus());
}

function closeCandidatePicker() {
  if (!candidateSheet) return;
  candidateSheet.hidden = true;
  candidateSheet.setAttribute("aria-hidden", "true");
  candidateUiState.curveIndex = null;
}

function renderCandidatePicker() {
  const keyword = candidateSearchInput?.value || "";
  const filtered = filteredCandidates(keyword);
  const recent = loadRecentCandidateIds()
    .map((id) => candidateById.get(id))
    .filter(Boolean)
    .filter((candidate) => !keyword || filtered.some((item) => item.id === candidate.id));

  if (candidateRecentGroup) candidateRecentGroup.hidden = recent.length === 0;
  renderCandidateList(candidateRecentList, recent, "まだ最近使った候補はありません");
  renderCandidateList(candidateMasterList, filtered, "一致する候補がありません");
}

function renderCandidateList(root, items, emptyText) {
  if (!root) return;
  root.innerHTML = items.length
    ? items.map(candidateButtonHtml).join("")
    : `<div class="candidate-empty">${escapeHtml(emptyText)}</div>`;
}

function candidateButtonHtml(candidate) {
  return `
    <button type="button" class="candidate-option" data-candidate-id="${escapeHtml(candidate.id)}">
      <span class="name">${escapeHtml(candidate.title)}</span>
      <span class="desc">${escapeHtml(candidate.desc || "")}</span>
    </button>
  `;
}

function focusPracticeTitle(curveIndex, practiceIndex) {
  requestAnimationFrame(() => {
    practiceAccordionList
      ?.querySelector(`.accordion-item[data-curve-index="${curveIndex}"] .practice-mini[data-practice-index="${practiceIndex}"] .practice-title-input`)
      ?.focus();
  });
}
