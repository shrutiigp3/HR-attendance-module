/**
 * Shift Management View (Section 2 & 12)
 * Allows adding, editing, deleting, and activating/deactivating shifts dynamically.
 */

import { store } from '../data/dataStore.js';
import { modal } from './modalManager.js';
import { parseTimeToMinutes, formatDuration, isOfficeShift } from '../engine/timeUtils.js';
import { shiftNameFromId } from '../utils/excelUtils.js';

export function renderShiftManagement(container) {
  const shifts = store.shifts;

  // Shift IDs assigned to workers (e.g. from a roster import) that have no definition yet
  const definedIds = new Set(shifts.map(s => s.id));
  const undefinedShiftCounts = new Map();
  for (const w of store.workers) {
    if (w.shiftId && !definedIds.has(w.shiftId)) {
      undefinedShiftCounts.set(w.shiftId, (undefinedShiftCounts.get(w.shiftId) || 0) + 1);
    }
  }

  container.innerHTML = `
    <div class="shift-view animate-fade-in">
      <div class="section-header">
        <div>
          <h2>Manufacturing Shift Management</h2>
          <p class="text-secondary text-sm">Configure shift timings, overnight schedules, and weekly rest days without modifying code or backend.</p>
        </div>

        <div>
          <button id="btn-add-shift" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Add New Shift
          </button>
        </div>
      </div>

      ${undefinedShiftCounts.size > 0 ? `
        <div class="card p-3 mt-4" id="undefined-shifts-panel">
          <div class="font-semibold" style="margin-bottom: 4px;">Shifts assigned to workers but not defined yet</div>
          <p class="text-secondary text-xs" style="margin-bottom: 8px;">Attendance for these workers can't be calculated until the shift's timings are set. Click Define to create it with the same ID.</p>
          ${[...undefinedShiftCounts].map(([id, count]) => `
            <div class="flex justify-between items-center" style="padding: 4px 0;">
              <span><strong>${shiftNameFromId(id)}</strong> <code class="text-xs">${id}</code> · ${count.toLocaleString()} worker(s)</span>
              <button class="btn btn-primary btn-sm btn-define-shift" data-shift-id="${id}">Define</button>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Shifts Grid -->
      <div class="shifts-card-grid mt-4">
        ${shifts.map(shift => {
          const flexible = !!shift.isFlexible;
          const startMin = parseTimeToMinutes(shift.startTime);
          const endMin = parseTimeToMinutes(shift.endTime);
          const isOvernight = !flexible && (shift.isOvernight || endMin < startMin);
          const durationMin = flexible
            ? Math.round(Number(shift.workingHours) * 60)
            : (isOvernight ? (1440 - startMin + endMin) : (endMin - startMin));

          // Count workers assigned to this shift (and, for flexible shifts, those with their own Duty Hrs)
          const assignedWorkers = store.workers.filter(w => w.shiftId === shift.id);
          const assignedCount = assignedWorkers.length;
          const ownDutyCount = flexible ? assignedWorkers.filter(w => Number(w.dutyHours) > 0).length : 0;

          return `
            <div class="card shift-card ${!shift.isActive ? 'shift-inactive' : ''}">
              <div class="shift-card-header">
                <div class="shift-title-block">
                  <h4 class="shift-name">${shift.name}</h4>
                  <span class="shift-code">ID: <code>${shift.id}</code></span>
                </div>
                <div>
                  <span class="badge ${shift.isActive ? 'badge-success' : 'badge-neutral'}">
                    ${shift.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              <div class="shift-timing-badge">
                <span class="timing-text">${flexible ? 'Any time in 24 hours' : `${shift.startTime} – ${shift.endTime}`}</span>
                ${flexible ? `<span class="badge badge-teal text-xs">Flexible</span>` : ''}
                ${isOvernight ? `<span class="badge badge-purple text-xs">🌙 Overnight Shift</span>` : ''}
              </div>

              <div class="shift-details-list">
                <div class="shift-detail-row">
                  <span class="detail-label">${flexible ? 'Required Hours:' : 'Scheduled Hours:'}</span>
                  <span class="detail-val font-semibold">${formatDuration(durationMin)} (${(durationMin / 60).toFixed(1)} hrs)</span>
                </div>
                <div class="shift-detail-row">
                  <span class="detail-label">Weekly Off:</span>
                  <span class="detail-val font-medium text-amber">${shift.weeklyOff || 'None'}</span>
                </div>
                <div class="shift-detail-row">
                  <span class="detail-label">Half-Day Benchmark:</span>
                  <span class="detail-val font-mono">${flexible ? `Less than ${formatDuration(durationMin / 2)} worked` : `${shift.startTime} + ${store.config.halfDayThresholdHours}h`}</span>
                </div>
                <div class="shift-detail-row">
                  <span class="detail-label">Overtime Starts:</span>
                  <span class="detail-val font-mono">${isOfficeShift(shift) ? 'None (Office Shift)' : (flexible ? `After ${formatDuration(durationMin)} + ${store.config.otThresholdMinutes}m worked` : `After ${shift.endTime} + ${store.config.otThresholdMinutes}m`)}</span>
                </div>
                <div class="shift-detail-row">
                  <span class="detail-label">Assigned Workers:</span>
                  <span class="detail-val badge badge-blue">${assignedCount} Workers</span>
                </div>
                ${flexible ? `
                <div class="shift-detail-row">
                  <span class="detail-label">Late / Memo:</span>
                  <span class="detail-val">Not applicable (no start time)</span>
                </div>
                ${ownDutyCount ? `<p class="text-secondary text-xs">${ownDutyCount} of these workers have their own Duty Hrs, which are used instead of ${formatDuration(durationMin)}.</p>` : ''}
                ` : ''}
              </div>

              ${shift.description ? `<p class="shift-desc text-secondary text-xs mt-2">${shift.description}</p>` : ''}

              <div class="shift-card-actions mt-4">
                <button class="btn btn-secondary btn-sm btn-edit-shift" data-shift-id="${shift.id}">
                  Edit
                </button>
                <button class="btn btn-outline btn-sm btn-toggle-shift" data-shift-id="${shift.id}">
                  ${shift.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button class="btn btn-danger-outline btn-sm btn-delete-shift" data-shift-id="${shift.id}" ${assignedCount > 0 ? 'title="Workers currently assigned"' : ''}>
                  Delete
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Attach event handlers
  document.getElementById('btn-add-shift')?.addEventListener('click', () => {
    openShiftFormModal();
  });

  container.querySelectorAll('.btn-define-shift').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-shift-id');
      // Weekly off defaults to None: roster-imported workers carry their own weekly off
      const name = shiftNameFromId(id);
      // Names like "24 Hours Shift" or "Open Shift" usually mean no fixed timings
      openShiftFormModal(null, { id, name, weeklyOff: 'None', isFlexible: /24\s*hours?|open|flexi/i.test(name) });
    });
  });

  container.querySelectorAll('.btn-edit-shift').forEach(btn => {
    btn.addEventListener('click', () => {
      const shiftId = btn.getAttribute('data-shift-id');
      const shift = store.shifts.find(s => s.id === shiftId);
      if (shift) openShiftFormModal(shift);
    });
  });

  container.querySelectorAll('.btn-toggle-shift').forEach(btn => {
    btn.addEventListener('click', () => {
      const shiftId = btn.getAttribute('data-shift-id');
      store.toggleShiftActive(shiftId);
    });
  });

  container.querySelectorAll('.btn-delete-shift').forEach(btn => {
    btn.addEventListener('click', () => {
      const shiftId = btn.getAttribute('data-shift-id');
      const assignedCount = store.workers.filter(w => w.shiftId === shiftId).length;
      if (assignedCount > 0) {
        if (!confirm(`Warning: ${assignedCount} worker(s) are currently assigned to this shift. Are you sure you want to delete it?`)) {
          return;
        }
      } else {
        if (!confirm('Are you sure you want to delete this shift?')) return;
      }
      store.deleteShift(shiftId);
    });
  });
}

