/**
 * Manufacturing Attendance, Working Hours & Overtime Calculation Engine
 * 
 * Completely decoupled from UI, DOM, and data sources.
 * Can be run in browser or Node.js backend.
 */

import {
  parseTimeToMinutes,
  minutesToTime,
  formatDuration,
  formatDurationDecimal,
  createDateTime,
  diffInMinutes,
  addDays,
  getDayOfWeek,
  getCycleKey,
  getCycleRange
} from './timeUtils.js';

export const DEFAULT_CONFIG = {
  gracePeriodMinutes: 15,            // 15 min automatic grace
  monthlyLateOccurrencesAllowed: 2,  // 2 occurrences per month after grace without memo
  memoAmount: 100,                   // ₹100 per late occurrence after quota
  halfDayThresholdHours: 4,          // Shift Start + 4 Hours
  otThresholdMinutes: 15,            // OT starts 15 min after shift end
  cycleStartDay: 22,                 // Salary cycle runs 22nd–21st (1 = calendar month)
};

// Flexible shifts: a duty can last at most the required hours plus this allowance (capped at 24h),
// and a gap of FLEX_REST_GAP_MINUTES between scans means the worker went home. Real scan data
// shows gaps inside a duty mostly under 7h and rests between duties mostly 11h+.
const FLEX_DUTY_ALLOWANCE_MINUTES = 6 * 60;
const FLEX_REST_GAP_MINUTES = 8 * 60;
// Only fragments this short (a single scan or a quick double tap) are re-joined into one duty
const FLEX_FRAGMENT_MINUTES = 60;

export class AttendanceCalculationEngine {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Updates configuration settings
   * @param {Object} newConfig 
   */
  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Main calculation entrypoint.
   * Processes raw punches for given workers and shifts.
   * 
   * @param {Array} workers 
   * @param {Array} shifts 
   * @param {Array} rawPunches 
   * @returns {Object} { records, monthlyStats, summary, presenceSummary }
   */
  processAttendance(workers = [], shifts = [], rawPunches = []) {
    const shiftMap = new Map(shifts.map(s => [s.id, s]));
    // Workers are matched ignoring capitals, so punches for "GP3.906" reach worker "Gp3.906"
    const workerMap = new Map(workers.map(w => [String(w.id).toLowerCase(), w]));

    // Step 1: Clean and standardize raw punches
    const sanitizedPunches = this._sanitizePunches(rawPunches);

    // Step 2: Determine unique worker-shift-dates from raw punches and worker assignments
    const workerDatePairs = this._identifyWorkerDatePairs(workers, sanitizedPunches, shiftMap, workerMap);

    // Step 3: Pair punches and compute raw daily attendance
    const dailyRecords = [];
    for (const pair of workerDatePairs) {
      const worker = workerMap.get(String(pair.workerId).toLowerCase());
      const shift = shiftMap.get(pair.shiftId);
      if (!worker || !shift) continue;

      const record = this._calculateDailyRecord(worker, shift, pair.date, pair.punches);
      dailyRecords.push(record);
    }

    // Step 4: Sort chronologically to accurately apply monthly late occurrence and memo counters
    dailyRecords.sort((a, b) => {
      if (a.workerId !== b.workerId) return a.workerId.localeCompare(b.workerId);
      return a.date.localeCompare(b.date);
    });

    // Step 5: Process monthly late counters & memo tracking per worker
    const { enrichedRecords, monthlyStats } = this._applyMonthlyMemoAndGraceTracking(dailyRecords);

    // Step 6: Compute high-level summary KPIs
    const summary = this._computeSummaryKPIs(enrichedRecords, monthlyStats, workers);

    // Step 7: Days present per worker per salary cycle (for payroll)
    const presenceSummary = this._computePresenceSummary(enrichedRecords, workerMap, shiftMap, sanitizedPunches);

    return {
      records: enrichedRecords,
      monthlyStats,
      summary,
      presenceSummary
    };
  }

