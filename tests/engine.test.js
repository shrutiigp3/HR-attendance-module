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
  { id: 'OFFICE', name: 'Office', startTime: '09:00', endTime: '18:00', isOvernight: false, weeklyOff: 'Sunday', isActive: true },
  { id: 'PLANT_DAY_1', name: 'Plant Day 1', startTime: '08:30', endTime: '17:00', isOvernight: false, weeklyOff: 'Thursday', isActive: true },
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


// Test 3: Prompt Section 7 - Overtime Rule (Exact Prompt Table & Early Arrival Rule)
console.log('\nTest Suite 3: Overtime Calculations & Early Arrival (Exact Prompt Table)');
const workerOT = [{ id: 'W301', name: 'Vikram Singh', department: 'Production', shiftId: 'OFFICE', isActive: true }];

const punchesOT = [
  // Early arrival IN 08:30, OUT 18:00 -> Early arrival NEVER OT!
  { workerId: 'W301', date: '2026-09-01', time: '08:30', type: 'IN' },
  { workerId: 'W301', date: '2026-09-01', time: '18:00', type: 'OUT' },

  // Early arrival IN 08:50, OUT 18:10 -> 0 OT
  { workerId: 'W301', date: '2026-09-02', time: '08:50', type: 'IN' },
  { workerId: 'W301', date: '2026-09-02', time: '18:10', type: 'OUT' },

  // OUT 18:15 -> 0 OT (Exact at threshold)
  { workerId: 'W301', date: '2026-09-03', time: '09:00', type: 'IN' },
  { workerId: 'W301', date: '2026-09-03', time: '18:15', type: 'OUT' },

  // OUT 18:16 -> 1 minute OT
  { workerId: 'W301', date: '2026-09-04', time: '09:00', type: 'IN' },
  { workerId: 'W301', date: '2026-09-04', time: '18:16', type: 'OUT' },

  // OUT 18:30 -> 15 minutes OT
  { workerId: 'W301', date: '2026-09-05', time: '09:00', type: 'IN' },
  { workerId: 'W301', date: '2026-09-05', time: '18:30', type: 'OUT' },

  // OUT 19:00 -> 45 minutes OT
  { workerId: 'W301', date: '2026-09-06', time: '09:00', type: 'IN' },
  { workerId: 'W301', date: '2026-09-06', time: '19:00', type: 'OUT' },
];

const result3 = engine.processAttendance(workerOT, shifts, punchesOT);

const otDay1 = result3.records.find(r => r.date === '2026-09-01');
assertEqual(otDay1.otMinutes, 0, 'IN 08:30, OUT 18:00 has 0 OT (Early arrival is NEVER OT)');

const otDay2 = result3.records.find(r => r.date === '2026-09-02');
assertEqual(otDay2.otMinutes, 0, 'OUT 18:10 has 0 OT');

const otDay3 = result3.records.find(r => r.date === '2026-09-03');
assertEqual(otDay3.otMinutes, 0, 'OUT 18:15 has 0 OT');

const otDay4 = result3.records.find(r => r.date === '2026-09-04');
assertEqual(otDay4.otMinutes, 1, 'OUT 18:16 has 1 minute OT');

const otDay5 = result3.records.find(r => r.date === '2026-09-05');
assertEqual(otDay5.otMinutes, 15, 'OUT 18:30 has 15 minutes OT');

const otDay6 = result3.records.find(r => r.date === '2026-09-06');
assertEqual(otDay6.otMinutes, 45, 'OUT 19:00 has 45 minutes OT');


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
assertEqual(nightRec.otMinutes, 45, 'OUT 09:30 for 08:30 shift end has exactly 45 minutes OT');
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
assertEqual(faceDay.otMinutes, 25, 'OUT 18:40 for 18:00 shift end has 25 minutes OT');
assert(!faceDay.hasMissingPunch, 'No missing punch flagged when scans exist at both ends');

const faceNights = result5.records.filter(r => r.workerId === 'W502');
assertEqual(faceNights.length, 2, 'Two night shifts resolved from four device scans');
assertEqual(`${faceNights[0].date} ${faceNights[0].actualIn}-${faceNights[0].actualOut}`, '2026-09-15 20:25-08:45', 'Night 1 pairs 20:25 with next-morning 08:45');
assertEqual(`${faceNights[1].date} ${faceNights[1].actualIn}-${faceNights[1].actualOut}`, '2026-09-16 20:28-09:30', 'Night 2 is not polluted by the 08:45 scan');
assertEqual(faceNights[1].otMinutes, 45, 'Night 2 OUT 09:30 has 45 minutes OT');


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
assertEqual(f1a.otMinutes, 30, '8h 45m on an 8h duty (15m threshold) = 30m OT');
assertEqual(flex('F1', '2026-09-02').isHalfDay, true, '3h of 8h is a Half Day');
assertEqual(flex('F1', '2026-09-02').memoAmount, 0, 'Flexible half day has no memo');
const f1c = flex('F1', '2026-09-03');
assertEqual(`${f1c.isHalfDay} ${f1c.earlyDepartureMinutes}`, 'false 120', '6h of 8h: not a half day, short by 120m');

