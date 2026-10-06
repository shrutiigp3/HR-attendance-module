/**
 * Central Reactive Data Store
 * Keeps raw punches unchanged, persists to localStorage, and manages state.
 */

import { INITIAL_SHIFTS, INITIAL_CONFIG } from './defaultSettings.js';
import { SAMPLE_WORKERS, SAMPLE_RAW_PUNCHES } from './sampleData.js';
import { AttendanceCalculationEngine } from '../engine/calculationEngine.js';
import { idbGet, idbSet, idbDelete } from './dbStorage.js';
import { DEFAULT_SALARY_CONFIG, SALARY_PROFILE_FIELDS } from '../engine/salaryEngine.js';

const STORAGE_KEYS = {
  SHIFTS: 'mfg_att_shifts_v1',
  WORKERS: 'mfg_att_workers_v1',
  RAW_PUNCHES: 'mfg_att_raw_punches_v1',
  CONFIG: 'mfg_att_config_v1',
  SALARY: 'mfg_att_salary_v1',
  HOLIDAYS: 'mfg_att_holidays_v1'
};

// Salary sheet data: per-worker details kept across cycles, and per-cycle values
// (approved leaves, other, advance, loan, statutory overrides), both keyed by lower-case worker ID
const emptySalaryData = () => ({ profiles: {}, inputs: {} });

// Overtime pay became 1.5× by default. Salary settings saved earlier with the old 1× default are
// moved to 1.5× once; a rate chosen in Salary Settings afterwards is kept (otRateConfirmed).
function withCurrentOtRate(config) {
  const salary = config.salary;
  if (!salary || salary.otRateConfirmed || salary.otRateMultiplier !== 1) return config;
  return { ...config, salary: { ...salary, otRateMultiplier: 1.5, otRateConfirmed: true } };
}

class DataStore {
  constructor() {
    this.engine = new AttendanceCalculationEngine(INITIAL_CONFIG);
    this.listeners = new Set();
    this.filters = {
      dateFrom: '',
      dateTo: '',
      month: '',
      workerId: 'ALL',
      department: 'ALL',
      shiftId: 'ALL',
      status: 'ALL',
      search: ''
    };

    this.loadFromStorage();
    // Resolves once the saved data has been loaded from IndexedDB
    this.ready = this.initAsyncStorage();
  }

  loadFromStorage() {
    try {
      const savedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
      // Defaults first so settings added later (e.g. cycleStartDay) apply to older saved configs
      this.config = withCurrentOtRate({ ...INITIAL_CONFIG, ...(savedConfig ? JSON.parse(savedConfig) : {}) });

      const savedShifts = localStorage.getItem(STORAGE_KEYS.SHIFTS);
      this.shifts = savedShifts ? JSON.parse(savedShifts) : JSON.parse(JSON.stringify(INITIAL_SHIFTS));

      const savedWorkers = localStorage.getItem(STORAGE_KEYS.WORKERS);
      this.workers = savedWorkers ? JSON.parse(savedWorkers) : JSON.parse(JSON.stringify(SAMPLE_WORKERS));

      const savedPunches = localStorage.getItem(STORAGE_KEYS.RAW_PUNCHES);
      this.rawPunches = savedPunches ? JSON.parse(savedPunches) : JSON.parse(JSON.stringify(SAMPLE_RAW_PUNCHES));

      const savedSalary = localStorage.getItem(STORAGE_KEYS.SALARY);
      this.salary = savedSalary ? { ...emptySalaryData(), ...JSON.parse(savedSalary) } : emptySalaryData();

      const savedHolidays = localStorage.getItem(STORAGE_KEYS.HOLIDAYS);
      this.holidays = savedHolidays ? JSON.parse(savedHolidays) : [];
    } catch (e) {
      console.warn('Could not load from localStorage, using initial defaults', e);
      this.config = { ...INITIAL_CONFIG };
      this.shifts = JSON.parse(JSON.stringify(INITIAL_SHIFTS));
      this.workers = JSON.parse(JSON.stringify(SAMPLE_WORKERS));
      this.rawPunches = JSON.parse(JSON.stringify(SAMPLE_RAW_PUNCHES));
      this.salary = emptySalaryData();
      this.holidays = [];
    }

    this.engine.setConfig(this.config);
    this.recalculate();
  }

