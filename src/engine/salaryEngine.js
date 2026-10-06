/**
 * Salary Calculation Engine
 *
 * Pure functions, decoupled from UI and storage: combines the attendance results for one salary
 * cycle (days present, half days, overtime) with the salary details typed into the salary sheet
 * (salary type, daily wage or salary, approved leaves, advance, loan, memo, PF, ES, overrides).
 */

import { getCycleRange, getDayOfWeek, addDays, parseTimeToMinutes, isOfficeShift } from './timeUtils.js';

export const DEFAULT_SALARY_CONFIG = {
  workingDaysBasis: 'cycleMinusWeeklyOff', // 'cycleMinusWeeklyOff' | 'cycleDays' | 'fixed26'
  halfDayValue: 0.5,                        // how much of an attended day a half day counts as
  otRateMultiplier: 1.5,                    // Other Amount (OT pay) = other time × (daily wage ÷ shift hours) × this; 0 = not paid
  applyPt: false,
  ptThreshold: 12000,                       // professional tax threshold kept for backward compatibility
  ptAmount: 200,
  applyEs: true,
  esThreshold: 12000,                       // ES deduction applied when the salary column is 12,000 or more
  esAmount: 200
};

// Salary sheet fields kept for the worker in every cycle; all other fields belong to one cycle
export const SALARY_PROFILE_FIELDS = ['salaryType', 'shiftHours', 'dailyWage', 'monthlySalary', 'mcOperation', 'location'];

// Choices in the Salary type dropdown
export const SALARY_TYPES = ['Daily', 'Monthly (No Extra)', 'Monthly (+2)'];

/**
 * Salary type in the dropdown's spelling: "daily" -> "Daily", "Monthly + 2" -> "Monthly (+2)",
 * "monthly (no extra)" -> "Monthly (No Extra)". Any other value (e.g. plain "Monthly") is kept as it is.
 */
export function normalizeSalaryType(value) {
  const text = String(value ?? '').trim();
  if (/^daily$/i.test(text)) return 'Daily';
  const plus = text.match(/^monthly\s*\(?\s*\+\s*(\d+(?:\.\d+)?)\s*\)?$/i);
  if (plus) return `Monthly (+${plus[1]})`;
  if (/^monthly\s*\(\s*no\s*extra\s*\)$/i.test(text)) return 'Monthly (No Extra)';
  return text;
}

/**
 * Overtime hourly wage divisor based on scheduled shift hours:
 * - 8h shift: divide by 6
 * - 10h shift: divide by 7
 * - 12h shift: divide by 9
 * @param {number} shiftHours
 * @returns {number}
 */
export function getOtDivisor(shiftHours) {
  const h = Number(shiftHours);
  if (!h || h <= 0) return 6;
  if (Math.abs(h - 8) <= 0.5) return 6;
  if (Math.abs(h - 10) <= 0.5) return 7;
  if (Math.abs(h - 12) <= 0.5) return 9;
  if (h < 9) return 6;
  if (h < 11) return 7;
  return 9;
}

const lower = (id) => String(id).toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : null);
const round2 = (n) => Math.round(n * 100) / 100;

function datesInRange(from, to) {
  const dates = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}

function shiftLengthHours(shift) {
  if (!shift) return null;
  if (shift.isFlexible) return num(shift.workingHours);
  const start = parseTimeToMinutes(shift.startTime);
  const end = parseTimeToMinutes(shift.endTime);
  const minutes = end > start ? end - start : 1440 - start + end;
  return minutes > 0 ? minutes / 60 : null;
}

/**
 * Working days in the cycle and how many holidays were taken out. A holiday on the worker's
 * weekly off is only counted once (as the weekly off). The fixed-26 basis ignores holidays.
 */
function workingDaysFor(basis, cycleDates, isWeeklyOff, holidayDates) {
  if (basis === 'fixed26') return { workingDays: 26, holidayDays: 0 };
  const counted = basis === 'cycleDays' ? cycleDates : cycleDates.filter(d => !isWeeklyOff(d));
  const holidayDays = counted.filter(d => holidayDates.has(d)).length;
  return { workingDays: counted.length - holidayDays, holidayDays };
}

