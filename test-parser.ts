import { readFileSync } from 'fs';
import * as xlsx from 'xlsx';

// Copy functions from excel-parser.ts
// We'll mock the events array processing to see what happens.
const events = [
    {
        date: '2026-05-11',
        employeeName: 'Ariadna Lozano',
        department: 'Some',
        status: 'Meeting',
        subStatus: '',
        remarks: 'Coaching',
        originalStatus: 'Meeting',
        originalSubStatus: '',
        originalRemark: 'Coaching',
        rawInfo: 'Meeting',
        durationMinutes: 16,
        startTime: new Date(2026, 4, 11, 23, 38, 0),
        endTime: new Date(2026, 4, 11, 23, 54, 0),
        tasks: 0,
        row: ['2026-05-11',...Array(10), '22:30-07:30', '22:30-07:30'] // schedShift and infShift are 11 and 12
    },
    {
        date: '2026-05-12',
        employeeName: 'Ariadna Lozano',
        department: 'Some',
        status: 'Trabalho',
        subStatus: 'Moderation',
        remarks: '',
        originalStatus: 'Trabalho',
        originalSubStatus: 'Moderation',
        originalRemark: '',
        rawInfo: 'Trabalho',
        durationMinutes: 60,
        startTime: new Date(2026, 4, 12, 0, 15, 0), // 00:15
        endTime: new Date(2026, 4, 12, 1, 15, 0), // 01:15
        tasks: 0,
        row: ['2026-05-12',...Array(10), '22:30-07:30', '22:30-07:30']
    }
];

// simulate shifting
let shifts = [];
let currentShift = [];
let currentShiftStart = null;
let previousEndTime = null;

events.forEach(e => {
    // Split if gap between events is > 5 hours
    if (currentShiftStart && previousEndTime) {
        const gapMinutes = (e.startTime.getTime() - previousEndTime.getTime()) / 60000;
        if (gapMinutes > 300) {
            shifts.push({ events: currentShift, firstEventTime: currentShiftStart });
            currentShift = [];
            currentShiftStart = null;
            previousEndTime = null;
        }
    }
    
    if (!currentShiftStart) {
        currentShiftStart = e.startTime;
    }
    currentShift.push(e);
    previousEndTime = e.endTime;
    
    if ((e.status === 'offline') && e.durationMinutes >= 240) {
        shifts.push({ events: currentShift, firstEventTime: currentShiftStart });
        currentShift = [];
        currentShiftStart = null;
        previousEndTime = null;
    }
});
if (currentShift.length > 0 && currentShiftStart) {
    shifts.push({ events: currentShift, firstEventTime: currentShiftStart });
}

console.log("Shifts generated:", shifts.length);
if (shifts.length > 0) console.log("Shift events:", shifts[0].events.map(e => e.date + ' ' + e.startTime.toISOString()));
