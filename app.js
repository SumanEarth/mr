/* মাসিক অগ্রগতি প্রতিবেদন জেনারেটর — ব্রাউজার সংস্করণ
   generate_report.py-এর সব নিয়ম JS-এ রিপ্লিকেট করা হয়েছে। */

/* ---------- constants ---------- */
const BN_DIGITS = { "0": "০", "1": "১", "2": "২", "3": "৩", "4": "৪",
                    "5": "৫", "6": "৬", "7": "৭", "8": "৮", "9": "৯" };
const BN_WEEKDAYS = ["সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার",
                     "শুক্রবার", "শনিবার", "রবিবার"]; // Mon=0 ... Sun=6
const BN_MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
                   "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const DEFAULT_HEADER = [
  "গণপ্রজাতন্ত্রী বাংলাদেশ সরকার",
  "ভূমি মন্ত্রণালয়",
  "মৌজা ও প্লট ভিত্তিক জাতীয় ডিজিটাল ভূমি জোনিং প্রকল্প",
  "ভূমি ভবন, ৯৮ শহীদ তাজউদ্দীন আহমেদ সরণি, তেজগাঁও, ঢাকা-১২০৮।",
  "পরামর্শকের নাম: মো: সুমন মিয়া",
  "পদবী: পরিবেশ স্পেশালিষ্ট"
];
const TASK_TEMPLATE = "{district} জেলার {upazila} উপজেলার পরিবেশগত তথ্য বিশ্লেষণ এবং পরিবেশগত প্রতিবেদন প্রণয়ন করা হয়েছে।";
const DEFAULT_TASK_FALLBACK = "অতিরিক্ত দায়িত্ব হিসেবে অফিসিয়াল ও ফাইন্যান্স সম্পর্কিত কাজ, তদারকি, রিপোর্টিং, ইত্যাদি।";

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const bn = s => String(s).replace(/[0-9]/g, d => BN_DIGITS[d]);
const pad2 = n => String(n).padStart(2, "0");
function bnDate(y, m, d) { return bn(`${pad2(d)}-${pad2(m)}-${y}`); }
function isoToDate(iso) {          // "YYYY-MM-DD" -> {y,m,d}
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}
/* python date.weekday(): Mon=0...Sun=6 ; JS getUTCDay(): Sun=0 */
function weekday(y, m, d) {
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 6 : js - 1;
}

/* seeded PRNG (mulberry32) — same seed => same layout */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {           // Fisher-Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
const fmt = (y, m) => `${y}-${pad2(m)}`;

/* ---------- app state ---------- */
const state = {
  headerLines: [...DEFAULT_HEADER],
  upazilas: [],   // {district, upazila}
  dailyTasks: [], // string
  overrides: [],  // {date:"YYYY-MM-DD", task}
  leaves: [],     // {date:"YYYY-MM-DD", reason}
};

/* ---------- list rendering ---------- */
function renderLists() {
  const mk = (ul, items, labelFn, removeFn) => {
    $(ul).innerHTML = "";
    if (!items.length) { $(ul).innerHTML = '<li>— কিছু যোগ করা হয়নি —</li>'; return; }
    items.forEach((it, i) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = labelFn(it);
      const btn = document.createElement("button");
      btn.textContent = "✕ বাদ দিন";
      btn.addEventListener("click", () => { removeFn(i); renderLists(); });
      li.append(span, btn);
      $(ul).appendChild(li);
    });
  };
  mk("upazila_list", state.upazilas,
    u => `${u.district} জেলা → ${u.upazila} উপজেলা (২ কর্মদিবস)`,
    i => state.upazilas.splice(i, 1));
  mk("daily_list", state.dailyTasks, t => t, i => state.dailyTasks.splice(i, 1));
  mk("override_list", state.overrides,
    o => { const d = isoToDate(o.date); return `${bnDate(d.y, d.m, d.d)} — ${o.task}`; },
    i => state.overrides.splice(i, 1));
  mk("leave_list", state.leaves,
    l => { const d = isoToDate(l.date); return `${bnDate(d.y, d.m, d.d)} — ${l.reason || "ছুটি"}`; },
    i => state.leaves.splice(i, 1));
  mk("header_list", state.headerLines, t => t, i => { state.headerLines.splice(i, 1); });
}

