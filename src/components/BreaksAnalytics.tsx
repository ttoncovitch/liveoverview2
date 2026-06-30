import React, { useMemo, useState } from "react";
import { EmployeeSummary } from "../types";
import { useLanguage } from "../contexts/LanguageContext";
import { formatLOB } from "../lib/shiftUtils";
import { isSupportRole } from "./LOBAnalytics";
import { Search, ArrowUpDown, Timer, Ban } from "lucide-react";
import { format } from "date-fns";

const cleanShift = (shift: string) => {
  if (!shift) return shift;
  const match = shift.match(
    /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/,
  );
  if (!match) return shift;

  const parseTimeComp = (t: string) => {
    const tUpper = t.toUpperCase();
    const isPM = tUpper.includes("PM");
    const isAM = tUpper.includes("AM");
    let cleanT = tUpper.replace(/[A-Z\s]/g, "");
    const [hStr, mStr] = cleanT.split(":");
    let h = parseInt(hStr) || 0;
    let m = parseInt(mStr) || 0;
    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  return `${parseTimeComp(match[1])}-${parseTimeComp(match[2])}`;
};

const isRecordActiveNow = (
  r: any,
  requireActivity: boolean = true,
) => {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Lisbon" }),
  );
  const todayDateStr = format(now, "yyyy-MM-dd");
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = format(yesterday, "yyyy-MM-dd");

  if (r.date !== todayDateStr && r.date !== yesterdayStr) return false;

  const shiftStr = r.inferredShift || r.scheduledShift;
  if (!shiftStr) return false;

  const cleaned = cleanShift(shiftStr);
  const times = cleaned.split("-");
  if (times.length === 2) {
    const [sh, sm] = times[0].split(":").map(Number);
    const [eh, em] = times[1].split(":").map(Number);

    if (!isNaN(sh) && !isNaN(eh)) {
      let startTotal = sh * 60 + (sm || 0);
      let endTotal = eh * 60 + (em || 0);
      if (endTotal <= startTotal) endTotal += 24 * 60; // passes midnight

      const curTotal = now.getHours() * 60 + now.getMinutes();

      let shiftMatchesNow = false;

      if (r.date === yesterdayStr) {
        if (curTotal >= 8 * 60) {
          return false;
        }
        if (endTotal > 24 * 60) {
          if (curTotal <= endTotal - 24 * 60) {
            shiftMatchesNow = true;
          }
        }
      } else if (r.date === todayDateStr) {
        if (endTotal > 24 * 60) {
          if (curTotal >= startTotal) shiftMatchesNow = true;
        } else {
          if (curTotal >= startTotal && curTotal <= endTotal)
            shiftMatchesNow = true;
        }
      }

      let latestBreak: any = null;
      if (r.breaks && r.breaks.length > 0) {
        for (const b of r.breaks) {
          if (
            !latestBreak ||
            new Date(b.endTime).getTime() > new Date(latestBreak.endTime).getTime()
          ) {
            latestBreak = b;
          }
        }
      }

      let isWorkingOvertime = false;
      if (
        latestBreak &&
        latestBreak.type !== "offline" &&
        latestBreak.type !== "forgot_status"
      ) {
        const diffMin =
          (now.getTime() - new Date(latestBreak.endTime).getTime()) / 60000;
        if (diffMin <= 90) {
          isWorkingOvertime = true;
        }
      }

      if (shiftMatchesNow || isWorkingOvertime) {
        if (requireActivity) {
          const hasRealActivity =
            r.actualStartTime != null ||
            (latestBreak &&
              latestBreak.type !== "offline" &&
              latestBreak.type !== "forgot_status");
          return !!hasRealActivity;
        }
        return true;
      }
    }
  }
  return false;
};

const formatTimeSafe = (dateVal: any) => {
  if (!dateVal) return "";
  const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
};

