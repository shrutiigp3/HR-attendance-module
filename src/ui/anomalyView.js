/**
 * Suspicious & Invalid Attendance Review View (Section 9 & 10)
 * Filters and surfaces all records with missing punches, anomalies, or suspicious patterns.
 * Supports pagination for large datasets.
 */

import { store } from '../data/dataStore.js';
import { exportAttendanceReport } from '../utils/exportUtils.js';
import { paginate, renderPaginationBar } from './pagination.js';
import { modal } from './modalManager.js';

let anomalyState = {
  page: 1,
  pageSize: 50
};

export function renderAnomalyReview(container) {
  const records = store.calculatedData.records.filter(r => r.hasAnomaly || r.hasMissingPunch);
  const paginationData = paginate(records, anomalyState.page, anomalyState.pageSize);
  anomalyState.page = paginationData.currentPage;

  // Single-pass counts
  let missingInCount = 0;
  let missingOutCount = 0;
  let halfDayCount = 0;
  let earlyDepCount = 0;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.flags.some(f => f.includes('Missing IN'))) missingInCount++;
    if (r.flags.some(f => f.includes('Missing OUT'))) missingOutCount++;
    if (r.isHalfDay) halfDayCount++;
    if (r.isEarlyDeparture) earlyDepCount++;
  }

  container.innerHTML = `
    <div class="anomaly-view animate-fade-in">
      <div class="section-header">
        <div>
          <h2>Suspicious & Invalid Punch Review Center</h2>
          <p class="text-secondary text-sm">Review records flagged with Missing IN, Missing OUT, sequence anomalies, and significant schedule deviations.</p>
        </div>

        <div>
          <button id="btn-export-anomalies" class="btn btn-outline btn-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Export Flagged Records
          </button>
        </div>
      </div>

      <!-- Quick Summary Cards -->
      <div class="quick-summary-strip card mb-4">
        <div class="summary-chip">
          <span class="chip-label">Total Flagged Records:</span>
          <span class="chip-value text-danger font-bold">${records.length.toLocaleString()}</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">Missing IN:</span>
          <span class="chip-value text-amber">${missingInCount.toLocaleString()}</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">Missing OUT:</span>
          <span class="chip-value text-amber">${missingOutCount.toLocaleString()}</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">Half-Day Cases:</span>
          <span class="chip-value text-orange">${halfDayCount.toLocaleString()}</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">Early Departures:</span>
          <span class="chip-value text-blue">${earlyDepCount.toLocaleString()}</span>
        </div>
      </div>

      <!-- Top Pagination Bar -->
      <div id="anomaly-pagination-top" class="mb-2"></div>

      <!-- Table of Flagged Records -->
      <div class="table-responsive card">
        <table class="data-table" id="table-anomalies">
          <thead>
            <tr>
              <th>Date</th>
              <th>Worker ID & Name</th>
              <th>Shift</th>
              <th>Actual IN</th>
              <th>Actual OUT</th>
              <th>Detected Anomaly Flags</th>
              <th>Audit Trail</th>
            </tr>
          </thead>
          <tbody>
            ${paginationData.pageItems.length === 0 ? `
              <tr>
                <td colspan="7" class="text-center py-8 text-success">
                  ✅ Clean Record! No suspicious or missing punch anomalies detected.
                </td>
              </tr>
            ` : paginationData.pageItems.map(r => `
              <tr class="row-anomaly">
                <td>
                  <span class="font-medium">${r.date}</span>
                  <div class="text-xs text-muted">${r.dayOfWeek}</div>
                </td>
                <td>
                  <div class="font-medium">${r.workerName}</div>
                  <div class="text-xs text-muted"><code>${r.workerId}</code> • ${r.department}</div>
                </td>
                <td>
                  <span class="font-medium">${r.shiftName}</span>
                  ${r.isOvernight ? `<span class="badge badge-purple text-xs">🌙 Night</span>` : ''}
                </td>
                <td>
                  <span class="font-mono ${r.actualIn === '--:--' ? 'text-danger font-bold' : ''}">
                    ${r.actualIn}
                  </span>
                </td>
                <td>
                  <span class="font-mono ${r.actualOut === '--:--' ? 'text-danger font-bold' : ''}">
                    ${r.actualOut}
                  </span>
                </td>
                <td>
                  <div class="flag-pill-group">
                    ${r.flags.map(f => {
                      let badgeClass = 'badge-amber';
                      if (f.includes('Missing')) badgeClass = 'badge-danger';
                      if (f.includes('Memo')) badgeClass = 'badge-danger font-bold';
                      if (f.includes('Half Day')) badgeClass = 'badge-orange font-semibold';
                      return `<span class="badge ${badgeClass} text-xs">${f}</span>`;
                    }).join(' ')}
                  </div>
                </td>
                <td>
                  <button class="btn btn-secondary btn-sm btn-audit-anomaly" data-record-id="${r.id}">
                    Inspect
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Bottom Pagination Bar -->
      <div id="anomaly-pagination-bottom" class="mt-3"></div>
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
      anomalyState.page = newPage;
      renderAnomalyReview(container);
    },
    onPageSizeChange: (newSize) => {
      anomalyState.pageSize = newSize;
      anomalyState.page = 1;
      renderAnomalyReview(container);
    }
  };

  renderPaginationBar({ container: container.querySelector('#anomaly-pagination-top'), ...paginationConfig });
  renderPaginationBar({ container: container.querySelector('#anomaly-pagination-bottom'), ...paginationConfig });

  document.getElementById('btn-export-anomalies')?.addEventListener('click', () => {
    exportAttendanceReport(records, 'xlsx', 'Flagged_Attendance_Anomalies');
  });

  // Table Event Delegation for Audit inspection
  const table = container.querySelector('#table-anomalies');
  table?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-audit-anomaly');
    if (btn) {
      const recordId = btn.getAttribute('data-record-id');
      const rec = store.calculatedData.records.find(r => r.id === recordId);
      if (rec) {
        showSimpleAnomalyModal(rec);
      }
    }
  });
}

function showSimpleAnomalyModal(rec) {
  modal.open({
    title: `Anomaly Audit: ${rec.workerName} (${rec.workerId})`,
    contentHtml: `
      <div class="audit-card">
        <div class="audit-step-title">Flagged Irregularity Details</div>
        <ul class="audit-list">
          <li><strong>Date:</strong> ${rec.date} (${rec.dayOfWeek})</li>
          <li><strong>Shift:</strong> ${rec.shiftName} (${rec.shiftWindow})</li>
          <li><strong>Punches:</strong> IN: ${rec.actualIn}, OUT: ${rec.actualOut}</li>
          <li><strong>Flags Raised:</strong></li>
        </ul>
        <div class="mt-2">
          ${rec.flags.map(f => `<div class="badge badge-danger mr-1 mb-1">${f}</div>`).join('')}
        </div>
        <div class="mt-4 form-actions">
          <button type="button" class="btn btn-secondary" onclick="document.querySelector('.modal-close-btn')?.click()">Close</button>
        </div>
      </div>
    `,
    size: 'md'
  });
}
