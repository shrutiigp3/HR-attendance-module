/**
 * Navigation Manager
 * Handles tab switching, URL hash sync, and view re-rendering.
 */

import { store } from '../data/dataStore.js';
import { renderDashboard } from './dashboardView.js';
import { renderAttendanceReport } from './attendanceView.js';
import { renderShiftManagement } from './shiftView.js';
import { renderWorkerManagement } from './workerView.js';
import { renderRawPunchView } from './rawPunchView.js';
import { renderAnomalyReview } from './anomalyView.js';
import { renderSettingsView } from './settingsView.js';
import { renderPreservingFocus } from './renderUtils.js';

export class NavigationManager {
  constructor() {
    this.currentTab = 'dashboard';
    this.container = document.getElementById('view-content');
    this.navLinks = document.querySelectorAll('.nav-tab-btn');
  }

  init() {
    // Click listeners on nav buttons
    this.navLinks.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = btn.getAttribute('data-tab');
        this.navigateTo(tab);
      });
    });

    // Hash change support
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '') || 'dashboard';
      this.navigateTo(hash, false);
    });

    // Initial navigation
    const initialHash = window.location.hash.replace('#', '') || 'dashboard';
    this.navigateTo(initialHash, false);

    // Subscribe to store updates to re-render active tab
    store.subscribe(() => {
      this.renderCurrentView();
      this.updateBadges();
    });

    this.updateBadges();
  }

  navigateTo(tabName, updateHash = true) {
    const validTabs = ['dashboard', 'attendance', 'shifts', 'workers', 'raw-punches', 'anomalies', 'settings'];
    const activeTab = validTabs.includes(tabName) ? tabName : 'dashboard';

    this.currentTab = activeTab;

    if (updateHash) {
      window.location.hash = activeTab;
    }

    // Update active nav button
    this.navLinks.forEach(btn => {
      if (btn.getAttribute('data-tab') === activeTab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // The entrance fade plays when switching tabs, not on every re-render within a tab
    // (search, filters, paging), where it made the page look like it was reloading
    this.container?.classList.remove('view-settled');
    this.renderCurrentView();
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.container?.classList.add('view-settled'), 300);
  }

  renderCurrentView() {
    if (!this.container) return;
    renderPreservingFocus(() => this._renderTab());
  }

  _renderTab() {
    switch (this.currentTab) {
      case 'dashboard':
        renderDashboard(this.container);
        break;
      case 'attendance':
        renderAttendanceReport(this.container);
        break;
      case 'shifts':
        renderShiftManagement(this.container);
        break;
      case 'workers':
        renderWorkerManagement(this.container);
        break;
      case 'raw-punches':
        renderRawPunchView(this.container);
        break;
      case 'anomalies':
        renderAnomalyReview(this.container);
        break;
      case 'settings':
        renderSettingsView(this.container);
        break;
      default:
        renderDashboard(this.container);
    }
  }

  updateBadges() {
    const records = store.calculatedData?.records || [];
    const anomalyCount = records.filter(r => r.hasAnomaly || r.hasMissingPunch).length;
    const badgeEl = document.getElementById('nav-anomaly-badge');
    if (badgeEl) {
      badgeEl.textContent = anomalyCount;
      badgeEl.style.display = anomalyCount > 0 ? 'inline-flex' : 'none';
    }

    const workerBadge = document.getElementById('nav-worker-badge');
    if (workerBadge) {
      workerBadge.textContent = store.workers.length;
    }

    const shiftBadge = document.getElementById('nav-shift-badge');
    if (shiftBadge) {
      shiftBadge.textContent = store.shifts.length;
    }
  }
}
