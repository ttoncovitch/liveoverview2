import React, { useMemo, useState } from 'react';
import { EmployeeSummary } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Users, AlertTriangle, Clock, CalendarX, TrendingDown, Target, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { format } from 'date-fns';
import { formatLOB } from '../lib/shiftUtils';

interface LOBAnalyticsProps {
  summaries: EmployeeSummary[];
  showRealTime?: boolean;
}

export const SUPPORT_ROLES = ['qa', 'rta', 'sr tl', 'tl', 'trainer', 'quality', 'supervisor', 'senior team leader', 'manager', 'coordinator', 'ops', 'wfm', 'real time'];

export function isSupportRole(summary: { role?: string; lob?: string }): boolean {
  const roleUpper = (summary.role || '').trim().toUpperCase();
  const lobUpper = (summary.lob || '').trim().toUpperCase();

  // LED QUALITY is explicitly NOT a support role, it's CSR
  if (lobUpper.includes('LED QUALITY')) return false;

  // Exact match for OS in either column
  if (roleUpper === 'OS' || lobUpper === 'OS') return true;
  
  // Known support roles - check both Role and LOB to catch RTA or QA listed under LOB
  const supportRegex = /\b(QA|RTA|TRAINER|SUPERVISOR|MANAGER|TL|TEAM LEADER|WFM|REAL TIME|OPS|COORDINATOR|QUALITY|OPERATIONAL SUPPORT)\b/i;
  
  if (supportRegex.test(roleUpper) || supportRegex.test(lobUpper)) {
    return true;
  }

  return false;
}

