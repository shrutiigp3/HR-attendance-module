/**
 * Time and Date Utilities for Manufacturing Attendance & Overtime Engine
 */

/**
 * Parses "HH:mm" or "HH:mm:ss" into integer minutes from midnight (0..1439)
 * @param {string} timeStr e.g. "09:15"
 * @returns {number} minutes from midnight
 */
export function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.toString().trim().split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

/**
 * Converts minutes from midnight into "HH:mm" 24-hr format
 * @param {number} totalMinutes e.g. 555
 * @returns {string} e.g. "09:15"
 */
export function minutesToTime(totalMinutes) {
  if (totalMinutes == null || isNaN(totalMinutes)) return '--:--';
  const normalized = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Formats duration in minutes to human readable "Xh Ym"
 * @param {number} minutes e.g. 545
 * @returns {string} e.g. "9h 05m" or "0m"
 */
export function formatDuration(minutes) {
  if (minutes == null || isNaN(minutes) || minutes === 0) return '0m';
  const sign = minutes < 0 ? '-' : '';
  const absMin = Math.abs(Math.round(minutes));
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Formats duration in decimal hours (e.g. 8.50 hrs)
 * @param {number} minutes e.g. 510
 * @returns {string} e.g. "8.50 hrs"
 */
export function formatDurationDecimal(minutes) {
  if (minutes == null || isNaN(minutes)) return '0.00 hrs';
  return (minutes / 60).toFixed(2) + ' hrs';
}

/**
 * Creates a UTC Date object given "YYYY-MM-DD" and optional "HH:mm"
 * @param {string} dateStr e.g. "2026-09-15"
 * @param {string} [timeStr="00:00"] e.g. "20:30"
 * @returns {Date}
 */
export function createDateTime(dateStr, timeStr = '00:00') {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, min] = (timeStr || '00:00').split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour || 0, min || 0, 0, 0));
}

/**
 * Difference in minutes between two DateTimes (dt2 - dt1)
 * @param {Date} dt1 
 * @param {Date} dt2 
 * @returns {number}
 */
export function diffInMinutes(dt1, dt2) {
  if (!dt1 || !dt2) return 0;
  return Math.round((dt2.getTime() - dt1.getTime()) / (60 * 1000));
}

/**
 * Adds days to a "YYYY-MM-DD" string
 * @param {string} dateStr 
 * @param {number} days 
 * @returns {string}
 */
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().split('T')[0];
}

/**
 * Gets day of week name from "YYYY-MM-DD"
 * @param {string} dateStr 
 * @returns {string} e.g. "Sunday", "Monday", etc.
 */
export function getDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dt.getUTCDay()];
}

/**
 * Gets "YYYY-MM" month key from a date string
 * @param {string} dateStr e.g. "2026-09-15"
 * @returns {string} e.g. "2026-09"
 */
export function getMonthKey(dateStr) {
  if (!dateStr) return '';
  return dateStr.substring(0, 7);
}

/**
 * Short timing label for a shift: "09:00–18:00", or "Flexible · 8h" for a shift with
 * required hours but no fixed timings
 */
export function formatShiftTiming(shift) {
  if (!shift) return '--:--';
  return shift.isFlexible ? `Flexible · ${formatDuration(Number(shift.workingHours) * 60)}` : `${shift.startTime}–${shift.endTime}`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 1 -> "1st", 21 -> "21st", 22 -> "22nd", 11 -> "11th" */
export function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
}

/** "22nd – 21st" for a cycle starting on the 22nd, or "calendar month" for day 1 */
export function describeCycle(cycleStartDay) {
  return cycleStartDay > 1 ? `${ordinal(cycleStartDay)} – ${ordinal(cycleStartDay - 1)}` : 'calendar month';
}

/**
 * Salary/attendance cycle key "YYYY-MM" for a date, named after the month the cycle ends in.
 * With cycleStartDay 22 each cycle runs 22nd–21st: 2026-08-22 and 2026-09-21 are both in
 * "2026-09" (22 Aug – 21 Sep). With cycleStartDay 1 it is simply the calendar month.
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {number} cycleStartDay 1..28
 * @returns {string} e.g. "2026-09"
 */
export function getCycleKey(dateStr, cycleStartDay = 1) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (cycleStartDay <= 1 || d < cycleStartDay) return dateStr.substring(0, 7);
  return new Date(Date.UTC(y, m, 1)).toISOString().substring(0, 7); // next month (m is 1-based)
}

/**
 * First and last date of a cycle, plus a readable label.
 * @param {string} cycleKey e.g. "2026-09"
 * @param {number} cycleStartDay 1..28
 * @returns {{ from: string, to: string, label: string }} e.g. 2026-08-22, 2026-09-21, "Sep 2026 (22 Aug – 21 Sep)"
 */
export function getCycleRange(cycleKey, cycleStartDay = 1) {
  const [y, m] = cycleKey.split('-').map(Number);
  const iso = (dt) => dt.toISOString().substring(0, 10);
  const name = `${MONTH_NAMES[m - 1]} ${y}`;

  if (cycleStartDay <= 1) {
    return { from: `${cycleKey}-01`, to: iso(new Date(Date.UTC(y, m, 0))), label: name };
  }
  const from = new Date(Date.UTC(y, m - 2, cycleStartDay));
  const to = new Date(Date.UTC(y, m - 1, cycleStartDay - 1));
  return {
    from: iso(from),
    to: iso(to),
    label: `${name} (${from.getUTCDate()} ${MONTH_NAMES[from.getUTCMonth()]} – ${to.getUTCDate()} ${MONTH_NAMES[to.getUTCMonth()]})`
  };
}

/**
 * Checks whether a shift is an office shift (no overtime consideration)
 * @param {Object} shift
 * @returns {boolean}
 */
export function isOfficeShift(shift) {
  if (!shift) return false;
  if (shift.payOvertime === false) return true;
  if (shift.isOffice === true) return true;
  const id = String(shift.id || '').toUpperCase();
  const name = String(shift.name || '').toLowerCase();
  return id === 'OFFICE' || id.includes('OFFICE') || name.includes('office');
}
