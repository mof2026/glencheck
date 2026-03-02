(() => {
const STORAGE_KEY = "pianoPracticeMockState";
const MAX_COLS = 21;
const MAX_CURVES = 5;
const MAX_TABLE_ROWS_PER_PAGE = 18;
const RECENT_CANDIDATE_KEY = "pianoPracticeMockRecentCandidates";
const RECENT_CANDIDATE_LIMIT = 8;

const CANDIDATE_LIBRARY = [
  { id: "rh-slow", title: "右手練習", desc: "ゆっくり一定拍で（3回）" },
  { id: "lh-slow", title: "左手練習", desc: "和声の流れを確認（音価を保つ）" },
  { id: "hands-separate", title: "片手ずつ", desc: "指使いと運指の再確認" },
  { id: "two-voices", title: "2声練習", desc: "主旋律と低声をそろえる" },
  { id: "inner-voices", title: "内声確認", desc: "アルト/テナーを消さずに弾く" },
  { id: "rhythm", title: "リズム練習", desc: "付点↔均等 / 手拍子→片手→原形" },
  { id: "chunk", title: "部分練習", desc: "2小節ずつ区切って往復" },
  { id: "leap", title: "跳躍確認", desc: "着地点を先読みしてから弾く" },
  { id: "tempo-up", title: "テンポ上げ", desc: "メトロノームを+4ずつ" },
  { id: "balance", title: "音量バランス", desc: "主旋律を少し前に出す" },
  { id: "pedal", title: "ペダル確認", desc: "踏み替え位置だけを確認" },
  { id: "through", title: "通し", desc: "止まらず最後まで / 流れ優先" },
];

const candidateById = new Map(CANDIDATE_LIBRARY.map((candidate) => [candidate.id, candidate]));

function todayLocalISO() {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  return new Date(now - tz).toISOString().slice(0, 10);
}

function clampDayCount(value) {
  return Math.max(1, Math.min(MAX_COLS, Number(value) || 21));
}

function normalizeCurveSlots(list) {
  const raw = (Array.isArray(list) ? list : []).map((value) => String(value ?? "").trim());
  while (raw.length < 2) raw.push("");
  return raw.slice(0, MAX_CURVES);
}

function defaultState() {
  const today = todayLocalISO();
  return {
    schemaVersion: 1,
    createdDate: today,
    startDate: today,
    dayCount: 21,
    curves: ["インベンション8番", "シンフォニア12番"],
    practices: [
      [
        ["右手練習", "テーマをゆっくり（♩=60 / 3回）"],
        ["左手練習", "和声の流れ確認（音価を保つ）"],
        ["ソプラノ＋バス", "2声で歌い方をそろえる"],
        ["右手リズム", "手拍子→片手→原形"],
        ["通し", "止まらず最後まで"],
      ],
      [
        ["右手練習", "フレーズごとに区切って確認"],
        ["左手練習", "跳躍の位置を先読み"],
        ["アルト＋バス", "内声を消さない"],
        ["リズム練習", "付点↔均等で変換"],
        ["通し", "流れ優先 / 止まらない"],
      ],
    ],
    collapsedCurveIndices: [],
  };
}

function formatCreatedDateLabel(iso) {
  if (!iso) return "--/--/-- 作成";
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return `${iso} 作成`;
  return `${match[1]}/${match[2]}/${match[3]} 作成`;
}

function formatDateJP(iso) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}/${match[2]}/${match[3]}` : String(iso || "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function curveLabel(curveName, fallbackIndex) {
  return String(curveName || "").trim() || `${fallbackIndex + 1}曲目`;
}

function genericPracticeSet() {
  return [
    ["右手練習", "確認ポイントを短く書く"],
    ["左手練習", "確認ポイントを短く書く"],
    ["部分練習", "必要な箇所を指定"],
    ["リズム練習", "必要ならリズム変換"],
    ["通し", "流れ優先 / 止まらない"],
  ];
}

function blankPracticeSet(rowCount = 5) {
  return Array.from({ length: rowCount }, () => ["", ""]);
}

function normalizePracticeRow(row, fallbackRow = ["", ""]) {
  if (!Array.isArray(row)) return [String(fallbackRow[0] || ""), String(fallbackRow[1] || "")];
  return [String(row[0] ?? fallbackRow[0] ?? ""), String(row[1] ?? fallbackRow[1] ?? "")];
}

function ensurePracticesShape(state) {
  const base = defaultState();
  const next = sanitizeState(state);
  next.practices = next.curves.map((_, curveIndex) => {
    const fallbackSet = base.practices[curveIndex] || genericPracticeSet();
    const sourceSet = Array.isArray(next.practices[curveIndex]) ? next.practices[curveIndex] : [];
    const rows = sourceSet.slice(0, 60).map((row, rowIndex) => normalizePracticeRow(row, fallbackSet[rowIndex] || ["", ""]));
    return rows.length ? rows : [normalizePracticeRow(fallbackSet[0] || ["", ""] )];
  });
  return next;
}

function sanitizeCollapsedCurveIndices(values, curveCount) {
  return (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value < curveCount)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .sort((a, b) => a - b);
}

function sanitizeState(input) {
  const base = defaultState();
  const source = input && typeof input === "object" ? input : base;
  const curves = normalizeCurveSlots(Array.isArray(source.curves) ? source.curves : base.curves);
  const practices = curves.map((_, curveIndex) => {
    const sourceSet = Array.isArray(source.practices) ? source.practices[curveIndex] : null;
    const fallbackSet = base.practices[curveIndex] || genericPracticeSet();
    if (!Array.isArray(sourceSet) || sourceSet.length === 0) {
      return fallbackSet.map((row) => normalizePracticeRow(row));
    }
    return sourceSet.slice(0, 60).map((row, rowIndex) => normalizePracticeRow(row, fallbackSet[rowIndex] || ["", ""]));
  });

  return {
    schemaVersion: 1,
    createdDate: isIsoDateText(source.createdDate) ? source.createdDate : base.createdDate,
    startDate: isIsoDateText(source.startDate) ? source.startDate : (isIsoDateText(source.createdDate) ? source.createdDate : base.startDate),
    dayCount: clampDayCount(source.dayCount),
    curves,
    practices,
    collapsedCurveIndices: sanitizeCollapsedCurveIndices(source.collapsedCurveIndices, curves.length),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return sanitizeState(defaultState());
    return sanitizeState(JSON.parse(raw));
  } catch {
    return sanitizeState(defaultState());
  }
}

function saveState(state) {
  const sanitized = ensurePracticesShape(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  return sanitized;
}

function loadRecentCandidateIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_CANDIDATE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === "string" && candidateById.has(id)).slice(0, RECENT_CANDIDATE_LIMIT);
  } catch {
    return [];
  }
}

function saveRecentCandidateIds(ids) {
  const sanitized = sanitizeRecentCandidateIds(ids);
  localStorage.setItem(RECENT_CANDIDATE_KEY, JSON.stringify(sanitized));
  return sanitized;
}

function sanitizeRecentCandidateIds(ids) {
  return (Array.isArray(ids) ? ids : [])
    .filter((id) => typeof id === "string" && candidateById.has(id))
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .slice(0, RECENT_CANDIDATE_LIMIT);
}

function pushRecentCandidate(id) {
  if (!candidateById.has(id)) return loadRecentCandidateIds();
  const next = loadRecentCandidateIds().filter((item) => item !== id);
  next.unshift(id);
  return saveRecentCandidateIds(next);
}

function filteredCandidates(keyword) {
  const q = String(keyword || "").trim().toLowerCase();
  if (!q) return CANDIDATE_LIBRARY.slice();
  return CANDIDATE_LIBRARY.filter((candidate) => `${candidate.title} ${candidate.desc}`.toLowerCase().includes(q));
}

function buildBackupPayload(state) {
  return {
    app: "piano_practice_app_mock",
    version: 1,
    exportedAt: new Date().toISOString(),
    state: saveState(state),
    recentCandidateIds: loadRecentCandidateIds(),
  };
}

function compactDateLabel(iso) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}${match[2]}${match[3]}` : "";
}

