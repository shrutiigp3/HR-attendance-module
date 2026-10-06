/**
 * Automated Verification Suite for Attendance & Overtime Calculation Engine
 * Directly tests and validates all 10 Main Requirements from the prompt specification.
 */

import { AttendanceCalculationEngine } from '../src/engine/calculationEngine.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    console.error(`❌ FAILED: ${message} (Expected: ${expected}, Got: ${actual})`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message} [${actual}]`);
  }
}

console.log('--- STARTING ENGINE TESTS ---\n');

const engine = new AttendanceCalculationEngine({
  gracePeriodMinutes: 15,
  monthlyLateOccurrencesAllowed: 2,
  memoAmount: 100,
  halfDayThresholdHours: 4,
  otThresholdMinutes: 15
});

const shifts = [
  { id: 'OFFICE', name: 'Office', startTime: '09:00', endTime: '18:00', isOvernight: false, weeklyOff: 'Sunday', isActive: true, payOvertime: false },
  { id: 'PLANT_DAY_1', name: 'Plant Day 1', startTime: '08:30', endTime: '17:00', isOvernight: false, weeklyOff: 'Thursday', isActive: true },
  { id: 'PLANT_DAY_2', name: 'Plant Day 2', startTime: '09:00', endTime: '18:00', isOvernight: false, weeklyOff: 'Sunday', isActive: true },
  { id: 'PLANT_NIGHT', name: 'Plant Night', startTime: '20:30', endTime: '08:30', isOvernight: true, weeklyOff: 'Thursday', isActive: true }
];

// Test 1: Prompt Section 5 - Late Arrival & Grace Rule sequence
console.log('Test Suite 1: Late Arrival, Grace, and Monthly Memo Progression (Exact Prompt Table)');
const workerRahul = [{ id: 'W101', name: 'Rahul Sharma', department: 'Office', shiftId: 'OFFICE', isActive: true }];

const punchesRahul = [
  // Day 1: 09:10 -> Grace - no memo
  { workerId: 'W101', date: '2026-09-01', time: '09:10', type: 'IN' },
  { workerId: 'W101', date: '2026-09-01', time: '18:00', type: 'OUT' },

  // Day 2: 09:15 -> Grace - no memo
  { workerId: 'W101', date: '2026-09-02', time: '09:15', type: 'IN' },
  { workerId: 'W101', date: '2026-09-02', time: '18:00', type: 'OUT' },

  // Day 3: 09:20 -> Late occurrence #1 - no memo
  { workerId: 'W101', date: '2026-09-03', time: '09:20', type: 'IN' },
  { workerId: 'W101', date: '2026-09-03', time: '18:00', type: 'OUT' },

  // Day 4: 09:30 -> Late occurrence #2 - no memo
  { workerId: 'W101', date: '2026-09-04', time: '09:30', type: 'IN' },
  { workerId: 'W101', date: '2026-09-04', time: '18:00', type: 'OUT' },

  // Day 5: 09:25 -> Late occurrence #3 - ₹100 memo
  { workerId: 'W101', date: '2026-09-05', time: '09:25', type: 'IN' },
  { workerId: 'W101', date: '2026-09-05', time: '18:00', type: 'OUT' },

  // Day 6: 09:40 -> Late occurrence #4 - ₹100 memo
  { workerId: 'W101', date: '2026-09-06', time: '09:40', type: 'IN' },
  { workerId: 'W101', date: '2026-09-06', time: '18:00', type: 'OUT' },

  // Day 7 (Next Month): 2026-10-01 at 09:25 -> Should reset counter, occurrence #1 in Oct, NO MEMO!
  { workerId: 'W101', date: '2026-10-01', time: '09:25', type: 'IN' },
  { workerId: 'W101', date: '2026-10-01', time: '18:00', type: 'OUT' },
];

const result1 = engine.processAttendance(workerRahul, shifts, punchesRahul);

// Verification of Day 1 (09:10): Grace - no memo
const d1 = result1.records.find(r => r.date === '2026-09-01');
assertEqual(d1.lateMinutes, 10, 'Day 1 late minutes = 10');
assertEqual(d1.isGrace, true, 'Day 1 is within grace');
assertEqual(d1.isLateOccurrence, false, 'Day 1 does not count as late occurrence');
assertEqual(d1.memoCount, 0, 'Day 1 memo count = 0');
assertEqual(d1.memoAmount, 0, 'Day 1 memo amount = 0');

// Verification of Day 2 (09:15): Grace - no memo
const d2 = result1.records.find(r => r.date === '2026-09-02');
assertEqual(d2.lateMinutes, 15, 'Day 2 late minutes = 15');
assertEqual(d2.isGrace, true, 'Day 2 is within grace');
assertEqual(d2.isLateOccurrence, false, 'Day 2 does not count as late occurrence');
assertEqual(d2.memoCount, 0, 'Day 2 memo count = 0');

// Verification of Day 3 (09:20): Late occurrence #1 - no memo
const d3 = result1.records.find(r => r.date === '2026-09-03');
assertEqual(d3.lateMinutes, 20, 'Day 3 late minutes = 20');
assertEqual(d3.isGrace, false, 'Day 3 beyond grace');
assertEqual(d3.isLateOccurrence, true, 'Day 3 is late occurrence');
assertEqual(d3.lateOccurrenceIndex, 1, 'Day 3 is occurrence #1');
assertEqual(d3.memoCount, 0, 'Day 3 memo count = 0 (1st allowed)');
assertEqual(d3.memoAmount, 0, 'Day 3 memo amount = 0');

// Verification of Day 4 (09:30): Late occurrence #2 - no memo
const d4 = result1.records.find(r => r.date === '2026-09-04');
assertEqual(d4.lateOccurrenceIndex, 2, 'Day 4 is occurrence #2');
assertEqual(d4.memoCount, 0, 'Day 4 memo count = 0 (2nd allowed)');
assertEqual(d4.memoAmount, 0, 'Day 4 memo amount = 0');