  /**
   * Days present per worker per salary cycle (e.g. 22nd–21st).
   * - A date counts once however many records it has (a duty crossing midnight counts on its start date)
   * - It is a half day only if every record that date is a half day; effectiveDays counts half days as ½
   * - Workers whose shift isn't defined have no calculated records, so their days are counted by
   *   calendar dates with at least one scan (basis 'calendar'; half days/missing punches unknown)
   */
  _computePresenceSummary(records, workerMap, shiftMap, punches) {
    const byWorkerCycle = new Map();
    const entryFor = (worker, date, basis) => {
      const month = getCycleKey(date, this.config.cycleStartDay);
      const key = `${worker.id}_${month}`;
      if (!byWorkerCycle.has(key)) {
        const cycle = getCycleRange(month, this.config.cycleStartDay);
        byWorkerCycle.set(key, {
          workerId: worker.id,
          workerName: worker.name,
          department: worker.department,
          shiftId: worker.shiftId || '',
          shiftName: shiftMap.get(worker.shiftId)?.name || '',
          month,
          cycleLabel: cycle.label,
          cycleFrom: cycle.from,
          cycleTo: cycle.to,
          basis,
          fullDayByDate: new Map(),
          missingPunchDates: new Set()
        });
      }
      return byWorkerCycle.get(key);
    };

    for (const r of records) {
      const worker = workerMap.get(String(r.workerId).toLowerCase());
      if (!worker) continue;
      const entry = entryFor(worker, r.date, 'shift');
      entry.fullDayByDate.set(r.date, entry.fullDayByDate.get(r.date) || !r.isHalfDay);
      if (r.hasMissingPunch) entry.missingPunchDates.add(r.date);
    }

    for (const p of punches) {
      const worker = workerMap.get(p.workerKey);
      if (!worker || shiftMap.has(worker.shiftId)) continue;
      entryFor(worker, p.date, 'calendar').fullDayByDate.set(p.date, true);
    }

    return [...byWorkerCycle.values()].map(({ fullDayByDate, missingPunchDates, ...entry }) => {
      const daysPresent = fullDayByDate.size;
      const halfDays = [...fullDayByDate.values()].filter(full => !full).length;
      return {
        ...entry,
        daysPresent,
        halfDays,
        effectiveDays: daysPresent - halfDays / 2,
        missingPunchDays: entry.basis === 'shift' ? missingPunchDates.size : null
      };
    });
  }

  /**
   * Standardizes raw punches: cleans whitespace, sorts chronologically, removes rapid duplicates (< 2 min)
   */
  _sanitizePunches(punches) {
    if (!Array.isArray(punches)) return [];

    const validPunches = punches
      .filter(p => p && p.workerId && p.date && p.time)
      .map(p => ({
        id: p.id || `P-${p.workerId}-${p.date}-${p.time}`,
        workerId: String(p.workerId).trim(),
        workerKey: String(p.workerId).trim().toLowerCase(), // for matching/grouping regardless of capitals
        date: String(p.date).trim(),
        time: String(p.time).trim().substring(0, 5), // Normalize to HH:mm
        type: String(p.type || 'IN').trim().toUpperCase(), // IN, OUT, or AUTO (direction not recorded)
        original: p
      }));

    // Sort by worker, date, time
    validPunches.sort((a, b) => {
      if (a.workerKey !== b.workerKey) return a.workerKey.localeCompare(b.workerKey);
      const dtA = `${a.date}T${a.time}`;
      const dtB = `${b.date}T${b.time}`;
      return dtA.localeCompare(dtB);
    });

    // Remove micro duplicate punches (same worker, same minute or within 2 mins of same type)
    const filtered = [];
    for (let i = 0; i < validPunches.length; i++) {
      const curr = validPunches[i];
      const prev = filtered[filtered.length - 1];
      if (
        prev &&
        prev.workerKey === curr.workerKey &&
        prev.date === curr.date &&
        prev.type === curr.type
      ) {
        const minDiff = Math.abs(parseTimeToMinutes(curr.time) - parseTimeToMinutes(prev.time));
        if (minDiff < 3) {
          // Skip redundant double tap
          continue;
        }
      }
      filtered.push(curr);
    }

    return filtered;
  }