/**
 * Salary rows for one salary cycle: every active worker, plus anyone else with salary details or
 * attendance in the cycle. Amounts are rounded to whole rupees. Columns follow the company's
 * salary sheet; values marked (override) are calculated but replaced by a typed value when given.
 *
 * Working Days            = per settings (default: days in the cycle − weekly offs − holidays)
 * days present            = from attendance, a half day counting as halfDayValue
 *                           (the Attendance Report's Effective Days with the default ½)
 * Attended Days           = days present, up to the working days
 * extra days              = days present beyond the working days, + N for a type like "Monthly (+N)" (override)
 * other time              = overtime hours from attendance (sum of the cycle's OT)             (override)
 * Total Leaves            = working days not attended = Approved Leaves + Not App. Leaves (leaves are not paid)
 * daily wage              = typed; if only a salary is typed: salary ÷ Working Days
 * salary                  = typed salary, or round(daily wage × Working Days)
 * Salary (attended) + Extra Days = round(daily wage × (Attended Days + extra days))
 * Other Amount            = other time × (daily wage ÷ Shift Hours) × otRateMultiplier         (override)
 *                           (a negative other time = other time × (daily wage ÷ shift hours), deducted from gross)
 * Gross Salary            = Salary (attended) + Extra Days + Other Amount
 * Advance / Loan / Memo / PF / Prof Tax = typed in manually (the attendance's late memos are given for reference)
 * ES Deduction            = ₹200 when salary ≥ ₹12,000                                          (override)
 * Net Pay                 = Gross − (Advance + Loan + Memo + PF + ES + Prof Tax); null without a wage
 */
