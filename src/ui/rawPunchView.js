/**
 * Raw Punch Data & File Ingestion View (Section 1, 9, & 13)
 * Displays unmodified raw punch logs with pagination and instant search.
 * High-speed parsing and non-blocking file upload for 50,000+ punches.
 */

import { store } from '../data/dataStore.js';
import { modal } from './modalManager.js';
import { readExcelOrCsvFile, normalizePunchImportData, downloadPunchTemplate } from '../utils/excelUtils.js';
import { paginate, renderPaginationBar } from './pagination.js';
import { renderPreservingFocus } from './renderUtils.js';
import { showToast } from '../utils/toast.js';

let punchState = {
  search: '',
  type: 'ALL',
  page: 1,
  pageSize: 50
};

export function renderRawPunchView(container) {
  const rawPunches = store.rawPunches;

  // Single-pass counts
  let inCount = 0;
  let outCount = 0;
  let autoCount = 0;
  const workersWithPunchesSet = new Set();

  for (let i = 0; i < rawPunches.length; i++) {
    const p = rawPunches[i];
    if (p.type === 'IN') inCount++;
    else if (p.type === 'OUT') outCount++;
    else if (p.type === 'AUTO') autoCount++;
    workersWithPunchesSet.add(p.workerId);
  }

  // Filter in memory
  const q = punchState.search.trim().toLowerCase();
  const filteredPunches = rawPunches.filter(p => {
    if (punchState.type !== 'ALL' && p.type !== punchState.type) return false;
    if (q) {
      const matchText = `${p.workerId} ${p.date} ${p.time} ${p.type} ${p.source || ''}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }
    return true;
  });

  const paginationData = paginate(filteredPunches, punchState.page, punchState.pageSize);
  punchState.page = paginationData.currentPage;

  container.innerHTML = `
    <div class="raw-punch-view animate-fade-in">
      <div class="section-header">
        <div>
          <h2>Raw Punch Ingestion (Unchanged Source Data)</h2>
          <p class="text-secondary text-sm">
            <span class="badge badge-teal">Immutable Raw Log</span>
            Original raw punch data is strictly preserved and never mutated. A separate calculated dataset is generated downstream.
          </p>
        </div>

        <div class="header-action-group">
          <button id="btn-download-punch-template" class="btn btn-outline btn-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Punch Template (CSV/Excel)
          </button>
          <button id="btn-upload-punches" class="btn btn-primary btn-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            Upload Punches (CSV/Excel)
          </button>
          <button id="btn-clear-punches" class="btn btn-danger-outline btn-sm">
            Clear Raw Punches
          </button>
        </div>
      </div>

      <!-- Raw Punch Status Strip -->
      <div class="quick-summary-strip card mb-4">
        <div class="summary-chip">
          <span class="chip-label">Total Raw Punches:</span>
          <span class="chip-value">${rawPunches.length.toLocaleString()}</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">IN Punches:</span>
          <span class="chip-value text-teal">${inCount.toLocaleString()}</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">OUT Punches:</span>
          <span class="chip-value text-purple">${outCount.toLocaleString()}</span>
        </div>
        <div class="summary-chip" title="Scans without IN/OUT: the first scan of each shift counts as IN, the last as OUT">
          <span class="chip-label">Auto IN/OUT (device scans):</span>
          <span class="chip-value">${autoCount.toLocaleString()}</span>
        </div>
        <div class="summary-chip">
          <span class="chip-label">Workers with Punches:</span>
          <span class="chip-value">${workersWithPunchesSet.size.toLocaleString()}</span>
        </div>
      </div>

      <!-- Raw Punches Toolbar & Filter -->
      <div class="card p-3 mb-3">
        <div class="filter-grid" style="grid-template-columns: 2fr 1fr auto;">
          <div class="filter-item">
            <label for="punch-search">Search Punches</label>
            <input type="text" id="punch-search" class="form-control" placeholder="Search by Worker ID, Date (YYYY-MM-DD), or Time..." value="${punchState.search}">
          </div>

          <div class="filter-item">
            <label for="punch-type-filter">Direction (Type)</label>
            <select id="punch-type-filter" class="form-control">
              <option value="ALL" ${punchState.type === 'ALL' ? 'selected' : ''}>All Types (IN & OUT)</option>
              <option value="IN" ${punchState.type === 'IN' ? 'selected' : ''}>IN Punches Only</option>
              <option value="OUT" ${punchState.type === 'OUT' ? 'selected' : ''}>OUT Punches Only</option>
              <option value="AUTO" ${punchState.type === 'AUTO' ? 'selected' : ''}>Auto IN/OUT (device scans)</option>
            </select>
          </div>

          <div class="filter-item" style="justify-content: flex-end;">
            <button id="btn-reset-punch-filters" class="btn btn-secondary btn-sm">Reset</button>
          </div>
        </div>
      </div>

      <!-- Top Pagination Bar -->
      <div id="punch-pagination-top" class="mb-2"></div>

      <!-- Raw Punches Table -->
      <div class="table-responsive card">
        <table class="data-table" id="raw-punches-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Worker ID</th>
              <th>Date</th>
              <th>Time</th>
              <th>Direction (Type)</th>
              <th>System Status</th>
            </tr>
          </thead>
          <tbody id="raw-punch-tbody">
            ${paginationData.pageItems.length === 0 ? `
              <tr><td colspan="6" class="text-center py-8 text-muted">No raw punches match your search/filter criteria.</td></tr>
            ` : paginationData.pageItems.map((p, idx) => `
              <tr>
                <td class="text-muted text-xs">${paginationData.startIndex + idx}</td>
                <td><code>${p.workerId}</code></td>
                <td><span class="font-medium">${p.date}</span></td>
                <td class="font-mono font-semibold">${p.time}</td>
                <td>
                  ${p.type === 'AUTO' ? `
                    <span class="badge badge-neutral" title="Direction not recorded: first scan of the shift = IN, last = OUT">
                      ${p.source || 'AUTO'}
                    </span>
                  ` : `
                    <span class="badge ${p.type === 'IN' ? 'badge-success' : 'badge-purple'}">
                      ${p.type}
                    </span>
                  `}
                </td>
                <td><span class="badge badge-neutral text-xs">Raw Ingestion</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Bottom Pagination Bar -->
      <div id="punch-pagination-bottom" class="mt-3"></div>
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
      punchState.page = newPage;
      renderRawPunchView(container);
    },
    onPageSizeChange: (newSize) => {
      punchState.pageSize = newSize;
      punchState.page = 1;
      renderRawPunchView(container);
    }
  };

  renderPaginationBar({ container: container.querySelector('#punch-pagination-top'), ...paginationConfig });
  renderPaginationBar({ container: container.querySelector('#punch-pagination-bottom'), ...paginationConfig });

  // Attach event handlers
  document.getElementById('btn-download-punch-template')?.addEventListener('click', () => {
    downloadPunchTemplate('xlsx');
  });

  document.getElementById('btn-upload-punches')?.addEventListener('click', () => {
    openPunchUploadModal();
  });

  document.getElementById('btn-clear-punches')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all raw punches? You can restore sample data anytime.')) {
      store.clearRawPunches();
      showToast('Cleared all raw punches.');
    }
  });

  // Client-side punch search with debounce
  const punchSearch = document.getElementById('punch-search');
  let searchTimer;
  punchSearch?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      punchState.search = e.target.value;
      punchState.page = 1;
      renderPreservingFocus(() => renderRawPunchView(container));
    }, 200);
  });

  document.getElementById('punch-type-filter')?.addEventListener('change', (e) => {
    punchState.type = e.target.value;
    punchState.page = 1;
    renderRawPunchView(container);
  });

  document.getElementById('btn-reset-punch-filters')?.addEventListener('click', () => {
    punchState.search = '';
    punchState.type = 'ALL';
    punchState.page = 1;
    renderRawPunchView(container);
  });
}

/**
 * Plain-language notes for the upload preview: skipped rows, auto-paired scans, and punches that
 * won't reach attendance because their worker is missing from the master or has no shift.
 */
function buildPunchImportNotes(totalRows, punches) {
  const notes = [];
  const skipped = totalRows - punches.length;
  if (skipped > 0) {
    notes.push(`${skipped.toLocaleString()} row(s) skipped: missing or unreadable Worker ID, date, or time.`);
  }

  const autoCount = punches.filter(p => p.type === 'AUTO').length;
  if (autoCount > 0) {
    notes.push(`${autoCount.toLocaleString()} scan(s) have no IN/OUT: the first scan of each shift will count as IN and the last as OUT.`);
  }

  const shiftIds = new Set(store.shifts.map(s => s.id));
  // Matched ignoring capitals, like the calculation engine
  const workerById = new Map(store.workers.map(w => [String(w.id).toLowerCase(), w]));
  const missing = new Set();
  const unassigned = new Set();
  for (const p of punches) {
    const worker = workerById.get(String(p.workerId).toLowerCase());
    if (!worker) missing.add(p.workerId);
    else if (!shiftIds.has(worker.shiftId)) unassigned.add(p.workerId);
  }
  if (missing.size > 0) {
    notes.push(`${missing.size.toLocaleString()} employee ID(s) are not in Worker Master (e.g. ${[...missing].slice(0, 3).join(', ')}). Their punches are saved but won't be calculated until the workers are imported.`);
  }
  if (unassigned.size > 0) {
    notes.push(`${unassigned.size.toLocaleString()} worker(s) have no shift assigned. Their punches are saved but attendance appears only after a shift is assigned in Worker Master.`);
  }
  return notes;
}

function openPunchUploadModal() {
  const contentHtml = `
    <div class="import-modal-content">
      <p class="text-secondary text-sm">Upload raw punch data in CSV or Excel (.xlsx) format. Column headers supported: <code>Worker ID</code> / <code>Employee ID</code>, <code>Date</code> / <code>Punch Date</code> (YYYY-MM-DD or DD-MM-YYYY), <code>Time</code> / <code>Punch Time</code>, <code>Punch Type</code> (IN/OUT).
        Device exports without IN/OUT (e.g. "Face Device") are accepted: the first scan of each shift counts as IN and the last as OUT.</p>
      
      <div class="file-dropzone mt-3" id="punch-dropzone">
        <div class="upload-icon mb-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        </div>
        <p class="font-medium">Click or drag & drop CSV or Excel file here</p>
        <p class="text-xs text-secondary mt-1">High-capacity streaming parser supports 50,000+ punches</p>
        <input type="file" id="punch-file-input" accept=".csv, .xlsx, .xls" style="display:none;">
      </div>

      <div id="punch-import-preview" class="mt-4" style="display:none;">
        <h5 class="font-medium">Punch Data Preview (<span id="punch-preview-count">0</span> rows)</h5>
        <ul id="punch-import-notes" class="text-xs text-secondary mt-1"></ul>
        <div class="table-responsive max-h-48 mt-2">
          <table class="data-table text-xs" id="punch-preview-table">
            <thead></thead>
            <tbody></tbody>
          </table>
        </div>

        <div class="import-mode-selector mt-3">
          <label class="radio-label">
            <input type="radio" name="punch-import-mode" value="append" checked>
            <span><strong>Append:</strong> Add new punches to existing raw dataset</span>
          </label>
          <label class="radio-label ml-4">
            <input type="radio" name="punch-import-mode" value="replace">
            <span><strong>Replace:</strong> Overwrite all raw punches</span>
          </label>
        </div>
      </div>

      <div class="form-actions mt-4">
        <button type="button" class="btn btn-secondary" id="btn-cancel-import-punch">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-confirm-import-punch" disabled>Ingest Raw Punches</button>
      </div>
    </div>
  `;

  modal.open({
    title: 'Upload Raw Punch Data (CSV / Excel)',
    contentHtml,
    size: 'lg'
  });

  const dropzone = document.getElementById('punch-dropzone');
  const fileInput = document.getElementById('punch-file-input');
  const confirmBtn = document.getElementById('btn-confirm-import-punch');
  let parsedPunches = [];

  dropzone?.addEventListener('click', () => fileInput?.click());

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handlePunchFile(file);
  });

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handlePunchFile(file);
  });

  async function handlePunchFile(file) {
    dropzone.innerHTML = `
      <div class="py-4 text-center">
        <div class="spinner mb-2" style="margin: 0 auto;"></div>
        <div class="font-medium text-primary">Reading & analyzing punches (${(file.size / 1024 / 1024).toFixed(2)} MB)...</div>
        <div class="text-xs text-secondary mt-1">Parsing punches asynchronously without freezing the browser...</div>
      </div>
    `;

    setTimeout(async () => {
      try {
        const rows = await readExcelOrCsvFile(file);
        parsedPunches = normalizePunchImportData(rows);

        dropzone.innerHTML = `
          <div class="upload-icon mb-1 text-success">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <p class="font-semibold text-success">${file.name} loaded (${parsedPunches.length.toLocaleString()} of ${rows.length.toLocaleString()} rows)</p>
          <p class="text-xs text-secondary mt-1">Click to select a different file</p>
        `;

        if (parsedPunches.length === 0) {
          alert('No valid punch rows found. Make sure columns contain Worker ID, Date, Time, and Type.');
          return;
        }

        document.getElementById('punch-import-preview').style.display = 'block';
        document.getElementById('punch-preview-count').textContent = parsedPunches.length.toLocaleString();
        document.getElementById('punch-import-notes').innerHTML = buildPunchImportNotes(rows.length, parsedPunches)
          .map(note => `<li>• ${note}</li>`).join('');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `Ingest ${parsedPunches.length.toLocaleString()} Raw Punches`;

        // Render mini preview table (top 6 rows)
        const previewTable = document.getElementById('punch-preview-table');
        previewTable.querySelector('thead').innerHTML = `
          <tr><th>Worker ID</th><th>Date</th><th>Time</th><th>Type</th></tr>
        `;
        previewTable.querySelector('tbody').innerHTML = parsedPunches.slice(0, 6).map(p => `
          <tr><td><code>${p.workerId}</code></td><td>${p.date}</td><td>${p.time}</td><td>${p.type === 'AUTO' ? `Auto (${p.source || 'no direction'})` : p.type}</td></tr>
        `).join('') + (parsedPunches.length > 6 ? `<tr><td colspan="4" class="text-center text-muted">... and ${(parsedPunches.length - 6).toLocaleString()} more punches</td></tr>` : '');

      } catch (err) {
        dropzone.innerHTML = `
          <p class="text-danger font-medium">Failed to read file: ${err.message}</p>
          <p class="text-xs text-secondary mt-1">Click to try again</p>
        `;
        alert(`Error reading file: ${err.message}`);
      }
    }, 40);
  }

  confirmBtn?.addEventListener('click', () => {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<span class="spinner-sm" style="display:inline-block; vertical-align:middle; margin-right:6px;"></span> Processing ${parsedPunches.length.toLocaleString()} punches...`;

    setTimeout(() => {
      const mode = document.querySelector('input[name="punch-import-mode"]:checked')?.value || 'append';
      store.addRawPunches(parsedPunches, mode);
      modal.close();
      showToast(`Successfully ingested ${parsedPunches.length.toLocaleString()} raw punches!`);
    }, 40);
  });

  document.getElementById('btn-cancel-import-punch')?.addEventListener('click', () => modal.close());
}
