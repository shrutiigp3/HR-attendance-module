@echo off
title AURA MFG - Attendance and Overtime Calculation System
echo Starting Attendance & Overtime Calculation System...
start http://localhost:5173/
node "./node_modules/vite/bin/vite.js" --host --port 5173
pause
