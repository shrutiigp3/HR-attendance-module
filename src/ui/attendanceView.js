/**
 * Detailed Attendance Report View (Section 11)
 * 
 * | Date | Worker | Shift | IN | OUT | Shift Hours | Actual Hours | Late | Grace | Half Day | Memo | OT |
 */

import { store } from '../data/dataStore.js';
import { exportAttendanceReport, exportDaysPresentReport } from '../utils/exportUtils.js';
import { shiftNameFromId } from '../utils/excelUtils.js';
import { modal } from './modalManager.js';
import { paginate, renderPaginationBar } from './pagination.js';

let attState = {
  view: 'daily',        // 'daily' records or 'present' (days present per salary cycle)
  page: 1,
  pageSize: 50,
  cycle: null,          // salary cycle key for the Days Present view; null = latest, 'ALL' = every cycle
  presentPage: 1,
  presentPageSize: 50
};

// Switches between the daily records and the days-present summary
function viewToggleHtml() {
  const button = (view, label) =>
    `<button class="btn btn-sm ${attState.view === view ? 'btn-primary' : 'btn-secondary'} btn-att-view" data-att-view="${view}">${label}</button>`;
  return `<div class="flex items-center mb-3" style="gap: 8px;">
    ${button('daily', 'Daily Records')}
    ${button('present', 'Days Present (Salary Cycle)')}
  </div>`;
}

function attachViewToggle(container) {
  container.querySelectorAll('.btn-att-view').forEach(btn => btn.addEventListener('click', () => {
    attState.view = btn.getAttribute('data-att-view');
    renderAttendanceReport(container);
  }));
}

// Search box shared by both views (it drives the global store search filter)
function attachSearch(container) {
  const searchInput = container.querySelector('#attendance-search-input');
  let searchTimer;
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      attState.page = 1;
      attState.presentPage = 1;
      store.setFilters({ search: e.target.value });
    }, 250);
  });
}

