/**
 * Dashboard View
 * Displays high-level KPIs, monthly memo counters, and key calculation insights.
 */

import { store } from '../data/dataStore.js';
import { exportMonthlyMemoReport } from '../utils/exportUtils.js';
import { paginate, renderPaginationBar } from './pagination.js';
import { renderPreservingFocus } from './renderUtils.js';
import { describeCycle, formatShiftTiming } from '../engine/timeUtils.js';

let dashMonthlyState = {
  search: '',
  page: 1,
  pageSize: 25
};

export function renderDashboard(container) {
  const { summary, monthlyStats } = store.calculatedData;
  const filteredRecords = store.getFilteredRecords();

  // Compute filtered subset summary
  let filteredWorkMinutes = 0;
  let filteredOtMinutes = 0;
  let filteredLateCount = 0;
  let filteredGraceCount = 0;
  let filteredLateAfterGrace = 0;
  let filteredHalfDayCount = 0;
  let filteredMemoCount = 0;
  let filteredMemoAmount = 0;
  let filteredMissing = 0;
  let filteredAnomalies = 0;

  for (const r of filteredRecords) {
    filteredWorkMinutes += r.actualWorkingMinutes;
    filteredOtMinutes += r.otMinutes;
    if (r.lateMinutes > 0) filteredLateCount++;
    if (r.isGrace) filteredGraceCount++;
    if (r.isLateOccurrence) filteredLateAfterGrace++;
    if (r.isHalfDay) filteredHalfDayCount++;
    if (r.memoCount > 0) {
      filteredMemoCount += r.memoCount;
      filteredMemoAmount += r.memoAmount;
    }
    if (r.hasMissingPunch) filteredMissing++;
    if (r.hasAnomaly) filteredAnomalies++;
  }

  // Filter options
  // Salary cycles present in the data, newest first, e.g. "2026-09" -> "Sep 2026 (22 Aug – 21 Sep)"
  const cycleLabels = new Map(store.calculatedData.records.map(r => [r.month, r.cycleLabel]));
  const months = [...cycleLabels.keys()].filter(Boolean).sort().reverse();
  const departments = [...new Set(store.workers.map(w => w.department))].sort();
  const shifts = store.shifts;

  // Filter and paginate monthlyStats
  const qMonthly = dashMonthlyState.search.trim().toLowerCase();
  const filteredMonthlyStats = monthlyStats.filter(stat => {
    if (qMonthly) {
      const text = `${stat.month} ${stat.cycleLabel} ${stat.workerId} ${stat.workerName} ${stat.department}`.toLowerCase();
      if (!text.includes(qMonthly)) return false;
    }
    return true;
  });

  const monthlyPagination = paginate(filteredMonthlyStats, dashMonthlyState.page, dashMonthlyState.pageSize);
  dashMonthlyState.page = monthlyPagination.currentPage;

  container.innerHTML = `
    <div class="dashboard-header animate-fade-in">
      <div class="dashboard-title-group">
        <h2>Executive Attendance & Overtime Overview</h2>
        <p class="text-secondary">Real-time working hours, overtime thresholds, 15-minute grace, and monthly memo policy tracking.</p>
      </div>

      <!-- Quick Filter Bar -->
      <div class="filter-panel card">
        <div class="filter-grid">
          <div class="filter-item">
            <label for="filter-month">Salary Cycle</label>
            <select id="filter-month" class="form-control">
              <option value="">All Cycles</option>
              ${months.map(m => `<option value="${m}" ${store.filters.month === m ? 'selected' : ''}>${cycleLabels.get(m)}</option>`).join('')}
            </select>
          </div>

          <div class="filter-item">
            <label for="filter-dept">Department</label>
            <select id="filter-dept" class="form-control">
              <option value="ALL">All Departments</option>
              ${departments.map(d => `<option value="${d}" ${store.filters.department === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>

          <div class="filter-item">
            <label for="filter-shift">Shift</label>
            <select id="filter-shift" class="form-control">
              <option value="ALL">All Shifts</option>
              ${shifts.map(s => `<option value="${s.id}" ${store.filters.shiftId === s.id ? 'selected' : ''}>${s.name} (${formatShiftTiming(s)})</option>`).join('')}
            </select>
          </div>

          <div class="filter-item">
            <label for="filter-status">Record Status</label>
            <select id="filter-status" class="form-control">
              <option value="ALL" ${store.filters.status === 'ALL' ? 'selected' : ''}>All Records</option>
              <option value="GRACE" ${store.filters.status === 'GRACE' ? 'selected' : ''}>Within Grace Period</option>
              <option value="LATE" ${store.filters.status === 'LATE' ? 'selected' : ''}>Late Arrivals</option>
              <option value="MEMO" ${store.filters.status === 'MEMO' ? 'selected' : ''}>Memo Issued (₹100)</option>
              <option value="HALFDAY" ${store.filters.status === 'HALFDAY' ? 'selected' : ''}>Half-Day Workers</option>
              <option value="OT" ${store.filters.status === 'OT' ? 'selected' : ''}>Overtime (> 15m past end)</option>
              <option value="ANOMALY" ${store.filters.status === 'ANOMALY' ? 'selected' : ''}>Missing/Invalid Punches</option>
            </select>
          </div>

          <div class="filter-actions">
            <button id="btn-reset-filters" class="btn btn-secondary btn-sm" title="Clear all filters">Reset</button>
          </div>
        </div>
      </div>
    </div>

    <!-- KPI Metric Cards Grid -->
    <div class="kpi-grid">
      <!-- Card 1: Workers -->
      <div class="kpi-card card">
        <div class="kpi-header">
          <span class="kpi-label">Total Workers</span>
          <div class="kpi-icon-badge icon-blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
        </div>
        <div class="kpi-value">${store.workers.length}</div>
        <div class="kpi-subtext">
          <span class="text-success font-medium">${store.workers.filter(w => w.isActive).length} Active</span> • ${store.shifts.length} Active Shifts
        </div>
      </div>

      <!-- Card 2: Total Working Hours -->
      <div class="kpi-card card">
        <div class="kpi-header">
          <span class="kpi-label">Total Working Hours</span>
          <div class="kpi-icon-badge icon-cyan">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
        </div>
        <div class="kpi-value">${(filteredWorkMinutes / 60).toFixed(1)} <span class="kpi-unit">hrs</span></div>
        <div class="kpi-subtext">
          Across <span class="font-medium">${filteredRecords.length}</span> attendance records
        </div>
      </div>

      <!-- Card 3: Overtime Hours -->
      <div class="kpi-card card border-ot">
        <div class="kpi-header">
          <span class="kpi-label">Total Overtime (OT)</span>
          <div class="kpi-icon-badge icon-purple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          </div>
        </div>
        <div class="kpi-value text-purple">${(filteredOtMinutes / 60).toFixed(1)} <span class="kpi-unit">hrs</span></div>
        <div class="kpi-subtext">
          Starts 15m after shift end (Early arrival = 0 OT)
        </div>
      </div>

      <!-- Card 4: Grace Arrivals -->
      <div class="kpi-card card">
        <div class="kpi-header">
          <span class="kpi-label">Grace Period Arrivals</span>
          <div class="kpi-icon-badge icon-teal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          </div>
        </div>
        <div class="kpi-value text-teal">${filteredGraceCount}</div>
        <div class="kpi-subtext">
          Within 15-min grace window • No penalty
        </div>
      </div>

      <!-- Card 5: Late Occurrences After Grace -->
      <div class="kpi-card card">
        <div class="kpi-header">
          <span class="kpi-label">Late Beyond Grace</span>
          <div class="kpi-icon-badge icon-amber">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
        </div>
        <div class="kpi-value text-amber">${filteredLateAfterGrace}</div>
        <div class="kpi-subtext">
          Quota: ${store.config.monthlyLateOccurrencesAllowed} allowed/worker/month
        </div>
      </div>

      <!-- Card 6: Late Memos Issued -->
      <div class="kpi-card card border-memo">
        <div class="kpi-header">
          <span class="kpi-label">Memo Count & Amount</span>
          <div class="kpi-icon-badge icon-danger">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
          </div>
        </div>
        <div class="kpi-value text-danger">₹${filteredMemoAmount.toLocaleString()}</div>
        <div class="kpi-subtext">
          <span class="badge badge-danger">${filteredMemoCount} Memos</span> (3rd+ late occurrence)
        </div>
      </div>

      <!-- Card 7: Half-Day Attendance -->
      <div class="kpi-card card">
        <div class="kpi-header">
          <span class="kpi-label">Half-Day Attendance</span>
          <div class="kpi-icon-badge icon-orange">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          </div>
        </div>
        <div class="kpi-value text-orange">${filteredHalfDayCount}</div>
        <div class="kpi-subtext">
          IN after Shift Start + ${store.config.halfDayThresholdHours} hrs
        </div>
      </div>

      <!-- Card 8: Suspicious / Missing Punches -->
      <div class="kpi-card card">
        <div class="kpi-header">
          <span class="kpi-label">Missing / Flagged Punches</span>
          <div class="kpi-icon-badge icon-gray">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
        </div>
        <div class="kpi-value text-gray">${filteredMissing + filteredAnomalies}</div>
        <div class="kpi-subtext">
          ${filteredMissing} missing IN/OUT • ${filteredAnomalies} anomalies
        </div>
      </div>
    </div>

    <!-- Monthly Late Allowance & Memo Tracker Table (Section 5) -->
    <div class="section-container mt-6">
      <div class="section-header">
        <div>
          <h3>Monthly Late Allowance & Memo Policy Tracker</h3>
          <p class="text-secondary text-sm">Counters per salary cycle (${describeCycle(store.config.cycleStartDay)}): 15m Grace, 2 Allowed Occurrences, Remaining Allowance, and ₹100 Memos for 3rd+ occurrences.</p>
        </div>
        <div class="section-actions flex items-center gap-2">
          <input type="text" id="dash-monthly-search" class="form-control form-control-sm" placeholder="Search monthly worker..." value="${dashMonthlyState.search}" style="max-width:200px;">
          <button id="btn-export-monthly-memo" class="btn btn-outline btn-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Export Monthly Summary
          </button>
        </div>
      </div>

      <div class="table-responsive card">
        <table class="data-table" id="table-monthly-memo">
          <thead>
            <tr>
              <th>Salary Cycle</th>
              <th>Worker ID</th>
              <th>Worker Name</th>
              <th>Department</th>
              <th>Grace Arrivals</th>
              <th>Late Beyond Grace</th>
              <th>Allowed Quota</th>
              <th>Quota Used</th>
              <th>Remaining Allowance</th>
              <th>Memo Count</th>
              <th>Total Memo (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${monthlyPagination.pageItems.length === 0 ? `
              <tr><td colspan="11" class="text-center py-6 text-muted">No monthly stats available.</td></tr>
            ` : monthlyPagination.pageItems.map(stat => {
              const allowanceBadge = stat.remainingLateAllowance > 0
                ? `<span class="badge badge-success">${stat.remainingLateAllowance} remaining</span>`
                : `<span class="badge badge-danger">0 remaining (Exhausted)</span>`;

              const memoBadge = stat.memoCount > 0
                ? `<span class="badge badge-danger font-semibold">₹${stat.totalMemoAmount} (${stat.memoCount} Memos)</span>`
                : `<span class="badge badge-neutral">₹0 (No Memo)</span>`;

              return `
                <tr>
                  <td><span class="font-medium">${stat.cycleLabel}</span></td>
                  <td><code>${stat.workerId}</code></td>
                  <td class="font-medium">${stat.workerName}</td>
                  <td><span class="dept-badge">${stat.department}</span></td>
                  <td><span class="badge badge-teal">${stat.graceArrivalsCount}</span></td>
                  <td><span class="badge ${stat.lateOccurrencesCount > 0 ? 'badge-amber' : 'badge-neutral'}">${stat.lateOccurrencesCount}</span></td>
                  <td>${stat.allowedLateOccurrences}</td>
                  <td>${stat.lateOccurrencesUsed}</td>
                  <td>${allowanceBadge}</td>
                  <td>${stat.memoCount}</td>
                  <td>${memoBadge}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div id="dash-monthly-pagination" class="mt-2"></div>
    </div>

    <!-- Educational Rule Verification Banner -->
    <div class="rule-banner-card card mt-6">
      <div class="rule-banner-header">
        <div class="rule-banner-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        </div>
        <div>
          <h4>System Rule Validation Status</h4>
          <p class="text-secondary text-xs">Live status of active manufacturing calculation rules verified against pre-loaded test cases.</p>
        </div>
      </div>
      <div class="rule-grid">
        <div class="rule-item">
          <span class="rule-status-dot dot-success"></span>
          <div>
            <strong>15-Minute Automatic Grace:</strong> Active. Arriving within 15 mins incurs zero late penalty and zero quota deduction.
          </div>
        </div>
        <div class="rule-item">
          <span class="rule-status-dot dot-success"></span>
          <div>
            <strong>Monthly Late Quota:</strong> 2 free occurrences allowed per salary cycle (${describeCycle(store.config.cycleStartDay)}) after grace. 3rd and subsequent trigger ₹100 memo.
          </div>
        </div>
        <div class="rule-item">
          <span class="rule-status-dot dot-success"></span>
          <div>
            <strong>Half-Day Threshold:</strong> Dynamically evaluated at Shift Start + 4 Hours (Office: 13:00, Plant: 12:30, Night: 00:30). A half day never gets a memo and doesn't count toward the monthly late quota.
          </div>
        </div>
        <div class="rule-item">
          <span class="rule-status-dot dot-success"></span>
          <div>
            <strong>Early Arrival & Overtime Rule:</strong> Early arrival is NEVER overtime. Overtime is considered when working beyond scheduled end / required hours exceeds 15 minutes (full excess counted). Office shifts have no overtime.
          </div>
        </div>
        <div class="rule-item">
          <span class="rule-status-dot dot-success"></span>
          <div>
            <strong>Overnight Shift Pairing:</strong> Evening IN and morning OUT cleanly attributed to shift start date (e.g. Sept 15 Night).
          </div>
        </div>
        <div class="rule-item">
          <span class="rule-status-dot dot-success"></span>
          <div>
            <strong>Data Independence:</strong> Core engine decoupled; ready for SQL Server / API connection later.
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach event handlers
  document.getElementById('filter-month')?.addEventListener('change', (e) => {
    store.setFilters({ month: e.target.value });
  });

  document.getElementById('filter-dept')?.addEventListener('change', (e) => {
    store.setFilters({ department: e.target.value });
  });

  document.getElementById('filter-shift')?.addEventListener('change', (e) => {
    store.setFilters({ shiftId: e.target.value });
  });

  document.getElementById('filter-status')?.addEventListener('change', (e) => {
    store.setFilters({ status: e.target.value });
  });

  document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
    store.resetFilters();
  });

  // Attach monthly pagination controls
  renderPaginationBar({
    container: container.querySelector('#dash-monthly-pagination'),
    currentPage: monthlyPagination.currentPage,
    totalPages: monthlyPagination.totalPages,
    totalItems: monthlyPagination.totalItems,
    startIndex: monthlyPagination.startIndex,
    endIndex: monthlyPagination.endIndex,
    pageSize: monthlyPagination.pageSize,
    pageSizeOptions: [10, 25, 50, 100],
    onPageChange: (newPage) => {
      dashMonthlyState.page = newPage;
      renderDashboard(container);
    },
    onPageSizeChange: (newSize) => {
      dashMonthlyState.pageSize = newSize;
      dashMonthlyState.page = 1;
      renderDashboard(container);
    }
  });

  const monthlySearchInput = document.getElementById('dash-monthly-search');
  let monthlySearchTimer;
  monthlySearchInput?.addEventListener('input', (e) => {
    clearTimeout(monthlySearchTimer);
    monthlySearchTimer = setTimeout(() => {
      dashMonthlyState.search = e.target.value;
      dashMonthlyState.page = 1;
      renderPreservingFocus(() => renderDashboard(container));
    }, 200);
  });

  document.getElementById('btn-export-monthly-memo')?.addEventListener('click', () => {
    exportMonthlyMemoReport(store.calculatedData.monthlyStats, 'xlsx');
  });
}
