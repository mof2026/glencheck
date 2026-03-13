const {
  MAX_COLS,
  MAX_TABLE_ROWS_PER_PAGE,
  blankPracticeSet,
  dateLabels,
  defaultState,
  escapeHtml,
  formatDateJP,
  loadState,
} = window.PianoPracticeShared;

const main = document.querySelector("main.panel");
const printBtn = document.getElementById("print-btn");
const state = loadState();
const shouldAutoPrint = new URLSearchParams(window.location.search).get("autoprint") === "1";

printBtn?.addEventListener("click", triggerPrint);

render();
if (shouldAutoPrint) scheduleAutoPrint();

function triggerPrint() {
  if (typeof window.print !== "function") return;
  window.print();
}

function scheduleAutoPrint() {
  window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      triggerPrint();
    });
  }, 150);
}

function render() {
  if (!main) return;
  const labels = dateLabels(state.startDate, state.dayCount);
  const pages = buildPageBlocks(state);
  main.innerHTML = pages
    .map((pageBlocks, pageIndex) => `
      <div class="sheet-card"${pageIndex ? ' style="margin-top: 10px;"' : ""}>
        <div class="sheet">
          <div class="sheet-date">${pageIndex === 0 ? `作成日 ${escapeHtml(formatDateJP(state.createdDate))}` : `${pageIndex + 1}ページ目`}</div>
          ${buildTable(pageBlocks, labels)}
        </div>
      </div>
    `)
    .join("");
}

function buildTable(pageBlocks, labels) {
  const rows = [];
  pageBlocks.forEach((block, blockIndex) => {
    const showDates = blockIndex === 0;
    rows.push(`
      <tr class="section-row">
        <td class="section-left"><span class="section-title-text">${escapeHtml(block.curveName || "")}</span></td>
        ${labels.map((label) => `<td class="day">${showDates && label ? escapeHtml(label) : "&nbsp;"}</td>`).join("")}
      </tr>
    `);

    const set = Array.isArray(block.rows) ? block.rows : blankPracticeSet(5);
    set.forEach(([title, desc]) => {
      const safeTitle = String(title || "");
      const safeDesc = String(desc || "");
      const lineCount = (safeTitle.trim() ? 1 : 0) + (safeDesc.trim() ? 1 : 0);
      const wrapClass = lineCount === 1 ? "practice-wrap is-single-line" : "practice-wrap";
      rows.push(`
        <tr>
          <td class="left-cell"><div class="${wrapClass}"><p class="practice-title">${escapeHtml(safeTitle)}</p>${safeDesc.trim() ? `<p class="practice-desc">${escapeHtml(safeDesc)}</p>` : ""}</div></td>
          ${Array.from({ length: MAX_COLS }, () => "<td></td>").join("")}
        </tr>
      `);
    });
  });

  return `
    <table class="plan" aria-label="ピアノ練習計画表">
      <colgroup><col class="left" /><col class="day" span="${MAX_COLS}" /></colgroup>
      <tbody>${rows.join("")}</tbody>
    </table>
  `;
}

function buildPageBlocks(currentState) {
  const pages = [];
  let current = [];
  let usedRows = 0;

  function pushPage() {
    if (!current.length) return;
    pages.push(current);
    current = [];
    usedRows = 0;
  }

  currentState.curves.forEach((curveName, curveIndex) => {
    const curveRows = rowsForCurve(currentState, curveIndex);
    let offset = 0;

    while (offset < curveRows.length || (curveRows.length === 0 && offset === 0)) {
      const remaining = MAX_TABLE_ROWS_PER_PAGE - usedRows;
      const availablePracticeRows = remaining - 1;
      if (availablePracticeRows <= 0) {
        pushPage();
        continue;
      }

      const sliceSize = Math.max(1, Math.min(availablePracticeRows, curveRows.length - offset));
      current.push({
        curveIndex,
        curveName: String(curveName || ""),
        rows: curveRows.slice(offset, offset + sliceSize),
      });
      usedRows += 1 + sliceSize;
      offset += sliceSize;

      if (offset < curveRows.length) pushPage();
    }
  });

  pushPage();
  if (!pages.length) {
    const fallback = defaultState();
    pages.push([{ curveIndex: 0, curveName: fallback.curves[0], rows: fallback.practices[0] }]);
  }
  return pages;
}

function rowsForCurve(currentState, curveIndex) {
  const curveName = String(currentState.curves?.[curveIndex] || "").trim();
  if (!curveName) return blankPracticeSet(5);
  const rows = Array.isArray(currentState.practices) ? currentState.practices[curveIndex] : null;
  if (!Array.isArray(rows) || rows.length === 0) return blankPracticeSet(5);
  return rows.map((row) => [String((row && row[0]) || ""), String((row && row[1]) || "")]);
}
