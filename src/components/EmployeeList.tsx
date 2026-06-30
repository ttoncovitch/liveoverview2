import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { EmployeeSummary, EmployeeDayRecord } from "../types";
import { isSupportRole } from "./LOBAnalytics";
import { format, parseISO } from "date-fns";
import { isShiftMismatch, formatLOB } from "../lib/shiftUtils";
import {
  Calendar as CalendarIcon,
  Search,
  ChevronRight,
  AlertTriangle,
  Info,
  ArrowUpDown,
  Clock,
  Mail,
  FileDown,
  Send,
  Users,
  X,
  Copy,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useLanguage } from "../contexts/LanguageContext";
import { exportToPDF } from "../lib/pdf-exporter";
import { toast } from "sonner";

function getShiftStartMinutes(shiftStr: string): number | null {
  if (!shiftStr) return null;
  let cleaned = shiftStr.toUpperCase().replace(/\s+/g, "");
  const parts = cleaned.split("-");
  if (parts.length === 0) return null;
  const firstPart = parts[0];
  
  let isPM = firstPart.includes("PM");
  let isAM = firstPart.includes("AM");
  let t = firstPart.replace(/[A-Z]/g, "").replace(":", ".");
  let subparts = t.split(".");
  let h = parseInt(subparts[0], 10);
  let m = parseInt(subparts[1], 10) || 0;
  if (isNaN(h)) return null;
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

function isRecordStarted(r: EmployeeDayRecord, todayStr: string, currentMinutes: number): boolean {
  if (r.date < todayStr) {
    return true;
  }
  if (r.date > todayStr) {
    return false;
  }
  
  const shiftStr = r.inferredShift || r.scheduledShift;
  if (!shiftStr) return true;
  
  const upper = shiftStr.toUpperCase().trim();
  if (upper === "OFF" || upper === "PTO" || upper === "SL" || upper === "LOA" || upper === "SUSPP" || upper === "ATT") {
    return true;
  }
  
  const startMinutes = getShiftStartMinutes(shiftStr);
  if (startMinutes === null) return true;
  
  return currentMinutes >= startMinutes;
}

interface EmployeeListProps {
  summaries: EmployeeSummary[];
  allSummaries: EmployeeSummary[];
  periodSummaries?: EmployeeSummary[];
  staffInfoData?: any[];
  latestDate?: Date;
  initialFilter?: "all" | "month" | "week" | "day";
  availableFilters: string[];
  globalTypeFilter: "all" | "idle_overbreak_wc";
  globalIncludeWc: boolean;
  globalIncludeIdle: boolean;
  globalIncludeNonMod: boolean;
  globalIncludeRa?: boolean;
  globalIncludeAt?: boolean;
  globalIncludeTardiness: boolean;
  globalIncludeMinorTardiness?: boolean;
  globalIncludeEarlyLeave: boolean;
  globalIncludeShort30Min?: boolean;
  globalIncludeCheck?: boolean;
  globalIncludeAbsences?: boolean;
  globalIncludeATT?: boolean;
  globalIncludeLOA?: boolean;
  globalIncludePTO?: boolean;
  globalIncludeSL?: boolean;
  globalIncludeSUSPP?: boolean;
  globalIncludeOFF?: boolean;
  globalIncludeNextVacations?: boolean;
  globalIncludeRefresher?: boolean;
  globalShiftFilter?: string[];
  globalFilterMajorOverbreaks: boolean;
  globalFilterMinorOverbreaks?: boolean;
  showRealTime?: boolean;
  showBPO?: boolean;
  onStatsCalculate?: (stats: any) => void;
}

function getAbsenceStatusText(
  s: EmployeeSummary,
  allSummaries: EmployeeSummary[],
  filteredRecords: EmployeeDayRecord[],
  latestDate: Date,
) {
  if (s.isOffboarded) {
    return { text: "Offboarded", isActive: false, isOffboarded: true };
  }

  const fullEmp =
    allSummaries.find(
      (emp) =>
        (emp.email &&
          s.email &&
          emp.email.toLowerCase().trim() === s.email.toLowerCase().trim()) ||
        emp.employeeName === s.employeeName ||
        emp.employeeName.toLowerCase().trim() ===
          s.employeeName.toLowerCase().trim(),
    ) || s;

  const sortedRecords = [...fullEmp.dailyRecords].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const todayStr = format(latestDate, "yyyy-MM-dd");
  const todayRec = sortedRecords.find((r) => r.date === todayStr);

  let checkProp: "isSL" | "isLOA" | "isPTO" | null = null;
  let statusName = "";
  let targetDate = "";

  // 1. Try to find if there is an active absence TODAY on latestDate
  if (todayRec) {
    if (todayRec.isSL) {
      checkProp = "isSL";
      statusName = "Sick Leave";
      targetDate = todayStr;
    } else if (todayRec.isLOA) {
      checkProp = "isLOA";
      statusName = "LOA";
      targetDate = todayStr;
    } else if (todayRec.isPTO) {
      checkProp = "isPTO";
      statusName = "PTO (VAC)";
      if (
        String(todayRec.scheduledShift || todayRec.inferredShift || "")
          .toUpperCase()
          .includes("MAR")
      ) {
        statusName = "MAR";
      }
      targetDate = todayStr;
    }
  }

  // 2. If no active absence today, fall back to filteredRecords to see if there is any other absence
  if (!checkProp) {
    const hasSL = filteredRecords.some((r) => r.isSL);
    const hasLOA = filteredRecords.some((r) => r.isLOA);
    const hasPTO = filteredRecords.some((r) => r.isPTO);

    if (!hasSL && !hasLOA && !hasPTO) {
      return null;
    }

    if (hasSL) {
      statusName = "Sick Leave";
      checkProp = "isSL";
    } else if (hasLOA) {
      statusName = "LOA";
      checkProp = "isLOA";
    } else if (hasPTO) {
      statusName = "PTO (VAC)";
      if (
        filteredRecords.some(
          (r) =>
            r.isPTO &&
            String(r.scheduledShift || r.inferredShift || "")
              .toUpperCase()
              .includes("MAR"),
        )
      ) {
        statusName = "MAR";
      }
      checkProp = "isPTO";
    }

    const activeRecsInFilter = [...filteredRecords]
      .filter((r) => r[checkProp!])
      .sort((a, b) => a.date.localeCompare(b.date));

    if (activeRecsInFilter.length === 0) {
      return { text: statusName, isActive: false, isOffboarded: false };
    }

    targetDate = activeRecsInFilter[activeRecsInFilter.length - 1].date;
  }

  // 3. Now compute the contiguous range around targetDate in sortedRecords
  const targetIndex = sortedRecords.findIndex((r) => r.date === targetDate);

  if (targetIndex === -1) {
    return { text: statusName, isActive: false, isOffboarded: false };
  }

  let startIndex = targetIndex;
  while (startIndex > 0) {
    const prev = sortedRecords[startIndex - 1];
    if (prev[checkProp!] || prev.isOFF) {
      startIndex--;
    } else {
      break;
    }
  }

  let endIndex = targetIndex;
  let lastValidEnd = targetIndex;

  while (endIndex < sortedRecords.length - 1) {
    const next = sortedRecords[endIndex + 1];
    if (next[checkProp!]) {
      endIndex++;
      lastValidEnd = endIndex;
    } else if (next.isOFF) {
      let foundAhead = false;
      for (let offset = 2; offset <= 4; offset++) {
        if (endIndex + offset < sortedRecords.length) {
          const ahead = sortedRecords[endIndex + offset];
          if (ahead[checkProp!]) {
            foundAhead = true;
            break;
          }
          if (!ahead.isOFF) {
            break;
          }
        }
      }
      if (foundAhead) {
        endIndex++;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  endIndex = lastValidEnd;

  let actualStart = startIndex;
  while (actualStart <= endIndex && !sortedRecords[actualStart][checkProp!]) {
    actualStart++;
  }
  if (actualStart > endIndex) actualStart = startIndex;

  const startDateStr = sortedRecords[actualStart].date;
  const lastAbsenceDateStr = sortedRecords[endIndex].date;
  let returnDateStr = null;
  if (endIndex + 1 < sortedRecords.length) {
    returnDateStr = sortedRecords[endIndex + 1].date;
  }

  const formatDate = (dStr: string) => {
    const [y, m, d] = dStr.split("-");
    return `${d}/${m}`;
  };

  const isActive =
    todayStr >= startDateStr && (!returnDateStr || todayStr < returnDateStr);

  if (!isActive) {
    return null;
  }

  let text = statusName;
  if (lastAbsenceDateStr) {
    text = `${statusName} ${formatDate(startDateStr)} until ${formatDate(lastAbsenceDateStr)}`;
  } else {
    text = `${statusName} since ${formatDate(startDateStr)}`;
  }

  return { text, isActive, isOffboarded: false };
}

function isLeaveShift(sh: string) {
  if (!sh) return false;
  const upper = sh.toUpperCase();
  return (
    upper === "PTO" ||
    upper.includes("VAC") ||
    upper.includes("MAR") ||
    upper.includes("FÉRIAS") ||
    upper.includes("FERIAS") ||
    upper === "SL" ||
    upper.includes("SICK") ||
    upper.includes("MEDICO") ||
    upper.includes("MED") ||
    upper.includes("ATESTADO") ||
    upper === "LOA" ||
    upper.includes("LICENÇA") ||
    upper.includes("LICENCA") ||
    upper.includes("OFF") ||
    upper.includes("FOLGA") ||
    upper.includes("SAÚDE") ||
    upper.includes("SAUDE") ||
    upper.includes("SAÍDA") ||
    upper.includes("SAIDA")
  );
}

function getDayAfter(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return format(d, "yyyy-MM-dd");
}

function getDayBefore(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return format(d, "yyyy-MM-dd");
}

function isOffOrBHOrLeave(sh: string | undefined): boolean {
  if (!sh) return true;
  const upper = sh.trim().toUpperCase();
  if (
    upper === "OFF" ||
    upper === "BH" ||
    upper === "N/A" ||
    upper === "" ||
    upper === "OFF/BH" ||
    upper === "BH/OFF" ||
    upper === "BH/BH" ||
    upper === "OFF/OFF"
  ) {
    return true;
  }
  return isLeaveShift(sh);
}

function getActualReturnInfo(
  endDateStr: string,
  fullEmp: any,
): { date: string; shift: string } {
  if (!endDateStr) return { date: "N/A", shift: "N/A" };

  let currentDateStr = getDayAfter(endDateStr);
  const maxIterations = 90; // search up to 90 days in the future

  for (let i = 0; i < maxIterations; i++) {
    const rec = fullEmp?.dailyRecords?.find(
      (r: any) => r.date === currentDateStr,
    );
    const shift = rec
      ? rec.scheduledShift || rec.inferredShift || "OFF"
      : "OFF";
    const isLeave = rec ? rec.isPTO || rec.isLOA || rec.isSL : false;

    if (!isOffOrBHOrLeave(shift) && !isLeave) {
      return { date: currentDateStr, shift };
    }

    currentDateStr = getDayAfter(currentDateStr);
  }

  const dayAfter = getDayAfter(endDateStr);
  return { date: dayAfter, shift: "OFF" };
}

function getActualRefresherReturn(
  s: any,
  fullEmp: any,
): { date: string; shift: string } {
  if (!s.refresherDate) return { date: "N/A", shift: "N/A" };

  let lastLeaveDate = "";
  if (fullEmp?.dailyRecords) {
    const pastRecords = fullEmp.dailyRecords
      .filter((r: any) => r.date < s.refresherDate)
      .sort((a: any, b: any) => b.date.localeCompare(a.date));

    const found = pastRecords.find(
      (r: any) =>
        r.isPTO ||
        r.isLOA ||
        r.isSL ||
        isLeaveShift(r.scheduledShift || r.inferredShift),
    );
    if (found) {
      lastLeaveDate = found.date;
    }
  }

  if (!lastLeaveDate) {
    lastLeaveDate = getDayBefore(s.refresherDate);
  }

  return getActualReturnInfo(lastLeaveDate, fullEmp);
}

function getActualVacationReturn(
  s: any,
  fullEmp: any,
): { date: string; shift: string } {
  if (!s.vacationEndDate) return { date: "N/A", shift: "N/A" };
  return getActualReturnInfo(s.vacationEndDate, fullEmp);
}

export function EmployeeList({
  summaries,
  allSummaries,
  periodSummaries,
  staffInfoData,
  latestDate,
  initialFilter = "all",
  availableFilters,
  globalTypeFilter,
  globalIncludeWc,
  globalIncludeIdle,
  globalIncludeNonMod,
  globalIncludeRa,
  globalIncludeAt,
  globalIncludeTardiness,
  globalIncludeMinorTardiness,
  globalIncludeEarlyLeave,
  globalIncludeShort30Min,
  globalIncludeCheck,
  globalIncludeAbsences,
  globalIncludeATT,
  globalIncludeLOA,
  globalIncludePTO,
  globalIncludeSL,
  globalIncludeSUSPP,
  globalIncludeOFF,
  globalIncludeNextVacations,
  globalIncludeRefresher,
  globalShiftFilter,
  globalFilterMajorOverbreaks,
  globalFilterMinorOverbreaks,
  showRealTime,
  showBPO = false,
  onStatsCalculate,
}: EmployeeListProps) {
  const { t, lang } = useLanguage();

  const processedSummariesWithRecalculatedRefresher = useMemo(() => {
    const today = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Europe/Lisbon" }),
    );
    const todayStr = format(today, "yyyy-MM-dd");
    const currentMinutes = today.getHours() * 60 + today.getMinutes();

    return summaries
      .map((s) => {
        const startedRecords = s.dailyRecords.filter((r) =>
          isRecordStarted(r, todayStr, currentMinutes)
        );

        if (startedRecords.length === 0) return null;

        const updated = {
          ...s,
          dailyRecords: startedRecords,
        };

        if (!updated.isRefresher || !updated.refresherDate) return updated;
        const fullEmp =
          allSummaries.find(
            (emp) =>
              emp.employeeName === updated.employeeName ||
              emp.employeeName.toLowerCase().trim() ===
                updated.employeeName.toLowerCase().trim(),
          ) || updated;
        const calculated = getActualRefresherReturn(updated, fullEmp);
        if (calculated.date !== "N/A" && calculated.date !== updated.refresherDate) {
          return { ...updated, refresherDate: calculated.date };
        }
        return updated;
      })
      .filter(Boolean) as EmployeeSummary[];
  }, [summaries, allSummaries]);

  const isShiftFilterNotStarted = useMemo(() => {
    if (!globalShiftFilter || globalShiftFilter.length === 0) return false;

    const today = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Europe/Lisbon" }),
    );
    const todayStr = format(today, "yyyy-MM-dd");

    const hasTodayOrFutureRecord = summaries.some((s) =>
      s.dailyRecords.some((r) => r.date >= todayStr)
    );
    if (!hasTodayOrFutureRecord) return false;

    const currentMinutes = today.getHours() * 60 + today.getMinutes();

    return globalShiftFilter.every((shift) => {
      const startMinutes = getShiftStartMinutes(shift);
      if (startMinutes === null) return false;
      return currentMinutes < startMinutes;
    });
  }, [globalShiftFilter, summaries]);

  const isWcOnly =
    globalTypeFilter === "all" &&
    globalIncludeWc &&
    !globalIncludeShort30Min &&
    !globalIncludeNonMod &&
    !globalIncludeRa &&
    !globalIncludeAt &&
    !globalIncludeIdle &&
    !globalIncludeTardiness &&
    !globalIncludeEarlyLeave;
  const isIdleOnly =
    globalTypeFilter === "all" &&
    globalIncludeIdle &&
    !globalIncludeShort30Min &&
    !globalIncludeWc &&
    !globalIncludeNonMod &&
    !globalIncludeRa &&
    !globalIncludeAt &&
    !globalIncludeTardiness &&
    !globalIncludeEarlyLeave;
  const isNmRaAtOnly =
    globalTypeFilter === "all" &&
    (globalIncludeNonMod || globalIncludeRa || globalIncludeAt) &&
    !globalIncludeShort30Min &&
    !globalIncludeWc &&
    !globalIncludeIdle &&
    !globalIncludeTardiness &&
    !globalIncludeEarlyLeave &&
    !globalIncludeCheck;
  const isShort30MinOnly =
    globalTypeFilter === "all" &&
    globalIncludeShort30Min &&
    !globalIncludeWc &&
    !globalIncludeNonMod &&
    !globalIncludeRa &&
    !globalIncludeAt &&
    !globalIncludeIdle &&
    !globalIncludeTardiness &&
    !globalIncludeEarlyLeave;

  const getAgentNmRaAtTotal = (s: EmployeeSummary) => {
    let sum = 0;
    s.dailyRecords.forEach((r) => {
      if (globalIncludeNonMod) sum += r.nonModDuration || 0;
      if (globalIncludeRa) sum += r.reviewAndAppealDuration || 0;
      if (globalIncludeAt) sum += r.awaitingTasksDuration || 0;
    });
    return sum;
  };

  const getAgentBreaksQty = (s: EmployeeSummary) => {
    return s.dailyRecords.reduce((total, r) => {
      if (!r.breaks) return total;
      const filteredBreaks = r.breaks.filter((b) =>
        b.type === "meal" ||
        b.type === "short" ||
        b.type === "wellness" ||
        b.type === "praying"
      );
      return total + filteredBreaks.length;
    }, 0);
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [multiSelectText, setMultiSelectText] = useState("");
  const [multiSelectLines, setMultiSelectLines] = useState<string[]>([]);
  const [isMultiSelectOpen, setIsMultiSelectOpen] = useState(false);

  const handleApplyMultiSelect = () => {
    const lines = multiSelectText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    setMultiSelectLines(lines);
    setIsMultiSelectOpen(false);
    toast.success(
      lang === "pt"
        ? `Filtro múltiplo aplicado: ${lines.length} itens.`
        : `Multiple filter applied: ${lines.length} items.`,
    );
  };

  const handleClearMultiSelect = () => {
    setMultiSelectText("");
    setMultiSelectLines([]);
    setIsMultiSelectOpen(false);
    toast.info(
      lang === "pt" ? "Filtro múltiplo removido." : "Multiple filter cleared.",
    );
  };
  const [showSendToOpsConfirm, setShowSendToOpsConfirm] = useState(false);
  const [selectedLob, setSelectedLob] = useState<string>("ALL");
  const [selectedTL, setSelectedTL] = useState<string>("ALL");
  const [selectedLang, setSelectedLang] = useState<string>("ALL");
  const [selectedEmp, setSelectedEmp] = useState<EmployeeSummary | null>(null);
  const [sortBy, setSortBy] = useState<
    "maiores" | "menores" | "alfabetica" | string
  >("maiores");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const normalizeName = (name: string) =>
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[\.,\-]/g, " ");

  const isDisplayingSupport = useMemo(() => {
    if (summaries.length === 0) return false;
    return summaries.some((s) => isSupportRole(s));
  }, [summaries]);

  const baseline = useMemo(() => {
    const listToFilter = periodSummaries || allSummaries || [];
    return listToFilter.filter((s) => {
      const isSupport = isSupportRole(s);
      if (isDisplayingSupport && !isSupport) return false;
      if (!isDisplayingSupport && isSupport) return false;

      if (multiSelectLines.length > 0) {
        const matchesMulti = multiSelectLines.some((term) => {
          return (
            normalizeName(s.employeeName).includes(normalizeName(term)) ||
            (s.workdayId && s.workdayId.toLowerCase().includes(term.toLowerCase().trim()))
          );
        });
        if (!matchesMulti) return false;
      }

      if (searchTerm.trim().length > 0) {
        const matchesTerm =
          normalizeName(s.employeeName).includes(normalizeName(searchTerm)) ||
          (s.workdayId && s.workdayId.toLowerCase().includes(searchTerm.toLowerCase().trim()));
        if (!matchesTerm) return false;
      }

      const matchesLob =
        selectedLob === "ALL" ||
        s.lob?.toUpperCase().trim() === selectedLob.toUpperCase().trim();
      const matchesLang =
        selectedLang === "ALL" ||
        s.language?.toUpperCase().trim() === selectedLang.toUpperCase().trim();
      const matchesTL =
        selectedTL === "ALL" ||
        s.supervisor?.toUpperCase().trim() === selectedTL.toUpperCase().trim();
      return matchesLob && matchesLang && matchesTL;
    });
  }, [periodSummaries, allSummaries, multiSelectLines, searchTerm, selectedLob, selectedLang, selectedTL, isDisplayingSupport]);

  const baselineWithCalculations = useMemo(() => {
    return baseline.map((s) => {
      let overbreakMins = 0;
      let wcMins = 0;
      let idleMins = 0;

      const cookedRecords = (s.dailyRecords || []).map((r) => {
        let wcDur = 0;
        let mealDur = 0;
        let shortDur = 0;
        let wellnessDur = 0;
        let prayingDur = 0;
        let idleDur = 0;

        if (r.breaks && r.breaks.length > 0) {
          r.breaks.forEach((b) => {
            if (b.type === "wc") wcDur += b.durationMinutes;
            else if (b.type === "meal") mealDur += b.durationMinutes;
            else if (b.type === "short") shortDur += b.durationMinutes;
            else if (b.type === "wellness") wellnessDur += b.durationMinutes;
            else if (b.type === "praying") prayingDur += b.durationMinutes;
            else if (b.type === "idle" || b.type === "forgot_status") {
              idleDur += b.durationMinutes;
            }
          });
        } else {
          wcDur = typeof r.wcDuration === "number" ? r.wcDuration : 0;
          mealDur = typeof r.mealDuration === "number" ? r.mealDuration : 0;
          shortDur = typeof r.shortDuration === "number" ? r.shortDuration : 0;
          wellnessDur = typeof r.wellnessDuration === "number" ? r.wellnessDuration : 0;
          prayingDur = typeof r.prayingDuration === "number" ? r.prayingDuration : 0;
          const idleVal = typeof r.idleDuration === "number" ? r.idleDuration : 0;
          const forgotVal = typeof r.forgotStatusDuration === "number" ? r.forgotStatusDuration : 0;
          idleDur = idleVal + forgotVal;
        }

        const wcOverbreak = Math.max(0, wcDur - 10);
        const mealOverbreak = Math.max(0, mealDur - 60);
        let shortOverbreak = Math.max(0, shortDur - 30);
        if (r.hasSingleShort30m && shortOverbreak <= 2) {
          shortOverbreak = 0;
        }
        const wellnessOverbreak = Math.max(0, wellnessDur - 15);
        const prayingOverbreak = Math.max(0, prayingDur - 15);
        const idleOverbreak = idleDur;

        const dailyOverbreak =
          mealOverbreak +
          shortOverbreak +
          wellnessOverbreak +
          prayingOverbreak;

        overbreakMins += dailyOverbreak;
        wcMins += wcOverbreak;
        idleMins += idleOverbreak;

        return {
          ...r,
          wcDuration: wcDur,
          mealDuration: mealDur,
          shortDuration: shortDur,
          wellnessDuration: wellnessDur,
          prayingDuration: prayingDur,
          idleDuration: idleDur,
          totalOverbreak: dailyOverbreak,
          wcOverbreak,
          mealOverbreak,
          shortOverbreak,
          wellnessOverbreak,
          prayingOverbreak,
          idleOverbreak,
        };
      });

      return {
        ...s,
        dailyRecords: cookedRecords,
        calculatedOverbreakMinutes: overbreakMins,
        calculatedWcMinutes: wcMins,
        calculatedIdleMinutes: idleMins,
      };
    });
  }, [baseline]);

  const activeStats = useMemo(() => {
    // Filter agents to only those who are actually working in the specified period/day(s)
    const workingBaseline = baselineWithCalculations.filter((s) => {
      if (!s.dailyRecords || s.dailyRecords.length === 0) return false;
      return s.dailyRecords.some((r) => {
        const isScheduledWorking =
          !r.isOFF &&
          !r.isPTO &&
          !r.isLOA &&
          !r.isSL &&
          !r.isSUSPP &&
          !r.isATT &&
          !r.isAbsence;

        const hasActualActivity =
          (r.totalOverbreak || 0) > 0 ||
          (r.wcDuration || 0) > 0 ||
          (r.idleDuration || 0) > 0 ||
          (r.wcOverbreak || 0) > 0 ||
          (r.mealOverbreak || 0) > 0 ||
          (r.shortOverbreak || 0) > 0 ||
          (r.wellnessOverbreak || 0) > 0 ||
          (r.prayingOverbreak || 0) > 0 ||
          (r.idleOverbreak || 0) > 0 ||
          (r.breaks && r.breaks.length > 0);

        return isScheduledWorking || hasActualActivity;
      });
    });

    const totalCount = workingBaseline.length;
    if (totalCount === 0) return null;

    if (globalTypeFilter === "idle_overbreak_wc") {
      const overbreakAgents = workingBaseline.filter(s => s.calculatedOverbreakMinutes > 0);
      const upTo10Agents = overbreakAgents.filter(s => s.calculatedOverbreakMinutes <= 10);
      const upTo15Agents = overbreakAgents.filter(s => s.calculatedOverbreakMinutes <= 15);
      
      const pctOverbreak = (overbreakAgents.length / totalCount) * 100;
      const pctUpTo10OfOverbreaks = overbreakAgents.length > 0 ? (upTo10Agents.length / overbreakAgents.length) * 100 : 0;
      const pctUpTo15OfOverbreaks = overbreakAgents.length > 0 ? (upTo15Agents.length / overbreakAgents.length) * 100 : 0;

      return {
        type: "overbreaks",
        totalPct: pctOverbreak,
        upTo10PctOfMatched: pctUpTo10OfOverbreaks,
        upTo15PctOfMatched: pctUpTo15OfOverbreaks,
        totalCount,
        matchedCount: overbreakAgents.length,
        countUpTo10: upTo10Agents.length,
        countUpTo15: upTo15Agents.length
      };
    }

    if (globalIncludeWc) {
      const organicAgents = workingBaseline.filter(s => s.calculatedWcMinutes > 0);
      const upTo10Agents = organicAgents.filter(s => s.calculatedWcMinutes <= 10);
      const upTo15Agents = organicAgents.filter(s => s.calculatedWcMinutes <= 15);

      const pctOrganic = (organicAgents.length / totalCount) * 100;
      const pctUpTo10OfOrganic = organicAgents.length > 0 ? (upTo10Agents.length / organicAgents.length) * 100 : 0;
      const pctUpTo15OfOrganic = organicAgents.length > 0 ? (upTo15Agents.length / organicAgents.length) * 100 : 0;

      return {
        type: "organic",
        totalPct: pctOrganic,
        upTo10PctOfMatched: pctUpTo10OfOrganic,
        upTo15PctOfMatched: pctUpTo15OfOrganic,
        totalCount,
        matchedCount: organicAgents.length,
        countUpTo10: upTo10Agents.length,
        countUpTo15: upTo15Agents.length
      };
    }

    if (globalIncludeIdle) {
      const idleAgents = workingBaseline.filter(s => s.calculatedIdleMinutes > 0);
      const pctIdle = (idleAgents.length / totalCount) * 100;

      return {
        type: "idle",
        totalPct: pctIdle,
        totalCount,
        matchedCount: idleAgents.length
      };
    }

    if (globalFilterMinorOverbreaks) {
      const overbreakAgents = workingBaseline.filter(s => s.calculatedOverbreakMinutes > 0);
      const minorAgents = overbreakAgents.filter(s => s.calculatedOverbreakMinutes > 0 && s.calculatedOverbreakMinutes <= 2);

      const pctMinor = (minorAgents.length / totalCount) * 100;
      const pctMinorOfOverbreaks = overbreakAgents.length > 0 ? (minorAgents.length / overbreakAgents.length) * 100 : 0;

      return {
        type: "minorOverbreaks",
        totalPct: pctMinor,
        totalCount,
        matchedCount: overbreakAgents.length,
        minorCount: minorAgents.length,
        pctMinorOfOverbreaks
      };
    }

    return null;
  }, [baselineWithCalculations, globalTypeFilter, globalIncludeWc, globalIncludeIdle, globalFilterMinorOverbreaks]);

  React.useEffect(() => {
    if (onStatsCalculate) {
      onStatsCalculate(activeStats);
    }
  }, [activeStats, onStatsCalculate]);

  React.useEffect(() => {
    if (globalIncludeRefresher) {
      if (
        sortBy !== "mais_recente" &&
        sortBy !== "mais_distante" &&
        sortBy !== "alfabetica"
      ) {
        setSortBy("mais_recente");
      }
    } else if (globalIncludeNextVacations) {
      if (
        sortBy !== "closest_vacation" &&
        sortBy !== "na_vacation" &&
        sortBy !== "alfabetica"
      ) {
        setSortBy("closest_vacation");
      }
    } else {
      if (
        sortBy === "mais_recente" ||
        sortBy === "mais_distante" ||
        sortBy === "closest_vacation" ||
        sortBy === "na_vacation"
      ) {
        setSortBy("maiores");
      }
    }
  }, [globalIncludeRefresher, globalIncludeNextVacations]);

  // Reset dropdown filters to "ALL" if a filter combination yields 0 results for the current active status summaries
  React.useEffect(() => {
    if (processedSummariesWithRecalculatedRefresher.length === 0) return;

    const anyMatchesSearch = processedSummariesWithRecalculatedRefresher.some((s) => {
      if (multiSelectLines.length === 0 && !searchTerm.trim()) return true;

      if (multiSelectLines.length > 0) {
        const matchesMulti = multiSelectLines.some((term) => {
          return (
            normalizeName(s.employeeName).includes(normalizeName(term)) ||
            (s.workdayId && s.workdayId.toLowerCase().includes(term.toLowerCase().trim()))
          );
        });
        if (!matchesMulti) return false;
      }

      if (searchTerm.trim().length > 0) {
        const matchesTerm =
          normalizeName(s.employeeName).includes(normalizeName(searchTerm)) ||
          (s.workdayId && s.workdayId.toLowerCase().includes(searchTerm.toLowerCase().trim()));
        if (!matchesTerm) return false;
      }

      return true;
    });

    if (anyMatchesSearch || (!searchTerm.trim() && multiSelectLines.length === 0)) {
      const matchesWithFilters =
        processedSummariesWithRecalculatedRefresher.some((s) => {
          if (multiSelectLines.length > 0) {
            const matchesMulti = multiSelectLines.some((term) => {
              return (
                normalizeName(s.employeeName).includes(normalizeName(term)) ||
                (s.workdayId && s.workdayId.toLowerCase().includes(term.toLowerCase().trim()))
              );
            });
            if (!matchesMulti) return false;
          }

          if (searchTerm.trim().length > 0) {
            const matchesTerm =
              normalizeName(s.employeeName).includes(normalizeName(searchTerm)) ||
              (s.workdayId && s.workdayId.toLowerCase().includes(searchTerm.toLowerCase().trim()));
            if (!matchesTerm) return false;
          }

          const matchesLob =
            selectedLob === "ALL" ||
            s.lob?.toUpperCase().trim() === selectedLob.toUpperCase().trim();
          const matchesLang =
            selectedLang === "ALL" ||
            s.language?.toUpperCase().trim() === selectedLang.toUpperCase().trim();
          const matchesTL =
            selectedTL === "ALL" ||
            s.supervisor?.toUpperCase().trim() === selectedTL.toUpperCase().trim();
          return matchesLob && matchesLang && matchesTL;
        });

      if (!matchesWithFilters) {
        setSelectedLob("ALL");
        setSelectedTL("ALL");
        setSelectedLang("ALL");
      }
    }
  }, [
    processedSummariesWithRecalculatedRefresher,
    searchTerm,
    multiSelectLines,
    selectedLob,
    selectedTL,
    selectedLang,
  ]);

  const lobs = useMemo(() => {
    let list = processedSummariesWithRecalculatedRefresher;
    if (selectedTL !== "ALL") {
      list = list.filter(
        (s) =>
          s.supervisor?.toUpperCase().trim() ===
          selectedTL.toUpperCase().trim(),
      );
    }
    if (selectedLang !== "ALL") {
      list = list.filter(
        (s) =>
          s.language?.toUpperCase().trim() ===
          selectedLang.toUpperCase().trim(),
      );
    }
    return Array.from(
      new Set(
        list
          .map((s) => s.lob?.trim())
          .filter(Boolean),
      ),
    )
      .filter((l: any) => {
        if (!l) return false;
        const upper = l.toUpperCase();
        return ![
          "CSR",
          "BA",
          "TL",
          "RTA",
          "QA",
          "TRAINER",
          "MANAGER",
          "OS",
          "LMG",
          "LMG BADNESS",
          "LMG ES",
          "LMG LATAM",
        ].includes(upper);
      })
      .sort() as string[];
  }, [processedSummariesWithRecalculatedRefresher, selectedTL, selectedLang]);

  const tls = useMemo(() => {
    let list = processedSummariesWithRecalculatedRefresher;
    if (selectedLob !== "ALL") {
      list = list.filter(
        (s) =>
          s.lob?.toUpperCase().trim() === selectedLob.toUpperCase().trim(),
      );
    }
    if (selectedLang !== "ALL") {
      list = list.filter(
        (s) =>
          s.language?.toUpperCase().trim() ===
          selectedLang.toUpperCase().trim(),
      );
    }
    return Array.from(
      new Set(list.map((s) => s.supervisor?.trim()).filter(Boolean)),
    ).sort() as string[];
  }, [processedSummariesWithRecalculatedRefresher, selectedLob, selectedLang]);

  React.useEffect(() => {
    if (selectedLob !== "ALL") {
      const exists = lobs.some(
        (l) => l.toUpperCase().trim() === selectedLob.toUpperCase().trim()
      );
      if (!exists) {
        setSelectedLob("ALL");
      }
    }
  }, [lobs, selectedLob]);

  React.useEffect(() => {
    if (selectedTL !== "ALL") {
      const exists = tls.some(
        (t) => t.toUpperCase().trim() === selectedTL.toUpperCase().trim()
      );
      if (!exists) {
        setSelectedTL("ALL");
      }
    }
  }, [tls, selectedTL]);

  const languages =
    selectedLob === "ALL"
      ? []
      : (Array.from(
          new Set(
            processedSummariesWithRecalculatedRefresher
              .filter((s) => s.lob === selectedLob)
              .map((s) => s.language?.toUpperCase().trim())
              .filter(Boolean),
          ),
        ).sort() as string[]);

  const filtered = useMemo(() => {
    return processedSummariesWithRecalculatedRefresher
      .filter((s) => {
        if (globalIncludeAbsences && isSupportRole(s)) {
          return false;
        }

        if (multiSelectLines.length > 0) {
          const matchesMulti = multiSelectLines.some((term) => {
            return (
              normalizeName(s.employeeName).includes(normalizeName(term)) ||
              (s.workdayId && s.workdayId.toLowerCase().includes(term.toLowerCase().trim()))
            );
          });
          if (!matchesMulti) return false;
        }

        if (searchTerm.trim().length > 0) {
          const matchesTerm =
            normalizeName(s.employeeName).includes(normalizeName(searchTerm)) ||
            (s.workdayId && s.workdayId.toLowerCase().includes(searchTerm.toLowerCase().trim()));
          if (!matchesTerm) return false;
        }

        const matchesLob =
          selectedLob === "ALL" ||
          s.lob?.toUpperCase().trim() === selectedLob.toUpperCase().trim();
        const matchesLang =
          selectedLang === "ALL" ||
          s.language?.toUpperCase().trim() === selectedLang.toUpperCase().trim();
        const matchesTL =
          selectedTL === "ALL" ||
          s.supervisor?.toUpperCase().trim() === selectedTL.toUpperCase().trim();
        return matchesLob && matchesLang && matchesTL;
      })
      .sort((a, b) => {
        // If using predefined sorts
        if (sortBy === "maiores" || sortBy === "menores") {
          let aVal = a.totalOverbreakMinutes;
          let bVal = b.totalOverbreakMinutes;

          if (globalIncludeWc) {
            aVal = a.dailyRecords.reduce((acc, r) => acc + r.wcOverbreak, 0);
            bVal = b.dailyRecords.reduce((acc, r) => acc + r.wcOverbreak, 0);
          } else if (globalIncludeIdle) {
            aVal = a.dailyRecords.reduce((acc, r) => acc + r.idleOverbreak, 0);
            bVal = b.dailyRecords.reduce((acc, r) => acc + r.idleOverbreak, 0);
          } else if (globalIncludeNonMod) {
            aVal = a.dailyRecords.reduce(
              (acc, r) => acc + (r.nonModDuration || 0),
              0,
            );
            bVal = b.dailyRecords.reduce(
              (acc, r) => acc + (r.nonModDuration || 0),
              0,
            );
          } else if (globalIncludeRa) {
            aVal = a.totalReviewAndAppealMinutes;
            bVal = b.totalReviewAndAppealMinutes;
          } else if (globalIncludeAt) {
            aVal = a.totalAwaitingTasksMinutes;
            bVal = b.totalAwaitingTasksMinutes;
          } else if (globalIncludeTardiness) {
            aVal = a.totalTardinessMinutes;
            bVal = b.totalTardinessMinutes;
          } else if (globalIncludeEarlyLeave) {
            aVal = a.totalEarlyLeaveMinutes;
            bVal = b.totalEarlyLeaveMinutes;
          } else if (globalIncludeShort30Min) {
            aVal = a.totalShort30MinRecords || 0;
            bVal = b.totalShort30MinRecords || 0;
          } else if (globalIncludeAbsences) {
            aVal = a.totalAbsences || 0;
            bVal = b.totalAbsences || 0;
          } else if (globalIncludeCheck) {
            aVal = a.dailyRecords.filter((r) =>
              isShiftMismatch(r.scheduledShift, r.inferredShift),
            ).length;
            bVal = b.dailyRecords.filter((r) =>
              isShiftMismatch(r.scheduledShift, r.inferredShift),
            ).length;
          }

          if (aVal === bVal)
            return a.employeeName.localeCompare(b.employeeName);
          return sortBy === "maiores" ? bVal - aVal : aVal - bVal;
        }
        if (sortBy === "mais_recente" || sortBy === "mais_distante") {
          const aDate = a.isRefresher
            ? a.refresherDate || "9999-99-99"
            : "9999-99-99";
          const bDate = b.isRefresher
            ? b.refresherDate || "9999-99-99"
            : "9999-99-99";
          if (aDate === bDate)
            return a.employeeName.localeCompare(b.employeeName);
          return sortBy === "mais_recente"
            ? aDate.localeCompare(bDate)
            : bDate.localeCompare(aDate);
        }
        if (sortBy === "closest_vacation") {
          const getDistanceToToday = (dateStr: string | undefined): number => {
            if (!dateStr || dateStr.toUpperCase() === "N/A" || !dateStr.trim()) return Infinity;
            try {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const targetDate = parseISO(dateStr);
              targetDate.setHours(0, 0, 0, 0);
              return Math.abs(targetDate.getTime() - today.getTime());
            } catch (e) {
              return Infinity;
            }
          };
          const distA = getDistanceToToday(a.vacationStartDate);
          const distB = getDistanceToToday(b.vacationStartDate);
          if (distA === distB)
            return a.employeeName.localeCompare(b.employeeName);
          return distA - distB;
        }
        if (sortBy === "na_vacation") {
          const hasA_NA = !a.vacationStartDate || a.vacationStartDate.toUpperCase() === "N/A" || !a.vacationStartDate.trim();
          const hasB_NA = !b.vacationStartDate || b.vacationStartDate.toUpperCase() === "N/A" || !b.vacationStartDate.trim();
          if (hasA_NA && !hasB_NA) return -1;
          if (!hasA_NA && hasB_NA) return 1;
          return a.employeeName.localeCompare(b.employeeName);
        }
        if (sortBy === "alfabetica")
          return a.employeeName.localeCompare(b.employeeName);

        // Custom column sort
        let aVal = 0,
          bVal = 0;
        if (sortBy === "meal") {
          aVal = a.dailyRecords.reduce((acc, r) => acc + r.mealOverbreak, 0);
          bVal = b.dailyRecords.reduce((acc, r) => acc + r.mealOverbreak, 0);
        }
        if (sortBy === "short") {
          aVal = a.dailyRecords.reduce((acc, r) => acc + r.shortOverbreak, 0);
          bVal = b.dailyRecords.reduce((acc, r) => acc + r.shortOverbreak, 0);
        }
        if (sortBy === "wellness") {
          aVal = a.dailyRecords.reduce(
            (acc, r) => acc + r.wellnessOverbreak,
            0,
          );
          bVal = b.dailyRecords.reduce(
            (acc, r) => acc + r.wellnessOverbreak,
            0,
          );
        }
        if (sortBy === "praying") {
          aVal = a.dailyRecords.reduce((acc, r) => acc + r.prayingOverbreak, 0);
          bVal = b.dailyRecords.reduce((acc, r) => acc + r.prayingOverbreak, 0);
        }
        if (sortBy === "wc") {
          aVal = a.dailyRecords.reduce((acc, r) => acc + r.wcOverbreak, 0);
          bVal = b.dailyRecords.reduce((acc, r) => acc + r.wcOverbreak, 0);
        }
        if (sortBy === "idle") {
          aVal = a.dailyRecords.reduce((acc, r) => acc + r.idleOverbreak, 0);
          bVal = b.dailyRecords.reduce((acc, r) => acc + r.idleOverbreak, 0);
        }
        if (sortBy === "tardiness") {
          aVal = a.totalTardinessMinutes;
          bVal = b.totalTardinessMinutes;
        }
        if (sortBy === "earlyLeave") {
          aVal = a.totalEarlyLeaveMinutes;
          bVal = b.totalEarlyLeaveMinutes;
        }
        if (sortBy === "absences") {
          aVal = a.totalAbsences || 0;
          bVal = b.totalAbsences || 0;
        }
        if (sortBy === "short30Min") {
          aVal = a.totalShort30MinRecords || 0;
          bVal = b.totalShort30MinRecords || 0;
        }
        if (sortBy === "nonMod") {
          aVal = a.dailyRecords.reduce(
            (acc, r) =>
              acc +
              r.breaks
                .filter((b) => b.type === "non_moderating")
                .reduce((s, b) => s + b.durationMinutes, 0),
            0,
          );
          bVal = b.dailyRecords.reduce(
            (acc, r) =>
              acc +
              r.breaks
                .filter((b) => b.type === "non_moderating")
                .reduce((s, b) => s + b.durationMinutes, 0),
            0,
          );
        }
        if (sortBy === "reviewAndAppeal") {
          aVal = a.totalReviewAndAppealMinutes;
          bVal = b.totalReviewAndAppealMinutes;
        }
        if (sortBy === "awaitingTasks") {
          aVal = a.totalAwaitingTasksMinutes;
          bVal = b.totalAwaitingTasksMinutes;
        }
        if (sortBy === "total") {
          if (isNmRaAtOnly) {
            aVal = getAgentNmRaAtTotal(a);
            bVal = getAgentNmRaAtTotal(b);
          } else {
            aVal = a.totalOverbreakMinutes;
            bVal = b.totalOverbreakMinutes;
          }
        }
        if (sortBy === "breaksQty") {
          aVal = getAgentBreaksQty(a);
          bVal = getAgentBreaksQty(b);
        }

        if (aVal === bVal) return 0;
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      });
  }, [
    summaries,
    searchTerm,
    multiSelectLines,
    selectedLob,
    selectedLang,
    selectedTL,
    sortBy,
    sortDirection,
    isNmRaAtOnly,
  ]);

  const { exportedTeamProductiveMinutes, exportedTeamNonModMinutes } =
    useMemo(() => {
      let prod: number | undefined = undefined;
      let nom: number | undefined = undefined;
      if (globalIncludeNonMod || globalIncludeRa || globalIncludeAt) {
        prod = Math.round(
          filtered.reduce(
            (acc, sum) =>
              acc +
              sum.dailyRecords.reduce(
                (acc2, r) =>
                  acc2 +
                  r.breaks
                    .filter((b) => b.type === "moderating")
                    .reduce((acc3, b) => acc3 + b.durationMinutes, 0),
                0,
              ),
            0,
          ),
        );
        nom = Math.round(
          filtered.reduce(
            (acc, sum) =>
              acc +
              sum.dailyRecords.reduce(
                (acc2, r) =>
                  acc2 +
                  r.breaks
                    .filter((b) => b.type === "non_moderating")
                    .reduce((acc3, b) => acc3 + b.durationMinutes, 0),
                0,
              ),
            0,
          ),
        );
      }
      return {
        exportedTeamProductiveMinutes: prod,
        exportedTeamNonModMinutes: nom,
      };
    }, [filtered, globalIncludeNonMod, globalIncludeRa, globalIncludeAt]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDirection("desc"); // Default to descending when clicking a new column
    }
  };

  return (
    <>
      <div className="flex-1 min-h-0 bg-white rounded-[2rem] shadow-2xl shadow-slate-200/40 border border-slate-200 flex flex-col overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between shrink-0 p-3 border-b border-slate-100 bg-slate-50/80 z-20">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-2xl">
            <div className="flex items-center gap-2 w-full max-w-xs">
              <div className="relative flex-1">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <Input
                  type="text"
                  placeholder={t("searchAgent")}
                  className="pl-11 h-11 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-sm font-medium shadow-sm w-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            {multiSelectLines.length > 0 && (
              <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 text-blue-700 px-3 h-11 rounded-xl text-xs font-bold shadow-sm whitespace-nowrap shrink-0">
                <span>
                  {lang === "pt"
                    ? `Múltiplos: ${multiSelectLines.length}`
                    : `Multiple: ${multiSelectLines.length}`}
                </span>
                <button
                  onClick={handleClearMultiSelect}
                  className="hover:bg-blue-100 p-1 rounded-md transition-colors"
                  title={lang === "pt" ? "Limpar seleção múltipla" : "Clear multiple select"}
                >
                  <X size={14} className="text-blue-600" />
                </button>
              </div>
            )}
            {lobs.length > 0 && (
              <select
                className="h-11 bg-white border border-slate-200 text-slate-700 rounded-xl px-3 text-xs font-bold w-full sm:w-auto shadow-sm outline-none cursor-pointer"
                value={selectedLob}
                onChange={(e) => {
                  setSelectedLob(e.target.value);
                  setSelectedLang("ALL");
                  setSelectedTL("ALL");
                }}
              >
                <option value="ALL">
                  {lang === "pt" ? "Todos os LOB's" : "All LOBs"}
                </option>
                {lobs.map((l) => (
                  <option key={l} value={l}>
                    {formatLOB(l)}
                  </option>
                ))}
              </select>
            )}
            {tls.length > 1 && (
              <select
                className="h-11 bg-white border border-slate-200 text-slate-700 rounded-xl px-3 text-xs font-bold w-full sm:w-auto shadow-sm outline-none cursor-pointer"
                value={selectedTL}
                onChange={(e) => setSelectedTL(e.target.value)}
              >
                <option value="ALL">
                  {lang === "pt" ? "Todos os TL's" : "All TLs"}
                </option>
                {tls.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
            {selectedLob !== "ALL" && languages.length > 0 && (
              <select
                className="h-11 bg-white border border-slate-200 text-slate-700 rounded-xl px-3 text-xs font-bold w-full sm:w-auto shadow-sm outline-none cursor-pointer"
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
              >
                <option value="ALL">All Languages</option>
                {languages.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2">
            {(() => {
              const isAnyStatusFilterActive =
                globalTypeFilter === "idle_overbreak_wc" ||
                globalIncludeWc ||
                globalIncludeIdle ||
                globalIncludeNonMod ||
                globalIncludeRa ||
                globalIncludeAt ||
                globalIncludeTardiness ||
                globalIncludeMinorTardiness ||
                globalIncludeEarlyLeave ||
                globalIncludeShort30Min ||
                globalIncludeCheck ||
                globalIncludeAbsences;
              if (!isAnyStatusFilterActive) return null;

              const triggerEmail = (sendToOps: boolean) => {
                if (selectedTL === "ALL" && selectedLob === "ALL") {
                  toast.error(
                    lang === "pt"
                      ? "Por favor, selecione um Team Leader (TL) ou um LOB específico no filtro para enviar."
                      : "Please select a specific Team Leader (TL) or LOB in the filter before sending.",
                  );
                  return;
                }

                const activeTL =
                  selectedTL !== "ALL"
                    ? selectedTL
                    : filtered.find((s) => s.supervisor)?.supervisor?.trim() ||
                      "";

                let tlEmail = "";
                if (activeTL) {
                  const supMatch = staffInfoData?.find(
                    (sup) =>
                      sup.fullName &&
                      sup.fullName
                        .trim()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .toLowerCase() ===
                        activeTL
                          .trim()
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .toLowerCase(),
                  );
                  if (supMatch && supMatch.email) {
                    tlEmail = supMatch.email;
                  } else {
                    tlEmail = `${activeTL
                      .trim()
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .toLowerCase()
                      .replace(/\s+/g, ".")}@concentrix.com`;
                  }
                }

                const hour = new Date().getHours();
                const greeting =
                  hour < 12
                    ? "Good morning"
                    : hour < 18
                      ? "Good afternoon"
                      : "Good evening";

                let greetingPhrase = "";
                if (activeTL) {
                  const tlFirstName = activeTL.trim().split(/\s+/)[0];
                  greetingPhrase = `${greeting}, ${tlFirstName}!`;
                } else {
                  greetingPhrase = `${greeting}, Team!`;
                }

                let activeFiltersEN = "performance indicators";
                let typePartsForMsg = [];
                if (globalTypeFilter === "idle_overbreak_wc")
                  typePartsForMsg.push("overbreaks");
                if (globalIncludeShort30Min)
                  typePartsForMsg.push("30min disconnections");
                if (globalIncludeWc) typePartsForMsg.push("organic breaks");
                if (globalIncludeIdle)
                  typePartsForMsg.push("idle time (unproductivity)");
                if (globalIncludeNonMod) typePartsForMsg.push("non-mod");
                if (globalIncludeRa) typePartsForMsg.push("R&A");
                if (globalIncludeAt) typePartsForMsg.push("A.T");
                if (globalIncludeTardiness) typePartsForMsg.push("tardiness");
                if (globalIncludeMinorTardiness)
                  typePartsForMsg.push("minor tardiness");
                if (globalIncludeEarlyLeave)
                  typePartsForMsg.push("early leave");
                if (globalIncludeCheck)
                  typePartsForMsg.push("shift adjustments (check)");

                if (typePartsForMsg.length > 0) {
                  activeFiltersEN = typePartsForMsg.join(", ");
                }

                let modName = "";
                if (selectedTL !== "ALL") {
                  const agentNames = filtered
                    .map((s) => s.employeeName)
                    .filter(Boolean);
                  modName =
                    agentNames.length > 0 ? agentNames.join(", ") : "AGENTS";
                } else if (selectedLob !== "ALL") {
                  modName = formatLOB(selectedLob);
                } else {
                  modName = "AGENTS";
                }

                const dateStr = format(new Date(), "dd/MM/yyyy");
                const emailSubject = `CNX OPO LMM | LIVE | ${modName} | ${dateStr}`;

                let agentsPhrase = "of the agents";
                if (selectedTL !== "ALL") {
                  const agentNames = filtered
                    .map((s) => s.employeeName)
                    .filter(Boolean);
                  if (agentNames.length === 1) {
                    agentsPhrase = `of the agent ${agentNames[0]}`;
                  } else if (agentNames.length > 1) {
                    agentsPhrase = `of the agents ${agentNames.join(", ")}`;
                  }
                } else if (selectedLob !== "ALL") {
                  agentsPhrase = `of the LOB ${formatLOB(selectedLob)}`;
                }

                const emailBody = `${greetingPhrase}\r\n\r\nPlease find attached the PDF file with the ${activeFiltersEN} data ${agentsPhrase}. If you have any questions, feel free to ask.`;

                // 1. Download the PDF file using exact same filtering as the extract button
                let periodLabelStr = "";
                if (initialFilter === "day")
                  periodLabelStr = `(${latestDate ? format(latestDate, "dd/MM/yyyy") : t("filtered")})`;
                if (initialFilter === "week") periodLabelStr = `(${t("week")})`;
                if (initialFilter === "month")
                  periodLabelStr = `(${t("month")})`;
                if (initialFilter === "all") periodLabelStr = `(${t("all")})`;

                let mainFilterLabel = "";
                let filenameFilter = "";
                if (selectedTL !== "ALL") {
                  mainFilterLabel = ` - ${selectedTL}`;
                  filenameFilter = `_${selectedTL.replace(/[^a-zA-Z0-9]/g, "_")}`;
                } else if (selectedLob !== "ALL") {
                  mainFilterLabel = ` - ${formatLOB(selectedLob)}`;
                  filenameFilter = `_${formatLOB(selectedLob).replace(/[^a-zA-Z0-9]/g, "_")}`;
                  if (selectedLang !== "ALL") {
                    mainFilterLabel += ` (${selectedLang})`;
                    filenameFilter += `_${selectedLang.replace(/[^a-zA-Z0-9]/g, "_")}`;
                  }
                } else {
                  mainFilterLabel = ` - (${t("all")})`;
                }

                let typeParts = [];
                if (globalTypeFilter === "idle_overbreak_wc")
                  typeParts.push("Overbreaks");
                if (globalIncludeShort30Min) typeParts.push("30min");
                if (globalIncludeWc) typeParts.push("Organic");
                if (globalIncludeIdle) typeParts.push("Idle");
                if (globalIncludeNonMod) typeParts.push("Non-Mod");
                if (globalIncludeRa) typeParts.push("R&A");
                if (globalIncludeAt) typeParts.push("A.T");
                if (globalIncludeTardiness) typeParts.push("Tardiness");
                if (globalIncludeMinorTardiness)
                  typeParts.push("Minor Tardiness");
                if (globalIncludeEarlyLeave) typeParts.push("Early Leave");
                if (globalIncludeCheck) typeParts.push("Check");
                if (globalIncludeATT) typeParts.push("ATT");
                if (globalIncludeLOA) typeParts.push("LOA");
                if (globalIncludePTO || globalIncludeNextVacations)
                  typeParts.push("PTO");
                if (globalIncludeRefresher) typeParts.push("REFRESHER");
                if (globalIncludeSL) typeParts.push("SL");
                if (globalIncludeSUSPP) typeParts.push("SUSPP");
                if (globalIncludeOFF) typeParts.push("OFF");

                let statusFiltersText =
                  typeParts.length > 0
                    ? `Status info: ${typeParts.join(", ")}`
                    : undefined;

                const activeExtraStatuses: string[] = [];
                const attrKeys: string[] = [];
                if (globalIncludeATT) {
                  activeExtraStatuses.push("ATT");
                  attrKeys.push("isATT");
                }
                if (globalIncludeLOA) {
                  activeExtraStatuses.push("LOA");
                  attrKeys.push("isLOA");
                }
                if (globalIncludePTO || globalIncludeNextVacations) {
                  activeExtraStatuses.push("PTO/VAC");
                  attrKeys.push("isPTO");
                }
                if (globalIncludeRefresher) {
                  activeExtraStatuses.push("REFRESHER");
                  attrKeys.push("isRefresher");
                }
                if (globalIncludeSL) {
                  activeExtraStatuses.push("SL");
                  attrKeys.push("isSL");
                }
                if (globalIncludeSUSPP) {
                  activeExtraStatuses.push("SUSPP");
                  attrKeys.push("isSUSPP");
                }
                if (globalIncludeOFF) {
                  activeExtraStatuses.push("OFF");
                  attrKeys.push("isOFF");
                }

                const activeExtraStatus =
                  activeExtraStatuses.length > 0
                    ? activeExtraStatuses.join("/")
                    : null;
                const attrKey = attrKeys.length === 1 ? attrKeys[0] : null;

                let customTitle = `${t("agents")}${mainFilterLabel}`;
                let customFilename = `Extract${filenameFilter}_${format(new Date(), "yyyy-MM-dd")}`;

                if (filtered.length === 1) {
                  const singleAgentName = filtered[0].employeeName;
                  const activeFiltersList: string[] = [];
                  if (typeParts.length > 0) {
                    activeFiltersList.push(...typeParts);
                  } else {
                    if (initialFilter === "day") {
                      activeFiltersList.push(lang === "pt" ? "Hoje" : "Today");
                    } else if (initialFilter === "week") {
                      activeFiltersList.push(lang === "pt" ? "Semana" : "Week");
                    } else if (initialFilter === "month") {
                      activeFiltersList.push(lang === "pt" ? "Mês Atual" : "Current Month");
                    } else {
                      activeFiltersList.push(lang === "pt" ? "Todos" : "All");
                    }
                  }
                  const activeFilterStr = activeFiltersList.join(", ");
                  customTitle = `${singleAgentName} - ${activeFilterStr}`;
                  
                  const sanitizedAgentName = singleAgentName.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
                  const sanitizedFilters = activeFiltersList.join("_").replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
                  customFilename = `Report_${sanitizedAgentName}_${sanitizedFilters}`;
                }

                exportToPDF(
                  filtered,
                  customTitle,
                  customFilename,
                  {
                    showRealTime: showRealTime,
                    isTardiness: globalIncludeTardiness,
                    isMinorTardiness: globalIncludeMinorTardiness,
                    isEarlyLeave: globalIncludeEarlyLeave,
                    showCheck: globalIncludeCheck,
                    isShort30Min: globalIncludeShort30Min,
                    isWc: globalIncludeWc,
                    isIdle: globalIncludeIdle,
                    isNonMod: globalIncludeNonMod,
                    isRa: globalIncludeRa,
                    isAt: globalIncludeAt,
                    isOverbreaks: globalTypeFilter === "idle_overbreak_wc",
                    isNextVacations: globalIncludeNextVacations,
                    isRefresher: globalIncludeRefresher,
                    isAgentDetail:
                      !activeExtraStatus &&
                      !(
                        globalIncludeIdle ||
                        globalIncludeWc ||
                        globalTypeFilter === "idle_overbreak_wc"
                      ) &&
                      (globalIncludeShort30Min ||
                        globalIncludeNonMod ||
                        globalIncludeRa ||
                        globalIncludeAt ||
                        !(
                          globalIncludeTardiness ||
                          globalIncludeMinorTardiness ||
                          globalIncludeEarlyLeave ||
                          globalIncludeCheck ||
                          globalIncludeAbsences
                        )),
                    activeExtraStatus,
                    activeExtraStatuses:
                      activeExtraStatuses.length > 0
                        ? activeExtraStatuses
                        : null,
                    attrKey,
                    attrKeys: attrKeys.length > 0 ? attrKeys : null,
                    showAllTimeline: typeParts.length === 0,
                    statusFiltersText,
                    periodFilter: initialFilter,
                    lang: t("pdfAgentCount") === "Agents" ? "en" : "pt",
                    teamProductiveMinutes: exportedTeamProductiveMinutes,
                    teamNonModMinutes: exportedTeamNonModMinutes,
                    isGroupedByTL: true,
                    showBPO,
                    allSummaries,
                    periodSummaries,
                    latestDate,
                  },
                );

                toast.info(
                  lang === "pt"
                    ? "Iniciando download do relatório PDF..."
                    : "Starting PDF report download...",
                );

                // 2. Open email client after 1.5 seconds, giving time for download save dialog to show up
                setTimeout(() => {
                  let mailto = "";
                  if (sendToOps) {
                    const ccEmails = [
                      "CNXPorto_ByteDance_Reporting@concentrix.com",
                      "Porto_ByteDance_OPS@concentrix.com",
                      "luis.samara@concentrix.com",
                      "sofia.fernandes@concentrix.com",
                      "guillermo.riveron@concentrix.com",
                      "paulo.ferreira2@concentrix.com",
                    ].join(",");
                    mailto = `mailto:${encodeURIComponent(tlEmail)}?cc=${encodeURIComponent(ccEmails)}&subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
                  } else {
                    mailto = `mailto:${encodeURIComponent(tlEmail)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
                  }
                  window.location.href = mailto;
                }, 1500);

                toast.success(
                  lang === "pt"
                    ? "Redirecionando para o cliente de e-mail..."
                    : "Redirecting to your email client...",
                );
              };

              return (
                <>
                  {showSendToOpsConfirm ? (
                    <div className="h-11 bg-emerald-50 border border-emerald-200 rounded-xl px-3 inline-flex items-center gap-2 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                      <span className="text-xs font-semibold text-emerald-800">
                        Send to ops?
                      </span>
                      <button
                        onClick={() => {
                          setShowSendToOpsConfirm(false);
                          triggerEmail(true);
                        }}
                        className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => {
                          setShowSendToOpsConfirm(false);
                          triggerEmail(false);
                        }}
                        className="h-7 px-3 bg-white/80 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        if (selectedTL === "ALL" && selectedLob === "ALL") {
                          toast.error(
                            lang === "pt"
                              ? "Por favor, selecione um Team Leader (TL) ou um LOB específico no filtro para enviar."
                              : "Please select a specific Team Leader (TL) or LOB in the filter before sending.",
                          );
                          return;
                        }
                        setShowSendToOpsConfirm(true);
                      }}
                      title="By email"
                      className="h-11 bg-white hover:bg-slate-50 text-emerald-600 border border-slate-200 rounded-xl px-4 text-xs font-black inline-flex items-center gap-2 transition-colors whitespace-nowrap shadow-sm"
                    >
                      <Mail size={15} className="text-emerald-600" />
                      <span>By email</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (selectedTL === "ALL" && selectedLob === "ALL") {
                        toast.error(
                          lang === "pt"
                            ? "Por favor, selecione um Team Leader (TL) ou um LOB específico no filtro para enviar."
                            : "Please select a specific Team Leader (TL) or LOB in the filter before sending.",
                        );
                        return;
                      }

                      const activeTL =
                        selectedTL !== "ALL"
                          ? selectedTL
                          : filtered
                              .find((s) => s.supervisor)
                              ?.supervisor?.trim() || "";

                      let tlEmail = "";
                      if (activeTL) {
                        const supMatch = staffInfoData?.find(
                          (sup) =>
                            sup.fullName &&
                            sup.fullName
                              .trim()
                              .normalize("NFD")
                              .replace(/[\u0300-\u036f]/g, "")
                              .toLowerCase() ===
                              activeTL
                                .trim()
                                .normalize("NFD")
                                .replace(/[\u0300-\u036f]/g, "")
                                .toLowerCase(),
                        );
                        if (supMatch && supMatch.email) {
                          tlEmail = supMatch.email;
                        } else {
                          tlEmail = `${activeTL
                            .trim()
                            .normalize("NFD")
                            .replace(/[\u0300-\u036f]/g, "")
                            .toLowerCase()
                            .replace(/\s+/g, ".")}@concentrix.com`;
                        }
                      }

                      const hour = new Date().getHours();
                      const greeting =
                        hour < 12
                          ? "Good morning"
                          : hour < 18
                            ? "Good afternoon"
                            : "Good evening";

                      let greetingPhrase = "";
                      if (activeTL) {
                        const tlFirstName = activeTL.trim().split(/\s+/)[0];
                        greetingPhrase = `${greeting}, ${tlFirstName}!`;
                      } else {
                        greetingPhrase = `${greeting}, Team!`;
                      }

                      let activeFiltersEN = "performance indicators";
                      let typePartsForMsg = [];
                      if (globalTypeFilter === "idle_overbreak_wc")
                        typePartsForMsg.push("overbreaks");
                      if (globalIncludeShort30Min)
                        typePartsForMsg.push("30min disconnections");
                      if (globalIncludeWc)
                        typePartsForMsg.push("organic breaks");
                      if (globalIncludeIdle)
                        typePartsForMsg.push("idle time (unproductivity)");
                      if (globalIncludeNonMod) typePartsForMsg.push("non-mod");
                      if (globalIncludeRa) typePartsForMsg.push("R&A");
                      if (globalIncludeAt) typePartsForMsg.push("A.T");
                      if (globalIncludeTardiness)
                        typePartsForMsg.push("tardiness");
                      if (globalIncludeEarlyLeave)
                        typePartsForMsg.push("early leave");
                      if (globalIncludeCheck)
                        typePartsForMsg.push("shift adjustments (check)");

                      if (typePartsForMsg.length > 0) {
                        activeFiltersEN = typePartsForMsg.join(", ");
                      }

                      let agentsPhrase = "of the agents";
                      if (selectedTL !== "ALL") {
                        const agentNames = filtered
                          .map((s) => s.employeeName)
                          .filter(Boolean);
                        if (agentNames.length === 1) {
                          agentsPhrase = `of the agent ${agentNames[0]}`;
                        } else if (agentNames.length > 1) {
                          agentsPhrase = `of the agents ${agentNames.join(", ")}`;
                        }
                      } else {
                        agentsPhrase = `of the LOB ${formatLOB(selectedLob)}`;
                      }

                      const message = `${greetingPhrase}\n\nPlease find attached the PDF file with the ${activeFiltersEN} data ${agentsPhrase}. If you have any questions, feel free to ask.`;

                      const teamsUrl = tlEmail
                        ? `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(tlEmail)}&message=${encodeURIComponent(message)}`
                        : `https://teams.microsoft.com/l/chat/0/0?message=${encodeURIComponent(message)}`;
                      // 1. Download the PDF file using exact same filtering as the extract button
                      let periodLabelStr = "";
                      if (initialFilter === "day")
                        periodLabelStr = `(${latestDate ? format(latestDate, "dd/MM/yyyy") : t("filtered")})`;
                      if (initialFilter === "week")
                        periodLabelStr = `(${t("week")})`;
                      if (initialFilter === "month")
                        periodLabelStr = `(${t("month")})`;
                      if (initialFilter === "all")
                        periodLabelStr = `(${t("all")})`;

                      let mainFilterLabel = "";
                      let filenameFilter = "";
                      if (selectedTL !== "ALL") {
                        mainFilterLabel = ` - ${selectedTL}`;
                        filenameFilter = `_${selectedTL.replace(/[^a-zA-Z0-9]/g, "_")}`;
                      } else if (selectedLob !== "ALL") {
                        mainFilterLabel = ` - ${formatLOB(selectedLob)}`;
                        filenameFilter = `_${formatLOB(selectedLob).replace(/[^a-zA-Z0-9]/g, "_")}`;
                        if (selectedLang !== "ALL") {
                          mainFilterLabel += ` (${selectedLang})`;
                          filenameFilter += `_${selectedLang.replace(/[^a-zA-Z0-9]/g, "_")}`;
                        }
                      } else {
                        mainFilterLabel = ` - (${t("all")})`;
                      }

                      let typeParts = [];
                      if (globalTypeFilter === "idle_overbreak_wc")
                        typeParts.push("Overbreaks");
                      if (globalIncludeShort30Min) typeParts.push("30min");
                      if (globalIncludeWc) typeParts.push("Organic");
                      if (globalIncludeIdle) typeParts.push("Idle");
                      if (globalIncludeNonMod) typeParts.push("Non-Mod");
                      if (globalIncludeRa) typeParts.push("R&A");
                      if (globalIncludeAt) typeParts.push("A.T");
                      if (globalIncludeTardiness) typeParts.push("Tardiness");
                      if (globalIncludeMinorTardiness)
                        typeParts.push("Minor Tardiness");
                      if (globalIncludeEarlyLeave)
                        typeParts.push("Early Leave");
                      if (globalIncludeCheck) typeParts.push("Check");
                      if (globalIncludeATT) typeParts.push("ATT");
                      if (globalIncludeLOA) typeParts.push("LOA");
                      if (globalIncludePTO || globalIncludeNextVacations)
                        typeParts.push("PTO");
                      if (globalIncludeRefresher) typeParts.push("REFRESHER");
                      if (globalIncludeSL) typeParts.push("SL");
                      if (globalIncludeSUSPP) typeParts.push("SUSPP");
                      if (globalIncludeOFF) typeParts.push("OFF");

                      let statusFiltersText =
                        typeParts.length > 0
                          ? `Status info: ${typeParts.join(", ")}`
                          : undefined;

                      const activeExtraStatuses: string[] = [];
                      const attrKeys: string[] = [];
                      if (globalIncludeATT) {
                        activeExtraStatuses.push("ATT");
                        attrKeys.push("isATT");
                      }
                      if (globalIncludeLOA) {
                        activeExtraStatuses.push("LOA");
                        attrKeys.push("isLOA");
                      }
                      if (globalIncludePTO || globalIncludeNextVacations) {
                        activeExtraStatuses.push("PTO/VAC");
                        attrKeys.push("isPTO");
                      }
                      if (globalIncludeRefresher) {
                        activeExtraStatuses.push("REFRESHER");
                        attrKeys.push("isRefresher");
                      }
                      if (globalIncludeSL) {
                        activeExtraStatuses.push("SL");
                        attrKeys.push("isSL");
                      }
                      if (globalIncludeSUSPP) {
                        activeExtraStatuses.push("SUSPP");
                        attrKeys.push("isSUSPP");
                      }
                      if (globalIncludeOFF) {
                        activeExtraStatuses.push("OFF");
                        attrKeys.push("isOFF");
                      }

                      const activeExtraStatus =
                        activeExtraStatuses.length > 0
                          ? activeExtraStatuses.join("/")
                          : null;
                      const attrKey =
                        attrKeys.length === 1 ? attrKeys[0] : null;

                      let customTitle = `${t("agents")}${mainFilterLabel}`;
                      let customFilename = `Extract${filenameFilter}_${format(new Date(), "yyyy-MM-dd")}`;

                      if (filtered.length === 1) {
                        const singleAgentName = filtered[0].employeeName;
                        const activeFiltersList: string[] = [];
                        if (typeParts.length > 0) {
                          activeFiltersList.push(...typeParts);
                        } else {
                          if (initialFilter === "day") {
                            activeFiltersList.push(lang === "pt" ? "Hoje" : "Today");
                          } else if (initialFilter === "week") {
                            activeFiltersList.push(lang === "pt" ? "Semana" : "Week");
                          } else if (initialFilter === "month") {
                            activeFiltersList.push(lang === "pt" ? "Mês Atual" : "Current Month");
                          } else {
                            activeFiltersList.push(lang === "pt" ? "Todos" : "All");
                          }
                        }
                        const activeFilterStr = activeFiltersList.join(", ");
                        customTitle = `${singleAgentName} - ${activeFilterStr}`;
                        
                        const sanitizedAgentName = singleAgentName.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
                        const sanitizedFilters = activeFiltersList.join("_").replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
                        customFilename = `Report_${sanitizedAgentName}_${sanitizedFilters}`;
                      }

                      exportToPDF(
                        filtered,
                        customTitle,
                        customFilename,
                        {
                          showRealTime: showRealTime,
                          isTardiness: globalIncludeTardiness,
                          isMinorTardiness: globalIncludeMinorTardiness,
                          isEarlyLeave: globalIncludeEarlyLeave,
                          showCheck: globalIncludeCheck,
                          isCheck: globalIncludeCheck,
                          isShort30Min: globalIncludeShort30Min,
                          isWc: globalIncludeWc,
                          isIdle: globalIncludeIdle,
                          isNonMod: globalIncludeNonMod,
                          isRa: globalIncludeRa,
                          isAt: globalIncludeAt,
                          isOverbreaks:
                            globalTypeFilter === "idle_overbreak_wc",
                          isNextVacations: globalIncludeNextVacations,
                          isRefresher: globalIncludeRefresher,
                          isAgentDetail:
                            !activeExtraStatus &&
                            !(
                              globalIncludeIdle ||
                              globalIncludeWc ||
                              globalTypeFilter === "idle_overbreak_wc"
                            ) &&
                            (globalIncludeShort30Min ||
                              globalIncludeNonMod ||
                              globalIncludeRa ||
                              globalIncludeAt ||
                              !(
                                globalIncludeTardiness ||
                                globalIncludeMinorTardiness ||
                                globalIncludeEarlyLeave ||
                                globalIncludeCheck ||
                                globalIncludeAbsences
                              )),
                          activeExtraStatus,
                          activeExtraStatuses:
                            activeExtraStatuses.length > 0
                              ? activeExtraStatuses
                              : null,
                          attrKey,
                          attrKeys: attrKeys.length > 0 ? attrKeys : null,
                          showAllTimeline: typeParts.length === 0,
                          statusFiltersText,
                          periodFilter: initialFilter,
                          lang: t("pdfAgentCount") === "Agents" ? "en" : "pt",
                          teamProductiveMinutes: exportedTeamProductiveMinutes,
                          teamNonModMinutes: exportedTeamNonModMinutes,
                          isGroupedByTL: true,
                          showBPO,
                          allSummaries,
                          periodSummaries,
                          latestDate,
                        },
                      );

                      toast.info(
                        lang === "pt"
                          ? "Iniciando download do relatório PDF..."
                          : "Starting PDF report download...",
                      );

                      // 2. Open Teams in a new window/tab after 1.5 seconds, giving time for download save dialog to show up
                      setTimeout(() => {
                        window.open(teamsUrl, "_blank");
                      }, 1500);
                      toast.success(
                        lang === "pt"
                          ? "Redirecionando para o Microsoft Teams..."
                          : "Redirecting to Microsoft Teams...",
                      );
                    }}
                    title="By teams"
                    className="h-11 bg-white hover:bg-slate-50 text-[#464eb8] border border-slate-200 rounded-xl px-4 text-xs font-black inline-flex items-center gap-2 transition-colors whitespace-nowrap shadow-sm"
                  >
                    <Send size={15} className="text-[#464eb8]" />
                    <span>By teams</span>
                  </button>
                </>
              );
            })()}

            <button
              onClick={() => {
                let periodLabelStr = "";
                if (initialFilter === "day")
                  periodLabelStr = `(${latestDate ? format(latestDate, "dd/MM/yyyy") : t("filtered")})`;
                if (initialFilter === "week") periodLabelStr = `(${t("week")})`;
                if (initialFilter === "month")
                  periodLabelStr = `(${t("month")})`;
                if (initialFilter === "all") periodLabelStr = `(${t("all")})`;

                let mainFilterLabel = "";
                let filenameFilter = "";
                if (selectedTL !== "ALL") {
                  mainFilterLabel = ` - ${selectedTL}`;
                  filenameFilter = `_${selectedTL.replace(/[^a-zA-Z0-9]/g, "_")}`;
                } else if (selectedLob !== "ALL") {
                  mainFilterLabel = ` - ${formatLOB(selectedLob)}`;
                  filenameFilter = `_${formatLOB(selectedLob).replace(/[^a-zA-Z0-9]/g, "_")}`;
                  if (selectedLang !== "ALL") {
                    mainFilterLabel += ` (${selectedLang})`;
                    filenameFilter += `_${selectedLang.replace(/[^a-zA-Z0-9]/g, "_")}`;
                  }
                } else {
                  mainFilterLabel = ` - (${t("all")})`;
                }

                let typeParts = [];
                if (globalTypeFilter === "idle_overbreak_wc")
                  typeParts.push("Overbreaks");
                if (globalIncludeShort30Min) typeParts.push("30min");
                if (globalIncludeWc) typeParts.push("Organic");
                if (globalIncludeIdle) typeParts.push("Idle");
                if (globalIncludeNonMod) typeParts.push("Non-Mod");
                if (globalIncludeRa) typeParts.push("R&A");
                if (globalIncludeAt) typeParts.push("A.T");
                if (globalIncludeTardiness) typeParts.push("Tardiness");
                if (globalIncludeMinorTardiness)
                  typeParts.push("Minor Tardiness");
                if (globalIncludeEarlyLeave) typeParts.push("Early Leave");
                if (globalIncludeCheck) typeParts.push("Check");
                if (globalIncludeATT) typeParts.push("ATT");
                if (globalIncludeLOA) typeParts.push("LOA");
                if (globalIncludePTO || globalIncludeNextVacations)
                  typeParts.push("PTO");
                if (globalIncludeRefresher) typeParts.push("REFRESHER");
                if (globalIncludeSL) typeParts.push("SL");
                if (globalIncludeSUSPP) typeParts.push("SUSPP");
                if (globalIncludeOFF) typeParts.push("OFF");

                let statusFiltersText =
                  typeParts.length > 0
                    ? `Status info: ${typeParts.join(", ")}`
                    : undefined;

                const activeExtraStatuses: string[] = [];
                const attrKeys: string[] = [];
                if (globalIncludeATT) {
                  activeExtraStatuses.push("ATT");
                  attrKeys.push("isATT");
                }
                if (globalIncludeLOA) {
                  activeExtraStatuses.push("LOA");
                  attrKeys.push("isLOA");
                }
                if (globalIncludePTO || globalIncludeNextVacations) {
                  activeExtraStatuses.push("PTO/VAC");
                  attrKeys.push("isPTO");
                }
                if (globalIncludeRefresher) {
                  activeExtraStatuses.push("REFRESHER");
                  attrKeys.push("isRefresher");
                }
                if (globalIncludeSL) {
                  activeExtraStatuses.push("SL");
                  attrKeys.push("isSL");
                }
                if (globalIncludeSUSPP) {
                  activeExtraStatuses.push("SUSPP");
                  attrKeys.push("isSUSPP");
                }
                if (globalIncludeOFF) {
                  activeExtraStatuses.push("OFF");
                  attrKeys.push("isOFF");
                }

                const activeExtraStatus =
                  activeExtraStatuses.length > 0
                    ? activeExtraStatuses.join("/")
                    : null;
                const attrKey = attrKeys.length === 1 ? attrKeys[0] : null;

                let customTitle = `${t("agents")}${mainFilterLabel}`;
                let customFilename = `Extract${filenameFilter}_${format(new Date(), "yyyy-MM-dd")}`;

                if (filtered.length === 1) {
                  const singleAgentName = filtered[0].employeeName;
                  const activeFiltersList: string[] = [];
                  if (typeParts.length > 0) {
                    activeFiltersList.push(...typeParts);
                  } else {
                    if (initialFilter === "day") {
                      activeFiltersList.push(lang === "pt" ? "Hoje" : "Today");
                    } else if (initialFilter === "week") {
                      activeFiltersList.push(lang === "pt" ? "Semana" : "Week");
                    } else if (initialFilter === "month") {
                      activeFiltersList.push(lang === "pt" ? "Mês Atual" : "Current Month");
                    } else {
                      activeFiltersList.push(lang === "pt" ? "Todos" : "All");
                    }
                  }
                  const activeFilterStr = activeFiltersList.join(", ");
                  customTitle = `${singleAgentName} - ${activeFilterStr}`;
                  
                  const sanitizedAgentName = singleAgentName.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
                  const sanitizedFilters = activeFiltersList.join("_").replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
                  customFilename = `Report_${sanitizedAgentName}_${sanitizedFilters}`;
                }

                exportToPDF(
                  filtered,
                  customTitle,
                  customFilename,
                  {
                    showRealTime: showRealTime,
                    isTardiness: globalIncludeTardiness,
                    isMinorTardiness: globalIncludeMinorTardiness,
                    isEarlyLeave: globalIncludeEarlyLeave,
                    showCheck: globalIncludeCheck,
                    isShort30Min: globalIncludeShort30Min,
                    isWc: globalIncludeWc,
                    isIdle: globalIncludeIdle,
                    isNonMod: globalIncludeNonMod,
                    isRa: globalIncludeRa,
                    isAt: globalIncludeAt,
                    isOverbreaks: globalTypeFilter === "idle_overbreak_wc",
                    isNextVacations: globalIncludeNextVacations,
                    isRefresher: globalIncludeRefresher,
                    isAgentDetail:
                      !activeExtraStatus &&
                      !(
                        globalIncludeIdle ||
                        globalIncludeWc ||
                        globalTypeFilter === "idle_overbreak_wc"
                      ) &&
                      (globalIncludeShort30Min ||
                        globalIncludeNonMod ||
                        globalIncludeRa ||
                        globalIncludeAt ||
                        !(
                          globalIncludeTardiness ||
                          globalIncludeMinorTardiness ||
                          globalIncludeEarlyLeave ||
                          globalIncludeCheck ||
                          globalIncludeAbsences
                        )),
                    activeExtraStatus,
                    activeExtraStatuses:
                      activeExtraStatuses.length > 0
                        ? activeExtraStatuses
                        : null,
                    attrKey,
                    attrKeys: attrKeys.length > 0 ? attrKeys : null,
                    showAllTimeline: typeParts.length === 0,
                    statusFiltersText,
                    periodFilter: initialFilter,
                    lang: t("pdfAgentCount") === "Agents" ? "en" : "pt",
                    teamProductiveMinutes: exportedTeamProductiveMinutes,
                    teamNonModMinutes: exportedTeamNonModMinutes,
                    isGroupedByTL: true,
                    showBPO,
                    allSummaries,
                    periodSummaries,
                    latestDate,
                  },
                );
              }}
              title={t("updateExtract")}
              className="h-11 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl px-4 text-xs font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap shadow-sm"
            >
              <FileDown size={16} className="text-emerald-600" />
              <span className="hidden sm:inline">Extract</span>
            </button>

            <button
              onClick={() => setIsMultiSelectOpen(true)}
              title={lang === "pt" ? "Seleção de Múltiplos Agentes" : "Multiple Agent Selection"}
              className={`h-11 border rounded-xl px-4 text-xs font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap shadow-sm ${
                multiSelectLines.length > 0
                  ? "bg-blue-50 hover:bg-blue-100/80 text-blue-700 border-blue-200"
                  : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
              }`}
            >
              <Users size={16} className={multiSelectLines.length > 0 ? "text-blue-600" : "text-slate-500"} />
              <span>Multiple select</span>
              {multiSelectLines.length > 0 && (
                <span className="bg-blue-600 text-white rounded-full text-[10px] w-5 h-5 flex items-center justify-center font-black">
                  {multiSelectLines.length}
                </span>
              )}
            </button>
            {globalIncludeRefresher ? (
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-white border text-sm font-bold border-slate-200 text-slate-700 rounded-[2rem] px-4 h-11 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer whitespace-nowrap overflow-ellipsis appearance-none pr-10 relative"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='3' stroke='%23475569'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19.5 8.25-7.5 7.5-7.5-7.5' /%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                  backgroundSize: "12px",
                }}
              >
                <option value="mais_recente">
                  {lang === "pt" ? "Mais recente" : "More recent"}
                </option>
                <option value="mais_distante">
                  {lang === "pt" ? "Mais distante" : "More distant"}
                </option>
                <option value="alfabetica">{t("alphabeticalMatch")}</option>
              </select>
            ) : globalIncludeNextVacations ? (
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-white border text-sm font-bold border-slate-200 text-slate-700 rounded-xl px-4 h-11 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer"
              >
                <option value="closest_vacation">
                  {lang === "pt" ? "Mais próximo" : "Closest"}
                </option>
                <option value="alfabetica">{t("alphabeticalMatch")}</option>
              </select>
            ) : (
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-white border text-sm font-bold border-slate-200 text-slate-700 rounded-xl px-4 h-11 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer"
              >
                <option value="maiores">{t("biggestViolators")}</option>
                <option value="menores">{t("smallestViolators")}</option>
                <option value="alfabetica">{t("alphabeticalMatch")}</option>
              </select>
            )}
          </div>
        </div>

        {globalIncludeAbsences ? (
          <div className="p-6 flex-1 overflow-auto custom-scrollbar">
            {isShiftFilterNotStarted ? (
              <div className="flex flex-col items-center justify-center gap-3 py-32 bg-slate-50/20">
                <Clock size={40} className="text-amber-500 animate-pulse" />
                <p className="text-slate-700 font-black uppercase tracking-wider text-sm">
                  {lang === "pt" ? "Shift não iniciado" : "Shift not started"}
                </p>
                <p className="text-xs text-slate-400 font-semibold max-w-sm mx-auto">
                  {lang === "pt"
                    ? "O turno selecionado ainda não começou para o dia de hoje."
                    : "The selected shift has not started yet for today."}
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32">
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs italic">
                  {t("noMatchAgent")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((s, idx) => {
                  const fullEmp =
                    allSummaries.find(
                      (emp) =>
                        emp.employeeName === s.employeeName ||
                        emp.employeeName.toLowerCase().trim() ===
                          s.employeeName.toLowerCase().trim(),
                    ) || s;

                  return (
                    <div
                      key={`${s.employeeName}-${idx}`}
                      className="group bg-white rounded-xl border border-slate-200 hover:border-red-400 hover:shadow-md transition-all p-4 flex flex-col justify-between gap-3 relative cursor-pointer"
                      onClick={() => {
                        setSelectedEmp({
                          ...fullEmp,
                          lob: s.lob || fullEmp.lob,
                          language: s.language || fullEmp.language,
                          role: s.role || fullEmp.role,
                          supervisor: s.supervisor || fullEmp.supervisor,
                          email: s.email || fullEmp.email,
                          shift: s.shift || fullEmp.shift,
                        });
                      }}
                    >
                      <div>
                        {/* Agent Name (Clickable) */}
                        <div
                          className="text-left font-black text-slate-800 group-hover:text-red-600 text-sm hover:underline transition-colors block mb-1 truncate w-full"
                          title={lang === "pt" ? "Clique para ver detalhes" : "Click to view details"}
                        >
                          {s.employeeName}
                        </div>

                        {/* Team Leader */}
                        <p className="text-xs text-slate-500 font-bold flex items-center gap-1">
                          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                            TL:
                          </span>{" "}
                          {s.supervisor || "—"}
                        </p>

                        {/* Workday ID */}
                        <p className="text-xs text-slate-500 font-bold mt-1 flex items-center gap-1">
                          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                            WDID:
                          </span>{" "}
                          <code className="text-[11px] font-mono text-slate-600">
                            {s.workdayId || "—"}
                          </code>
                        </p>

                        {/* LOB & Language Badges */}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {s.lob && (
                            <span className="bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md">
                              {s.lob}
                            </span>
                          )}
                          {s.language && (
                            <span className="bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md">
                              {s.language}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Footer Email and Copy */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 overflow-hidden w-2/3">
                          <Mail size={12} className="text-slate-400 shrink-0" />
                          <span className="text-[11px] font-semibold text-slate-500 truncate" title={s.email}>
                            {s.email || "—"}
                          </span>
                        </div>
                        {s.email && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(s.email || "");
                              toast.success(lang === "pt" ? "Email copiado!" : "Email copied!");
                            }}
                            className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-50 shrink-0 transition-colors"
                            title={lang === "pt" ? "Copiar email" : "Copy email"}
                          >
                            <Copy size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar relative">
            <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-slate-50/95 backdrop-blur border-b border-slate-200 text-[10px] uppercase font-black text-slate-500 tracking-widest sticky top-0 z-30 outline outline-1 outline-slate-200 shadow-sm">
              <tr>
                <th className="py-2.5 pl-8 pr-4 font-black whitespace-nowrap">
                  {String(t("agents") || "").toUpperCase()} ({filtered.length})
                </th>
                {(globalIncludeRefresher || globalIncludeNextVacations) && (
                  <th className="py-2.5 px-1 text-center font-black whitespace-nowrap text-slate-500">
                    {lang === "pt" ? "HORÁRIO" : "SCHEDULE"}
                  </th>
                )}
                {globalIncludeRefresher ? (
                  <>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("refresherStartDate")}
                    >
                      Inicio{" "}
                      {sortBy === "refresherStartDate" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("refresherDate")}
                    >
                      Refresher{" "}
                      {sortBy === "refresherDate" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                  </>
                ) : globalIncludeNextVacations ? (
                  <>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("vacationStartDate")}
                    >
                      Vacation Start{" "}
                      {sortBy === "vacationStartDate" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("vacationEndDate")}
                    >
                      Vacations End{" "}
                      {sortBy === "vacationEndDate" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                  </>
                ) : (
                  <>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("meal")}
                    >
                      Meal{" "}
                      {sortBy === "meal" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("short")}
                    >
                      Short{" "}
                      {sortBy === "short" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("wellness")}
                    >
                      Well.{" "}
                      {sortBy === "wellness" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("praying")}
                    >
                      Pray.{" "}
                      {sortBy === "praying" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("reviewAndAppeal")}
                    >
                      R&A{" "}
                      {sortBy === "reviewAndAppeal" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("awaitingTasks")}
                    >
                      A.T{" "}
                      {sortBy === "awaitingTasks" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("wc")}
                    >
                      Organic{" "}
                      {sortBy === "wc" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("idle")}
                    >
                      IDLE{" "}
                      {sortBy === "idle" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("tardiness")}
                    >
                      TARDINESS{" "}
                      {sortBy === "tardiness" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("earlyLeave")}
                    >
                      EARLY LEAVE{" "}
                      {sortBy === "earlyLeave" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("short30Min")}
                    >
                      {t("shortBreaks30Title")} (Dias){" "}
                      {sortBy === "short30Min" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("total")}
                    >
                      {t("total")}{" "}
                      {sortBy === "total" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                    <th
                      className="py-2.5 px-1 text-center font-black whitespace-nowrap cursor-pointer hover:text-blue-600 select-none group"
                      onClick={() => handleSort("breaksQty")}
                    >
                      {lang === "pt" ? "Qtd Pausas" : "Breaks Qty"}{" "}
                      {sortBy === "breaksQty" && (
                        <span className="text-[10px] ml-1">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                  </>
                )}
                <th className="py-2.5 pl-4 pr-8 text-right font-black whitespace-nowrap">
                  {t("status")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isShiftFilterNotStarted ? (
                <tr>
                  <td colSpan={15} className="text-center py-32 bg-slate-50/20">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Clock size={40} className="text-amber-500 animate-pulse" />
                      <p className="text-slate-700 font-black uppercase tracking-wider text-sm">
                        {lang === "pt" ? "Shift não iniciado" : "Shift not started"}
                      </p>
                      <p className="text-xs text-slate-400 font-semibold max-w-sm mx-auto">
                        {lang === "pt"
                          ? "O turno selecionado ainda não começou para o dia de hoje."
                          : "The selected shift has not started yet for today."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={15} className="text-center py-32">
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs italic">
                      {t("noMatchAgent")}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((s, idx) => {
                  if (String(s.employeeName).toLowerCase().includes("elsa")) {
                  console.log(
                    "ELSA DEBUG:",
                    JSON.parse(
                      JSON.stringify({
                        dailyRecords: s.dailyRecords.map((r) => ({
                          date: r.date,
                          shortOverbreak: r.shortOverbreak,
                        })),
                      }),
                    ),
                  );
                }
                const hasMealOver = s.dailyRecords.some(
                  (r) => r.mealOverbreak > 0,
                );
                const hasShortOver = s.dailyRecords.some(
                  (r) => r.shortOverbreak > 0,
                );
                const hasWellnessOver = s.dailyRecords.some(
                  (r) => r.wellnessOverbreak > 0,
                );
                const hasPrayingOver = s.dailyRecords.some(
                  (r) => r.prayingOverbreak > 0,
                );
                const hasWcExc = s.wcAlerts > 0;
                const hasIdleExc = s.idleAlerts > 0;
                const hasTardiness = globalIncludeMinorTardiness
                  ? s.dailyRecords.some(
                      (r) =>
                        (r.tardinessMinutes || 0) > 0 &&
                        (r.tardinessMinutes || 0) < 15,
                    )
                  : s.dailyRecords.some((r) => (r.tardinessMinutes || 0) >= 15);
                const hasEarlyLeave = s.dailyRecords.some(
                  (r) => (r.earlyLeaveMinutes || 0) > 0,
                );
                const isAlertRow =
                  hasMealOver ||
                  hasShortOver ||
                  hasWellnessOver ||
                  hasPrayingOver ||
                  hasWcExc ||
                  hasIdleExc ||
                  hasTardiness ||
                  hasEarlyLeave;

                const mealTotal = s.dailyRecords.reduce(
                  (acc, r) => acc + r.mealOverbreak,
                  0,
                );
                const shortTotal = s.dailyRecords.reduce(
                  (acc, r) => acc + r.shortOverbreak,
                  0,
                );
                const wellnessTotal = s.dailyRecords.reduce(
                  (acc, r) => acc + r.wellnessOverbreak,
                  0,
                );
                const prayingTotal = s.dailyRecords.reduce(
                  (acc, r) => acc + r.prayingOverbreak,
                  0,
                );
                const nonModTotal = s.dailyRecords.reduce(
                  (acc, r) =>
                    acc +
                    r.breaks
                      .filter((b) => b.type === "non_moderating")
                      .reduce((sum, b) => sum + b.durationMinutes, 0),
                  0,
                );
                const wcTotal = s.dailyRecords.reduce(
                  (acc, r) => acc + r.wcOverbreak,
                  0,
                );
                const idleTotal = s.dailyRecords.reduce(
                  (acc, r) => acc + r.idleOverbreak,
                  0,
                );
                const tardinessTotal = s.dailyRecords.reduce(
                  (acc, r) => acc + (r.tardinessMinutes || 0),
                  0,
                );
                const earlyLeaveTotal = s.dailyRecords.reduce(
                  (acc, r) => acc + (r.earlyLeaveMinutes || 0),
                  0,
                );

                const hasShiftMismatch =
                  !globalShiftFilter || globalShiftFilter.length === 0
                    ? s.dailyRecords.some((r) =>
                        isShiftMismatch(r.scheduledShift, r.inferredShift),
                      )
                    : false;

                const isTotallyAbsent =
                  s.dailyRecords.length > 0 &&
                  s.dailyRecords.every((r) => r.isAbsence);

                const fullEmp =
                  allSummaries.find(
                    (emp) =>
                      emp.employeeName === s.employeeName ||
                      emp.employeeName.toLowerCase().trim() ===
                        s.employeeName.toLowerCase().trim(),
                  ) || s;

                const refresherReturn = globalIncludeRefresher
                  ? getActualRefresherReturn(s, fullEmp)
                  : null;
                const vacationReturn = globalIncludeNextVacations
                  ? getActualVacationReturn(s, fullEmp)
                  : null;

                return (
                  <tr
                    key={`${s.employeeName}-${idx}`}
                    onClick={() => {
                      const found = allSummaries.find(
                        (all) => all.employeeName === s.employeeName,
                      );
                      if (found) {
                        setSelectedEmp({
                          ...found,
                          lob: s.lob,
                          language: s.language,
                          role: s.role,
                          supervisor: s.supervisor,
                          email: s.email,
                          shift: s.shift,
                        });
                      } else {
                        setSelectedEmp(s);
                      }
                    }}
                    className={`cursor-pointer transition-all hover:bg-slate-50/80 group ${isAlertRow ? "bg-rose-50/10" : "bg-white"}`}
                  >
                    <td className="py-2.5 pl-8 pr-4 relative">
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-1 ${hasIdleExc ? "bg-red-500" : hasWcExc ? "bg-amber-500" : "bg-transparent"}`}
                      />
                      <div className="flex items-center gap-1.5">
                        {s.workdayId && (
                          <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100/80 border border-slate-200/50 px-1 py-0.5 rounded">
                            {s.workdayId}
                          </span>
                        )}
                        <p
                          className={`font-bold text-sm text-slate-800 group-hover:text-blue-600 transition-colors ${hasIdleExc ? "underline decoration-red-500/50 decoration-2 underline-offset-4" : hasWcExc ? "underline decoration-amber-500/50 decoration-2 underline-offset-4" : ""} truncate max-w-[200px]`}
                        >
                          {s.employeeName}
                        </p>
                        {hasShiftMismatch && (
                          <div
                            title={t("workedOutsideShiftDesc")}
                            className="flex items-center justify-center p-0.5 rounded-md bg-amber-100 text-amber-600 border border-amber-200 shadow-sm shrink-0"
                          >
                            <Clock size={12} strokeWidth={3} />
                          </div>
                        )}
                      </div>
                      {s.email && (
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <p className="text-[10px] text-slate-400 truncate max-w-[200px]">
                            {s.email}
                          </p>
                        </div>
                      )}
                      {(() => {
                        const overrideStatus = getAbsenceStatusText(
                          s,
                          allSummaries,
                          s.dailyRecords,
                          latestDate,
                        );

                        const schedShifts = Array.from(
                          new Set(
                            s.dailyRecords
                              .map((r) => r.inferredShift || r.scheduledShift)
                              .filter(Boolean),
                          ),
                        ) as string[];
                        const realSchedShifts = schedShifts.filter(
                          (sh) => sh.toLowerCase() !== "off",
                        );
                        let dispShift = s.shift;
                        let shiftDiffers = false;

                        if (realSchedShifts.length === 1) {
                          dispShift = realSchedShifts[0];
                        } else if (realSchedShifts.length > 1) {
                          dispShift = "Vários Horários";
                        } else if (
                          schedShifts.length > 0 &&
                          !isLeaveShift(schedShifts[0])
                        ) {
                          dispShift = schedShifts[0];
                        } else {
                          dispShift = s.shift;
                        }

                        let statusNote = "";
                        if (!overrideStatus || overrideStatus.isOffboarded) {
                          if (s.isATT) statusNote = "ATT (Attrition)";
                          else if (s.isSUSPP) statusNote = "SUSPP (Suspended)";
                          else if (s.isOFF) statusNote = "OFF (Day Off)";
                        }

                        // Check if any specific day has a shift discrepancy
                        if (
                          s.dailyRecords.some((r) =>
                            isShiftMismatch(r.scheduledShift, r.inferredShift),
                          )
                        ) {
                          shiftDiffers = true;
                        }

                        return (s.role &&
                          !["OS", "CSR"].includes(s.role.toUpperCase())) ||
                          s.lob ||
                          s.language ||
                          dispShift ||
                          s.supervisor ||
                          statusNote ||
                          overrideStatus ? (
                          <div className="flex flex-col gap-1 mt-1">
                            <div className="flex flex-wrap gap-1">
                              {s.role &&
                                !["OS", "CSR"].includes(
                                  s.role.toUpperCase(),
                                ) && (
                                  <span className="bg-slate-100 text-slate-700 text-[9px] px-1.5 py-0.5 rounded font-black tracking-widest border border-slate-200">
                                    {s.role}
                                  </span>
                                )}
                              {s.lob && (
                                <span className="bg-blue-50 text-blue-600 text-[9px] px-1.5 py-0.5 rounded font-black tracking-widest">
                                  {formatLOB(s.lob)}
                                </span>
                              )}
                              {s.language && (
                                <span className="bg-purple-50 text-purple-600 text-[9px] px-1.5 py-0.5 rounded font-black tracking-widest">
                                  {s.language}
                                </span>
                              )}
                              {dispShift &&
                                !isLeaveShift(dispShift) &&
                                !globalIncludeRefresher &&
                                !globalIncludeNextVacations && (
                                  <span
                                    className={`border text-[9px] px-1.5 py-0.5 rounded font-black tracking-widest ${s.isOffboarded || s.isATT ? "bg-slate-200 text-slate-900 border-slate-300" : shiftDiffers ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-600 border-emerald-200"}`}
                                  >
                                    {dispShift}{" "}
                                    {!s.isOffboarded &&
                                      !s.isATT &&
                                      (shiftDiffers ? (
                                        <span className="text-amber-800 font-bold ml-1">
                                          (CHECK)
                                        </span>
                                      ) : (
                                        <span className="text-emerald-700 font-bold ml-1">
                                          ✔️
                                        </span>
                                      ))}
                                  </span>
                                )}
                              {s.supervisor && (
                                <span className="bg-slate-100 text-slate-500 text-[9px] px-1.5 py-0.5 rounded font-bold">
                                  TL: {s.supervisor}
                                </span>
                              )}
                            </div>
                            {overrideStatus &&
                              !globalIncludeRefresher &&
                              !globalIncludeNextVacations && (
                                <div>
                                  <span
                                    className={`text-[10px] font-black px-1.5 py-0.5 rounded tracking-widest ${overrideStatus.isOffboarded ? "bg-slate-200 text-slate-800" : overrideStatus.isActive ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
                                  >
                                    {overrideStatus.text}
                                  </span>
                                </div>
                              )}
                            {statusNote && (
                              <p className="text-[9px] font-black text-rose-500 uppercase italic tracking-tighter">
                                {statusNote}
                              </p>
                            )}
                          </div>
                        ) : null;
                      })()}
                    </td>
                    {(globalIncludeRefresher || globalIncludeNextVacations) && (
                      <td className="py-2.5 px-1 text-center font-bold text-slate-700 text-[11px]">
                        <span className="inline-flex items-center justify-center bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] px-2 py-0.5 rounded font-black tracking-widest uppercase shadow-sm">
                          {globalIncludeRefresher
                            ? refresherReturn?.shift || "N/A"
                            : vacationReturn?.shift || "N/A"}
                        </span>
                      </td>
                    )}
                    {globalIncludeRefresher ? (
                      <>
                        <td className="py-2.5 px-1 text-center font-bold text-slate-700 text-[11px]">
                          {s.refresherStartDate
                            ? s.refresherStartDate
                                .split("-")
                                .reverse()
                                .join("/")
                            : "N/A"}
                        </td>
                        <td className="py-2.5 px-1 text-center font-bold text-slate-700 text-[11px]">
                          {refresherReturn && refresherReturn.date !== "N/A"
                            ? refresherReturn.date
                                .split("-")
                                .reverse()
                                .join("/")
                            : s.refresherDate
                              ? s.refresherDate.split("-").reverse().join("/")
                              : "N/A"}
                        </td>
                      </>
                    ) : globalIncludeNextVacations ? (
                      <>
                        <td className="py-2.5 px-1 text-center font-bold text-slate-700 text-[11px]">
                          {s.vacationStartDate
                            ? s.vacationStartDate.split("-").reverse().join("/")
                            : "N/A"}
                        </td>
                        <td className="py-2.5 px-1 text-center font-bold text-slate-700 text-[11px]">
                          {s.vacationEndDate
                            ? s.vacationEndDate.split("-").reverse().join("/")
                            : "N/A"}
                        </td>
                      </>
                    ) : (
                      <>
                        <td
                          className="py-2.5 px-1 text-center"
                          title={
                            mealTotal > 0
                              ? `${mealTotal}m ${t("overbreakExceeded")}`
                              : "No overbreak"
                          }
                        >
                          <span
                            className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded transition-colors ${hasMealOver ? "bg-rose-100 text-rose-700 font-black" : isTotallyAbsent && mealTotal === 0 ? "text-slate-300 font-bold" : "bg-emerald-50 text-emerald-600 font-bold"}`}
                          >
                            {mealTotal > 0
                              ? `${mealTotal}m`
                              : isTotallyAbsent
                                ? "-"
                                : t("okShort")}
                          </span>
                        </td>

                        <td
                          className="py-2.5 px-1 text-center"
                          title={
                            shortTotal > 0
                              ? `${shortTotal}m ${t("overbreakExceeded")}`
                              : "No overbreak"
                          }
                        >
                          <span
                            className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded transition-colors ${hasShortOver ? "bg-rose-100 text-rose-700 font-black" : isTotallyAbsent && shortTotal === 0 ? "text-slate-300 font-bold" : "bg-emerald-50 text-emerald-600 font-bold"}`}
                          >
                            {shortTotal > 0
                              ? `${shortTotal}m`
                              : isTotallyAbsent
                                ? "-"
                                : t("okShort")}
                          </span>
                        </td>

                        <td
                          className="py-2.5 px-1 text-center"
                          title={
                            wellnessTotal > 0
                              ? `${wellnessTotal}m ${t("overbreakExceeded")}`
                              : "No overbreak"
                          }
                        >
                          <span
                            className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded transition-colors ${hasWellnessOver ? "bg-rose-100 text-rose-700 font-black" : isTotallyAbsent && wellnessTotal === 0 ? "text-slate-300 font-bold" : "bg-emerald-50 text-emerald-600 font-bold"}`}
                          >
                            {wellnessTotal > 0
                              ? `${wellnessTotal}m`
                              : isTotallyAbsent
                                ? "-"
                                : t("okShort")}
                          </span>
                        </td>

                        <td
                          className="py-2.5 px-1 text-center"
                          title={
                            prayingTotal > 0
                              ? `${prayingTotal}m ${t("overbreakExceeded")}`
                              : "No overbreak"
                          }
                        >
                          <span
                            className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded transition-colors ${hasPrayingOver ? "bg-rose-100 text-rose-700 font-black" : isTotallyAbsent && prayingTotal === 0 ? "text-slate-300 font-bold" : "bg-emerald-50 text-emerald-600 font-bold"}`}
                          >
                            {prayingTotal > 0
                              ? `${prayingTotal}m`
                              : isTotallyAbsent
                                ? "-"
                                : t("okShort")}
                          </span>
                        </td>

                        <td
                          className="py-2.5 px-1 text-center"
                          title={
                            s.totalReviewAndAppealMinutes > 0
                              ? `${s.totalReviewAndAppealMinutes}m em R&A`
                              : "0m em R&A"
                          }
                        >
                          <span
                            className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded transition-colors ${s.totalReviewAndAppealMinutes > 0 ? "bg-purple-50 text-purple-700 font-black border border-purple-200" : "text-slate-300 font-bold"}`}
                          >
                            {s.totalReviewAndAppealMinutes > 0
                              ? `${s.totalReviewAndAppealMinutes}m`
                              : isTotallyAbsent
                                ? "-"
                                : "0m"}
                          </span>
                        </td>

                        <td
                          className="py-2.5 px-1 text-center"
                          title={
                            s.totalAwaitingTasksMinutes > 0
                              ? `${s.totalAwaitingTasksMinutes}m em A.T`
                              : "0m em A.T"
                          }
                        >
                          <span
                            className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded transition-colors ${s.totalAwaitingTasksMinutes > 0 ? "bg-indigo-50 text-indigo-700 font-black border border-indigo-200" : "text-slate-300 font-bold"}`}
                          >
                            {s.totalAwaitingTasksMinutes > 0
                              ? `${s.totalAwaitingTasksMinutes}m`
                              : isTotallyAbsent
                                ? "-"
                                : "0m"}
                          </span>
                        </td>

                        <td
                          className="py-2.5 px-1 text-center"
                          title={
                            wcTotal > 0
                              ? `${wcTotal}m ${t("overbreakExceeded")}`
                              : "No overbreak"
                          }
                        >
                          <span
                            className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded transition-colors ${hasWcExc ? "bg-amber-100 text-amber-700 font-black border border-amber-200" : isTotallyAbsent && wcTotal === 0 ? "text-slate-300 font-bold" : "bg-emerald-50 text-emerald-600 font-bold"}`}
                          >
                            {wcTotal > 0
                              ? `${wcTotal}m`
                              : isTotallyAbsent
                                ? "-"
                                : t("okShort")}
                          </span>
                        </td>

                        <td
                          className="py-2.5 px-1 text-center"
                          title={
                            idleTotal > 0
                              ? `${idleTotal}m ${t("overbreakExceeded")}`
                              : "No overbreak"
                          }
                        >
                          <span
                            className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded transition-colors ${hasIdleExc ? "bg-red-100 text-red-700 font-black border border-red-200" : isTotallyAbsent && idleTotal === 0 ? "text-slate-300 font-bold" : "bg-emerald-50 text-emerald-600 font-bold"}`}
                          >
                            {idleTotal > 0
                              ? `${idleTotal}m`
                              : isTotallyAbsent
                                ? "-"
                                : t("okShort")}
                          </span>
                        </td>

                        <td
                          className="py-2.5 px-1 text-center"
                          title={
                            tardinessTotal > 0
                              ? `${tardinessTotal}m atraso`
                              : "No tardiness"
                          }
                        >
                          <span
                            className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded transition-colors ${tardinessTotal > 0 ? "bg-orange-100 text-orange-700 font-black border border-orange-200" : "text-slate-300 font-bold"}`}
                          >
                            {tardinessTotal > 0
                              ? `${tardinessTotal}m`
                              : isTotallyAbsent
                                ? "-"
                                : "0m"}
                          </span>
                        </td>

                        <td
                          className="py-2.5 px-1 text-center"
                          title={
                            earlyLeaveTotal > 0
                              ? `${earlyLeaveTotal}m saída antecipada`
                              : "No early leave"
                          }
                        >
                          <span
                            className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded transition-colors ${earlyLeaveTotal > 0 ? "bg-orange-100 text-orange-700 font-black border border-orange-200" : "text-slate-300 font-bold"}`}
                          >
                            {earlyLeaveTotal > 0
                              ? `${earlyLeaveTotal}m`
                              : isTotallyAbsent
                                ? "-"
                                : "0m"}
                          </span>
                        </td>

                        <td
                          className="py-2.5 px-1 text-center"
                          title={
                            (s.totalShort30MinRecords || 0) > 0
                              ? `${s.totalShort30MinRecords} dias`
                              : "0 dias"
                          }
                        >
                          <span
                            className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded transition-colors ${(s.totalShort30MinRecords || 0) > 0 ? "bg-emerald-100/70 border border-emerald-200 text-emerald-800 font-black" : "text-slate-300 font-bold"}`}
                          >
                            {s.totalShort30MinRecords || 0}d
                          </span>
                        </td>

                        <td
                          className="py-2.5 px-1 text-center"
                          title={
                            isNmRaAtOnly
                              ? `${getAgentNmRaAtTotal(s)}m no total`
                              : s.totalOverbreakMinutes > 0
                                ? `${s.totalOverbreakMinutes}m ${isWcOnly ? "Organic" : t("overbreakExceeded")}`
                                : "No overbreak"
                          }
                        >
                          <span
                            className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded transition-colors ${
                              isNmRaAtOnly
                                ? getAgentNmRaAtTotal(s) > 0
                                  ? "bg-indigo-100 text-indigo-700 font-black border border-indigo-200"
                                  : "text-slate-300 font-bold"
                                : s.totalOverbreakMinutes > 0
                                  ? isWcOnly
                                    ? "bg-amber-100 border border-amber-200 text-amber-600 font-black"
                                    : "bg-rose-100 text-rose-700 font-black"
                                  : "bg-emerald-50 text-emerald-600 font-bold"
                            }`}
                          >
                            {isNmRaAtOnly
                              ? getAgentNmRaAtTotal(s) > 0
                                ? `${getAgentNmRaAtTotal(s)}m`
                                : "0m"
                              : s.totalOverbreakMinutes > 0
                                ? `${s.totalOverbreakMinutes}m`
                                : t("okShort")}
                          </span>
                        </td>
                        <td
                          className="py-2.5 px-1 text-center"
                          title={
                            lang === "pt"
                              ? `${getAgentBreaksQty(s)} pausas no total (excluindo WC)`
                              : `${getAgentBreaksQty(s)} breaks in total (excluding WC)`
                          }
                        >
                          <span
                            className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded transition-colors ${getAgentBreaksQty(s) > 0 ? "bg-blue-100 text-blue-700 font-black border border-blue-200" : "text-slate-300 font-bold"}`}
                          >
                            {getAgentBreaksQty(s)}x
                          </span>
                        </td>
                      </>
                    )}

                    <td className="py-2.5 pl-4 pr-8 text-right">
                      {s.isRefresher ? (
                        <span className="inline-block px-1.5 py-0.5 bg-orange-600 text-white rounded-md text-[10px] font-black uppercase tracking-tighter shadow-sm whitespace-nowrap">
                          REFRESHER (Volta:{" "}
                          {(() => {
                            const d = refresherReturn?.date || s.refresherDate;
                            if (!d) return "N/A";
                            try {
                              return format(parseISO(d), "dd/MM");
                            } catch (e) {
                              return d;
                            }
                          })()}
                          )
                        </span>
                      ) : s.isATT ? (
                        <span className="inline-block px-1.5 py-0.5 bg-slate-900 text-white rounded-md text-[10px] font-black uppercase tracking-tighter shadow-sm">
                          ATT
                        </span>
                      ) : s.isOffboarded ? (
                        <span className="inline-block px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded-md text-[10px] font-black uppercase tracking-tighter">
                          OFFBOARDED
                        </span>
                      ) : s.isLOA ? (
                        <span className="inline-block px-1.5 py-0.5 bg-indigo-500 text-white rounded-md text-[10px] font-black uppercase tracking-tighter shadow-sm">
                          LOA
                        </span>
                      ) : s.isPTO ? (
                        <span className="inline-block px-1.5 py-0.5 bg-cyan-500 text-white rounded-md text-[10px] font-black uppercase tracking-tighter shadow-sm">
                          {String(s.shift || "")
                            .toUpperCase()
                            .includes("MAR")
                            ? "MAR"
                            : "PTO"}
                        </span>
                      ) : s.isSL ? (
                        <span className="inline-block px-1.5 py-0.5 bg-rose-400 text-white rounded-md text-[10px] font-black uppercase tracking-tighter shadow-sm">
                          SL
                        </span>
                      ) : s.isSUSPP ? (
                        <span className="inline-block px-1.5 py-0.5 bg-red-700 text-white rounded-md text-[10px] font-black uppercase tracking-tighter shadow-sm">
                          SUSPP
                        </span>
                      ) : s.isOFF ? (
                        <span className="inline-block px-1.5 py-0.5 bg-slate-500 text-white rounded-md text-[10px] font-black uppercase tracking-tighter shadow-sm">
                          OFF
                        </span>
                      ) : isWcOnly && s.totalOverbreakMinutes > 0 ? (
                        <span className="inline-block px-1.5 py-0.5 bg-amber-500 text-white rounded-md text-[10px] font-black uppercase tracking-tighter">
                          ORGANIC TOTAL
                        </span>
                      ) : hasIdleExc ? (
                        <span className="inline-block px-1.5 py-0.5 bg-red-100 text-red-700 rounded-md text-[10px] font-black uppercase tracking-tighter">
                          IDLE
                        </span>
                      ) : hasWcExc ? (
                        <span className="inline-block px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-md text-[10px] font-black uppercase tracking-tighter">
                          ORGANIC EXC.
                        </span>
                      ) : s.totalOverbreakMinutes > 30 ? (
                        <span className="inline-block px-1.5 py-0.5 bg-rose-600 text-white rounded-md text-[10px] font-black uppercase tracking-tighter">
                          OVERBREAK
                        </span>
                      ) : s.totalOverbreakMinutes > 0 ? (
                        <span className="inline-block px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded-md text-[10px] font-black uppercase tracking-tighter">
                          {t("alert")}
                        </span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-md text-[10px] font-black uppercase tracking-tighter">
                          {t("stable")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
                })
              )}
            </tbody>
          </table>
        </div>
        )}

        <div className="p-5 bg-slate-50 border-t border-slate-200 flex justify-between items-center px-8 shrink-0">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            {t("showingRecords")} {filtered.length} {t("outOf")}{" "}
            {summaries.length} {t("recordsProcessed")}
          </p>
        </div>
      </div>

      <Dialog
        open={!!selectedEmp}
        onOpenChange={(open) => !open && setSelectedEmp(null)}
      >
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] flex flex-col rounded-[2rem] border-slate-200 p-0 overflow-hidden shadow-2xl">
          {selectedEmp && (
            <EmployeeDetail
              summary={selectedEmp}
              allSummaries={allSummaries}
              staffInfoData={staffInfoData}
              latestDate={latestDate || new Date()}
              initialFilter={initialFilter}
              availableFilters={availableFilters}
              t={t}
              globalTypeFilter={globalTypeFilter}
              globalIncludeWc={globalIncludeWc}
              globalIncludeIdle={globalIncludeIdle}
              globalIncludeNonMod={globalIncludeNonMod}
              globalIncludeRa={globalIncludeRa}
              globalIncludeAt={globalIncludeAt}
              globalIncludeTardiness={globalIncludeTardiness}
              globalIncludeMinorTardiness={globalIncludeMinorTardiness}
              globalIncludeEarlyLeave={globalIncludeEarlyLeave}
              globalIncludeShort30Min={globalIncludeShort30Min}
              globalIncludeCheck={globalIncludeCheck}
              globalIncludeAbsences={globalIncludeAbsences}
              globalFilterMajorOverbreaks={globalFilterMajorOverbreaks}
              teamProductiveMinutes={exportedTeamProductiveMinutes}
              teamNonModMinutes={exportedTeamNonModMinutes}
              showRealTime={showRealTime}
              showBPO={showBPO}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isMultiSelectOpen}
        onOpenChange={(open) => setIsMultiSelectOpen(open)}
      >
        <DialogContent className="max-w-md w-[95vw] rounded-2xl border-slate-200 p-6 overflow-hidden shadow-2xl bg-white text-slate-800">
          <DialogHeader className="pb-2 border-b border-slate-100">
            <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Users size={20} className="text-blue-600" />
              <span>{lang === "pt" ? "Seleção de Múltiplos Agentes" : "Multiple select"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 mt-4">
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              {lang === "pt"
                ? "Insira o nome completo, primeiro nome ou Workday ID dos agentes que você deseja procurar. Escreva um em cada linha (aperte Enter para pular de linha)."
                : "Enter the full name, first name or Workday ID of the agents you want to search. Write one on each line (press Enter to skip a line)."}
            </p>

            <textarea
              placeholder={
                lang === "pt"
                  ? "Exemplo:\nAndrei\n10052342\nCarlos Silva"
                  : "Example:\nAndrei\n10052342\nCarlos Silva"
              }
              value={multiSelectText}
              onChange={(e) => setMultiSelectText(e.target.value)}
              className="w-full h-44 p-3 font-medium text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none shadow-inner resize-none font-sans"
            />

            {/* Real-time matched preview stats */}
            {(() => {
              const lines = multiSelectText
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line.length > 0);
              if (lines.length === 0) return null;

              const matchedAgents = processedSummariesWithRecalculatedRefresher.filter((s) => {
                return lines.some((term) => {
                  return (
                    normalizeName(s.employeeName).includes(normalizeName(term)) ||
                    (s.workdayId && s.workdayId.toLowerCase().includes(term.toLowerCase()))
                  );
                });
              });

              return (
                <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-2.5 flex items-center justify-between text-xs text-blue-700 font-sans">
                  <span className="font-semibold">
                    {lang === "pt"
                      ? `${matchedAgents.length} agentes encontrados`
                      : `${matchedAgents.length} matching agents found`}
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-black">
                    {lines.length} {lang === "pt" ? "Filtros" : "Filters"}
                  </span>
                </div>
              );
            })()}

            <div className="flex items-center gap-2 justify-end mt-2 pt-3 border-t border-slate-100 font-sans">
              <button
                type="button"
                onClick={handleClearMultiSelect}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                {lang === "pt" ? "Limpar Filtro" : "Clear Filter"}
              </button>
              <button
                type="button"
                onClick={handleApplyMultiSelect}
                className="px-5 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-600/10 transition-colors cursor-pointer"
              >
                {lang === "pt" ? "Filtrar" : "Filter"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function recalculateRecordOverbreaks(r: any): any {
  let wcDur = 0,
    mealDur = 0,
    shortDur = 0,
    wellnessDur = 0,
    prayingDur = 0,
    idleDur = 0;

  (r.breaks || []).forEach((b: any) => {
    if (b.type === "wc") wcDur += b.durationMinutes;
    else if (b.type === "meal") mealDur += b.durationMinutes;
    else if (b.type === "short") shortDur += b.durationMinutes;
    else if (b.type === "wellness") wellnessDur += b.durationMinutes;
    else if (b.type === "praying") prayingDur += b.durationMinutes;
    else if (b.type === "idle") idleDur += b.durationMinutes;
  });

  const shortBreaks = (r.breaks || []).filter((b: any) => b.type === "short");
  const hasSingleShort30m =
    shortBreaks.length === 1 && shortBreaks[0].durationMinutes >= 20;

  let wcOverbreak = Math.max(0, wcDur - 10);
  let mealOverbreak = Math.max(0, mealDur - 60);
  let shortOverbreak = Math.max(0, shortDur - 30);

  if (hasSingleShort30m && shortOverbreak <= 2) {
    shortOverbreak = 0;
  }
  let wellnessOverbreak = Math.max(0, wellnessDur - 15);
  let prayingOverbreak = Math.max(0, prayingDur - 15);
  let idleOverbreak = idleDur;

  let dailyOverbreak =
    mealOverbreak + shortOverbreak + wellnessOverbreak + prayingOverbreak;

  return {
    ...r,
    wcDuration: wcDur,
    mealDuration: mealDur,
    shortDuration: shortDur,
    wellnessDuration: wellnessDur,
    prayingDuration: prayingDur,
    idleDuration: idleDur,
    hasSingleShort30m,
    wcOverbreak,
    mealOverbreak,
    shortOverbreak,
    wellnessOverbreak,
    prayingOverbreak,
    idleOverbreak,
    totalOverbreak: dailyOverbreak,
  };
}

function EmployeeDetail({
  summary: s,
  allSummaries,
  staffInfoData,
  latestDate,
  initialFilter,
  availableFilters,
  t,
  globalTypeFilter,
  globalIncludeWc,
  globalIncludeIdle,
  globalIncludeNonMod,
  globalIncludeRa,
  globalIncludeAt,
  globalIncludeTardiness,
  globalIncludeMinorTardiness,
  globalIncludeEarlyLeave,
  globalIncludeShort30Min,
  globalIncludeCheck,
  globalIncludeAbsences,
  globalFilterMajorOverbreaks,
  teamProductiveMinutes,
  teamNonModMinutes,
  showRealTime,
  showBPO = false,
}: {
  summary: EmployeeSummary;
  allSummaries: EmployeeSummary[];
  staffInfoData?: any[];
  latestDate: Date;
  initialFilter: string;
  availableFilters: string[];
  t: any;
  globalTypeFilter: "all" | "idle_overbreak_wc";
  globalIncludeWc: boolean;
  globalIncludeIdle: boolean;
  globalIncludeNonMod: boolean;
  globalIncludeRa?: boolean;
  globalIncludeAt?: boolean;
  globalIncludeTardiness: boolean;
  globalIncludeMinorTardiness?: boolean;
  globalIncludeEarlyLeave: boolean;
  globalIncludeShort30Min?: boolean;
  globalIncludeCheck?: boolean;
  globalIncludeAbsences?: boolean;
  globalFilterMajorOverbreaks: boolean;
  teamProductiveMinutes?: number;
  teamNonModMinutes?: number;
  showRealTime?: boolean;
  showBPO?: boolean;
}) {
  const { lang } = useLanguage();
  const today = latestDate;

  const getInitialView = () => {
    if (initialFilter === "month" && availableFilters.includes("month"))
      return "month";
    if (initialFilter === "week" && availableFilters.includes("week"))
      return "week";
    if (initialFilter === "yesterday" && availableFilters.includes("yesterday"))
      return "yesterday";
    if (initialFilter === "day" && availableFilters.includes("day"))
      return "today";

    if (availableFilters.includes("day")) return "today";
    if (availableFilters.includes("yesterday")) return "yesterday";
    if (availableFilters.includes("week")) return "week";
    if (availableFilters.includes("month")) return "month";
    return "today";
  };

  const [view, setView] = useState<"today" | "yesterday" | "week" | "month">(
    getInitialView(),
  );
  const [onlyExceptions, setOnlyExceptions] = useState(false);
  const [includeWc, setIncludeWc] = useState(false);
  const [includeIdle, setIncludeIdle] = useState(false);
  const [filterNm, setFilterNm] = useState(false);
  const [filterRa, setFilterRa] = useState(false);
  const [filterAt, setFilterAt] = useState(false);
  const [includeTardiness, setIncludeTardiness] = useState(false);
  const [includeMinorTardiness, setIncludeMinorTardiness] = useState(false);
  const [includeEarlyLeave, setIncludeEarlyLeave] = useState(false);
  const [includeShort30Min, setIncludeShort30Min] = useState(false);
  const [includeCheck, setIncludeCheck] = useState(false);
  const [includeFaltas, setIncludeFaltas] = useState(false);

  const rawCleanedSummary =
    allSummaries.find((as) => as.employeeName === s.employeeName) || s;

  const fullSummary = useMemo(() => {
    return {
      ...rawCleanedSummary,
      dailyRecords: (rawCleanedSummary.dailyRecords || []).map(
        recalculateRecordOverbreaks,
      ),
    };
  }, [rawCleanedSummary]);

  let records = fullSummary.dailyRecords;

  const isShiftCrossingMidnight = (shiftStr: string | null | undefined) => {
    if (!shiftStr) return false;
    let cleaned = shiftStr.replace(/\s+/g, "").toUpperCase();

    // Convert AM/PM to 24h before removing letters
    const parseTime = (timeStr: string) => {
      let isPM = timeStr.includes("PM");
      let isAM = timeStr.includes("AM");
      let t = timeStr.replace(/[A-Z]/g, "").replace(":", ".");
      let parts = t.split(".");
      let h = parseInt(parts[0]) || 0;
      let m = parseInt(parts[1]) || 0;
      if (isPM && h !== 12) h += 12;
      if (isAM && h === 12) h = 0;
      return h * 60 + m;
    };

    const times = cleaned.split("-");
    if (times.length === 2) {
      let startTotal = parseTime(times[0]);
      let endTotal = parseTime(times[1]);
      if (endTotal <= startTotal) return true;
    }
    return false;
  };

  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  if (view === "month") {
    records = fullSummary.dailyRecords.filter((r) => {
      const d = new Date(r.date + "T12:00:00");
      return (
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear() &&
        d.getTime() <= endOfToday.getTime()
      );
    });
  } else if (view === "week") {
    const dow = today.getDay();
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() + diffToMon);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    records = fullSummary.dailyRecords.filter((r) => {
      const d = new Date(r.date + "T12:00:00");
      return (
        d >= startOfWeek &&
        d <= endOfWeek &&
        d.getTime() <= endOfToday.getTime()
      );
    });
  } else if (view === "today") {
    records = fullSummary.dailyRecords.filter((r) => {
      const d = new Date(r.date + "T12:00:00");
      const isToday =
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear();
      return isToday;
    });
  } else if (view === "yesterday") {
    records = fullSummary.dailyRecords.filter((r) => {
      const d = new Date(r.date + "T12:00:00");
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday =
        d.getDate() === yesterday.getDate() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getFullYear() === yesterday.getFullYear();

      return isYesterday;
    });
  }

  const viewRecords = records;
  const hasExceptionsData = viewRecords.some(
    (r) =>
      r.mealOverbreak > 0 ||
      r.shortOverbreak > 0 ||
      r.wellnessOverbreak > 0 ||
      r.prayingOverbreak > 0,
  );
  const hasOrganicData = viewRecords.some((r) => r.wcDuration > 0);
  const hasNonModData = viewRecords.some((r) =>
    r.breaks.some(
      (b) => b.type === "non_moderating" || b.type === "forgot_status",
    ),
  );
  const hasTardinessData = viewRecords.some(
    (r) => (r.tardinessMinutes || 0) > 0,
  );
  const hasEarlyLeaveData = viewRecords.some(
    (r) => (r.earlyLeaveMinutes || 0) > 0,
  );
  const hasIdleData = viewRecords.some((r) => r.idleDuration > 0);
  const hasCheckData = viewRecords.some((r) =>
    isShiftMismatch(r.scheduledShift, r.inferredShift),
  );
  const hasAbsenceData = viewRecords.some((r) => r.isAbsence);

  const anyLocalFilterActive =
    onlyExceptions ||
    includeWc ||
    includeIdle ||
    filterNm ||
    includeTardiness ||
    includeEarlyLeave ||
    includeShort30Min ||
    includeCheck ||
    includeFaltas;
  if (anyLocalFilterActive) {
    records = records.filter((r) => {
      let keep = false;
      const hasAnyOverbreak =
        r.mealOverbreak > 0 ||
        r.shortOverbreak > 0 ||
        r.wellnessOverbreak > 0 ||
        r.prayingOverbreak > 0;

      if (onlyExceptions && hasAnyOverbreak) keep = true;
      if (includeWc && r.wcDuration > 0) keep = true;
      if (includeIdle && r.idleDuration > 0) keep = true;
      if (
        filterNm &&
        r.breaks.some(
          (b) => b.type === "non_moderating" || b.type === "forgot_status",
        )
      )
        keep = true;
      if (includeTardiness) {
        if (includeMinorTardiness) {
          if ((r.tardinessMinutes || 0) > 0 && (r.tardinessMinutes || 0) < 15)
            keep = true;
        } else {
          if ((r.tardinessMinutes || 0) >= 15) keep = true;
        }
      }
      if (includeEarlyLeave && (r.earlyLeaveMinutes || 0) > 0) keep = true;
      if (includeShort30Min && r.hasSingleShort30m) keep = true;
      if (includeCheck && isShiftMismatch(r.scheduledShift, r.inferredShift))
        keep = true;
      if (includeFaltas && r.isAbsence) keep = true;

      return keep;
    });
  }

  // Se SOMENTE o respectivo filtro estiver selecionado localmente em relacao as outras opcoes de overbreaks/excecoes
  const isWcOnly =
    includeWc &&
    !includeShort30Min &&
    !includeIdle &&
    !filterNm &&
    !filterRa &&
    !filterAt &&
    !includeTardiness &&
    !includeEarlyLeave &&
    !includeCheck &&
    !includeFaltas &&
    !onlyExceptions;
  const isIdleOnly =
    includeIdle &&
    !includeShort30Min &&
    !includeWc &&
    !filterNm &&
    !filterRa &&
    !filterAt &&
    !includeTardiness &&
    !includeEarlyLeave &&
    !includeCheck &&
    !includeFaltas &&
    !onlyExceptions;
  const isNmRaAtOnlyLocal =
    (filterNm || filterRa || filterAt) &&
    !includeWc &&
    !includeIdle &&
    !includeTardiness &&
    !includeEarlyLeave &&
    !includeShort30Min &&
    !includeCheck &&
    !includeFaltas &&
    !onlyExceptions;
  const isTardinessOnly =
    includeTardiness &&
    !includeMinorTardiness &&
    !includeShort30Min &&
    !includeIdle &&
    !includeWc &&
    !filterNm &&
    !filterRa &&
    !filterAt &&
    !includeEarlyLeave &&
    !includeCheck &&
    !includeFaltas &&
    !onlyExceptions;
  const isMinorTardinessOnly =
    includeTardiness &&
    includeMinorTardiness &&
    !includeShort30Min &&
    !includeIdle &&
    !includeWc &&
    !filterNm &&
    !filterRa &&
    !filterAt &&
    !includeEarlyLeave &&
    !includeCheck &&
    !includeFaltas &&
    !onlyExceptions;
  const isEarlyLeaveOnly =
    includeEarlyLeave &&
    !includeShort30Min &&
    !includeIdle &&
    !includeWc &&
    !filterNm &&
    !filterRa &&
    !filterAt &&
    !includeTardiness &&
    !includeCheck &&
    !includeFaltas &&
    !onlyExceptions;
  const isShort30MinOnly =
    includeShort30Min &&
    !includeEarlyLeave &&
    !includeIdle &&
    !includeWc &&
    !filterNm &&
    !filterRa &&
    !filterAt &&
    !includeTardiness &&
    !includeCheck &&
    !includeFaltas &&
    !onlyExceptions;
  const isCheckOnly =
    includeCheck &&
    !includeShort30Min &&
    !includeEarlyLeave &&
    !includeIdle &&
    !includeWc &&
    !filterNm &&
    !filterRa &&
    !filterAt &&
    !includeTardiness &&
    !includeFaltas &&
    !onlyExceptions;

  const totalPeriodNmRaAt = records.reduce((acc, r) => {
    let sum = 0;
    if (filterNm) sum += r.nonModDuration || 0;
    if (filterRa) sum += r.reviewAndAppealDuration || 0;
    if (filterAt) sum += r.awaitingTasksDuration || 0;
    return acc + sum;
  }, 0);

  const totalPeriodOverbreak = records.reduce((acc, r) => {
    if (isWcOnly) return acc + r.wcDuration;
    if (isIdleOnly) return acc + r.idleDuration;

    let dayOverbreak =
      r.mealOverbreak +
      r.shortOverbreak +
      r.wellnessOverbreak +
      r.prayingOverbreak;
    if (includeIdle) dayOverbreak += r.idleOverbreak;
    if (includeWc) dayOverbreak += r.wcOverbreak;
    return acc + dayOverbreak;
  }, 0);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <div className="bg-slate-900 text-white p-6 shrink-0 relative z-10 w-full">
        <DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center font-black text-xl shadow-lg shrink-0">
                  {String(s.employeeName || "")
                    .substring(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    {s.workdayId && (
                      <span className="text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded leading-none shrink-0">
                        {s.workdayId}
                      </span>
                    )}
                    <DialogTitle className="text-2xl font-black text-left">
                      {s.employeeName}
                    </DialogTitle>
                    <button
                      onClick={() => {
                        let periodStr = "";
                        if (records.length > 0) {
                          const sorted = [...records].sort((a, b) =>
                            a.date.localeCompare(b.date),
                          );
                          periodStr =
                            sorted.length === 1
                              ? sorted[0].date
                              : `${sorted[0].date} to ${sorted[sorted.length - 1].date}`;
                        } else {
                          periodStr = "N/A";
                        }

                        const fmtD = (dStr: string) => {
                          const dObj = new Date(dStr + "T12:00:00");
                          const day = dObj.getDate();
                          const m = dObj.toLocaleDateString("en-US", {
                            month: "long",
                          });
                          const ord =
                            day > 3 && day < 21
                              ? "th"
                              : [
                                  "th",
                                  "st",
                                  "nd",
                                  "rd",
                                  "th",
                                  "th",
                                  "th",
                                  "th",
                                  "th",
                                  "th",
                                ][day % 10];
                          return `${m} ${day}${ord}`;
                        };

                        const reports = [];

                        // Idle Time
                        if (includeIdle) {
                          const totalIdle = records.reduce(
                            (acc, r) => acc + r.idleDuration,
                            0,
                          );
                          if (totalIdle > 0) {
                            let occurrences = "";
                            records
                              .filter((r) => r.idleDuration > 0)
                              .forEach((r) => {
                                const idleBreaks = (r.breaks || []).filter(
                                  (b) => b.type === "idle",
                                );
                                if (idleBreaks.length > 0) {
                                  const totalMin = Math.round(
                                    idleBreaks.reduce(
                                      (acc, b) => acc + b.durationMinutes,
                                      0,
                                    ),
                                  );
                                  const details = idleBreaks
                                    .map((b) => {
                                      const start = `${b.startTime.getHours().toString().padStart(2, "0")}:${b.startTime.getMinutes().toString().padStart(2, "0")}`;
                                      const end = `${b.endTime.getHours().toString().padStart(2, "0")}:${b.endTime.getMinutes().toString().padStart(2, "0")}`;
                                      return `${start} ~ ${end} [${Math.round(b.durationMinutes)} min]`;
                                    })
                                    .join(" | ");
                                  occurrences += `  • ${fmtD(r.date)}: ${totalMin} minutes (${details})\n`;
                                }
                              });
                            reports.push({
                              title: "Idle Time",
                              totalStr: `${Math.floor(totalIdle / 60)}h ${totalIdle % 60}m`,
                              occurrences,
                            });
                          }
                        }

                        // Organic Excess
                        if (includeWc) {
                          const wcRecords = records.filter(
                            (r) => r.wcOverbreak > 0,
                          );
                          if (wcRecords.length > 0) {
                            const totalWc = wcRecords.reduce(
                              (acc, r) => acc + r.wcOverbreak,
                              0,
                            );
                            let occurrences = "";
                            wcRecords.forEach((r) => {
                              let accWc = 0;
                              const wcBreaks = (r.breaks || []).filter(
                                (b) => b.type === "wc",
                              );
                              const details: string[] = [];
                              wcBreaks.forEach((b) => {
                                let oldAcc = accWc;
                                accWc += b.durationMinutes;
                                if (accWc > 25) {
                                  let exceeded = accWc - Math.max(oldAcc, 25);
                                  if (exceeded > 0) {
                                    const start = `${b.startTime.getHours().toString().padStart(2, "0")}:${b.startTime.getMinutes().toString().padStart(2, "0")}`;
                                    const end = `${b.endTime.getHours().toString().padStart(2, "0")}:${b.endTime.getMinutes().toString().padStart(2, "0")}`;
                                    details.push(
                                      `${start} ~ ${end} [${Math.round(exceeded)} min exceeded]`,
                                    );
                                  }
                                }
                              });
                              if (details.length > 0) {
                                occurrences += `  • ${fmtD(r.date)}: ${Math.round(r.wcOverbreak)} minutes exceeded (${details.join(" | ")})\n`;
                              }
                            });
                            reports.push({
                              title: "Organic Break Excess (Allowed: 25m/day)",
                              totalStr: `${Math.floor(totalWc / 60)}h ${totalWc % 60}m`,
                              occurrences,
                            });
                          }
                        }

                        // Overbreak
                        if (onlyExceptions) {
                          const overbreakRecords = records.filter(
                            (r) =>
                              r.mealOverbreak > 0 ||
                              r.shortOverbreak > 0 ||
                              r.wellnessOverbreak > 0 ||
                              r.prayingOverbreak > 0,
                          );
                          if (overbreakRecords.length > 0) {
                            const totalOver = overbreakRecords.reduce(
                              (acc, r) =>
                                acc +
                                r.mealOverbreak +
                                r.shortOverbreak +
                                r.wellnessOverbreak +
                                r.prayingOverbreak,
                              0,
                            );
                            let occurrences = "";
                            overbreakRecords.forEach((r) => {
                              let accMeal = 0,
                                accShort = 0,
                                accWell = 0,
                                accPray = 0;
                              const types = [
                                "meal",
                                "short",
                                "wellness",
                                "praying",
                              ];
                              const obBreaks = (r.breaks || []).filter((b) =>
                                types.includes(b.type),
                              );
                              const details: string[] = [];
                              obBreaks.forEach((b) => {
                                let lim = 0;
                                let acc = 0;
                                if (b.type === "meal") {
                                  lim = r.mealDuration - r.mealOverbreak || 60;
                                  accMeal += b.durationMinutes;
                                  acc = accMeal;
                                } else if (b.type === "short") {
                                  lim =
                                    r.shortDuration - r.shortOverbreak || 30;
                                  accShort += b.durationMinutes;
                                  acc = accShort;
                                } else if (b.type === "wellness") {
                                  lim =
                                    r.wellnessDuration - r.wellnessOverbreak ||
                                    15;
                                  accWell += b.durationMinutes;
                                  acc = accWell;
                                } else if (b.type === "praying") {
                                  lim =
                                    r.prayingDuration - r.prayingOverbreak ||
                                    15;
                                  accPray += b.durationMinutes;
                                  acc = accPray;
                                }

                                let oldAcc = acc - b.durationMinutes;
                                let hasOverbreakForThisType = false;
                                if (b.type === "meal")
                                  hasOverbreakForThisType = r.mealOverbreak > 0;
                                else if (b.type === "short")
                                  hasOverbreakForThisType =
                                    r.shortOverbreak > 0;
                                else if (b.type === "wellness")
                                  hasOverbreakForThisType =
                                    r.wellnessOverbreak > 0;
                                else if (b.type === "praying")
                                  hasOverbreakForThisType =
                                    r.prayingOverbreak > 0;

                                const start = `${b.startTime.getHours().toString().padStart(2, "0")}:${b.startTime.getMinutes().toString().padStart(2, "0")}`;
                                const end = `${b.endTime.getHours().toString().padStart(2, "0")}:${b.endTime.getMinutes().toString().padStart(2, "0")}`;
                                const typeNames = {
                                  meal: "Meal",
                                  short: "Short",
                                  wellness: "Wellness",
                                  praying: "Praying",
                                };
                                const labelName =
                                  typeNames[b.type as keyof typeof typeNames] ||
                                  b.type;

                                if (hasOverbreakForThisType) {
                                  if (acc > lim) {
                                    let exceeded = acc - Math.max(oldAcc, lim);
                                    if (exceeded > 0) {
                                      let allowed =
                                        b.durationMinutes - exceeded;
                                      details.push(
                                        `${labelName} ${start} ~ ${end} [${allowed > 0 ? `${allowed}m within remaining allowed, ` : ""}${Math.round(exceeded)}m exceeded]`,
                                      );
                                    } else {
                                      details.push(
                                        `${labelName} ${start} ~ ${end} [${b.durationMinutes}m]`,
                                      );
                                    }
                                  } else {
                                    details.push(
                                      `${labelName} ${start} ~ ${end} [${b.durationMinutes}m]`,
                                    );
                                  }
                                }
                              });
                              if (details.length > 0) {
                                const totalExceeded = Math.round(
                                  r.mealOverbreak +
                                    r.shortOverbreak +
                                    r.wellnessOverbreak +
                                    r.prayingOverbreak,
                                );
                                occurrences += `  • ${fmtD(r.date)}: ${totalExceeded} minutes exceeded (${details.join(" | ")})\n`;
                              }
                            });
                            reports.push({
                              title:
                                "Standard Overbreak (Meal: 60m, Short: 20m, Wellness: 10m)",
                              totalStr: `${Math.floor(totalOver / 60)}h ${totalOver % 60}m`,
                              occurrences,
                            });
                          }
                        }

                        // Tardiness
                        if (includeTardiness) {
                          const tardyRecords = records.filter(
                            (r) => (r.tardinessMinutes || 0) > 0,
                          );
                          if (tardyRecords.length > 0) {
                            const totalTardiness = tardyRecords.reduce(
                              (acc, r) => acc + (r.tardinessMinutes || 0),
                              0,
                            );
                            let occurrences = tardyRecords
                              .map((r) => {
                                const actualStart = r.actualStartTime
                                  ? `${new Date(r.actualStartTime).getHours().toString().padStart(2, "0")}:${new Date(r.actualStartTime).getMinutes().toString().padStart(2, "0")}`
                                  : "N/A";
                                const shiftLabel = isShiftMismatch(
                                  r.scheduledShift,
                                  r.inferredShift,
                                )
                                  ? `${r.scheduledShift} (Efetivo: ${r.inferredShift})`
                                  : r.scheduledShift ||
                                    r.inferredShift ||
                                    "N/A";
                                return `  • ${fmtD(r.date)}: ${r.tardinessMinutes} minutes (Shift: ${shiftLabel} | Clock In: ${actualStart})`;
                              })
                              .join("\n");
                            occurrences += "\n";
                            reports.push({
                              title: "Tardiness",
                              totalStr: `${Math.floor(totalTardiness / 60)}h ${totalTardiness % 60}m`,
                              occurrences,
                            });
                          }
                        }

                        // Early Leave
                        if (includeEarlyLeave) {
                          const earlyRecords = records.filter(
                            (r) => (r.earlyLeaveMinutes || 0) > 0,
                          );
                          if (earlyRecords.length > 0) {
                            const totalEarly = earlyRecords.reduce(
                              (acc, r) => acc + (r.earlyLeaveMinutes || 0),
                              0,
                            );
                            let occurrences = earlyRecords
                              .map((r) => {
                                const actualEnd = r.actualEndTime
                                  ? `${new Date(r.actualEndTime).getHours().toString().padStart(2, "0")}:${new Date(r.actualEndTime).getMinutes().toString().padStart(2, "0")}`
                                  : "N/A";
                                const shiftLabel = isShiftMismatch(
                                  r.scheduledShift,
                                  r.inferredShift,
                                )
                                  ? `${r.scheduledShift} (Efetivo: ${r.inferredShift})`
                                  : r.scheduledShift ||
                                    r.inferredShift ||
                                    "N/A";
                                return `  • ${fmtD(r.date)}: ${r.earlyLeaveMinutes} minutes (Shift: ${shiftLabel} | Clock Out: ${actualEnd})`;
                              })
                              .join("\n");
                            occurrences += "\n";
                            reports.push({
                              title: "Early Leave",
                              totalStr: `${Math.floor(totalEarly / 60)}h ${totalEarly % 60}m`,
                              occurrences,
                            });
                          }
                        }

                        let subjects = reports.map((r) => r.title);

                        let dateForSubj = "N/A";
                        if (records.length === 1) {
                          const dStr = records[0].date;
                          const parts = dStr.split("-");
                          if (parts.length === 3) {
                            dateForSubj = `${parts[1]}/${parts[2]}/${parts[0]}`;
                          } else {
                            dateForSubj = dStr;
                          }
                        } else if (records.length > 1) {
                          const sorted = [...records].sort((a, b) =>
                            a.date.localeCompare(b.date),
                          );
                          const dt1 = sorted[0].date.split("-");
                          const dt2 = sorted[sorted.length - 1].date.split("-");
                          if (dt1.length === 3 && dt2.length === 3) {
                            dateForSubj = `${dt1[1]}/${dt1[2]}/${dt1[0]} to ${dt2[1]}/${dt2[2]}/${dt2[0]}`;
                          } else {
                            dateForSubj = periodStr;
                          }
                        }

                        const subj = `CNX OPO LMM | LIVE | ${s.employeeName} | ${dateForSubj}`;

                        const firstName = s.employeeName
                          ? s.employeeName.split(" ")[0]
                          : "Team Member";

                        let body = "";
                        if (isIdleOnly) {
                          let mostRecentBreakStart: Date | null = null;
                          let mostRecentBreakEnd: Date | null = null;
                          records.forEach((r) => {
                            if (r.idleDuration > 0) {
                              (r.breaks || []).forEach((b) => {
                                if (b.type === "idle") {
                                  if (
                                    !mostRecentBreakStart ||
                                    b.startTime > mostRecentBreakStart
                                  ) {
                                    mostRecentBreakStart = b.startTime;
                                    mostRecentBreakEnd = b.endTime;
                                  }
                                }
                              });
                            }
                          });

                          let breakTimeStr = "[Date], [Time] until [Time]";
                          if (mostRecentBreakStart && mostRecentBreakEnd) {
                            const pad = (n: number) =>
                              n.toString().padStart(2, "0");
                            breakTimeStr = `${pad(mostRecentBreakStart.getMonth() + 1)}-${pad(mostRecentBreakStart.getDate())}-${mostRecentBreakStart.getFullYear()}, ${pad(mostRecentBreakStart.getHours())}:${pad(mostRecentBreakStart.getMinutes())} until ${pad(mostRecentBreakEnd.getHours())}:${pad(mostRecentBreakEnd.getMinutes())}`;
                          } else if (mostRecentBreakStart) {
                            const pad = (n: number) =>
                              n.toString().padStart(2, "0");
                            breakTimeStr = `${pad(mostRecentBreakStart.getMonth() + 1)}-${pad(mostRecentBreakStart.getDate())}-${mostRecentBreakStart.getFullYear()}, ${pad(mostRecentBreakStart.getHours())}:${pad(mostRecentBreakStart.getMinutes())} until [Time]`;
                          }

                          body = `Hi ${firstName},\n\nI hope you are having a productive day.\nOur real-time monitoring system detected that your status was recently set to "Idle Mode." at ${breakTimeStr}.\n\nAs a reminder, this specific status is not permitted per company policy, as we need to ensure accurate metrics and optimal queue coverage.\nCould you please reply to this message and let me know what caused this status change? Understanding your experience helps us address any technical glitches or workflow difficulties you might be facing.\n \nThank you for your cooperation and dedication.`;
                        } else {
                          body = `Hello ${firstName},\n\nI hope you're doing well.\n\nWhile reviewing your timeline for the period (${periodStr}), I noticed some exceeded times that we need to align on:\n\n`;

                          if (reports.length > 0) {
                            reports.forEach((report) => {
                              body += `Daily Total (${report.title}):\n\n${report.occurrences}\n`;
                            });
                            body += `Could you please check your timeline for these specific times and clarify what happened?\n\n`;
                          } else {
                            body += `Please review your timeline to ensure all activities are correctly logged.\n\n`;
                          }

                          body += `Let me know if you have any questions.\n\nBest regards,`;
                        }

                        let tlEmail = "";
                        if (s.supervisor) {
                          // Find the supervisor in staffInfoData
                          const supMatch = staffInfoData?.find(
                            (sup) =>
                              sup.fullName &&
                              sup.fullName
                                .trim()
                                .normalize("NFD")
                                .replace(/[\u0300-\u036f]/g, "")
                                .toLowerCase() ===
                                s
                                  .supervisor!.trim()
                                  .normalize("NFD")
                                  .replace(/[\u0300-\u036f]/g, "")
                                  .toLowerCase(),
                          );
                          if (supMatch && supMatch.email) {
                            tlEmail = supMatch.email;
                          } else {
                            // Fallback
                            tlEmail = `${s.supervisor
                              .trim()
                              .normalize("NFD")
                              .replace(/[\u0300-\u036f]/g, "")
                              .toLowerCase()
                              .replace(/\s+/g, ".")}@concentrix.com`;
                          }
                        }
                        const ccList = [
                          "sofia.fernandes@concentrix.com",
                          tlEmail,
                        ]
                          .filter((e) => e)
                          .join(",");

                        const mailto = `mailto:${s.email || ""}?cc=${encodeURIComponent(ccList)}&subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
                        window.location.href = mailto;
                      }}
                      className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-indigo-500 hover:text-white transition-colors border border-slate-700 ml-1"
                      title="Send Report via Email"
                    >
                      <Mail size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();

                        const isTardinessOnly =
                          globalTypeFilter === "all" &&
                          globalIncludeTardiness &&
                          !globalIncludeMinorTardiness &&
                          !globalIncludeWc &&
                          !globalIncludeIdle &&
                          !globalIncludeNonMod &&
                          !globalIncludeEarlyLeave &&
                          !globalIncludeShort30Min;
                        const isMinorTardinessOnly =
                          globalTypeFilter === "all" &&
                          globalIncludeMinorTardiness &&
                          !globalIncludeWc &&
                          !globalIncludeIdle &&
                          !globalIncludeNonMod &&
                          !globalIncludeEarlyLeave &&
                          !globalIncludeShort30Min &&
                          !globalIncludeTardiness;
                        const isEarlyLeaveOnly =
                          globalTypeFilter === "all" &&
                          globalIncludeEarlyLeave &&
                          !globalIncludeWc &&
                          !globalIncludeIdle &&
                          !globalIncludeNonMod &&
                          !globalIncludeMinorTardiness &&
                          !globalIncludeShort30Min &&
                          !globalIncludeTardiness;
                        const isShort30MinOnly =
                          globalTypeFilter === "all" &&
                          globalIncludeShort30Min &&
                          !globalIncludeEarlyLeave &&
                          !globalIncludeWc &&
                          !globalIncludeIdle &&
                          !globalIncludeNonMod &&
                          !globalIncludeMinorTardiness &&
                          !globalIncludeTardiness;
                        const isWcOnly =
                          globalTypeFilter === "all" &&
                          globalIncludeWc &&
                          !globalIncludeShort30Min &&
                          !globalIncludeEarlyLeave &&
                          !globalIncludeIdle &&
                          !globalIncludeNonMod &&
                          !globalIncludeMinorTardiness &&
                          !globalIncludeTardiness;
                        const isIdleOnly =
                          globalTypeFilter === "all" &&
                          globalIncludeIdle &&
                          !globalIncludeShort30Min &&
                          !globalIncludeEarlyLeave &&
                          !globalIncludeWc &&
                          !globalIncludeNonMod &&
                          !globalIncludeMinorTardiness &&
                          !globalIncludeTardiness;
                        const isNonModOnly =
                          globalTypeFilter === "all" &&
                          globalIncludeNonMod &&
                          !globalIncludeShort30Min &&
                          !globalIncludeEarlyLeave &&
                          !globalIncludeWc &&
                          !globalIncludeIdle &&
                          !globalIncludeMinorTardiness &&
                          !globalIncludeTardiness;

                        const sanitizedName = s.employeeName
                          .replace(/[^a-z0-9]/gi, "_")
                          .toLowerCase();
                        let periodLabelStr = "";
                        if (view === "today") periodLabelStr = t("filterDay");
                        else if (view === "yesterday")
                          periodLabelStr = t("filterYesterday") || "Yesterday";
                        else if (view === "week")
                          periodLabelStr = t("filterWeek");
                        else if (view === "month")
                          periodLabelStr = t("filterMonth");
                        else periodLabelStr = t("filterAll");

                        const exportedSummary = {
                          ...s,
                          dailyRecords: records,
                          totalWorkMinutes: Math.round(
                            records.reduce(
                              (acc, r) => acc + r.totalWorkTimeMillis / 60000,
                              0,
                            ),
                          ),
                          totalBreakMinutes: Math.round(
                            records.reduce(
                              (acc, r) =>
                                acc +
                                ((r.mealDuration || 0) +
                                  (r.shortDuration || 0) +
                                  (r.wellnessDuration || 0) +
                                  (r.wcDuration || 0) +
                                  (r.prayingDuration || 0) +
                                  (r.idleDuration || 0)),
                              0,
                            ),
                          ),
                          totalOverbreakMinutes: Math.round(
                            records.reduce(
                              (acc, r) => acc + r.totalOverbreak,
                              0,
                            ),
                          ),
                          wcTotalOverbreak: Math.round(
                            records.reduce((acc, r) => acc + r.wcOverbreak, 0),
                          ),
                          totalTardinessMinutes: Math.round(
                            records.reduce(
                              (acc, r) => acc + (r.tardinessMinutes || 0),
                              0,
                            ),
                          ),
                          totalEarlyLeaveMinutes: Math.round(
                            records.reduce(
                              (acc, r) => acc + (r.earlyLeaveMinutes || 0),
                              0,
                            ),
                          ),
                          totalShort30MinRecords: records.reduce(
                            (acc, r) => acc + (r.hasSingleShort30m ? 1 : 0),
                            0,
                          ),
                          totalNonModMinutes: Math.round(
                            records.reduce(
                              (acc, r) => acc + (r.nonModDuration || 0),
                              0,
                            ),
                          ),
                          totalReviewAndAppealMinutes: Math.round(
                            records.reduce(
                              (acc, r) =>
                                acc + (r.reviewAndAppealDuration || 0),
                              0,
                            ),
                          ),
                          totalAwaitingTasksMinutes: Math.round(
                            records.reduce(
                              (acc, r) => acc + (r.awaitingTasksDuration || 0),
                              0,
                            ),
                          ),
                          totalForgotStatusMinutes: Math.round(
                            records.reduce(
                              (acc, r) => acc + (r.forgotStatusDuration || 0),
                              0,
                            ),
                          ),
                          totalAbsences: records.reduce(
                            (acc, r) => acc + (r.isAbsence ? 1 : 0),
                            0,
                          ),
                          wcAlerts: records.reduce(
                            (acc, r) => acc + (r.wcDuration > 10 ? 1 : 0),
                            0,
                          ),
                          idleAlerts: records.reduce(
                            (acc, r) => acc + (r.idleDuration > 0 ? 1 : 0),
                            0,
                          ),
                          wcTotalMinutes: records.reduce(
                            (acc, r) => acc + r.wcDuration,
                            0,
                          ),
                          idleTotalMinutes: records.reduce(
                            (acc, r) => acc + r.idleDuration,
                            0,
                          ),
                        };

                        let typeParts = [];
                        if (onlyExceptions) typeParts.push("Overbreaks");
                        if (includeShort30Min) typeParts.push("30min");
                        if (includeWc) typeParts.push("Organic");
                        if (includeIdle) typeParts.push("Idle");
                        if (filterNm) typeParts.push("Non-Mod");
                        if (filterRa) typeParts.push("R&A");
                        if (filterAt) typeParts.push("A.T");
                        if (includeTardiness) typeParts.push("Tardiness");
                        if (includeMinorTardiness)
                          typeParts.push("Minor Tardiness");
                        if (includeEarlyLeave) typeParts.push("Early Leave");
                        if (includeCheck) typeParts.push("Check");
                        if (includeFaltas) typeParts.push("Absences");

                        let statusFiltersText =
                          typeParts.length > 0
                            ? `Status info: ${typeParts.join(", ")}`
                            : undefined;

                        exportToPDF(
                          [exportedSummary],
                          `${s.employeeName} - ${t("agentReport")}`,
                          `Report_${sanitizedName}`,
                          {
                            showRealTime: showRealTime,
                            isTardiness: includeTardiness,
                            isMinorTardiness: includeMinorTardiness,
                            isEarlyLeave: includeEarlyLeave,
                            isAbsences: includeFaltas,
                            showCheck: includeCheck,
                            isShort30Min: includeShort30Min,
                            isWc: includeWc,
                            isIdle: includeIdle,
                            isNonMod: filterNm,
                            isRa: filterRa,
                            isAt: filterAt,
                            isOverbreaks: onlyExceptions,
                            isAgentDetail:
                              includeIdle ||
                              includeWc ||
                              includeShort30Min ||
                              filterNm ||
                              filterRa ||
                              filterAt ||
                              onlyExceptions ||
                              !(
                                includeTardiness ||
                                includeMinorTardiness ||
                                includeEarlyLeave ||
                                includeCheck ||
                                includeFaltas
                              ),
                            showAllTimeline: typeParts.length === 0,
                            statusFiltersText,
                            periodFilter: initialFilter,
                            lang: t("pdfAgentCount") === "Agents" ? "en" : "pt",
                            teamProductiveMinutes: teamProductiveMinutes,
                            teamNonModMinutes: teamNonModMinutes,
                            showBPO,
                            allSummaries,
                            latestDate,
                          },
                        );
                      }}
                      className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-rose-500 hover:text-white transition-colors border border-slate-700 ml-1"
                      title={t("exportPdf")}
                    >
                      <FileDown size={16} />
                    </button>
                  </div>
                  {s.email && (
                    <p className="text-slate-400 text-xs mt-0.5">{s.email}</p>
                  )}
                  {/* */}
                  {(() => {
                    const overrideStatus = getAbsenceStatusText(
                      s,
                      allSummaries,
                      records,
                      latestDate,
                    );
                    const schedShifts = Array.from(
                      new Set(
                        records
                          .map((r) => r.inferredShift || r.scheduledShift)
                          .filter(Boolean) as string[],
                      ),
                    );
                    const realSchedShifts = schedShifts.filter(
                      (sh) => sh.toLowerCase() !== "off",
                    );
                    let dispShift = s.shift;
                    if (realSchedShifts.length === 1) {
                      dispShift = realSchedShifts[0];
                    } else if (realSchedShifts.length > 1) {
                      dispShift = "Vários Horários";
                    } else if (
                      schedShifts.length > 0 &&
                      !isLeaveShift(schedShifts[0])
                    ) {
                      dispShift = schedShifts[0];
                    } else {
                      dispShift = s.shift;
                    }

                    const shiftDiffers = records.some((r) =>
                      isShiftMismatch(r.scheduledShift, r.inferredShift),
                    );

                    return (s.role &&
                      !["OS", "CSR"].includes(s.role.toUpperCase())) ||
                      s.lob ||
                      s.language ||
                      dispShift ||
                      s.supervisor ||
                      overrideStatus ? (
                      <div className="flex flex-col gap-1 mt-2">
                        <div className="flex flex-wrap gap-1">
                          {s.role &&
                            !["OS", "CSR"].includes(s.role.toUpperCase()) && (
                              <span className="bg-slate-700 text-slate-300 border border-slate-500 text-[9px] px-1.5 py-0.5 rounded font-black tracking-widest">
                                {s.role}
                              </span>
                            )}
                          {s.lob && (
                            <span className="bg-blue-50/10 text-blue-300 border border-blue-500/30 text-[9px] px-1.5 py-0.5 rounded font-black tracking-widest">
                              {formatLOB(s.lob)}
                            </span>
                          )}
                          {s.language && (
                            <span className="bg-purple-50/10 text-purple-300 border border-purple-500/30 text-[9px] px-1.5 py-0.5 rounded font-black tracking-widest">
                              {s.language}
                            </span>
                          )}
                          {dispShift && !isLeaveShift(dispShift) && (
                            <span
                              className={`border text-[9px] px-1.5 py-0.5 rounded font-black tracking-widest ${shiftDiffers ? "bg-amber-500/20 text-amber-300 border-amber-500/50" : "bg-emerald-50/10 text-emerald-300 border-emerald-500/30"}`}
                            >
                              {dispShift}{" "}
                              {shiftDiffers ? (
                                <span className="text-amber-300 font-bold ml-1">
                                  (CHECK)
                                </span>
                              ) : (
                                <span className="text-emerald-300 font-bold ml-1">
                                  ✔️
                                </span>
                              )}
                            </span>
                          )}
                          {s.supervisor && (
                            <span className="bg-slate-800 text-slate-300 border border-slate-600 text-[9px] px-1.5 py-0.5 rounded font-bold">
                              TL: {s.supervisor}
                            </span>
                          )}
                        </div>
                        {overrideStatus && (
                          <div className="mt-0.5">
                            <span
                              className={`text-[10px] font-black px-1.5 py-0.5 rounded tracking-widest ${overrideStatus.isOffboarded ? "bg-slate-800 text-slate-200 border-slate-600 border" : overrideStatus.isActive ? "bg-amber-500/20 text-amber-300 border-amber-500/50 border" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 border"}`}
                            >
                              {overrideStatus.text}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : null;
                  })()}
                  <div className="flex items-center gap-3 mt-2">
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em]">
                      {t("auditLogComplete")}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-3 border-t border-slate-800">
              <div className="flex flex-col w-full gap-2">
                <div className="flex flex-wrap bg-slate-800 rounded-md p-1 border border-slate-700 w-full gap-1">
                  {(["today", "yesterday", "week", "month"] as const)
                    .filter((v) => {
                      if (v === "today")
                        return availableFilters.includes("day");
                      if (v === "month") return true; // ALways allow Current Month
                      return availableFilters.includes(v);
                    })
                    .map((v) => (
                      <button
                        key={v}
                        onClick={() => setView(v)}
                        className={`flex-1 min-w-[60px] px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider transition-colors flex justify-center items-center gap-1.5 ${view === v ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white hover:bg-slate-700"}`}
                      >
                        {v === "today"
                          ? t("filterDay")
                          : v === "yesterday"
                            ? t("filterYesterday")
                            : v === "week"
                              ? t("filterWeek")
                              : t("filterMonth")}
                      </button>
                    ))}
                </div>

                <div className="flex flex-wrap bg-slate-800 rounded-md p-1 border border-slate-700 w-full gap-1 justify-center">
                  {hasExceptionsData && (
                    <button
                      onClick={() => setOnlyExceptions(!onlyExceptions)}
                      className={`flex-auto px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider transition-colors min-w-fit ${onlyExceptions ? "bg-rose-500 text-white shadow-sm" : "text-slate-400 hover:bg-slate-700 hover:text-slate-300"}`}
                    >
                      {t("exceptions")}
                    </button>
                  )}
                  {hasOrganicData && (
                    <button
                      onClick={() => setIncludeWc(!includeWc)}
                      className={`flex-auto px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider transition-colors min-w-fit ${includeWc ? "bg-amber-500 text-white shadow-sm" : "text-slate-400 hover:bg-slate-700 hover:text-slate-300"}`}
                    >
                      Organic
                    </button>
                  )}
                  {hasNonModData && (
                    <button
                      onClick={() => setFilterNm(!filterNm)}
                      className={`flex-auto px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider transition-colors min-w-fit ${filterNm ? "bg-teal-500 text-white shadow-sm" : "text-slate-400 hover:bg-slate-700 hover:text-slate-300"}`}
                    >
                      NON-MOD
                    </button>
                  )}
                  {hasTardinessData && (
                    <button
                      onClick={() => setIncludeTardiness(!includeTardiness)}
                      className={`flex-auto px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider transition-colors min-w-fit ${includeTardiness ? "bg-orange-500 text-white shadow-sm" : "text-slate-400 hover:bg-slate-700 hover:text-slate-300"}`}
                    >
                      TARDINESS
                    </button>
                  )}
                  {hasEarlyLeaveData && (
                    <button
                      onClick={() => setIncludeEarlyLeave(!includeEarlyLeave)}
                      className={`flex-auto px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider transition-colors min-w-fit ${includeEarlyLeave ? "bg-orange-500 text-white shadow-sm" : "text-slate-400 hover:bg-slate-700 hover:text-slate-300"}`}
                    >
                      EARLY LEAVE
                    </button>
                  )}
                  {hasIdleData && (
                    <button
                      onClick={() => setIncludeIdle(!includeIdle)}
                      className={`flex-auto px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider transition-colors min-w-fit ${includeIdle ? "bg-indigo-500 text-white shadow-sm" : "text-slate-400 hover:bg-slate-700 hover:text-slate-300"}`}
                    >
                      IDLE
                    </button>
                  )}
                  {false && hasAbsenceData && (
                    <button
                      onClick={() => setIncludeFaltas(!includeFaltas)}
                      className={`flex-auto px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider transition-colors min-w-fit ${includeFaltas ? "bg-rose-600 text-white shadow-sm" : "text-slate-400 hover:bg-slate-700 hover:text-slate-300"}`}
                    >
                      {lang === "pt" ? "FALTAS" : "ABSENCES"}
                    </button>
                  )}
                  {hasCheckData && (
                    <button
                      onClick={() => setIncludeCheck(!includeCheck)}
                      className={`flex-auto px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider transition-colors min-w-fit ${includeCheck ? "bg-amber-500 text-white shadow-sm" : "text-slate-400 hover:bg-slate-700 hover:text-slate-300"}`}
                    >
                      CHECK
                    </button>
                  )}
                  {isNmRaAtOnlyLocal ? (
                    <div
                      className={`flex-auto px-1.5 py-0.5 flex items-center justify-center gap-1 bg-slate-700/50 rounded border border-slate-600/50 min-w-fit ${totalPeriodNmRaAt === 0 ? "opacity-50" : ""}`}
                    >
                      <span className="text-[8.5px] font-bold tracking-widest text-slate-400 uppercase">
                        {lang === "pt" ? "TEMPO TOTAL" : "TOTAL TIME"}
                      </span>
                      <span className="text-[9px] font-black text-indigo-400">
                        {Math.floor(totalPeriodNmRaAt / 60)}h{" "}
                        {totalPeriodNmRaAt % 60}m
                      </span>
                    </div>
                  ) : (
                    <div
                      className={`flex-auto px-1.5 py-0.5 flex items-center justify-center gap-1 bg-slate-700/50 rounded border border-slate-600/50 min-w-fit ${totalPeriodOverbreak === 0 ? "opacity-50" : ""}`}
                    >
                      <span className="text-[8.5px] font-bold tracking-widest text-slate-400 uppercase">
                        TOTAL OVERBREAK
                      </span>
                      <span className="text-[9px] font-black text-rose-400">
                        +{totalPeriodOverbreak}m
                      </span>
                    </div>
                  )}
                </div>
                {isWcOnly && (
                  <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50 w-full sm:w-auto mt-2 sm:mt-0 shadow-inner">
                    <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                      {lang === "pt"
                        ? "TEMPO TOTAL (ORGANIC)"
                        : "TOTAL TIME (ORGANIC)"}
                    </span>
                    <span className="text-sm font-black text-amber-500">
                      {Math.floor(totalPeriodOverbreak / 60)}h{" "}
                      {totalPeriodOverbreak % 60}m
                    </span>
                  </div>
                )}
                {isIdleOnly && (
                  <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50 w-full sm:w-auto mt-2 sm:mt-0 shadow-inner">
                    <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                      {lang === "pt"
                        ? "TEMPO TOTAL (IDLE)"
                        : "TOTAL TIME (IDLE)"}
                    </span>
                    <span className="text-sm font-black text-rose-500">
                      {Math.floor(totalPeriodOverbreak / 60)}h{" "}
                      {totalPeriodOverbreak % 60}m
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>
      </div>
      <div className="flex-1 w-full overflow-y-auto">
        <div className="p-6 md:p-8">
          <div className="space-y-6">
            {records.length > 0 ? (
              records.map((day, idx) => (
                <DayRecordCard
                  key={`${day.date}-${idx}`}
                  record={day}
                  isWcOnly={isWcOnly}
                  isIdleOnly={isIdleOnly}
                  isTardinessOnly={isTardinessOnly}
                  isMinorTardinessOnly={isMinorTardinessOnly}
                  filterNm={filterNm}
                  filterRa={filterRa}
                  filterAt={filterAt}
                  includeWc={includeWc}
                  includeIdle={includeIdle}
                  includeTardiness={includeTardiness}
                  includeMinorTardiness={includeMinorTardiness}
                  includeEarlyLeave={includeEarlyLeave}
                  includeCheck={includeCheck}
                  globalFilterMajorOverbreaks={globalFilterMajorOverbreaks}
                  onlyExceptions={onlyExceptions}
                />
              ))
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs italic">
                  {t("noRecords")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const DayRecordCard: React.FC<{
  record: EmployeeDayRecord;
  isWcOnly?: boolean;
  isIdleOnly?: boolean;
  isTardinessOnly?: boolean;
  isMinorTardinessOnly?: boolean;
  filterNm?: boolean;
  filterRa?: boolean;
  filterAt?: boolean;
  includeWc?: boolean;
  includeIdle?: boolean;
  includeTardiness?: boolean;
  includeMinorTardiness?: boolean;
  includeEarlyLeave?: boolean;
  includeCheck?: boolean;
  globalFilterMajorOverbreaks: boolean;
  onlyExceptions?: boolean;
}> = ({
  record,
  isWcOnly,
  isIdleOnly,
  isTardinessOnly,
  isMinorTardinessOnly,
  filterNm,
  filterRa,
  filterAt,
  includeWc,
  includeIdle,
  includeTardiness,
  includeMinorTardiness,
  includeEarlyLeave,
  includeCheck,
  globalFilterMajorOverbreaks,
  onlyExceptions,
}) => {
  const { t, lang } = useLanguage();
  if (record.isAbsence) {
    return (
      <div className="bg-red-50/50 border-2 border-red-200 rounded-2xl p-6 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-red-600 text-white px-3 py-1.5 rounded-lg font-black text-xs uppercase tracking-widest shadow-md">
              FALTA
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 uppercase tracking-tight">
                {format(
                  new Date(record.date + "T12:00:00"),
                  "EEEE, dd/MM/yyyy",
                )}
              </p>
              <p className="text-[10px] text-red-600 font-bold uppercase tracking-wider">
                Ausência não justificada (Escalado: {record.scheduledShift})
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (
    (record.isOFF ||
      record.isLOA ||
      record.isPTO ||
      record.isSL ||
      record.isSUSPP ||
      record.isATT) &&
    record.actualStartTime == null &&
    record.totalWorkTimeMillis < 60000
  ) {
    let typeLabel = record.isATT
      ? "ATT / SAÍDA"
      : record.isLOA
        ? "LICENÇA"
        : record.isPTO
          ? "FÉRIAS"
          : record.isSL
            ? "ATESTADO"
            : record.isSUSPP
              ? "SUSPENSÃO"
              : "OFF";

    if (record.isPTO) {
      const shiftUpper = String(
        record.scheduledShift || record.inferredShift || "",
      ).toUpperCase();
      if (shiftUpper.includes("MAR")) {
        typeLabel = "MAR";
      }
    }
    return (
      <div className="flex flex-col p-4 border rounded-xl shadow-sm bg-white border-slate-100">
        <div className="flex items-center gap-3">
          <span className="text-base font-black tracking-tight text-slate-900">
            {format(new Date(record.date + "T12:00:00"), "dd/MM/yyyy")}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-blue-50 text-blue-700 border-blue-100">
            {typeLabel}
          </span>
        </div>
      </div>
    );
  }

  const isWcAlert = includeWc || isWcOnly ? record.wcDuration > 10 : false;
  const hasAnyOverbreak =
    record.mealOverbreak > 0 ||
    record.shortOverbreak > 0 ||
    record.wellnessOverbreak > 0 ||
    record.prayingOverbreak > 0;

  // Check if any local filter is active
  const anyLocalFilterActive =
    onlyExceptions ||
    includeWc ||
    includeIdle ||
    filterNm ||
    includeTardiness ||
    includeEarlyLeave ||
    includeCheck;

  let isHighlighted = false;
  let borderColor = "border-slate-100";

  if (anyLocalFilterActive) {
    if (onlyExceptions && hasAnyOverbreak) {
      isHighlighted = true;
      borderColor = "border-rose-200 ring-rose-50/50 ring-2";
    } else if (
      filterNm &&
      record.breaks.some(
        (b) => b.type === "non_moderating" || b.type === "forgot_status",
      )
    ) {
      isHighlighted = true;
      borderColor = "border-teal-200 ring-teal-50/50 ring-2";
    } else if (includeWc && record.wcDuration > 0) {
      isHighlighted = true;
      borderColor = "border-amber-200 ring-amber-50/50 ring-2";
    } else if (includeIdle && record.idleDuration > 0) {
      isHighlighted = true;
      borderColor = "border-rose-200 ring-rose-50/50 ring-2";
    } else if (includeTardiness) {
      if (
        includeMinorTardiness &&
        (record.tardinessMinutes || 0) > 0 &&
        (record.tardinessMinutes || 0) < 15
      ) {
        isHighlighted = true;
        borderColor = "border-orange-200 ring-orange-50/50 ring-2";
      } else if (
        !includeMinorTardiness &&
        (record.tardinessMinutes || 0) >= 15
      ) {
        isHighlighted = true;
        borderColor = "border-orange-200 ring-orange-50/50 ring-2";
      }
    } else if (
      includeCheck &&
      isShiftMismatch(record.scheduledShift, record.inferredShift)
    ) {
      isHighlighted = true;
      borderColor = "border-amber-200 ring-amber-50/50 ring-2";
    } else if (includeEarlyLeave && (record.earlyLeaveMinutes || 0) > 0) {
      isHighlighted = true;
      borderColor = "border-orange-200 ring-orange-50/50 ring-2";
    }
  } else {
    // Fallback for global or no filters
    if (isWcOnly && record.wcDuration > 0) {
      isHighlighted = true;
      borderColor = "border-amber-200 ring-amber-50/50 ring-2";
    } else if (isIdleOnly && record.idleDuration > 0) {
      isHighlighted = true;
      borderColor = "border-rose-200 ring-rose-50/50 ring-2";
    } else if (
      isMinorTardinessOnly &&
      (((record.tardinessMinutes || 0) > 0 &&
        (record.tardinessMinutes || 0) < 15) ||
        (record.earlyLeaveMinutes || 0) > 0)
    ) {
      isHighlighted = true;
      borderColor = "border-orange-200 ring-orange-50/50 ring-2";
    } else if (
      isTardinessOnly &&
      ((record.tardinessMinutes || 0) >= 15 ||
        (record.earlyLeaveMinutes || 0) > 0)
    ) {
      isHighlighted = true;
      borderColor = "border-orange-200 ring-orange-50/50 ring-2";
    } else if (hasAnyOverbreak) {
      isHighlighted = true;
      borderColor = "border-rose-200 ring-rose-50/50 ring-2";
    }
  }

  // Calculate cumulative sums to correctly identify which breaks contribute to overbreaks
  const typeSums: Record<string, number> = {};

  // First, sort by start time so cumulative sum works chronologically
  const sortedBreaks = [...record.breaks].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );

  const taggedBreaks = sortedBreaks.map((b) => {
    const prevSum = typeSums[b.type] || 0;
    const newSum = prevSum + b.durationMinutes;
    typeSums[b.type] = newSum;

    let idealTime = 0;
    if (b.type === "meal") idealTime = 60;
    else if (b.type === "short") idealTime = 30;
    else if (b.type === "wellness" || b.type === "praying") idealTime = 15;
    else if (b.type === "wc") idealTime = 10;

    let isOverbreak = false;
    let excessTime = 0;
    let usedIdeal = 0;

    if (b.type === "idle" || b.type === "forgot_status") {
      isOverbreak = false;
      excessTime = b.durationMinutes;
      usedIdeal = 0;
    } else if (idealTime > 0) {
      if (newSum > idealTime) {
        const excess = Math.min(b.durationMinutes, newSum - idealTime);
        if (b.type === "wc" || b.type === "praying" || b.type === "wellness") {
          isOverbreak = true;
        } else if (b.type === "short") {
          if (record.hasSingleShort30m && excess <= 2) {
            isOverbreak = false;
          } else {
            if (!globalFilterMajorOverbreaks || excess > 2) isOverbreak = true;
          }
        } else {
          if (!globalFilterMajorOverbreaks || excess > 2) isOverbreak = true;
        }
        if (isOverbreak) {
          excessTime = excess;
          usedIdeal = b.durationMinutes - excess;
        }
      }
    }

    return {
      ...b,
      isOverbreak,
      allowed: usedIdeal,
      excess: excessTime,
      total: b.durationMinutes,
    };
  });

  // Find the first active work session (moderating, meeting, training, non-moderating)
  const firstWorkSession = taggedBreaks.find(
    (b) =>
      b.type === "moderating" ||
      b.type === "non_moderating" ||
      b.type === "meeting" ||
      b.type === "training"
  );
  const firstWorkStartTime = firstWorkSession ? firstWorkSession.startTime.getTime() : null;

  // Filter breaks to only show WC if isWcOnly is true
  const visibleBreaks = taggedBreaks.filter((b) => {
    // Hide offline sessions representing transition from one day to next (before the first active work status)
    if (
      b.type === "offline" &&
      firstWorkStartTime !== null &&
      b.endTime.getTime() <= firstWorkStartTime
    ) {
      return false;
    }

    // If NO filter is selected, show EVERYTHING
    if (!onlyExceptions && !includeWc && !includeIdle && !filterNm) {
      return true;
    }

    // Otherwise, show if it matches ANY selected filter
    if (filterNm && b.type === "non_moderating") return true;
    if (
      filterRa &&
      b.type === "non_moderating" &&
      (b.subType?.toLowerCase()?.includes("review") ||
        b.subType?.toLowerCase()?.includes("appeal"))
    )
      return true;
    if (
      filterAt &&
      b.type === "non_moderating" &&
      b.subType?.toLowerCase()?.includes("awaiting tasks")
    )
      return true;
    if (includeWc && b.type === "wc") return true;
    if (includeIdle && b.type === "idle") return true;
    if (onlyExceptions) {
      // If of the same type there's any overbreak on this day, show this break too to provide context
      const hasOverbreakOfSameType = taggedBreaks.some(
        (tb) => tb.type === b.type && tb.isOverbreak,
      );
      if (hasOverbreakOfSameType) return true;
    }
    if (
      b.type === "offline" &&
      !onlyExceptions &&
      !includeWc &&
      !includeIdle &&
      !filterNm
    )
      return true; // Just in case, already covered above

    return false;
  });

  const nmTotalDuration = typeSums["non_moderating"] || 0;

  let textColor = "text-slate-900";
  if (isHighlighted) {
    if (borderColor.includes("teal")) textColor = "text-teal-900";
    else if (borderColor.includes("amber")) textColor = "text-amber-900";
    else if (borderColor.includes("rose")) textColor = "text-rose-900";
    else if (borderColor.includes("orange")) textColor = "text-orange-900";
  }

  return (
    <div
      className={`flex flex-col p-4 border rounded-xl shadow-sm transition-all relative overflow-hidden bg-white ${borderColor}`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
        <div className="flex items-center gap-3">
          <span className={`text-base font-black tracking-tight ${textColor}`}>
            {format(new Date(record.date + "T12:00:00"), "dd/MM/yyyy")}
          </span>
          {(record.scheduledShift || record.inferredShift) && (
            <div className="flex gap-2 items-center">
              {isShiftMismatch(record.scheduledShift, record.inferredShift) ? (
                <>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-blue-50 text-blue-700 border-blue-100">
                    {record.scheduledShift}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-amber-100 text-amber-800 border-amber-300">
                    {record.inferredShift}
                  </span>
                </>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-blue-50 text-blue-700 border-blue-100">
                  {record.scheduledShift || record.inferredShift}
                </span>
              )}
            </div>
          )}
          {(record.mealOverbreak > 0 ||
            record.shortOverbreak > 0 ||
            record.wellnessOverbreak > 0 ||
            record.prayingOverbreak > 0) &&
          !filterNm &&
          !filterRa &&
          !filterAt ? (
            <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-black uppercase tracking-wider">
              Overbreak
            </span>
          ) : isWcAlert && !filterNm && !filterRa && !filterAt ? (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-black uppercase tracking-wider">
              Organic
            </span>
          ) : null}
        </div>
      </div>

      {record.hasMealWithoutShortAnomaly && !isWcOnly && !filterNm && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="text-amber-500 shrink-0 w-4 h-4 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-800">
              {lang === "pt"
                ? "Possível Junção de Pausas"
                : "Possible Combined Breaks"}
            </p>
            <p className="text-[10px] text-amber-700/80">
              {lang === "pt"
                ? "Meal break excedeu 1h15m, porém não há registro de Short Break logo após. Overbreak não deduzido, assumido como meal + short."
                : "Meal break exceeded 1h15m, but there was no Short Break registered right after. Overbreak was not deducted, assumed as meal + short."}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1.5 relative z-10 w-full mb-2 border-b border-slate-100 pb-2">
        {filterNm ? (
          <div
            title={`Total: ${Math.floor(nmTotalDuration / 60)}h ${nmTotalDuration % 60}m`}
          >
            <p className="text-[10px] text-teal-600 uppercase font-bold tracking-widest leading-none mb-0.5">
              Non-Moderating
            </p>
            <div className="flex items-center gap-1 font-black text-sm">
              <span className="text-teal-700">
                {Math.floor(nmTotalDuration / 60)}h {nmTotalDuration % 60}m
              </span>
            </div>
          </div>
        ) : (
          <>
            {!isWcOnly && (
              <>
                <div
                  title={`Total: ${Math.floor(record.mealDuration / 60)}h ${record.mealDuration % 60}m`}
                >
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none mb-0.5">
                    Meal
                  </p>
                  <div className="flex items-center gap-1 font-black text-sm">
                    <span
                      className={
                        record.mealOverbreak > 0
                          ? "text-amber-500"
                          : "text-emerald-500"
                      }
                    >
                      {record.mealDuration}m
                    </span>
                    {record.mealOverbreak > 0 && (
                      <span className="text-[10px] text-rose-500 font-extrabold ml-0.5">
                        (+{record.mealOverbreak}m)
                      </span>
                    )}
                  </div>
                </div>
                <div
                  title={`Total: ${Math.floor(record.shortDuration / 60)}h ${record.shortDuration % 60}m`}
                >
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none mb-0.5">
                    Short
                  </p>
                  <div className="flex items-center gap-1 font-black text-sm">
                    <span
                      className={
                        record.shortOverbreak > 0
                          ? "text-amber-500"
                          : "text-emerald-500"
                      }
                    >
                      {record.shortDuration}m
                    </span>
                    {record.shortOverbreak > 0 && (
                      <span className="text-[10px] text-rose-500 font-extrabold ml-0.5">
                        (+{record.shortOverbreak}m)
                      </span>
                    )}
                  </div>
                </div>
                <div
                  title={`Total: ${Math.floor(record.wellnessDuration / 60)}h ${record.wellnessDuration % 60}m`}
                >
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none mb-0.5">
                    Well.
                  </p>
                  <div className="flex items-center gap-1 font-black text-sm">
                    <span
                      className={
                        record.wellnessOverbreak > 0
                          ? "text-amber-500"
                          : "text-emerald-500"
                      }
                    >
                      {record.wellnessDuration}m
                    </span>
                    {record.wellnessOverbreak > 0 && (
                      <span className="text-[10px] text-rose-500 font-extrabold ml-0.5">
                        (+{record.wellnessOverbreak}m)
                      </span>
                    )}
                  </div>
                </div>
                {record.prayingDuration > 0 && (
                  <div
                    title={`Total: ${Math.floor(record.prayingDuration / 60)}h ${record.prayingDuration % 60}m`}
                  >
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none mb-0.5">
                      Pray.
                    </p>
                    <div className="flex items-center gap-1 font-black text-sm">
                      <span
                        className={
                          record.prayingOverbreak > 0
                            ? "text-amber-500"
                            : "text-emerald-500"
                        }
                      >
                        {record.prayingDuration}m
                      </span>
                      {record.prayingOverbreak > 0 && (
                        <span className="text-[10px] text-rose-500 font-extrabold ml-0.5">
                          (+{record.prayingOverbreak}m)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {record.wcDuration > 0 && (
              <div
                title={`Total: ${Math.floor(record.wcDuration / 60)}h ${record.wcDuration % 60}m`}
              >
                <p className="text-[10px] text-amber-500 uppercase font-bold tracking-widest leading-none mb-0.5">
                  Organic
                </p>
                <div className="flex items-center gap-1 font-black text-sm">
                  {isWcOnly ? (
                    <span className="text-amber-600">
                      {Math.floor(record.wcDuration / 60)}h{" "}
                      {record.wcDuration % 60}m
                    </span>
                  ) : (
                    <>
                      <span
                        className={
                          isWcAlert ? "text-amber-600" : "text-emerald-500"
                        }
                      >
                        {record.wcDuration}m
                      </span>
                      {record.wcOverbreak > 0 && (
                        <span className="text-[10px] text-rose-500 font-extrabold ml-0.5">
                          (+{record.wcOverbreak}m)
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {!isWcOnly && record.idleDuration > 0 && (
              <div
                title={`Total: ${Math.floor(record.idleDuration / 60)}h ${record.idleDuration % 60}m`}
              >
                <p className="text-[10px] text-red-400 uppercase font-bold tracking-widest leading-none mb-0.5">
                  IDLE
                </p>
                <div className="flex items-center gap-1 font-black text-sm">
                  <span className="text-red-500">+{record.idleDuration}m</span>
                </div>
              </div>
            )}

            {!isWcOnly && (record.tardinessMinutes || 0) > 0 && (
              <div title={`Tardiness: ${record.tardinessMinutes || 0}m`}>
                <p className="text-[10px] text-orange-400 uppercase font-bold tracking-widest leading-none mb-0.5">
                  TARDINESS
                </p>
                <div className="flex flex-col">
                  <span className="font-black text-sm text-orange-600">
                    +{record.tardinessMinutes}m
                  </span>
                  {record.actualStartTime && (
                    <span className="text-[9px] text-orange-500/80 font-bold">
                      {format(record.actualStartTime, "HH:mm")}
                    </span>
                  )}
                </div>
              </div>
            )}

            {!isWcOnly && (record.earlyLeaveMinutes || 0) > 0 && (
              <div title={`Early Leave: ${record.earlyLeaveMinutes || 0}m`}>
                <p className="text-[10px] text-orange-400 uppercase font-bold tracking-widest leading-none mb-0.5">
                  EARLY LEAVE
                </p>
                <div className="flex flex-col">
                  <span className="font-black text-sm text-orange-600">
                    +{record.earlyLeaveMinutes}m
                  </span>
                  {record.actualEndTime && (
                    <span className="text-[9px] text-orange-500/80 font-bold">
                      {format(record.actualEndTime, "HH:mm")}
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {visibleBreaks.length > 0 && (
        <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
            {lang === "pt" ? "Timeline Detalhada" : "Detailed Timeline"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visibleBreaks.map((b, i) => {
              const isOverbreak = b.isOverbreak;

              const lowerStatus =
                `${b.rawStatus || ""} ${b.subType || ""}`.toLowerCase();
              let dotColor = "bg-slate-400";
              let textColor = isOverbreak ? "text-rose-700" : "text-slate-500";

              if (lowerStatus.includes("meeting") || b.type === "meeting") {
                dotColor = "bg-yellow-400";
                if (!isOverbreak) textColor = "text-yellow-700";
              } else if (
                lowerStatus.includes("training") ||
                lowerStatus.includes("treinamento") ||
                b.type === "training"
              ) {
                dotColor = "bg-orange-500";
                if (!isOverbreak) textColor = "text-orange-700";
              } else if (
                lowerStatus.includes("non") ||
                lowerStatus.includes("n.m") ||
                b.type === "non_moderating"
              ) {
                dotColor = "bg-teal-500";
                if (!isOverbreak) textColor = "text-teal-700";
              } else if (b.type === "meal") {
                dotColor = "bg-blue-400";
                if (!isOverbreak) textColor = "text-blue-700";
              } else if (b.type === "wellness") {
                dotColor = "bg-indigo-400";
                if (!isOverbreak) textColor = "text-indigo-700";
              } else if (b.type === "praying") {
                dotColor = "bg-purple-400";
                if (!isOverbreak) textColor = "text-purple-700";
              } else if (b.type === "short" || lowerStatus.includes("rest")) {
                dotColor = "bg-emerald-400";
                if (!isOverbreak) textColor = "text-emerald-700";
              } else if (b.type === "wc") {
                dotColor = "bg-amber-400";
                if (!isOverbreak) textColor = "text-amber-700";
              } else if (b.type === "idle") {
                dotColor = "bg-red-500";
                if (!isOverbreak) textColor = "text-red-700";
              } else if (b.type === "offline") {
                dotColor = "bg-slate-800";
                if (!isOverbreak) textColor = "text-slate-700";
              } else if (b.type === "forgot_status") {
                dotColor = "bg-slate-700";
              }

              let label = b.type === "other" ? b.rawStatus || b.type : b.type;
              if (b.type === "forgot_status") label = "IDLE";
              if (b.type === "offline") label = "offline";
              if (b.type === "non_moderating" && b.subType) {
                label = b.subType;
              }

              const dur = b.durationMinutes;
              const durFormat =
                dur > 59
                  ? `${Math.floor(dur / 60)}h${dur % 60 > 0 ? ` ${dur % 60}m` : ""}`
                  : `${dur}m`;

              return (
                <div
                  key={i}
                  className={`flex items-center px-1.5 py-0.5 rounded text-[10px] border gap-1.5 shadow-sm ${isOverbreak ? (b.type === "wc" ? "bg-amber-50 border-amber-200" : "bg-rose-50 border-rose-200") : "bg-white border-slate-200"}`}
                >
                  <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                  <span
                    className={`font-bold ${isOverbreak ? (b.type === "wc" ? "text-amber-900" : "text-rose-900") : "text-slate-700"}`}
                  >
                    {format(b.startTime, "HH:mm")}
                    <span
                      className={`font-normal mx-0.5 ${isOverbreak ? (b.type === "wc" ? "text-amber-400" : "text-rose-400") : "text-slate-400"}`}
                    >
                      {lang === "pt" ? "a" : "to"}
                    </span>
                    {format(b.endTime, "HH:mm")}
                  </span>
                  <span
                    className={`text-[9px] font-black uppercase ml-1 flex-1 ${textColor}`}
                    title={b.rawStatus}
                  >
                    {label}
                  </span>
                  <div className="flex items-center gap-1 justify-end">
                    {isOverbreak ? (
                      <>
                        {b.allowed > 0 && (
                          <span className="font-black text-emerald-600 bg-emerald-50 px-1 rounded shadow-sm">
                            {b.allowed}m
                          </span>
                        )}
                        {b.excess > 0 && (
                          <span
                            className={`font-black ${b.type === "wc" ? "text-orange-600 bg-orange-50" : "text-amber-600 bg-amber-50"} px-1 rounded shadow-sm`}
                          >
                            +{b.excess}m
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="font-black text-slate-700 text-right">
                        {durFormat}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {visibleBreaks.some(
        (b) => b.originalRemark && b.originalRemark.trim().length > 0,
      ) && (
        <div className="mt-4 bg-slate-50/70 rounded-xl p-3 border border-slate-100">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">
            {t("agentNotes")}
          </p>
          <div className="space-y-2.5">
            {visibleBreaks
              .filter(
                (b) => b.originalRemark && b.originalRemark.trim().length > 0,
              )
              .map((b, idx) => {
                let bgClass = "bg-emerald-50/80";
                let borderClass = "border-emerald-200";
                let textClass = "text-emerald-700";
                let nameClass = "text-emerald-800";
                let fillClass = "bg-emerald-100/50";

                const lowerStatus =
                  `${b.originalStatus || ""} ${b.originalSubStatus || ""}`.toLowerCase();
                const isOvb = b.isOverbreak;

                if (lowerStatus.includes("meeting") || b.type === "meeting") {
                  bgClass = "bg-yellow-50/80";
                  borderClass = "border-yellow-200";
                  textClass = "text-yellow-700";
                  nameClass = "text-yellow-800";
                  fillClass = "bg-yellow-100/50";
                } else if (
                  lowerStatus.includes("training") ||
                  lowerStatus.includes("treinamento") ||
                  b.type === "training"
                ) {
                  bgClass = "bg-orange-50/80";
                  borderClass = "border-orange-200";
                  textClass = "text-orange-700";
                  nameClass = "text-orange-800";
                  fillClass = "bg-orange-100/50";
                } else if (
                  lowerStatus.includes("non") ||
                  lowerStatus.includes("n.m") ||
                  b.type === "non_moderating"
                ) {
                  bgClass = "bg-teal-50/80";
                  borderClass = "border-teal-200";
                  textClass = "text-teal-700";
                  nameClass = "text-teal-800";
                  fillClass = "bg-teal-100/50";
                } else if (b.type === "meal") {
                  bgClass = "bg-blue-50/80";
                  borderClass = "border-blue-200";
                  textClass = "text-blue-700";
                  nameClass = "text-blue-800";
                  fillClass = "bg-blue-100/50";
                } else if (b.type === "wellness") {
                  bgClass = "bg-indigo-50/80";
                  borderClass = "border-indigo-200";
                  textClass = "text-indigo-700";
                  nameClass = "text-indigo-800";
                  fillClass = "bg-indigo-100/50";
                } else if (b.type === "praying") {
                  bgClass = "bg-purple-50/80";
                  borderClass = "border-purple-200";
                  textClass = "text-purple-700";
                  nameClass = "text-purple-800";
                  fillClass = "bg-purple-100/50";
                } else if (b.type === "wc") {
                  bgClass = "bg-amber-50/80";
                  borderClass = "border-amber-200";
                  textClass = "text-amber-700";
                  nameClass = "text-amber-800";
                  fillClass = "bg-amber-100/50";
                } else if (b.type === "offline") {
                  bgClass = "bg-slate-50/80";
                  borderClass = "border-slate-300";
                  textClass = "text-slate-700";
                  nameClass = "text-slate-800";
                  fillClass = "bg-slate-200/60";
                } else if (b.type === "idle" || isOvb) {
                  bgClass = "bg-rose-50/80";
                  borderClass = "border-rose-200";
                  textClass = "text-rose-700";
                  nameClass = "text-rose-800";
                  fillClass = "bg-rose-100/50";
                }

                const s = b.originalStatus?.trim() || "";
                const ss = b.originalSubStatus?.trim() || "";
                let label = "";
                if (s.toLowerCase().includes("wellness")) {
                  label = "Wellness";
                } else if (ss) {
                  label = ss;
                } else {
                  label = s || "-";
                }

                const dur = b.durationMinutes;
                const durFormat =
                  dur > 59
                    ? `${Math.floor(dur / 60)}h${dur % 60 > 0 ? ` ${dur % 60}m` : ""}`
                    : `${dur}m`;

                return (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg border ${bgClass} ${borderClass} text-[11px] shadow-sm`}
                  >
                    <div className="flex justify-between items-center mb-1.5 gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-black ${nameClass} uppercase tracking-[0.05em] text-[10px]`}
                        >
                          {label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 ml-auto">
                        <span className={`font-bold ${textClass}`}>
                          {format(b.startTime, "HH:mm")} -{" "}
                          {format(b.endTime, "HH:mm")}
                        </span>
                        <div className="flex items-center gap-1">
                          {isOvb ? (
                            <>
                              {b.allowed > 0 && (
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${fillClass}`}
                                >
                                  {b.allowed}m
                                </span>
                              )}
                              {b.excess > 0 && (
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-amber-700 bg-amber-100/50`}
                                >
                                  +{b.excess}m
                                </span>
                              )}
                            </>
                          ) : (
                            <span
                              className={`text-[10px] ${textClass} font-bold px-1.5 py-0.5 rounded ${fillClass}`}
                            >
                              ({durFormat})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <p
                      className={`italic text-slate-700 leading-snug font-medium pl-2.5 border-l-[3px] py-0.5 mt-2 ${borderClass}`}
                    >
                      "{b.originalRemark}"
                    </p>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