const formatDateSafe = (dateStr: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

interface BreaksAnalyticsProps {
  summaries: EmployeeSummary[];
  timeFilter: string;
  selectedDates: Date[] | undefined;
  showRealTime?: boolean;
}

type SortField =
  | "workdayId"
  | "employeeName"
  | "supervisor"
  | "lob"
  | "language"
  | "shift"
  | "hours24"
  | "overHours24"
  | "idle24"
  | "break24"
  | "meal24"
  | "praying24"
  | "wellness24"
  | "breaksQty"
  | "breaksPerDay"
  | "workingDays"
  | "wcQty"
  | "wcTime";

// Calculations helper per summary declared globally so it's accessible anywhere
export function getRowMetrics(s: EmployeeSummary) {
  const hours24 = Math.round(s.dailyRecords.reduce((sum, r) => sum + (r.totalWorkTimeMillis || 0) / 60000, 0));
  const overHours24 = Math.round(s.dailyRecords.reduce((sum, r) => sum + (r.totalOverbreak || 0), 0));
  const idle24 = s.dailyRecords.reduce((sum, r) => sum + (r.idleOverbreak || 0), 0);
  const break24 = s.dailyRecords.reduce((sum, r) => sum + (r.shortOverbreak || 0), 0);
  const meal24 = s.dailyRecords.reduce((sum, r) => sum + (r.mealOverbreak || 0), 0);
  const praying24 = s.dailyRecords.reduce((sum, r) => sum + (r.prayingOverbreak || 0), 0);
  const wellness24 = s.dailyRecords.reduce((sum, r) => sum + (r.wellnessOverbreak || 0), 0);

  const breaksQty = s.dailyRecords.reduce((total, r) => {
    if (!r.breaks) return total;
    return (
      total +
      r.breaks.filter(
        (b) =>
          b.type === "meal" ||
          b.type === "short" ||
          b.type === "wellness" ||
          b.type === "praying" ||
          b.type === "wc"
      ).length
    );
  }, 0);

  const wcQty = s.dailyRecords.reduce((total, r) => {
    if (!r.breaks) return total;
    return total + r.breaks.filter((b) => b.type === "wc").length;
  }, 0);

  const wcTime = s.dailyRecords.reduce((total, r) => total + (r.wcDuration || 0), 0);

  // Compute breaks average per day (avgBreaksPerDay)
  const workingDays = s.dailyRecords.filter(r => {
    const isScheduledWorking = !r.isOFF && !r.isPTO && !r.isLOA && !r.isSL && !r.isSUSPP && !r.isATT && !r.isAbsence;
    const hasActualActivity = (r.totalWorkTimeMillis || 0) > 0 || (r.breaks && r.breaks.length > 0);
    return isScheduledWorking || hasActualActivity;
  }).length;
  const daysCount = workingDays > 0 ? workingDays : 1;
  const breaksPerDay = Number((breaksQty / daysCount).toFixed(1));

  return {
    hours24,
    overHours24,
    idle24,
    break24,
    meal24,
    praying24,
    wellness24,
    breaksQty,
    breaksPerDay,
    workingDays,
    wcQty,
    wcTime,
  };
}

export function BreaksAnalytics({
  summaries,
  timeFilter,
  selectedDates,
  showRealTime = false,
}: BreaksAnalyticsProps) {
  const { lang } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTL, setSelectedTL] = useState<string>("all");
  const [selectedLOB, setSelectedLOB] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortField>("overHours24");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // When in Real Time mode, only display records for the current active shift.
  const processedSummariesForView = useMemo(() => {
    if (showRealTime) {
      return summaries.map((s) => {
        const activeRecs = s.dailyRecords.filter((r) => isRecordActiveNow(r, false));
        return {
          ...s,
          dailyRecords: activeRecs,
        };
      }).filter((s) => s.dailyRecords.length > 0);
    }
    return summaries;
  }, [summaries, showRealTime]);

  // Filter out support staff to only show agents as requested
  // Keep only agents who have overbreak (overHours24 > 0) in the active period
  const agentsOnly = useMemo(() => {
    const list = processedSummariesForView.filter((s) => !isSupportRole(s));
    return list.filter((s) => {
      const m = getRowMetrics(s);
      return m.overHours24 > 0;
    });
  }, [processedSummariesForView]);

  // Unique Team Leaders and LOBs for filter options from agents list
  const teamLeaders = useMemo(() => {
    const tls = new Set<string>();
    agentsOnly.forEach((s) => {
      if (s.supervisor) tls.add(s.supervisor);
    });
    return Array.from(tls).sort();
  }, [agentsOnly]);

  const lobs = useMemo(() => {
    const list = new Set<string>();
    agentsOnly.forEach((s) => {
      if (s.lob) list.add(s.lob);
    });
    return Array.from(list).sort();
  }, [agentsOnly]);

  // Is single day check
  const isSingleDay = useMemo(() => {
    if (selectedDates && selectedDates.length > 0) {
      return selectedDates.length === 1;
    }
    return timeFilter === "day" || timeFilter === "yesterday";
  }, [timeFilter, selectedDates]);

  const showPeriodCols = !isSingleDay && !showRealTime;

  // Get active shift for a single day context, or fallback to general shift
  const getAgentShift = (s: EmployeeSummary) => {
    const dayRec = s.dailyRecords[0];
    const val = dayRec ? (dayRec.scheduledShift || dayRec.inferredShift || "OFF") : s.shift || "-";
    if (val === "OFF") return lang === "pt" ? "FOLGA" : "OFF";
    return val;
  };

  // Format minutes to H:MM
  const formatHMM = (mins: number) => {
    if (mins <= 0) return "";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  };

  // Filter & Search
  const searchedAgents = useMemo(() => {
    return agentsOnly.filter((s) => {
      // TL filter
      if (selectedTL !== "all" && s.supervisor !== selectedTL) return false;
      // LOB filter
      if (selectedLOB !== "all" && s.lob !== selectedLOB) return false;

      const term = searchTerm.toLowerCase().trim();
      if (!term) return true;
      return (
        s.employeeName.toLowerCase().includes(term) ||
        (s.workdayId || "").toLowerCase().includes(term) ||
        (s.supervisor || "").toLowerCase().includes(term) ||
        (s.lob || "").toLowerCase().includes(term)
      );
    });
  }, [agentsOnly, searchTerm, selectedTL, selectedLOB]);

  // Sorting
  const sortedAgents = useMemo(() => {
    const list = [...searchedAgents];
    list.sort((a, b) => {
      let aVal: any = "";
      let bVal: any = "";

      if (sortBy === "workdayId") {
        aVal = a.workdayId || "";
        bVal = b.workdayId || "";
      } else if (sortBy === "employeeName") {
        aVal = a.employeeName || "";
        bVal = b.employeeName || "";
      } else if (sortBy === "supervisor") {
        aVal = a.supervisor || "";
        bVal = b.supervisor || "";
      } else if (sortBy === "lob") {
        aVal = a.lob || "";
        bVal = b.lob || "";
      } else if (sortBy === "language") {
        aVal = a.language || "";
        bVal = b.language || "";
      } else if (sortBy === "shift") {
        if (isSingleDay) {
          aVal = getAgentShift(a);
          bVal = getAgentShift(b);
        } else {
          aVal = a.shift || "";
          bVal = b.shift || "";
        }
      } else {
        const aM = getRowMetrics(a);
        const bM = getRowMetrics(b);
        aVal = aM[sortBy];
        bVal = bM[sortBy];
      }

      if (typeof aVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      } else {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
    });
    return list;
  }, [searchedAgents, sortBy, sortDirection, isSingleDay]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDirection("desc");
    }
  };

  // If in real time and no agents have overbreak, render nothing
  if (showRealTime && agentsOnly.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col h-full min-h-[500px]">
      {/* Header and Controls */}
      <div className="p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-blue-500/10">
            <Timer className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              {lang === "pt" ? "Controle Detalhado de Pausas" : "Detailed Breaks Control"}
            </h3>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
              {lang === "pt"
                ? "Overbreaks, quantidade de pausas e tempos de WC"
                : "Overbreaks, quantity of breaks and WC times"}
            </p>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* TL Filter */}
          <div className="flex items-center gap-1.5 min-w-[150px] flex-1 sm:flex-initial">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider select-none">TL:</span>
            <select
              value={selectedTL}
              onChange={(e) => setSelectedTL(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700 cursor-pointer w-full"
            >
              <option value="all">{lang === "pt" ? "Todos TLs" : "All TLs"}</option>
              {teamLeaders.map((tl) => (
                <option key={tl} value={tl}>
                  {tl}
                </option>
              ))}
            </select>
          </div>

          {/* LOB Filter */}
          <div className="flex items-center gap-1.5 min-w-[150px] flex-1 sm:flex-initial">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider select-none">LOB:</span>
            <select
              value={selectedLOB}
              onChange={(e) => setSelectedLOB(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700 cursor-pointer w-full"
            >
              <option value="all">{lang === "pt" ? "Todas LOBs" : "All LOBs"}</option>
              {lobs.map((l) => (
                <option key={l} value={l}>
                  {formatLOB(l)}
                </option>
              ))}
            </select>
          </div>

          {/* Search input */}
          <div className="relative min-w-[180px] flex-1 sm:flex-initial">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder={lang === "pt" ? "Buscar agente..." : "Search agent..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700 placeholder-slate-400 w-full"
            />
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto overflow-y-auto max-h-[750px] custom-scrollbar flex-1 relative">
        {sortedAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
              <Ban className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">
              {lang === "pt" ? "Nenhum agente encontrado" : "No agents found"}
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur border-b border-slate-200 shadow-sm">
              <tr className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                <th
                  className="py-3 px-4 pl-6 cursor-pointer hover:bg-slate-100/50 select-none"
                  onClick={() => handleSort("workdayId")}
                >
                  <div className="flex items-center gap-1">
                    WDID <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100/50 select-none min-w-[140px]"
                  onClick={() => handleSort("employeeName")}
                >
                  <div className="flex items-center gap-1">
                    {lang === "pt" ? "Agente" : "Agent"}{" "}
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100/50 select-none"
                  onClick={() => handleSort("supervisor")}
                >
                  <div className="flex items-center gap-1">
                    Team Leader <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100/50 select-none"
                  onClick={() => handleSort("lob")}
                >
                  <div className="flex items-center gap-1">
                    LOB <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-2 cursor-pointer hover:bg-slate-100/50 select-none"
                  onClick={() => handleSort("language")}
                >
                  <div className="flex items-center gap-1">
                    {lang === "pt" ? "Idioma" : "Language"}{" "}
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                {isSingleDay && (
                  <th
                    className="py-3 px-2 cursor-pointer hover:bg-slate-100/50 select-none"
                    onClick={() => handleSort("shift")}
                  >
                    <div className="flex items-center gap-1">
                      {lang === "pt" ? "Turno" : "Shift"} <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                )}
                <th
                  className="py-3 px-2 cursor-pointer hover:bg-slate-100/50 select-none text-center bg-blue-50/30"
                  onClick={() => handleSort("hours24")}
                >
                  <div className="flex items-center justify-center gap-1 text-blue-700">
                    {lang === "pt" ? "Horas Totais" : "Total Hours"}{" "}
                    <ArrowUpDown className="w-3 h-3 text-blue-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-2 cursor-pointer hover:bg-slate-100/50 select-none text-center bg-rose-50/30"
                  onClick={() => handleSort("overHours24")}
                >
                  <div className="flex items-center justify-center gap-1 text-rose-700">
                    {lang === "pt" ? "Tempo Excedente" : "Overbreak"}{" "}
                    <ArrowUpDown className="w-3 h-3 text-rose-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-2 cursor-pointer hover:bg-slate-100/50 select-none text-center"
                  onClick={() => handleSort("idle24")}
                >
                  <div className="flex items-center justify-center gap-1 text-slate-600">
                    IDLE <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-2 cursor-pointer hover:bg-slate-100/50 select-none text-center"
                  onClick={() => handleSort("break24")}
                >
                  <div className="flex items-center justify-center gap-1 text-slate-600">
                    SHORT <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-2 cursor-pointer hover:bg-slate-100/50 select-none text-center"
                  onClick={() => handleSort("meal24")}
                >
                  <div className="flex items-center justify-center gap-1 text-slate-600">
                    MEAL <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-2 cursor-pointer hover:bg-slate-100/50 select-none text-center"
                  onClick={() => handleSort("praying24")}
                >
                  <div className="flex items-center justify-center gap-1 text-slate-600">
                    PRAYING <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-2 cursor-pointer hover:bg-slate-100/50 select-none text-center"
                  onClick={() => handleSort("wellness24")}
                >
                  <div className="flex items-center justify-center gap-1 text-slate-600">
                    WELLNESS <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-2 cursor-pointer hover:bg-slate-100/50 select-none text-center bg-indigo-50/30"
                  onClick={() => handleSort("breaksQty")}
                >
                  <div className="flex items-center justify-center gap-1 text-indigo-700">
                    Breaks <ArrowUpDown className="w-3 h-3 text-indigo-400" />
                  </div>
                </th>
                {showPeriodCols && (
                  <>
                    <th
                      className="py-3 px-2 cursor-pointer hover:bg-slate-100/50 select-none text-center bg-indigo-50/30"
                      onClick={() => handleSort("workingDays")}
                    >
                      <div className="flex items-center justify-center gap-1 text-indigo-700">
                        {lang === "pt" ? "DIAS" : "DAYS"}{" "}
                        <ArrowUpDown className="w-3 h-3 text-indigo-400" />
                      </div>
                    </th>
                    <th
                      className="py-3 px-2 cursor-pointer hover:bg-slate-100/50 select-none text-center bg-indigo-50/30"
                      onClick={() => handleSort("breaksPerDay")}
                    >
                      <div className="flex items-center justify-center gap-1 text-indigo-700">
                        {lang === "pt" ? "Breaks p/ dia" : "Breaks / day"}{" "}
                        <ArrowUpDown className="w-3 h-3 text-indigo-400" />
                      </div>
                    </th>
                  </>
                )}
                <th
                  className="py-3 px-2 cursor-pointer hover:bg-slate-100/50 select-none text-center bg-amber-50/30"
                  onClick={() => handleSort("wcQty")}
                >
                  <div className="flex items-center justify-center gap-1 text-amber-700">
                    WC <ArrowUpDown className="w-3 h-3 text-amber-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 pr-6 cursor-pointer hover:bg-slate-100/50 select-none text-center bg-amber-50/30"
                  onClick={() => handleSort("wcTime")}
                >
                  <div className="flex items-center justify-center gap-1 text-amber-700">
                    {lang === "pt" ? "TEMPO WC" : "WC TIME"} <ArrowUpDown className="w-3 h-3 text-amber-400" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {sortedAgents.map((s) => {
                const metrics = getRowMetrics(s);
                const hasExcess = metrics.overHours24 > 0;
                const isExpanded = expandedAgent === s.employeeName;

                return (
                  <React.Fragment key={s.email || s.employeeName}>
                    <tr
                      className={`hover:bg-slate-50/80 transition-colors ${
                        hasExcess ? "bg-rose-50/10" : ""
                      } ${isExpanded ? "bg-blue-50/20" : ""}`}
                    >
                      {/* WDID */}
                      <td className="py-2.5 px-4 pl-6 font-mono font-medium text-slate-500 whitespace-nowrap">
                        {s.workdayId || "-"}
                      </td>

                      {/* Agent Name */}
                      <td 
                        onClick={() => setExpandedAgent(isExpanded ? null : s.employeeName)}
                        className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap cursor-pointer hover:text-blue-600 hover:underline select-none"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{s.employeeName}</span>
                          <span className="text-[10px] text-slate-400 font-extrabold font-mono">
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        </div>
                      </td>

                      {/* Team Leader */}
                      <td className="py-2.5 px-3 font-medium text-slate-600 whitespace-nowrap">
                        {s.supervisor || "-"}
                      </td>

                      {/* LOB */}
                      <td className="py-2.5 px-3 font-medium text-slate-600 whitespace-nowrap">
                        {s.lob ? formatLOB(s.lob) : "-"}
                      </td>

                      {/* Language */}
                      <td className="py-2.5 px-2 font-semibold text-slate-500 uppercase whitespace-nowrap">
                        {s.language || "-"}
                      </td>

                      {/* Shift */}
                      {isSingleDay && (
                        <td className="py-2.5 px-2 font-medium text-slate-500 whitespace-nowrap">
                          {getAgentShift(s)}
                        </td>
                      )}

                      {/* Hours (24) */}
                      <td className="py-2.5 px-2 text-center font-bold text-slate-800 bg-blue-50/10 whitespace-nowrap">
                        {formatHMM(metrics.hours24) || "0:00"}
                      </td>

                      {/* Over Hours (24) */}
                      <td
                        className={`py-2.5 px-2 text-center font-black bg-rose-50/10 whitespace-nowrap ${
                          hasExcess ? "text-rose-600" : "text-slate-400"
                        }`}
                      >
                        {formatHMM(metrics.overHours24) || "-"}
                      </td>

                      {/* Idle (24) overbreak */}
                      <td className="py-2.5 px-2 text-center font-semibold text-rose-500/90 whitespace-nowrap">
                        {formatHMM(metrics.idle24)}
                      </td>

                      {/* Break (24) overbreak */}
                      <td className="py-2.5 px-2 text-center font-semibold text-amber-600 whitespace-nowrap">
                        {formatHMM(metrics.break24)}
                      </td>

                      {/* Meal (24) overbreak */}
                      <td className="py-2.5 px-2 text-center font-semibold text-amber-600 whitespace-nowrap">
                        {formatHMM(metrics.meal24)}
                      </td>

                      {/* Praying (24) overbreak */}
                      <td className="py-2.5 px-2 text-center font-semibold text-amber-600 whitespace-nowrap">
                        {formatHMM(metrics.praying24)}
                      </td>

                      {/* Wellness (24) overbreak */}
                      <td className="py-2.5 px-2 text-center font-semibold text-amber-600 whitespace-nowrap">
                        {formatHMM(metrics.wellness24)}
                      </td>

                      {/* BREAKS Qty */}
                      <td className="py-2.5 px-2 text-center bg-indigo-50/10 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-center font-black px-2 py-0.5 rounded-full text-[10px] ${
                            metrics.breaksQty > 0
                              ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                              : "text-slate-300"
                          }`}
                        >
                          {metrics.breaksQty || "0"}
                        </span>
                      </td>

                      {showPeriodCols && (
                        <>
                          <td className="py-2.5 px-2 text-center bg-indigo-50/10 whitespace-nowrap font-bold text-indigo-800">
                            {metrics.workingDays}
                          </td>
                          <td className="py-2.5 px-2 text-center bg-indigo-50/10 whitespace-nowrap font-bold text-indigo-800">
                            {metrics.breaksPerDay}
                          </td>
                        </>
                      )}

                      {/* WC Qty */}
                      <td className="py-2.5 px-2 text-center bg-amber-50/10 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-center font-black px-2 py-0.5 rounded-full text-[10px] ${
                            metrics.wcQty > 0
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "text-slate-300"
                          }`}
                        >
                          {metrics.wcQty || "0"}
                        </span>
                      </td>

                      {/* WC TIME */}
                      <td className="py-2.5 px-4 pr-6 text-center font-bold bg-amber-50/10 whitespace-nowrap text-amber-800">
                        {metrics.wcTime > 0 ? `${metrics.wcTime}m` : "-"}
                      </td>
                    </tr>

                    {/* Expandable Overbreak Moments details */}
                    {isExpanded && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={15 + (isSingleDay ? 1 : 0) + (showPeriodCols ? 2 : 0)} className="p-4 pl-12 pr-6">
                          <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                                <Timer className="w-4 h-4 text-rose-500 animate-pulse" />
                                {lang === "pt" ? "Detalhes de Pausas & Momentos Excedidos" : "Breaks & Overbreak Details"}
                              </h4>
                              <button 
                                onClick={() => setExpandedAgent(null)}
                                className="text-slate-400 hover:text-slate-600 font-extrabold text-[10px] uppercase bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md"
                              >
                                {lang === "pt" ? "Fechar" : "Close"}
                              </button>
                            </div>

                            <div className="space-y-4">
                              {s.dailyRecords
                                .filter((r) => {
                                  const mOver = r.mealOverbreak || 0;
                                  const sOver = r.shortOverbreak || 0;
                                  const wOver = r.wellnessOverbreak || 0;
                                  const pOver = r.prayingOverbreak || 0;
                                  const wcOver = r.wcOverbreak || 0;
                                  const iOver = r.idleOverbreak || 0;
                                  return mOver > 0 || sOver > 0 || wOver > 0 || pOver > 0 || wcOver > 0 || iOver > 0;
                                })
                                .map((r) => {
                                  return (
                                  <div key={r.date} className="border border-slate-100 rounded-xl p-3 bg-white space-y-3">
                                    <div className="flex flex-wrap justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                      <div className="flex items-center gap-3">
                                        <span className="font-extrabold text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                          {formatDateSafe(r.date)}
                                        </span>
                                        <span className="text-xs font-bold text-slate-500">
                                          {lang === "pt" ? "Turno" : "Shift"}: {r.inferredShift === "OFF" || r.inferredShift === "FOLGA" || r.scheduledShift === "OFF" || r.scheduledShift === "FOLGA" || (!r.inferredShift && !r.scheduledShift) ? (lang === "pt" ? "FOLGA" : "OFF") : (r.inferredShift || r.scheduledShift)}
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {r.mealOverbreak > 0 && <span className="text-[9px] bg-rose-50 text-rose-600 font-black uppercase tracking-wider px-2 py-0.5 rounded border border-rose-100">{lang === "pt" ? "Almoço" : "Meal"} +{r.mealOverbreak}m</span>}
                                        {r.shortOverbreak > 0 && <span className="text-[9px] bg-rose-50 text-rose-600 font-black uppercase tracking-wider px-2 py-0.5 rounded border border-rose-100">{lang === "pt" ? "Pausa Curta" : "Short"} +{r.shortOverbreak}m</span>}
                                        {r.wellnessOverbreak > 0 && <span className="text-[9px] bg-rose-50 text-rose-600 font-black uppercase tracking-wider px-2 py-0.5 rounded border border-rose-100">Wellness +{r.wellnessOverbreak}m</span>}
                                        {r.prayingOverbreak > 0 && <span className="text-[9px] bg-rose-50 text-rose-600 font-black uppercase tracking-wider px-2 py-0.5 rounded border border-rose-100">{lang === "pt" ? "Oração" : "Praying"} +{r.prayingOverbreak}m</span>}
                                        {r.wcOverbreak > 0 && <span className="text-[9px] bg-amber-50 text-amber-700 font-black uppercase tracking-wider px-2 py-0.5 rounded border border-amber-100">WC +{r.wcOverbreak}m</span>}
                                        {r.idleOverbreak > 0 && <span className="text-[9px] bg-rose-50 text-rose-600 font-black uppercase tracking-wider px-2 py-0.5 rounded border border-rose-100">{lang === "pt" ? "Ocioso" : "Idle"} +{r.idleOverbreak}m</span>}
                                      </div>
                                    </div>

                                    <div className="space-y-1.5 pl-1">
                                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                                        {lang === "pt" ? "Momentos de Pausa Registrados:" : "Recorded Break Sessions:"}
                                      </p>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {r.breaks && r.breaks.length > 0 ? (
                                          r.breaks
                                            .filter((b) => ["meal", "short", "wellness", "wc", "praying", "idle", "forgot_status"].includes(b.type))
                                            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                                            .map((b, idx) => {
                                              let isSingleOver = false;
                                              let limit = 0;
                                              if (b.type === "meal") { limit = 60; isSingleOver = b.durationMinutes > 60; }
                                              else if (b.type === "short") { limit = 15; isSingleOver = b.durationMinutes > 15; }
                                              else if (b.type === "wellness") { limit = 15; isSingleOver = b.durationMinutes > 15; }
                                              else if (b.type === "praying") { limit = 15; isSingleOver = b.durationMinutes > 15; }
                                              else if (b.type === "wc") { limit = 10; isSingleOver = b.durationMinutes > 10; }
                                              else if (b.type === "idle" || b.type === "forgot_status") { isSingleOver = true; }

                                              const typeLabels: any = lang === "pt" ? {
                                                meal: "Pausa de Almoço",
                                                short: "Pausa Curta",
                                                wellness: "Wellness",
                                                praying: "Oração",
                                                wc: "WC",
                                                idle: "IDLE / Ocioso",
                                                forgot_status: "Sem Status"
                                              } : {
                                                meal: "Meal Break",
                                                short: "Short Break",
                                                wellness: "Wellness",
                                                praying: "Praying",
                                                wc: "WC",
                                                idle: "Idle",
                                                forgot_status: "Forgot Status"
                                              };

                                              return (
                                                <div 
                                                  key={idx} 
                                                  className={`flex justify-between items-center px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                                                    isSingleOver 
                                                      ? "bg-rose-50/40 border-rose-100 text-rose-950" 
                                                      : "bg-slate-50 border-slate-100 text-slate-700"
                                                  }`}
                                                >
                                                  <div className="space-y-0.5">
                                                    <span className="font-bold text-slate-800">{typeLabels[b.type] || b.type}</span>
                                                    <span className="block text-[10px] text-slate-400 font-mono font-bold">
                                                      {formatTimeSafe(b.startTime)} - {formatTimeSafe(b.endTime)}
                                                    </span>
                                                  </div>
                                                  <div className="text-right">
                                                    <span className="font-black text-slate-900">{b.durationMinutes}m</span>
                                                    {isSingleOver && (
                                                      <span className="block text-[9px] text-rose-500 font-black uppercase tracking-wider">
                                                        {b.type === "idle" || b.type === "forgot_status" ? (lang === "pt" ? "Inativo" : "Inactive") : `+${b.durationMinutes - limit}m ${lang === "pt" ? "ex." : "excd."}`}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                              );
                                            })
                                        ) : (
                                          <p className="text-slate-400 text-[10px] italic col-span-3 py-1">
                                            {lang === "pt" ? "Nenhuma pausa registrada neste dia" : "No breaks recorded for this day"}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
