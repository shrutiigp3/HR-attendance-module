/**
 * Holiday Calendar View
 * Factory holidays, marked on a month calendar. Holidays are taken out of Working Days in the
 * salary calculation (a holiday on a worker's weekly off counts only once).
 */

import { store } from '../data/dataStore.js';
import { modal } from './modalManager.js';
import { showToast } from '../utils/toast.js';
import { getDayOfWeek, getCycleKey, getCycleRange } from '../engine/timeUtils.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let holidayState = {
  month: new Date().toISOString().slice(0, 7) // 'YYYY-MM' shown in the calendar
};

const shiftMonth = (month, delta) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};
const cycleLabelOf = (date) => getCycleRange(getCycleKey(date, store.config.cycleStartDay), store.config.cycleStartDay).label;

export function renderHolidayCalendar(container) {
  const holidays = store.holidays;
  const byDate = new Map(holidays.map(h => [h.date, h]));
  const [year, month] = holidayState.month.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = new Date().toISOString().slice(0, 10);
  const monthHolidays = holidays.filter(h => h.date.startsWith(holidayState.month));

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push('<div class="cal-day cal-blank"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${holidayState.month}-${String(d).padStart(2, '0')}`;
    const holiday = byDate.get(date);
    cells.push(`
      <button type="button" class="cal-day ${holiday ? 'is-holiday' : ''} ${date === today ? 'is-today' : ''}" data-date="${date}"
        title="${holiday ? `${holiday.name}: click to edit or remove` : 'Click to mark as a holiday'}">
        <span class="cal-num">${d}</span>
        ${holiday ? `<span class="cal-name">${holiday.name}</span>` : ''}
      </button>`);
  }

  container.innerHTML = `
    <div class="holiday-view animate-fade-in">
      <div class="section-header">
        <div>
          <h2>Holiday Calendar</h2>
          <p class="text-secondary text-sm">Days the factory is closed. Click a date to mark it as a holiday. Holidays are taken out of <strong>Working Days</strong> in the salary calculation.</p>
        </div>
      </div>

      <div class="card p-3 mb-3">
        <form id="holiday-add-form" class="filter-grid" style="grid-template-columns: 1fr 2fr auto;">
          <div class="filter-item">
            <label for="holiday-date">Date</label>
            <input type="date" id="holiday-date" class="form-control" required>
          </div>
          <div class="filter-item">
            <label for="holiday-name">Holiday Name</label>
            <input type="text" id="holiday-name" class="form-control" placeholder="e.g. Diwali">
          </div>
          <div class="filter-item" style="justify-content: flex-end;">
            <button type="submit" class="btn btn-primary btn-sm">Add Holiday</button>
          </div>
        </form>
      </div>

      <div class="card p-3 mb-4">
        <div class="flex justify-between items-center" style="margin-bottom: 12px;">
          <button type="button" class="btn btn-secondary btn-sm" id="holiday-prev-month">‹ Prev</button>
          <div class="font-semibold">${MONTH_NAMES[month - 1]} ${year}
            <span class="text-secondary text-sm">· ${monthHolidays.length} holiday(s)</span>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="holiday-next-month">Next ›</button>
        </div>
        <div class="holiday-calendar">
          ${WEEKDAYS.map(d => `<div class="cal-head">${d}</div>`).join('')}
          ${cells.join('')}
        </div>
      </div>

      <div class="table-responsive card">
        <table class="data-table" id="holiday-table">
          <thead>
            <tr><th>Date</th><th>Day</th><th>Holiday</th><th>Salary Cycle</th><th>Action</th></tr>
          </thead>
          <tbody>
            ${holidays.length === 0 ? `
              <tr><td colspan="5" class="text-center py-6 text-muted">No holidays added yet.</td></tr>
            ` : holidays.map(h => `
              <tr>
                <td class="font-mono">${h.date}</td>
                <td>${getDayOfWeek(h.date)}</td>
                <td class="font-medium">${h.name}</td>
                <td class="text-sm">${cycleLabelOf(h.date)}</td>
                <td><button type="button" class="btn btn-danger-outline btn-sm btn-remove-holiday" data-date="${h.date}">Remove</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelector('#holiday-prev-month')?.addEventListener('click', () => {
    holidayState.month = shiftMonth(holidayState.month, -1);
    renderHolidayCalendar(container);
  });
  container.querySelector('#holiday-next-month')?.addEventListener('click', () => {
    holidayState.month = shiftMonth(holidayState.month, 1);
    renderHolidayCalendar(container);
  });

  container.querySelector('.holiday-calendar')?.addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-day[data-date]');
    if (cell) openHolidayModal(cell.getAttribute('data-date'));
  });

  container.querySelector('#holiday-add-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = container.querySelector('#holiday-date').value;
    if (!date) return;
    // Show the holiday's month; saving redraws the calendar
    holidayState.month = date.slice(0, 7);
    store.saveHoliday(date, container.querySelector('#holiday-name').value);
    showToast(`Holiday added: ${date}`);
  });

  container.querySelector('#holiday-table')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-remove-holiday');
    if (!btn) return;
    const date = btn.getAttribute('data-date');
    if (confirm(`Remove the holiday on ${date}?`)) {
      store.removeHoliday(date);
      showToast(`Holiday removed: ${date}`);
    }
  });
}

function openHolidayModal(date) {
  const existing = store.holidays.find(h => h.date === date);
  modal.open({
    title: `${existing ? 'Edit' : 'Add'} Holiday: ${date} (${getDayOfWeek(date)})`,
    size: 'md',
    contentHtml: `
      <form id="holiday-modal-form" class="modal-form">
        <div class="form-group">
          <label for="holiday-modal-name">Holiday Name</label>
          <input type="text" id="holiday-modal-name" class="form-control" value="${existing ? existing.name : ''}" placeholder="e.g. Diwali">
          <small class="text-secondary">Falls in salary cycle ${cycleLabelOf(date)}.</small>
        </div>
        <div class="form-actions mt-4">
          ${existing ? '<button type="button" class="btn btn-danger-outline" id="btn-remove-holiday-modal">Remove Holiday</button>' : ''}
          <button type="button" class="btn btn-secondary" id="btn-cancel-holiday">Cancel</button>
          <button type="submit" class="btn btn-primary">${existing ? 'Save' : 'Mark as Holiday'}</button>
        </div>
      </form>
    `
  });
  document.getElementById('holiday-modal-name')?.focus();
  document.getElementById('btn-cancel-holiday')?.addEventListener('click', () => modal.close());
  document.getElementById('btn-remove-holiday-modal')?.addEventListener('click', () => {
    store.removeHoliday(date);
    modal.close();
    showToast(`Holiday removed: ${date}`);
  });
  document.getElementById('holiday-modal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    store.saveHoliday(date, document.getElementById('holiday-modal-name').value);
    modal.close();
    showToast(`Holiday saved: ${date}`);
  });
}