export function calculateSalaries({
  cycleKey, cycleStartDay, workers = [], shifts = [], presenceSummary = [], monthlyStats = [],
  profiles = {}, cycleInputs = {}, config = {}, holidays = []
}) {
  const cfg = { ...DEFAULT_SALARY_CONFIG, ...config };
  const range = getCycleRange(cycleKey, cycleStartDay);
  const cycleDates = datesInRange(range.from, range.to);
  const shiftMap = new Map(shifts.map(s => [s.id, s]));
  const holidayDates = new Set(holidays.map(h => (typeof h === 'string' ? h : h.date)).filter(d => d >= range.from && d <= range.to));
  const presenceByWorker = new Map(presenceSummary.filter(p => p.month === cycleKey).map(p => [lower(p.workerId), p]));
  const statsByWorker = new Map(monthlyStats.filter(s => s.month === cycleKey).map(s => [lower(s.workerId), s]));

  const included = workers.filter(w => {
    const key = lower(w.id);
    return w.isActive !== false || profiles[key] || cycleInputs[key] || presenceByWorker.has(key);
  });

  return included.map(worker => {
    const key = lower(worker.id);
    const profile = profiles[key] || {};
    const input = cycleInputs[key] || {};
    const presence = presenceByWorker.get(key);
    const stats = statsByWorker.get(key);
    const shift = shiftMap.get(worker.shiftId);
    const salaryType = normalizeSalaryType(profile.salaryType);
    const flags = [];

    // Days (calculated from attendance and the holiday calendar; each can be typed over)
    const offDays = String(worker.weeklyOff || shift?.weeklyOff || '').split(',').map(d => d.trim().toLowerCase());
    const isWeeklyOff = (d) => offDays.includes(getDayOfWeek(d).toLowerCase());
    const { workingDays: calcWorkingDays, holidayDays } = workingDaysFor(cfg.workingDaysBasis, cycleDates, isWeeklyOff, holidayDates);
    // Working Days and Attended Days come from attendance only (not typed over)
    const workingDays = calcWorkingDays;
    const daysPresent = presence ? presence.daysPresent - presence.halfDays * (1 - cfg.halfDayValue) : 0;
    // Days present beyond the working days (weekly offs or holidays worked) are extra days, not attended days
    const attendedDays = Math.min(daysPresent, workingDays);
    // A salary type like "Monthly (+2)" adds that many extra days
    const typeExtraDays = Number(`${salaryType} ${profile.salarySubType || ''}`.match(/\+\s*(\d+(?:\.\d+)?)/)?.[1] || 0);
    const calcExtraDays = Math.max(0, daysPresent - workingDays) + typeExtraDays;
    const extraDays = num(input.extraDays) ?? calcExtraDays;
    const totalLeaves = Math.max(0, workingDays - attendedDays);
    const approvedLeaves = Math.min(num(input.approvedLeaves) ?? 0, totalLeaves);
    const notApprovedLeaves = totalLeaves - approvedLeaves;

    // Rates
    const typedSalary = num(profile.monthlySalary);
    const typedDailyWage = num(profile.dailyWage);
    let dailyWage = null;
    if (typedDailyWage != null) dailyWage = typedDailyWage;
    else if (typedSalary != null && workingDays > 0) dailyWage = typedSalary / workingDays;
    const hasWage = dailyWage != null;
    if (!hasWage) flags.push('No daily wage or salary entered');
    const wage = dailyWage ?? 0;
    const calcSalary = Math.round(wage * workingDays);
    const salary = typedSalary ?? calcSalary;
    const shiftHours = num(profile.shiftHours) ?? num(worker.dutyHours) ?? shiftLengthHours(shift);
    const otDivisor = shiftHours ? getOtDivisor(shiftHours) : null;

    // Earnings
    const salaryAttendedPlusExtra = Math.round(wage * (attendedDays + extraDays));
    const isOffice = isOfficeShift(shift);
    const rawOtMinutes = stats?.totalOtMinutes || 0;
    // Office staff do not receive overtime in salary calculations
    const calcOtherTime = isOffice ? 0 : round2(rawOtMinutes / 60);
    const otherTime = num(input.otherTime) ?? calcOtherTime;
    let calcOtherAmount = 0;
    if (otherTime < 0) {
      // A negative other time (typed in) is deducted at the plain hourly rate (daily wage ÷ shift hours),
      // not the overtime divisor, which reduces the gross salary
      if (shiftHours) calcOtherAmount = -Math.round((-otherTime * wage) / shiftHours);
      else flags.push('No shift hours, so negative other time is not deducted');
    } else if (otherTime > 0) {
      if (otDivisor) {
        if (cfg.otRateMultiplier === 0) {
          calcOtherAmount = 0;
        } else {
          const mult = cfg.otRateMultiplier === 2 ? 2 : 1;
          calcOtherAmount = Math.round((otherTime * wage * mult) / otDivisor);
        }
      } else {
        flags.push('No shift hours, so overtime is not paid');
      }
    }
    const otherAmount = num(input.otherAmount) ?? calcOtherAmount;
    const grossSalary = salaryAttendedPlusExtra + otherAmount;

    // Deductions: Advance, Loan, Memo, PF and Prof Tax are typed in manually; ES is 200 when salary ≥ 12,000 (override)
    const advance = num(input.advance) ?? 0;
    const loan = num(input.loan) ?? 0;
    const memo = num(input.memo) ?? 0;
    const pf = num(input.pfAmount) ?? 0;
    const professionalTax = num(input.ptAmount) ?? 0;
    const calcEsi = (cfg.applyEs !== false && salary >= (cfg.esThreshold ?? 12000)) ? (cfg.esAmount ?? 200) : 0;
    const esi = num(input.esiAmount) ?? calcEsi;
    const totalDeductions = advance + loan + memo + pf + esi + professionalTax;

    return {
      workerId: worker.id,
      workerName: worker.name,
      status: worker.isActive === false ? 'Inactive' : 'Active',
      department: worker.department,
      subDepartment: worker.subDepartment || '',
      mcOperation: profile.mcOperation ?? worker.designation ?? '',
      cycleKey,
      cycleLabel: range.label,
      salaryType,
      shiftHours,
      otDivisor,
      dailyWage: hasWage ? round2(dailyWage) : null,
      salary,
      workingDays,
      holidayDays,
      daysPresent,
      attendedDays,
      extraDays,
      typeExtraDays,
      otherTime,
      isOfficeShift: isOffice,
      rawOtMinutes,
      totalLeaves,
      approvedLeaves,
      notApprovedLeaves,
      salaryAttendedPlusExtra,
      otherAmount,
      grossSalary,
      advance,
      loan,
      memo,
      attendanceMemo: stats?.totalMemoAmount || 0,  // late memos from attendance, for reference
      pf,
      esi,
      professionalTax,
      totalDeductions,
      // Without a wage there is nothing to pay, so net pay is left blank rather than negative
      netPay: hasWage ? grossSalary - totalDeductions : null,
      location: profile.location || '',
      remarks: input.remarks || '',
      payrollRemarks: input.payrollRemarks || '',
      // Calculated values, shown when nothing has been typed over them
      calculated: {
        dailyWage: hasWage ? round2(dailyWage) : null,
        salary: calcSalary,
        workingDays: calcWorkingDays,
        attendedDays,
        extraDays: calcExtraDays,
        otherTime: calcOtherTime,
        otherAmount: calcOtherAmount,
        esi: calcEsi,
        professionalTax: 0
      },
      attendanceBasis: presence?.basis || 'none',
      flags
    };
  }).sort((a, b) => String(a.workerId).localeCompare(String(b.workerId), undefined, { numeric: true }));
}