/* ---------- add buttons ---------- */
function addUpazila() {
  const dist = $("uz_district").value.trim();
  const upaz = $("uz_upazila").value.trim();
  if (!dist || !upaz) { alert("জেলা ও উপজেলা দুটোই লিখুন।"); return; }
  state.upazilas.push({ district: dist, upazila: upaz });
  $("uz_district").value = ""; $("uz_upazila").value = "";
  renderLists();
}
function addDaily() {
  const t = $("daily_text").value.trim();
  if (!t) { alert("কাজের বিবরণ লিখুন।"); return; }
  state.dailyTasks.push(t); $("daily_text").value = ""; renderLists();
}
function addOverride() {
  const iso = $("ov_date").value, task = $("ov_task").value.trim();
  if (!iso || !task) { alert("তারিখ ও কাজ — দুটোই দিন।"); return; }
  state.overrides.push({ date: iso, task }); $("ov_task").value = ""; renderLists();
}
function addLeave() {
  const iso = $("lv_date").value, reason = $("lv_reason").value.trim();
  if (!iso) { alert("ছুটির তারিখ দিন।"); return; }
  state.leaves.push({ date: iso, reason }); $("lv_reason").value = ""; renderLists();
}
function addHeader() {
  const t = $("hdr_text").value.trim();
  if (!t) { alert("হেডার লাইন লিখুন।"); return; }
  state.headerLines.push(t); $("hdr_text").value = ""; renderLists();
}
/* ---------- core engine (port of generate_report.py) ---------- */
function buildRows() {
  const warnings = [];
  const year = parseInt($("year").value, 10);
  const month = parseInt($("month").value, 10);
  const defaultTask = $("default_task").value.trim() || DEFAULT_TASK_FALLBACK;

  const nDays = new Date(Date.UTC(year, month, 0)).getUTCDate(); // days in month

  const leaves = {};   // "YYYY-MM-DD" -> reason
  state.leaves.forEach(l => {
    const d = isoToDate(l.date);
    leaves[`${d.y}-${pad2(d.m)}-${pad2(d.d)}`] = l.reason || "ছুটি";
  });
  const overrides = {}; // "YYYY-MM-DD" -> task
  state.overrides.forEach(o => {
    const d = isoToDate(o.date);
    overrides[`${d.y}-${pad2(d.m)}-${pad2(d.d)}`] = o.task;
  });

  // working days: not Friday(4)/Saturday(5), not a leave
  const allDates = Array.from({ length: nDays }, (_, i) => i + 1);
  const workingDays = allDates.filter(d => {
    const wd = weekday(year, month, d);
    if (wd === 4 || wd === 5) return false;
    return !leaves[`${year}-${pad2(month)}-${pad2(d)}`];
  });

  // pool: working days not already claimed by an explicit override
  const pool = workingDays.filter(d => !overrides[`${year}-${pad2(month)}-${pad2(d)}`]);

  // units: (length, text) — 2-day upazila blocks stay consecutive
  const units = [];
  state.upazilas.forEach(u => {
    const text = TASK_TEMPLATE
      .replace("{district}", u.district || "")
      .replace("{upazila}", u.upazila || "");
    units.push({ len: 2, text });
  });
  state.dailyTasks.forEach(t => units.push({ len: 1, text: t }));

  const fixedLen = units.reduce((s, u) => s + u.len, 0);
  let fillerCount = pool.length - fixedLen;
  if (fillerCount < 0) {
    warnings.push(`WARNING: পর্যাপ্ত working day নেই (${pool.length}টি), ${fixedLen}টি স্লট দরকার। কিছু কাজ বাদ পড়বে।`);
    fillerCount = 0;
  }
  for (let i = 0; i < fillerCount; i++) units.push({ len: 1, text: defaultTask });

  const seedInput = $("seed").value.trim();
  const seed = seedInput ? Number(seedInput) : year * 100 + month;
  shuffle(units, mulberry32(seed));

  const taskMap = {};  // day-of-month -> text
  let pos = 0, dropped = 0;
  for (const u of units) {
    if (pos + u.len > pool.length) { dropped++; continue; }
    for (let k = 0; k < u.len; k++) taskMap[pool[pos + k]] = u.text;
    pos += u.len;
  }
  if (dropped) warnings.push(`WARNING: ${dropped}টি কাজ বসানো যায়নি (জায়গা শেষ)।`);

  const rows = allDates.map(d => {
    const wd = weekday(year, month, d);
    const key = `${year}-${pad2(month)}-${pad2(d)}`;
    let task;
    if (wd === 4 || wd === 5) task = "সাপ্তাহিক ছুটি";
    else if (leaves[key]) task = leaves[key];
    else if (overrides[key]) task = overrides[key];
    else if (taskMap[d]) task = taskMap[d];
    else task = defaultTask;
    return { dateBn: bnDate(year, month, d), dayBn: BN_WEEKDAYS[wd], task, comment: "" };
  });

  return { rows, year, month, defaultTask, warnings };
}

/* ---------- xlsx export ---------- */
function downloadXlsx(result) {
  const { rows, year, month } = result;
  const wb = XLSX.utils.book_new();
  const aoa = [];
  state.headerLines.forEach(l => aoa.push([l, "", "", ""]));
  aoa.push([`পরামর্শকের মাসিক অগ্রগতির বিবরণ - ${BN_MONTHS[month - 1]}/${bn(year)}`, "", "", ""]);
  aoa.push(["তারিখ", "দিন", "কাজের বিবরণ", "মন্তব্য"]);
  rows.forEach(r => aoa.push([r.dateBn, r.dayBn, r.task, r.comment]));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const merges = [];
  let r = 0;
  for (let i = 0; i < state.headerLines.length; i++, r++) merges.push({ s: { r, c: 0 }, e: { r, c: 3 } });
  merges.push({ s: { r, c: 0 }, e: { r, c: 3 } });
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 60 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `report_${fmt(year, month).replace("-", "_")}.xlsx`);
}