  async initAsyncStorage() {
    try {
      const [idbWorkers, idbPunches, idbShifts, idbConfig, idbSalary, idbHolidays] = await Promise.all([
        idbGet(STORAGE_KEYS.WORKERS),
        idbGet(STORAGE_KEYS.RAW_PUNCHES),
        idbGet(STORAGE_KEYS.SHIFTS),
        idbGet(STORAGE_KEYS.CONFIG),
        idbGet(STORAGE_KEYS.SALARY),
        idbGet(STORAGE_KEYS.HOLIDAYS)
      ]);

      let changed = false;

      if (idbConfig && typeof idbConfig === 'object') {
        this.config = withCurrentOtRate({ ...this.config, ...idbConfig });
        this.engine.setConfig(this.config);
        changed = true;
      }

      if (Array.isArray(idbShifts) && idbShifts.length > 0) {
        this.shifts = idbShifts;
        changed = true;
      }

      if (Array.isArray(idbWorkers) && idbWorkers.length > 0) {
        this.workers = idbWorkers;
        changed = true;
      }

      if (Array.isArray(idbPunches) && idbPunches.length > 0) {
        this.rawPunches = idbPunches;
        changed = true;
      }

      if (idbSalary && typeof idbSalary === 'object') {
        this.salary = { ...emptySalaryData(), ...idbSalary };
        changed = true;
      }

      if (Array.isArray(idbHolidays)) {
        this.holidays = idbHolidays;
        changed = true;
      }

      if (changed) {
        this.recalculate();
        this.notify();
      }
    } catch (err) {
      console.warn('Error loading from IndexedDB:', err);
    }
  }

