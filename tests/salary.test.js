/**
 * Salary Calculation Verification
 * Worked examples for the salary sheet: earnings, leaves, overtime, holidays, typed-over values,
 * statutory deductions and net pay, plus saving values typed into the sheet.
 */

import { calculateSalaries, normalizeSalaryType } from '../src/engine/salaryEngine.js';

const stable = (v) => JSON.stringify(v, (k, val) =>
  val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort()) : val);

function assertEqual(actual, expected, message) {
  if (stable(actual) !== stable(expected)) {
    console.error(`❌ FAILED: ${message} (Expected: ${stable(expected)}, Got: ${stable(actual)})`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message} [${stable(actual)}]`);
}

console.log('--- STARTING SALARY TESTS ---\n');

// Salary cycle Sep 2026 = 22 Aug – 21 Sep (31 days); Thursdays in it: 27 Aug, 3, 10, 17 Sep
const cycleKey = '2026-09';
const shifts = [
  { id: 'OFFICE', name: 'Office', startTime: '09:00', endTime: '18:00', weeklyOff: 'Sunday' },
  { id: 'FLEX_12', name: 'Flexible 12h', isFlexible: true, workingHours: 12, startTime: '', endTime: '', weeklyOff: 'None' }
];
const workers = [
  { id: 'W1', name: 'Daily Wager', department: 'Label', subDepartment: 'Printing', designation: 'Operator', shiftId: 'FLEX_12', weeklyOff: 'Thursday', dutyHours: 8 },
  { id: 'W2', name: 'Monthly Staff', department: 'HR', shiftId: 'OFFICE', weeklyOff: 'None' },
  { id: 'W3', name: 'Extra Days', department: 'Pouch', shiftId: 'FLEX_12', weeklyOff: 'Thursday', dutyHours: 8 },
  { id: 'W4', name: 'No Wage', department: 'Pouch', shiftId: 'OFFICE', weeklyOff: 'Thursday' },
  { id: 'W5', name: 'Active, Absent', department: 'Pouch', shiftId: 'OFFICE' },
  { id: 'W6', name: 'Inactive', department: 'Pouch', shiftId: 'OFFICE', isActive: false }
];
const presence = (workerId, daysPresent, halfDays = 0) => ({ workerId, month: cycleKey, daysPresent, halfDays, basis: 'shift' });
const presenceSummary = [presence('W1', 25, 1), presence('W2', 31), presence('W3', 29), presence('W4', 20)];
const monthlyStats = [
  { workerId: 'W1', month: cycleKey, totalOtMinutes: 600, totalMemoAmount: 200 },
  { workerId: 'W2', month: cycleKey, totalOtMinutes: 0, totalMemoAmount: 0 }
];
const profiles = {
  w1: { salaryType: 'Daily', dailyWage: 500, location: 'Plant 1' },
  w2: { salaryType: 'Monthly', monthlySalary: 15000 },
  w3: { dailyWage: 400 }
};
const cycleInputs = {
  w1: { approvedLeaves: 1, advance: 1000, loan: 500, remarks: 'OK' },
  w4: { esiAmount: 50 }
};
const run = (config = {}, extra = {}) => calculateSalaries({ cycleKey, cycleStartDay: 22, workers, shifts, presenceSummary, monthlyStats, profiles, cycleInputs, config, ...extra });
const row = (rows, id) => rows.find(r => r.workerId === id);

// 1. Daily wager with a half day, an approved leave, overtime, advance, loan and a memo
console.log('Test Suite 1: Daily Wage Worker');
const rows = run();
const w1 = row(rows, 'W1');
assertEqual([w1.status, w1.subDepartment, w1.mcOperation, w1.location, w1.remarks], ['Active', 'Printing', 'Operator', 'Plant 1', 'OK'], 'Worker Master details shown; MC / Operation defaults to the designation');
assertEqual([w1.workingDays, w1.attendedDays, w1.extraDays], [27, 24.5, 0], '31 days − 4 Thursday offs = 27 working days; 25 present incl. 1 half day = 24.5');
assertEqual([w1.totalLeaves, w1.approvedLeaves, w1.notApprovedLeaves], [2.5, 1, 1.5], 'Leaves: 2.5 total, 1 approved, 1.5 not approved');
assertEqual(w1.salary, 13500, 'salary = daily wage 500 × 27 working days = 13,500');
assertEqual(w1.salaryAttendedPlusExtra, 12250, 'Salary (attended) + Extra Days = 500 × 24.5 attended days = 12,250 (the approved leave is not paid)');
assertEqual([w1.shiftHours, w1.otherTime, w1.otherAmount], [8, 10, 833], 'other time 10h; Other Amount = 10 × (500 ÷ 6h) = 833.3 -> 833');
assertEqual([w1.pf, w1.esi, w1.professionalTax, w1.memo, w1.attendanceMemo], [0, 200, 0, 0, 200], 'PF and memo not typed = 0; ES deduction 200 applied as salary 13,500 ≥ 12,000; Prof Tax is manual (0)');
assertEqual(w1.netPay, 11383, 'Net = 13,083 − (1,000 advance + 500 loan + 200 ES) = 11,383');
const w1WithPt = row(run({}, { cycleInputs: { w1: { ...cycleInputs.w1, ptAmount: 100 } } }), 'W1');
assertEqual([w1WithPt.professionalTax, w1WithPt.netPay], [100, 11283], 'Prof Tax manually added as 100: net = 11,283');

// 2. Monthly salary, full attendance, no weekly off
console.log('\nTest Suite 2: Monthly Salary Worker');
const w2 = row(rows, 'W2');
assertEqual([w2.salaryType, w2.workingDays, w2.dailyWage, w2.salary, w2.salaryAttendedPlusExtra], ['Monthly', 31, 483.87, 15000, 15000], 'Full attendance on a monthly salary of 15,000 = the full 15,000');
assertEqual([w2.pf, w2.esi, w2.professionalTax, w2.netPay], [0, 200, 0, 14800], 'No PF or Prof Tax typed; ES 200 applied (salary 15,000 ≥ 12,000); net 14,800');
// Office shift with overtime punches recorded in attendance: overtime is NOT paid to office staff
const w2WithOt = row(run({}, { monthlyStats: [...monthlyStats.filter(s => s.workerId !== 'W2'), { workerId: 'W2', month: cycleKey, totalOtMinutes: 300 }] }), 'W2');
assertEqual([w2WithOt.otherTime, w2WithOt.otherAmount], [0, 0], 'Office shift OT is not calculated in salary (other time = 0, Other Amount = 0)');
const both = row(run({}, { profiles: { ...profiles, w2: { salaryType: 'Monthly', monthlySalary: 15000, dailyWage: 500 } } }), 'W2');
assertEqual([both.dailyWage, both.salary, both.salaryAttendedPlusExtra], [500, 15000, 15500], 'Monthly type with both entered: the typed daily wage is used (500 × 31 attended)');

// 3. Worked beyond the working days (weekly offs worked) -> extra days
console.log('\nTest Suite 3: Extra Days');
const w3 = row(rows, 'W3');
assertEqual([w3.daysPresent, w3.attendedDays, w3.extraDays, w3.salaryAttendedPlusExtra], [29, 27, 2, 11600], '29 present on 27 working days = 27 attended + 2 extra days: 400 × (27 + 2) = 11,600');
assertEqual([w3.salary, w3.pf, w3.esi, w3.professionalTax, w3.netPay], [10800, 0, 0, 0, 11600], 'Salary 400 × 27 = 10,800 is below 12,000: no Prof Tax');

// 4. Missing wage, ES typed over, every active worker listed
console.log('\nTest Suite 4: Missing Wage and Who Is Listed');
const w4 = row(rows, 'W4');
assertEqual([w4.grossSalary, w4.esi, w4.netPay], [0, 50, null], 'No wage -> 0 earnings, net pay left blank; ES typed as 50');
assertEqual(w4.flags.some(f => f.includes('No daily wage')), true, 'Worker without a wage is flagged');
assertEqual([row(rows, 'W5')?.attendedDays, row(rows, 'W5')?.netPay], [0, null], 'Active worker with no attendance is listed so details can be typed in');
assertEqual(row(rows, 'W6'), undefined, 'Inactive worker with no attendance or salary details is not listed');

// 3b. Salary (attended) + Extra Days = daily wage × (Attended Days + extra days), nothing else
console.log('\nTest Suite 3b: Salary (attended) + Extra Days');
const tenDays = (profile, inputs = {}, workerId = 'T1') => calculateSalaries({
  cycleKey, cycleStartDay: 22, shifts,
  workers: [{ id: workerId, name: 'Ten Days', department: 'Pouch', shiftId: 'OFFICE', weeklyOff: 'Thursday' }],
  presenceSummary: [presence(workerId, 10)], profiles: { [workerId.toLowerCase()]: profile }, cycleInputs: { [workerId.toLowerCase()]: inputs }
})[0];
const daily10 = tenDays({ salaryType: 'Daily', dailyWage: 500 });
assertEqual([daily10.attendedDays, daily10.extraDays, daily10.salaryAttendedPlusExtra], [10, 0, 5000], 'Daily wage 500, 10 attended days, no extra days = 5,000');
assertEqual(tenDays({ salaryType: 'Daily', dailyWage: 500 }, { approvedLeaves: 5 }).salaryAttendedPlusExtra, 5000, 'Approved leaves typed in do not change it');
assertEqual(tenDays({ salaryType: 'Monthly (No Extra)', dailyWage: 500, monthlySalary: 15000 }).salaryAttendedPlusExtra, 5000, 'Monthly worker with a salary typed too: the typed daily wage 500 is used');
const plus10 = tenDays({ salaryType: 'Monthly (+2)', dailyWage: 500 });
assertEqual([plus10.extraDays, plus10.salaryAttendedPlusExtra], [2, 6000], 'Monthly (+2): 500 × (10 attended + 2 extra) = 6,000');

// 4a. ES deduction when salary entered is 12,000 or more; manual deductions for Prof Tax, Advance, Loan, Memo, PF
console.log('\nTest Suite 4a: ES deduction for salary >= 12,000; Manual Deductions');
const salaryOf = (monthlySalary, extra = {}, present = 31) => calculateSalaries({
  cycleKey, cycleStartDay: 22, shifts, workers: [workers[1]], presenceSummary: [presence('W2', present)], monthlyStats,
  profiles: { w2: { salaryType: 'Monthly', monthlySalary } }, ...extra
})[0];
assertEqual([salaryOf(12000).esi, salaryOf(11999).esi, salaryOf(20000).esi], [200, 0, 200], 'ES deduction 200 applied when salary is 12,000 or more, 0 below');
const fewDays = salaryOf(12400, {}, 10);
assertEqual([fewDays.grossSalary, fewDays.esi], [4000, 200], 'ES deduction goes by entered salary (12,400 >= 12,000), not gross (4,000 for 10 days)');
assertEqual(salaryOf(15000, { cycleInputs: { w2: { esiAmount: 150 } } }).esi, 150, 'ES deduction can be typed over');
assertEqual(salaryOf(15000).professionalTax, 0, 'Prof Tax is 0 unless manually typed');
const typedDeductions = salaryOf(15000, { cycleInputs: { w2: { advance: 1000, loan: 500, memo: 100, pfAmount: 1800, esiAmount: 113, ptAmount: 200 } } });
assertEqual([typedDeductions.advance, typedDeductions.loan, typedDeductions.memo, typedDeductions.pf, typedDeductions.esi, typedDeductions.professionalTax, typedDeductions.netPay], [1000, 500, 100, 1800, 113, 200, 11287],
  'Typed Advance, Loan, Memo, PF, ES and Prof Tax used: 15,000 − (1,000 + 500 + 100 + 1,800 + 113 + 200) = 11,287');

// 4b. Salary type "Monthly + 2": the 2 goes into extra days
console.log('\nTest Suite 4b: Salary type "Monthly + 2"');
const plusTwo = calculateSalaries({
  cycleKey, cycleStartDay: 22, shifts,
  workers: [
    { id: 'P2', name: 'Monthly Plus Two', department: 'Stores', shiftId: 'OFFICE', weeklyOff: 'Thursday' },
    { id: 'P3', name: 'Plus Two And Extra', department: 'Stores', shiftId: 'OFFICE', weeklyOff: 'Thursday' },
    { id: 'NX', name: 'No Extra', department: 'Stores', shiftId: 'OFFICE', weeklyOff: 'Thursday' }
  ],
  presenceSummary: [presence('P2', 27), presence('P3', 28), presence('NX', 27)],
  profiles: {
    p2: { salaryType: 'Monthly + 2', monthlySalary: 13500 },
    p3: { salaryType: 'Monthly + 2', monthlySalary: 13500 },
    nx: { salaryType: 'Monthly (No Extra)', monthlySalary: 13500 }
  }
});
assertEqual([row(plusTwo, 'P2').dailyWage, row(plusTwo, 'P2').extraDays, row(plusTwo, 'P2').salaryAttendedPlusExtra], [500, 2, 14500], 'Full month on 13,500 (500/day): extra days = 2 -> 14,500');
assertEqual([row(plusTwo, 'P3').extraDays, row(plusTwo, 'P3').salaryAttendedPlusExtra], [3, 15000], '1 day worked beyond working days + 2 = 3 extra days');
assertEqual([row(plusTwo, 'NX').extraDays, row(plusTwo, 'NX').salaryAttendedPlusExtra], [0, 13500], 'Other salary types are unchanged');
assertEqual([row(plusTwo, 'P2').salaryType, row(plusTwo, 'NX').salaryType], ['Monthly (+2)', 'Monthly (No Extra)'], 'Sheet spelling "Monthly + 2" shown as the dropdown choice "Monthly (+2)"');
assertEqual(['daily', 'Monthly+2', 'Monthly (+2)', 'monthly (no extra)', 'Monthly', ''].map(normalizeSalaryType),
  ['Daily', 'Monthly (+2)', 'Monthly (+2)', 'Monthly (No Extra)', 'Monthly', ''], 'Salary type spellings matched to the dropdown; other values kept as they are');
const chosen = calculateSalaries({
  cycleKey, cycleStartDay: 22, shifts,
  workers: [{ id: 'P2', name: 'Monthly Plus Two', department: 'Stores', shiftId: 'OFFICE', weeklyOff: 'Thursday' }],
  presenceSummary: [presence('P2', 27)],
  profiles: { p2: { salaryType: 'Monthly (+2)', monthlySalary: 13500 } }
})[0];
assertEqual([chosen.extraDays, chosen.salaryAttendedPlusExtra], [2, 14500], 'Choosing "Monthly (+2)" in the dropdown adds the same 2 extra days');

// 4c. Holiday Calendar: holidays come out of Working Days (a holiday on a weekly off counts once)
console.log('\nTest Suite 4c: Holidays');
const holidays = [
  { date: '2026-08-27', name: 'On a Thursday (W1\'s weekly off)' },
  { date: '2026-09-07', name: 'Monday holiday' },
  { date: '2026-10-20', name: 'Outside this cycle' }
];
const h1 = row(run({}, { holidays }), 'W1');
assertEqual([h1.workingDays, h1.holidayDays], [26, 1], '27 working days − 1 holiday (the Thursday holiday is already a weekly off) = 26');
const fullMonth = calculateSalaries({ cycleKey, cycleStartDay: 22, shifts, holidays, workers: [workers[1]], presenceSummary: [presence('W2', 29)], profiles: { w2: profiles.w2 } })[0];
assertEqual([fullMonth.workingDays, fullMonth.salaryAttendedPlusExtra, fullMonth.extraDays], [29, 15000, 0], 'Monthly worker present on every working day still gets the full 15,000');
const workedHolidays = calculateSalaries({ cycleKey, cycleStartDay: 22, shifts, holidays, workers: [workers[1]], presenceSummary: [presence('W2', 31)], profiles: { w2: profiles.w2 } })[0];
assertEqual(workedHolidays.extraDays, 2, 'Working on the 2 holidays gives 2 extra days');
assertEqual(row(run({ workingDaysBasis: 'cycleDays' }, { holidays }), 'W1').workingDays, 29, '"All days in the cycle" basis: 31 − 2 holidays');
assertEqual(row(run({ workingDaysBasis: 'fixed26' }, { holidays }), 'W1').workingDays, 26, 'Fixed 26 days is not changed by holidays');

// 4d. Calculated figures typed over in the sheet
console.log('\nTest Suite 4d: Typed-Over Values');
const typedOver = row(run({}, { cycleInputs: { w1: { ...cycleInputs.w1, workingDays: 26, attendedDays: 20, extraDays: 1, otherTime: 5, otherAmount: 1000, memo: 0, pfAmount: 0, esiAmount: 0, ptAmount: 0 } } }), 'W1');
assertEqual([typedOver.workingDays, typedOver.attendedDays, typedOver.otherTime, typedOver.totalLeaves], [27, 24.5, 5, 2.5], 'Working Days, Attended Days and Total Leaves come from attendance; other time (overtime) is editable (typed 5 used)');
assertEqual([typedOver.extraDays, typedOver.salaryAttendedPlusExtra, typedOver.otherAmount, typedOver.grossSalary], [1, 12750, 1000, 13750], 'Typed extra days and Other Amount used: 500 × (24.5 + 1) = 12,750; + 1,000');
const otEdited = row(run({}, { cycleInputs: { w1: { ...cycleInputs.w1, otherTime: 12 } } }), 'W1');
assertEqual([otEdited.otherTime, otEdited.otherAmount], [12, 1000], 'Editing otherTime to 12h recalculates Other Amount: 12 × (500 ÷ 6) = 1000');
const otNegative = row(run({}, { cycleInputs: { w1: { ...cycleInputs.w1, otherTime: -6 } } }), 'W1');
assertEqual([otNegative.otherTime, otNegative.otherAmount, otNegative.grossSalary], [-6, -375, 11875], 'Negative otherTime -6h uses the plain hourly rate, not the OT divisor: −6 × (500 ÷ 8h) = −375, deducted from gross: 12,250 − 375');
assertEqual(row(run({ otRateMultiplier: 2 }, { cycleInputs: { w1: { ...cycleInputs.w1, otherTime: -6 } } }), 'W1').otherAmount, -375, 'Negative otherTime ignores the OT rate multiplier');
assertEqual([typedOver.memo, typedOver.pf, typedOver.esi, typedOver.professionalTax, typedOver.netPay], [0, 0, 0, 0, 12250], 'Typed deductions used; net = 13,750 − 1,500');

// 5. Settings
console.log('\nTest Suite 5: Salary Settings');
const fullHalf = row(run({ halfDayValue: 1 }), 'W1');
assertEqual([fullHalf.attendedDays, fullHalf.salaryAttendedPlusExtra], [25, 12500], 'Half day counted as a full day');
assertEqual(row(run({ otRateMultiplier: 1 }), 'W1').otherAmount, 833, 'Standard shift overtime formula (8h ÷ 6): 10 × (500 ÷ 6) = 833');
assertEqual(row(run({ otRateMultiplier: 2 }), 'W1').otherAmount, 1667, 'Double-rate overtime');
assertEqual(row(run({ otRateMultiplier: 0 }), 'W1').otherAmount, 0, 'Overtime not paid');
assertEqual(row(run({ workingDaysBasis: 'cycleDays' }), 'W1').workingDays, 31, 'Working days = all days in the cycle');
assertEqual(row(run({ workingDaysBasis: 'fixed26' }), 'W1').workingDays, 26, 'Working days = fixed 26');
assertEqual(row(run(), 'W1').professionalTax, 0, 'Professional tax defaults to 0 when not manually entered');

// Verification of user requested OT shift divisors:
// 1. 8h shift, daily wage 500, 31.83 OT hours -> 500 / 6 * 31.83 = 2653
// 2. 10h shift, daily wage 500, 10 OT hours -> 500 / 7 * 10 = 714
// 3. 12h shift, daily wage 500, 10 OT hours -> 500 / 9 * 10 = 556
const ot8 = calculateSalaries({ cycleKey, cycleStartDay: 22, shifts, workers: [{ id: 'OT8', name: 'OT 8h', department: 'Label', shiftId: 'PLANT_DAY_1' }], presenceSummary: [presence('OT8', 20)], monthlyStats: [{ workerId: 'OT8', month: cycleKey, totalOtMinutes: 1910 }], profiles: { ot8: { dailyWage: 500, shiftHours: 8 } } })[0];
assertEqual(ot8.otherAmount, 2653, '8h shift: 500 ÷ 6 × 31.83h OT = 2653');

const ot10 = calculateSalaries({ cycleKey, cycleStartDay: 22, shifts, workers: [{ id: 'OT10', name: 'OT 10h', department: 'Label', shiftId: 'PLANT_DAY_1' }], presenceSummary: [presence('OT10', 20)], monthlyStats: [{ workerId: 'OT10', month: cycleKey, totalOtMinutes: 600 }], profiles: { ot10: { dailyWage: 500, shiftHours: 10 } } })[0];
assertEqual(ot10.otherAmount, 714, '10h shift: 500 ÷ 7 × 10h OT = 714');

const ot12 = calculateSalaries({ cycleKey, cycleStartDay: 22, shifts, workers: [{ id: 'OT12', name: 'OT 12h', department: 'Label', shiftId: 'PLANT_DAY_1' }], presenceSummary: [presence('OT12', 20)], monthlyStats: [{ workerId: 'OT12', month: cycleKey, totalOtMinutes: 600 }], profiles: { ot12: { dailyWage: 500, shiftHours: 12 } } })[0];
assertEqual(ot12.otherAmount, 556, '12h shift: 500 ÷ 9 × 10h OT = 556');

// 6. Saving typed values: per-worker details carry over, per-cycle values stay in their cycle
console.log('\nTest Suite 6: Saving Typed Values');
// Settings saved earlier with the old 1× overtime default
globalThis.localStorage ??= { getItem: (key) => (key === 'mfg_att_config_v1' ? JSON.stringify({ salary: { otRateMultiplier: 1 } }) : null), setItem() {}, removeItem() {} };
const { store } = await import('../src/data/dataStore.js');
assertEqual(store.salaryConfig.otRateMultiplier, 1.5, 'Saved settings on the old 1× default move to 1.5× overtime');
store.updateSalaryConfig({ otRateMultiplier: 1 });
assertEqual([store.salaryConfig.otRateMultiplier, store.config.salary.otRateConfirmed], [1, true], 'A rate chosen in Salary Settings afterwards is kept');
store.updateSalaryConfig({ otRateMultiplier: 1.5 });
store.salary = { profiles: {}, inputs: {} };
store.setSalaryValue('W1', '2026-09', 'dailyWage', 500);
store.setSalaryValue('W1', '2026-09', 'advance', 1000);
store.setSalaryValue('W1', '2026-10', 'advance', 300);
store.setSalaryValue('W1', '2026-09', 'extraDays', 3);
store.setSalaryValue('W1', '2026-09', 'extraDays', '');
assertEqual(store.salary.profiles.w1.dailyWage, 500, 'daily wage saved for the worker (used in every cycle)');
assertEqual([store.salary.inputs['2026-09'].w1.advance, store.salary.inputs['2026-10'].w1.advance], [1000, 300], 'Advance is per cycle');
assertEqual('extraDays' in store.salary.inputs['2026-09'].w1, false, 'Clearing a typed-over value goes back to the calculated one');

// 7. One-time fill from public/salary-details.json
console.log('\nTest Suite 7: Salary Details File');
store.salary = { profiles: { w1: { salaryType: 'Daily', dailyWage: 500 } }, inputs: {} };
const detailsFile = { version: 'v1', workers: [{ id: 'W1', mcOperation: 'Operator', salaryType: 'Monthly + 2', shiftHours: 9 }, { id: 'w2', salaryType: 'Daily', shiftHours: 8, name: 'not a salary field' }] };
globalThis.fetch = async () => ({ ok: true, json: async () => detailsFile });
assertEqual(await store.applySalaryDetailsFile(), 2, 'File applied: 2 workers filled');
assertEqual(store.salary.profiles.w1, { salaryType: 'Monthly + 2', dailyWage: 500, mcOperation: 'Operator', shiftHours: 9 }, 'Sheet values filled in; the typed daily wage is kept');
assertEqual(store.salary.profiles.w2, { salaryType: 'Daily', shiftHours: 8 }, 'Only salary fields are taken from the file');
store.setSalaryValue('W1', '2026-09', 'shiftHours', 10);
assertEqual(await store.applySalaryDetailsFile(), 0, 'Same version is not applied again');
assertEqual(store.salary.profiles.w1.shiftHours, 10, 'A value typed after the fill is kept');
globalThis.fetch = async () => ({ ok: false });
assertEqual(await store.applySalaryDetailsFile(), 0, 'No file -> nothing changes');

console.log('\n🎉 ALL SALARY TESTS PASSED! 🎉\n');
