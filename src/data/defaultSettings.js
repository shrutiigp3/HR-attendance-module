/**
 * Default System Configurations and Initial Shift Definitions
 * Exactly matches the required specifications.
 */

export const INITIAL_SHIFTS = [
  {
    id: 'OFFICE',
    name: 'Office',
    startTime: '09:00',
    endTime: '18:00',
    weeklyOff: 'Sunday',
    isOvernight: false,
    isActive: true,
    payOvertime: false,
    description: 'Corporate and Admin Staff'
  },
  {
    id: 'PLANT_DAY_1',
    name: 'Plant Day 1',
    startTime: '08:30',
    endTime: '17:00',
    weeklyOff: 'Thursday',
    isOvernight: false,
    isActive: true,
    description: 'Manufacturing Shift A (Standard 8.5h)'
  },
  {
    id: 'PLANT_DAY_2',
    name: 'Plant Day 2',
    startTime: '08:30',
    endTime: '20:30',
    weeklyOff: 'Sunday',
    isOvernight: false,
    isActive: true,
    description: 'Manufacturing Shift B (Extended 12h)'
  },
  {
    id: 'PLANT_NIGHT',
    name: 'Plant Night',
    startTime: '20:30',
    endTime: '08:30',
    weeklyOff: 'Thursday',
    isOvernight: true,
    isActive: true,
    description: 'Manufacturing Overnight Shift (12h)'
  },
  {
    id: 'SWEEPER',
    name: 'Sweeper',
    startTime: '07:30',
    endTime: '16:00',
    weeklyOff: 'Sunday',
    isOvernight: false,
    isActive: true,
    description: 'Facility & Housekeeping Services'
  },
  {
    id: 'SECURITY_1',
    name: 'Security 1',
    startTime: '07:00',
    endTime: '13:00',
    weeklyOff: 'None',
    isOvernight: false,
    isActive: true,
    description: 'Morning Gate & Perimeter Guard'
  },
  {
    id: 'SECURITY_2',
    name: 'Security 2',
    startTime: '13:00',
    endTime: '19:00',
    weeklyOff: 'None',
    isOvernight: false,
    isActive: true,
    description: 'Afternoon Gate & Perimeter Guard'
  },
  {
    id: 'SECURITY_3',
    name: 'Security 3',
    startTime: '19:00',
    endTime: '07:00',
    weeklyOff: 'None',
    isOvernight: true,
    isActive: true,
    description: 'Night Gate & Surveillance Guard (12h)'
  }
];

export const INITIAL_CONFIG = {
  gracePeriodMinutes: 15,            // 15-minute automatic grace period
  monthlyLateOccurrencesAllowed: 2,  // 2 late occurrences allowed per month after grace without memo
  memoAmount: 100,                   // ₹100 memo for 3rd and subsequent occurrences
  halfDayThresholdHours: 4,          // Shift Start + 4 Hours
  otThresholdMinutes: 15,            // OT begins 15 minutes after scheduled shift end
  cycleStartDay: 22,                 // Salary/attendance cycle runs 22nd–21st; late counters reset on the 22nd
};

export const DEPARTMENTS = [
  'Office & Admin',
  'Production',
  'Quality Control',
  'Maintenance',
  'Sanitation',
  'Security & Gate'
];
