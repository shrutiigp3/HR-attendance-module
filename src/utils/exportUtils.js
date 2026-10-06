/**
 * Export calculated attendance reports and monthly summaries to Excel & CSV
 */

import * as XLSX from 'xlsx';

/**
 * Exports detailed Attendance Report matching Section 11 Table Format
 * 
 * | Date | Worker | Shift | IN | OUT | Shift Hours | Actual Hours | Late | Grace | Half Day | Memo | OT |
 * 
 * @param {Array} records 
 * @param {string} format 'xlsx' | 'csv'
 * @param {string} filename 
 * @param {Array} daysPresent presenceSummary rows; added as a "Days_Present" sheet (xlsx only)
 */
export function exportAttendanceReport(records, format = 'xlsx', filename = 'Attendance_Calculation_Report', daysPresent = []) {
  const exportRows = records.map(r => ({
    'Date': r.date,
    'Salary Cycle': r.cycleLabel,
    'Worker ID': r.workerId,
    'Worker Name': r.workerName,
    'Department': r.department,
    'Shift': r.shiftName,
    'Shift Start': r.shiftStart,
    'Shift End': r.isFlexible ? '—' : r.shiftEnd + (r.isOvernight ? ' (+1d)' : ''),
    'Actual IN': r.actualIn,
    'Actual OUT': r.actualOut + (r.isOvernight && r.actualOut !== '--:--' ? ' (+1d)' : ''),
    'Shift Hours': r.scheduledHoursFormatted,
    'Actual Hours': r.actualWorkingHoursFormatted,
    'Late (Mins)': r.lateMinutes > 0 ? `${r.lateMinutes} mins` : '0m',
    'Grace Status': r.graceStatus,
    'Half Day': r.isHalfDay ? 'YES' : 'NO',
    'Memo Status': r.memoStatus,
    'Memo Amount (₹)': r.memoAmount,
    'OT (Hours)': r.otMinutes > 0 ? r.otHoursFormatted : '0m',
    'Early Departure': r.isEarlyDeparture ? `${r.earlyDepartureMinutes}m` : '0m',
    'Anomalies / Flags': r.flags.join('; ')
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance_Report');
  if (format !== 'csv' && daysPresent.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toDaysPresentRows(daysPresent)), 'Days_Present');
  }

  const fileExt = format === 'csv' ? 'csv' : 'xlsx';
  const fullFilename = `${filename}_${new Date().toISOString().split('T')[0]}.${fileExt}`;

  if (format === 'csv') {
    XLSX.writeFile(wb, fullFilename, { bookType: 'csv' });
  } else {
    XLSX.writeFile(wb, fullFilename);
  }
}

function toDaysPresentRows(rows) {
  return rows.map(p => ({
    'Salary Cycle': p.cycleLabel,
    'Cycle From': p.cycleFrom,
    'Cycle To': p.cycleTo,
    'Worker ID': p.workerId,
    'Worker Name': p.workerName,
    'Department': p.department,
    'Shift': p.shiftName || (p.shiftId ? `${p.shiftId} (not defined)` : 'Unassigned'),
    'Days Present': p.daysPresent,
    'Half Days': p.basis === 'shift' ? p.halfDays : '',
    'Effective Days (Half Day = 0.5)': p.effectiveDays,
    'Days With Missing Punch': p.missingPunchDays ?? '',
    'Total OT Hours': p.totalOtHoursFormatted || '0m',
    'Total OT Hours (Decimal)': p.totalOtHoursDecimal ? Number(p.totalOtHoursDecimal) : 0,
    'Counted By': p.basis === 'shift' ? 'Shift duties' : 'Calendar days with scans (shift not defined)'
  }));
}

/**
 * Exports days present per worker per salary cycle (e.g. 22nd–21st)
 * @param {Array} rows presenceSummary rows
 * @param {string} format 'xlsx' | 'csv'
 */
export function exportDaysPresentReport(rows, format = 'xlsx') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toDaysPresentRows(rows)), 'Days_Present');
  const fileExt = format === 'csv' ? 'csv' : 'xlsx';
  const filename = `Days_Present_Report_${new Date().toISOString().split('T')[0]}.${fileExt}`;
  XLSX.writeFile(wb, filename, format === 'csv' ? { bookType: 'csv' } : undefined);
}