  /**
   * Identifies the shift-dates for which workers have punches
   */
  _identifyWorkerDatePairs(workers, punches, shiftMap, workerMap = null) {
    if (!workerMap) {
      workerMap = new Map(workers.map(w => [String(w.id).toLowerCase(), w]));
    }
    const workerPunchesMap = new Map();
    for (const p of punches) {
      if (!workerPunchesMap.has(p.workerKey)) {
        workerPunchesMap.set(p.workerKey, []);
      }
      workerPunchesMap.get(p.workerKey).push(p);
    }

    const pairs = [];
    const processedKeys = new Set();

    // Iterate only over workers that actually have punch records for massive performance with large worker rosters
    for (const [workerKey, wPunches] of workerPunchesMap.entries()) {
      const worker = workerMap.get(workerKey);
      if (!worker) continue;
      const shift = shiftMap.get(worker.shiftId);

      if (shift?.isFlexible) {
        for (const duty of this._groupFlexibleDuties(worker, shift, wPunches)) {
          pairs.push({ workerId: worker.id, shiftId: worker.shiftId, date: duty.date, punches: duty.punches });
        }
        continue;
      }

      const isOvernight = shift ? (shift.isOvernight || parseTimeToMinutes(shift.endTime) < parseTimeToMinutes(shift.startTime)) : false;

      // Collect all distinct dates
      const distinctDates = [...new Set(wPunches.map(p => p.date))].sort();

      for (const date of distinctDates) {
        // If this is an overnight shift, an OUT punch in the morning (e.g. before 14:00)
        // might belong to the PREVIOUS day's shift!
        if (isOvernight) {
          const morningOutPunches = wPunches.filter(p => p.date === date && p.type === 'OUT' && parseTimeToMinutes(p.time) < 14 * 60);
          const eveningInPrevDay = wPunches.filter(p => p.date === addDays(date, -1) && p.type === 'IN');

          // If there was an IN on previous day, this morning OUT belongs to yesterday's shift
          if (morningOutPunches.length > 0 && eveningInPrevDay.length > 0) {
            // Handled under yesterday's shift
          }
        }

        const key = `${worker.id}_${date}`;
        if (!processedKeys.has(key)) {
          processedKeys.add(key);

          // Get punches relevant to this shift date
          const shiftPunches = this._getPunchesForShiftDate(worker, shift, date, wPunches);
          if (shiftPunches.length > 0) {
            pairs.push({
              workerId: worker.id,
              shiftId: worker.shiftId,
              date,
              punches: shiftPunches
            });
          }
        }
      }
    }

    return pairs;
  }

  /**
   * Flexible shifts have no fixed timings, so a worker's scans are split into duties by time alone;
   * day, night and midnight-crossing duties each become one record, dated by their first scan.
   * 1. A new duty starts after a rest gap (FLEX_REST_GAP_MINUTES) or once the duty would exceed
   *    the required hours + FLEX_DUTY_ALLOWANCE_MINUTES.
   * 2. Two tiny fragments (FLEX_FRAGMENT_MINUTES) within one duty window are re-joined: someone who
   *    scans only on arrival and departure 9h apart is one duty, while a lone stray scan beside a real
   *    duty, even a short one, stays apart (flagged Missing OUT) instead of swallowing its scans.
   * Punches must be sorted chronologically (they are, from _sanitizePunches).
   */
  _groupFlexibleDuties(worker, shift, workerPunches) {
    const requiredMinutes = this._requiredMinutes(worker, shift);
    const windowMs = Math.min(24 * 60, requiredMinutes + FLEX_DUTY_ALLOWANCE_MINUTES) * 60 * 1000;
    const restMs = FLEX_REST_GAP_MINUTES * 60 * 1000;
    const fragmentMs = FLEX_FRAGMENT_MINUTES * 60 * 1000;

    const segments = [];
    let current = null;
    let prevAt = 0;
    for (const p of workerPunches) {
      const at = createDateTime(p.date, p.time).getTime();
      if (!current || at - prevAt >= restMs || at - current.startAt > windowMs) {
        current = { startAt: at, endAt: at, punches: [] };
        segments.push(current);
      }
      current.punches.push(p);
      current.endAt = at;
      prevAt = at;
    }

    const duties = [];
    for (const seg of segments) {
      const last = duties[duties.length - 1];
      const bothFragments = last && last.endAt - last.startAt < fragmentMs && seg.endAt - seg.startAt < fragmentMs;
      if (bothFragments && seg.endAt - last.startAt <= windowMs) {
        last.punches.push(...seg.punches);
        last.endAt = seg.endAt;
      } else {
        duties.push(seg);
      }
    }
    return duties.map(d => ({ date: d.punches[0].date, punches: d.punches }));
  }

  /** Required minutes for a flexible shift: the worker's own Duty Hrs if set, else the shift's hours */
  _requiredMinutes(worker, shift) {
    const hours = Number(worker.dutyHours) > 0 ? Number(worker.dutyHours) : Number(shift.workingHours) || 0;
    return Math.round(hours * 60);
  }

  /**
   * First IN and last OUT among a shift's punches. Scans without a recorded direction (AUTO, e.g.
   * face devices): the first scan is IN and the last is OUT. Explicit IN/OUT punches take precedence.
   */
  _pairPunches(punches) {
    const inPunches = punches.filter(p => p.type === 'IN');
    const outPunches = punches.filter(p => p.type === 'OUT');
    const autoPunches = punches.filter(p => p.type === 'AUTO');
    if (autoPunches.length > 0) {
      if (inPunches.length === 0) inPunches.push(autoPunches.shift());
      if (outPunches.length === 0 && autoPunches.length > 0) outPunches.push(autoPunches.pop());
    }
    return { firstIn: inPunches[0] || null, lastOut: outPunches[outPunches.length - 1] || null };
  }

