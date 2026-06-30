import * as XLSX from "xlsx";
import { CalendarData } from "../types";

// Helper to convert Excel date serial to string (dd/MM/yyyy)
function formatExcelDate(excelDate: number): string {
  const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

const isSupportRoleStr = (role: string, lob: string) => {
  const r = (role || "").toUpperCase().trim();
  const l = (lob || "").toUpperCase().trim();
  if (l.includes("LED QUALITY")) return false;
  if (r === "OS" || l === "OS") return true;
  const supportRegex =
    /\b(QA|RTA|TRAINER|SUPERVISOR|MANAGER|TL|WFM|REAL TIME|OPS|COORDINATOR|QUALITY|OPERATIONAL SUPPORT)\b/i;
  return supportRegex.test(r) || supportRegex.test(l);
};

export const parseCalendarFile = async (
  file: File,
): Promise<{ data: CalendarData[]; note: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });

        const calendarData: CalendarData[] = [];
        const seenNames = new Set<string>();

        const now = new Date();
        const threshold = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        threshold.setHours(0, 0, 0, 0);

        let foundNote = "";
        if (workbook.SheetNames.length > 0) {
          const firstSheet = workbook.SheetNames[0];
          const match = firstSheet.split(".");
          if (match.length > 1) {
            foundNote = match[match.length - 1]; // everything after the last dot, e.g., "APR" from "2604.APR"
          } else {
            foundNote = firstSheet; // fallback
          }
        }

        let fileIsMMDD = false;

        // Quick scan to auto-detect MMDD vs DDMM
        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          const sampleRows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: "",
          }) as any[][];
          for (const row of sampleRows.slice(0, 20)) {
            for (const cell of row) {
              if (typeof cell === "string") {
                const parts = cell.split(/[\/\-]/);
                if (parts.length >= 2) {
                  const p1 = parseInt(parts[0], 10);
                  const p2 = parseInt(parts[1], 10);
                  if (!isNaN(p1) && !isNaN(p2)) {
                    if (p1 <= 12 && p2 > 12 && p2 <= 31) {
                      fileIsMMDD = true;
                    }
                  }
                }
              }
            }
          }
        }

        // Loop through all sheets
        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];

          // parse as array of arrays to handle custom column positions
          const rows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: "",
          }) as any[][];

          if (rows.length === 0) continue;

          // Detect header row inside the first 20 rows
          let headerRowIdx = -1;
          for (let i = 0; i < Math.min(20, rows.length); i++) {
            if (rows[i] && rows[i].length > 2) {
              const rowStrings = rows[i].map((v) =>
                String(v).toLowerCase().trim(),
              );
              const hasNameCol = rowStrings.some(
                (s) =>
                  s === "name" ||
                  s === "nome" ||
                  s === "agent" ||
                  s === "moderator" ||
                  s === "agent name" ||
                  s === "employee",
              );
              const hasDateCol = rows[i].some(
                (v) =>
                  typeof v === "number" ||
                  (typeof v === "string" &&
                    (v.match(/^\d{1,2}[\/\-]\d{1,2}/) ||
                      (!isNaN(Date.parse(v)) && v.length > 3))),
              );

              if (hasNameCol || hasDateCol) {
                headerRowIdx = i;
                if (hasNameCol && hasDateCol) break;
              }
            }
          }

          if (headerRowIdx !== -1) {
            const headers = rows[headerRowIdx];

            let nameCol = -1;
            let lobCol = -1;
            let langCol = -1;
            let roleCol = -1;
            let dateStartCol = -1;
            let workdayCol = -1;

            for (let c = 0; c < headers.length; c++) {
              const h = String(headers[c]).toLowerCase().trim();
              if (
                nameCol === -1 &&
                (h === "name" ||
                  h === "nome" ||
                  h === "agent" ||
                  h === "moderator" ||
                  h === "agent name")
              )
                nameCol = c;
              else if (
                lobCol === -1 &&
                (h === "lob" || h === "project" || h === "campaign")
              )
                lobCol = c;
              else if (
                langCol === -1 &&
                (h.includes("lang") || h === "idioma" || h === "market")
              )
                langCol = c;
              else if (
                roleCol === -1 &&
                (h === "role" || h === "position" || h === "profile")
              )
                roleCol = c;
              else if (
                workdayCol === -1 &&
                (h === "workday" || h === "workday id" || h === "workday_id" || h === "id workday" || h === "emplid" || h === "employee id" || h === "id" || h === "uid" || h === "worker id" || h.includes("id workday") || h.includes("workday id"))
              ) {
                workdayCol = c;
              }

              // Detect first date column
              if (dateStartCol === -1) {
                const isNum = typeof headers[c] === "number";
                const isDateStr =
                  typeof headers[c] === "string" &&
                  (headers[c].match(/^\d{1,2}[\/\-]\d{1,2}/) ||
                    (!isNaN(Date.parse(headers[c])) && headers[c].length > 3));
                if (isNum || isDateStr) {
                  dateStartCol = c;
                }
              }
            }

            // Fallbacks if headers not found correctly
            if (dateStartCol === -1) dateStartCol = 5;
            if (nameCol === -1 && 1 < dateStartCol) nameCol = 1;
            if (lobCol === -1 && 2 < dateStartCol) lobCol = 2;
            if (langCol === -1 && 3 < dateStartCol) langCol = 3;
            if (roleCol === -1 && 4 < dateStartCol) roleCol = 4;

            for (let i = headerRowIdx + 1; i < rows.length; i++) {
              const row = rows[i];
              if (!row || row.length < 2) continue;

              const name =
                nameCol !== -1 ? String(row[nameCol] || "").trim() : "";
              if (
                !name ||
                name === "" ||
                name.toLowerCase() === "name" ||
                name.toLowerCase() === "moderator"
              )
                continue;

              const lob = lobCol !== -1 ? String(row[lobCol] || "").trim() : "";
              const language =
                langCol !== -1 ? String(row[langCol] || "").trim() : "";
              const role =
                roleCol !== -1 ? String(row[roleCol] || "").trim() : "";
              const workdayId =
                workdayCol !== -1 ? String(row[workdayCol] || "").trim() : "";

              const schedule: Record<string, string> = {};
              const lobSchedule: Record<string, string> = {};
              let firstValidShift = "";

              for (
                let col = dateStartCol;
                col < Math.max(headers.length, row.length);
                col++
              ) {
                const headerVal = headers[col];
                if (!headerVal) continue;

                let dateKey = String(headerVal).trim();
                let dateObj: Date | null = null;
                if (typeof headerVal === "number") {
                  dateObj = new Date(
                    Math.round((headerVal - 25569) * 86400 * 1000),
                  );
                  dateKey = formatExcelDate(headerVal);
                } else if (typeof headerVal === "string") {
                  const parts = dateKey.split(/[\/\-]/);
                  if (parts.length === 3) {
                    let [d, m, y] = parts.map((p) => parseInt(p, 10));
                    if (fileIsMMDD) {
                      m = parseInt(parts[0], 10);
                      d = parseInt(parts[1], 10);
                    }
                    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
                      const year = y < 100 ? 2000 + y : y;
                      dateObj = new Date(year, m - 1, d);
                      dateKey = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${year}`;
                    }
                  } else if (parts.length === 2) {
                    let [d, m] = parts.map((p) => parseInt(p, 10));
                    if (fileIsMMDD) {
                      m = parseInt(parts[0], 10);
                      d = parseInt(parts[1], 10);
                    }
                    if (!isNaN(d) && !isNaN(m)) {
                      const year = new Date().getFullYear();
                      dateObj = new Date(year, m - 1, d);
                      dateKey = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${year}`;
                    }
                  } else if (!isNaN(Date.parse(dateKey))) {
                    dateObj = new Date(dateKey);
                    dateKey = `${String(dateObj.getDate()).padStart(2, "0")}/${String(dateObj.getMonth() + 1).padStart(2, "0")}/${dateObj.getFullYear()}`;
                  }
                }

                if (dateObj && dateObj < threshold) continue;

                const shiftVal = String(row[col] || "").trim();
                if (
                  shiftVal &&
                  shiftVal !== "-" &&
                  shiftVal.toLowerCase() !== "vazio"
                ) {
                  schedule[dateKey] = shiftVal;
                  if (lob) lobSchedule[dateKey] = lob;

                  // Add variations
                  const parts = dateKey.split("/");
                  if (parts.length >= 2) {
                    schedule[`${parts[0]}/${parts[1]}`] = shiftVal;
                    schedule[`${parts[2]}-${parts[1]}-${parts[0]}`] = shiftVal;
                    if (lob) {
                      lobSchedule[`${parts[0]}/${parts[1]}`] = lob;
                      lobSchedule[`${parts[2]}-${parts[1]}-${parts[0]}`] = lob;
                    }
                  }

                  const isWork = /\d{1,2}:\d{2}/.test(shiftVal);
                  if (isWork) {
                    if (
                      !firstValidShift ||
                      !/\d{1,2}:\d{2}/.test(firstValidShift)
                    ) {
                      firstValidShift = shiftVal;
                    }
                  } else if (
                    !firstValidShift &&
                    shiftVal.toLowerCase() !== "off"
                  ) {
                    firstValidShift = shiftVal;
                  }
                }
              }

              const normName = name.toLowerCase().trim();
              const existingEntry = calendarData.find((c) => {
                if (normName.includes("@")) {
                  return (c.email && c.email.toLowerCase() === normName) || c.name.toLowerCase() === normName;
                }
                return c.name.toLowerCase().trim() === normName;
              });

              if (existingEntry) {
                Object.assign(existingEntry.schedule, schedule);
                if (existingEntry.lobSchedule) {
                  Object.assign(existingEntry.lobSchedule, lobSchedule);
                } else {
                  existingEntry.lobSchedule = lobSchedule;
                }
                if (!existingEntry.shift && firstValidShift) {
                  existingEntry.shift = firstValidShift;
                }
                if (!existingEntry.email && name.includes("@")) {
                  existingEntry.email = name.toLowerCase().trim();
                }
                if (workdayId) {
                  existingEntry.workdayId = workdayId;
                }

                const hasNewShifts = Object.keys(schedule).length > 0;

                if (hasNewShifts) {
                  // Prefer the role/lob from the most recent sheet that has shifts for this agent
                  if (role) existingEntry.role = role;
                  if (lob) existingEntry.lob = lob;
                  if (language) existingEntry.language = language;
                } else if (!existingEntry.role && role) {
                  existingEntry.role = role;
                }
              } else {
                seenNames.add(normName);
                const emailToUse = name.includes("@") ? name.toLowerCase().trim() : "";
                calendarData.push({
                  email: emailToUse,
                  name: name,
                  workdayId: workdayId,
                  lob: lob,
                  language: language,
                  supervisor: "",
                  role: role,
                  shift: firstValidShift || "",
                  schedule,
                  lobSchedule,
                });
              }
            }
          } else {
            const jsonData = XLSX.utils.sheet_to_json(worksheet, {
              defval: "",
            });
            jsonData.forEach((row: any) => {
              const normalizedRow: Record<string, any> = {};
              for (const key in row) {
                normalizedRow[key.toLowerCase().trim()] = row[key];
              }

              let email =
                normalizedRow["email"] ||
                normalizedRow["e-mail"] ||
                normalizedRow["email address"] ||
                "";
              if (
                !email &&
                typeof normalizedRow["username"] === "string" &&
                normalizedRow["username"].includes("@")
              ) {
                email = normalizedRow["username"];
              }

              let name =
                normalizedRow["name"] ||
                normalizedRow["agent name"] ||
                normalizedRow["full name"] ||
                normalizedRow["employee name"] ||
                normalizedRow["moderator"] ||
                "";
              if (!name && !email) return;

              let lob =
                normalizedRow["lob"] ||
                normalizedRow["line of business"] ||
                normalizedRow["project"] ||
                "";
              let language =
                normalizedRow["language"] ||
                normalizedRow["lang"] ||
                normalizedRow["market"] ||
                "";
              let supervisor =
                normalizedRow["supervisor"] ||
                normalizedRow["manager"] ||
                normalizedRow["team leader"] ||
                normalizedRow["tl"] ||
                "";
              let role =
                normalizedRow["role"] || normalizedRow["position"] || "";
              let shift =
                normalizedRow["shift"] || normalizedRow["default shift"] || "";
              let workdayId = String(
                normalizedRow["workday"] ||
                normalizedRow["workday id"] ||
                normalizedRow["workday_id"] ||
                normalizedRow["id workday"] ||
                normalizedRow["id_workday"] ||
                normalizedRow["emplid"] ||
                normalizedRow["employee id"] ||
                normalizedRow["id"] ||
                normalizedRow["uid"] ||
                normalizedRow["worker id"] ||
                ""
              ).trim();

              const schedule: Record<string, string> = {};
              const lobSchedule: Record<string, string> = {};
              for (const key in row) {
                const val = row[key];
                const parts = key.split(/[\/\-]/);
                let isDate = false;
                let dateObj: Date | null = null;
                let formattedKey = key;

                if (/^\d{5}$/.test(key)) {
                  const excelVal = parseInt(key, 10);
                  dateObj = new Date(
                    Math.round((excelVal - 25569) * 86400 * 1000),
                  );
                  formattedKey = formatExcelDate(excelVal);
                  isDate = true;
                } else if (parts.length === 3) {
                  let [d, m, y] = parts.map((p) => parseInt(p, 10));
                  if (fileIsMMDD) {
                    m = parseInt(parts[0], 10);
                    d = parseInt(parts[1], 10);
                  }
                  if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
                    const year = y < 100 ? 2000 + y : y;
                    dateObj = new Date(year, m - 1, d);
                    formattedKey = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${year}`;
                    isDate = true;
                  }
                } else if (
                  parts.length === 2 &&
                  !isNaN(parseInt(parts[0], 10)) &&
                  !isNaN(parseInt(parts[1], 10))
                ) {
                  let [d, m] = parts.map((p) => parseInt(p, 10));
                  if (fileIsMMDD) {
                    m = parseInt(parts[0], 10);
                    d = parseInt(parts[1], 10);
                  }
                  if (!isNaN(d) && !isNaN(m)) {
                    const year = new Date().getFullYear();
                    dateObj = new Date(year, m - 1, d);
                    formattedKey = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${year}`;
                    isDate = true;
                  }
                } else if (!isNaN(Date.parse(key)) && key.length > 3) {
                  dateObj = new Date(key);
                  formattedKey = `${String(dateObj.getDate()).padStart(2, "0")}/${String(dateObj.getMonth() + 1).padStart(2, "0")}/${dateObj.getFullYear()}`;
                  isDate = true;
                }

                if (isDate && dateObj) {
                  if (dateObj < threshold) continue;

                  if (
                    val &&
                    String(val).trim() !== "-" &&
                    String(val).trim().toLowerCase() !== "vazio"
                  ) {
                    const shiftVal = String(val).trim();
                    schedule[formattedKey] = shiftVal;
                    if (lob) lobSchedule[formattedKey] = String(lob).trim();

                    const newParts = formattedKey.split("/");
                    if (newParts.length >= 2) {
                      schedule[`${newParts[0]}/${newParts[1]}`] = shiftVal;
                      schedule[`${newParts[2]}-${newParts[1]}-${newParts[0]}`] =
                        shiftVal;
                      if (lob) {
                        lobSchedule[`${newParts[0]}/${newParts[1]}`] =
                          String(lob).trim();
                        lobSchedule[
                          `${newParts[2]}-${newParts[1]}-${newParts[0]}`
                        ] = String(lob).trim();
                      }
                    }
                  }
                }
              }

              const normName = String(name).toLowerCase().trim();
              const existingEntry = calendarData.find((c) => {
                const parsedEmail = String(email || "")
                  .toLowerCase()
                  .trim();
                const entryEmail = String(c.email || "")
                  .toLowerCase()
                  .trim();
                if (parsedEmail && entryEmail) {
                  return entryEmail === parsedEmail;
                }
                return normName && c.name.toLowerCase().trim() === normName;
              });

               if (existingEntry) {
                if (!existingEntry.email && email) {
                  existingEntry.email = String(email).toLowerCase().trim();
                }
                Object.assign(existingEntry.schedule, schedule);
                if (existingEntry.lobSchedule) {
                  Object.assign(existingEntry.lobSchedule, lobSchedule);
                } else {
                  existingEntry.lobSchedule = lobSchedule;
                }
                if (!existingEntry.shift && shift)
                  existingEntry.shift = String(shift).trim();
                if (workdayId) {
                  existingEntry.workdayId = workdayId;
                }

                const newIsSupp = isSupportRoleStr(role, lob);
                const oldIsSupp = isSupportRoleStr(
                  existingEntry.role,
                  existingEntry.lob || "",
                );
                if (newIsSupp && !oldIsSupp) {
                  existingEntry.role = role;
                  if (lob) existingEntry.lob = lob;
                  if (language) existingEntry.language = language;
                } else if (role && !existingEntry.role) {
                  existingEntry.role = role;
                }
              } else {
                seenNames.add(normName);
                let emailToUse = String(email).toLowerCase().trim();
                if (!emailToUse && String(name).includes("@")) {
                  emailToUse = String(name).toLowerCase().trim();
                }
                calendarData.push({
                  email: emailToUse,
                  name: String(name).trim(),
                  workdayId: workdayId,
                  lob: String(lob).trim(),
                  language: String(language).trim(),
                  supervisor: String(supervisor).trim(),
                  role: String(role).trim(),
                  shift:
                    String(shift).trim() || Object.values(schedule)[0] || "",
                  schedule,
                  lobSchedule,
                });
              }
            });
          }
        }

        resolve({ data: calendarData, note: foundNote });
      } catch (error) {
        console.error("Error parsing calendar Excel:", error);
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};
