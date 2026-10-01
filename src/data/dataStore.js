/**
 * Central Reactive Data Store
 * Keeps raw punches unchanged, persists to localStorage, and manages state.
 */

import { INITIAL_SHIFTS, INITIAL_CONFIG } from './defaultSettings.js';
import { SAMPLE_WORKERS, SAMPLE_RAW_PUNCHES } from './sampleData.js';
import { AttendanceCalculationEngine } from '../engine/calculationEngine.js';
import { idbGet, idbSet, idbDelete } from './dbStorage.js';

const STORAGE_KEYS = {
  SHIFTS: 'mfg_att_shifts_v1',
  WORKERS: 'mfg_att_workers_v1',
  RAW_PUNCHES: 'mfg_att_raw_punches_v1',
  CONFIG: 'mfg_att_config_v1'
};

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
    this.initAsyncStorage();
  }

  loadFromStorage() {
    try {
      const savedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
      // Defaults first so settings added later (e.g. cycleStartDay) apply to older saved configs
      this.config = { ...INITIAL_CONFIG, ...(savedConfig ? JSON.parse(savedConfig) : {}) };

      const savedShifts = localStorage.getItem(STORAGE_KEYS.SHIFTS);
      this.shifts = savedShifts ? JSON.parse(savedShifts) : JSON.parse(JSON.stringify(INITIAL_SHIFTS));

      const savedWorkers = localStorage.getItem(STORAGE_KEYS.WORKERS);
      this.workers = savedWorkers ? JSON.parse(savedWorkers) : JSON.parse(JSON.stringify(SAMPLE_WORKERS));

      const savedPunches = localStorage.getItem(STORAGE_KEYS.RAW_PUNCHES);
      this.rawPunches = savedPunches ? JSON.parse(savedPunches) : JSON.parse(JSON.stringify(SAMPLE_RAW_PUNCHES));
    } catch (e) {
      console.warn('Could not load from localStorage, using initial defaults', e);
      this.config = { ...INITIAL_CONFIG };
      this.shifts = JSON.parse(JSON.stringify(INITIAL_SHIFTS));
      this.workers = JSON.parse(JSON.stringify(SAMPLE_WORKERS));
      this.rawPunches = JSON.parse(JSON.stringify(SAMPLE_RAW_PUNCHES));
    }

    this.engine.setConfig(this.config);
    this.recalculate();
  }

  async initAsyncStorage() {
    try {
      const [idbWorkers, idbPunches, idbShifts, idbConfig] = await Promise.all([
        idbGet(STORAGE_KEYS.WORKERS),
        idbGet(STORAGE_KEYS.RAW_PUNCHES),
        idbGet(STORAGE_KEYS.SHIFTS),
        idbGet(STORAGE_KEYS.CONFIG)
      ]);

      let changed = false;

      if (idbConfig && typeof idbConfig === 'object') {
        this.config = { ...this.config, ...idbConfig };
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
    } catch (e) {
      // LocalStorage quota exceeded, safely captured in IndexedDB
    }
  }

  resetToDemoData() {
    this.config = { ...INITIAL_CONFIG };
    this.shifts = JSON.parse(JSON.stringify(INITIAL_SHIFTS));
    this.workers = JSON.parse(JSON.stringify(SAMPLE_WORKERS));
    this.rawPunches = JSON.parse(JSON.stringify(SAMPLE_RAW_PUNCHES));
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