  /**
   * Gathers punches relevant to a specific shift date, handling overnight windowing
   */
  _getPunchesForShiftDate(worker, shift, shiftDate, workerPunches) {
    const isOvernight = shift ? (shift.isOvernight || parseTimeToMinutes(shift.endTime) < parseTimeToMinutes(shift.startTime)) : false;

    if (!isOvernight) {
      // Normal shift: punches on shiftDate
      return workerPunches.filter(p => p.date === shiftDate);
    }

    // Overnight shift:
    // Expected IN: on shiftDate (usually afternoon/evening)
    // Expected OUT: on shiftDate + 1 day (usually morning/noon)
    const nextDate = addDays(shiftDate, 1);

    const relevant = [];
    for (const p of workerPunches) {
      if (p.date === shiftDate) {
        // If it's an OUT punch very early in the morning on shiftDate (e.g. 08:30) and there is no prior IN,
        // it may belong to day - 1, so do not include it if shift starts late (e.g. 20:30)
        const punchMin = parseTimeToMinutes(p.time);
        const shiftStartMin = parseTimeToMinutes(shift.startTime);
        // Direction-less (AUTO) scans are placed by time alone, like OUT punches
        if ((p.type === 'OUT' || p.type === 'AUTO') && punchMin < shiftStartMin - 300) {
          // Belongs to previous day's shift
          continue;
        }
        relevant.push(p);
      } else if (p.date === nextDate) {
        // Only morning/afternoon punches of next day belong to this overnight shift
        const punchMin = parseTimeToMinutes(p.time);
        const shiftEndMin = parseTimeToMinutes(shift.endTime);
        // Include if OUT, or if time is within reasonable shift boundary (e.g. before 16:00)
        if (p.type === 'OUT' || punchMin <= shiftEndMin + 360) {
          relevant.push(p);
        }
      }
    }

    return relevant;
  }