export function LOBAnalytics({ summaries, showRealTime }: LOBAnalyticsProps) {
  const { t, lang } = useLanguage();

  // Group summaries by LOB, excluding support roles
  const lobsData = useMemo(() => {
    const lobs: Record<string, EmployeeSummary[]> = {};
    
    summaries.forEach(s => {
      // Exclude agents who don't have any active working records in the period
      const hasWorkingSchedule = s.dailyRecords.some(r => (!r.isOFF && !r.isPTO && !r.isLOA && !r.isSL && !r.isSUSPP && !r.isATT) || r.isAbsence);
      if (!hasWorkingSchedule) return;

      const lob = (s.lob && s.lob.trim() !== '') ? s.lob : t('unknown');
      if (isSupportRole(s)) return; // Exclude QA, RTA, etc.
      if (['LEG', 'LMG', 'LMG BADNESS', 'LMG ES', 'LMG LATAM'].includes(lob.toUpperCase())) return; // Exclude legacy LOBs
      
      if (!lobs[lob]) {
        lobs[lob] = [];
      }
      lobs[lob].push(s);
    });

    return lobs;
  }, [summaries]);

  const allLobNames = Object.keys(lobsData).sort();
  const [selectedGlobalLob, setSelectedGlobalLob] = useState<string>('ALL');

  const lobNames = selectedGlobalLob === 'ALL' ? allLobNames : [selectedGlobalLob];

  const mostCriticalLOB = useMemo(() => {
    if (allLobNames.length === 0) return null;
    
    const lobScores = allLobNames.map(lobName => {
       const lobSummaries = lobsData[lobName];
       let score = 0;
       lobSummaries.forEach(s => {
           score += (s.totalOverbreakMinutes || 0);
           score += (s.totalAbsences || 0) * 60;
           score += Math.floor((s.totalTardinessMinutes || 0));
       });
       return { name: lobName, score };
    });
    
    lobScores.sort((a, b) => b.score - a.score);
    if (lobScores[0].score === 0) return null;
    
    // If exact match 'Unknown' we fallback to the second biggest if it exists
    const biggest = lobScores[0];
    if (biggest.name === t('unknown') && lobScores.length > 1 && lobScores[1].score > 0) {
      return lobScores[1];
    }
    return biggest;
  }, [lobsData, allLobNames]);

  if (allLobNames.length === 0) {
     return (
        <div className="mt-12 mb-24 px-4 text-center">
           <h2 className="text-xl font-bold text-slate-500">{t('noLobFound')}</h2>
        </div>
     );
  }

  return (
    <div className="mt-12 mb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 px-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200">
            <Target className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">{t('lobsPerformance')}</h2>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">{t('lobPerformanceSubtitle')}</p>
          </div>
          {allLobNames.length > 1 && (
             <div className="ml-4">
                <select
                   value={selectedGlobalLob}
                   onChange={(e) => setSelectedGlobalLob(e.target.value)}
                   className="h-10 bg-white border border-slate-200 text-slate-700 rounded-xl px-3 text-sm font-bold outline-none cursor-pointer shadow-sm hover:border-indigo-300 focus:border-indigo-500 transition-colors"
                >
                   <option value="ALL">{lang === 'pt' ? "Todos os LOB's" : "All LOB's"}</option>
                   {allLobNames.map(lob => (
                      <option key={lob} value={lob}>{formatLOB(lob)}</option>
                   ))}
                </select>
             </div>
          )}
        </div>

        {mostCriticalLOB && (
          <div className="flex items-center gap-3 bg-rose-50 border border-rose-200/60 rounded-2xl p-3 px-4 shadow-sm">
             <AlertTriangle className="w-5 h-5 text-rose-500" />
             <div className="flex flex-col">
               <span className="text-[10px] font-black uppercase text-rose-500 tracking-widest">{t('biggestInfractor')}</span>
               <span className="text-sm font-black text-rose-800">{formatLOB(mostCriticalLOB.name)}</span>
             </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 px-4">
        {lobNames.map((lobName, idx) => (
           <LOBCard key={lobName} lobName={lobName} summaries={lobsData[lobName]} idx={idx} showRealTime={showRealTime} />
        ))}
      </div>
    </div>
  );
}

interface LOBCardProps {
  lobName: string;
  summaries: EmployeeSummary[];
  idx: number;
  showRealTime?: boolean;
}

const LOBCard: React.FC<LOBCardProps> = ({ lobName, summaries, idx, showRealTime }) => {
   const { t, lang } = useLanguage();

   const languages = useMemo(() => {
      const langs = new Set<string>();
      summaries.forEach(s => {
         const l = (s.language && s.language.trim() !== '') ? s.language.toUpperCase().trim() : 'N/A';
         langs.add(l);
      });
      return ['ALL', ...Array.from(langs).sort()];
   }, [summaries]);

   const [selectedLang, setSelectedLang] = useState('ALL');

   const stats = useMemo(() => {
      const filtered = selectedLang === 'ALL' 
         ? summaries 
         : summaries.filter(s => {
             const l = (s.language && s.language.trim() !== '') ? s.language.toUpperCase().trim() : 'N/A';
             return l === selectedLang;
         });

      let agentCount = 0;
      let totalOverbreak = 0;
      let totalAbsences = 0;
      let wcAlerts = 0;
      let idleAlerts = 0;
      let employeeWithAbsences = 0;
      let totalTardiness = 0;
      const topAgents: { name: string; overbreak: number; absences: number; lang: string; summary: EmployeeSummary }[] = [];

      filtered.forEach(s => {
         agentCount++;
         totalOverbreak += s.totalOverbreakMinutes || 0;
         totalAbsences += s.totalAbsences || 0;
         if ((s.totalAbsences || 0) > 0) employeeWithAbsences++;
         wcAlerts += s.wcAlerts || 0;
         idleAlerts += s.idleAlerts || 0;
         totalTardiness += s.totalTardinessMinutes || 0;

         if (s.totalOverbreakMinutes > 0 || s.totalAbsences > 0 || Math.floor((s.totalTardinessMinutes || 0)/60) > 0 || showRealTime) {
             topAgents.push({
                name: s.employeeName,
                overbreak: s.totalOverbreakMinutes || 0,
                absences: s.totalAbsences || 0,
                lang: (s.language && s.language.trim() !== '') ? s.language.toUpperCase().trim() : 'N/A',
                summary: s
             } as any);
         }
      });

      if (!showRealTime) {
         topAgents.sort((a, b) => (b.overbreak + b.absences * 60) - (a.overbreak + a.absences * 60));
      }

      return {
         agentCount,
         totalOverbreak,
         totalAbsences,
         wcAlerts,
         idleAlerts,
         employeeWithAbsences,
         totalTardiness,
         topAgents: topAgents
      };
   }, [summaries, selectedLang]);

   return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: idx * 0.05 }}
        className="bg-white border-2 border-slate-100 rounded-[2rem] p-6 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all group relative overflow-hidden flex flex-col"
      >
        <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full opacity-[0.03] transition-transform group-hover:scale-110 ${stats.totalOverbreak > 500 || stats.totalAbsences > 2 ? 'bg-rose-500' : 'bg-indigo-500'}`} />

        <div className="relative z-10 flex flex-col flex-1">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
            <div className="flex flex-col">
              <h3 className="text-xl font-black text-slate-900 leading-tight">{formatLOB(lobName)}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                   <Users className="w-3 h-3" /> {stats.agentCount} {t('agentsString')}
                </span>
                {(stats.totalOverbreak > 500 || stats.totalAbsences > 3) && (
                  <div className="flex items-center gap-1 bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black uppercase">{t('critical')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Language Selector */}
            {languages.length > 2 && (
               <div className="flex flex-wrap gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100 shrink-0">
                 {languages.map(lang => (
                    <button
                      key={lang}
                      onClick={() => setSelectedLang(lang)}
                      className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${selectedLang === lang ? 'bg-indigo-600 text-white shadow-sm' : 'bg-transparent text-slate-500 hover:bg-slate-200'}`}
                    >
                      {lang === 'ALL' ? t('allShort') : lang}
                    </button>
                 ))}
               </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-6 gap-x-4 mb-8">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <Clock className="w-3 h-3" /> {t('exceptions')}
              </span>
              <div className="flex flex-col">
                <span className={`text-xl font-black leading-none ${stats.totalOverbreak > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {Math.floor(stats.totalOverbreak / 60)}h <span className="text-sm">{stats.totalOverbreak % 60}m</span>
                </span>
                <span className="text-[10px] font-bold text-slate-400 mt-1">{t('avg')}: {stats.agentCount > 0 ? Math.round(stats.totalOverbreak / stats.agentCount) : 0}m / ag</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <CalendarX className="w-3 h-3" /> {t('absencesString')}
              </span>
              <div className="flex flex-col">
                <span className={`text-xl font-black leading-none ${stats.totalAbsences > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {stats.totalAbsences}
                </span>
                <span className="text-[10px] font-bold text-slate-400 mt-1">
                  {`${stats.employeeWithAbsences} ${t('agMissed')}`}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <TrendingDown className="w-3 h-3" /> {t('idleOrgaLabel')}
              </span>
              <div className="flex flex-col">
                <span className="text-xl font-black leading-none text-amber-600">
                  {stats.idleAlerts + stats.wcAlerts}
                </span>
                <div className="flex gap-2 text-[9px] font-black text-slate-400 uppercase mt-1">
                  <span>{t('orgaLabelShort')}:{stats.wcAlerts}</span>
                  <span>{t('idleLabelShort')}:{stats.idleAlerts}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                 <AlertTriangle className="w-3 h-3" /> {t('delays')}
              </span>
              <div className="flex flex-col">
                <span className={`text-xl font-black leading-none ${stats.totalTardiness > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                  {Math.floor(stats.totalTardiness / 60)}h <span className="text-sm">{stats.totalTardiness % 60}m</span>
                </span>
                <span className="text-[10px] font-bold text-slate-400 mt-1">{t('totalTime')}</span>
              </div>
            </div>
          </div>

          {/* Top Agents List */}
          <div className="mt-auto pt-5 border-t border-slate-100">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                {showRealTime ? (
                  <><Target className="w-3 h-3" /> Leaderboard ({selectedLang === 'ALL' ? t('allLangs') : selectedLang})</>
                ) : (
                  <><Globe className="w-3 h-3" /> {t('biggestInfractors')} ({selectedLang === 'ALL' ? t('allLangs') : selectedLang})</>
                )}
              </span>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                {showRealTime ? 'TOP AGENTS' : t('onlyExceeded')}
              </span>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {stats.topAgents.length === 0 ? (
                 <div className="text-[11px] text-slate-400 font-bold py-2 bg-slate-50/50 rounded-lg text-center border border-slate-100/50">{t('noCriticalAgent')}</div>
              ) : stats.topAgents.map((agent, aIdx) => (
                 <AgentVarianceRow key={`${agent.name}-${aIdx}`} agent={agent} aIdx={aIdx} selectedLang={selectedLang} t={t} showRealTime={showRealTime} />
              ))}
            </div>
          </div>
          
        </div>
      </motion.div>
   );
}

const AgentVarianceRow: React.FC<{ agent: any, aIdx: number, selectedLang: string, t: any, showRealTime?: boolean }> = ({ agent, aIdx, selectedLang, t, showRealTime }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { lang } = useLanguage();

  const exceptions = useMemo(() => {
    if (!agent.summary || !agent.summary.dailyRecords) return [];
    
    const results: any[] = [];
    agent.summary.dailyRecords.forEach((r: any) => {
      if (r.isAbsence) {
        results.push({ date: r.date, type: lang === 'pt' ? 'FALTA' : 'ABSENCE', duration: '-', time: '-', isOverbreakType: false });
      }
      if ((r.tardinessMinutes || 0) >= 15) {
        results.push({ date: r.date, type: lang === 'pt' ? 'ATRASO' : 'DELAY', duration: `${r.tardinessMinutes}m`, time: r.actualStartTime ? format(r.actualStartTime, 'HH:mm') : '-', isOverbreakType: false });
      }
      if ((r.earlyLeaveMinutes || 0) > 0) {
        results.push({ date: r.date, type: lang === 'pt' ? 'SAÍDA ANTECIPADA' : 'EARLY LEAVE', duration: `${r.earlyLeaveMinutes}m`, time: r.actualEndTime ? format(r.actualEndTime, 'HH:mm') : '-', isOverbreakType: false });
      }

      const typeSums: Record<string, number> = {};
      const sortedBreaks = r.breaks ? [...r.breaks].sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()) : [];

      sortedBreaks.forEach((b: any) => {
        const prevSum = typeSums[b.type] || 0;
        const newSum = prevSum + b.durationMinutes;
        typeSums[b.type] = newSum;

        let idealTime = 0;
        if (b.type === 'meal') idealTime = 60;
        else if (b.type === 'short') idealTime = 30;
        else if (b.type === 'wellness' || b.type === 'praying') idealTime = 15;
        else if (b.type === 'wc') idealTime = 10;
        
        let isOverbreak = false;
        let excessTime = 0;
        let usedIdeal = 0;

        if (b.type === 'idle' || b.type === 'forgot_status') {
           if (b.durationMinutes > 2) {
               isOverbreak = true;
               excessTime = b.durationMinutes;
               usedIdeal = 0;
           }
        } else if (idealTime > 0) {
           if (newSum > idealTime) {
              const excess = Math.min(b.durationMinutes, newSum - idealTime);
              if (b.type === 'wc' || b.type === 'praying' || b.type === 'wellness') {
                  isOverbreak = true;
              } else {
                  if (excess > 2) isOverbreak = true;
              }
              if (isOverbreak) {
                  excessTime = excess;
                  usedIdeal = b.durationMinutes - excess;
              }
           }
        }

        if (isOverbreak) {
           let typeLabel = b.type.toUpperCase();
           if (b.type === 'wc') typeLabel = 'ORGANIC';
           results.push({
             date: r.date,
             type: typeLabel,
             duration: `${b.durationMinutes}m`,
             isOverbreakType: true,
             allowed: usedIdeal,
             excess: excessTime,
             total: b.durationMinutes,
             time: (b.startTime && b.endTime) ? `${format(new Date(b.startTime), 'HH:mm')} - ${format(new Date(b.endTime), 'HH:mm')}` : '-'
           });
        }
      });
    });

    results.sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    return results;
  }, [agent]);

  return (
    <div className={`flex flex-col bg-slate-50/80 rounded-xl border border-transparent transition-all overflow-hidden ${exceptions.length > 0 ? "hover:border-slate-200" : ""}`}>
      <div 
        onClick={() => exceptions.length > 0 && setIsExpanded(!isExpanded)}
        className={`flex items-center justify-between p-2.5 select-none ${exceptions.length > 0 ? "cursor-pointer" : ""}`}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          <span className="text-[10px] font-black text-slate-300 w-4 shrink-0 text-center">#{aIdx + 1}</span>
          <span className="text-[11px] font-bold text-slate-700 truncate">{agent.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {selectedLang === 'ALL' && agent.lang !== 'N/A' && (
             <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 border border-indigo-100 rounded flex items-center gap-0.5">
               {agent.lang}
             </span>
          )}
          {(!showRealTime && agent.absences > 0) && (
            <span className="text-[9px] font-black text-red-600 bg-red-50/80 px-1.5 py-0.5 border border-red-100 rounded shadow-sm">{t('absencesLabel')}: {agent.absences}</span>
          )}
          {(!showRealTime && agent.overbreak > 0) && (
            <span className="text-[9px] font-black text-rose-600 bg-rose-50/80 px-1.5 py-0.5 border border-rose-100 rounded shadow-sm">
              {t('exceededLabel')}: {agent.overbreak}m
            </span>
          )}
          {exceptions.length > 0 && (
            <div className="text-slate-400 ml-1">
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          )}
        </div>
      </div>
      
      <AnimatePresence>
        {isExpanded && exceptions.length > 0 && (
          <motion.div
             initial={{ height: 0, opacity: 0 }}
             animate={{ height: "auto", opacity: 1 }}
             exit={{ height: 0, opacity: 0 }}
             className="overflow-hidden bg-white border-t border-slate-100"
          >
            <div className="p-2 space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
               {exceptions.map((exc, i) => (
                 <div key={i} className="flex items-center justify-between py-1 px-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-100 transition-colors">
                   <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-slate-400">{format(new Date(exc.date + "T12:00:00"), 'dd/MM')}</span>
                      <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${exc.type === 'ORGANIC' || exc.type === 'IDLE' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                        {exc.type}
                      </span>
                   </div>
                   <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-slate-500">{exc.time}</span>
                      <div className="flex items-center gap-1 justify-end">
                         {exc.isOverbreakType ? (
                            <>
                               {exc.allowed > 0 && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-1 rounded shadow-sm" title="Tempo permitido">{exc.allowed}m</span>}
                               {exc.excess > 0 && <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-1 rounded shadow-sm" title="Tempo excedido">+{exc.excess}m</span>}
                            </>
                         ) : (
                            <span className="text-[10px] font-black text-slate-700 text-right">{exc.duration}</span>
                         )}
                      </div>
                   </div>
                 </div>
               ))}
               {exceptions.length === 0 && (
                 <div className="p-2 text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">Sem detalhes disponíveis</div>
               )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