// Verification of Day 5 (09:25): Late occurrence #3 - ₹100 memo
const d5 = result1.records.find(r => r.date === '2026-09-05');
assertEqual(d5.lateOccurrenceIndex, 3, 'Day 5 is occurrence #3');
assertEqual(d5.memoCount, 1, 'Day 5 memo count = 1');
assertEqual(d5.memoAmount, 100, 'Day 5 memo amount = ₹100');

// Verification of Day 6 (09:40): Late occurrence #4 - ₹100 memo
const d6 = result1.records.find(r => r.date === '2026-09-06');
assertEqual(d6.lateOccurrenceIndex, 4, 'Day 6 is occurrence #4');
assertEqual(d6.memoCount, 1, 'Day 6 memo count = 1');
assertEqual(d6.memoAmount, 100, 'Day 6 memo amount = ₹100');

// Verification of Monthly Reset in Next Month (2026-10-01)
const dOct = result1.records.find(r => r.date === '2026-10-01');
assertEqual(dOct.lateOccurrenceIndex, 1, 'Oct 1 resets to occurrence #1 in new month');
assertEqual(dOct.memoAmount, 0, 'Oct 1 has ₹0 memo because new month quota resets');

// Verify Monthly Stats for September
const septStats = result1.monthlyStats.find(s => s.month === '2026-09');
assertEqual(septStats.graceArrivalsCount, 2, 'September Grace Arrivals = 2');
assertEqual(septStats.lateOccurrencesCount, 4, 'September Late Occurrences = 4');
assertEqual(septStats.allowedLateOccurrences, 2, 'September Allowed Late = 2');
assertEqual(septStats.lateOccurrencesUsed, 2, 'September Late Used = 2');
assertEqual(septStats.remainingLateAllowance, 0, 'September Remaining Allowance = 0');
assertEqual(septStats.memoCount, 2, 'September Memo Count = 2');
assertEqual(septStats.totalMemoAmount, 200, 'September Total Memo Amount = ₹200');


// Test 2: Prompt Section 6 - Half-Day Rule (Shift Start + 4 Hours)
console.log('\nTest Suite 2: Half-Day Rule Calculation (Dynamic Shift Start + 4h)');
const workerHalfDay = [
  { id: 'W201', name: 'Priya Patel', department: 'Production', shiftId: 'OFFICE', isActive: true },
  { id: 'W202', name: 'Amit Kumar', department: 'Plant', shiftId: 'PLANT_DAY_1', isActive: true }
];

const punchesHalfDay = [
  // Office Shift: 09:00 start, Threshold = 13:00. Arrive at 12:55 -> Full Day
  { workerId: 'W201', date: '2026-09-10', time: '12:55', type: 'IN' },
  { workerId: 'W201', date: '2026-09-10', time: '18:00', type: 'OUT' },

  // Office Shift: Arrive at 13:05 -> Half Day
  { workerId: 'W201', date: '2026-09-11', time: '13:05', type: 'IN' },
  { workerId: 'W201', date: '2026-09-11', time: '18:00', type: 'OUT' },

  // Plant Day Shift: 08:30 start, Threshold = 12:30. Arrive at 12:35 -> Half Day
  { workerId: 'W202', date: '2026-09-10', time: '12:35', type: 'IN' },
  { workerId: 'W202', date: '2026-09-10', time: '17:00', type: 'OUT' },
];

const result2 = engine.processAttendance(workerHalfDay, shifts, punchesHalfDay);
const priyaFull = result2.records.find(r => r.workerId === 'W201' && r.date === '2026-09-10');
assertEqual(priyaFull.isHalfDay, false, 'Priya arriving at 12:55 (before 13:00) is Full Day');

const priyaHalf = result2.records.find(r => r.workerId === 'W201' && r.date === '2026-09-11');
assertEqual(priyaHalf.isHalfDay, true, 'Priya arriving at 13:05 (after 13:00) is Half Day');

const amitHalf = result2.records.find(r => r.workerId === 'W202' && r.date === '2026-09-10');
assertEqual(amitHalf.isHalfDay, true, 'Amit arriving at 12:35 (after 12:30 for 08:30 shift) is Half Day');


// Test 3: Prompt Section 7 - Overtime Rule & Early Arrival Rule
console.log('\nTest Suite 3: Overtime Calculations & Early Arrival (Exact Prompt Table)');
const workerOT = [
  { id: 'W301', name: 'Vikram Singh', department: 'Production', shiftId: 'PLANT_DAY_2', isActive: true },
  { id: 'W302', name: 'Office Staff', department: 'HR', shiftId: 'OFFICE', isActive: true }
];

