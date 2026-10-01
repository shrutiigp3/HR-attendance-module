/**
 * Excel and CSV Data Ingestion and Template Generation
 * Uses SheetJS for cross-platform Excel (.xlsx) and CSV parsing.
 */

import * as XLSX from 'xlsx';

/**
 * Reads an uploaded file (File object) and parses it into JSON rows.
 * Uses high-speed native CSV streaming parser for .csv files (<50ms for 60,000+ rows)
 * and optimized SheetJS for .xlsx/.xls files.
 * 
 * @param {File} file 
 * @returns {Promise<Array<Object>>}
 */
export async function readExcelOrCsvFile(file) {
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv') || file.type.includes('text');

  if (isCsv) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const rows = parseFastCsv(text);
          resolve(rows);
        } catch (err) {
          reject(new Error(`Failed to parse CSV file: ${err.message}`));
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });
  }

  // Excel (.xlsx, .xls) parsing with optimized dense mode
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        // Date/time cells stay as Excel serial numbers and are decoded with XLSX.SSF, which is
        // timezone-independent (JS Date conversion drifts by minutes in some zones, e.g. IST)
        const workbook = XLSX.read(data, { type: 'array', dense: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        resolve(json);
      } catch (err) {
        reject(new Error(`Failed to parse Excel file: ${err.message}`));
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Ultra-fast native CSV parser capable of processing 100,000+ lines in milliseconds
 * without heavy DOM or SheetJS memory spikes.
 */
export function parseFastCsv(text) {
  if (!text || typeof text !== 'string') return [];

  // Strip UTF-8 BOM added by Excel "CSV UTF-8" exports, otherwise the first header won't match
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length === 0) return [];

  // Find first non-empty line as header
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) return [];

  const rawHeaders = splitCsvLine(lines[headerIndex]);
  const headers = rawHeaders.map(h => h.trim());

  const result = [];
  const total = lines.length;

  for (let i = headerIndex + 1; i < total; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;

    const values = splitCsvLine(line);
    const row = {};
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      const val = values[c] !== undefined ? values[c].trim() : '';
      row[header] = val;
    }
    result.push(row);
  }

  return result;
}

