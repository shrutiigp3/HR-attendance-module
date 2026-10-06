/**
 * Main Application Entry Point
 * Orchestrates store, navigation, theme toggle, and global controls.
 */

import { store } from './src/data/dataStore.js';
import { NavigationManager } from './src/ui/navigation.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Theme Setup
  const savedTheme = localStorage.getItem('mfg_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  const themeToggleBtn = document.getElementById('btn-toggle-theme');
  themeToggleBtn?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mfg_theme', next);
    updateThemeIcon(next);
  });

  // 2. Global Actions
  const resetDemoBtn = document.getElementById('btn-global-reset-demo');
  resetDemoBtn?.addEventListener('click', () => {
    if (confirm('Reset to standard pre-loaded demonstration data? This will restore all default shifts, workers, and sample punches.')) {
      store.resetToDemoData();
      showToast('Sample dataset restored successfully!');
    }
  });

  const recalculateBtn = document.getElementById('btn-global-recalc');
  recalculateBtn?.addEventListener('click', () => {
    store.recalculate();
    store.notify();
    showToast('All attendance records recalculated!');
  });

  // Salary details from public/salary-details.json, once the saved data has loaded
  store.ready
    .then(() => store.applySalaryDetailsFile())
    .then(count => {
      if (count) showToast(`Salary details filled for ${count} workers (MC / Operation, Salary type, Shift Hours)`);
    });

  // 3. Initialize Navigation
  const nav = new NavigationManager();
  nav.init();
});

function updateThemeIcon(theme) {
  const iconContainer = document.getElementById('theme-icon');
  if (!iconContainer) return;

  if (theme === 'dark') {
    // Moon icon for dark
    iconContainer.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
    `;
  } else {
    // Sun icon for light
    iconContainer.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
    `;
  }
}

function showToast(message) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => {
    toast.classList.remove('visible');
  }, 2800);
}
