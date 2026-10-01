/**
 * Configurable Settings View (Section 12)
 * Allows users to adjust grace period, monthly allowed late occurrences, memo amounts,
 * half-day thresholds, and overtime thresholds dynamically.
 */

import { store } from '../data/dataStore.js';
import { INITIAL_CONFIG } from '../data/defaultSettings.js';
import { getCycleRange, ordinal, describeCycle } from '../engine/timeUtils.js';

export function renderSettingsView(container) {
  const config = store.config;
  const cycleText = describeCycle(config.cycleStartDay);

  container.innerHTML = `
    <div class="settings-view animate-fade-in">
      <div class="section-header">
        <div>
          <h2>System Calculation Policy & Rules Configuration</h2>
          <p class="text-secondary text-sm">Rules are completely dynamic and never hardcoded in the calculation engine. Changing any setting triggers immediate recalculation across all historical data.</p>
        </div>

        <div>
          <button id="btn-reset-default-config" class="btn btn-outline btn-sm">
            Reset to Standard Defaults
          </button>
        </div>
      </div>

      <div class="settings-grid mt-4">
        <!-- Settings Form Card -->
        <div class="card settings-form-card">
          <h4 class="card-title">Policy Parameters</h4>
          
          <form id="settings-form">
            <!-- 1. Grace Period -->
            <div class="form-group setting-field-group">
              <div class="setting-info">
                <label for="setting-grace" class="setting-title">Automatic Late Grace Period</label>
                <p class="setting-desc">Employees arriving within this window after shift start incur no late penalty or quota deduction.</p>
              </div>
              <div class="setting-input-wrapper">
                <input type="number" id="setting-grace" class="form-control setting-input" min="0" max="60" value="${config.gracePeriodMinutes}" required>
                <span class="input-suffix">Minutes</span>
              </div>
            </div>

            <!-- 2. Monthly Late Allowance -->
            <div class="form-group setting-field-group">
              <div class="setting-info">
                <label for="setting-allowed-late" class="setting-title">Late Occurrences Allowed per Salary Cycle</label>
                <p class="setting-desc">Number of late occurrences (beyond the grace period) permitted per salary cycle (${cycleText}) without a financial memo penalty.</p>
              </div>
              <div class="setting-input-wrapper">
                <input type="number" id="setting-allowed-late" class="form-control setting-input" min="0" max="10" value="${config.monthlyLateOccurrencesAllowed}" required>
                <span class="input-suffix">Occurrences / Cycle</span>
              </div>
            </div>

            <!-- 3. Memo Amount -->
            <div class="form-group setting-field-group">
              <div class="setting-info">
                <label for="setting-memo" class="setting-title">Memo Penalty Amount</label>
                <p class="setting-desc">Financial penalty imposed for the 3rd and each subsequent late arrival occurrence exceeding monthly quota.</p>
              </div>
              <div class="setting-input-wrapper">
                <span class="input-prefix">₹</span>
                <input type="number" id="setting-memo" class="form-control setting-input pl-6" min="0" max="5000" step="10" value="${config.memoAmount}" required>
              </div>
            </div>

            <!-- 4. Half-Day Threshold -->
            <div class="form-group setting-field-group">
              <div class="setting-info">
                <label for="setting-halfday" class="setting-title">Half-Day Threshold Hours (After Shift Start)</label>
                <p class="setting-desc">Calculated dynamically: Shift Start + N Hours. Workers arriving after this threshold are marked Half Day.</p>
              </div>
              <div class="setting-input-wrapper">
                <input type="number" id="setting-halfday" class="form-control setting-input" min="1" max="12" step="0.5" value="${config.halfDayThresholdHours}" required>
                <span class="input-suffix">Hours</span>
              </div>
            </div>

            <!-- 5. Overtime Threshold -->
            <div class="form-group setting-field-group">
              <div class="setting-info">
                <label for="setting-ot" class="setting-title">Overtime (OT) Threshold After Shift End</label>
                <p class="setting-desc">OT starts strictly N minutes after scheduled shift end. Early arrival before shift start is never counted as overtime.</p>
              </div>
              <div class="setting-input-wrapper">
                <input type="number" id="setting-ot" class="form-control setting-input" min="0" max="120" value="${config.otThresholdMinutes}" required>
                <span class="input-suffix">Minutes</span>
              </div>
            </div>

            <!-- 6. Salary / Attendance Cycle -->
            <div class="form-group setting-field-group">
              <div class="setting-info">
                <label for="setting-cycle-start" class="setting-title">Salary / Attendance Cycle Start Day</label>
                <p class="setting-desc">Each cycle runs from this day to the day before it in the next month (22 = 22nd to 21st). Late counters and memos reset at the start of each cycle. Use 1 for calendar months.</p>
              </div>
              <div class="setting-input-wrapper">
                <input type="number" id="setting-cycle-start" class="form-control setting-input" min="1" max="28" step="1" value="${config.cycleStartDay}" required>
                <span class="input-suffix">Day of Month</span>
              </div>
            </div>

            <div class="form-actions mt-6">
              <button type="submit" class="btn btn-primary" id="btn-save-settings">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Save Policy & Recalculate
              </button>
            </div>
          </form>
        </div>

        <!-- Live Policy Preview & Explanations Card -->
        <div class="card policy-preview-card">
          <h4 class="card-title">Live Policy Impact Simulation</h4>
          <p class="text-secondary text-xs mb-4">Example scenario based on an Office Shift (09:00–18:00) with current settings:</p>

          <div class="simulation-list">
            <div class="simulation-item">
              <div class="sim-badge badge-teal">Grace Period</div>
              <div class="sim-text">
                Shift starts at 09:00. Allowed arrival with 0 penalty = <strong>09:${String(config.gracePeriodMinutes).padStart(2, '0')}</strong>.
              </div>
            </div>

            <div class="simulation-item">
              <div class="sim-badge badge-amber">Late Occurrences</div>
              <div class="sim-text">
                Arrivals beyond 09:${String(config.gracePeriodMinutes).padStart(2, '0')}: First <strong>${config.monthlyLateOccurrencesAllowed}</strong> are warning/free. 
                Occurrence #<strong>${config.monthlyLateOccurrencesAllowed + 1}</strong> triggers <strong>₹${config.memoAmount}</strong> memo.
              </div>
            </div>

            <div class="simulation-item">
              <div class="sim-badge badge-orange">Half-Day Benchmark</div>
              <div class="sim-text">
                Office shift half-day cutoff: 09:00 + ${config.halfDayThresholdHours}h = <strong>${String(9 + Number(config.halfDayThresholdHours)).padStart(2, '0')}:00</strong>.
                Arriving after this time marks attendance as Half Day.
              </div>
            </div>

            <div class="simulation-item">
              <div class="sim-badge badge-purple">Overtime Benchmark</div>
              <div class="sim-text">
                Shift ends at 18:00. OT Start = 18:00 + ${config.otThresholdMinutes}m = <strong>18:${String(config.otThresholdMinutes).padStart(2, '0')}</strong>.
                Departure at 18:30 gives exactly <strong>${Math.max(0, 30 - config.otThresholdMinutes)} minutes OT</strong>.
              </div>
            </div>

            <div class="simulation-item">
              <div class="sim-badge badge-blue">Cycle Auto-Reset</div>
              <div class="sim-text">
                ${config.cycleStartDay > 1
                  ? `Salary cycle runs <strong>${cycleText}</strong> (e.g. ${getCycleRange('2026-09', config.cycleStartDay).label}). On the ${ordinal(config.cycleStartDay)} of every month, the late occurrence counter resets to 0 for all workers.`
                  : 'On the 1st of every calendar month, the late occurrence counter automatically resets to 0 for all workers.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach event handlers
  document.getElementById('settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const gracePeriodMinutes = parseInt(document.getElementById('setting-grace').value, 10);
    const monthlyLateOccurrencesAllowed = parseInt(document.getElementById('setting-allowed-late').value, 10);
    const memoAmount = parseFloat(document.getElementById('setting-memo').value);
    const halfDayThresholdHours = parseFloat(document.getElementById('setting-halfday').value);
    const otThresholdMinutes = parseInt(document.getElementById('setting-ot').value, 10);
    const cycleStartDay = parseInt(document.getElementById('setting-cycle-start').value, 10);

    store.updateConfig({
      gracePeriodMinutes,
      monthlyLateOccurrencesAllowed,
      memoAmount,
      halfDayThresholdHours,
      otThresholdMinutes,
      cycleStartDay
    });

    alert('Settings successfully updated! All attendance records have been recomputed with the new rules.');
  });

  document.getElementById('btn-reset-default-config')?.addEventListener('click', () => {
    if (confirm('Reset all calculation parameters to standard manufacturing defaults?')) {
      store.updateConfig(INITIAL_CONFIG);
    }
  });
}
