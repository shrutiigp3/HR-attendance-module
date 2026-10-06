/**
 * Worker & Punch Import Verification
 * Checks that uploaded files keep IDs, names, departments and shift assignments exactly as uploaded,
 * across the column layouts real exports use.
 */

import { parseFastCsv, normalizeWorkerImportData, normalizePunchImportData } from '../src/utils/excelUtils.js';

// JSON with object keys sorted, so field order doesn't matter
const stable = (v) => JSON.stringify(v, (k, val) =>
  val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort()) : val);

function assertEqual(actual, expected, message) {
  const a = stable(actual);
  const e = stable(expected);
  if (a !== e) {
    console.error(`❌ FAILED: ${message} (Expected: ${e}, Got: ${a})`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

const shifts = [
  { id: 'OFFICE', name: 'Office', startTime: '09:00', endTime: '18:00', weeklyOff: 'Sunday' },
  { id: 'PLANT_DAY_1', name: 'Plant Day 1', startTime: '08:30', endTime: '17:00', weeklyOff: 'Thursday' }
];

console.log('--- STARTING IMPORT TESTS ---\n');

// 1. Weekly roster export: Code/Name/Department/Designation + one column per weekday
console.log('Test Suite 1: Weekly Roster Sheet');
const roster = parseFastCsv([
  'Code,Name,Department,Designation,Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday',
  'GP3.901,Amit Rameshbhai Shah,HR,Manager,Week Off,Office Shift,Office Shift,Office Shift,Office Shift,Office Shift,Office Shift',
  'GP3.902,Rohan Sureshbhai Mehta,IT,Executive,Office Shift,Office Shift,Office Shift,Office Shift,Week Off,Office Shift,Office Shift',
  'CN.901,mahesh bhai parmar ,contractor,Helper,24 Hours Shift,24 Hours Shift,24 Hours Shift,24 Hours Shift,24 Hours Shift,24 Hours Shift,24 Hours Shift'
].join('\n'));
const rosterWorkers = normalizeWorkerImportData(roster, shifts);

assertEqual(rosterWorkers[0], {
  id: 'GP3.901', name: 'Amit Rameshbhai Shah', department: 'HR', shiftId: 'OFFICE', isActive: true,
  designation: 'Manager', weeklyOff: 'Sunday'
}, 'ID, name, department, designation kept; "Office Shift" matched to OFFICE; Sunday off');
assertEqual(rosterWorkers[1].weeklyOff, 'Thursday', 'Per-worker weekly off read from roster (Thursday, not the shift default)');
assertEqual(rosterWorkers[2].shiftId, '24_HOURS_SHIFT', 'Shift not in Shift Master keeps its name as a linkable ID');
assertEqual(rosterWorkers[2].weeklyOff, 'None', 'Worker with no "Week Off" day has weekly off None');
assertEqual(rosterWorkers[2].name, 'mahesh bhai parmar', 'Stray whitespace trimmed from name');

// 2. Punch-log export used as a worker source: one worker per Employee ID, no shift
console.log('\nTest Suite 2: Punch Log Used as Worker Source');
const punchLog = parseFastCsv([
  'Employee ID,Employee Name,Department,Punch Date,Punch Time,Device ID,Punch Type',
  'GP3.901,Amit Rameshbhai Shah,HR,16-07-2026,11:17:27,00:11:22:33:44:55,Face Device',
  'GP3.901,Amit Rameshbhai Shah,HR,16-07-2026,18:02:10,00:11:22:33:44:55,Face Device',
  'CN.902,kanubhai jivabhai ,contractor,16-07-2026,08:01:00,00:11:22:33:44:55,Face Device'
].join('\n'));
const logWorkers = normalizeWorkerImportData(punchLog, shifts);
assertEqual(logWorkers.map(w => w.id), ['GP3.901', 'CN.902'], 'Repeated Employee IDs collapse to one worker each');
assertEqual(logWorkers[0].shiftId, '', 'No shift column leaves the worker Unassigned (no invented shift)');
assertEqual('weeklyOff' in logWorkers[0] || 'designation' in logWorkers[0], false, 'No weekly off/designation keys when the file lacks them');

// 3. Classic single "Shift" column still works, by ID or by name
console.log('\nTest Suite 3: Single Shift Column');
const classic = normalizeWorkerImportData(parseFastCsv('Worker ID,Worker Name,Department,Shift\nEMP-1,A,Prod,PLANT_DAY_1\nEMP-2,B,Office,office\nEMP-3,C,Prod,Plant Day 1'), shifts);
assertEqual(classic.map(w => w.shiftId), ['PLANT_DAY_1', 'OFFICE', 'PLANT_DAY_1'], 'Shift resolved by ID, lowercase ID, or name');

// 4. Device punch log: Employee ID / DD-MM-YYYY / HH:MM:SS / no IN-OUT
console.log('\nTest Suite 4: Device Punch Log');
const punches = normalizePunchImportData(punchLog);
assertEqual(punches.map(p => [p.workerId, p.date, p.time, p.type, p.source]), [
  ['GP3.901', '2026-07-16', '11:17:27', 'AUTO', 'Face Device'],
  ['GP3.901', '2026-07-16', '18:02:10', 'AUTO', 'Face Device'],
  ['CN.902', '2026-07-16', '08:01:00', 'AUTO', 'Face Device']
], 'All rows kept; date to ISO, seconds kept, direction AUTO with source label');

// 5. Employee master with company-specific headers: "GP3 ID", "Sub Department", misspelt "Dtuy Hrs", "Weekoff"
console.log('\nTest Suite 5: Employee Master (GP3 ID / Weekoff / Duty Hrs)');
const empData = parseFastCsv([
  'GP3 ID,NAME,Department,Sub Department,Dtuy Hrs,Weekoff',
  'GP3.903,Vijay Kantilal Solanki,Label,Die Cutting,8,Thursday',
  'GP3.904,Dinesh Mohanbhai Joshi,Security,Security,6,No Weekoff',
  'Gp3.905,Hitesh Babulal Rathod,Corrugation,Corrugation,9.5,Sunday',
  'GP3.905,Hitesh Babulal Rathod,Corrugation,Corrugation,9.5,Sunday'
].join('\n'));
const empWorkers = normalizeWorkerImportData(empData, shifts);
assertEqual(empWorkers[0], {
  id: 'GP3.903', name: 'Vijay Kantilal Solanki', department: 'Label', subDepartment: 'Die Cutting',
  dutyHours: 8, weeklyOff: 'Thursday', shiftId: '', isActive: true
}, '"GP3 ID" recognised as the ID; sub department, duty hours and weekly off kept');
assertEqual(empWorkers[1].weeklyOff, 'None', '"No Weekoff" becomes weekly off None');
assertEqual(empWorkers.length, 3, 'IDs differing only in capitals (Gp3.905 / GP3.905) are one worker');
assertEqual(empWorkers[2].dutyHours, 9.5, 'Fractional duty hours kept');

// 6. Saving imports into Worker Master
console.log('\nTest Suite 6: Worker Master Merge (Append / Replace All)');
// The store persists to browser storage; give it an in-memory stand-in under Node
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { store } = await import('../src/data/dataStore.js');
const resetMaster = () => {
  store.workers = [
    { id: 'GP3.905', name: 'Hitesh Babulal Rathod', department: 'Corrugation', shiftId: 'PLANT_DAY_1', weeklyOff: 'Thursday', isActive: true },
    { id: 'CN.901', name: 'mahesh bhai parmar', department: 'contractor', shiftId: 'OFFICE', isActive: true }
  ];
};

resetMaster();
store.importWorkers(empWorkers, 'replace');
const replaced168 = store.workers.find(w => w.id.toLowerCase() === 'gp3.905');
assertEqual(store.workers.map(w => w.id), ['GP3.903', 'GP3.904', 'GP3.905'], 'Replace All keeps only the file\'s workers, with the existing ID spelling');
assertEqual([replaced168.shiftId, replaced168.weeklyOff, replaced168.dutyHours], ['PLANT_DAY_1', 'Sunday', 9.5], 'Replace All keeps the assigned shift; file values (weekly off, duty hrs) win');
assertEqual(store.workers[0].shiftId, '', 'New worker with no shift in file is Unassigned');

resetMaster();
const shiftOnly = normalizeWorkerImportData(parseFastCsv('Code,Shift\nCN.901,Plant Day 1\nGP3.999,Office'), shifts);
store.importWorkers(shiftOnly, 'append');
const cn901 = store.workers.find(w => w.id === 'CN.901');
assertEqual([cn901.name, cn901.department, cn901.shiftId], ['mahesh bhai parmar', 'contractor', 'PLANT_DAY_1'], 'A shift-only file updates the shift without overwriting name/department');
const gp3999 = store.workers.find(w => w.id === 'GP3.999');
assertEqual([gp3999.name, gp3999.department, gp3999.shiftId], ['Unknown Worker', 'General', 'OFFICE'], 'New worker from a file without names gets placeholder name/department');

// 7. Removing every worker in a department at once (e.g. contractors)
console.log('\nTest Suite 7: Remove a Department');
store.workers = [
  { id: 'CN.901', name: 'Contractor One', department: 'contractor', shiftId: 'OFFICE', isActive: true },
  { id: 'GP3.903', name: 'Staff', department: 'Label', shiftId: 'OFFICE', isActive: true },
  { id: 'CN.902', name: 'Contractor Two', department: 'contractor', shiftId: 'OFFICE', isActive: true }
];
store.deleteWorkers(store.workers.filter(w => w.department === 'contractor').map(w => w.id));
assertEqual(store.workers.map(w => w.id), ['GP3.903'], 'Both contractor workers removed; others kept');

console.log('\n🎉 ALL IMPORT TESTS PASSED! 🎉\n');