  /**
   * Calculates daily metrics for a single worker on a given shift date
   */
  _calculateDailyRecord(worker, shift, shiftDate, punches) {
    if (shift.isFlexible) return this._calculateFlexibleRecord(worker, shift, shiftDate, punches);

    const isOvernight = shift.isOvernight || parseTimeToMinutes(shift.endTime) < parseTimeToMinutes(shift.startTime);
    const dayOfWeek = getDayOfWeek(shiftDate);
    // A worker's own weekly off (from a roster import) overrides the shift's; it may list several days
    const weeklyOff = worker.weeklyOff || shift.weeklyOff || '';
    const isWeeklyOff = weeklyOff.split(',').some(d => d.trim().toLowerCase() === dayOfWeek.toLowerCase());

    // Scheduled Shift Timings
    const shiftStartDT = createDateTime(shiftDate, shift.startTime);
    const shiftEndDT = isOvernight 
      ? createDateTime(addDays(shiftDate, 1), shift.endTime)
      : createDateTime(shiftDate, shift.endTime);

    const scheduledWorkingMinutes = diffInMinutes(shiftStartDT, shiftEndDT);

    // Half-Day Threshold = Shift Start + config.halfDayThresholdHours (Default: 4 hours)
    // Formula: Half-Day Time = Shift Start + 4 Hours (Subject to configurable settings)
    const halfDayThresholdMinutes = this.config.halfDayThresholdHours * 60;
    const halfDayThresholdDT = new Date(shiftStartDT.getTime() + halfDayThresholdMinutes * 60 * 1000);
    const halfDayThresholdTime = minutesToTime(parseTimeToMinutes(shift.startTime) + halfDayThresholdMinutes);

    const { firstIn, lastOut } = this._pairPunches(punches);

    let actualInDT = null;
    let actualOutDT = null;
    let actualInStr = '--:--';
    let actualOutStr = '--:--';
    let actualInDate = shiftDate;
    let actualOutDate = isOvernight ? addDays(shiftDate, 1) : shiftDate;

    const flags = [];

    // Evaluate IN punch
    if (firstIn) {
      actualInStr = firstIn.time;
      actualInDate = firstIn.date;
      actualInDT = createDateTime(firstIn.date, firstIn.time);
    } else {
      flags.push('Missing IN Punch');
    }

    // Evaluate OUT punch
    if (lastOut) {
      actualOutStr = lastOut.time;
      actualOutDate = lastOut.date;
      actualOutDT = createDateTime(lastOut.date, lastOut.time);
    } else {
      flags.push('Missing OUT Punch');
    }

    // Check invalid sequence (OUT before IN on same day without overnight)
    if (actualInDT && actualOutDT && actualOutDT < actualInDT) {
      flags.push('Invalid Sequence (OUT before IN)');
    }

    // Actual Working / Presence Hours
    let actualWorkingMinutes = 0;
    if (actualInDT && actualOutDT && actualOutDT >= actualInDT) {
      actualWorkingMinutes = diffInMinutes(actualInDT, actualOutDT);
    }

    // --- LATE ARRIVAL & GRACE LOGIC ---
    // Rule 5:
    // Shift Start + 15 min grace (configurable).
    // IN <= Shift Start -> On time, 0 late min
    // Shift Start < IN <= Shift Start + Grace -> Within grace period (Grace - no memo, NOT a late occurrence)
    // IN > Shift Start + Grace -> Late arrival (Counts as a late occurrence)
    let lateMinutes = 0;
    let graceStatus = 'On Time';
    let isGrace = false;
    let isLateOccurrence = false;

    if (actualInDT) {
      const graceLimitDT = new Date(shiftStartDT.getTime() + this.config.gracePeriodMinutes * 60 * 1000);

      if (actualInDT <= shiftStartDT) {
        lateMinutes = 0;
        graceStatus = 'On Time';
        isGrace = false;
        isLateOccurrence = false;
      } else if (actualInDT <= graceLimitDT) {
        lateMinutes = diffInMinutes(shiftStartDT, actualInDT);
        graceStatus = 'Within Grace';
        isGrace = true;
        isLateOccurrence = false; // NOT a late occurrence per prompt rules!
      } else {
        lateMinutes = diffInMinutes(shiftStartDT, actualInDT);
        graceStatus = 'Beyond Grace';
        isGrace = false;
        isLateOccurrence = true;  // This IS a late occurrence
        flags.push(`Late Arrival (${lateMinutes}m)`);
      }
    }

    // --- HALF-DAY LOGIC ---
    // Rule 6: Half-day is determined based on shift start time + config.halfDayThresholdHours.
    // If worker arrives after HalfDayThreshold -> Attendance marked as Half Day.
    let isHalfDay = false;
    let halfDayStatus = 'Full Day';

    if (actualInDT) {
      if (actualInDT > halfDayThresholdDT) {
        isHalfDay = true;
        halfDayStatus = 'Half Day';
        flags.push(`Half Day (IN after ${halfDayThresholdTime})`);
        // The half day is the penalty for this arrival: it is not a late occurrence, so it
        // never draws a memo and doesn't use up the monthly late allowance
        isLateOccurrence = false;
      }
    }

    // --- OVERTIME (OT) LOGIC ---
    // Rule 7 & 8:
    // Early arrival is NEVER overtime.
    // OT starts 15 minutes after scheduled shift end (configurable).
    // OUT <= Shift End + 15 min -> 0 OT
    // OUT > Shift End + 15 min -> OT = Actual OUT - (Shift End + 15 min)
    let otMinutes = 0;
    let otStatus = '0m';

    if (actualOutDT) {
      const otStartDT = new Date(shiftEndDT.getTime() + this.config.otThresholdMinutes * 60 * 1000);

      if (actualOutDT > otStartDT) {
        otMinutes = diffInMinutes(otStartDT, actualOutDT);
        otStatus = formatDuration(otMinutes);
        if (otMinutes > 240) {
          flags.push(`High OT (${formatDuration(otMinutes)})`);
        }
      } else {
        otMinutes = 0;
        otStatus = '0m';
      }
    }

    // --- EARLY DEPARTURE LOGIC ---
    let earlyDepartureMinutes = 0;
    let isEarlyDeparture = false;

    if (actualOutDT && actualOutDT < shiftEndDT) {
      earlyDepartureMinutes = diffInMinutes(actualOutDT, shiftEndDT);
      if (earlyDepartureMinutes > 5) {
        isEarlyDeparture = true;
        flags.push(`Early Departure (${earlyDepartureMinutes}m)`);
      }
    }

    // Rest day work flag
    if (isWeeklyOff && actualWorkingMinutes > 0) {
      flags.push('Weekly Off Worked');
    }

    return {
      id: `${worker.id}_${shiftDate}`,
      workerId: worker.id,
      workerName: worker.name,
      department: worker.department,
      shiftId: shift.id,
      shiftName: shift.name,
      isFlexible: false,
      shiftWindow: `${shift.startTime}–${shift.endTime}`,
      isOvernight,
      date: shiftDate,
      // Salary cycle (e.g. 22nd–21st), keyed by the month it ends in; drives the late/memo counters
      month: getCycleKey(shiftDate, this.config.cycleStartDay),
      cycleLabel: getCycleRange(getCycleKey(shiftDate, this.config.cycleStartDay), this.config.cycleStartDay).label,
      dayOfWeek,
      isWeeklyOff,

      // Timings
      shiftStart: shift.startTime,
      shiftEnd: shift.endTime,
      shiftStartDateTime: shiftStartDT.toISOString(),
      shiftEndDateTime: shiftEndDT.toISOString(),
      halfDayThresholdTime,

      actualIn: actualInStr,
      actualInDate,
      actualOut: actualOutStr,
      actualOutDate,

      // Durations
      scheduledMinutes: scheduledWorkingMinutes,
      scheduledHoursFormatted: formatDuration(scheduledWorkingMinutes),
      actualWorkingMinutes,
      actualWorkingHoursFormatted: formatDuration(actualWorkingMinutes),
      actualWorkingHoursDecimal: (actualWorkingMinutes / 60).toFixed(2),

      // Late & Grace
      lateMinutes,
      graceStatus,
      isGrace,
      isLateOccurrence,

      // Half-Day
      isHalfDay,
      halfDayStatus,

      // Overtime
      otMinutes,
      otHoursFormatted: formatDuration(otMinutes),
      otHoursDecimal: (otMinutes / 60).toFixed(2),

      // Early Departure
      earlyDepartureMinutes,
      isEarlyDeparture,

      // Suspicious / Missing
      hasMissingPunch: flags.some(f => f.includes('Missing')),
      hasAnomaly: flags.length > 0,
      flags,
      rawPunches: punches
    };
  }