const punchesOT = [
  // Early arrival IN 08:30, OUT 18:00 -> Early arrival NEVER OT!
  { workerId: 'W301', date: '2026-09-01', time: '08:30', type: 'IN' },
  { workerId: 'W301', date: '2026-09-01', time: '18:00', type: 'OUT' },

  // Early arrival IN 08:50, OUT 18:10 -> 0 OT (10m <= 15m threshold)
  { workerId: 'W301', date: '2026-09-02', time: '08:50', type: 'IN' },
  { workerId: 'W301', date: '2026-09-02', time: '18:10', type: 'OUT' },

  // OUT 18:12 -> 0 OT (12m <= 15m threshold)
  { workerId: 'W301', date: '2026-09-03', time: '09:00', type: 'IN' },
  { workerId: 'W301', date: '2026-09-03', time: '18:12', type: 'OUT' },

  // OUT 18:15 -> 0 OT (Exact at 15m threshold)
  { workerId: 'W301', date: '2026-09-04', time: '09:00', type: 'IN' },
  { workerId: 'W301', date: '2026-09-04', time: '18:15', type: 'OUT' },

  // OUT 18:16 -> 16 minutes OT (excess > 15m -> full 16m counted)
  { workerId: 'W301', date: '2026-09-05', time: '09:00', type: 'IN' },
  { workerId: 'W301', date: '2026-09-05', time: '18:16', type: 'OUT' },

  // OUT 18:30 -> 30 minutes OT (excess > 15m -> full 30m counted)
  { workerId: 'W301', date: '2026-09-06', time: '09:00', type: 'IN' },
  { workerId: 'W301', date: '2026-09-06', time: '18:30', type: 'OUT' },

  // OUT 18:42 -> 42 minutes OT (8h shift, worked 8h 42m -> full 42m counted)
  { workerId: 'W301', date: '2026-09-07', time: '09:00', type: 'IN' },
  { workerId: 'W301', date: '2026-09-07', time: '18:42', type: 'OUT' },

  // OUT 19:00 -> 60 minutes OT (excess > 15m -> full 60m counted)
  { workerId: 'W301', date: '2026-09-08', time: '09:00', type: 'IN' },
  { workerId: 'W301', date: '2026-09-08', time: '19:00', type: 'OUT' },

  // Office Shift: OUT 18:42 -> 0 OT (No overtime consideration for office shift)
  { workerId: 'W302', date: '2026-09-07', time: '09:00', type: 'IN' },
  { workerId: 'W302', date: '2026-09-07', time: '18:42', type: 'OUT' },

  // Office Shift: OUT 19:00 -> 0 OT (No overtime consideration for office shift)
  { workerId: 'W302', date: '2026-09-08', time: '09:00', type: 'IN' },
  { workerId: 'W302', date: '2026-09-08', time: '19:00', type: 'OUT' },
];

const result3 = engine.processAttendance(workerOT, shifts, punchesOT);

const otDay1 = result3.records.find(r => r.workerId === 'W301' && r.date === '2026-09-01');
assertEqual(otDay1.otMinutes, 0, 'IN 08:30, OUT 18:00 has 0 OT (Early arrival is NEVER OT)');

const otDay2 = result3.records.find(r => r.workerId === 'W301' && r.date === '2026-09-02');
assertEqual(otDay2.otMinutes, 0, 'OUT 18:10 has 0 OT (10m <= 15m threshold)');

const otDay3 = result3.records.find(r => r.workerId === 'W301' && r.date === '2026-09-03');
assertEqual(otDay3.otMinutes, 0, 'OUT 18:12 has 0 OT (12m <= 15m threshold)');

const otDay4 = result3.records.find(r => r.workerId === 'W301' && r.date === '2026-09-04');
assertEqual(otDay4.otMinutes, 0, 'OUT 18:15 has 0 OT (exact 15m threshold)');

const otDay5 = result3.records.find(r => r.workerId === 'W301' && r.date === '2026-09-05');
assertEqual(otDay5.otMinutes, 16, 'OUT 18:16 has 16 minutes OT (full excess when > 15m threshold)');

const otDay6 = result3.records.find(r => r.workerId === 'W301' && r.date === '2026-09-06');
assertEqual(otDay6.otMinutes, 30, 'OUT 18:30 has 30 minutes OT (full excess when > 15m threshold)');

const otDay7 = result3.records.find(r => r.workerId === 'W301' && r.date === '2026-09-07');
assertEqual(otDay7.otMinutes, 42, 'OUT 18:42 has 42 minutes OT (full excess when > 15m threshold)');

const otDay8 = result3.records.find(r => r.workerId === 'W301' && r.date === '2026-09-08');
assertEqual(otDay8.otMinutes, 60, 'OUT 19:00 has 60 minutes OT (full excess when > 15m threshold)');

const officeRec1 = result3.records.find(r => r.workerId === 'W302' && r.date === '2026-09-07');
assertEqual(officeRec1.otMinutes, 0, 'Office shift OUT 18:42 has 0 OT (no overtime consideration for office shift)');

const officeRec2 = result3.records.find(r => r.workerId === 'W302' && r.date === '2026-09-08');
assertEqual(officeRec2.otMinutes, 0, 'Office shift OUT 19:00 has 0 OT (no overtime consideration for office shift)');


// Test 4: Prompt Section 8 - Overnight Shift Logic (Plant Night 20:30–08:30)
console.log('\nTest Suite 4: Overnight Shift Logic (Exact Prompt Example)');
const workerNight = [{ id: 'W401', name: 'Suresh Raina', department: 'Plant Night', shiftId: 'PLANT_NIGHT', isActive: true }];

const punchesNight = [
  // Prompt Example:
  // Plant Night: 20:30–08:30
  // Worker: IN = 20:20, Sept 15; OUT = 09:30, Sept 16
  // Associate with September 15 shift.
  // Early arrival before 20:30 is NOT OT.
  // OT begins 08:30 + 15m = 08:45.
  // OUT 09:30 -> 45 minutes OT.
  { workerId: 'W401', date: '2026-09-15', time: '20:20', type: 'IN' },
  { workerId: 'W401', date: '2026-09-16', time: '09:30', type: 'OUT' },
];

const result4 = engine.processAttendance(workerNight, shifts, punchesNight);
assertEqual(result4.records.length, 1, 'Overnight punches resolved to single shift record');

const nightRec = result4.records[0];
assertEqual(nightRec.date, '2026-09-15', 'Record is associated with September 15 shift');
assertEqual(nightRec.actualIn, '20:20', 'Actual IN is 20:20');
assertEqual(nightRec.actualOut, '09:30', 'Actual OUT is 09:30');
assertEqual(nightRec.otMinutes, 60, 'OUT 09:30 for 08:30 shift end (60m excess > 15m threshold) has exactly 60 minutes OT');
assertEqual(nightRec.scheduledMinutes, 720, 'Plant Night scheduled minutes = 720 (12 hours)');
assertEqual(nightRec.actualWorkingMinutes, 790, 'Actual presence = 13h 10m (790 minutes)');