function openShiftFormModal(existingShift = null, prefill = {}) {
  const isEdit = !!existingShift;
  const initial = existingShift || prefill;
  const isFlexible = !!initial.isFlexible;
  const daysOfWeek = ['None', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const contentHtml = `
    <form id="shift-modal-form" class="modal-form">
      <div class="form-group">
        <label for="shift-id">Shift ID / Code <span class="text-danger">*</span></label>
        <input type="text" id="shift-id" class="form-control" required ${isEdit ? 'readonly' : ''} value="${initial.id || ''}" placeholder="e.g. PLANT_DAY_3">
      </div>

      <div class="form-group">
        <label for="shift-name">Shift Name <span class="text-danger">*</span></label>
        <input type="text" id="shift-name" class="form-control" required value="${initial.name || ''}" placeholder="e.g. Plant Day 3">
      </div>

      <div class="form-group">
        <label>Shift Type</label>
        <label class="radio-label">
          <input type="radio" name="shift-type" value="fixed" ${isFlexible ? '' : 'checked'}>
          <span><strong>Fixed timings:</strong> set start and end time (e.g. 09:00 – 18:00)</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="shift-type" value="flexible" ${isFlexible ? 'checked' : ''}>
          <span><strong>Flexible:</strong> come any time in the 24 hours; only the working hours are fixed</span>
        </label>
      </div>

      <div id="shift-fixed-fields">
        <div class="form-row">
          <div class="form-group col">
            <label for="shift-start">Start Time (HH:mm) <span class="text-danger">*</span></label>
            <input type="time" id="shift-start" class="form-control" required value="${existingShift?.startTime || '09:00'}">
          </div>
          <div class="form-group col">
            <label for="shift-end">End Time (HH:mm) <span class="text-danger">*</span></label>
            <input type="time" id="shift-end" class="form-control" required value="${existingShift?.endTime || '18:00'}">
          </div>
        </div>

        <div class="form-group">
          <label class="checkbox-container">
            <input type="checkbox" id="shift-overnight" ${existingShift && existingShift.isOvernight ? 'checked' : ''}>
            <span class="checkmark"></span>
            <span><strong>Overnight Shift:</strong> Crosses midnight into next day (e.g. 20:30 to 08:30)</span>
          </label>
        </div>
      </div>

      <div id="shift-flexible-fields">
        <div class="form-group">
          <label for="shift-hours">Required Working Hours <span class="text-danger">*</span></label>
          <input type="number" id="shift-hours" class="form-control" required min="0.5" max="24" step="0.5" value="${initial.workingHours || 8}">
          <small class="text-secondary">
            Worked time = first scan to last scan, day or night. Less than half these hours = Half Day;
            beyond these hours + ${store.config.otThresholdMinutes} min = Overtime. No late marks or memos.
            Workers with their own Duty Hrs (from the employee file) use those instead.
          </small>
        </div>
      </div>

      <div class="form-group">
        <label for="shift-weekly-off">Weekly Off Day</label>
        <select id="shift-weekly-off" class="form-control">
          ${daysOfWeek.map(d => `<option value="${d}" ${initial.weeklyOff === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label for="shift-desc">Description</label>
        <input type="text" id="shift-desc" class="form-control" value="${existingShift ? (existingShift.description || '') : ''}" placeholder="e.g. Operations shift for packaging unit">
      </div>

      <div class="form-group">
        <label class="checkbox-container">
          <input type="checkbox" id="shift-pay-ot" ${existingShift ? (existingShift.payOvertime !== false && !isOfficeShift(existingShift)) : !isOfficeShift(initial)}>
          <span class="checkmark"></span>
          <span><strong>Eligible for Overtime (OT):</strong> Uncheck for Office / Admin shifts where overtime is not considered</span>
        </label>
      </div>

      <div class="form-actions mt-4">
        <button type="button" class="btn btn-secondary" id="btn-cancel-shift">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Shift'}</button>
      </div>
    </form>
  `;

  modal.open({
    title: isEdit ? `Edit Shift: ${existingShift.name}` : 'Add New Manufacturing Shift',
    contentHtml,
    size: 'md'
  });

  document.getElementById('btn-cancel-shift')?.addEventListener('click', () => modal.close());

  // Show the fields for the chosen type; hidden inputs are disabled so their "required" can't block saving
  const selectedType = () => document.querySelector('input[name="shift-type"]:checked')?.value;
  const showTypeFields = () => {
    const flexible = selectedType() === 'flexible';
    for (const [sectionId, visible] of [['shift-fixed-fields', !flexible], ['shift-flexible-fields', flexible]]) {
      const section = document.getElementById(sectionId);
      section.style.display = visible ? '' : 'none';
      section.querySelectorAll('input').forEach(input => { input.disabled = !visible; });
    }
  };
  document.querySelectorAll('input[name="shift-type"]').forEach(radio => radio.addEventListener('change', showTypeFields));
  showTypeFields();

  document.getElementById('shift-modal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('shift-id').value.trim().toUpperCase();
    const name = document.getElementById('shift-name').value.trim();
    const weeklyOff = document.getElementById('shift-weekly-off').value;
    const description = document.getElementById('shift-desc').value.trim();

    if (!id || !name) {
      alert('Please fill in all required shift fields.');
      return;
    }

    let timing;
    if (selectedType() === 'flexible') {
      const workingHours = parseFloat(document.getElementById('shift-hours').value);
      if (!(workingHours > 0 && workingHours <= 24)) {
        alert('Please enter the required working hours (between 0.5 and 24).');
        return;
      }
      timing = { isFlexible: true, workingHours, startTime: '', endTime: '', isOvernight: false };
    } else {
      const startTime = document.getElementById('shift-start').value.trim();
      const endTime = document.getElementById('shift-end').value.trim();
      if (!startTime || !endTime) {
        alert('Please fill in the start and end time.');
        return;
      }
      const isOvernight = document.getElementById('shift-overnight').checked || (parseTimeToMinutes(endTime) < parseTimeToMinutes(startTime));
      timing = { isFlexible: false, startTime, endTime, isOvernight };
    }

    const shiftData = {
      id,
      name,
      ...timing,
      weeklyOff,
      payOvertime: document.getElementById('shift-pay-ot').checked,
      description,
      isActive: existingShift ? existingShift.isActive : true
    };

    if (isEdit) {
      store.updateShift(shiftData);
    } else {
      if (store.shifts.some(s => s.id === id)) {
        alert(`A shift with ID "${id}" already exists. Please choose a unique ID.`);
        return;
      }
      store.addShift(shiftData);
    }

    modal.close();
  });
}