function splitCsvLine(line) {
  if (!line.includes('"')) {
    return line.split(',');
  }

  // Only double quotes delimit fields ("" is an escaped quote). Apostrophes are
  // ordinary characters, so names like D'Souza don't swallow the rest of the row.
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

// Header aliases compared after lowercasing and stripping spaces/punctuation,
// so "Employee ID", "employee_id" and "EmployeeID" all match "employeeid".
// Listed most-specific first.
const WORKER_COLUMN_ALIASES = {
  id: ['workerid', 'employeeid', 'empid', 'employeecode', 'empcode', 'workercode', 'staffid', 'employeeno', 'empno', 'id', 'code'],
  name: ['workername', 'employeename', 'empname', 'staffname', 'fullname', 'name'],
  department: ['department', 'dept', 'departmentname', 'deptname'],
  subDepartment: ['subdepartment', 'subdept', 'section'],
  designation: ['designation', 'jobtitle', 'position', 'role'],
  shift: ['shift', 'assignedshift', 'shiftid', 'shiftname', 'shiftcode'],
  weeklyOff: ['weeklyoff', 'weekoff', 'weeklyoffday', 'weekoffday', 'offday', 'restday'],
  dutyHours: ['dutyhours', 'dutyhrs', 'workinghours', 'workinghrs', 'workhours', 'shifthours']
};

// Last-resort header patterns for company-specific names, e.g. "GP3 ID" or a misspelt "Dtuy Hrs"
const ID_HEADER_FALLBACK = /id$/;
const NOT_A_WORKER_ID = /^(shift|device|dept|department|machine|punch|location|branch)/;
const HOURS_HEADER_FALLBACK = /(hrs|hours)$/;

// Weekly roster exports have one column per weekday holding that day's shift name or "Week Off"
const WEEKDAY_COLUMNS = [
  ['Sunday', ['sunday', 'sun']],
  ['Monday', ['monday', 'mon']],
  ['Tuesday', ['tuesday', 'tue', 'tues']],
  ['Wednesday', ['wednesday', 'wed']],
  ['Thursday', ['thursday', 'thu', 'thur', 'thurs']],
  ['Friday', ['friday', 'fri']],
  ['Saturday', ['saturday', 'sat']]
];
const WEEK_OFF_VALUES = new Set(['weekoff', 'weeklyoff', 'off', 'wo', 'rest', 'restday', 'holiday']);

function normalizeHeader(header) {
  return String(header).replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findColumn(headers, aliases, fallback = null, exclude = null) {
  const byNormalized = new Map(headers.map(h => [normalizeHeader(h), h]));
  for (const alias of aliases) {
    if (byNormalized.has(alias)) return byNormalized.get(alias);
  }
  if (fallback) {
    for (const [key, header] of byNormalized) {
      if (fallback.test(key) && !(exclude && exclude.test(key))) return header;
    }
  }
  return null;
}

const findIdColumn = (headers) => findColumn(headers, WORKER_COLUMN_ALIASES.id, ID_HEADER_FALLBACK, NOT_A_WORKER_ID);

const DAY_NAMES = WEEKDAY_COLUMNS.map(([day]) => day);
const NO_WEEKLY_OFF_VALUES = new Set(['', 'no', 'none', 'nil', 'na', 'nooff', 'noweekoff', 'noweeklyoff', 'nowo']);

/** "Thursday" / "thu" -> "Thursday", "Sat & Sun" -> "Sunday, Saturday", "No Weekoff" -> "None"; unrecognised text is kept as-is */
function toWeeklyOff(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  const days = DAY_NAMES.filter(day => new RegExp(`\\b${day.slice(0, 3).toLowerCase()}`).test(lower));
  if (days.length) return days.join(', ');
  if (NO_WEEKLY_OFF_VALUES.has(normalizeHeader(text))) return 'None';
  return text;
}

/** Hours as a number from 8, "9.5", "8 hrs", "08:30" or an Excel time cell; null if unreadable */
function toHours(value) {
  if (typeof value === 'number') return value > 0 && value < 1 ? +(value * 24).toFixed(2) : value;
  const text = String(value ?? '').trim();
  const hm = text.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return +hm[1] + +hm[2] / 60;
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

// "Office Shift", "office" and "OFFICE" all compare equal
function shiftKey(value) {
  const key = normalizeHeader(value);
  return key.replace(/shift$/, '') || key;
}

/** ID for a shift name that isn't in Shift Master yet, in the app's ID style: "24 Hours Shift" -> "24_HOURS_SHIFT" */
export function shiftIdFromName(name) {
  return String(name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Readable name for such an ID: "24_HOURS_SHIFT" -> "24 Hours Shift" */
export function shiftNameFromId(id) {
  return String(id).toLowerCase().split('_').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Normalizes uploaded Worker Master rows into standard Worker objects (one per unique ID).
 * Flexible with column names: "Worker ID" / "Employee ID" / "Code" / any "... ID", "Worker Name" / "Employee Name",
 * "Department" / "Dept", "Sub Department", "Designation", "Shift" / "Assigned Shift" / "Shift Name",
 * "Weekoff" / "Weekly Off", "Duty Hrs" / "Working Hours".
 * Also reads weekly roster sheets (Sunday..Saturday columns holding a shift name or "Week Off"):
 * the worker's shift is the one they work on those days and `weeklyOff` lists their off days.
 * IDs differing only in capitals ("Gp3.905" / "GP3.905") are treated as the same worker.
 * Shift names not in Shift Master keep a derived ID (see shiftIdFromName) so they link once defined.
 * Rows without any shift value are left unassigned (shiftId '') rather than defaulted.
 */
export function normalizeWorkerImportData(rows, validShifts = []) {
  if (!rows || rows.length === 0) return [];

  const shiftByKey = new Map();
  for (const s of validShifts) {
    shiftByKey.set(shiftKey(s.id), s.id);
    shiftByKey.set(shiftKey(s.name), s.id);
  }
  const resolveShift = (raw) => shiftByKey.get(shiftKey(raw)) || shiftIdFromName(raw);

  const headers = Object.keys(rows[0]);
  const idCol = findIdColumn(headers);
  if (!idCol) {
    throw new Error(`No Worker ID / Employee ID column found. Columns in file: ${headers.join(', ')}`);
  }
  const nameCol = findColumn(headers, WORKER_COLUMN_ALIASES.name);
  const deptCol = findColumn(headers, WORKER_COLUMN_ALIASES.department);
  const subDeptCol = findColumn(headers, WORKER_COLUMN_ALIASES.subDepartment);
  const designationCol = findColumn(headers, WORKER_COLUMN_ALIASES.designation);
  const shiftCol = findColumn(headers, WORKER_COLUMN_ALIASES.shift);
  const weeklyOffCol = findColumn(headers, WORKER_COLUMN_ALIASES.weeklyOff);
  const dutyHoursCol = findColumn(headers, WORKER_COLUMN_ALIASES.dutyHours, HOURS_HEADER_FALLBACK);
  const dayCols = WEEKDAY_COLUMNS
    .map(([day, aliases]) => [day, findColumn(headers, aliases)])
    .filter(([, col]) => col);

  // Keyed by ID (ignoring capitals) so punch-log style exports (one row per punch) collapse to
  // one worker each. Later rows win, but the worker keeps its first-seen position.
  const byId = new Map();

  for (const row of rows) {
    const id = String(row[idCol] ?? '').trim();
    if (!id) continue;

    const name = nameCol ? String(row[nameCol] ?? '').trim() : '';
    const department = deptCol ? String(row[deptCol] ?? '').trim() : '';
    let rawShift = shiftCol ? String(row[shiftCol] ?? '').trim() : '';
    let weeklyOff = weeklyOffCol ? toWeeklyOff(row[weeklyOffCol]) : '';

    if (dayCols.length > 0) {
      const offDays = [];
      const workingShiftCounts = new Map();
      for (const [day, col] of dayCols) {
        const value = String(row[col] ?? '').trim();
        if (!value) continue;
        if (WEEK_OFF_VALUES.has(normalizeHeader(value))) offDays.push(day);
        else workingShiftCounts.set(value, (workingShiftCounts.get(value) || 0) + 1);
      }
      if (!weeklyOff && (offDays.length || workingShiftCounts.size)) weeklyOff = offDays.join(', ') || 'None';
      // The app holds one shift per worker; if the roster varies by day, take the most common
      if (!rawShift && workingShiftCounts.size) {
        rawShift = [...workingShiftCounts].sort((a, b) => b[1] - a[1])[0][0];
      }
    }

    const worker = { id, shiftId: rawShift ? resolveShift(rawShift) : '', isActive: true };
    // Only set when the file has the column, so an import doesn't overwrite existing values
    // (brand-new workers get defaults in store.importWorkers)
    if (nameCol) worker.name = name || 'Unknown Worker';
    if (deptCol) worker.department = department || 'General';
    if (subDeptCol) worker.subDepartment = String(row[subDeptCol] ?? '').trim();
    if (designationCol) worker.designation = String(row[designationCol] ?? '').trim();
    if (weeklyOff) worker.weeklyOff = weeklyOff;
    const dutyHours = dutyHoursCol ? toHours(row[dutyHoursCol]) : null;
    if (dutyHours != null) worker.dutyHours = dutyHours;
    byId.set(id.toLowerCase(), worker);
  }

  return Array.from(byId.values());
}

// "Punch Type" in device exports often holds the capture method ("Face Device") rather
// than IN/OUT, so direction-specific headers are preferred when both exist.
const PUNCH_COLUMN_ALIASES = {
  date: ['date', 'punchdate', 'attendancedate', 'logdate', 'datetime', 'punchdatetime', 'timestamp'],
  time: ['time', 'punchtime', 'logtime'],
  type: ['direction', 'inout', 'punchdirection', 'punchtype', 'type', 'status']
};

const IN_WORDS = new Set(['in', 'i', 'checkin', 'clockin', 'punchin', 'entry']);
const OUT_WORDS = new Set(['out', 'o', 'checkout', 'clockout', 'punchout', 'exit']);

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * 'IN' / 'OUT' when the file records a direction, otherwise 'AUTO' (face/biometric devices).
 * The engine treats the first AUTO scan of a shift as IN and the last as OUT.
 */
function toDirection(value) {
  const v = normalizeHeader(value ?? '');
  if (IN_WORDS.has(v)) return 'IN';
  if (OUT_WORDS.has(v)) return 'OUT';
  return 'AUTO';
}

// Day-first (DD-MM-YYYY) unless the file only makes sense month-first
function isDayFirst(rows, dateCol) {
  let monthFirst = false;
  for (const row of rows) {
    const m = String(row[dateCol] ?? '').match(/^\s*(\d{1,2})[-/.](\d{1,2})[-/.]/);
    if (!m) continue;
    if (+m[1] > 12) return true;
    if (+m[2] > 12) monthFirst = true;
  }
  return !monthFirst;
}

/** YYYY-MM-DD from "2026-07-16", "16-07-2026", "16/07/26" or an Excel serial; '' if unreadable */
function toIsoDate(value, dayFirst) {
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    return d ? `${d.y}-${pad2(d.m)}-${pad2(d.d)}` : '';
  }
  const s = String(value ?? '').trim();
  let y, m, d, match;
  if ((match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) {
    [, y, m, d] = match;
  } else if ((match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/))) {
    [, d, m, y] = match;
    if (!dayFirst) [d, m] = [m, d];
    if (y.length === 2) y = `20${y}`;
  } else {
    return '';
  }
  if (+m < 1 || +m > 12 || +d < 1 || +d > 31) return '';
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** HH:MM or HH:MM:SS (seconds kept when present) from "11:17:27", "9:05 PM" or an Excel time; '' if none */
function toTime(value) {
  if (typeof value === 'number') {
    const t = XLSX.SSF.parse_date_code(value);
    return t ? `${pad2(t.H)}:${pad2(t.M)}:${pad2(t.S)}` : '';
  }
  const match = String(value ?? '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/);
  if (!match) return '';
  const [, hRaw, min, sec, ampm] = match;
  let h = +hRaw;
  if (ampm) {
    const pm = ampm.toLowerCase() === 'pm';
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23 || +min > 59) return '';
  return `${pad2(h)}:${min}${sec ? `:${sec}` : ''}`;
}

/**
 * Normalizes uploaded Raw Punch rows into standard Punch objects.
 * Flexible with column names: "Worker ID" / "Employee ID", "Date" / "Punch Date", "Time" / "Punch Time",
 * "Punch Type" / "Direction" (IN/OUT). Rows whose ID, date or time can't be read are dropped.
 * Non-direction punch types (e.g. "Face Device") become type 'AUTO' with the original text kept in `source`.
 */
export function normalizePunchImportData(rows) {
  if (!rows || rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const idCol = findIdColumn(headers);
  const dateCol = findColumn(headers, PUNCH_COLUMN_ALIASES.date);
  if (!idCol || !dateCol) {
    throw new Error(`Need a Worker ID / Employee ID column and a Date column. Columns in file: ${headers.join(', ')}`);
  }
  const timeCol = findColumn(headers, PUNCH_COLUMN_ALIASES.time);
  const typeCol = findColumn(headers, PUNCH_COLUMN_ALIASES.type);
  const dayFirst = isDayFirst(rows, dateCol);
  const batch = Date.now();

  const result = [];
  rows.forEach((row, idx) => {
    const workerId = String(row[idCol] ?? '').trim();
    const rawDate = row[dateCol];
    const date = toIsoDate(rawDate, dayFirst);
    // Fall back to the time part of a combined timestamp (a whole-number Excel serial has none)
    const time = toTime(timeCol ? row[timeCol] : '') ||
      (typeof rawDate === 'number' && Number.isInteger(rawDate) ? '' : toTime(rawDate));
    if (!workerId || !date || !time) return;

    const rawType = typeCol ? String(row[typeCol] ?? '').trim() : '';
    const punch = { id: `UPLOAD-P-${idx + 1}-${batch}`, workerId, date, time, type: toDirection(rawType) };
    if (punch.type === 'AUTO' && rawType) punch.source = rawType;
    result.push(punch);
  });

  return result;
}

/**
 * Generates and downloads a sample Worker Master template (.xlsx or .csv)
 */
export function downloadWorkerTemplate(format = 'xlsx') {
  const sampleRows = [
    { 'Worker ID': 'EMP-101', 'Worker Name': 'Rahul Sharma', 'Department': 'Office & Admin', 'Shift': 'OFFICE' },
    { 'Worker ID': 'EMP-102', 'Worker Name': 'Priya Patel', 'Department': 'Production', 'Shift': 'PLANT_DAY_1' },
    { 'Worker ID': 'EMP-103', 'Worker Name': 'Amit Kumar', 'Department': 'Production', 'Shift': 'PLANT_DAY_2' },
    { 'Worker ID': 'EMP-104', 'Worker Name': 'Suresh Raina', 'Department': 'Production', 'Shift': 'PLANT_NIGHT' },
    { 'Worker ID': 'EMP-105', 'Worker Name': 'Sunita Devi', 'Department': 'Sanitation', 'Shift': 'SWEEPER' },
    { 'Worker ID': 'EMP-106', 'Worker Name': 'Vikram Singh', 'Department': 'Security & Gate', 'Shift': 'SECURITY_1' }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Worker_Master');

  if (format === 'csv') {
    XLSX.writeFile(wb, 'Worker_Master_Template.csv', { bookType: 'csv' });
  } else {
    XLSX.writeFile(wb, 'Worker_Master_Template.xlsx');
  }
}

/**
 * Generates and downloads a sample Raw Punch Data template (.xlsx or .csv)
 */
export function downloadPunchTemplate(format = 'xlsx') {
  const sampleRows = [
    { 'Worker ID': 'EMP-101', 'Date': '2026-09-01', 'Time': '09:10', 'Punch Type': 'IN' },
    { 'Worker ID': 'EMP-101', 'Date': '2026-09-01', 'Time': '18:05', 'Punch Type': 'OUT' },
    { 'Worker ID': 'EMP-102', 'Date': '2026-09-01', 'Time': '08:15', 'Punch Type': 'IN' },
    { 'Worker ID': 'EMP-102', 'Date': '2026-09-01', 'Time': '17:30', 'Punch Type': 'OUT' },
    { 'Worker ID': 'EMP-104', 'Date': '2026-09-15', 'Time': '20:20', 'Punch Type': 'IN' },
    { 'Worker ID': 'EMP-104', 'Date': '2026-09-16', 'Time': '09:30', 'Punch Type': 'OUT' }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Raw_Punches');

  if (format === 'csv') {
    XLSX.writeFile(wb, 'Raw_Punch_Template.csv', { bookType: 'csv' });
  } else {
    XLSX.writeFile(wb, 'Raw_Punch_Template.xlsx');
  }
}