// Test 5: Face-device exports record no IN/OUT (type AUTO): first scan = IN, last = OUT
console.log('\nTest Suite 5: Direction-less Device Scans (AUTO)');
const workerFace = [
  { id: 'W501', name: 'Day Worker', department: 'Label', shiftId: 'OFFICE', isActive: true },
  { id: 'W502', name: 'Night Worker', department: 'Pouch', shiftId: 'PLANT_NIGHT', isActive: true }
];

const punchesFace = [
  // Day shift with a double tap on arrival and a mid-day scan
  { workerId: 'W501', date: '2026-09-01', time: '09:05:10', type: 'AUTO' },
  { workerId: 'W501', date: '2026-09-01', time: '09:06:02', type: 'AUTO' },
  { workerId: 'W501', date: '2026-09-01', time: '13:30:00', type: 'AUTO' },
  { workerId: 'W501', date: '2026-09-01', time: '18:40:00', type: 'AUTO' },
  // Two consecutive night shifts: the 08:45 morning scans must close the previous night
  { workerId: 'W502', date: '2026-09-15', time: '20:25', type: 'AUTO' },
  { workerId: 'W502', date: '2026-09-16', time: '08:45', type: 'AUTO' },
  { workerId: 'W502', date: '2026-09-16', time: '20:28', type: 'AUTO' },
  { workerId: 'W502', date: '2026-09-17', time: '09:30', type: 'AUTO' }
];

const result5 = engine.processAttendance(workerFace, shifts, punchesFace);
const faceDay = result5.records.find(r => r.workerId === 'W501');
assertEqual(faceDay.actualIn, '09:05', 'First device scan of the day is IN');
assertEqual(faceDay.actualOut, '18:40', 'Last device scan of the day is OUT');
assertEqual(faceDay.otMinutes, 0, 'W501 on Office shift has 0 OT');
assert(!faceDay.hasMissingPunch, 'No missing punch flagged when scans exist at both ends');

const faceNights = result5.records.filter(r => r.workerId === 'W502');
assertEqual(faceNights.length, 2, 'Two night shifts resolved from four device scans');
assertEqual(`${faceNights[0].date} ${faceNights[0].actualIn}-${faceNights[0].actualOut}`, '2026-09-15 20:25-08:45', 'Night 1 pairs 20:25 with next-morning 08:45');
assertEqual(`${faceNights[1].date} ${faceNights[1].actualIn}-${faceNights[1].actualOut}`, '2026-09-16 20:28-09:30', 'Night 2 is not polluted by the 08:45 scan');
assertEqual(faceNights[1].otMinutes, 60, 'Night 2 OUT 09:30 (60m excess > 15m threshold) has 60 minutes OT');


// Test 6: A worker's own weekly off (from a roster import) overrides the shift's
console.log('\nTest Suite 6: Per-Worker Weekly Off');
const workersOff = [
  { id: 'W601', name: 'Thursday Off', department: 'IT', shiftId: 'OFFICE', weeklyOff: 'Thursday', isActive: true },
  { id: 'W602', name: 'Shift Default', department: 'IT', shiftId: 'OFFICE', isActive: true }
];
// 2026-09-03 is a Thursday, 2026-09-06 a Sunday
const punchesOff = ['W601', 'W602'].flatMap(workerId => ['2026-09-03', '2026-09-06'].flatMap(date => [
  { workerId, date, time: '09:00', type: 'IN' },
  { workerId, date, time: '18:00', type: 'OUT' }
]));
const result6 = engine.processAttendance(workersOff, shifts, punchesOff);
const offOf = (workerId, date) => result6.records.find(r => r.workerId === workerId && r.date === date).isWeeklyOff;
assertEqual(offOf('W601', '2026-09-03'), true, 'Worker weekly off Thursday: Thursday is weekly off');
assertEqual(offOf('W601', '2026-09-06'), false, 'Worker weekly off Thursday: Sunday is a working day');
assertEqual(offOf('W602', '2026-09-06'), true, 'No worker override: shift weekly off (Sunday) applies');


// Test 7: A half day is its own penalty: no memo, and it doesn't use up the monthly late allowance
console.log('\nTest Suite 7: Half Day Never Draws a Memo');
const workerHalfMemo = [{ id: 'W701', name: 'Half Day Memo', department: 'Office', shiftId: 'OFFICE', isActive: true }];
const punchesHalfMemo = [
  ['2026-09-01', '09:30'], // late #1 (allowed)
  ['2026-09-02', '09:30'], // late #2 (allowed)
  ['2026-09-03', '13:30'], // half day: allowance used up, but still no memo
  ['2026-09-04', '09:30']  // late #3 -> memo (the half day didn't count as a late occurrence)
].flatMap(([date, inTime]) => [
  { workerId: 'W701', date, time: inTime, type: 'IN' },
  { workerId: 'W701', date, time: '18:00', type: 'OUT' }
]);
const result7 = engine.processAttendance(workerHalfMemo, shifts, punchesHalfMemo);
const halfRec = result7.records.find(r => r.date === '2026-09-03');
assertEqual(halfRec.isHalfDay, true, 'IN 13:30 on Office shift is a Half Day');
assertEqual(halfRec.memoAmount, 0, 'Half Day after the allowance is used up still has ₹0 memo');
assertEqual(halfRec.isLateOccurrence, false, 'Half Day is not counted as a late occurrence');
assertEqual(halfRec.memoStatus, 'Half Day - No Memo', 'Memo status explains why there is no memo');
assertEqual(halfRec.flags.some(f => f.includes('Memo')), false, 'No memo flag on the Half Day');
const lateAfterHalf = result7.records.find(r => r.date === '2026-09-04');
assertEqual(lateAfterHalf.lateOccurrenceIndex, 3, 'Next ordinary late is occurrence #3 (half day skipped)');
assertEqual(lateAfterHalf.memoAmount, 100, 'Occurrence #3 gets the ₹100 memo');
const septHalfStats = result7.monthlyStats.find(s => s.month === '2026-09');
assertEqual(septHalfStats.memoCount, 1, 'Month has 1 memo (not 2)');
assertEqual(septHalfStats.halfDayCount, 1, 'Month has 1 half day');