export function renderAttendanceReport(container) {
  if (attState.view === 'present') {
    renderDaysPresent(container);
    return;
  }

  const records = store.getFilteredRecords();
  const paginationData = paginate(records, attState.page, attState.pageSize);
  attState.page = paginationData.currentPage;

  // Compute summary metrics efficiently
  let actualWorkMinutes = 0;
  let otMinutes = 0;
  let memoAmount = 0;
  let memoCount = 0;
  let halfDayCount = 0;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    actualWorkMinutes += r.actualWorkingMinutes;
    otMinutes += r.otMinutes;
    if (r.memoAmount > 0) memoAmount += r.memoAmount;
    if (r.memoCount > 0) memoCount += r.memoCount;
    if (r.isHalfDay) halfDayCount++;
  }

  container.innerHTML = `
    <div class="attendance-view animate-fade-in">
      <div class="section-header">
        <div>
          <h2>Daily Working Hours & Overtime Attendance Report</h2>
          <p class="text-secondary text-sm">Processed calculation records for each worker and shift date with full grace, memo, half-day, and overtime breakdown.</p>
        </div>

        <div class="header-action-group">
          <div class="search-box">
            <input type="text" id="attendance-search-input" class="form-control" placeholder="Search worker, dept, date..." value="${store.filters.search}">
          </div>

          <div class="dropdown-export">
            <button id="btn-export-excel" class="btn btn-primary btn-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Export Excel (.xlsx)
            </button>
            <button id="btn-export-csv" class="btn btn-secondary btn-sm">
              Export CSV
            </button>
          </div>
        </div>
      </div>

      ${viewToggleHtml()}

      <!-- Quick Summary Strip -->
      <div class="quick-summary-strip card mb-4">
        <div class="summary-chip">
          <span class="chip-label">Filtered Records:</span>
          <span class="chip-value">${records.length.toLocaleString()}</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">Total Actual Hours:</span>
          <span class="chip-value text-cyan">${(actualWorkMinutes / 60).toFixed(1)} hrs</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">Total OT Hours:</span>
          <span class="chip-value text-purple">${(otMinutes / 60).toFixed(1)} hrs</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">Total Memos Issued:</span>
          <span class="chip-value text-danger">₹${memoAmount.toLocaleString()} (${memoCount})</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">Half-Day Cases:</span>
          <span class="chip-value text-orange">${halfDayCount.toLocaleString()}</span>
        </div>
      </div>

      <!-- Top Pagination Bar -->
      <div id="att-pagination-top" class="mb-2"></div>

      <!-- Attendance Table -->
      <div class="table-responsive card">
        <table class="data-table" id="attendance-main-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Worker</th>
              <th>Shift</th>
              <th>IN</th>
              <th>OUT</th>
              <th class="text-right">Shift Hours</th>
              <th class="text-right">Actual Hours</th>
              <th>Late</th>
              <th>Grace Status</th>
              <th>Half Day</th>
              <th>Memo Status</th>
              <th class="text-right">OT</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${paginationData.pageItems.length === 0 ? `
              <tr>
                <td colspan="13" class="text-center py-8 text-muted">
                  No attendance records found matching current filters.
                </td>
              </tr>
            ` : paginationData.pageItems.map(r => {
              // Grace badge
              let graceBadge = '';
              if (r.isFlexible) {
                graceBadge = `<span class="badge badge-neutral">Flexible</span>`;
              } else if (r.graceStatus === 'On Time') {
                graceBadge = `<span class="badge badge-success">On Time</span>`;
              } else if (r.graceStatus === 'Within Grace') {
                graceBadge = `<span class="badge badge-teal">Grace (${r.lateMinutes}m)</span>`;
              } else {
                graceBadge = `<span class="badge badge-amber">Beyond Grace</span>`;
              }

              // Late badge
              const lateBadge = r.lateMinutes > 0 
                ? `<span class="text-amber font-medium">${r.lateMinutes} min</span>`
                : `<span class="text-muted">0m</span>`;

              // Half-Day badge
              const halfDayBadge = r.isHalfDay 
                ? `<span class="badge badge-orange font-semibold">Half Day</span>`
                : `<span class="text-muted text-xs">Full Day</span>`;

              // Memo badge
              let memoBadge = `<span class="text-muted text-xs">None</span>`;
              if (r.memoAmount > 0) {
                memoBadge = `<span class="badge badge-danger font-semibold">₹${r.memoAmount} Memo</span>`;
              } else if (r.isLateOccurrence) {
                memoBadge = `<span class="badge badge-neutral text-xs">Late #${r.lateOccurrenceIndex} (No Memo)</span>`;
              } else if (r.isHalfDay) {
                memoBadge = `<span class="badge badge-neutral text-xs">No Memo (Half Day)</span>`;
              }

              // Overtime badge
              const otBadge = r.otMinutes > 0
                ? `<span class="badge badge-purple font-semibold">${r.otHoursFormatted}</span>`
                : `<span class="text-muted">0m</span>`;

              // Overnight shift badge
              const overnightTag = r.isOvernight 
                ? `<span class="tag-overnight" title="Overnight Shift: Spans Midnight">🌙 Night</span>` 
                : '';

              // Flags summary
              const hasFlags = r.flags && r.flags.length > 0;
              const flagIcons = hasFlags 
                ? `<span class="flag-indicator" title="${r.flags.join(', ')}">⚠️</span>` 
                : '';

              return `
                <tr class="${r.memoAmount > 0 ? 'row-memo' : ''} ${r.isHalfDay ? 'row-halfday' : ''}">
                  <td>
                    <div class="font-medium">${r.date}</div>
                    <div class="text-muted text-xs">${r.dayOfWeek}</div>
                  </td>
                  <td>
                    <div class="font-medium">${r.workerName} ${flagIcons}</div>
                    <div class="text-xs text-muted"><code>${r.workerId}</code> • ${r.department}</div>
                  </td>
                  <td>
                    <div class="font-medium">${r.shiftName} ${overnightTag}</div>
                    <div class="text-xs text-muted">${r.shiftWindow}</div>
                  </td>
                  <td>
                    <div class="font-mono ${r.lateMinutes > 0 ? (r.isGrace ? 'text-teal' : 'text-amber font-semibold') : 'text-success'}">
                      ${r.actualIn}
                    </div>
                  </td>
                  <td>
                    <div class="font-mono ${r.otMinutes > 0 ? 'text-purple font-semibold' : ''}">
                      ${r.actualOut}
                      ${r.isOvernight && r.actualOut !== '--:--' ? '<span class="text-xs text-muted">(+1d)</span>' : ''}
                    </div>
                  </td>
                  <td class="text-right font-mono">${r.scheduledHoursFormatted}</td>
                  <td class="text-right font-mono font-medium">${r.actualWorkingHoursFormatted}</td>
                  <td>${lateBadge}</td>
                  <td>${graceBadge}</td>
                  <td>${halfDayBadge}</td>
                  <td>${memoBadge}</td>
                  <td class="text-right">${otBadge}</td>
                  <td>
                    <button class="btn btn-icon btn-sm btn-audit" data-record-id="${r.id}" title="View Calculation Audit Trail">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      Audit
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Bottom Pagination Bar -->
      <div id="att-pagination-bottom" class="mt-3"></div>
    </div>
  `;

  // Render pagination
  const paginationConfig = {
    currentPage: paginationData.currentPage,
    totalPages: paginationData.totalPages,
    totalItems: paginationData.totalItems,
    startIndex: paginationData.startIndex,
    endIndex: paginationData.endIndex,
    pageSize: paginationData.pageSize,
    onPageChange: (newPage) => {
      attState.page = newPage;
      renderAttendanceReport(container);
    },
    onPageSizeChange: (newSize) => {
      attState.pageSize = newSize;
      attState.page = 1;
      renderAttendanceReport(container);
    }
  };

  renderPaginationBar({ container: container.querySelector('#att-pagination-top'), ...paginationConfig });
  renderPaginationBar({ container: container.querySelector('#att-pagination-bottom'), ...paginationConfig });

  attachViewToggle(container);
  attachSearch(container);

  document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    // The Excel file also gets a Days_Present sheet for the workers and cycles being exported
    const exported = new Set(records.map(r => `${r.workerId}_${r.month}`));
    const daysPresent = (store.calculatedData.presenceSummary || []).filter(p => exported.has(`${p.workerId}_${p.month}`));
    exportAttendanceReport(records, 'xlsx', undefined, daysPresent);
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    exportAttendanceReport(records, 'csv');
  });

  // Table Event Delegation for Audit Trail
  const table = container.querySelector('#attendance-main-table');
  table?.addEventListener('click', (e) => {
    const auditBtn = e.target.closest('.btn-audit');
    if (auditBtn) {
      const recordId = auditBtn.getAttribute('data-record-id');
      const rec = store.calculatedData.records.find(r => r.id === recordId);
      if (rec) {
        showAuditTrailModal(rec);
      }
    }
  });
}

