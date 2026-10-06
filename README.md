# AURA MFG — Working Hours & Overtime Calculation System

A manufacturing-grade, standalone attendance and overtime calculation system built with an **independent calculation engine**, designed to process raw punch logs, enforce strict attendance/memo policies, and handle overnight shifts.

---

## 🌟 Key System Capabilities & Rule Enforcements

### 1. 15-Minute Automatic Late Grace Rule
- **Standard Grace Window:** 15 minutes after shift start (configurable).
- **Rule:** If shift starts at `09:00`, arriving up to `09:15` is categorized as **Within Grace** with **zero late penalty** and **zero deduction from the monthly late quota**.
- **Late Occurrences:** Only arrivals after `09:15` count as a **Late Occurrence**.

### 2. Salary-Cycle Late Quota & Memo Policy
- **Salary Cycle:** Counters run per salary/attendance cycle, **22nd to 21st** by default (configurable in Policy Settings; set the start day to 1 for calendar months). A cycle is named after the month it ends in, e.g. **Sep 2026 = 22 Aug – 21 Sep**.
- **Cycle Quota:** First **2 late occurrences** beyond grace per salary cycle are allowed without any financial penalty (`₹0`).
- **3rd and Subsequent Late Occurrences:** Automatically incur a **₹100 Memo penalty** per occurrence (configurable).
- **Automatic Cycle Reset:** The late occurrence counter automatically resets at the start of every cycle (the 22nd by default).
- **Monthly Tracking:** The system tracks:
  - Grace arrivals count
  - Late occurrences beyond grace
  - Quota allowed (2)
  - Quota used
  - Remaining allowance
  - Memo count and total memo amount (₹)

### 3. Dynamic Half-Day Rule
- **Formula:** `Half-Day Benchmark = Shift Start + 4 Hours` (configurable threshold).
- **Non-hardcoded:** Evaluates dynamically per shift:
  - *Office Shift (09:00):* Threshold = `13:00`. Arriving after 13:00 marks attendance as **Half Day**.
  - *Plant Day Shift (08:30):* Threshold = `12:30`. Arriving after 12:30 marks attendance as **Half Day**.
  - *Plant Night Shift (20:30):* Threshold = `00:30` (next calendar day). Arriving after 00:30 marks attendance as **Half Day**.
- **No double penalty:** A Half Day is not a late occurrence. It never incurs a memo and does not use up the monthly late quota.

### 4. Overtime (OT) Rule
- **Early Arrival is NEVER Overtime:** Arriving early (e.g., at `08:30` for a `09:00` shift) earns **0 OT**.
- **OT Threshold:** Overtime begins strictly **15 minutes after scheduled shift end** (configurable).
- **Office Example (09:00–18:00, OT Start = 18:15):**
  - OUT `18:00` → `0 OT`
  - OUT `18:10` → `0 OT`
  - OUT `18:15` → `0 OT`
  - OUT `18:16` → `1 minute OT`
  - OUT `18:30` → `15 minutes OT`
  - OUT `19:00` → `45 minutes OT`

### 5. Overnight Shift Logic
- Accurately pairs punches spanning midnight (e.g., `20:30–08:30`).
- **Date Attribution:** IN on `20:20, Sept 15` and OUT on `09:30, Sept 16` are attributed cleanly to the **September 15 Shift**.
- **Overnight OT Calculation:** OT begins at `08:30 + 15m = 08:45`. OUT at `09:30` grants exactly **45 minutes OT**.

### 6. Punch Pairing & Anomaly Detection
- Unchanged, immutable raw punch data stream.
- De-duplicates rapid punch taps (e.g. repeated scans within 2–3 minutes).
- Detects and flags:
  - **Missing IN** (punch OUT registered without IN)
  - **Missing OUT** (punch IN registered without OUT)
  - **Invalid Sequence** (OUT punch preceding IN without overnight context)
  - **Early Departure** (leaving prior to scheduled shift end)

---

## 🛠️ Application Modules

1. **Dashboard:** KPI summary cards, Monthly Late Allowance & Memo Tracker, live rule verification status.
2. **Attendance Report:** Comprehensive table matching prompt specification with instant search, status filtering, Excel/CSV export, and interactive **Audit Trail** modals.
   - **Salary Calculation:** salary sheet per salary cycle with the company's own column headers (ID, Full Name, Status, Department, Sub Department, MC / Operation, Salary type, Shift Hours, daily wage, salary, Working Days, Attended Days, extra days, other time, Total Leaves, Approved Leaves, Not App. Leaves, Salary (attended) + Extra Days, Other Amount, Gross Salary, Advance Amount, Loan Amount, Memo Amount, PF / ES / Prof Tax Deduction, Net Pay, Location, Remarks, Payroll Remarks). Salary details are typed straight into the table; attendance figures are calculated from the punches and can be typed over. Working days, half-day value, overtime rate and PF/ES/PT rules are editable under Salary Settings; Excel export uses the same headers.
   - **Holiday Calendar:** mark factory holidays on a month calendar; they are taken out of Working Days in the salary calculation (a holiday on a worker's weekly off counts once, and working on a holiday counts as an extra day).
3. **Shift Management:** Add, edit, delete, and toggle shifts (Office, Plant Day 1, Plant Day 2, Plant Night, Sweeper, Security 1/2/3).
4. **Worker Shift Assignment:** Worker master with manual shift assignment dropdowns, worker edit modal, Excel/CSV worker import, and template download.
5. **Raw Punch Ingestion:** View raw logs unchanged, upload new raw punches via CSV/Excel, download sample templates.
6. **Suspicious & Invalid Review:** Dedicated triage screen for HR/Supervisors to inspect anomalies and missing punches.
7. **Policy Settings:** Fully editable settings (grace period, monthly allowed late occurrences, memo amount ₹, half-day threshold hours, OT threshold minutes) with live recalculation.

---

## 💻 Tech Stack & Architecture

- **Independent Core Engine:** [`src/engine/calculationEngine.js`](file:///c:/Users/shrut/.gemini/antigravity/scratch/Attendance%20&%20Overtime%20Calculation%20System/src/engine/calculationEngine.js) — pure JavaScript, zero DOM dependencies, unit-tested. Ready to be embedded in Node.js, SQL Server procedures, or REST APIs.
- **Frontend:** Vanilla ES Modules with modern semantic HTML and responsive Vanilla CSS.
- **Data Ingestion/Export:** SheetJS (`xlsx`) for `.xlsx` and `.csv` parsing and report generation.
- **Development Server:** Vite on `http://localhost:5173/`.

---

## 🚀 How to Run

1. **Start the Dev Server:**
   ```bash
   npm run dev
   # or double-click start.bat
   ```
2. Open browser at: `http://localhost:5173/`

3. **Run Automated Test Suite:**
   ```bash
   node tests/engine.test.js
   ```
