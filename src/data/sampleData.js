/**
 * Realistic Demo Dataset for Manufacturing Attendance & Overtime Calculation System
 * 
 * Features:
 * - 12 diverse workers across Office, Production, Sanitation, and Security
 * - Exact test cases from User Requirements (Rahul Sharma's late memo sequence, Priya's OT progression, Suresh's overnight shift)
 * - Anomaly cases (Missing IN, Missing OUT, Half Day, Rapid double punches)
 * - Month rollover case showing automated quota reset
 */

export const SAMPLE_WORKERS = [
  { id: 'EMP-101', name: 'Rahul Sharma', department: 'Office & Admin', shiftId: 'OFFICE', isActive: true },
  { id: 'EMP-102', name: 'Priya Patel', department: 'Production', shiftId: 'PLANT_DAY_1', isActive: true },
  { id: 'EMP-103', name: 'Amit Kumar', department: 'Production', shiftId: 'PLANT_DAY_2', isActive: true },
  { id: 'EMP-104', name: 'Suresh Raina', department: 'Production', shiftId: 'PLANT_NIGHT', isActive: true },
  { id: 'EMP-105', name: 'Sunita Devi', department: 'Sanitation', shiftId: 'SWEEPER', isActive: true },
  { id: 'EMP-106', name: 'Vikram Singh', department: 'Security & Gate', shiftId: 'SECURITY_1', isActive: true },
  { id: 'EMP-107', name: 'Mohan Lal', department: 'Security & Gate', shiftId: 'SECURITY_2', isActive: true },
  { id: 'EMP-108', name: 'Rajesh Gurjar', department: 'Security & Gate', shiftId: 'SECURITY_3', isActive: true },
  { id: 'EMP-109', name: 'Deepak Verma', department: 'Quality Control', shiftId: 'PLANT_DAY_1', isActive: true },
  { id: 'EMP-110', name: 'Neha Gupta', department: 'Office & Admin', shiftId: 'OFFICE', isActive: true },
  { id: 'EMP-111', name: 'Arjun Das', department: 'Maintenance', shiftId: 'PLANT_DAY_2', isActive: true },
  { id: 'EMP-112', name: 'Kavita Joshi', department: 'Quality Control', shiftId: 'PLANT_NIGHT', isActive: true },
];