function showAuditTrailModal(record) {
  const contentHtml = `
    <div class="audit-trail-container">
      <div class="audit-header-banner">
        <div>
          <h4>${record.workerName} (${record.workerId})</h4>
          <p class="text-secondary text-sm">${record.department} • Shift: <strong>${record.shiftName}</strong> (${record.shiftWindow}${record.isOvernight ? ' Overnight' : ''})</p>
          <p class="text-secondary text-xs">Date: <strong>${record.date}</strong> (${record.dayOfWeek})</p>
        </div>
        <div class="audit-badges">
          ${record.memoAmount > 0 ? `<span class="badge badge-danger">Memo Issued: ₹${record.memoAmount}</span>` : ''}
          ${record.isHalfDay ? `<span class="badge badge-orange">Half Day Attendance</span>` : ''}
          ${record.otMinutes > 0 ? `<span class="badge badge-purple">OT: ${record.otHoursFormatted}</span>` : ''}
        </div>
      </div>

      <div class="audit-steps-grid mt-4">
        <!-- Step 1: Shift Timing & Expected Windows -->
        <div class="audit-card">
          <div class="audit-step-title">1. Scheduled Shift & Benchmarks</div>
          <ul class="audit-list">
            ${record.isFlexible ? `
            <li><strong>Shift Window:</strong> Flexible: any time in the 24 hours ${record.isOvernight ? '(this duty crossed midnight)' : ''}</li>
            <li><strong>Required Hours:</strong> ${record.scheduledHoursFormatted} (${record.requiredHoursSource === 'worker' ? "worker's own Duty Hrs" : 'from the shift'})</li>
            <li><strong>Grace / Late:</strong> Not applicable (no start time)</li>
            <li><strong>Half-Day Threshold:</strong> Less than ${record.halfDayThresholdTime} worked</li>
            <li><strong>OT Threshold:</strong> After ${record.scheduledHoursFormatted} + ${store.config.otThresholdMinutes} min worked</li>
            ` : `
            <li><strong>Shift Window:</strong> ${record.shiftStart} to ${record.shiftEnd} ${record.isOvernight ? '(Crosses Midnight into next day)' : ''}</li>
            <li><strong>Scheduled Hours:</strong> ${record.scheduledHoursFormatted} (${record.scheduledMinutes} minutes)</li>
            <li><strong>Grace Cutoff (15 min):</strong> ${record.shiftStart} + 15 min</li>
            <li><strong>Half-Day Threshold:</strong> ${record.shiftStart} + ${store.config.halfDayThresholdHours}h = ${record.halfDayThresholdTime}</li>
            <li><strong>OT Threshold:</strong> ${record.shiftEnd} + ${store.config.otThresholdMinutes} min</li>
            `}
          </ul>
        </div>

        <!-- Step 2: Actual Punches & Presence -->
        <div class="audit-card">
          <div class="audit-step-title">2. Actual Punches & Presence</div>
          <ul class="audit-list">
            <li><strong>First IN Punch:</strong> <span class="font-mono font-bold">${record.actualIn}</span> on ${record.actualInDate}</li>
            <li><strong>Last OUT Punch:</strong> <span class="font-mono font-bold">${record.actualOut}</span> on ${record.actualOutDate}</li>
            <li><strong>Total Presence:</strong> <span class="font-mono">${record.actualWorkingHoursFormatted}</span> (${record.actualWorkingMinutes} minutes)</li>
            ${record.isFlexible ? `
            <li><strong>Short Hours:</strong> ${record.isEarlyDeparture ? `${record.earlyDepartureMinutes} minutes less than required` : 'No'}</li>
            ` : `
            <li><strong>Early Arrival:</strong> ${record.actualIn < record.shiftStart ? 'Yes (Early arrival is NEVER overtime)' : 'No'}</li>
            <li><strong>Early Departure:</strong> ${record.isEarlyDeparture ? `${record.earlyDepartureMinutes} minutes before shift end` : 'No'}</li>
            `}
          </ul>
        </div>

        <!-- Step 3: Grace & Late Arrival Analysis -->
        <div class="audit-card">
          <div class="audit-step-title">3. Late Arrival & Grace Rule Evaluation</div>
          <ul class="audit-list">
            <li><strong>Arrival Difference:</strong> ${record.lateMinutes > 0 ? `${record.lateMinutes} mins late` : 'On time / Early'}</li>
            <li><strong>Grace Period Status:</strong> <span class="badge ${record.isGrace ? 'badge-teal' : (record.lateMinutes === 0 ? 'badge-success' : 'badge-amber')}">${record.graceStatus}</span></li>
            <li><strong>Counts as Late Occurrence:</strong> ${record.isFlexible ? 'NO (Flexible shift: no late marks)' : record.isLateOccurrence ? 'YES (Exceeded 15-min grace)' : record.isHalfDay ? 'NO (Marked Half Day instead: no memo, allowance not used)' : 'NO (Within grace or on time)'}</li>
            <li><strong>Salary Cycle Late Occurrence Index:</strong> ${record.isLateOccurrence ? `#${record.lateOccurrenceIndex} in ${record.cycleLabel}` : 'N/A'}</li>
          </ul>
        </div>

        <!-- Step 4: Monthly Memo Policy Evaluation -->
        <div class="audit-card">
          <div class="audit-step-title">4. Memo Penalty Policy (₹100 Rule)</div>
          <ul class="audit-list">
            <li><strong>Monthly Allowed Late Quota:</strong> ${store.config.monthlyLateOccurrencesAllowed} occurrences without memo</li>
            <li><strong>Occurrence Status:</strong> ${record.memoStatus}</li>
            <li><strong>Memo Imposed:</strong> <span class="font-bold ${record.memoAmount > 0 ? 'text-danger' : 'text-success'}">₹${record.memoAmount}</span></li>
            <li><strong>Remaining Allowance This Cycle:</strong> ${record.monthlyRemainingAllowance} remaining</li>
          </ul>
        </div>

        <!-- Step 5: Overtime Evaluation -->
        <div class="audit-card">
          <div class="audit-step-title">5. Overtime (OT) Evaluation</div>
          <ul class="audit-list">
            <li><strong>OT Start Benchmark:</strong> ${record.isFlexible ? `After ${record.scheduledHoursFormatted} + ${store.config.otThresholdMinutes}m worked` : `15 minutes after shift end (${record.shiftEnd} + 15m)`}</li>
            <li><strong>Actual Departure:</strong> ${record.actualOut}</li>
            <li><strong>Net Overtime:</strong> <span class="font-bold text-purple">${record.otHoursFormatted}</span> (${record.otMinutes} mins)</li>
            <li><strong>OT Formula:</strong> ${record.isFlexible ? (record.otMinutes > 0
              ? `Worked ${record.actualWorkingHoursFormatted} − required ${record.scheduledHoursFormatted} − ${store.config.otThresholdMinutes}m = ${record.otHoursFormatted}`
              : `Worked ${record.actualWorkingHoursFormatted} is within required ${record.scheduledHoursFormatted} + ${store.config.otThresholdMinutes}m -> 0 OT`) : record.otMinutes > 0 ? `OUT (${record.actualOut}) - Threshold = ${record.otMinutes} mins` : 'OUT <= Shift End + 15m -> 0 OT'}</li>
          </ul>
        </div>

        <!-- Step 6: Raw Punch Log for this Day -->
        <div class="audit-card">
          <div class="audit-step-title">6. Raw Punches Associated with Record</div>
          <div class="raw-punch-mini-list">
            ${record.rawPunches && record.rawPunches.length > 0 ? record.rawPunches.map(p => `
              <div class="punch-pill">
                <span class="badge ${p.type === 'IN' ? 'badge-success' : p.type === 'OUT' ? 'badge-purple' : 'badge-neutral'}">${p.type}</span>
                <span class="font-mono">${p.date} ${p.time}</span>
              </div>
            `).join('') : '<span class="text-muted text-xs">No raw punches recorded.</span>'}
          </div>
        </div>
      </div>
    </div>
  `;

  modal.open({
    title: `Calculation Audit Trail - ${record.workerName} (${record.date})`,
    contentHtml,
    size: 'lg'
  });
}

/**
 * Days present per worker per salary cycle (e.g. 22nd–21st), for payroll.
 * Respects the search box and the dashboard's department / shift / worker filters.
 */
function renderDaysPresent(container) {
  const all = store.calculatedData.presenceSummary || [];
  const cycleLabels = new Map(all.map(p => [p.month, p.cycleLabel]));
  const cycleKeys = [...cycleLabels.keys()].sort().reverse();
  const fallbackCycle = cycleKeys.includes(store.filters.month) ? store.filters.month : (cycleKeys[0] || 'ALL');
  const cycle = attState.cycle === 'ALL' || cycleKeys.includes(attState.cycle) ? attState.cycle : fallbackCycle;

  const { department, shiftId, workerId, search } = store.filters;
  const q = (search || '').trim().toLowerCase();
  const rows = all.filter(p => {
    if (cycle !== 'ALL' && p.month !== cycle) return false;
    if (department && department !== 'ALL' && p.department !== department) return false;
    if (shiftId && shiftId !== 'ALL' && p.shiftId !== shiftId) return false;
    if (workerId && workerId !== 'ALL' && p.workerId !== workerId) return false;
    if (q && !`${p.workerId} ${p.workerName} ${p.department} ${p.shiftName}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => a.month === b.month
    ? String(a.workerId).localeCompare(String(b.workerId), undefined, { numeric: true })
    : b.month.localeCompare(a.month));

  let totalDays = 0;
  let totalHalfDays = 0;
  let totalMissing = 0;
  let calendarBasis = 0;
  for (const p of rows) {
    totalDays += p.daysPresent;
    totalHalfDays += p.halfDays;
    totalMissing += p.missingPunchDays || 0;
    if (p.basis === 'calendar') calendarBasis++;
  }

  const paginationData = paginate(rows, attState.presentPage, attState.presentPageSize);
  attState.presentPage = paginationData.currentPage;

  container.innerHTML = `
    <div class="attendance-view animate-fade-in">
      <div class="section-header">
        <div>
          <h2>Days Present per Salary Cycle</h2>
          <p class="text-secondary text-sm">Total days each worker was present in the salary cycle (${cycle === 'ALL' ? 'all cycles' : cycleLabels.get(cycle)}). A day counts once, even if the duty crossed midnight.</p>
        </div>

        <div class="header-action-group">
          <div class="search-box">
            <input type="text" id="attendance-search-input" class="form-control" placeholder="Search worker, dept, shift..." value="${store.filters.search}">
          </div>
          <select id="present-cycle-select" class="form-control" style="width: auto;">
            <option value="ALL" ${cycle === 'ALL' ? 'selected' : ''}>All Cycles</option>
            ${cycleKeys.map(k => `<option value="${k}" ${cycle === k ? 'selected' : ''}>${cycleLabels.get(k)}</option>`).join('')}
          </select>
          <div class="dropdown-export">
            <button id="btn-export-present-excel" class="btn btn-primary btn-sm">Export Excel (.xlsx)</button>
            <button id="btn-export-present-csv" class="btn btn-secondary btn-sm">Export CSV</button>
          </div>
        </div>
      </div>

      ${viewToggleHtml()}

      <div class="quick-summary-strip card mb-4">
        <div class="summary-chip">
          <span class="chip-label">Workers:</span>
          <span class="chip-value">${rows.length.toLocaleString()}</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">Total Days Present:</span>
          <span class="chip-value text-cyan">${totalDays.toLocaleString()}</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">Average per Worker:</span>
          <span class="chip-value">${rows.length ? (totalDays / rows.length).toFixed(1) : '0'} days</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">Half Days:</span>
          <span class="chip-value text-orange">${totalHalfDays.toLocaleString()}</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">Days With Missing Punch:</span>
          <span class="chip-value text-danger">${totalMissing.toLocaleString()}</span>
        </div>
      </div>

      ${calendarBasis ? `<p class="text-secondary text-xs mb-2">${calendarBasis} worker(s) have no defined shift: their days are counted as calendar days with at least one scan (marked "by scans"). Define their shift under Shift Management for exact duty-based counting.</p>` : ''}

      <div id="present-pagination-top" class="mb-2"></div>

      <div class="table-responsive card">
        <table class="data-table" id="days-present-table">
          <thead>
            <tr>
              <th>Worker ID</th>
              <th>Worker Name</th>
              <th>Department</th>
              <th>Shift</th>
              <th>Salary Cycle</th>
              <th class="text-right">Days Present</th>
              <th class="text-right">Half Days</th>
              <th class="text-right" title="Half day counted as 0.5">Effective Days</th>
              <th class="text-right">Missing Punch Days</th>
            </tr>
          </thead>
          <tbody>
            ${paginationData.pageItems.length === 0 ? `
              <tr><td colspan="9" class="text-center py-8 text-muted">No workers with attendance match the current cycle and filters.</td></tr>
            ` : paginationData.pageItems.map(p => `
              <tr>
                <td><code>${p.workerId}</code></td>
                <td class="font-medium">${p.workerName}</td>
                <td>${p.department}</td>
                <td>
                  ${p.shiftName || (p.shiftId ? `${shiftNameFromId(p.shiftId)} <span class="badge badge-neutral text-xs">not defined</span>` : 'Unassigned')}
                  ${p.basis === 'calendar' ? `<div class="text-xs text-secondary" title="Counted as calendar days with at least one scan">by scans</div>` : ''}
                </td>
                <td class="text-sm">${p.cycleLabel}</td>
                <td class="text-right font-mono font-bold">${p.daysPresent}</td>
                <td class="text-right font-mono">${p.basis === 'shift' ? p.halfDays : '—'}</td>
                <td class="text-right font-mono">${p.effectiveDays}</td>
                <td class="text-right font-mono ${p.missingPunchDays ? 'text-danger' : ''}">${p.missingPunchDays ?? '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div id="present-pagination-bottom" class="mt-3"></div>
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
      attState.presentPage = newPage;
      renderDaysPresent(container);
    },
    onPageSizeChange: (newSize) => {
      attState.presentPageSize = newSize;
      attState.presentPage = 1;
      renderDaysPresent(container);
    }
  };
  renderPaginationBar({ container: container.querySelector('#present-pagination-top'), ...paginationConfig });
  renderPaginationBar({ container: container.querySelector('#present-pagination-bottom'), ...paginationConfig });

  attachViewToggle(container);
  attachSearch(container);

  container.querySelector('#present-cycle-select')?.addEventListener('change', (e) => {
    attState.cycle = e.target.value;
    attState.presentPage = 1;
    renderDaysPresent(container);
  });
  container.querySelector('#btn-export-present-excel')?.addEventListener('click', () => exportDaysPresentReport(rows, 'xlsx'));
  container.querySelector('#btn-export-present-csv')?.addEventListener('click', () => exportDaysPresentReport(rows, 'csv'));
}