  saveToStorage() {
    // 1. Asynchronously persist to high-capacity IndexedDB (handles 50,000+ records with zero lag)
    idbSet(STORAGE_KEYS.CONFIG, this.config);
    idbSet(STORAGE_KEYS.SHIFTS, this.shifts);
    idbSet(STORAGE_KEYS.WORKERS, this.workers);
    idbSet(STORAGE_KEYS.RAW_PUNCHES, this.rawPunches);
    idbSet(STORAGE_KEYS.SALARY, this.salary);
    idbSet(STORAGE_KEYS.HOLIDAYS, this.holidays);

    // 2. Safe sync to localStorage for quick boot when dataset is compact (< 2000 rows)
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
      localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(this.shifts));
      if (this.workers.length <= 1500) {
        localStorage.setItem(STORAGE_KEYS.WORKERS, JSON.stringify(this.workers));
      }
      if (this.rawPunches.length <= 2500) {
        localStorage.setItem(STORAGE_KEYS.RAW_PUNCHES, JSON.stringify(this.rawPunches));
      }
      localStorage.setItem(STORAGE_KEYS.SALARY, JSON.stringify(this.salary));
      localStorage.setItem(STORAGE_KEYS.HOLIDAYS, JSON.stringify(this.holidays));
    } catch (e) {
      // LocalStorage quota exceeded, safely captured in IndexedDB
    }
  }

  resetToDemoData() {
    this.config = { ...INITIAL_CONFIG };
    this.shifts = JSON.parse(JSON.stringify(INITIAL_SHIFTS));
    this.workers = JSON.parse(JSON.stringify(SAMPLE_WORKERS));
    this.rawPunches = JSON.parse(JSON.stringify(SAMPLE_RAW_PUNCHES));
    this.salary = emptySalaryData();
    this.holidays = [];
    this.engine.setConfig(this.config);
    this.saveToStorage();
    this.recalculate();
    this.notify();
  }

  recalculate() {
    this.calculatedData = this.engine.processAttendance(this.workers, this.shifts, this.rawPunches);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (err) {
        console.error('Listener notification error:', err);
      }
    }
  }

  // --- CONFIG / SETTINGS MANAGEMENT ---
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.engine.setConfig(this.config);
    this.saveToStorage();
    this.recalculate();
    this.notify();
  }

  // --- SALARY ---
  get salaryConfig() {
    return { ...DEFAULT_SALARY_CONFIG, ...(this.config.salary || {}) };
  }

  // Salary settings don't affect attendance, so no recalculation is needed
  updateSalaryConfig(changes) {
    this.config = { ...this.config, salary: { ...this.salaryConfig, ...changes, otRateConfirmed: true } };
    this.saveToStorage();
    this.notify();
  }

  /**
   * Saves one value typed into the salary sheet. Per-worker fields (SALARY_PROFILE_FIELDS) are kept
   * for every cycle; the rest belong to this cycle. An empty value clears it (back to calculated).
   * Doesn't notify: the salary view redraws itself so keyboard focus can move on to the next cell.
   */
  setSalaryValue(workerId, cycleKey, field, value) {
    const key = String(workerId).toLowerCase();
    const isProfileField = SALARY_PROFILE_FIELDS.includes(field);
    const current = isProfileField ? this.salary.profiles[key] : this.salary.inputs[cycleKey]?.[key];
    const updated = { ...(current || {}) };
    if (value === '' || value == null) delete updated[field];
    else updated[field] = value;

    this.salary = isProfileField
      ? { ...this.salary, profiles: { ...this.salary.profiles, [key]: updated } }
      : { ...this.salary, inputs: { ...this.salary.inputs, [cycleKey]: { ...(this.salary.inputs[cycleKey] || {}), [key]: updated } } };
    // Only the salary data changed, so don't rewrite the (large) punch data
    idbSet(STORAGE_KEYS.SALARY, this.salary);
    try {
      localStorage.setItem(STORAGE_KEYS.SALARY, JSON.stringify(this.salary));
    } catch (e) {
      // LocalStorage quota exceeded, safely captured in IndexedDB
    }
  }

  /**
   * Fills salary details (MC / Operation, Salary type, Shift Hours) from public/salary-details.json,
   * a company file kept out of git. Applied once per file version, after the saved data has loaded,
   * so values typed in the app later are never overwritten. Returns how many workers were filled
   * (0 when the file is missing or this version was already applied).
   */
  async applySalaryDetailsFile(url = '/salary-details.json') {
    let data;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return 0;
      data = await response.json();
    } catch {
      return 0; // no file (the dev server may answer with the HTML page instead)
    }
    if (!data?.version || !Array.isArray(data.workers) || this.salary.detailsFileVersion === data.version) return 0;

    const profiles = { ...this.salary.profiles };
    for (const entry of data.workers) {
      const key = String(entry.id).toLowerCase();
      const values = Object.fromEntries(Object.entries(entry).filter(([field, v]) => SALARY_PROFILE_FIELDS.includes(field) && v !== '' && v != null));
      profiles[key] = { ...(profiles[key] || {}), ...values };
    }
    this.salary = { ...this.salary, profiles, detailsFileVersion: data.version };
    this.saveToStorage();
    this.notify();
    return data.workers.length;
  }

  // --- HOLIDAY CALENDAR ---
  // Factory holidays ({ date: 'YYYY-MM-DD', name }) are taken out of Working Days in the salary
  // calculation; attendance itself doesn't change, so no recalculation is needed

  saveHoliday(date, name) {
    const holiday = { date, name: String(name || '').trim() || 'Holiday' };
    this.holidays = [...this.holidays.filter(h => h.date !== date), holiday].sort((a, b) => a.date.localeCompare(b.date));
    this.saveToStorage();
    this.notify();
  }

  removeHoliday(date) {
    this.holidays = this.holidays.filter(h => h.date !== date);
    this.saveToStorage();
    this.notify();
  }

  // --- SHIFT MANAGEMENT ---
  addShift(shift) {
    this.shifts.push(shift);
    this.saveToStorage();
    this.recalculate();
    this.notify();
  }

  updateShift(updatedShift) {
    const idx = this.shifts.findIndex(s => s.id === updatedShift.id);
    if (idx !== -1) {
      this.shifts[idx] = updatedShift;
      this.saveToStorage();
      this.recalculate();
      this.notify();
    }
  }

  deleteShift(shiftId) {
    this.shifts = this.shifts.filter(s => s.id !== shiftId);
    this.saveToStorage();
    this.recalculate();
    this.notify();
  }

  toggleShiftActive(shiftId) {
    const shift = this.shifts.find(s => s.id === shiftId);
    if (shift) {
      shift.isActive = !shift.isActive;
      this.saveToStorage();
      this.recalculate();
      this.notify();
    }
  }

  // --- WORKER MANAGEMENT ---
  addWorker(worker) {
    this.workers.push(worker);
    this.saveToStorage();
    this.recalculate();
    this.notify();
  }

  updateWorker(updatedWorker) {
    const idx = this.workers.findIndex(w => w.id === updatedWorker.id);
    if (idx !== -1) {
      this.workers[idx] = updatedWorker;
      this.saveToStorage();
      this.recalculate();
      this.notify();
    }
  }

  assignWorkerShift(workerId, newShiftId) {
    const worker = this.workers.find(w => w.id === workerId);
    if (worker) {
      worker.shiftId = newShiftId;
      this.saveToStorage();
      this.recalculate();
      this.notify();
    }
  }

  deleteWorker(workerId) {
    this.workers = this.workers.filter(w => w.id !== workerId);
    this.saveToStorage();
    this.recalculate();
    this.notify();
  }

  // Removes several workers with a single save and recalculation. Their raw punches are kept.
  deleteWorkers(workerIds) {
    const remove = new Set(workerIds);
    this.workers = this.workers.filter(w => !remove.has(w.id));
    this.saveToStorage();
    this.recalculate();
    this.notify();
  }

  importWorkers(newWorkers, mode = 'append') {
    // High-performance O(1) index map for instant merging of 50,000+ workers.
    // IDs match ignoring capitals ("Gp3.905" updates "GP3.905"), keeping the existing spelling.
    const idMap = new Map();
    for (let i = 0; i < this.workers.length; i++) {
      idMap.set(String(this.workers[i].id).toLowerCase(), i);
    }
    // Fields the file doesn't have keep their current values; a blank shift must not wipe
    // a manually assigned one
    // Brand-new workers need a name/department even if the file had no such column
    const withDefaults = (w) => ({ name: 'Unknown Worker', department: 'General', ...w });
    const mergeWithExisting = (w) => {
      const idx = idMap.get(String(w.id).toLowerCase());
      if (idx === undefined) return withDefaults(w);
      const existing = this.workers[idx];
      return { ...existing, ...w, id: existing.id, shiftId: w.shiftId || existing.shiftId };
    };

    if (mode === 'replace') {
      // Only the workers in the file remain, but their existing shift and other details carry over
      this.workers = newWorkers.map(mergeWithExisting);
    } else {
      for (const w of newWorkers) {
        const key = String(w.id).toLowerCase();
        if (idMap.has(key)) {
          this.workers[idMap.get(key)] = mergeWithExisting(w);
        } else {
          idMap.set(key, this.workers.length);
          this.workers.push(withDefaults(w));
        }
      }
    }
    this.saveToStorage();
    this.recalculate();
    this.notify();
  }

  // --- RAW PUNCH MANAGEMENT ---
  // Keeps raw punch data unchanged and maintains a separate processed dataset
  addRawPunches(newPunches, mode = 'append') {
    if (mode === 'replace') {
      this.rawPunches = newPunches;
    } else {
      this.rawPunches = [...this.rawPunches, ...newPunches];
    }
    this.saveToStorage();
    this.recalculate();
    this.notify();
  }

  clearRawPunches() {
    this.rawPunches = [];
    this.saveToStorage();
    this.recalculate();
    this.notify();
  }

  // --- FILTER MANAGEMENT ---
  setFilters(newFilters) {
    this.filters = { ...this.filters, ...newFilters };
    this.notify();
  }

  resetFilters() {
    this.filters = {
      dateFrom: '',
      dateTo: '',
      month: '',
      workerId: 'ALL',
      department: 'ALL',
      shiftId: 'ALL',
      status: 'ALL',
      search: ''
    };
    this.notify();
  }

  getFilteredRecords() {
    const { records } = this.calculatedData;
    const { dateFrom, dateTo, month, workerId, department, shiftId, status, search } = this.filters;

    return records.filter(record => {
      if (dateFrom && record.date < dateFrom) return false;
      if (dateTo && record.date > dateTo) return false;
      if (month && record.month !== month) return false;
      if (workerId && workerId !== 'ALL' && record.workerId !== workerId) return false;
      if (department && department !== 'ALL' && record.department !== department) return false;
      if (shiftId && shiftId !== 'ALL' && record.shiftId !== shiftId) return false;

      // Status filters
      if (status === 'LATE' && record.lateMinutes <= 0) return false;
      if (status === 'GRACE' && !record.isGrace) return false;
      if (status === 'HALFDAY' && !record.isHalfDay) return false;
      if (status === 'OT' && record.otMinutes <= 0) return false;
      if (status === 'MEMO' && record.memoCount <= 0) return false;
      if (status === 'ANOMALY' && !record.hasAnomaly) return false;

      // Text search
      if (search) {
        const q = search.toLowerCase();
        const text = `${record.workerId} ${record.workerName} ${record.department} ${record.shiftName} ${record.date}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });
  }
}

export const store = new DataStore();