const nights = result10.records.filter(r => r.workerId === 'F2');
assertEqual(nights.length, 2, 'Two night duties -> two records (not four half-records)');
assertEqual(`${nights[0].date} ${nights[0].actualIn}-${nights[0].actualOut} ${nights[0].actualWorkingHoursFormatted}`, '2026-09-01 22:00-06:00 8h', 'Night duty crossing midnight is one 8h record');
assertEqual(`${nights[1].date} ${nights[1].actualWorkingHoursFormatted} OT ${nights[1].otMinutes}`, '2026-09-02 9h 30m OT 75', 'Second night: 9h 30m -> 75m OT');

const f3a = flex('F3', '2026-09-03');
assertEqual(`${f3a.scheduledMinutes} ${f3a.otMinutes} ${f3a.requiredHoursSource}`, '720 5 worker', 'Worker Duty Hrs (12h) override the shift hours: 12h 20m -> 5m OT');
assertEqual(f3a.isWeeklyOff, true, 'Worker weekly off (Thursday) applies to flexible duties');
assertEqual(flex('F3', '2026-09-04').hasMissingPunch, true, 'Single scan: flagged Missing OUT');
assertEqual(flex('F3', '2026-09-05').actualWorkingHoursFormatted, '11h 55m', 'Next duty starts fresh after a missing OUT');

// Real pattern (18–19 Aug): a stray 23:31 scan after a full day must not swallow the next morning
const strayResult = engine.processAttendance([{ id: 'S1', name: 'Stray', department: 'Label', shiftId: 'FLEX_8', isActive: true }], flexShifts, [
  ...['08:25', '12:32', '12:59', '18:04', '18:08', '19:31', '20:20', '23:31'].map(t => scan('S1', '2026-08-18', t)),
  ...['08:25', '12:31', '13:00', '18:03', '18:06', '20:29'].map(t => scan('S1', '2026-08-19', t))
]).records.map(r => `${r.date} ${r.actualIn}-${r.actualOut}`);
assertEqual(strayResult.join(' | '), '2026-08-18 08:25-20:20 | 2026-08-18 23:31---:-- | 2026-08-19 08:25-20:29', 'Stray scan stays apart (Missing OUT); both real days are intact');

// Real pattern (15–16 Sep): stray 23:29 scan, then a short 08:14–11:59 morning the next day
const strayShort = engine.processAttendance([{ id: 'S2', name: 'Stray Short', department: 'Label', shiftId: 'FLEX_8', isActive: true }], flexShifts, [
  ...['08:25', '12:32', '13:01', '17:59', '18:04', '19:17', '20:16', '23:29'].map(t => scan('S2', '2026-09-15', t)),
  ...['08:14', '09:52', '10:00', '11:59'].map(t => scan('S2', '2026-09-16', t))
]);
assertEqual(strayShort.records.map(r => `${r.date} ${r.actualIn}-${r.actualOut}`).join(' | '),
  '2026-09-15 08:25-20:16 | 2026-09-15 23:29---:-- | 2026-09-16 08:14-11:59', 'A real short duty is not merged into a stray scan');
assertEqual(strayShort.presenceSummary[0].daysPresent, 2, 'Both 15 and 16 Sep count as days present');

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
const p3 = present('P3', '2026-09');
assertEqual(`${p3.daysPresent} ${p3.basis} ${p3.missingPunchDays}`, '2 calendar null', 'Worker with no defined shift: counted by calendar days with scans');

// Start day 1 keeps plain calendar months
const calendarEngine = new AttendanceCalculationEngine({ cycleStartDay: 1 });
const calRec = calendarEngine.processAttendance(workerCycle, shifts, punchesCycle).records.find(r => r.workerId === 'W801' && r.date === '2026-09-01');
assertEqual(`${calRec.month} #${calRec.lateOccurrenceIndex} ${calRec.cycleLabel}`, '2026-09 #1 Sep 2026', 'Cycle start day 1 resets on the 1st (calendar month)');

console.log('\n🎉 ALL ENGINE VERIFICATION TESTS PASSED WITH 100% ACCURACY! 🎉\n');