  /**
   * Flexible shift duty: no fixed timings, only required working hours (the worker's Duty Hrs, or
   * the shift's hours). Worked time = first IN to last OUT, whenever in the 24 hours it happens.
   * - No late arrival, grace or memo (there is no start time to be late for)
   * - Half Day: worked less than half the required hours
   * - Short Hours: worked less than the required hours (reported as early departure)
   * - OT: time worked beyond required hours + OT threshold (same threshold as fixed shifts)
   */
  _calculateFlexibleRecord(worker, shift, dutyDate, punches) {
    const requiredMinutes = this._requiredMinutes(worker, shift);
    const dayOfWeek = getDayOfWeek(dutyDate);
    const weeklyOff = worker.weeklyOff || shift.weeklyOff || '';
    const isWeeklyOff = weeklyOff.split(',').some(d => d.trim().toLowerCase() === dayOfWeek.toLowerCase());
    const flags = [];

    const { firstIn, lastOut } = this._pairPunches(punches);
    const actualInDT = firstIn ? createDateTime(firstIn.date, firstIn.time) : null;
    const actualOutDT = lastOut ? createDateTime(lastOut.date, lastOut.time) : null;
    if (!firstIn) flags.push('Missing IN Punch');
    if (!lastOut) flags.push('Missing OUT Punch');
    if (actualInDT && actualOutDT && actualOutDT < actualInDT) flags.push('Invalid Sequence (OUT before IN)');

    const hasWorkedSpan = !!(actualInDT && actualOutDT && actualOutDT >= actualInDT);
    const actualWorkingMinutes = hasWorkedSpan ? diffInMinutes(actualInDT, actualOutDT) : 0;

    // Half day: worked less than half the required hours
    const isHalfDay = hasWorkedSpan && actualWorkingMinutes < requiredMinutes / 2;
    if (isHalfDay) flags.push(`Half Day (worked ${formatDuration(actualWorkingMinutes)} of ${formatDuration(requiredMinutes)})`);

    // Short hours: the flexible equivalent of leaving early (same 5-minute tolerance)
    const earlyDepartureMinutes = hasWorkedSpan ? Math.max(0, requiredMinutes - actualWorkingMinutes) : 0;
    const isEarlyDeparture = earlyDepartureMinutes > 5;
    if (isEarlyDeparture) flags.push(`Short Hours (${formatDuration(earlyDepartureMinutes)})`);

    // OT: beyond required hours + threshold, e.g. 8h duty, 15m threshold -> 8h 45m worked = 30m OT
    const otStartMinutes = requiredMinutes + this.config.otThresholdMinutes;
    const otMinutes = hasWorkedSpan && actualWorkingMinutes > otStartMinutes ? actualWorkingMinutes - otStartMinutes : 0;
    if (otMinutes > 240) flags.push(`High OT (${formatDuration(otMinutes)})`);

    if (isWeeklyOff && actualWorkingMinutes > 0) flags.push('Weekly Off Worked');

    const cycleKey = getCycleKey(dutyDate, this.config.cycleStartDay);
    const actualInDate = firstIn ? firstIn.date : dutyDate;
    const actualOutDate = lastOut ? lastOut.date : dutyDate;

    return {
      // Several duties can start on one date, so the start time keeps the id unique
      id: `${worker.id}_${dutyDate}_${firstIn ? firstIn.time : punches[0].time}`,
      workerId: worker.id,
      workerName: worker.name,
      department: worker.department,
      shiftId: shift.id,
      shiftName: shift.name,
      isFlexible: true,
      shiftWindow: `Any time · ${formatDuration(requiredMinutes)}`,
      requiredHoursSource: Number(worker.dutyHours) > 0 ? 'worker' : 'shift',
      isOvernight: actualOutDate > actualInDate, // duty crossed midnight
      date: dutyDate,
      month: cycleKey,
      cycleLabel: getCycleRange(cycleKey, this.config.cycleStartDay).label,
      dayOfWeek,
      isWeeklyOff,

      // Timings
      shiftStart: 'Any time',
      shiftEnd: '',
      shiftStartDateTime: actualInDT ? actualInDT.toISOString() : null,
      shiftEndDateTime: null,
      halfDayThresholdTime: formatDuration(requiredMinutes / 2),

      actualIn: firstIn ? firstIn.time : '--:--',
      actualInDate,
      actualOut: lastOut ? lastOut.time : '--:--',
      actualOutDate,

      // Durations
      scheduledMinutes: requiredMinutes,
      scheduledHoursFormatted: formatDuration(requiredMinutes),
      actualWorkingMinutes,
      actualWorkingHoursFormatted: formatDuration(actualWorkingMinutes),
      actualWorkingHoursDecimal: (actualWorkingMinutes / 60).toFixed(2),

      // Late & Grace: not applicable without a start time
      lateMinutes: 0,
      graceStatus: 'Flexible',
      isGrace: false,
      isLateOccurrence: false,

      // Half-Day
      isHalfDay,
      halfDayStatus: isHalfDay ? 'Half Day' : 'Full Day',

      // Overtime
      otMinutes,
      otHoursFormatted: formatDuration(otMinutes),
      otHoursDecimal: (otMinutes / 60).toFixed(2),

      // Short hours (reported through the early-departure fields)
      earlyDepartureMinutes,
      isEarlyDeparture,

      // Suspicious / Missing
      hasMissingPunch: flags.some(f => f.includes('Missing')),
      hasAnomaly: flags.length > 0,
      flags,
      rawPunches: punches
    };
  }