function sanitizeFileLabelPart(value, fallback = "untitled") {
  const text = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 24);
  return text || fallback;
}

function backupFileName(state) {
  const exportedStamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 16);
  const startPart = compactDateLabel(state?.startDate);
  const curvePart = sanitizeFileLabelPart(Array.isArray(state?.curves) ? state.curves[0] || "1曲目" : "1曲目", "1曲目");
  const parts = ["piano-practice-backup", exportedStamp];
  if (startPart) parts.push(`start${startPart}`);
  if (curvePart) parts.push(curvePart);
  return `${parts.join("_")}.json`;
}

function isIsoDateText(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseBackupPayload(payload) {
  const source = payload && typeof payload === "object" && payload.state && typeof payload.state === "object"
    ? payload.state
    : payload;
  if (!source || typeof source !== "object") return null;
  if (!("curves" in source || "practices" in source || "startDate" in source || "createdDate" in source)) {
    return null;
  }
  return {
    state: sanitizeState(source),
    recentCandidateIds: payload && Array.isArray(payload.recentCandidateIds)
      ? sanitizeRecentCandidateIds(payload.recentCandidateIds)
      : loadRecentCandidateIds(),
  };
}

function dateLabels(startISO, count) {
  const labels = [];
  const start = new Date(`${startISO || todayLocalISO()}T00:00:00`);
  for (let index = 0; index < MAX_COLS; index += 1) {
    if (index < count) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      labels.push(`${date.getMonth() + 1}/${date.getDate()}`);
    } else {
      labels.push("");
    }
  }
  return labels;
}

function createDownload(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

window.PianoPracticeShared = {
  STORAGE_KEY,
  MAX_COLS,
  MAX_CURVES,
  MAX_TABLE_ROWS_PER_PAGE,
  RECENT_CANDIDATE_KEY,
  RECENT_CANDIDATE_LIMIT,
  CANDIDATE_LIBRARY,
  candidateById,
  todayLocalISO,
  clampDayCount,
  normalizeCurveSlots,
  defaultState,
  formatCreatedDateLabel,
  formatDateJP,
  escapeHtml,
  curveLabel,
  genericPracticeSet,
  blankPracticeSet,
  ensurePracticesShape,
  sanitizeCollapsedCurveIndices,
  sanitizeState,
  loadState,
  saveState,
  loadRecentCandidateIds,
  saveRecentCandidateIds,
  sanitizeRecentCandidateIds,
  pushRecentCandidate,
  filteredCandidates,
  buildBackupPayload,
  compactDateLabel,
  sanitizeFileLabelPart,
  backupFileName,
  isIsoDateText,
  parseBackupPayload,
  dateLabels,
  createDownload,
};
})();
