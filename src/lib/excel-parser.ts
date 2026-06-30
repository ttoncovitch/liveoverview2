import * as XLSX from "xlsx";
import { differenceInMinutes, parse, format, isValid } from "date-fns";
import { EmployeeDayRecord, BreakSession, EmployeeSummary } from "../types";

function formatDateSafe(d: Date): string {
  const isNegativeTimezone = d.getTimezoneOffset() > 0;
  const year = isNegativeTimezone ? d.getUTCFullYear() : d.getFullYear();
  const month = (isNegativeTimezone ? d.getUTCMonth() : d.getMonth()) + 1;
  const day = isNegativeTimezone ? d.getUTCDate() : d.getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const LIMITS = {
  MEAL: 60,
  SHORT: 30,
  WELLNESS: 15,
  PRAYING: 15,
  WC: 10,
};

// Keywords for WC mapping
const WC_KEYWORDS = [
  "bath",
  "bathrom",
  "bathroom",
  "bathroom break",
  "bathroom emegency",
  "bathroom emergency",
  "bathroom quick",
  "batroom",
  "o b",
  "ob",
  "organic",
  "organic break",
  "emergency bathroom break",
  "emergency wc break",
  "ewc",
  "restroom",
  "toilet",
  "toilet break",
  "toillet",
  "wc",
  "banheiro",
  "ida ao banheiro",
  "wc emergência",
  "emergencia banheiro",
  "organico",
  "orgânico",
  "orgânica",
  "organica",
  "personal break",
  "personal",
];

export async function detectFileType(
  file: File,
): Promise<"extract" | "calendar" | "staffInfo" | "unknown"> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });

        let firstSheet = workbook.SheetNames[0];
        if (!firstSheet) return resolve("unknown");

        const worksheet = workbook.Sheets[firstSheet];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          range: 0,
          defval: "",
        }) as any[][];
        if (rows.length === 0) return resolve("unknown");

        // Check for Calendar
        for (const sheetName of workbook.SheetNames) {
          const tempWorksheet = workbook.Sheets[sheetName];
          const tempRows = XLSX.utils.sheet_to_json(tempWorksheet, {
            header: 1,
            range: 0,
            defval: "",
          }) as any[][];

          for (let i = 0; i < Math.min(20, tempRows.length); i++) {
            if (!tempRows[i] || tempRows[i].length < 3) continue;
            const rowStrings = tempRows[i].map((v) =>
              String(v).toLowerCase().trim(),
            );

            const hasCalendarName = rowStrings.some(
              (s) =>
                s === "name" ||
                s === "nome" ||
                s === "agent" ||
                s === "moderator" ||
                s === "agent name" ||
                s === "employee",
            );

            let numericDays = 0;
            for (const v of tempRows[i]) {
              if (typeof v === "number") {
                // Numbers usually represent days 1-31, or excel serial dates (40000+)
                if ((v >= 1 && v <= 31) || (v > 40000 && v < 50000))
                  numericDays++;
              } else if (typeof v === "string") {
                const s = v.trim().toLowerCase();
                if (s.match(/^\d{1,2}$/)) {
                  numericDays++;
                } else if (
                  s.match(/^\d{1,2}[\/\-]\d{1,2}/) ||
                  s.match(/^(mon|tue|wed|thu|fri|sat|sun)\s+\d{1,2}/) ||
                  s.match(/^[a-z]{3}\s*\d{1,2}$/)
                ) {
                  numericDays++;
                }
              }
            }

            // If we find a Name column and at least 5 days (columns indicating schedule dates)
            if (hasCalendarName && numericDays >= 5) {
              return resolve("calendar");
            }
          }
        }

        // Check for Staff Info
        const staffSheetName = workbook.SheetNames.find((sn) =>
          sn.toLowerCase().includes("staff info"),
        );
        if (staffSheetName) return resolve("staffInfo");

        // Check if any sheet looks like Staff Info
        for (const sheetName of workbook.SheetNames) {
          const tempWorksheet = workbook.Sheets[sheetName];
          const tempRows = XLSX.utils.sheet_to_json(tempWorksheet, {
            header: 1,
            range: 0,
            defval: "",
          }) as any[][];

          const isStaffInfo = tempRows
            .slice(0, Math.min(50, tempRows.length))
            .some((row) => {
              if (!row || row.length < 2) return false;

              const rowStr = row.map((v) => String(v).trim().toUpperCase());
              const joined = rowStr.join("|");

              // Staff info typically has LOB, LANGUAGE, TEAM LEADER, ROLE, or SUPERVISOR.
              // Extract does not have these.
              if (
                joined.includes("LOB|") ||
                joined.includes("|LOB") ||
                joined.includes("LANGUAGE") ||
                joined.includes("TEAM LEADER") ||
                joined.includes("SUPERVISOR") ||
                joined.includes("ROLE")
              ) {
                if (
                  joined.includes("ACTIVE") ||
                  joined.includes("STATUS") ||
                  joined.includes("NAME") ||
                  joined.includes("EMAIL") ||
                  joined.includes("UID") ||
                  joined.includes("EMPLID")
                ) {
                  return true;
                }
              }

              // If it explicitly has a column exactly "ACTIVE" and another exactly "NAME" or "LOB", it's probably Staff Info.
              let hasActive = false;
              let hasLob = false;
              let hasLanguage = false;
              for (let c = 0; c < Math.min(50, row.length); c++) {
                const val = rowStr[c];
                if (val === "ACTIVE") hasActive = true;
                if (val === "LOB") hasLob = true;
                if (val === "LANGUAGE" || val === "IDIOMA") hasLanguage = true;
              }

              if (hasActive && (hasLob || hasLanguage)) return true;
              if (hasLob && hasLanguage) return true;

              return false;
            });

          if (isStaffInfo) {
            return resolve("staffInfo");
          }
        }

        // Check for Extract
        for (const sheetName of workbook.SheetNames) {
          const tempWorksheet = workbook.Sheets[sheetName];
          const tempRows = XLSX.utils.sheet_to_json(tempWorksheet, {
            header: 1,
            range: 0,
            defval: "",
          }) as any[][];

          for (let i = 0; i < Math.min(10, tempRows.length); i++) {
            if (!tempRows[i] || tempRows[i].length < 4) continue;
            const rowStrings = tempRows[i].map((v) =>
              String(v).toLowerCase().trim(),
            );

            const hasEmailOrAgent = rowStrings.some(
              (c) =>
                c.includes("email") ||
                c.includes("e-mail") ||
                c.includes("user") ||
                c.includes("agent") ||
                c.includes("employee") ||
                c.includes("name") ||
                c.includes("nome"),
            );
            const hasTimeOrDuration = rowStrings.some(
              (c) =>
                c.includes("duration") ||
                c.includes("duração") ||
                c.includes("time") ||
                c.includes("start") ||
                c.includes("end") ||
                c.includes("início") ||
                c.includes("fim"),
            );
            const hasActionOrStatus = rowStrings.some(
              (c) =>
                c === "action" ||
                c === "status" ||
                c.includes("break name") ||
                c === "ação" ||
                c === "estado",
            );

            // Extracts will generally have an email/agent column and time/duration or action/status columns.
            if (hasEmailOrAgent && (hasTimeOrDuration || hasActionOrStatus)) {
              return resolve("extract");
            }
          }
        }

        resolve("unknown");
      } catch {
        resolve("unknown");
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

export async function parseExcelFile(file: File): Promise<EmployeeSummary[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Use header: 1 to get raw array of arrays
        const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
        });

        if (rawData.length <= 1) {
          resolve([]);
          return;
        }

        const employeeMap = new Map<string, any[][]>();

        // Skip header row
        rawData.slice(1).forEach((row) => {
          if (!row || row.length < 8) return;

          let date = "";
          if (row[0] instanceof Date) {
            date = formatDateSafe(row[0]);
          } else if (typeof row[0] === "number") {
            if (row[0] > 100000) {
              date = formatDateSafe(new Date(row[0]));
            } else {
              const d = new Date(Math.round((row[0] - 25569) * 86400 * 1000));
              date = formatDateSafe(d);
            }
          } else if (row[0]) {
            const dateStr = String(row[0]).trim();
            const parts = dateStr.split(/[\/\-]/);
            if (parts.length === 3) {
              let p1 = parseInt(parts[0], 10);
              let p2 = parseInt(parts[1], 10);
              let p3 = parseInt(parts[2], 10);
              let year = p3 > 100 ? p3 : p1 > 100 ? p1 : p3;
              if (year < 100) year += 2000;
              let month = p2;
              let day = p1 > 100 ? p3 : p1;
              if (day <= 12 && month > 12) {
                const temp = month;
                month = day;
                day = temp;
              }
              date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            } else {
              try {
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) date = format(d, "yyyy-MM-dd");
              } catch {}
            }
          }

          const email = String(row[1] || "").toLowerCase();
          if (!email || !email.includes("@")) return;

          const name = email.split("@")[0];

          row.push(name);
          row.push(email);
          row[0] = date; // ensure date is correctly formatted string in position 0

          if (!employeeMap.has(email)) {
            employeeMap.set(email, []);
          }
          employeeMap.get(email)!.push(row);
        });

        let globalMinDateStr = "9999-12-31";
        employeeMap.forEach((allRows) => {
          allRows.forEach((row) => {
            const d = String(row[0] || "");
            if (d && d < globalMinDateStr) {
              globalMinDateStr = d;
            }
          });
        });

        const summaries: EmployeeSummary[] = [];

        const headerRow = rawData[0];
        const headersStr = headerRow.map((h: any) =>
          String(h || "")
            .trim()
            .toUpperCase(),
        );

        const resignedIndex = headersStr.findIndex(
          (s: string) =>
            s.includes("RESIGNED") ||
            s.includes("离职") ||
            s.includes("OFFBOARDED") ||
            s.includes("SAÍDA"),
        );

        let schedShiftIndex = 11; // default
        let infShiftIndex = 12; // default
        let durationIndex = 6;
        let startIndex = 7;
        let endIndex = 8;

        const foundSched = headersStr.findIndex(
          (h: string) =>
            h === "SCHEDULED SHIFT" ||
            h.includes("SCHEDULE") ||
            h.includes("VÁRIOS"),
        );
        if (foundSched >= 0) schedShiftIndex = foundSched;

        const foundInf = headersStr.findIndex(
          (h: string) => h === "INFERRED SHIFT" || h.includes("INFERRED"),
        );
        if (foundInf >= 0) infShiftIndex = foundInf;

        employeeMap.forEach((allRows, _email) => {
          const dailyRecordsMap = new Map<string, EmployeeDayRecord>();
          let totalWorkMinutes = 0;
          let totalBreakMinutes = 0;
          let totalOverbreakMinutes = 0;
          let totalTardinessMinutes = 0;
          let totalEarlyLeaveMinutes = 0;
          let wcAlertsCount = 0;
          let idleAlertsCount = 0;
          let totalShort30MinRecords = 0;
          let totalNonModMinutes = 0;
          let totalReviewAndAppealMinutes = 0;
          let totalAwaitingTasksMinutes = 0;
          let totalForgotStatusMinutes = 0;
          let isOffboarded = false;

          let finalName = "";
          let finalDepartment = "";
          let finalEmail = _email;

          // Check for statuses
          const checkStatus = (keywords: string[]) => {
            if (resignedIndex >= 0 && allRows.length > 0) {
              return allRows.some((row) => {
                const val = String(row[resignedIndex] || "")
                  .trim()
                  .toUpperCase();
                const shift = String(row[schedShiftIndex] || "")
                  .trim()
                  .toUpperCase();
                const infShift = String(row[infShiftIndex] || "")
                  .trim()
                  .toUpperCase();
                return keywords.some(
                  (k) =>
                    val.includes(k.toUpperCase()) ||
                    shift.includes(k.toUpperCase()) ||
                    infShift.includes(k.toUpperCase()),
                );
              });
            } else if (allRows.length > 0) {
              return allRows.some((row) => {
                // Fallback to 15 if resignedIndex wasn't found
                const val = String(row[15] || "")
                  .trim()
                  .toUpperCase();
                const shift = String(row[schedShiftIndex] || "")
                  .trim()
                  .toUpperCase();
                const infShift = String(row[infShiftIndex] || "")
                  .trim()
                  .toUpperCase();
                return keywords.some(
                  (k) =>
                    val.includes(k.toUpperCase()) ||
                    shift.includes(k.toUpperCase()) ||
                    infShift.includes(k.toUpperCase()),
                );
              });
            }
            return false;
          };

          const isATT = checkStatus([
            "ATT",
            "ATTRITION",
            "OFFBOARDED",
            "RESIGNED",
            "RESIGNATION",
            "SAÍDA",
          ]);
          const isLOA = checkStatus(["LOA", "LICENÇA"]);
          const isPTO = checkStatus(["PTO", "VAC", "FÉRIAS"]);
          const isSL = checkStatus([
            "SL",
            "SICK",
            "SAÚDE",
            "MEDICO",
            "ATESTADO",
          ]);
          const isSUSPP = checkStatus(["SUSPP", "SUSPENSION", "SUSPENSÃO"]);
          const isOFF = checkStatus(["OFF", "FOLGA"]);

          isOffboarded = isATT;

          // Process all rows into timeline events for this employee
          const rawEvents: any[] = [];

          // Group rows by their literal date string (row[0])
          const rowsByDate = new Map<string, any[]>();
          allRows.forEach((row) => {
            const dStr = String(row[0] || "");
            if (!rowsByDate.has(dStr)) {
              rowsByDate.set(dStr, []);
            }
            rowsByDate.get(dStr)!.push(row);
          });

          // Process each date group independently
          rowsByDate.forEach((groupRows, gDate) => {
            // Parse naive start/end times
            const parsedGroup = groupRows.map((row) => {
              const employeeName = row[row.length - 2];
              const status = String(row[3] || "")
                .trim()
                .toLowerCase();
              const subStatus = String(row[4] || "")
                .trim()
                .toLowerCase();
              const remarks = String(row[5] || "").trim();

              const originalStatus = String(row[3] || "").trim();
              const originalSubStatus = String(row[4] || "").trim();
              const originalRemark = String(row[5] || "").trim();

              const durationHours = isNaN(Number(row[durationIndex]))
                ? 0
                : Number(row[durationIndex]);
              const durationMinutes = Math.round(durationHours * 60);

              const rawInfo = String(row[3] || "") + " " + String(row[4] || "");

              const baseDateArgs = gDate.split("-").map(Number);
              const baseDate =
                baseDateArgs.length === 3
                  ? new Date(
                      baseDateArgs[0],
                      baseDateArgs[1] - 1,
                      baseDateArgs[2],
                    )
                  : new Date();

              let startTime = parseTime(gDate, row[startIndex]);
              if (!startTime) {
                startTime = new Date(baseDate);
                startTime.setHours(0, 0, 0, 0);
              }

              let endTime = parseTime(gDate, row[endIndex]);
              if (endTime && durationMinutes > 0) {
                const diffMins =
                  (endTime.getTime() - startTime.getTime()) / 60000;
                if (diffMins < 0 || Math.abs(diffMins - durationMinutes) > 60) {
                  endTime = new Date(
                    startTime.getTime() + durationMinutes * 60000,
                  );
                }
              } else if (!endTime) {
                endTime = new Date(
                  startTime.getTime() + durationMinutes * 60000,
                );
              } else if (endTime < startTime) {
                const wrappedDuration =
                  (endTime.getTime() + 86400000 - startTime.getTime()) / 60000;
                if (wrappedDuration <= 16 * 60) {
                  endTime.setDate(endTime.getDate() + 1);
                } else {
                  endTime = new Date(
                    startTime.getTime() + durationMinutes * 60000,
                  );
                }
              }

              return {
                gDate,
                employeeName,
                department: String(row[2] || ""),
                status,
                subStatus,
                remarks,
                originalStatus,
                originalSubStatus,
                originalRemark,
                rawInfo,
                durationMinutes,
                startTime,
                endTime,
                row,
              };
            });

            // Sort chronologically by naive startTime
            parsedGroup.sort(
              (a, b) => a.startTime.getTime() - b.startTime.getTime(),
            );

            // Apply cross-midnight wrapping on the sorted list
            let lastGroupStartTime: Date | null = null;
            parsedGroup.forEach((e) => {
              const rawTimeVal = e.row[startIndex];
              const isAbsoluteDate =
                (rawTimeVal instanceof Date &&
                  (rawTimeVal.getTimezoneOffset() > 0
                    ? rawTimeVal.getUTCFullYear()
                    : rawTimeVal.getFullYear()) >= 2000) ||
                (typeof rawTimeVal === "string" && /[\/\-]/.test(rawTimeVal)) ||
                (typeof rawTimeVal === "number" && rawTimeVal >= 1);

              if (
                !isAbsoluteDate &&
                lastGroupStartTime &&
                e.startTime < lastGroupStartTime &&
                lastGroupStartTime.getTime() - e.startTime.getTime() >
                  12 * 3600000
              ) {
                e.startTime.setDate(e.startTime.getDate() + 1);
                if (e.endTime < e.startTime) {
                  e.endTime.setDate(e.endTime.getDate() + 1);
                }
              }
              lastGroupStartTime = new Date(e.startTime);

              if (e.employeeName && String(e.employeeName).includes("karely")) {
                console.log("Karely Event:", {
                  startTime: e.startTime,
                  endTime: e.endTime,
                  status: e.status,
                  subStatus: e.subStatus,
                  durationMinutes: e.durationMinutes,
                });
              }

              rawEvents.push({
                date: e.gDate,
                employeeName: e.employeeName,
                department: e.department,
                status: e.status,
                subStatus: e.subStatus,
                remarks: e.remarks,
                originalStatus: e.originalStatus,
                originalSubStatus: e.originalSubStatus,
                originalRemark: e.originalRemark,
                rawInfo: e.rawInfo,
                durationMinutes: e.durationMinutes,
                startTime: e.startTime,
                endTime: e.endTime,
                row: e.row,
              });
            });
          });

          if (rawEvents.length === 0) return;

          const uniqueEvents: typeof rawEvents = [];
          rawEvents.forEach((e) => {
            const formatLocalTimeStr = (d: Date) => {
              return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
            };
            const key = `${e.date}_${formatLocalTimeStr(e.startTime)}_${formatLocalTimeStr(e.endTime)}`;

            const existingIndex = uniqueEvents.findIndex((item) => {
              const itemKey = `${item.date}_${formatLocalTimeStr(item.startTime)}_${formatLocalTimeStr(item.endTime)}`;
              return itemKey === key;
            });

            if (existingIndex === -1) {
              uniqueEvents.push(e);
            } else {
              const existing = uniqueEvents[existingIndex];
              // Keep the more descriptive/detailed event
              const existingScore =
                (existing.subStatus ? 2 : 0) +
                (existing.status && existing.status.toLowerCase() !== "trabalho"
                  ? 1
                  : 0);
              const newScore =
                (e.subStatus ? 2 : 0) +
                (e.status && e.status.toLowerCase() !== "trabalho" ? 1 : 0);
              if (newScore > existingScore) {
                uniqueEvents[existingIndex] = e;
              }
            }
          });
          const allEvents = uniqueEvents;

          if (!finalName) finalName = finalEmail.split("@")[0];
          finalDepartment = allEvents[0].department;

          const isTraining =
            finalDepartment.toLowerCase().includes("training") ||
            finalEmail.toLowerCase().includes("training");

          // Break into logical shifts
          const shifts: { events: any[]; firstEventTime: Date }[] = [];
          let currentShift: any[] = [];
          let currentShiftStart: Date | null = null;
          let previousEndTime: Date | null = null;

          allEvents.forEach((e) => {
            // Calculate elapsed time since the very start of this shift
            let hoursSinceShiftStart = 0;
            if (currentShiftStart) {
              hoursSinceShiftStart =
                (e.startTime.getTime() - currentShiftStart.getTime()) / 3600000;
            }

            // Split if gap between events is huge (> 10 hours)
            // OR if we've passed 14 hours since the shift started (a logical max for one day's shift)
            if (currentShiftStart && previousEndTime) {
              const gapMinutes =
                (e.startTime.getTime() - previousEndTime.getTime()) / 60000;
              if (gapMinutes > 600 || hoursSinceShiftStart >= 14) {
                shifts.push({
                  events: currentShift,
                  firstEventTime: currentShiftStart,
                });
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

            // End the shift immediately if we encounter a true "Fim de turno"
            // OR if it's an offline period so long (> 10h) that it must be overnight rest
            if (e.status === "rest" && e.subStatus === "fim de turno") {
              shifts.push({
                events: currentShift,
                firstEventTime: currentShiftStart,
              });
              currentShift = [];
              currentShiftStart = null;
              previousEndTime = null;
            } else if (e.status === "offline" && e.durationMinutes >= 600) {
              shifts.push({
                events: currentShift,
                firstEventTime: currentShiftStart,
              });
              currentShift = [];
              currentShiftStart = null;
              previousEndTime = null;
            }
          });
          if (currentShift.length > 0 && currentShiftStart) {
            shifts.push({
              events: currentShift,
              firstEventTime: currentShiftStart,
            });
          }

          shifts.forEach((shiftInfo) => {
            const shiftEvents = shiftInfo.events;

            let logicalStartTime = new Date(shiftInfo.firstEventTime);
            const firstEventRow = shiftEvents[0].row;
            const schedString = String(firstEventRow[schedShiftIndex] || "");

            const isCrossing = (shiftStr: string) => {
              if (!shiftStr) return false;
              const cleaned = shiftStr.replace(/\s+/g, "").toUpperCase();
              if (cleaned === "OFF") return false;
              const parseT = (t: string) => {
                const isPM = t.includes("PM");
                const isAM = t.includes("AM");
                const core = t.replace(/[A-Z]/g, "").replace(":", ".");
                const parts = core.split(".");
                let h = parseInt(parts[0]) || 0;
                let m = parseInt(parts[1]) || 0;
                if (isPM && h !== 12) h += 12;
                if (isAM && h === 12) h = 0;
                return h * 60 + m;
              };
              const times = cleaned.split("-");
              if (times.length === 2) {
                let sT = parseT(times[0]);
                let eT = parseT(times[1]);
                if (eT <= sT) return true;
              }
              return false;
            };

            if (isCrossing(schedString) && logicalStartTime.getHours() < 12) {
              logicalStartTime.setDate(logicalStartTime.getDate() - 1);
            }

            const firstRowDate = format(logicalStartTime, "yyyy-MM-dd");
            const record = processDailyRowsFromEvents(
              firstRowDate,
              shiftEvents,
              resignedIndex,
              schedShiftIndex,
              infShiftIndex,
            );

            const hasSignificantActivity =
              record.totalWorkTimeMillis > 0 ||
              record.breaks.some((b) => b.type !== "offline") ||
              record.isOFF ||
              record.isPTO ||
              record.isLOA ||
              record.isSL ||
              record.isSUSPP ||
              record.isATT;

            if (hasSignificantActivity && record.date >= globalMinDateStr) {
              if (dailyRecordsMap.has(record.date)) {
                const existing = dailyRecordsMap.get(record.date)!;
                existing.totalWorkTimeMillis += record.totalWorkTimeMillis;
                existing.breaks.push(...record.breaks);
                existing.mealDuration += record.mealDuration;
                existing.shortDuration += record.shortDuration;
                existing.wellnessDuration += record.wellnessDuration;
                existing.wcDuration += record.wcDuration;
                existing.prayingDuration += record.prayingDuration;
                existing.idleDuration += record.idleDuration;
                existing.nonModDuration += record.nonModDuration;
                existing.reviewAndAppealDuration +=
                  record.reviewAndAppealDuration;
                existing.awaitingTasksDuration += record.awaitingTasksDuration;
                existing.forgotStatusDuration += record.forgotStatusDuration;
                existing.mealOverbreak += record.mealOverbreak;
                existing.shortOverbreak += record.shortOverbreak;
                existing.wellnessOverbreak += record.wellnessOverbreak;
                existing.prayingOverbreak += record.prayingOverbreak;
                existing.wcOverbreak += record.wcOverbreak;
                existing.idleOverbreak += record.idleOverbreak;
                existing.totalOverbreak += record.totalOverbreak;

                if (
                  record.actualStartTime &&
                  (!existing.actualStartTime ||
                    record.actualStartTime < existing.actualStartTime)
                )
                  existing.actualStartTime = record.actualStartTime;
                if (
                  record.actualEndTime &&
                  (!existing.actualEndTime ||
                    record.actualEndTime > existing.actualEndTime)
                )
                  existing.actualEndTime = record.actualEndTime;
              } else {
                dailyRecordsMap.set(record.date, record);
              }
            }
          });

          const dailyRecords: EmployeeDayRecord[] = [];
          const sortedDates = Array.from(dailyRecordsMap.keys()).sort();
          sortedDates.forEach((date) => {
            const record = dailyRecordsMap.get(date)!;
            dailyRecords.push(record);
            totalWorkMinutes += record.totalWorkTimeMillis / (1000 * 60);
            totalBreakMinutes +=
              record.mealDuration +
              record.shortDuration +
              record.wellnessDuration +
              record.wcDuration +
              record.prayingDuration +
              record.idleDuration;
            totalOverbreakMinutes += record.totalOverbreak;
            totalTardinessMinutes += record.tardinessMinutes;
            totalEarlyLeaveMinutes += record.earlyLeaveMinutes;
            if (record.hasSingleShort30m) totalShort30MinRecords++;
            if (record.wcDuration > LIMITS.WC) wcAlertsCount++;
            if (record.idleDuration > 0) idleAlertsCount++;
            totalNonModMinutes += record.nonModDuration;
            totalReviewAndAppealMinutes += record.reviewAndAppealDuration;
            totalAwaitingTasksMinutes += record.awaitingTasksDuration;
            totalForgotStatusMinutes += record.forgotStatusDuration;
          });

          if (dailyRecords.length > 0 || isOffboarded) {
            summaries.push({
              employeeName: finalName || "Unknown",
              email: finalEmail,
              department: finalDepartment,
              isTraining,
              totalWorkMinutes: Math.round(totalWorkMinutes),
              totalBreakMinutes: Math.round(totalBreakMinutes),
              totalOverbreakMinutes: Math.round(totalOverbreakMinutes),
              totalTardinessMinutes: Math.round(totalTardinessMinutes),
              totalEarlyLeaveMinutes: Math.round(totalEarlyLeaveMinutes),
              totalNonModMinutes: Math.round(totalNonModMinutes),
              totalReviewAndAppealMinutes: Math.round(
                totalReviewAndAppealMinutes,
              ),
              totalAwaitingTasksMinutes: Math.round(totalAwaitingTasksMinutes),
              totalForgotStatusMinutes: Math.round(totalForgotStatusMinutes),
              totalShort30MinRecords,
              totalAbsences: 0,
              isOffboarded,
              isATT,
              isLOA,
              isPTO,
              isSL,
              isSUSPP,
              isOFF,
              wcAlerts: wcAlertsCount,
              idleAlerts: idleAlertsCount,
              dailyRecords: dailyRecords.sort((a, b) =>
                a.date.localeCompare(b.date),
              ),
            });
          }
        });

        resolve(summaries);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}

const SHIFTS = [
  {
    startHour: 7,
    startMinute: 0,
    endHour: 16,
    endMinute: 0,
    label: "07:00-16:00",
  },
  {
    startHour: 8,
    startMinute: 0,
    endHour: 17,
    endMinute: 0,
    label: "08:00-17:00",
  },
  {
    startHour: 9,
    startMinute: 0,
    endHour: 18,
    endMinute: 0,
    label: "09:00-18:00",
  },
  {
    startHour: 14,
    startMinute: 0,
    endHour: 23,
    endMinute: 0,
    label: "14:00-23:00",
  },
  {
    startHour: 22,
    startMinute: 30,
    endHour: 7,
    endMinute: 30,
    label: "22:30-07:30",
    crossesMidnight: true,
  },
];

function isEventWork(e: any): boolean {
  const combinedInfo = `${e.status} ${e.subStatus} ${e.remarks}`.toLowerCase();

  return (
    combinedInfo.includes("trabalho") ||
    combinedInfo.includes("work") ||
    combinedInfo.includes("available") ||
    combinedInfo.includes("on queue") ||
    combinedInfo.includes("em chamada") ||
    combinedInfo.includes("in call") ||
    combinedInfo.includes("moderation task") ||
    combinedInfo.includes("moderation") ||
    combinedInfo.includes("moderat") ||
    combinedInfo.includes("moderação") ||
    combinedInfo.includes("non moderation") ||
    combinedInfo.includes("non-moderation") ||
    combinedInfo.includes("non moderating") ||
    combinedInfo.includes("reuniao") ||
    combinedInfo.includes("meeting") ||
    combinedInfo.includes("reuni") ||
    combinedInfo.includes("training") ||
    combinedInfo.includes("treinamento") ||
    combinedInfo.includes("coaching") ||
    combinedInfo.includes("feedback") ||
    combinedInfo.includes("1:1") ||
    combinedInfo.includes("1on1")
  );
}

function processDailyRowsFromEvents(
  date: string,
  events: any[],
  resignedIndex: number,
  schedShiftIdx: number,
  infShiftIdx: number,
): EmployeeDayRecord {
  const breaks: BreakSession[] = [];
  let totalWorkTimeMillis = 0;

  const checkDailyStatus = (keywords: string[]) => {
    const index = resignedIndex >= 0 ? resignedIndex : 15;
    return events.some((e) => {
      const row = e.row;
      const val = String(row[index] || "")
        .trim()
        .toUpperCase();
      const shift = String(row[schedShiftIdx] || "")
        .trim()
        .toUpperCase();
      const infShift = String(row[infShiftIdx] || "")
        .trim()
        .toUpperCase();
      return keywords.some(
        (k) =>
          val.includes(k.toUpperCase()) ||
          shift.includes(k.toUpperCase()) ||
          infShift.includes(k.toUpperCase()),
      );
    });
  };

  const isATT = checkDailyStatus([
    "ATT",
    "ATTRITION",
    "OFFBOARDED",
    "RESIGNED",
    "RESIGNATION",
    "SAÍDA",
  ]);
  const isLOA = checkDailyStatus(["LOA", "LICENÇA"]);
  const isPTO = checkDailyStatus(["PTO", "VAC", "FÉRIAS"]);
  const isSL = checkDailyStatus(["SL", "SICK", "SAÚDE", "MEDICO", "ATESTADO"]);
  const isSUSPP = checkDailyStatus(["SUSPP", "SUSPENSION", "SUSPENSÃO"]);
  const isOFF = checkDailyStatus(["OFF", "FOLGA"]);

  let employeeName = events.length > 0 ? events[0].employeeName : "";

  if (events.length === 0) {
    return {
      date,
      employeeName: employeeName || "Unknown",
      totalWorkTimeMillis: 0,
      breaks: [],
      mealDuration: 0,
      shortDuration: 0,
      wellnessDuration: 0,
      wcDuration: 0,
      prayingDuration: 0,
      idleDuration: 0,
      nonModDuration: 0,
      reviewAndAppealDuration: 0,
      awaitingTasksDuration: 0,
      forgotStatusDuration: 0,
      mealOverbreak: 0,
      shortOverbreak: 0,
      wellnessOverbreak: 0,
      prayingOverbreak: 0,
      wcOverbreak: 0,
      idleOverbreak: 0,
      totalOverbreak: 0,
      tardinessMinutes: 0,
      earlyLeaveMinutes: 0,
    };
  }

  // 2. Identify Shift
  const workEvents = events.filter(isEventWork);
  // Fallback to all events if no work events
  const referenceEvents = workEvents.length > 0 ? workEvents : events;
  const minWorkTime = referenceEvents.reduce(
    (min, e) => (e.startTime < min ? e.startTime : min),
    referenceEvents[0].startTime,
  );

  let explicitShift = null;
  for (const e of events) {
    const s1 = String(e.row[schedShiftIdx] || "").trim();
    const s2 = String(e.row[infShiftIdx] || "").trim();

    let match = null;
    if (s2)
      match = s2.match(
        /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/,
      );
    if (!match && s1)
      match = s1.match(
        /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/,
      );

    if (match) {
      let startH = parseInt(match[1]);
      let startM = parseInt(match[2]);
      let startPeriod = match[3] ? match[3].toUpperCase() : null;

      let endH = parseInt(match[4]);
      let endM = parseInt(match[5]);
      let endPeriod = match[6] ? match[6].toUpperCase() : null;

      if (startPeriod === "PM" && startH !== 12) startH += 12;
      if (startPeriod === "AM" && startH === 12) startH = 0;

      if (endPeriod === "PM" && endH !== 12) endH += 12;
      if (endPeriod === "AM" && endH === 12) endH = 0;

      explicitShift = {
        startHour: startH,
        startMinute: startM,
        endHour: endH,
        endMinute: endM,
        label: `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}-${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`,
        crossesMidnight: startH > endH || (startH === endH && startM > endM),
      };
      break;
    }
  }

  let candidates = SHIFTS.slice();
  if (explicitShift) {
    candidates.push(explicitShift);
  }

  // Find actual start work time (using the first non-offline, non-forgot_status event)
  const firstWorkEvent = events.find((e) => {
    const isWork = isEventWork(e);
    const combinedInfo =
      `${e.status} ${e.subStatus} ${e.remarks}`.toLowerCase();
    const isOffline =
      combinedInfo.includes("offline") ||
      combinedInfo === "off" ||
      combinedInfo.includes("deslogado") ||
      combinedInfo.includes("fim");
    return isWork && !isOffline;
  });
  const actualEntryTime = firstWorkEvent
    ? firstWorkEvent.startTime
    : events[0].startTime;

  interface ShiftOccurrence {
    shift: (typeof SHIFTS)[0];
    startTime: Date;
  }
  const occurrences: ShiftOccurrence[] = [];
  candidates.forEach((shift) => {
    [-1, 0, 1].forEach((offset) => {
      const d = new Date(actualEntryTime);
      d.setDate(d.getDate() + offset);
      d.setHours(shift.startHour, shift.startMinute, 0, 0);
      occurrences.push({ shift, startTime: d });
    });
  });

  occurrences.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // Filter occurrences to find any shift that begins within 15 minutes of the agent's entry time
  // (both up to 15 min after a shift start, and up to 15 min before a shift start)
  const matchingOccurrences = occurrences.filter((occ) => {
    const diffMinutes =
      Math.abs(occ.startTime.getTime() - actualEntryTime.getTime()) / 60000;
    return diffMinutes <= 15;
  });

  let closestShift = SHIFTS[0];
  if (matchingOccurrences.length > 0) {
    // Prioritize the occurrence closest in absolute time to the entry time
    matchingOccurrences.sort((a, b) => {
      const diffA = Math.abs(a.startTime.getTime() - actualEntryTime.getTime());
      const diffB = Math.abs(b.startTime.getTime() - actualEntryTime.getTime());
      return diffA - diffB;
    });
    closestShift = matchingOccurrences[0].shift;
  } else {
    // If there are no shifts starting within 15 minutes of the entry time,
    // default to the scheduled/explicit shift if it exists, otherwise find the closest in absolute time.
    if (explicitShift) {
      closestShift = explicitShift;
    } else {
      const occurrencesWithDist = occurrences.map((occ) => {
        const diffMinutes =
          Math.abs(occ.startTime.getTime() - actualEntryTime.getTime()) / 60000;
        return { occ, diffMinutes };
      });
      occurrencesWithDist.sort((a, b) => a.diffMinutes - b.diffMinutes);
      closestShift = occurrencesWithDist[0].occ.shift;
    }
  }

  const shiftStartLimit = new Date(minWorkTime);
  shiftStartLimit.setHours(
    closestShift.startHour,
    closestShift.startMinute,
    0,
    0,
  );

  if (employeeName.includes("karely")) {
    console.log("Karely Shift Detection:", {
      minWorkTime,
      closestShift,
      shiftStartLimit,
    });
  }

  // If the first event is well before the shift start limit today,
  // it means the shift actually started yesterday.
  if (minWorkTime.getTime() < shiftStartLimit.getTime() - 6 * 3600000) {
    shiftStartLimit.setDate(shiftStartLimit.getDate() - 1);
  }

  const shiftEndLimit = new Date(shiftStartLimit);
  if (closestShift.crossesMidnight) {
    shiftEndLimit.setDate(shiftEndLimit.getDate() + 1);
  }
  shiftEndLimit.setHours(closestShift.endHour, closestShift.endMinute, 0, 0);
  if (shiftEndLimit.getTime() <= shiftStartLimit.getTime()) {
    shiftEndLimit.setDate(shiftEndLimit.getDate() + 1);
  }

  if (employeeName.includes("karely")) {
    console.log("Karely Shift Limits:", { shiftStartLimit, shiftEndLimit });
  }

  const shiftEndPlus10 = new Date(shiftEndLimit.getTime() + 10 * 60000);

  let actualStartTime: Date | null = null;
  let actualEndTime: Date | null = null;

  // 3. Process Events
  events.forEach((e) => {
    // Combine status, subStatus, and remarks for comprehensive detection
    const combinedInfo =
      `${e.status} ${e.subStatus} ${e.remarks}`.toLowerCase();

    let isWork = isEventWork(e);

    let currentBreakType: BreakSession["type"] = "other";

    if (
      combinedInfo.includes("non moderation") ||
      combinedInfo.includes("non-moderation") ||
      combinedInfo.includes("non_moderating") ||
      combinedInfo.includes("non moderation task") ||
      combinedInfo.includes("non moderating task")
    ) {
      currentBreakType = "non_moderating";
    } else if (
      combinedInfo.includes("moderat") ||
      combinedInfo.includes("moderation") ||
      combinedInfo.includes("moderação")
    ) {
      currentBreakType = "moderating";
    } else if (
      combinedInfo.includes("meeting") ||
      combinedInfo.includes("reuni")
    ) {
      currentBreakType = "meeting";
    } else if (
      combinedInfo.includes("training") ||
      combinedInfo.includes("treinamento")
    ) {
      currentBreakType = "training";
    } else if (
      combinedInfo.includes("meal") ||
      combinedInfo.includes("almoço")
    ) {
      currentBreakType = "meal";
    } else if (
      WC_KEYWORDS.some((k) => {
        if (k === "wc" || k === "ob" || k === "o b" || k === "ewc") {
          return new RegExp(
            `(?:^|[^a-z])${k.replace(/ /g, "\\s+")}(?:[^a-z]|$)`,
            "i",
          ).test(combinedInfo);
        }
        return combinedInfo.includes(k);
      })
    ) {
      currentBreakType = "wc";
    } else if (
      combinedInfo.includes("praying") ||
      combinedInfo.includes("oracao") ||
      combinedInfo.includes("oração") ||
      combinedInfo.includes("reza") ||
      combinedInfo.includes("rezar")
    ) {
      currentBreakType = "praying";
    } else if (
      combinedInfo.includes("offline") ||
      combinedInfo === "off" ||
      combinedInfo.includes("deslogado") ||
      combinedInfo.includes("fim")
    ) {
      currentBreakType = "offline";
    } else if (
      combinedInfo.includes("wellness") ||
      combinedInfo.includes("bem-estar") ||
      combinedInfo.includes("bem estar")
    ) {
      currentBreakType = "wellness";
    } else if (
      combinedInfo.includes("short") ||
      combinedInfo.includes("pausa")
    ) {
      currentBreakType = "short";
    } else if (
      combinedInfo.includes("idle") ||
      combinedInfo.includes("inativo") ||
      combinedInfo.includes("ocioso") ||
      combinedInfo.includes("sem atividade")
    ) {
      currentBreakType = "idle";
    }

    // Only reclassify as 'forgot_status' if it's REALLY not work, and long.
    // Removed dynamic reclassification to avoid mislabelling known statuses as IDLE
    // if (!isWork && e.durationMinutes > 180 && currentBreakType !== 'offline') {
    //    currentBreakType = 'forgot_status';
    // }

    // default work type if not set
    if (isWork && currentBreakType === "other") {
      currentBreakType = "moderating"; // default work display
    }

    let finalEndTime = e.endTime;
    let finalDuration = e.durationMinutes;

    const isOvertimeAllowed =
      currentBreakType === "moderating" ||
      currentBreakType === "training" ||
      currentBreakType === "meeting" ||
      currentBreakType === "non_moderating";
    const minutesPastShiftLimit = Math.round(
      (e.endTime.getTime() - shiftEndLimit.getTime()) / 60000,
    );

    const isExemptBreak =
      currentBreakType === "short" ||
      currentBreakType === "wellness" ||
      currentBreakType === "wc" ||
      currentBreakType === "meal" ||
      currentBreakType === "praying";

    if (!isOvertimeAllowed && e.endTime > shiftEndLimit && !isExemptBreak) {
      if (e.startTime >= shiftEndLimit) {
        currentBreakType =
          currentBreakType === "offline" ? "offline" : "forgot_status";
      } else {
        finalEndTime = new Date(shiftEndLimit);
        finalDuration = Math.round(
          (finalEndTime.getTime() - e.startTime.getTime()) / 60000,
        );

        const remainderDuration = Math.round(
          (e.endTime.getTime() - shiftEndLimit.getTime()) / 60000,
        );
        if (remainderDuration > 0 && currentBreakType !== "offline") {
          breaks.push({
            type: "forgot_status",
            rawStatus: e.rawStatus || e.rawInfo?.trim() || "",
            subType: `(Esqueceu status: ${e.subStatus || currentBreakType})`,
            remarks: e.originalRemark,
            originalStatus: e.originalStatus,
            originalSubStatus: e.originalSubStatus,
            originalRemark: e.originalRemark,
            startTime: new Date(shiftEndLimit),
            endTime: e.endTime,
            durationMinutes: remainderDuration,
          });
        }
      }
    } else if (isOvertimeAllowed && minutesPastShiftLimit > 240) {
      if (e.startTime >= shiftEndLimit) {
        currentBreakType = "forgot_status";
      } else {
        finalEndTime = new Date(
          Math.min(e.endTime.getTime(), shiftEndLimit.getTime() + 60 * 60000),
        );
        finalDuration = Math.round(
          (finalEndTime.getTime() - e.startTime.getTime()) / 60000,
        );

        const remainderDuration = Math.round(
          (e.endTime.getTime() - finalEndTime.getTime()) / 60000,
        );
        if (remainderDuration > 0) {
          breaks.push({
            type: "forgot_status",
            rawStatus: e.rawStatus || e.rawInfo?.trim() || "",
            subType: `(Esqueceu status: ${e.subStatus || currentBreakType})`,
            remarks: e.originalRemark,
            originalStatus: e.originalStatus,
            originalSubStatus: e.originalSubStatus,
            originalRemark: e.originalRemark,
            startTime: new Date(finalEndTime),
            endTime: e.endTime,
            durationMinutes: remainderDuration,
          });
        }
      }
    }

    if (currentBreakType === "offline" && finalEndTime > shiftEndLimit) {
      finalEndTime = new Date(
        Math.min(finalEndTime.getTime(), shiftEndLimit.getTime()),
      );
      finalDuration = Math.round(
        (finalEndTime.getTime() - e.startTime.getTime()) / 60000,
      );
      if (finalDuration < 0) {
        finalDuration = 0;
        finalEndTime = e.startTime;
      }
    }

    if (
      isWork &&
      currentBreakType !== "forgot_status" &&
      currentBreakType !== "offline"
    ) {
      totalWorkTimeMillis += finalDuration * 60 * 1000;
    }

    if (finalDuration > 0 || currentBreakType === "offline") {
      breaks.push({
        type: currentBreakType,
        rawStatus: e.rawStatus || e.rawInfo?.trim() || "",
        subType: e.subStatus,
        remarks: e.originalRemark,
        originalStatus: e.originalStatus,
        originalSubStatus: e.originalSubStatus,
        originalRemark: e.originalRemark,
        startTime: e.startTime,
        endTime: finalEndTime,
        durationMinutes: finalDuration,
      });
    }

    if (
      currentBreakType !== "forgot_status" &&
      currentBreakType !== "offline"
    ) {
      if (!actualStartTime) {
        actualStartTime = e.startTime;
      }
      if (!actualEndTime || e.endTime > actualEndTime) {
        actualEndTime = e.endTime;
      }
    }
  });

  let tardinessMinutes = 0;
  if (actualStartTime) {
    const diff = Math.round(
      (actualStartTime.getTime() - shiftStartLimit.getTime()) / 60000,
    );
    if (diff > 0 && diff < 8 * 60) {
      tardinessMinutes = diff;
    }
  }

  let earlyLeaveMinutes = 0;
  if (actualEndTime) {
    if (shiftEndLimit.getTime() <= Date.now() + 60000) {
      const diff = Math.round(
        (shiftEndLimit.getTime() - actualEndTime.getTime()) / 60000,
      );
      if (diff > 0 && diff < 8 * 60) {
        earlyLeaveMinutes = diff;

        // Only insert if no other break covers this significant portion
        const alreadyCovered = breaks.some(
          (b) =>
            b.type === "offline" &&
            b.startTime.getTime() <= actualEndTime.getTime() + 5 * 60000 &&
            b.endTime.getTime() >= shiftEndLimit.getTime() - 5 * 60000,
        );

        if (!alreadyCovered) {
          // Dynamically insert an offline break for early leave
          breaks.push({
            type: "offline",
            rawStatus: "offline (system inferred)",
            subType: "",
            remarks: "",
            originalStatus: "offline",
            originalSubStatus: "",
            originalRemark: "",
            startTime: new Date(actualEndTime),
            endTime: new Date(shiftEndLimit),
            durationMinutes: diff,
          });
        }
      }
    }
  }

  // Find internal gaps between events
  const sortedEventsForGaps = [...events].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );
  let lastEnd = actualStartTime ? new Date(actualStartTime) : null;

  if (lastEnd) {
    for (const e of sortedEventsForGaps) {
      if (e.startTime > lastEnd) {
        const gapMins = Math.round(
          (e.startTime.getTime() - lastEnd.getTime()) / 60000,
        );
        if (gapMins > 0 && gapMins < 8 * 60) {
          // arbitrary bound so we don't insert massive 14 hr gaps
          // Insert implicit offline for gaps
          breaks.push({
            type: "offline",
            rawStatus: "offline/gap (system inferred)",
            subType: "",
            remarks: "",
            originalStatus: "offline",
            originalSubStatus: "",
            originalRemark: "",
            startTime: new Date(lastEnd),
            endTime: new Date(e.startTime),
            durationMinutes: gapMins,
          });
        }
      }
      if (e.endTime > lastEnd) {
        lastEnd = new Date(e.endTime);
      }
    }
  }

  const mealDuration = breaks
    .filter((b) => b.type === "meal")
    .reduce((sum, b) => sum + b.durationMinutes, 0);
  const shortBreaks = breaks.filter((b) => b.type === "short");
  const shortDuration = shortBreaks.reduce(
    (sum, b) => sum + b.durationMinutes,
    0,
  );

  let hasSingleShort30m = false;
  if (shortBreaks.length === 1 && shortBreaks[0].durationMinutes >= 20) {
    hasSingleShort30m = true;
  }

  const wellnessDuration = breaks
    .filter((b) => b.type === "wellness")
    .reduce((sum, b) => sum + b.durationMinutes, 0);
  const prayingDuration = breaks
    .filter((b) => b.type === "praying")
    .reduce((sum, b) => sum + b.durationMinutes, 0);
  const wcDuration = breaks
    .filter((b) => b.type === "wc")
    .reduce((sum, b) => sum + b.durationMinutes, 0);
  const idleDuration = breaks
    .filter((b) => b.type === "idle")
    .reduce((sum, b) => sum + b.durationMinutes, 0);
  const nonModDuration = breaks
    .filter((b) => b.type === "non_moderating")
    .reduce((sum, b) => sum + b.durationMinutes, 0);
  const reviewAndAppealDuration = breaks
    .filter(
      (b) =>
        b.type === "non_moderating" &&
        (b.subType?.toLowerCase()?.includes("review") ||
          b.subType?.toLowerCase()?.includes("appeal")),
    )
    .reduce((sum, b) => sum + b.durationMinutes, 0);
  const awaitingTasksDuration = breaks
    .filter(
      (b) =>
        b.type === "non_moderating" &&
        b.subType?.toLowerCase()?.includes("awaiting tasks"),
    )
    .reduce((sum, b) => sum + b.durationMinutes, 0);
  const forgotStatusDuration = breaks
    .filter((b) => b.type === "forgot_status")
    .reduce((sum, b) => sum + b.durationMinutes, 0);

  let mealOver = Math.max(0, mealDuration - LIMITS.MEAL);
  let shortOver = Math.max(0, shortDuration - LIMITS.SHORT);

  // Tolerance of 2 minutes for single 30m breaks
  if (hasSingleShort30m && shortOver <= 2) {
    shortOver = 0;
  }

  let hasMealWithoutShortAnomaly = false;

  if (mealDuration > 70 && shortDuration === 0) {
    // Using 70m to cover 10m threshold mentioned
    hasMealWithoutShortAnomaly = true;
    mealOver = Math.max(0, mealDuration - (LIMITS.MEAL + LIMITS.SHORT));
  } else if (mealOver > 15 && shortDuration === 0) {
    hasMealWithoutShortAnomaly = true;
    mealOver = Math.max(0, mealDuration - (LIMITS.MEAL + LIMITS.SHORT));
  }

  const wellnessOver = Math.max(0, wellnessDuration - LIMITS.WELLNESS);
  const prayingOver = Math.max(0, prayingDuration - LIMITS.PRAYING);
  const wcOver = wcDuration > LIMITS.WC ? wcDuration - LIMITS.WC : 0;

  const idleOver = idleDuration;

  const totalOver = mealOver + shortOver + wellnessOver + prayingOver;

  breaks.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return {
    date: format(shiftStartLimit, "yyyy-MM-dd"),
    employeeName: employeeName || "Unknown",
    inferredShift: closestShift.label,
    hasMealWithoutShortAnomaly,
    hasSingleShort30m,
    totalWorkTimeMillis,
    breaks,
    mealDuration,
    shortDuration,
    wellnessDuration,
    wcDuration,
    prayingDuration,
    idleDuration,
    nonModDuration,
    reviewAndAppealDuration,
    awaitingTasksDuration,
    forgotStatusDuration,
    mealOverbreak: mealOver,
    shortOverbreak: shortOver,
    wellnessOverbreak: wellnessOver,
    prayingOverbreak: prayingOver,
    wcOverbreak: wcOver,
    idleOverbreak: idleOver,
    totalOverbreak: totalOver,
    tardinessMinutes,
    earlyLeaveMinutes,
    actualStartTime,
    actualEndTime,
    isATT,
    isLOA,
    isPTO,
    isSL,
    isSUSPP,
    isOFF,
  };
}