  /**
   * Applies monthly counters per worker:
   * - Grace-period arrivals
   * - Late occurrences after grace
   * - Allowed late occurrences = 2
   * - Late occurrences used
   * - Remaining late allowance
   * - Memo count
   * - Total memo amount
   * 
   * Counter automatically resets at the start of each salary cycle (config.cycleStartDay,
   * e.g. on the 22nd for a 22nd–21st cycle; day 1 = calendar month).
   */
  _applyMonthlyMemoAndGraceTracking(records) {
    // Map key: `${workerId}_${month}`, where month is the salary cycle key
    const monthlyStats = new Map();

    const enrichedRecords = records.map(record => {
      const monthKey = record.month; // e.g. "2026-09" = cycle 22 Aug – 21 Sep
      const workerMonthKey = `${record.workerId}_${monthKey}`;

      if (!monthlyStats.has(workerMonthKey)) {
        const cycle = getCycleRange(monthKey, this.config.cycleStartDay);
        monthlyStats.set(workerMonthKey, {
          workerId: record.workerId,
          workerName: record.workerName,
          department: record.department,
          month: monthKey,
          cycleLabel: cycle.label,
          cycleFrom: cycle.from,
          cycleTo: cycle.to,
          graceArrivalsCount: 0,
          lateOccurrencesCount: 0,
          allowedLateOccurrences: this.config.monthlyLateOccurrencesAllowed,
          lateOccurrencesUsed: 0,
          remainingLateAllowance: this.config.monthlyLateOccurrencesAllowed,
          memoCount: 0,
          totalMemoAmount: 0,
          totalWorkingMinutes: 0,
          totalOtMinutes: 0,
          halfDayCount: 0
        });
      }

      const stat = monthlyStats.get(workerMonthKey);

      // Accumulate aggregates
      stat.totalWorkingMinutes += record.actualWorkingMinutes;
      stat.totalOtMinutes += record.otMinutes;
      if (record.isHalfDay) stat.halfDayCount++;

      // 1. Grace Tracking
      if (record.isGrace) {
        stat.graceArrivalsCount++;
      }

      // 2. Late Occurrence & Memo Tracking
      let memoStatus = record.isHalfDay ? 'Half Day - No Memo' : 'None';
      let memoCount = 0;
      let memoAmount = 0;
      let lateOccurrenceIndex = 0;

      if (record.isLateOccurrence) {
        stat.lateOccurrencesCount++;
        lateOccurrenceIndex = stat.lateOccurrencesCount;

        if (lateOccurrenceIndex <= stat.allowedLateOccurrences) {
          // Within allowed monthly quota (e.g. 1st or 2nd) -> No memo
          memoStatus = `Allowed Late (#${lateOccurrenceIndex} of ${stat.allowedLateOccurrences}) - No Memo`;
          memoCount = 0;
          memoAmount = 0;
        } else {
          // 3rd and subsequent late occurrences -> Memo issued (e.g. ₹100)
          stat.memoCount++;
          stat.totalMemoAmount += this.config.memoAmount;
          memoCount = 1;
          memoAmount = this.config.memoAmount;
          memoStatus = `Memo Issued (#${lateOccurrenceIndex}: ₹${memoAmount})`;
          record.flags.push(`Late Memo # ${lateOccurrenceIndex} (₹${memoAmount})`);
        }

        // Update quota usage
        stat.lateOccurrencesUsed = Math.min(stat.lateOccurrencesCount, stat.allowedLateOccurrences);
        stat.remainingLateAllowance = Math.max(0, stat.allowedLateOccurrences - stat.lateOccurrencesCount);
      }

      return {
        ...record,
        memoStatus,
        memoCount,
        memoAmount,
        lateOccurrenceIndex,
        // Monthly context at this point in time
        monthlyGraceSoFar: stat.graceArrivalsCount,
        monthlyLateOccurrencesSoFar: stat.lateOccurrencesCount,
        monthlyRemainingAllowance: stat.remainingLateAllowance
      };
    });

    return {
      enrichedRecords,
      monthlyStats: Array.from(monthlyStats.values())
    };
  }

