/* headless test harness: stub DOM + SheetJS, load app.js, run engine checks */
const fs = require("fs");
const path = require("path");

const els = {};
function fakeEl(id) {
  if (!els[id]) {
    els[id] = {
      value: "", textContent: "", innerHTML: "", scrollTop: 0,
      children: [], appendChild() {}, addEventListener() {},
      classList: { add() {}, remove() {}, toggle() {} },
      querySelector: () => ({ innerHTML: "", appendChild() {} }),
      scrollIntoView() {}, click() {}, setSelectedIndex(v) { this._sel = v; },
      set selectedIndex(v) { this._sel = v; },
      get selectedIndex() { return this._sel ?? 0; },
    };
  }
  return els[id];
}
global.document = {
  getElementById: fakeEl,
  createElement: () => ({ append() {}, set textContent(v) {}, addEventListener() {} }),
  addEventListener() {},
};
global.XLSX = { utils: {} };
global.alert = m => { throw new Error("ALERT: " + m); };

eval(fs.readFileSync(path.join(__dirname, "app.js"), "utf8")
  + "\n; globalThis.__app = { state, buildRows };");
const state = globalThis.__app.state;
const run = globalThis.__app.buildRows;

/* --- configure: replicate config_2026_09.json --- */
fakeEl("year").value = "2026";
fakeEl("month").value = "9";
fakeEl("default_task").value = "অতিরিক্ত দায়িত্ব হিসেবে অফিসিয়াল ও ফাইন্যান্স সম্পর্কিত কাজ, তদারকি, রিপোর্টিং, ইত্যাদি।";
state.upazilas = [
  { district: "বাগেরহাট", upazila: "কচুয়া" },
  { district: "নীলফামারি", upazila: "সৈয়দপুর" },
  { district: "নীলফামারি", upazila: "কিশোরগঞ্জ" },
  { district: "নীলফামারি", upazila: "নীলফামারি সদর" },
  { district: "বরিশাল", upazila: "নেছারাবাদ" },
];
state.overrides = [{ date: "2026-09-22", task: "ফিল্ড ভিজিট- প্রকল্পের কাজে মন্ত্রণালয় ভিজিট" }];
state.dailyTasks = ["অফিস মিটিংয়ে অংশগ্রহণ ও কার্যবিবরণী প্রস্তুত, জরুরী চিঠিপত্র", "প্রকল্প সংক্রান্ত আর্থিক হিসাব যাচাই"];

let ok = true;
function assert(cond, msg) {
  console.log((cond ? "PASS" : "FAIL") + ": " + msg);
  if (!cond) ok = false;
}

const res = buildRows();

/* 1. 30 days in September */
assert(res.rows.length === 30, "September has 30 rows");

/* 2. weekends: 4,5,11,12,18,19,25,26 Sep 2026 are Fri/Sat */
const bnWeekend = new Set(["০৪-০৯-২০২৬","০৫-০৯-২০২৬","১১-০৯-২০২৬","১২-০৯-২০২৬",
  "১৮-০৯-২০২৬","১৯-০৯-২০২৬","২৫-০৯-২০২৬","২৬-০৯-২০২৬"]);
const weekendRows = res.rows.filter(r => bnWeekend.has(r.dateBn));
assert(weekendRows.length === 8 && weekendRows.every(r => r.task === "সাপ্তাহিক ছুটি"), "all 8 Fri/Sat = সাপ্তাহিক ছুটি");
assert(res.rows.filter(r => r.dayBn === "শুক্রবার" && r.task !== "সাপ্তাহিক ছুটি").length === 0, "no सोম weekday mislabel on Fridays");

/* 3. row on 22-09-2026 is the override */
const ov = res.rows.find(r => r.dateBn === "২২-০৯-২০২৬");
assert(ov && ov.task === "ফিল্ড ভিজিট- প্রকল্পের কাজে মন্ত্রণালয় ভিজিট", "override lands on exactly 22-09-2026");

/* 4. each upazila text appears exactly 2x, two consecutive working days */
const wd = r => ["সাপ্তাহিক ছুটি", "ফিল্ড ভিজিট- প্রকল্পের কাজে মন্ত্রণালয় ভিজিট"].includes(r.task);
const upazilaTexts = state.upazilas.map(u =>
  `{district} জেলার {upazila} উপজেলার পরিবেশগত তথ্য বিশ্লেষণ এবং পরিবেশগত প্রতিবেদন প্রণয়ন করা হয়েছে।`
    .replace("{district}", u.district).replace("{upazila}", u.upazila));
for (const t of upazilaTexts) {
  const idxs = res.rows.map((r, i) => r.task === t ? i : -1).filter(i => i >= 0);
  /* 2 consecutive WORKING days (python pool semantics) — a weekend may fall between */
  let okPair = idxs.length === 2;
  if (okPair) {
    for (let i = idxs[0] + 1; i < idxs[1]; i++)
      if (!wd(res.rows[i])) { okPair = false; break; }
  }
  assert(okPair, `upazila "${t.slice(0, 15)}..." spans exactly 2 consecutive working days`);
}

/* 5. each daily task appears exactly 1x */
for (const t of state.dailyTasks)
  assert(res.rows.filter(r => r.task === t).length === 1, `daily task 1x: ${t.slice(0, 12)}...`);

/* 6. remaining days = default; count check:
      Sept 2026: 30 days, 8 weekend, 1 override -> 21 pool days;
      units: 5 upazila (10) + 2 daily (2) = 12 -> filler = 9 */
const filler = res.rows.filter(r => r.task === res.defaultTask).length;
assert(filler === 9, `default-task filler count = 9 (got ${filler})`);

/* 7. 21 rows are non-weekend */
assert(res.rows.filter(r => !bnWeekend.has(r.dateBn)).length === 22, "22 non-weekend rows (21 working + shows all)");

/* 8. reproducibility: same seed -> identical output */
const res2 = buildRows();
assert(JSON.stringify(res.rows) === JSON.stringify(res2.rows), "reproducible with same default seed");

/* 9. bengali digits everywhere */
assert(/^[০-৯-/]+$/.test(res.rows[0].dateBn), "dates in Bengali numerals: " + res.rows[0].dateBn);

/* 10. warning path: too many upazilas -> fillerCount < 0 handled */
state.upazilas = Array.from({ length: 11 }, () => ({ district: "ঢাকা", upazila: "ধামরাই" }));
const res3 = buildRows();
assert(res3.warnings.length > 0, "warning emitted when not enough working days");
assert(res3.rows.length === 30, "rows still complete when overloaded");

console.log(ok ? "\nALL TESTS PASSED" : "\nSOME TESTS FAILED");
process.exit(ok ? 0 : 1);