// Test 8: Salary cycle runs 22nd–21st: late counters reset on the 22nd, not the 1st
console.log('\nTest Suite 8: Salary Cycle 22nd–21st');
const workerCycle = [
  { id: 'W801', name: 'Cycle Day', department: 'Office', shiftId: 'OFFICE', isActive: true },
  { id: 'W802', name: 'Cycle Night', department: 'Plant', shiftId: 'PLANT_NIGHT', isActive: true }
];
const lateDay = (date) => [
  { workerId: 'W801', date, time: '09:30', type: 'IN' },
  { workerId: 'W801', date, time: '18:00', type: 'OUT' }
];
const punchesCycle = [
  ...lateDay('2026-08-21'), // last day of the Aug cycle (22 Jul – 21 Aug)
  ...lateDay('2026-08-22'), // first day of the Sep cycle: late #1
  ...lateDay('2026-08-31'), // late #2 (still Sep cycle, across the calendar month end)
  ...lateDay('2026-09-01'), // late #3 -> memo (calendar months would have reset here)
  ...lateDay('2026-09-21'), // late #4 -> memo, last day of the Sep cycle
  ...lateDay('2026-09-22'), // new Oct cycle: late #1, no memo
  // Night shift starting on the 21st belongs to the cycle ending that day, even though OUT is on the 22nd
  { workerId: 'W802', date: '2026-09-21', time: '20:30', type: 'IN' },
  { workerId: 'W802', date: '2026-09-22', time: '08:30', type: 'OUT' }
];
const result8 = engine.processAttendance(workerCycle, shifts, punchesCycle);
const cyc = (date) => result8.records.find(r => r.workerId === 'W801' && r.date === date);

assertEqual(cyc('2026-08-21').month, '2026-08', '21 Aug is in the Aug cycle');
assertEqual(cyc('2026-08-22').month, '2026-09', '22 Aug starts the Sep cycle');
assertEqual(cyc('2026-08-22').cycleLabel, 'Sep 2026 (22 Aug – 21 Sep)', 'Cycle label shows its date range');
assertEqual(cyc('2026-08-22').lateOccurrenceIndex, 1, '22 Aug: counter reset, late #1');
assertEqual(cyc('2026-09-01').lateOccurrenceIndex, 3, '1 Sep: no reset on the 1st, late #3');
assertEqual(cyc('2026-09-01').memoAmount, 100, '1 Sep: late #3 in the cycle gets the memo');
assertEqual(cyc('2026-09-21').memoAmount, 100, '21 Sep: still the Sep cycle, memo');
assertEqual(cyc('2026-09-22').lateOccurrenceIndex, 1, '22 Sep: new cycle, late #1');
assertEqual(cyc('2026-09-22').memoAmount, 0, '22 Sep: no memo in the new cycle');
const nightCycle = result8.records.find(r => r.workerId === 'W802');
assertEqual(nightCycle.month, '2026-09', 'Night shift starting 21 Sep counts in the Sep cycle');

const sepCycleStats = result8.monthlyStats.find(s => s.workerId === 'W801' && s.month === '2026-09');
assertEqual(`${sepCycleStats.cycleFrom} to ${sepCycleStats.cycleTo}`, '2026-08-22 to 2026-09-21', 'Cycle stats carry the from/to dates');
assertEqual(sepCycleStats.memoCount, 2, 'Sep cycle has 2 memos');

// Test 9: Punch IDs match workers regardless of capitals ("GP3.906" punches -> worker "Gp3.906")
console.log('\nTest Suite 9: Worker ID Capitals');
const result9 = engine.processAttendance(
  [{ id: 'Gp3.906', name: 'Test Worker', department: 'Corrugation', shiftId: 'OFFICE', isActive: true }],
  shifts,
  [
    { workerId: 'GP3.906', date: '2026-09-01', time: '09:00', type: 'IN' },
    { workerId: 'gp3.906', date: '2026-09-01', time: '18:00', type: 'OUT' }
  ]
);
assertEqual(result9.records.length, 1, 'Punches with different capitals form one record');
assertEqual(`${result9.records[0].workerId} ${result9.records[0].actualIn}-${result9.records[0].actualOut}`, 'Gp3.906 09:00-18:00', 'Record uses the worker master ID and pairs both punches');

// Test 10: Flexible shift: no fixed timings, only required working hours, any time in 24h
console.log('\nTest Suite 10: Flexible Shift (Any Time, Required Hours)');
const flexShifts = [...shifts, { id: 'FLEX_8', name: 'Flexible 8h', isFlexible: true, workingHours: 8, startTime: '', endTime: '', weeklyOff: 'None', isActive: true }];
const flexWorkers = [
  { id: 'F1', name: 'Day Flex', department: 'Pouch', shiftId: 'FLEX_8', isActive: true },
  { id: 'F2', name: 'Night Flex', department: 'Pouch', shiftId: 'FLEX_8', isActive: true },
  { id: 'F3', name: 'Duty 12h', department: 'Pouch', shiftId: 'FLEX_8', dutyHours: 12, weeklyOff: 'Thursday', isActive: true }
];
const scan = (workerId, date, time) => ({ workerId, date, time, type: 'AUTO' });
const flexPunches = [
  // F1: came late morning, 8h 45m with a lunch scan -> 30m OT, no late/memo
  scan('F1', '2026-09-01', '11:30'), scan('F1', '2026-09-01', '14:00'), scan('F1', '2026-09-01', '20:15'),
  // F1: 3h worked -> half day (less than half of 8h)
  scan('F1', '2026-09-02', '10:00'), scan('F1', '2026-09-02', '13:00'),
  // F1: 6h worked -> short by 2h, not a half day
  scan('F1', '2026-09-03', '07:00'), scan('F1', '2026-09-03', '13:00'),
  // F2: night duties crossing midnight, two nights in a row
  scan('F2', '2026-09-01', '22:00'), scan('F2', '2026-09-02', '06:00'),
  scan('F2', '2026-09-02', '21:30'), scan('F2', '2026-09-03', '07:00'),
  // F3: own duty hours (12h) override the shift's 8h; 12h 20m -> 5m OT; Thursday is weekly off
  scan('F3', '2026-09-03', '08:00'), scan('F3', '2026-09-03', '20:20'),
  // F3: forgot to scan out, next scan is the next duty
  scan('F3', '2026-09-04', '08:00'), scan('F3', '2026-09-05', '08:05'), scan('F3', '2026-09-05', '20:00')
];
const result10 = engine.processAttendance(flexWorkers, flexShifts, flexPunches);
const flex = (id, date) => result10.records.find(r => r.workerId === id && r.date === date);

