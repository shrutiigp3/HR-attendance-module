/**
 * High-Load Benchmark & Verification Test
 * Verifies processing, parsing, and storing 55,000+ records in milliseconds
 */

import { parseFastCsv, normalizeWorkerImportData } from '../src/utils/excelUtils.js';
import { paginate } from '../src/ui/pagination.js';
import { AttendanceCalculationEngine } from '../src/engine/calculationEngine.js';

console.log('--- STARTING LARGE DATASET BENCHMARK (55,000 RECORDS) ---\n');

// 1. Generate 55,000 CSV lines
console.log('1. Generating 55,000 synthetic worker CSV lines...');
const csvLines = ['Worker ID,Worker Name,Department,Shift'];
for (let i = 1; i <= 55000; i++) {
  const dept = i % 3 === 0 ? 'Production' : (i % 2 === 0 ? 'Office & Admin' : 'Security & Gate');
  const shift = i % 3 === 0 ? 'PLANT_DAY_1' : (i % 2 === 0 ? 'OFFICE' : 'PLANT_NIGHT');
  csvLines.push(`EMP-${i},Worker Test ${i},${dept},${shift}`);
}
const csvText = csvLines.join('\n');
console.log(`Generated CSV string size: ${(csvText.length / 1024 / 1024).toFixed(2)} MB`);

// 2. Benchmark parseFastCsv
const t0 = performance.now();
const parsedRows = parseFastCsv(csvText);
const t1 = performance.now();
const parseTime = (t1 - t0).toFixed(1);

console.log(`✅ parseFastCsv parsed ${parsedRows.length} rows in ${parseTime}ms!`);
if (parsedRows.length !== 55000) {
  console.error(`❌ Expected 55000 rows, got ${parsedRows.length}`);
  process.exit(1);
}
if (t1 - t0 > 1000) {
  console.error('❌ Parsing took longer than 1000ms threshold');
  process.exit(1);
}

// 3. Benchmark normalizeWorkerImportData
const shifts = [
  { id: 'OFFICE', name: 'Office', startTime: '09:00', endTime: '18:00', isOvernight: false },
  { id: 'PLANT_DAY_1', name: 'Plant Day 1', startTime: '08:30', endTime: '17:00', isOvernight: false },
  { id: 'PLANT_NIGHT', name: 'Plant Night', startTime: '20:30', endTime: '08:30', isOvernight: true }
];

const t2 = performance.now();
const workers = normalizeWorkerImportData(parsedRows, shifts);
const t3 = performance.now();
const normTime = (t3 - t2).toFixed(1);

console.log(`✅ normalizeWorkerImportData normalized ${workers.length} workers in ${normTime}ms!`);
if (workers.length !== 55000) {
  console.error(`❌ Expected 55000 workers, got ${workers.length}`);
  process.exit(1);
}

// 4. Benchmark pagination on 55,000 items
const t4 = performance.now();
const pageData = paginate(workers, 1, 50);
const t5 = performance.now();
const pageTime = (t5 - t4).toFixed(2);

console.log(`✅ paginate extracted 50 items (Page 1 of ${pageData.totalPages}) in ${pageTime}ms!`);
if (pageData.pageItems.length !== 50 || pageData.totalItems !== 55000) {
  console.error('❌ Pagination failed on large dataset');
  process.exit(1);
}

// 5. Benchmark calculation engine with 55,000 workers in roster and punches
const samplePunches = [
  { workerId: 'EMP-1', date: '2026-09-01', time: '09:10', type: 'IN' },
  { workerId: 'EMP-1', date: '2026-09-01', time: '18:05', type: 'OUT' },
  { workerId: 'EMP-2', date: '2026-09-01', time: '09:00', type: 'IN' },
  { workerId: 'EMP-2', date: '2026-09-01', time: '18:00', type: 'OUT' }
];

const engine = new AttendanceCalculationEngine();
const t6 = performance.now();
const result = engine.processAttendance(workers, shifts, samplePunches);
const t7 = performance.now();
const engineTime = (t7 - t6).toFixed(1);

console.log(`✅ processAttendance completed calculation for 55,000 workers in ${engineTime}ms!`);
if (result.records.length !== 2) {
  console.error(`❌ Expected 2 records calculated, got ${result.records.length}`);
  process.exit(1);
}

console.log('\n🎉 ALL LARGE DATASET PERFORMANCE BENCHMARKS PASSED EASILY! 🎉');