export const SAMPLE_RAW_PUNCHES = [
  // ==========================================
  // 1. RAHUL SHARMA (EMP-101, OFFICE 09:00 - 18:00)
  // EXACT Prompt Table: 2 grace, 2 allowed late, 2 memos (₹100 each)
  // ==========================================
  // Day 1 (Sept 1): 09:10 -> Within Grace, No Memo
  { id: 'P101-1-IN', workerId: 'EMP-101', date: '2026-09-01', time: '09:10', type: 'IN' },
  { id: 'P101-1-OUT', workerId: 'EMP-101', date: '2026-09-01', time: '18:05', type: 'OUT' },

  // Day 2 (Sept 2): 09:15 -> Within Grace, No Memo
  { id: 'P101-2-IN', workerId: 'EMP-101', date: '2026-09-02', time: '09:15', type: 'IN' },
  { id: 'P101-2-OUT', workerId: 'EMP-101', date: '2026-09-02', time: '18:10', type: 'OUT' },

  // Day 3 (Sept 3): 09:20 -> Late Occurrence #1 (Allowed, No Memo)
  { id: 'P101-3-IN', workerId: 'EMP-101', date: '2026-09-03', time: '09:20', type: 'IN' },
  { id: 'P101-3-OUT', workerId: 'EMP-101', date: '2026-09-03', time: '18:00', type: 'OUT' },

  // Day 4 (Sept 4): 09:30 -> Late Occurrence #2 (Allowed, No Memo)
  { id: 'P101-4-IN', workerId: 'EMP-101', date: '2026-09-04', time: '09:30', type: 'IN' },
  { id: 'P101-4-OUT', workerId: 'EMP-101', date: '2026-09-04', time: '18:00', type: 'OUT' },

  // Day 5 (Sept 5): 09:25 -> Late Occurrence #3 (Quota exceeded -> ₹100 Memo!)
  { id: 'P101-5-IN', workerId: 'EMP-101', date: '2026-09-05', time: '09:25', type: 'IN' },
  { id: 'P101-5-OUT', workerId: 'EMP-101', date: '2026-09-05', time: '18:00', type: 'OUT' },

  // Day 6 (Sept 7): 09:40 -> Late Occurrence #4 (₹100 Memo!)
  { id: 'P101-6-IN', workerId: 'EMP-101', date: '2026-09-07', time: '09:40', type: 'IN' },
  { id: 'P101-6-OUT', workerId: 'EMP-101', date: '2026-09-07', time: '18:00', type: 'OUT' },

  // Day 7 (Sept 8): On-time arrival with early departure
  { id: 'P101-7-IN', workerId: 'EMP-101', date: '2026-09-08', time: '08:58', type: 'IN' },
  { id: 'P101-7-OUT', workerId: 'EMP-101', date: '2026-09-08', time: '17:30', type: 'OUT' },

  // Day 8 (Oct 1): Next month rollover -> Quota resets! Late at 09:22 -> Late #1 in Oct, No Memo
  { id: 'P101-8-IN', workerId: 'EMP-101', date: '2026-10-01', time: '09:22', type: 'IN' },
  { id: 'P101-8-OUT', workerId: 'EMP-101', date: '2026-10-01', time: '18:00', type: 'OUT' },

  // ==========================================
  // 2. PRIYA PATEL (EMP-102, PLANT DAY 1: 08:30 - 17:00)
  // Demonstrates Overtime Progression & Early arrival rule
  // Scheduled Shift End: 17:00. OT Threshold: 15m. OT Begins: 17:15.
  // ==========================================
  // Sept 1: Early arrival (08:15) + OUT at 17:00 -> 0 OT (Early arrival is NEVER OT!)
  { id: 'P102-1-IN', workerId: 'EMP-102', date: '2026-09-01', time: '08:15', type: 'IN' },
  { id: 'P102-1-OUT', workerId: 'EMP-102', date: '2026-09-01', time: '17:00', type: 'OUT' },

  // Sept 2: OUT at 17:10 -> 0 OT (Within 15 min threshold)
  { id: 'P102-2-IN', workerId: 'EMP-102', date: '2026-09-02', time: '08:25', type: 'IN' },
  { id: 'P102-2-OUT', workerId: 'EMP-102', date: '2026-09-02', time: '17:10', type: 'OUT' },

  // Sept 3: OUT at 17:15 -> 0 OT (Exact at threshold)
  { id: 'P102-3-IN', workerId: 'EMP-102', date: '2026-09-03', time: '08:28', type: 'IN' },
  { id: 'P102-3-OUT', workerId: 'EMP-102', date: '2026-09-03', time: '17:15', type: 'OUT' },

  // Sept 4: OUT at 17:16 -> 16 minutes OT (excess 16m > 15m threshold -> full 16m)
  { id: 'P102-4-IN', workerId: 'EMP-102', date: '2026-09-04', time: '08:30', type: 'IN' },
  { id: 'P102-4-OUT', workerId: 'EMP-102', date: '2026-09-04', time: '17:16', type: 'OUT' },

  // Sept 5: OUT at 17:30 -> 30 minutes OT (excess 30m > 15m threshold -> full 30m)
  { id: 'P102-5-IN', workerId: 'EMP-102', date: '2026-09-05', time: '08:25', type: 'IN' },
  { id: 'P102-5-OUT', workerId: 'EMP-102', date: '2026-09-05', time: '17:30', type: 'OUT' },

  // Sept 6: OUT at 18:00 -> 60 minutes OT (excess 60m > 15m threshold -> full 60m / 1h)
  { id: 'P102-6-IN', workerId: 'EMP-102', date: '2026-09-06', time: '08:20', type: 'IN' },
  { id: 'P102-6-OUT', workerId: 'EMP-102', date: '2026-09-06', time: '18:00', type: 'OUT' },

  // ==========================================
  // 3. SURESH RAINA (EMP-104, PLANT NIGHT: 20:30 - 08:30)
  // Overnight shift logic: IN Sept 15 20:20, OUT Sept 16 09:30
  // Shift end 08:30, OUT 09:30 = 60m excess (> 15m threshold) -> 60 min OT
  // Associated with September 15 shift!
  // ==========================================
  { id: 'P104-1-IN', workerId: 'EMP-104', date: '2026-09-15', time: '20:20', type: 'IN' },
  { id: 'P104-1-OUT', workerId: 'EMP-104', date: '2026-09-16', time: '09:30', type: 'OUT' },

  // Second overnight shift: Sept 16 night to Sept 17 morning
  { id: 'P104-2-IN', workerId: 'EMP-104', date: '2026-09-16', time: '20:28', type: 'IN' },
  { id: 'P104-2-OUT', workerId: 'EMP-104', date: '2026-09-17', time: '08:40', type: 'OUT' },

  // ==========================================
  // 4. AMIT KUMAR (EMP-103, PLANT DAY 2: 08:30 - 20:30)
  // Demonstrates Half-Day Rule & Duplicate tap de-duplication
  // Half-Day threshold = 08:30 + 4h = 12:30.
  // ==========================================
  // Sept 1: Normal 12h day with rapid double tap at 08:26 and 08:27
  { id: 'P103-1-IN1', workerId: 'EMP-103', date: '2026-09-01', time: '08:26', type: 'IN' },
  { id: 'P103-1-IN2', workerId: 'EMP-103', date: '2026-09-01', time: '08:27', type: 'IN' },
  { id: 'P103-1-OUT', workerId: 'EMP-103', date: '2026-09-01', time: '20:35', type: 'OUT' },

  // Sept 2: Arrives at 12:45 (after 12:30 threshold) -> Marked as HALF DAY!
  { id: 'P103-2-IN', workerId: 'EMP-103', date: '2026-09-02', time: '12:45', type: 'IN' },
  { id: 'P103-2-OUT', workerId: 'EMP-103', date: '2026-09-02', time: '20:30', type: 'OUT' },

  // ==========================================
  // 5. ANOMALY DEMOS: Missing IN & Missing OUT
  // ==========================================
  // Deepak Verma (EMP-109): Missing OUT punch on Sept 3
  { id: 'P109-1-IN', workerId: 'EMP-109', date: '2026-09-03', time: '08:20', type: 'IN' },

  // Neha Gupta (EMP-110): Missing IN punch on Sept 3 (only OUT registered)
  { id: 'P110-1-OUT', workerId: 'EMP-110', date: '2026-09-03', time: '18:00', type: 'OUT' },

  // Sunita Devi (EMP-105, SWEEPER: 07:30 - 16:00)
  { id: 'P105-1-IN', workerId: 'EMP-105', date: '2026-09-01', time: '07:25', type: 'IN' },
  { id: 'P105-1-OUT', workerId: 'EMP-105', date: '2026-09-01', time: '16:05', type: 'OUT' },
  { id: 'P105-2-IN', workerId: 'EMP-105', date: '2026-09-02', time: '07:42', type: 'IN' }, // within grace (07:30+15=07:45)
  { id: 'P105-2-OUT', workerId: 'EMP-105', date: '2026-09-02', time: '16:00', type: 'OUT' },

  // Vikram Singh (EMP-106, SECURITY 1: 07:00 - 13:00)
  { id: 'P106-1-IN', workerId: 'EMP-106', date: '2026-09-01', time: '06:55', type: 'IN' },
  { id: 'P106-1-OUT', workerId: 'EMP-106', date: '2026-09-01', time: '13:00', type: 'OUT' },

  // Mohan Lal (EMP-107, SECURITY 2: 13:00 - 19:00)
  { id: 'P107-1-IN', workerId: 'EMP-107', date: '2026-09-01', time: '12:50', type: 'IN' },
  { id: 'P107-1-OUT', workerId: 'EMP-107', date: '2026-09-01', time: '19:45', type: 'OUT' }, // 19:00+15m=19:15 -> 30m OT

  // Rajesh Gurjar (EMP-108, SECURITY 3: 19:00 - 07:00 Overnight)
  { id: 'P108-1-IN', workerId: 'EMP-108', date: '2026-09-01', time: '18:55', type: 'IN' },
  { id: 'P108-1-OUT', workerId: 'EMP-108', date: '2026-09-02', time: '07:35', type: 'OUT' }, // OT: 07:00+15m=07:15 -> 20m OT
];