function downloadJson(result) {
  const { year, month, defaultTask } = result;
  const cfg = {
    year, month,
    header_lines: state.headerLines,
    default_task: defaultTask,
    task_template: TASK_TEMPLATE,
    leaves: state.leaves.map(l => {
      const d = isoToDate(l.date);
      return { date: `${pad2(d.d)}-${pad2(d.m)}-${d.y}`, reason: l.reason || "ছুটি" };
    }),
    upazilas: state.upazilas,
    overrides: state.overrides.map(o => {
      const d = isoToDate(o.date);
      return { date: `${pad2(d.d)}-${pad2(d.m)}-${d.y}`, task: o.task };
    }),
    daily_tasks: state.dailyTasks,
    random_seed: $("seed").value.trim() ? Number($("seed").value) : year * 100 + month,
  };
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `config_${fmt(year, month)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- preview ---------- */
function showPreview(result) {
  $("warning_box").textContent = result.warnings.length ? result.warnings.join("\n") : "";
  $("warning_box").classList.toggle("hidden", result.warnings.length === 0);
  $("preview_title").textContent = `প্রিভিউ — ${BN_MONTHS[result.month - 1]} ${bn(result.year)} (${result.rows.length} দিন)`;
  const tbody = $("preview_table").querySelector("tbody");
  tbody.innerHTML = "";
  result.rows.forEach(r => {
    const tr = document.createElement("tr");
    [r.dateBn, r.dayBn, r.task, r.comment].forEach(v => {
      const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  $("preview_card").classList.remove("hidden");
  $("download_xlsx").classList.remove("hidden");
  $("download_json").classList.remove("hidden");
  $("preview_card").scrollIntoView({ behavior: "smooth" });
}

/* ---------- init ---------- */
function init() {
  $("month").innerHTML = BN_MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
  const thisYear = new Date().getFullYear();
  $("year").innerHTML = Array.from({ length: 6 },
    (_, i) => `<option value="${thisYear + i}">${bn(thisYear + i)}</option>`).join("");
  $("month").selectedIndex = new Date().getMonth();
  $("year").value = String(thisYear);

  $("add_upazila").addEventListener("click", addUpazila);
  $("add_daily").addEventListener("click", addDaily);
  $("add_override").addEventListener("click", addOverride);
  $("add_leave").addEventListener("click", addLeave);
  $("add_header").addEventListener("click", addHeader);
  $("reset_header").addEventListener("click", () => { state.headerLines = [...DEFAULT_HEADER]; renderLists(); });
  $("generate").addEventListener("click", () => showPreview(buildRows()));
  $("download_xlsx").addEventListener("click", () => downloadXlsx(buildRows()));
  $("download_json").addEventListener("click", () => downloadJson(buildRows()));
  renderLists();
}
/* ---------- password gate ----------
   পাসওয়ার্ড সরাসরি ফাইলে না রেখে এর SHA-256 hash রাখা হয়।
   নতুন পাসওয়ার্ড সেট করতে: নিচের PASSWORD_HASH বদলে দিন।
   নতুন hash বানাতে ব্রাউজারের Console-এ লিখুন:
      makeHash("আপনার_নতুন_পাসওয়ার্ড")
   প্রিন্ট হওয়া hex টি এখানে বসিয়ে আবার push করুন। */
const PASSWORD_HASH = "11d322ea49f13e2cbb05afc6a22f0e992bfc745c404bbc49187c0eb91035631c";
// ডিফল্ট পাসওয়ার্ড: sumon2026

async function makeHash(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
if (typeof window !== "undefined") window.makeHash = makeHash;   // console-এ hash বানানোর সুবিধা
async function tryLogin() {
  const pw = $("gate_password").value;
  if (!pw) return;
  const hash = await makeHash(pw);
  if (hash === PASSWORD_HASH) {
    sessionStorage.setItem("rp_auth", "1");
    unlockApp();
  } else {
    $("gate_error").classList.remove("hidden");
    $("gate_password").value = "";
    $("gate_password").focus();
  }
}

function unlockApp() {
  $("gate").classList.add("hidden");
  $("app").hidden = false;
  init();   // প্রথমবার খোলার পরেই অ্যাপ init হবে
}

function setupGate() {
  if (sessionStorage.getItem("rp_auth") === "1") { unlockApp(); return; }
  $("gate_submit").addEventListener("click", tryLogin);
  $("gate_password").addEventListener("keydown", e => { if (e.key === "Enter") tryLogin(); });
}

document.addEventListener("DOMContentLoaded", setupGate);