function parseTime(dateStr: string, rawTime: any): Date | null {
  if (rawTime === undefined || rawTime === null || rawTime === "") return null;

  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;

  let d = new Date(year, month - 1, day);

  if (rawTime instanceof Date) {
    const isNegativeTimezone = rawTime.getTimezoneOffset() > 0;
    const rawYear = isNegativeTimezone
      ? rawTime.getUTCFullYear()
      : rawTime.getFullYear();
    const rawMonth = isNegativeTimezone
      ? rawTime.getUTCMonth()
      : rawTime.getMonth();
    const rawDate = isNegativeTimezone
      ? rawTime.getUTCDate()
      : rawTime.getDate();
    const rawHours = isNegativeTimezone
      ? rawTime.getUTCHours()
      : rawTime.getHours();
    const rawMinutes = isNegativeTimezone
      ? rawTime.getUTCMinutes()
      : rawTime.getMinutes();
    const rawSeconds = isNegativeTimezone
      ? rawTime.getUTCSeconds()
      : rawTime.getSeconds();

    if (rawYear >= 2000) {
      return new Date(
        rawYear,
        rawMonth,
        rawDate,
        rawHours,
        rawMinutes,
        rawSeconds,
        0,
      );
    } else {
      d.setHours(rawHours, rawMinutes, rawSeconds, 0);
      return d;
    }
  }

  if (typeof rawTime === "number") {
    const fraction = rawTime % 1;
    const totalSeconds = Math.round(fraction * 24 * 3600);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    d.setHours(hours, minutes, seconds, 0);
    return d;
  }

  const timeStr = String(rawTime).trim();
  const timeMatch = timeStr.match(
    /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?/,
  );
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    const ampm = timeMatch[4] ? timeMatch[4].toUpperCase() : null;

    if (ampm === "PM" && hours !== 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;

    d.setHours(hours, minutes, seconds, 0);
    return d;
  }

  const fullParsed = new Date(`${dateStr} ${timeStr}`);
  if (!isNaN(fullParsed.getTime())) return fullParsed;

  return null;
}
