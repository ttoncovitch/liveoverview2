import React, { useState, useMemo, useEffect } from "react";
import { EmployeeSummary, EmployeeDayRecord } from "../types";
import { useLanguage } from "../contexts/LanguageContext";
import { isSupportRole } from "./LOBAnalytics";
import { parseISO, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Search, 
  User, 
  Mail, 
  FileText, 
  X, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Copy, 
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  Tag,
  Palmtree
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface AgentsDetailsProps {
  summaries: EmployeeSummary[];
}

export default function AgentsDetails({ summaries }: AgentsDetailsProps) {
  const { lang } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTL, setSelectedTL] = useState<string>("ALL");
  const [selectedAgent, setSelectedAgent] = useState<EmployeeSummary | null>(null);
  const [selectedMonthStr, setSelectedMonthStr] = useState<string>(""); // "yyyy-MM"
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [expandedLOBs, setExpandedLOBs] = useState<Record<string, boolean>>({});
  const [isVacModalOpen, setIsVacModalOpen] = useState(false);

  // 1. Filter out employees without a valid name (or the filtered name) and support staff
  const validAgents = useMemo(() => {
    return summaries.filter(
      (s) =>
        s.employeeName &&
        s.employeeName.trim() !== "" &&
        s.employeeName.trim().toLowerCase() !== "saloua tadlaoui" &&
        !isSupportRole(s)
    );
  }, [summaries]);

  const incomingVacations = useMemo(() => {
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Lisbon" }));
    today.setHours(0, 0, 0, 0);
    const todayStr = format(today, "yyyy-MM-dd");

    const sevenDaysLater = new Date(today);
    sevenDaysLater.setDate(today.getDate() + 6); // next 7 days: day 0 to day 6
    sevenDaysLater.setHours(23, 59, 59, 999);
    const sevenDaysLaterStr = format(sevenDaysLater, "yyyy-MM-dd");

    const list: { employeeName: string; workdayId: string; role: string; lob: string; startDate: string; startDayOfWeek: string }[] = [];

    validAgents.forEach((staff) => {
      // Find all dates in the 7-day window where they are on PTO
      const ptoInWindow: string[] = [];
      
      staff.dailyRecords.forEach((r) => {
        if (r.isPTO && r.date >= todayStr && r.date <= sevenDaysLaterStr) {
          ptoInWindow.push(r.date);
        }
      });

      if (ptoInWindow.length > 0) {
        ptoInWindow.sort();
        const firstPtoStr = ptoInWindow[0];
        
        // Find the start date of this consecutive PTO block
        let startDateStr = firstPtoStr;
        let currentDate = parseISO(firstPtoStr);
        let foundStart = false;
        
        let attempts = 0;
        while (!foundStart && attempts < 100) {
          attempts++;
          const prevDay = new Date(currentDate);
          prevDay.setDate(prevDay.getDate() - 1);
          const prevDayStr = format(prevDay, "yyyy-MM-dd");
          
          const prevRecord = staff.dailyRecords.find(r => r.date === prevDayStr);
          if (prevRecord && prevRecord.isPTO) {
            startDateStr = prevDayStr;
            currentDate = prevDay;
          } else {
            foundStart = true;
          }
        }

        // Only include if they ENTER vacation in the next 7 days (i.e., start date is today or in the future)
        if (startDateStr >= todayStr && startDateStr <= sevenDaysLaterStr) {
          const startDateObj = parseISO(startDateStr);
          const startDayOfWeek = format(startDateObj, "EEEE", { locale: lang === "pt" ? ptBR : undefined });
          
          if (!list.some(item => item.employeeName === staff.employeeName)) {
            list.push({
              employeeName: staff.employeeName,
              workdayId: staff.workdayId || "N/A",
              role: staff.role || "N/A",
              lob: staff.lob || "N/A",
              startDate: startDateStr,
              startDayOfWeek
            });
          }
        }
      } else if (staff.vacationStartDate && staff.vacationStartDate >= todayStr && staff.vacationStartDate <= sevenDaysLaterStr) {
        const startDateObj = parseISO(staff.vacationStartDate);
        const startDayOfWeek = format(startDateObj, "EEEE", { locale: lang === "pt" ? ptBR : undefined });
        
        if (!list.some(item => item.employeeName === staff.employeeName)) {
          list.push({
            employeeName: staff.employeeName,
            workdayId: staff.workdayId || "N/A",
            role: staff.role || "N/A",
            lob: staff.lob || "N/A",
            startDate: staff.vacationStartDate,
            startDayOfWeek
          });
        }
      }
    });

    return list.sort((a, b) => {
      const cmp = a.startDate.localeCompare(b.startDate);
      if (cmp !== 0) return cmp;
      return a.employeeName.localeCompare(b.employeeName);
    });
  }, [validAgents, lang]);

  // Extract unique Team Leaders (Supervisors)
  const tlList = useMemo(() => {
    return Array.from(
      new Set(
        validAgents
          .map((s) => s.supervisor?.trim())
          .filter(Boolean)
      )
    ).sort() as string[];
  }, [validAgents]);

  // 2. Filter list based on search term and selected TL
  const filteredAgents = useMemo(() => {
    let result = validAgents;

    if (selectedTL !== "ALL") {
      result = result.filter(
        (s) =>
          s.supervisor?.toUpperCase().trim() === selectedTL.toUpperCase().trim()
      );
    }

    if (!searchTerm.trim()) return result;
    const lower = searchTerm.toLowerCase();
    return result.filter(
      (s) =>
        s.employeeName.toLowerCase().includes(lower) ||
        (s.supervisor && s.supervisor.toLowerCase().includes(lower)) ||
        (s.workdayId && s.workdayId.toLowerCase().includes(lower)) ||
        (s.email && s.email.toLowerCase().includes(lower)) ||
        (s.lob && s.lob.toLowerCase().includes(lower)) ||
        (s.language && s.language.toLowerCase().includes(lower))
    );
  }, [validAgents, searchTerm, selectedTL]);

  // 3. Group by LOB and then Language
  const groupedData = useMemo(() => {
    const map: Record<string, Record<string, EmployeeSummary[]>> = {};
    filteredAgents.forEach((agent) => {
      const lob = (agent.lob && agent.lob.trim() !== "") ? agent.lob.toUpperCase().trim() : "N/A";
      const language = (agent.language && agent.language.trim() !== "") ? agent.language.toUpperCase().trim() : "N/A";

      if (!map[lob]) map[lob] = {};
      if (!map[lob][language]) map[lob][language] = [];
      map[lob][language].push(agent);
    });

    // Sort LOBs and languages alphabetically
    const sortedLobs: Record<string, Record<string, EmployeeSummary[]>> = {};
    Object.keys(map)
      .sort((a, b) => a.localeCompare(b))
      .forEach((lob) => {
        sortedLobs[lob] = {};
        Object.keys(map[lob])
          .sort((a, b) => a.localeCompare(b))
          .forEach((langKey) => {
            // Sort agents alphabetically by name
            sortedLobs[lob][langKey] = map[lob][langKey].sort((a, b) =>
              a.employeeName.localeCompare(b.employeeName)
            );
          });
      });

    return sortedLobs;
  }, [filteredAgents]);

  // Initialize all LOBs as expanded on load
  useEffect(() => {
    const lobs = Object.keys(groupedData);
    if (lobs.length > 0) {
      const initial: Record<string, boolean> = {};
      lobs.forEach((l) => {
        initial[l] = true;
      });
      setExpandedLOBs((prev) => {
        // Only set if we don't have them yet, to preserve user toggles
        const updated = { ...prev };
        lobs.forEach((l) => {
          if (updated[l] === undefined) {
            updated[l] = true;
          }
        });
        return updated;
      });
    }
  }, [groupedData]);

  const toggleLOB = (lob: string) => {
    setExpandedLOBs((prev) => ({
      ...prev,
      [lob]: !prev[lob],
    }));
  };

  const copyToClipboard = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  // 4. Modal Calendar Logic
  const agentMonths = useMemo(() => {
    if (!selectedAgent) return [];
    const months = new Set<string>();
    selectedAgent.dailyRecords.forEach((r) => {
      const parts = r.date.split("-");
      if (parts.length === 3) {
        months.add(`${parts[0]}-${parts[1]}`); // "yyyy-MM"
      }
    });
    return Array.from(months).sort();
  }, [selectedAgent]);

  // Set default month to current or most recent when an agent is selected
  useEffect(() => {
    if (selectedAgent && agentMonths.length > 0) {
      const today = new Date();
      const currentMonthStr = format(today, "yyyy-MM");
      if (agentMonths.includes(currentMonthStr)) {
        setSelectedMonthStr(currentMonthStr);
      } else {
        setSelectedMonthStr(agentMonths[agentMonths.length - 1]);
      }
    }
  }, [selectedAgent, agentMonths]);

  const calendarGrid = useMemo(() => {
    if (!selectedMonthStr) return [];
    const [yearStr, monthStr] = selectedMonthStr.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed month

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysCount = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday...

    const cells: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    // Prev month padding
    const prevMonthLast = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLast - i;
      const prevM = month === 0 ? 11 : month - 1;
      const prevY = month === 0 ? year - 1 : year;
      cells.push({
        dateStr: `${prevY}-${String(prevM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        dayNum: d,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysCount; d++) {
      cells.push({
        dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        dayNum: d,
        isCurrentMonth: true,
      });
    }

    // Next month padding
    const totalCells = Math.ceil(cells.length / 7) * 7;
    const nextDaysNeeded = totalCells - cells.length;
    for (let d = 1; d <= nextDaysNeeded; d++) {
      const nextM = month === 11 ? 0 : month + 1;
      const nextY = month === 11 ? year + 1 : year;
      cells.push({
        dateStr: `${nextY}-${String(nextM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        dayNum: d,
        isCurrentMonth: false,
      });
    }

    return cells;
  }, [selectedMonthStr]);

  const handlePrevMonth = () => {
    const idx = agentMonths.indexOf(selectedMonthStr);
    if (idx > 0) {
      setSelectedMonthStr(agentMonths[idx - 1]);
    }
  };

  const handleNextMonth = () => {
    const idx = agentMonths.indexOf(selectedMonthStr);
    if (idx !== -1 && idx < agentMonths.length - 1) {
      setSelectedMonthStr(agentMonths[idx + 1]);
    }
  };

  // Helper to format the Month Header name
  const formattedMonthHeader = useMemo(() => {
    if (!selectedMonthStr) return "";
    try {
      const date = parseISO(`${selectedMonthStr}-01`);
      return format(date, "MMMM yyyy", { locale: lang === "pt" ? ptBR : undefined });
    } catch (e) {
      return selectedMonthStr;
    }
  }, [selectedMonthStr, lang]);

  return (
    <div className="flex flex-col gap-6" id="agents-details-tab">
      {/* Header with Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">
            {lang === "pt" ? "Detalhes dos Agentes" : "Agents Details"}
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {lang === "pt"
              ? "Lista de agentes separados por LOB e Língua. Clique no nome para ver o calendário mensal."
              : "List of agents grouped by LOB and Language. Click on a name to view their monthly calendar."}
          </p>
        </div>

        {/* Filters and Search Container */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          {/* TL Filter Dropdown */}
          <select
            value={selectedTL}
            onChange={(e) => setSelectedTL(e.target.value)}
            className="h-11 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3 text-xs font-bold w-full sm:w-48 shadow-sm outline-none cursor-pointer focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          >
            <option value="ALL">
              {lang === "pt" ? "Todos os TL's" : "All TLs"}
            </option>
            {tlList.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* VAC Button */}
          <button
            onClick={() => setIsVacModalOpen(true)}
            title={lang === "pt" ? "Agentes em Férias nos Próximos 7 Dias" : "Agents on Vacation in Next 7 Days"}
            className="h-11 border border-slate-200 hover:bg-slate-50 text-slate-700 bg-white rounded-xl px-3.5 text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shadow-sm cursor-pointer shrink-0"
          >
            <Palmtree size={15} className="text-purple-600" />
            <span>VAC</span>
            {incomingVacations.length > 0 && (
              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full font-black">
                {incomingVacations.length}
              </span>
            )}
          </button>

          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder={lang === "pt" ? "Buscar por nome, TL, WDID..." : "Search by name, TL, WDID..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 h-11 bg-slate-50 border border-slate-200 hover:bg-slate-50/50 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 placeholder-slate-400 shadow-inner"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grouped List */}
      <div className="flex flex-col gap-6">
        {Object.keys(groupedData).length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-sm">
            <p className="text-slate-400 text-sm font-bold">
              {lang === "pt"
                ? "Nenhum agente correspondente encontrado."
                : "No matching agents found."}
            </p>
          </div>
        ) : (
          Object.entries(groupedData).map(([lob, languages]) => {
            const isExpanded = expandedLOBs[lob] !== false;
            // Calculate total agents in this LOB
            const totalInLob = Object.values(languages).reduce((acc, list) => acc + list.length, 0);

            return (
              <div
                key={lob}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden transition-all"
              >
                {/* LOB Accordion Header */}
                <button
                  onClick={() => toggleLOB(lob)}
                  className="w-full flex items-center justify-between p-5 bg-slate-50/50 hover:bg-slate-50 border-b border-slate-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="bg-blue-600 text-white text-[11px] font-black tracking-widest px-2.5 py-1 rounded-lg uppercase shadow-sm shadow-blue-500/10">
                      LOB: {lob}
                    </span>
                    <span className="bg-slate-200/80 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">
                      {totalInLob} {totalInLob === 1 ? (lang === "pt" ? "agente" : "agent") : (lang === "pt" ? "agentes" : "agents")}
                    </span>
                  </div>
                  <span className="text-slate-400">
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </span>
                </button>

                {/* Collapsible Content */}
                {isExpanded && (
                  <div className="p-5 flex flex-col gap-6">
                    {Object.entries(languages).map(([language, agents]) => (
                      <div key={language} className="flex flex-col gap-3">
                        {/* Language Subsection Header */}
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                          <Globe size={14} className="text-indigo-500" />
                          <h4 className="text-xs font-black text-slate-700 tracking-wider uppercase">
                            {language === "N/A" ? (lang === "pt" ? "Sem Língua" : "No Language") : language}
                          </h4>
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                            {agents.length}
                          </span>
                        </div>

                        {/* Agents Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {agents.map((agent) => (
                            <div
                              key={agent.employeeName + agent.email}
                              className="group bg-white rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all p-4 flex flex-col justify-between gap-3 relative"
                            >
                              <div>
                                {/* Agent Name (Clickable) */}
                                <button
                                  onClick={() => setSelectedAgent(agent)}
                                  className="text-left font-black text-slate-800 group-hover:text-blue-600 text-sm hover:underline transition-colors block mb-1 outline-none truncate w-full"
                                  title={lang === "pt" ? "Clique para ver calendário" : "Click to view calendar"}
                                >
                                  {agent.employeeName}
                                </button>

                                {/* Team Leader */}
                                <p className="text-xs text-slate-500 font-bold flex items-center gap-1">
                                  <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                    TL:
                                  </span>{" "}
                                  {agent.supervisor || "—"}
                                </p>

                                {/* Workday ID */}
                                <p className="text-xs text-slate-500 font-bold mt-1 flex items-center gap-1">
                                  <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                    WDID:
                                  </span>{" "}
                                  <code className="text-[11px] font-mono text-slate-600">
                                    {agent.workdayId || "—"}
                                  </code>
                                </p>
                              </div>

                              {/* Footer Email and Action Button */}
                              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
                                <div className="flex items-center gap-1.5 overflow-hidden w-2/3">
                                  <Mail size={12} className="text-slate-400 shrink-0" />
                                  <span className="text-[11px] font-semibold text-slate-500 truncate" title={agent.email}>
                                    {agent.email || "—"}
                                  </span>
                                  {agent.email && (
                                    <button
                                      onClick={() => copyToClipboard(agent.email)}
                                      className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-50 shrink-0 transition-colors"
                                      title={lang === "pt" ? "Copiar email" : "Copy email"}
                                    >
                                      {copiedEmail === agent.email ? (
                                        <Check size={12} className="text-green-500" />
                                      ) : (
                                        <Copy size={12} />
                                      )}
                                    </button>
                                  )}
                                </div>

                                <button
                                  onClick={() => setSelectedAgent(agent)}
                                  className="text-[10px] font-black bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-2.5 py-1 rounded-lg transition-all tracking-wider uppercase inline-flex items-center gap-1 cursor-pointer shrink-0"
                                >
                                  <Calendar size={11} />
                                  <span>{lang === "pt" ? "Agenda" : "Schedule"}</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 5. Calendar Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl border border-slate-200/95 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50">
              <div>
                <span className="text-[10px] font-black tracking-widest text-blue-600 uppercase">
                  {lang === "pt" ? "CALENDÁRIO DE ESCALA" : "SHIFT CALENDAR"}
                </span>
                <h3 className="text-lg font-black text-slate-800 mt-0.5">
                  {selectedAgent.employeeName}
                </h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                  {selectedAgent.lob && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded">
                      LOB: {selectedAgent.lob}
                    </span>
                  )}
                  {selectedAgent.language && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded">
                      {lang === "pt" ? "Língua:" : "Language:"} {selectedAgent.language}
                    </span>
                  )}
                  {selectedAgent.supervisor && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded">
                      TL: {selectedAgent.supervisor}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedAgent(null)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Month Select and Navigator */}
            {agentMonths.length > 0 ? (
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-white">
                <button
                  onClick={handlePrevMonth}
                  disabled={agentMonths.indexOf(selectedMonthStr) <= 0}
                  className="p-1.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg text-slate-600 transition-colors shrink-0"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-slate-400" />
                  <span className="text-sm font-black text-slate-700 uppercase tracking-wide">
                    {formattedMonthHeader}
                  </span>
                </div>

                <button
                  onClick={handleNextMonth}
                  disabled={
                    agentMonths.indexOf(selectedMonthStr) === -1 ||
                    agentMonths.indexOf(selectedMonthStr) === agentMonths.length - 1
                  }
                  className="p-1.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg text-slate-600 transition-colors shrink-0"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 text-amber-700 text-xs font-semibold text-center border-b border-amber-100">
                {lang === "pt"
                  ? "Aviso: Sem dados de escala diária carregados."
                  : "Warning: No daily schedule records loaded."}
              </div>
            )}

            {/* Modal Content - Monthly Calendar Grid */}
            <div className="p-5 overflow-y-auto flex-1 bg-slate-50/50">
              {agentMonths.length > 0 && selectedMonthStr ? (
                <div className="flex flex-col gap-4">
                  {/* Calendar Grid Container */}
                  <div className="border border-slate-200 bg-white rounded-xl overflow-hidden shadow-sm">
                    {/* Days of Week Label Header */}
                    <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center py-2">
                      {["D", "S", "T", "Q", "Q", "S", "S"].map((dayName, idx) => {
                        const fullName =
                          lang === "pt"
                            ? ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][idx]
                            : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][idx];
                        return (
                          <span
                            key={idx}
                            className="text-[10px] font-black text-slate-400 uppercase tracking-wider"
                            title={fullName}
                          >
                            {dayName}
                          </span>
                        );
                      })}
                    </div>

                    {/* Grid Cells */}
                    <div className="grid grid-cols-7">
                      {calendarGrid.map((cell, idx) => {
                        // Find if there is a record
                        const dayRecord = selectedAgent.dailyRecords.find(
                          (r) => r.date === cell.dateStr
                        );

                        let cellClass = "p-2 min-h-[70px] border-b border-r border-slate-100 flex flex-col justify-between transition-all ";
                        if (!cell.isCurrentMonth) {
                          cellClass += "bg-slate-50/50 text-slate-400 opacity-40 ";
                        } else {
                          cellClass += "bg-white text-slate-700 ";
                        }
                        // Remove last column border-r
                        if ((idx + 1) % 7 === 0) {
                          cellClass = cellClass.replace("border-r ", "");
                        }

                        // Status styling logic
                        let statusText = "";
                        let statusStyle = "text-[9px] font-black rounded px-1.5 py-0.5 uppercase tracking-wide text-center mt-1 ";

                        if (dayRecord) {
                          if (dayRecord.isOFF || String(dayRecord.scheduledShift || "").toUpperCase().trim() === "OFF") {
                            statusText = lang === "pt" ? "Folga" : "OFF";
                            statusStyle += "bg-rose-50 text-rose-500 border border-rose-200/50";
                          } else if (dayRecord.isPTO) {
                            statusText = "PTO";
                            statusStyle += "bg-teal-50 text-teal-600 border border-teal-200/50";
                          } else if (dayRecord.isSL) {
                            statusText = "SL";
                            statusStyle += "bg-amber-50 text-amber-600 border border-amber-200/50";
                          } else if (dayRecord.scheduledShift) {
                            statusText = dayRecord.scheduledShift;
                            statusStyle += "bg-blue-50 text-blue-600 border border-blue-200/50";
                          } else {
                            statusText = "—";
                            statusStyle += "bg-slate-100 text-slate-400";
                          }
                        } else {
                          statusText = "—";
                          statusStyle += "bg-slate-50 text-slate-300";
                        }

                        return (
                          <div key={cell.dateStr + idx} className={cellClass}>
                            <span className="text-[11px] font-bold block">
                              {cell.dayNum}
                            </span>
                            {statusText && (
                              <div
                                className={statusStyle}
                                title={
                                  dayRecord?.scheduledShift
                                    ? `${lang === "pt" ? "Escala" : "Shift"}: ${dayRecord.scheduledShift}`
                                    : ""
                                }
                              >
                                {statusText}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Calendar Legend */}
                  <div className="flex flex-wrap items-center justify-center gap-4 bg-white p-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-sm">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-blue-50 border border-blue-200/80 inline-block"></span>
                      <span>{lang === "pt" ? "Dia On (Escalado)" : "On (Scheduled)"}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-rose-50 border border-rose-200/80 inline-block"></span>
                      <span>{lang === "pt" ? "Folga" : "OFF"}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-teal-50 border border-teal-200/80 inline-block"></span>
                      <span>PTO</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-amber-50 border border-amber-200/80 inline-block"></span>
                      <span>SL (Sick Leave)</span>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-white border border-slate-200 rounded-xl">
                  <p className="text-slate-400 text-sm font-semibold">
                    {lang === "pt"
                      ? "Nenhum dado de escala encontrado para este agente."
                      : "No schedule records found for this agent."}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 flex justify-end bg-slate-50">
              <button
                onClick={() => setSelectedAgent(null)}
                className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold px-4 h-9 rounded-xl shadow-sm transition-all cursor-pointer"
              >
                {lang === "pt" ? "Fechar" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={isVacModalOpen}
        onOpenChange={(open) => setIsVacModalOpen(open)}
      >
        <DialogContent className="max-w-lg w-[95vw] rounded-2xl border-slate-200 p-6 overflow-hidden shadow-2xl bg-white text-slate-800">
          <DialogHeader className="pb-4 border-b border-slate-100">
            <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Palmtree size={20} className="text-purple-600" />
              <span>{lang === "pt" ? "Próximas Férias (Próximos 7 dias)" : "Upcoming Vacations (Next 7 days)"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              {lang === "pt" 
                ? "Lista de agentes que iniciarão férias nos próximos 7 dias."
                : "List of agents starting their vacations in the next 7 days."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 mt-4 max-h-[60vh] overflow-y-auto pr-1">
            {incomingVacations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Palmtree size={32} className="text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-600">
                  {lang === "pt" ? "Nenhuma férias agendada" : "No scheduled vacations"}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {lang === "pt" 
                    ? "Nenhum agente inicia férias nos próximos 7 dias."
                    : "No agents are starting vacations in the next 7 days."}
                </p>
              </div>
            ) : (
              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm bg-slate-50/50">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <th className="p-3">{lang === "pt" ? "Colaborador" : "Employee"}</th>
                      <th className="p-3">{lang === "pt" ? "LOB / Cargo" : "LOB / Role"}</th>
                      <th className="p-3 text-right">{lang === "pt" ? "Início" : "Start Date"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {incomingVacations.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-semibold text-slate-800">
                          <div>{item.employeeName}</div>
                          <div className="text-[10px] text-slate-400 font-normal">ID: {item.workdayId}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-slate-700">{item.lob}</div>
                          <div className="text-[10px] text-slate-400">{item.role}</div>
                        </td>
                        <td className="p-3 text-right font-bold text-purple-700 whitespace-nowrap">
                          <div>{item.startDate.split("-").reverse().join("/")}</div>
                          <div className="text-[10px] text-slate-400 font-normal capitalize">{item.startDayOfWeek}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-end mt-2 pt-3 border-t border-slate-100 font-sans">
              <button
                type="button"
                onClick={() => setIsVacModalOpen(false)}
                className="px-5 py-2 text-xs font-black text-white bg-slate-800 hover:bg-slate-900 rounded-xl shadow-md shadow-slate-800/10 transition-colors cursor-pointer"
              >
                {lang === "pt" ? "Fechar" : "Close"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