  /**
   * Computes dashboard summary metrics across records and monthly stats
   */
  _computeSummaryKPIs(records, monthlyStats, workers) {
    const totalWorkers = workers.length;
    const activeWorkers = workers.filter(w => w.isActive !== false).length;

    let totalWorkingMinutes = 0;
    let totalOtMinutes = 0;
    let totalLateArrivals = 0;
    let totalGraceArrivals = 0;
    let totalLateOccurrencesAfterGrace = 0;
    let totalHalfDayWorkers = 0;
    let totalMemoCount = 0;
    let totalMemoAmount = 0;
    let totalMissingPunches = 0;
    let totalInvalidPunches = 0;

    for (const r of records) {
      totalWorkingMinutes += r.actualWorkingMinutes;
      totalOtMinutes += r.otMinutes;

      if (r.lateMinutes > 0) totalLateArrivals++;
      if (r.isGrace) totalGraceArrivals++;
      if (r.isLateOccurrence) totalLateOccurrencesAfterGrace++;
      if (r.isHalfDay) totalHalfDayWorkers++;
      if (r.memoCount > 0) {
        totalMemoCount += r.memoCount;
        totalMemoAmount += r.memoAmount;
      }
      if (r.hasMissingPunch) totalMissingPunches++;
      if (r.hasAnomaly) totalInvalidPunches++;
    }

    // Remaining late allowance aggregate
    let totalAllowedLateOccurrences = monthlyStats.reduce((sum, s) => sum + s.allowedLateOccurrences, 0);
    let totalLateOccurrencesUsed = monthlyStats.reduce((sum, s) => sum + s.lateOccurrencesUsed, 0);
    let totalRemainingLateAllowance = monthlyStats.reduce((sum, s) => sum + s.remainingLateAllowance, 0);

    return {
      totalWorkers,
      activeWorkers,
      totalRecords: records.length,
      totalWorkingMinutes,
      totalWorkingHoursFormatted: formatDuration(totalWorkingMinutes),
      totalWorkingHoursDecimal: (totalWorkingMinutes / 60).toFixed(1),
      totalOtMinutes,
      totalOtHoursFormatted: formatDuration(totalOtMinutes),
      totalOtHoursDecimal: (totalOtMinutes / 60).toFixed(1),
      totalLateArrivals,
      totalGraceArrivals,
      totalLateOccurrencesAfterGrace,
      totalAllowedLateOccurrences,
      totalLateOccurrencesUsed,
      totalRemainingLateAllowance,
      totalHalfDayWorkers,
      totalMemoCount,
      totalMemoAmount,
      totalMissingPunches,
      totalInvalidPunches
    };
  }
}