/**
 * Exports Monthly Worker Late Allowance & Memo Summary
 * @param {Array} monthlyStats 
 * @param {string} format 'xlsx' | 'csv'
 */
export function exportMonthlyMemoReport(monthlyStats, format = 'xlsx') {
  const exportRows = monthlyStats.map(s => ({
    'Salary Cycle': s.cycleLabel,
    'Cycle From': s.cycleFrom,
    'Cycle To': s.cycleTo,
    'Worker ID': s.workerId,
    'Worker Name': s.workerName,
    'Department': s.department,
    'Grace Period Arrivals': s.graceArrivalsCount,
    'Late Occurrences After Grace': s.lateOccurrencesCount,
    'Allowed Late Occurrences': s.allowedLateOccurrences,
    'Late Occurrences Used': s.lateOccurrencesUsed,
    'Remaining Late Allowance': s.remainingLateAllowance,
    'Memo Count': s.memoCount,
    'Total Memo Amount (₹)': s.totalMemoAmount,
    'Total Working Hours': (s.totalWorkingMinutes / 60).toFixed(1) + ' hrs',
    'Total OT Hours': (s.totalOtMinutes / 60).toFixed(1) + ' hrs',
    'Half-Day Count': s.halfDayCount
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Monthly_Late_Memo_Summary');

  const fileExt = format === 'csv' ? 'csv' : 'xlsx';
  const filename = `Monthly_Late_Memo_Report_${new Date().toISOString().split('T')[0]}.${fileExt}`;

  if (format === 'csv') {
    XLSX.writeFile(wb, filename, { bookType: 'csv' });
  } else {
    XLSX.writeFile(wb, filename);
  }
}

/**
 * Exports the salary sheet for one salary cycle (sheet name and file name carry the cycle)
 * @param {Array} rows calculateSalaries() rows
 * @param {string} cycleLabel e.g. "Sep 2026 (22 Aug – 21 Sep)"
 * @param {string} format 'xlsx' | 'csv'
 */
export function exportSalaryReport(rows, cycleLabel, format = 'xlsx') {
  // Same column names and order as the company's salary sheet
  const exportRows = rows.map(r => ({
    'ID': r.workerId,
    'Full Name': r.workerName,
    'Status': r.status,
    'Department': r.department,
    'Sub Department': r.subDepartment,
    'MC / Operation': r.mcOperation,
    'Salary type': r.salaryType,
    'Shift Hours': r.shiftHours ?? '',
    'daily wage': r.dailyWage ?? '',
    'salary': r.dailyWage == null ? '' : r.salary,
    'Working Days': r.workingDays,
    'Attended Days': r.attendedDays,
    'extra days': r.extraDays,
    'other time': r.otherTime,
    'Total Leaves': r.totalLeaves,
    'Approved Leaves': r.approvedLeaves,
    'Not App. Leaves': r.notApprovedLeaves,
    'Salary (attended) + Extra Days': r.salaryAttendedPlusExtra,
    'Other Amount': r.otherAmount,
    'Gross Salary': r.grossSalary,
    'Advance Amount': r.advance,
    'Loan Amount': r.loan,
    'Memo Amount': r.memo,
    'PF Deduction': r.pf,
    'ES Deduction': r.esi,
    'Prof Tax Deduction': r.professionalTax,
    'Net Pay': r.netPay ?? '',
    'Location': r.location,
    'Remarks': r.remarks,
    'Payroll Remarks': r.payrollRemarks
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows), 'Salary');
  const safeCycle = String(cycleLabel).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const fileExt = format === 'csv' ? 'csv' : 'xlsx';
  XLSX.writeFile(wb, `Salary_${safeCycle}.${fileExt}`, format === 'csv' ? { bookType: 'csv' } : undefined);
}
