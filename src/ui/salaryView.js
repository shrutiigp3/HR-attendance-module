/**
 * Salary Calculation View
 * Salary sheet per salary cycle (e.g. 22nd–21st), with the company's own column headers.
 * Attendance figures are calculated from the punches; salary details are typed straight into the
 * table, and calculated figures can be typed over (clear the box to go back to the calculation).
 */

import { store } from '../data/dataStore.js';
import { modal } from './modalManager.js';
import { paginate, renderPaginationBar } from './pagination.js';
import { renderPreservingFocus } from './renderUtils.js';
import { showToast } from '../utils/toast.js';
import { calculateSalaries, SALARY_TYPES } from '../engine/salaryEngine.js';
import { getCycleRange, getCycleKey } from '../engine/timeUtils.js';
import { exportSalaryReport } from '../utils/exportUtils.js';

let salaryState = {
  cycle: null,   // salary cycle key; null = latest
  search: '',
  page: 1,
  pageSize: 50
};

const money = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const days = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const escapeAttr = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Salary cycles with attendance or salary data, newest first (today's cycle if there is none)
function availableCycles() {
  const keys = new Set((store.calculatedData.presenceSummary || []).map(p => p.month));
  for (const key of Object.keys(store.salary.inputs || {})) keys.add(key);
  if (keys.size === 0) keys.add(getCycleKey(new Date().toISOString().slice(0, 10), store.config.cycleStartDay));
  return [...keys].sort().reverse();
}

// The page opens on the latest cycle with attendance, the same one the Attendance Report shows
function defaultCycle(cycles) {
  const withAttendance = (store.calculatedData.presenceSummary || []).map(p => p.month).sort();
  return withAttendance.length ? withAttendance[withAttendance.length - 1] : cycles[0];
}

function salaryRowsFor(cycleKey) {
  return calculateSalaries({
    cycleKey,
    cycleStartDay: store.config.cycleStartDay,
    workers: store.workers,
    shifts: store.shifts,
    presenceSummary: store.calculatedData.presenceSummary || [],
    monthlyStats: store.calculatedData.monthlyStats || [],
    profiles: store.salary.profiles,
    cycleInputs: store.salary.inputs[cycleKey] || {},
    config: store.salaryConfig,
    holidays: store.holidays
  });
}

/**
 * Columns in the order of the company's salary sheet. kind: 'text' (read-only), 'number'/'string'
 * (typed in), 'choice' (dropdown), 'override' (calculated, can be typed over). field = where a typed
 * value is saved.
 */
const COLUMNS = [
  { header: 'ID', kind: 'id' },
  { header: 'Full Name', kind: 'text', value: r => r.workerName },
  { header: 'Status', kind: 'text', value: r => r.status },
  { header: 'Department', kind: 'text', value: r => r.department },
  { header: 'Sub Department', kind: 'text', value: r => r.subDepartment },
  { header: 'MC / Operation', kind: 'string', field: 'mcOperation', value: r => r.mcOperation, width: 120 },
  { header: 'Salary type', kind: 'choice', field: 'salaryType', value: r => r.salaryType, options: SALARY_TYPES, width: 170 },
  { header: 'Shift Hours', kind: 'number', field: 'shiftHours', typed: (r, p) => p.shiftHours, placeholder: r => r.shiftHours, width: 70 },
  { header: 'daily wage', kind: 'number', field: 'dailyWage', typed: (r, p) => p.dailyWage, placeholder: r => r.calculated.dailyWage, width: 90 },
  { header: 'salary', kind: 'number', field: 'monthlySalary', typed: (r, p) => p.monthlySalary, placeholder: r => (r.dailyWage == null ? '' : r.calculated.salary), width: 100 },
  { header: 'Working Days', kind: 'text', value: r => days(r.workingDays), numeric: true, note: r => (r.holidayDays ? `−${r.holidayDays} holiday${r.holidayDays > 1 ? 's' : ''}` : '') },
  { header: 'Attended Days', kind: 'text', value: r => days(r.attendedDays), numeric: true, note: r => [r.daysPresent > r.attendedDays ? `${days(r.daysPresent)} present` : '', r.attendanceBasis === 'calendar' ? 'by scans' : ''].filter(Boolean).join(', ') },
  { header: 'extra days', kind: 'override', field: 'extraDays', calc: 'extraDays', width: 70, note: r => (r.typeExtraDays ? `incl. +${r.typeExtraDays}` : '') },
  { header: 'other time', kind: 'override', field: 'otherTime', calc: 'otherTime', width: 80, note: r => (r.isOfficeShift ? (r.rawOtMinutes ? 'no office OT' : 'office') : 'hrs') },
  { header: 'Total Leaves', kind: 'text', value: r => days(r.totalLeaves), numeric: true },
  { header: 'Approved Leaves', kind: 'number', field: 'approvedLeaves', typed: (r, p, i) => i.approvedLeaves, width: 70 },
  { header: 'Not App. Leaves', kind: 'text', value: r => days(r.notApprovedLeaves), numeric: true },
  { header: 'Salary (attended) + Extra Days', kind: 'text', value: r => money(r.salaryAttendedPlusExtra), numeric: true },
  { header: 'Other Amount', kind: 'override', field: 'otherAmount', calc: 'otherAmount', width: 90, note: r => {
    if (!r.dailyWage) return '';
    if (r.otherTime < 0 && r.shiftHours) return `÷${r.shiftHours} (₹${(r.dailyWage / r.shiftHours).toFixed(1)}/h)`;
    return !r.isOfficeShift && r.otherTime > 0 && r.otDivisor ? `÷${r.otDivisor} (₹${(r.dailyWage / r.otDivisor).toFixed(1)}/h)` : '';
  } },
  { header: 'Gross Salary', kind: 'text', value: r => money(r.grossSalary), numeric: true, strong: true },
  { header: 'Advance Amount', kind: 'number', field: 'advance', typed: (r, p, i) => i.advance, width: 90 },
  { header: 'Loan Amount', kind: 'number', field: 'loan', typed: (r, p, i) => i.loan, width: 90 },
  { header: 'Memo Amount', kind: 'number', field: 'memo', typed: (r, p, i) => i.memo, width: 80, note: r => (r.attendanceMemo ? `late memos ₹${r.attendanceMemo}` : '') },
  { header: 'PF Deduction', kind: 'number', field: 'pfAmount', typed: (r, p, i) => i.pfAmount, width: 80 },
  { header: 'ES Deduction', kind: 'override', field: 'esiAmount', calc: 'esi', width: 80 },
  { header: 'Prof Tax Deduction', kind: 'number', field: 'ptAmount', typed: (r, p, i) => i.ptAmount, width: 80 },
  { header: 'Net Pay', kind: 'net' },
  { header: 'Location', kind: 'string', field: 'location', value: r => r.location, width: 120 },
  { header: 'Remarks', kind: 'string', field: 'remarks', value: r => r.remarks, width: 160 },
  { header: 'Payroll Remarks', kind: 'string', field: 'payrollRemarks', value: r => r.payrollRemarks, width: 160 }
];

function cellHtml(col, r, profile, input) {
  const inputId = col.field ? `sal-${col.field}-${r.workerId}` : '';
  const common = col.field ? `id="${escapeAttr(inputId)}" class="form-control form-control-sm sal-input" data-worker="${escapeAttr(r.workerId)}" data-field="${col.field}" style="width: ${col.width}px;"` : '';
  const note = col.note ? col.note(r) : '';
  const noteHtml = note ? `<div class="text-xs text-muted">${note}</div>` : '';

  switch (col.kind) {
    case 'id':
      return `<td class="sal-sticky sal-sticky-1"><code>${r.workerId}</code>${r.flags.length ? ` <span title="${escapeAttr(r.flags.join('; '))}">⚠️</span>` : ''}</td>`;
    case 'text':
      return `<td class="${col.numeric ? 'text-right font-mono' : ''} ${col.strong ? 'font-semibold' : ''} ${col.header === 'Full Name' ? 'sal-sticky sal-sticky-2 font-medium' : ''}">${col.value(r) || '<span class="text-muted">—</span>'}${noteHtml}</td>`;
    case 'string':
      return `<td><input type="text" ${common} value="${escapeAttr(col.value(r))}"></td>`;
    case 'choice': {
      const current = col.value(r) || '';
      // A blank entry only while nothing is chosen; a value that isn't one of the choices stays listed so it isn't lost
      const choices = [...(current ? [] : ['']), ...col.options, ...(current && !col.options.includes(current) ? [current] : [])];
      return `<td><select ${common}>${choices.map(v => `<option value="${escapeAttr(v)}" ${v === current ? 'selected' : ''}>${v ? escapeAttr(v) : 'Select…'}</option>`).join('')}</select></td>`;
    }
    case 'number': {
      const typed = col.typed(r, profile, input);
      const placeholder = col.placeholder ? col.placeholder(r) : '';
      return `<td><input type="number" step="any" ${common} value="${escapeAttr(typed)}" placeholder="${escapeAttr(placeholder ?? '')}">${noteHtml}</td>`;
    }
    case 'override': {
      const typed = input[col.field];
      const typedClass = typed != null && typed !== '' ? ' is-typed' : '';
      return `<td><input type="number" step="any" ${common.replace('sal-input"', `sal-input${typedClass}"`)} value="${escapeAttr(typed)}" placeholder="${escapeAttr(r.calculated[col.calc])}"
        title="Calculated: ${escapeAttr(r.calculated[col.calc])}. Type to replace it; clear to go back.">${noteHtml}</td>`;
    }
    case 'net':
      return `<td class="text-right font-mono font-bold text-success">${r.netPay == null ? '<span class="text-muted" title="Enter a daily wage or salary">—</span>' : money(r.netPay)}</td>`;
    default:
      return '<td></td>';
  }
}

function formulaHelpHtml(cfg) {
  const basis = {
    cycleMinusWeeklyOff: 'days in the cycle − the worker\'s weekly offs − holidays (Holiday Calendar; a holiday on a weekly off counts once)',
    cycleDays: 'all days in the cycle − holidays (Holiday Calendar)',
    fixed26: 'fixed 26 days'
  }[cfg.workingDaysBasis];
  const ot = cfg.otRateMultiplier === 0 ? 'not paid' : 'other time × (daily wage ÷ Shift divisor: 8h shift ÷ 6, 10h shift ÷ 7, 12h shift ÷ 9)';
  return `
    <details class="card p-3 mb-3">
      <summary class="font-semibold" style="cursor: pointer;">How each column is calculated</summary>
      <ul class="text-sm text-secondary" style="margin-top: 8px; line-height: 1.7;">
        <li>Type into the boxes. Numbers already showing in a box are <strong>calculated</strong>; type a number to replace one (the box gets an <strong>amber border</strong>), clear it to go back to the calculation.</li>
        <li><strong>Working Days, Attended Days and Total Leaves</strong> come from the attendance (punches) and can't be typed over.</li>
        <li><strong>Working Days</strong> = ${basis}</li>
        <li><strong>Attended Days</strong> = days present in the Attendance Report for this cycle, up to the Working Days (a half day counts as ${cfg.halfDayValue === 1 ? '1' : '½'}, i.e. its Effective Days)</li>
        <li><strong>extra days</strong> = days present beyond the Working Days (shown as "N present" under Attended Days), plus 2 for Salary type "Monthly (+2)"</li>
        <li><strong>other time</strong> = overtime hours in the Attendance Report for this cycle (can be typed over to edit overtime hours and recalculate overtime pay)</li>
        <li><strong>Total Leaves</strong> = working days not attended = <strong>Approved Leaves</strong> + <strong>Not App. Leaves</strong> (leaves are not paid)</li>
        <li><strong>daily wage</strong> = as entered; if only a <strong>salary</strong> is entered: salary ÷ Working Days.
            <strong>salary</strong> = as entered, otherwise daily wage × Working Days</li>
        <li><strong>Salary (attended) + Extra Days</strong> = daily wage × (Attended Days + extra days)</li>
        <li><strong>Other Amount</strong> (overtime pay) = ${ot}. A <strong>negative</strong> other time is deducted at the normal hourly rate: other time × (daily wage ÷ shift hours, e.g. 8h shift ÷ 8)</li>
        <li><strong>Gross Salary</strong> = Salary (attended) + Extra Days + Other Amount</li>
        <li><strong>Advance, Loan, Memo, PF and Prof Tax</strong> are typed in manually (blank = 0). The late memos from attendance are shown under the Memo box for reference.</li>
        <li><strong>ES Deduction</strong> = ₹200 when salary entered is ₹12,000 or more (can be typed over)</li>
        <li><strong>Net Pay</strong> = Gross − (Advance + Loan + Memo + PF + ES + Prof Tax)</li>
      </ul>
    </details>`;
}

export function renderSalaryView(container) {
  const cycles = availableCycles();
  const cycle = cycles.includes(salaryState.cycle) ? salaryState.cycle : defaultCycle(cycles);
  const cycleRange = getCycleRange(cycle, store.config.cycleStartDay);
  const cycleLabel = cycleRange.label;
  const cfg = store.salaryConfig;
  const cycleHolidays = store.holidays.filter(h => h.date >= cycleRange.from && h.date <= cycleRange.to).length;

  const allRows = salaryRowsFor(cycle);
  const q = salaryState.search.trim().toLowerCase();
  const rows = q ? allRows.filter(r => `${r.workerId} ${r.workerName} ${r.department} ${r.subDepartment} ${r.salaryType}`.toLowerCase().includes(q)) : allRows;

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;
  let noWage = 0;
  for (const r of rows) {
    if (r.netPay == null) {
      noWage++;
      continue;
    }
    totalGross += r.grossSalary;
    totalDeductions += r.totalDeductions;
    totalNet += r.netPay;
  }

  const paginationData = paginate(rows, salaryState.page, salaryState.pageSize);
  salaryState.page = paginationData.currentPage;
  const inputs = store.salary.inputs[cycle] || {};

  container.innerHTML = `
    <div class="salary-view animate-fade-in">
      <div class="section-header">
        <div>
          <h2>Salary Calculation</h2>
          <p class="text-secondary text-sm">Salary sheet for the salary cycle. Type salary details straight into the table; attendance figures are calculated from the punches.</p>
        </div>
        <div class="header-action-group">
          <select id="salary-cycle-select" class="form-control" style="width: auto;">
            ${cycles.map(k => `<option value="${k}" ${k === cycle ? 'selected' : ''}>${getCycleRange(k, store.config.cycleStartDay).label}</option>`).join('')}
          </select>
          <button id="btn-salary-settings" class="btn btn-outline btn-sm">Salary Settings</button>
          <button id="btn-salary-export" class="btn btn-primary btn-sm">Export Excel (.xlsx)</button>
        </div>
      </div>

      <div class="quick-summary-strip card mb-4">
        <div class="summary-chip" title="Taken out of Working Days. Add or change them in the Holiday Calendar tab."><span class="chip-label">Holidays in Cycle:</span><span class="chip-value text-amber">${cycleHolidays}</span></div>
        <div class="summary-chip"><span class="chip-label">Workers:</span><span class="chip-value">${rows.length.toLocaleString()}</span></div>
        <div class="summary-chip"><span class="chip-label">Gross Salary:</span><span class="chip-value text-cyan">${money(totalGross)}</span></div>
        <div class="summary-chip"><span class="chip-label">Deductions:</span><span class="chip-value text-danger">${money(totalDeductions)}</span></div>
        <div class="summary-chip"><span class="chip-label">Net Pay:</span><span class="chip-value text-success">${money(totalNet)}</span></div>
        ${noWage ? `<div class="summary-chip" title="Not included in the totals: enter a daily wage or salary"><span class="chip-label">Without Wage (not in totals):</span><span class="chip-value text-amber">${noWage.toLocaleString()}</span></div>` : ''}
      </div>

      ${formulaHelpHtml(cfg)}

      <div class="card p-3 mb-3">
        <div class="filter-item">
          <label for="salary-search">Search</label>
          <input type="text" id="salary-search" class="form-control" placeholder="Search by ID, name, department, salary type..." value="${escapeAttr(salaryState.search)}">
        </div>
      </div>

      <div id="salary-pagination-top" class="mb-2"></div>

      <div class="table-responsive card">
        <table class="data-table" id="salary-table" style="white-space: nowrap;">
          <thead>
            <tr>${COLUMNS.map((c, i) => `<th class="${i === 0 ? 'sal-sticky sal-sticky-1' : i === 1 ? 'sal-sticky sal-sticky-2' : ''}">${c.header}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${paginationData.pageItems.length === 0 ? `
              <tr><td colspan="${COLUMNS.length}" class="text-center py-8 text-muted">No workers in this cycle.</td></tr>
            ` : paginationData.pageItems.map(r => {
              const key = String(r.workerId).toLowerCase();
              const profile = store.salary.profiles[key] || {};
              const input = inputs[key] || {};
              return `<tr>${COLUMNS.map(c => cellHtml(c, r, profile, input)).join('')}</tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div id="salary-pagination-bottom" class="mt-3"></div>
    </div>
  `;

  const paginationConfig = {
    currentPage: paginationData.currentPage,
    totalPages: paginationData.totalPages,
    totalItems: paginationData.totalItems,
    startIndex: paginationData.startIndex,
    endIndex: paginationData.endIndex,
    pageSize: paginationData.pageSize,
    onPageChange: (newPage) => {
      salaryState.page = newPage;
      renderSalaryView(container);
    },
    onPageSizeChange: (newSize) => {
      salaryState.pageSize = newSize;
      salaryState.page = 1;
      renderSalaryView(container);
    }
  };
  renderPaginationBar({ container: container.querySelector('#salary-pagination-top'), ...paginationConfig });
  renderPaginationBar({ container: container.querySelector('#salary-pagination-bottom'), ...paginationConfig });

  container.querySelector('#salary-cycle-select')?.addEventListener('change', (e) => {
    salaryState.cycle = e.target.value;
    salaryState.page = 1;
    renderSalaryView(container);
  });

  let searchTimer;
  container.querySelector('#salary-search')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      salaryState.search = e.target.value;
      salaryState.page = 1;
      renderPreservingFocus(() => renderSalaryView(container));
    }, 200);
  });

  // A typed value is saved when the box loses focus or Enter is pressed. The redraw waits a tick so
  // Tab has already moved to the next box, which keeps the focus there.
  container.querySelector('#salary-table')?.addEventListener('change', (e) => {
    const box = e.target.closest('.sal-input');
    if (!box) return;
    const raw = box.value.trim();
    const value = box.type === 'number' ? (raw === '' ? '' : Number(raw)) : raw;
    store.setSalaryValue(box.dataset.worker, cycle, box.dataset.field, value);
    setTimeout(() => renderPreservingFocus(() => renderSalaryView(container)), 0);
  });

  container.querySelector('#btn-salary-settings')?.addEventListener('click', () => openSalarySettingsModal());
  container.querySelector('#btn-salary-export')?.addEventListener('click', () => exportSalaryReport(rows, cycleLabel, 'xlsx'));
}

function openSalarySettingsModal() {
  const cfg = store.salaryConfig;
  const option = (value, current, text) => `<option value="${value}" ${String(value) === String(current) ? 'selected' : ''}>${text}</option>`;
  modal.open({
    title: 'Salary Settings',
    size: 'md',
    contentHtml: `
      <form id="salary-settings-form" class="modal-form">
        <div class="form-group">
          <label for="ss-working-days">Working Days</label>
          <select id="ss-working-days" class="form-control">
            ${option('cycleMinusWeeklyOff', cfg.workingDaysBasis, 'Days in the cycle minus weekly offs and holidays')}
            ${option('cycleDays', cfg.workingDaysBasis, 'All days in the cycle minus holidays')}
            ${option('fixed26', cfg.workingDaysBasis, 'Fixed 26 days')}
          </select>
        </div>
        <div class="form-group">
          <label for="ss-half-day">A half day counts as</label>
          <select id="ss-half-day" class="form-control">
            ${option(0.5, cfg.halfDayValue, '½ day')}
            ${option(1, cfg.halfDayValue, '1 full day')}
          </select>
        </div>
        <div class="form-group">
          <label for="ss-ot">Other Amount (overtime pay; shift divisor: 8h ÷ 6, 10h ÷ 7, 12h ÷ 9)</label>
          <select id="ss-ot" class="form-control">
            ${option(1, cfg.otRateMultiplier !== 0 && cfg.otRateMultiplier !== 2 ? 1 : cfg.otRateMultiplier, 'Standard Shift Formula (8h ÷ 6, 10h ÷ 7, 12h ÷ 9)')}
            ${option(0, cfg.otRateMultiplier, 'Not paid (0)')}
            ${option(2, cfg.otRateMultiplier, 'Double rate (2×)')}
          </select>
        </div>
        <div class="form-actions mt-4">
          <button type="button" class="btn btn-secondary" id="btn-cancel-salary-settings">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Settings</button>
        </div>
      </form>
    `
  });

  document.getElementById('btn-cancel-salary-settings')?.addEventListener('click', () => modal.close());
  document.getElementById('salary-settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = (id) => document.getElementById(id).value;
    store.updateSalaryConfig({
      workingDaysBasis: value('ss-working-days'),
      halfDayValue: parseFloat(value('ss-half-day')),
      otRateMultiplier: parseFloat(value('ss-ot')),
      applyPt: false
    });
    modal.close();
    showToast('Salary settings saved');
  });
}