const f1a = flex('F1', '2026-09-01');
assertEqual(`${f1a.actualIn}-${f1a.actualOut} ${f1a.actualWorkingHoursFormatted}`, '11:30-20:15 8h 45m', 'Any arrival time: worked = first to last scan');
assertEqual(f1a.lateMinutes + f1a.memoAmount, 0, 'No late minutes and no memo on a flexible shift');
assertEqual(f1a.otMinutes, 45, '8h 45m on an 8h duty (45m excess > 15m threshold) = 45m OT');
assertEqual(flex('F1', '2026-09-02').isHalfDay, true, '3h of 8h is a Half Day');
assertEqual(flex('F1', '2026-09-02').memoAmount, 0, 'Flexible half day has no memo');
const f1c = flex('F1', '2026-09-03');
assertEqual(`${f1c.isHalfDay} ${f1c.earlyDepartureMinutes}`, 'false 120', '6h of 8h: not a half day, short by 120m');

const nights = result10.records.filter(r => r.workerId === 'F2');
assertEqual(nights.length, 2, 'Two night duties -> two records (not four half-records)');
assertEqual(`${nights[0].date} ${nights[0].actualIn}-${nights[0].actualOut} ${nights[0].actualWorkingHoursFormatted}`, '2026-09-01 22:00-06:00 8h', 'Night duty crossing midnight is one 8h record');
assertEqual(`${nights[1].date} ${nights[1].actualWorkingHoursFormatted} OT ${nights[1].otMinutes}`, '2026-09-02 9h 30m OT 90', 'Second night: 9h 30m -> 90m OT');

const f3a = flex('F3', '2026-09-03');
assertEqual(`${f3a.scheduledMinutes} ${f3a.otMinutes} ${f3a.requiredHoursSource}`, '720 20 worker', 'Worker Duty Hrs (12h) override the shift hours: 12h 20m -> 20m OT');
assertEqual(f3a.isWeeklyOff, true, 'Worker weekly off (Thursday) applies to flexible duties');
assertEqual(flex('F3', '2026-09-04').hasMissingPunch, true, 'Single scan: flagged Missing OUT');
assertEqual(flex('F3', '2026-09-05').actualWorkingHoursFormatted, '11h 55m', 'Next duty starts fresh after a missing OUT');

// Verification of user requested scenarios:
// 8h shift: 8h 12m worked (excess 12m <= 15m) -> 0 OT
// 8h shift: 8h 42m worked (excess 42m > 15m) -> 42m OT
// 8h shift: 9h 40m worked (excess 100m > 15m) -> 1h 40m (100m) OT
const userTestWorkers = [{ id: 'U1', name: 'User Test Worker', department: 'Production', shiftId: 'FLEX_8', isActive: true }];
const userTestPunches = [
  scan('U1', '2026-09-10', '08:21'), scan('U1', '2026-09-10', '17:03'), // 8h 42m worked -> 42m OT
  scan('U1', '2026-09-11', '08:26'), scan('U1', '2026-09-11', '18:06'), // 9h 40m worked -> 100m (1h 40m) OT
  scan('U1', '2026-09-12', '08:00'), scan('U1', '2026-09-12', '16:12')  // 8h 12m worked -> 0m OT
];
const userTestResult = engine.processAttendance(userTestWorkers, flexShifts, userTestPunches);
const u10 = userTestResult.records.find(r => r.date === '2026-09-10');
assertEqual(u10.actualWorkingHoursFormatted, '8h 42m', '08:21 to 17:03 presence = 8h 42m');
assertEqual(u10.otMinutes, 42, '8h shift with 8h 42m worked (excess > 15m) gives exactly 42m OT');

const u11 = userTestResult.records.find(r => r.date === '2026-09-11');
assertEqual(u11.actualWorkingHoursFormatted, '9h 40m', '08:26 to 18:06 presence = 9h 40m');
assertEqual(u11.otMinutes, 100, '8h shift with 9h 40m worked (excess > 15m) gives exactly 1h 40m (100m) OT');

const u12 = userTestResult.records.find(r => r.date === '2026-09-12');
assertEqual(u12.actualWorkingHoursFormatted, '8h 12m', '08:00 to 16:12 presence = 8h 12m');
assertEqual(u12.otMinutes, 0, '8h shift with 8h 12m worked (excess 12m <= 15m) gives 0 OT');

// Real pattern (18–19 Aug): a late 23:31 scan, 3h after the 20:20 scan, is that day's OUT;
// the next morning is still its own duty
const lateExit = engine.processAttendance([{ id: 'S1', name: 'Late Exit', department: 'Label', shiftId: 'FLEX_8', isActive: true }], flexShifts, [
  ...['08:25', '12:32', '12:59', '18:04', '18:08', '19:31', '20:20', '23:31'].map(t => scan('S1', '2026-08-18', t)),
  ...['08:25', '12:31', '13:00', '18:03', '18:06', '20:29'].map(t => scan('S1', '2026-08-19', t))
]).records.map(r => `${r.date} ${r.actualIn}-${r.actualOut}`);
assertEqual(lateExit.join(' | '), '2026-08-18 08:25-23:31 | 2026-08-19 08:25-20:29', 'Late scan the same night is the OUT (one entry for 18 Aug)');

// Real pattern (15–16 Sep): late 23:29 exit, then a short 08:14–11:59 morning the next day
const lateExitShort = engine.processAttendance([{ id: 'S2', name: 'Late Exit Short', department: 'Label', shiftId: 'FLEX_8', isActive: true }], flexShifts, [
  ...['08:25', '12:32', '13:01', '17:59', '18:04', '19:17', '20:16', '23:29'].map(t => scan('S2', '2026-09-15', t)),
  ...['08:14', '09:52', '10:00', '11:59'].map(t => scan('S2', '2026-09-16', t))
]);
assertEqual(lateExitShort.records.map(r => `${r.date} ${r.actualIn}-${r.actualOut} ${r.actualWorkingHoursFormatted}`).join(' | '),
  '2026-09-15 08:25-23:29 15h 04m | 2026-09-16 08:14-11:59 3h 45m', '15 Sep is one entry ending 23:29; 16 Sep stays separate');
assertEqual(lateExitShort.presenceSummary[0].daysPresent, 2, 'Both 15 and 16 Sep count as days present');

// Real pattern (16–21 Sep): a day duty, then night duties with no scans overnight (arrive ~20:25,
// next scans ~06:00–09:00). Each night must be one duty, not an arrival + a short morning piece.
const nightRun = engine.processAttendance([{ id: 'N1', name: 'Night Run', department: 'Label', shiftId: 'FLEX_8', isActive: true }], flexShifts, [
  ...['08:29', '12:32', '13:03', '20:07'].map(t => scan('N1', '2026-09-16', t)),
  scan('N1', '2026-09-18', '20:23'),
  ...['06:56', '07:07', '09:03', '20:24'].map(t => scan('N1', '2026-09-19', t)),
  ...['06:06', '06:24', '09:11', '20:30'].map(t => scan('N1', '2026-09-20', t)),
  ...['08:33', '08:40', '08:56'].map(t => scan('N1', '2026-09-21', t))
]);
assertEqual(nightRun.records.map(r => `${r.date} ${r.actualIn}-${r.actualOut} ${r.actualWorkingHoursFormatted}`).join(' | '),
  '2026-09-16 08:29-20:07 11h 38m | 2026-09-18 20:23-09:03 12h 40m | 2026-09-19 20:24-09:11 12h 47m | 2026-09-20 20:30-08:56 12h 26m',
  'Night duties without overnight scans stay whole (no false half day / missing OUT)');
assertEqual(nightRun.records.some(r => r.isHalfDay || r.hasMissingPunch), false, 'No false half days or missing punches in the night run');
assertEqual(nightRun.presenceSummary[0].daysPresent, 4, 'Days present = 4 (16, 18, 19, 20 Sep), not 5');

// Real pattern (30 Aug – 1 Sep): night worker who usually scans only at a midnight break and on leaving;
// a duty starting after midnight is dated to the evening it began, so no date gets two entries
const midnightNights = engine.processAttendance([{ id: 'M1', name: 'Midnight Scanner', department: 'Pouch', shiftId: 'FLEX_8', isActive: true }], flexShifts, [
  scan('M1', '2026-08-30', '00:41'), scan('M1', '2026-08-30', '08:09'),
  scan('M1', '2026-08-31', '00:42'), scan('M1', '2026-08-31', '08:41'), scan('M1', '2026-08-31', '20:09'),
  scan('M1', '2026-09-01', '00:20'), scan('M1', '2026-09-01', '08:35')
]);
assertEqual(midnightNights.records.map(r => `${r.date} ${r.actualIn}-${r.actualOut}`).join(' | '),
  '2026-08-29 00:41-08:09 | 2026-08-30 00:42-08:41 | 2026-08-31 20:09-08:35',
  'Duties starting 00:00–03:59 belong to the previous evening (one entry per date)');

// Real pattern (9–11 Aug): long day duties with no scans between lunch and leaving (12:19 -> 20:36)
const longDays = engine.processAttendance([{ id: 'D1', name: 'Long Day', department: 'Label', shiftId: 'FLEX_8', isActive: true }], flexShifts, [
  ...['08:22', '09:46', '12:34', '12:52', '20:30'].map(t => scan('D1', '2026-08-09', t)),
  ...['08:20', '12:01', '12:19', '20:36'].map(t => scan('D1', '2026-08-10', t)),
  ...['08:18', '12:35', '13:05', '20:37'].map(t => scan('D1', '2026-08-11', t))
]);
assertEqual(longDays.records.map(r => `${r.date} ${r.actualIn}-${r.actualOut}`).join(' | '),
  '2026-08-09 08:22-20:30 | 2026-08-10 08:20-20:36 | 2026-08-11 08:18-20:37',
  'An 8h+ afternoon without scans does not split the day (exit scan stays with its duty)');

// Real pattern (Mohan GP3.1011): 12h duty worker on extended night shift (20:15 IN on 16 Sep, intermediate scans up to 12:35, exit at 17:04 on 17 Sep).
// 17:04 is the OUT punch of 16 Sep, NOT a new shift on 17 Sep with missing OUT.
const extendedNight = engine.processAttendance([{ id: 'GP3.1011', name: 'Mohan Sharma', department: 'Pouching', shiftId: 'FLEX_8', dutyHours: 12, weeklyOff: 'Thursday', isActive: true }], flexShifts, [
  scan('GP3.1011', '2026-09-16', '20:15'),
  scan('GP3.1011', '2026-09-17', '00:16'),
  scan('GP3.1011', '2026-09-17', '04:16'),
  scan('GP3.1011', '2026-09-17', '08:06'),
  scan('GP3.1011', '2026-09-17', '12:35'),
  scan('GP3.1011', '2026-09-17', '17:04'),
  scan('GP3.1011', '2026-09-18', '12:42')
]);
const mRecords = extendedNight.records.filter(r => r.workerId === 'GP3.1011');
assertEqual(mRecords.length, 2, 'Extended night shift does not create a false missing-OUT duty on the next day');
assertEqual(`${mRecords[0].date} ${mRecords[0].actualIn}-${mRecords[0].actualOut}`, '2026-09-16 20:15-17:04', '17:04 is correctly attributed as the OUT punch of 16 Sep');
assertEqual(mRecords[0].hasMissingPunch, false, '16 Sep has complete IN and OUT punches');

// Real pattern (Piyush GP3.1179): A morning stray scan (08:19) and evening night shift (20:02 to 03:02) on 16 Sep
// Must NOT produce 2 entries for 16-09-2026. Exactly 1 entry is created for that date (the 20:02-03:02 shift).
const noDupeDates = engine.processAttendance([{ id: 'GP3.1179', name: 'Piyush Thakor', department: 'Stores', shiftId: 'FLEX_8', dutyHours: 8, isActive: true }], flexShifts, [
  scan('GP3.1179', '2026-09-15', '08:28'), scan('GP3.1179', '2026-09-15', '17:59'),
  scan('GP3.1179', '2026-09-16', '08:19'), // stray morning scan
  scan('GP3.1179', '2026-09-16', '20:02'), scan('GP3.1179', '2026-09-16', '21:11'), scan('GP3.1179', '2026-09-17', '03:02')
]);
const p16 = noDupeDates.records.filter(r => r.workerId === 'GP3.1179' && r.date === '2026-09-16');
assertEqual(p16.length, 1, 'Only 1 entry on 16-09-2026: stray scan does not produce a duplicate date record');
assertEqual(`${p16[0].actualIn}-${p16[0].actualOut}`, '20:02-03:02', 'The real 20:02-03:02 night shift is preserved for 16 Sep');
assertEqual(p16[0].hasMissingPunch, false, 'No missing punch on 16 Sep');



// Test 11: Days present per worker per salary cycle (22nd–21st)
console.log('\nTest Suite 11: Days Present per Salary Cycle');
const presenceWorkers = [
  { id: 'P1', name: 'Fixed', department: 'Office', shiftId: 'OFFICE', isActive: true },
  { id: 'P2', name: 'Night Flex', department: 'Pouch', shiftId: 'FLEX_8', isActive: true },
  { id: 'P3', name: 'No Shift', department: 'Pouch', shiftId: 'DEFAULT_SHIFT', isActive: true }
];
const fullDay = (workerId, date, inTime = '09:00') => [
  { workerId, date, time: inTime, type: 'IN' }, { workerId, date, time: '18:00', type: 'OUT' }
];
const presenceResult = engine.processAttendance(presenceWorkers, flexShifts, [
  ...fullDay('P1', '2026-08-21'),          // Aug cycle (22 Jul – 21 Aug)
  ...fullDay('P1', '2026-08-22'),          // Sep cycle starts
  ...fullDay('P1', '2026-08-25', '13:30'), // half day
  { workerId: 'P1', date: '2026-09-10', time: '09:00', type: 'IN' }, // forgot to punch out
  ...fullDay('P1', '2026-09-21'),          // last day of the Sep cycle
  ...fullDay('P1', '2026-09-22'),          // Oct cycle
  scan('P2', '2026-09-01', '22:00'), scan('P2', '2026-09-02', '06:00'),
  scan('P2', '2026-09-02', '21:30'), scan('P2', '2026-09-03', '07:00'),
  scan('P3', '2026-09-05', '09:00'), scan('P3', '2026-09-05', '17:00'), scan('P3', '2026-09-06', '09:10')
]);
const present = (id, month) => presenceResult.presenceSummary.find(p => p.workerId === id && p.month === month);
const p1Sep = present('P1', '2026-09');
assertEqual(present('P1', '2026-08').daysPresent, 1, '21 Aug counts in the Aug cycle');
assertEqual(`${p1Sep.daysPresent} days, ${p1Sep.halfDays} half, ${p1Sep.effectiveDays} effective`, '4 days, 1 half, 3.5 effective', 'Sep cycle (22 Aug – 21 Sep): 4 days incl. 1 half day = 3.5');
assertEqual(p1Sep.missingPunchDays, 1, 'A day with a missing punch still counts as present, and is reported');
assertEqual(p1Sep.cycleLabel, 'Sep 2026 (22 Aug – 21 Sep)', 'Summary row carries the cycle label');
assertEqual(present('P1', '2026-10').daysPresent, 1, '22 Sep counts in the Oct cycle');
assertEqual(present('P2', '2026-09').daysPresent, 2, 'Two night duties crossing midnight = 2 days (not 3)');
const p2Sep = present('P2', '2026-09');
assertEqual(`${p2Sep.totalOtMinutes} ${p2Sep.totalOtHoursFormatted}`, '90 1h 30m', 'Presence summary aggregates total OT hours (90m / 1h 30m) from daily attendance');
const p3 = present('P3', '2026-09');
assertEqual(`${p3.daysPresent} ${p3.basis} ${p3.missingPunchDays}`, '2 calendar null', 'Worker with no defined shift: counted by calendar days with scans');

// Start day 1 keeps plain calendar months
const calendarEngine = new AttendanceCalculationEngine({ cycleStartDay: 1 });
const calRec = calendarEngine.processAttendance(workerCycle, shifts, punchesCycle).records.find(r => r.workerId === 'W801' && r.date === '2026-09-01');
assertEqual(`${calRec.month} #${calRec.lateOccurrenceIndex} ${calRec.cycleLabel}`, '2026-09 #1 Sep 2026', 'Cycle start day 1 resets on the 1st (calendar month)');

console.log('\n🎉 ALL ENGINE VERIFICATION TESTS PASSED WITH 100% ACCURACY! 🎉\n');
