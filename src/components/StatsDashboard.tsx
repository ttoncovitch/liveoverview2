import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { EmployeeSummary, BreakSession } from '../types';
import { AlertCircle, Users, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useLanguage } from '../contexts/LanguageContext';
import { format } from 'date-fns';
import { isShiftMismatch, formatLOB } from '../lib/shiftUtils';
import { PaginatedAgentList } from './PaginatedAgentList';

interface StatsDashboardProps {
  summaries: EmployeeSummary[];
  allSummaries: EmployeeSummary[];
  periodSummaries?: EmployeeSummary[];
  latestDate?: Date;
  globalTypeFilter: 'all' | 'idle_overbreak_wc';
  globalTimeFilter?: 'all' | 'month' | 'week' | 'day' | 'yesterday';
  globalIncludeWc: boolean;
  globalIncludeIdle: boolean;
  globalIncludeNonMod: boolean;
  globalIncludeTardiness: boolean;
  globalIncludeMinorTardiness?: boolean;
  globalIncludeEarlyLeave: boolean;
  globalIncludeShort30Min?: boolean;
  globalIncludeAbsences?: boolean;
  globalIncludeOffboarded?: boolean;
  globalIncludeATT?: boolean;
  globalIncludeLOA?: boolean;
  globalIncludePTO?: boolean;
  globalIncludeSL?: boolean;
  globalIncludeSUSPP?: boolean;
  globalIncludeOFF?: boolean;
  globalIncludeNextVacations?: boolean;
  globalIncludeCheck?: boolean;
  globalFilterMajorOverbreaks: boolean;
  globalShiftFilter?: string[];
  basePeriodCount?: number;
  showRealTime?: boolean;
}

export function StatsDashboard({ 
  summaries, 
  allSummaries, 
  periodSummaries = [], 
  latestDate, 
  globalTypeFilter, 
  globalTimeFilter,
  globalIncludeWc, 
  globalIncludeIdle, 
  globalIncludeNonMod, 
  globalIncludeTardiness, 
  globalIncludeMinorTardiness,
  globalIncludeEarlyLeave, 
  globalIncludeShort30Min, 
  globalIncludeAbsences, 
  globalIncludeOffboarded, 
  globalIncludeATT,
  globalIncludeLOA,
  globalIncludePTO,
  globalIncludeSL,
  globalIncludeSUSPP,
  globalIncludeOFF,
  globalIncludeNextVacations,
  globalIncludeCheck, 
  globalFilterMajorOverbreaks, 
  globalShiftFilter = [], 
  basePeriodCount,
  showRealTime
}: StatsDashboardProps) {
  const { t, lang } = useLanguage();
  
  const isWcOnly = globalIncludeWc && !globalIncludeShort30Min && !globalIncludeAbsences && !globalIncludeOffboarded && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeTardiness && !globalIncludeEarlyLeave && !globalIncludeCheck && !globalIncludeATT && !globalIncludeLOA && !globalIncludePTO && !globalIncludeSL && !globalIncludeSUSPP && !globalIncludeOFF && globalTypeFilter === 'all';
  const isIdleOnly = globalIncludeIdle && !globalIncludeShort30Min && !globalIncludeAbsences && !globalIncludeOffboarded && !globalIncludeWc && !globalIncludeNonMod && !globalIncludeTardiness && !globalIncludeEarlyLeave && !globalIncludeCheck && !globalIncludeATT && !globalIncludeLOA && !globalIncludePTO && !globalIncludeSL && !globalIncludeSUSPP && !globalIncludeOFF && globalTypeFilter === 'all';
  const isNonModOnly = globalIncludeNonMod && !globalIncludeShort30Min && !globalIncludeAbsences && !globalIncludeOffboarded && !globalIncludeWc && !globalIncludeIdle && !globalIncludeTardiness && !globalIncludeEarlyLeave && !globalIncludeCheck && !globalIncludeATT && !globalIncludeLOA && !globalIncludePTO && !globalIncludeSL && !globalIncludeSUSPP && !globalIncludeOFF && globalTypeFilter === 'all';
  const isTardinessOnly = globalIncludeTardiness && !globalIncludeMinorTardiness && !globalIncludeShort30Min && !globalIncludeAbsences && !globalIncludeOffboarded && !globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeEarlyLeave && !globalIncludeCheck && !globalIncludeATT && !globalIncludeLOA && !globalIncludePTO && !globalIncludeSL && !globalIncludeSUSPP && !globalIncludeOFF && globalTypeFilter === 'all';
  const isMinorTardinessOnly = globalIncludeTardiness && globalIncludeMinorTardiness && !globalIncludeShort30Min && !globalIncludeAbsences && !globalIncludeOffboarded && !globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeEarlyLeave && !globalIncludeCheck && !globalIncludeATT && !globalIncludeLOA && !globalIncludePTO && !globalIncludeSL && !globalIncludeSUSPP && !globalIncludeOFF && globalTypeFilter === 'all';
  const isEarlyLeaveOnly = globalIncludeEarlyLeave && !globalIncludeShort30Min && !globalIncludeAbsences && !globalIncludeOffboarded && !globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeTardiness && !globalIncludeCheck && !globalIncludeATT && !globalIncludeLOA && !globalIncludePTO && !globalIncludeSL && !globalIncludeSUSPP && !globalIncludeOFF && globalTypeFilter === 'all';
  const isShort30MinOnly = globalIncludeShort30Min && !globalIncludeAbsences && !globalIncludeOffboarded && !globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeTardiness && !globalIncludeEarlyLeave && !globalIncludeCheck && !globalIncludeATT && !globalIncludeLOA && !globalIncludePTO && !globalIncludeSL && !globalIncludeSUSPP && !globalIncludeOFF && globalTypeFilter === 'all';
  const isAbsencesOnly = globalIncludeAbsences && !globalIncludeOffboarded && !globalIncludeShort30Min && !globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeTardiness && !globalIncludeEarlyLeave && !globalIncludeCheck && !globalIncludeATT && !globalIncludeLOA && !globalIncludePTO && !globalIncludeSL && !globalIncludeSUSPP && !globalIncludeOFF && globalTypeFilter === 'all';
  const isOffboardedOnly = globalIncludeOffboarded && !globalIncludeAbsences && !globalIncludeShort30Min && !globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeTardiness && !globalIncludeEarlyLeave && !globalIncludeCheck && !globalIncludeATT && !globalIncludeLOA && !globalIncludePTO && !globalIncludeSL && !globalIncludeSUSPP && !globalIncludeOFF && globalTypeFilter === 'all';
  const isCheckOnly = (globalIncludeCheck && !globalIncludeShort30Min && !globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeTardiness && !globalIncludeEarlyLeave && !globalIncludeATT && !globalIncludeLOA && !globalIncludePTO && !globalIncludeSL && !globalIncludeSUSPP && !globalIncludeOFF && globalTypeFilter === 'all') || (globalShiftFilter.length === 1 && globalShiftFilter[0] === 'CHECK');

  const baseNoFilters = !globalIncludeShort30Min && !globalIncludeAbsences && !globalIncludeOffboarded && !globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeTardiness && !globalIncludeEarlyLeave && !globalIncludeCheck && globalTypeFilter === 'all';
  const isATTOnly = globalIncludeATT && baseNoFilters && !globalIncludeLOA && !globalIncludePTO && !globalIncludeSL && !globalIncludeSUSPP && !globalIncludeOFF;
  const isLOAOnly = globalIncludeLOA && baseNoFilters && !globalIncludeATT && !globalIncludePTO && !globalIncludeSL && !globalIncludeSUSPP && !globalIncludeOFF;
  const isPTOOnly = globalIncludePTO && baseNoFilters && !globalIncludeATT && !globalIncludeLOA && !globalIncludeSL && !globalIncludeSUSPP && !globalIncludeOFF;
  const isSLOnly = globalIncludeSL && baseNoFilters && !globalIncludeATT && !globalIncludeLOA && !globalIncludePTO && !globalIncludeSUSPP && !globalIncludeOFF;
  const isSUSPPOnly = globalIncludeSUSPP && baseNoFilters && !globalIncludeATT && !globalIncludeLOA && !globalIncludePTO && !globalIncludeSL && !globalIncludeOFF;
  const isOFFOnly = globalIncludeOFF && baseNoFilters && !globalIncludeATT && !globalIncludeLOA && !globalIncludePTO && !globalIncludeSL && !globalIncludeSUSPP;

  const activeExtraStatus = isATTOnly ? t('statusAtt') : isLOAOnly ? t('statusLoa') : isPTOOnly ? t('statusPto') : isSLOnly ? t('statusSl') : isSUSPPOnly ? t('statusSuspp') : isOFFOnly ? t('statusOff') : null;
  const attrKey = isATTOnly ? 'isATT' : isLOAOnly ? 'isLOA' : isPTOOnly ? 'isPTO' : isSLOnly ? 'isSL' : isSUSPPOnly ? 'isSUSPP' : isOFFOnly ? 'isOFF' : null;

  const hasCheckFilter = globalShiftFilter.includes('CHECK') || !!globalIncludeCheck;
  const specificShifts = globalShiftFilter.filter(s => s !== 'CHECK');
  const isCheckAndShift = hasCheckFilter && specificShifts.length > 0;

  const filteredPeriodSummaries = useMemo(() => periodSummaries.filter(s => s.dailyRecords.some(r => (!r.isOFF && !r.isPTO && !r.isLOA && !r.isSL && !r.isSUSPP && !r.isATT) || r.isAbsence)), [periodSummaries]);

  const cleanShift = (shift: string) => {
    const match = shift.match(/\b(\d{2}:\d{2}-\d{2}:\d{2})\b/);
    return match ? match[1] : shift;
  };

  const agentsDoPeriodoCount = isCheckAndShift ? filteredPeriodSummaries.filter(s => s.dailyRecords.some(r => r.scheduledShift && specificShifts.includes(cleanShift(r.scheduledShift)))).length : filteredPeriodSummaries.length;
  
  const agentsNoPeriodoCount = isCheckAndShift ? filteredPeriodSummaries.filter(s => s.dailyRecords.some(r => r.inferredShift && specificShifts.includes(cleanShift(r.inferredShift)))).length : filteredPeriodSummaries.length;

  const totalAbsencesInPeriod = useMemo(() => {
    return periodSummaries.filter(s => (s.totalAbsences || 0) > 0 && !s.isOffboarded).length;
  }, [periodSummaries]);

  const totalOffboardedInPeriod = useMemo(() => {
    return periodSummaries.filter(s => s.isOffboarded).length;
  }, [periodSummaries]);

  const totalATTInPeriod = useMemo(() => periodSummaries.filter(s => s.isATT).length, [periodSummaries]);
  const totalLOAInPeriod = useMemo(() => periodSummaries.filter(s => s.isLOA).length, [periodSummaries]);
  const totalPTOInPeriod = useMemo(() => periodSummaries.filter(s => s.isPTO).length, [periodSummaries]);
  const totalSLInPeriod = useMemo(() => periodSummaries.filter(s => s.isSL).length, [periodSummaries]);
  const totalSUSPPInPeriod = useMemo(() => periodSummaries.filter(s => s.isSUSPP).length, [periodSummaries]);
  const totalOFFInPeriod = useMemo(() => periodSummaries.filter(s => s.isOFF).length, [periodSummaries]);

  const agentsDeOutroPeriodoCount = isCheckAndShift ? periodSummaries.filter(s => s.dailyRecords.some(r => r.inferredShift && specificShifts.includes(cleanShift(r.inferredShift)) && r.scheduledShift && !specificShifts.includes(cleanShift(r.scheduledShift)))).length : 0;

  const [detailsSortMode, setDetailsSortMode] = useState<'duration' | 'date'>('duration');

  const dashboardSummaries = useMemo(() => {
    return summaries.map(s => {
      const newRecords = s.dailyRecords.map(r => {
        const allowedBreaks = r.breaks;
        
        let wcDur = 0, idleDur = 0, mealDur = 0, shortDur = 0, wellnessDur = 0, prayingDur = 0, meetingDur = 0, modDur = 0, nonModDur = 0;
        
        allowedBreaks.forEach(b => {
           if (b.type === 'wc') { wcDur += b.durationMinutes; }
           else if (b.type === 'idle') { idleDur += b.durationMinutes; }
           else if (b.type === 'meal') { mealDur += b.durationMinutes; }
           else if (b.type === 'short') { shortDur += b.durationMinutes; }
           else if (b.type === 'wellness') { wellnessDur += b.durationMinutes; }
           else if (b.type === 'praying') { prayingDur += b.durationMinutes; }
           else if (b.type === 'meeting') { meetingDur += b.durationMinutes; }
           else if (b.type === 'moderating') { modDur += b.durationMinutes; }
           else if (b.type === 'non_moderating') { nonModDur += b.durationMinutes; }
        });

        let wcOver = Math.max(0, wcDur - 10);
        let mealOver = Math.max(0, mealDur - 60);
        let shortOver = Math.max(0, shortDur - 30);
        let wellnessOver = Math.max(0, wellnessDur - 15);
        let prayingOver = Math.max(0, prayingDur - 15);
        let idleOver = idleDur;

        if (globalFilterMajorOverbreaks) {
            if (mealOver <= 2) mealOver = 0;
            if (shortOver <= 2) shortOver = 0;
            if (idleOver <= 2) idleOver = 0;
        }

        const isWcOnly = globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeTardiness && !globalIncludeEarlyLeave && globalTypeFilter === 'all';
        const isIdleOnly = globalIncludeIdle && !globalIncludeWc && !globalIncludeNonMod && !globalIncludeTardiness && !globalIncludeEarlyLeave && globalTypeFilter === 'all';
        const isOverbreakOnly = globalTypeFilter === 'idle_overbreak_wc' && !globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeTardiness && !globalIncludeEarlyLeave;
        const isNonModOnlyCalc = globalIncludeNonMod && !globalIncludeWc && !globalIncludeIdle && !globalIncludeTardiness && !globalIncludeEarlyLeave && globalTypeFilter === 'all';
        const isTardinessOnlyCalc = globalIncludeTardiness && !globalIncludeMinorTardiness && !globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeEarlyLeave && globalTypeFilter === 'all';
        const isMinorTardinessOnlyCalc = globalIncludeTardiness && globalIncludeMinorTardiness && !globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeEarlyLeave && globalTypeFilter === 'all';
        const isEarlyLeaveOnlyCalc = globalIncludeEarlyLeave && !globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeTardiness && globalTypeFilter === 'all';

        let dailyOverbreak = 0;
        if (isNonModOnlyCalc) {
          dailyOverbreak = nonModDur;
        } else if (isWcOnly) {
          dailyOverbreak = wcDur;
        } else if (isIdleOnly) {
          dailyOverbreak = idleOver;
        } else if (isTardinessOnlyCalc) {
          dailyOverbreak = (r.tardinessMinutes || 0) >= 15 ? r.tardinessMinutes! : 0;
        } else if (isMinorTardinessOnlyCalc) {
          dailyOverbreak = (r.tardinessMinutes || 0) > 0 && (r.tardinessMinutes || 0) < 15 ? r.tardinessMinutes! : 0;
        } else if (isEarlyLeaveOnlyCalc) {
          dailyOverbreak = r.earlyLeaveMinutes || 0;
        } else if (isOverbreakOnly) {
          dailyOverbreak = mealOver + shortOver + wellnessOver + prayingOver;
        } else {
          // Combined or Default
          dailyOverbreak = mealOver + shortOver + wellnessOver + prayingOver;
        }

        return {
          ...r,
          breaks: allowedBreaks,
          wcDuration: wcDur,
          idleDuration: idleDur,
          mealDuration: mealDur,
          shortDuration: shortDur,
          wellnessDuration: wellnessDur,
          prayingDuration: prayingDur,
          wcOverbreak: wcOver,
          idleOverbreak: idleOver,
          mealOverbreak: mealOver,
          shortOverbreak: shortOver,
          wellnessOverbreak: wellnessOver,
          prayingOverbreak: prayingOver,
          totalOverbreak: dailyOverbreak
        };
      });

      const totalOverbreakMinutes = newRecords.reduce((acc, r) => acc + r.totalOverbreak, 0);
      const wcTotalMinutes = newRecords.reduce((acc, r) => acc + r.wcDuration, 0);
      const wcAlerts = newRecords.reduce((acc, r) => acc + (r.wcDuration > 10 ? 1 : 0), 0);
      const idleAlerts = newRecords.reduce((acc, r) => acc + (r.idleDuration > 0 ? 1 : 0), 0);

      return {
        ...s,
        dailyRecords: newRecords,
        totalOverbreakMinutes,
        wcTotalMinutes,
        wcAlerts,
        idleAlerts
      };
    });
  }, [summaries, globalFilterMajorOverbreaks, globalIncludeWc, globalIncludeIdle, globalIncludeNonMod, globalTypeFilter]);

  const filteredSummaries = dashboardSummaries;

  const extData = useMemo(() => {
     if (!attrKey) return { out: [], soon: [], back: [] };
     
     const out: any[] = [];
     const soon: any[] = [];
     const back: any[] = [];
     const refDateStr = format(latestDate || new Date(), 'yyyy-MM-dd');

     const todayStr = format(new Date(), 'yyyy-MM-dd');
     const isMonthOrAll = globalTimeFilter === 'month' || globalTimeFilter === 'all';
     
     filteredSummaries.forEach(s => {
        const fullEmp = allSummaries.find(emp => emp.employeeName === s.employeeName) || s;
        
        // Find all contiguous blocks of the status
        const sortedAll = [...fullEmp.dailyRecords].sort((a,b) => a.date.localeCompare(b.date));
        let currentBlock: { start: string, lastStatus: string } | null = null;
        const tempBlocks: typeof currentBlock[] = [];

        sortedAll.forEach((r) => {
            const hasStatus = !!r[attrKey as keyof typeof r];
            
            if (hasStatus) {
                if (!currentBlock) {
                    currentBlock = { start: r.date, lastStatus: r.date };
                } else {
                    currentBlock.lastStatus = r.date;
                }
            } else if (r.isOFF && currentBlock) {
                // Stay in block during OFF days to bridge weekends
            } else {
                if (currentBlock) {
                    tempBlocks.push(currentBlock);
                    currentBlock = null;
                }
            }
        });
        
        if (currentBlock) {
            tempBlocks.push(currentBlock);
        }

        const blocks = tempBlocks.map(b => {
             const nextDay = new Date(b.lastStatus + "T12:00:00");
             nextDay.setDate(nextDay.getDate() + 1);
             return {
                 start: b.start,
                 end: b.lastStatus,
                 returnDate: format(nextDay, 'yyyy-MM-dd')
             };
        });

        if (blocks.length === 0) return;

        // Determine which block to show based on today/refDate
        const currentRef = isMonthOrAll ? todayStr : refDateStr;
        const currentRefDate = new Date(currentRef + 'T12:00:00');
        currentRefDate.setDate(currentRefDate.getDate() + 1);
        const tomorrowStr = format(currentRefDate, 'yyyy-MM-dd');
        
        // 1. Check if currently in a block
        const activeBlock = blocks.find(b => b.start <= currentRef && b.returnDate > currentRef);
        if (activeBlock) {
            if (activeBlock.returnDate === tomorrowStr) {
                soon.push({ summary: s, startDate: activeBlock.start, endDate: activeBlock.end, returnDate: activeBlock.returnDate });
            } else {
                out.push({ summary: s, startDate: activeBlock.start, endDate: activeBlock.end, returnDate: activeBlock.returnDate });
            }
            return;
        }

        // 2. Check for future block (Soon)
        const futureBlocks = blocks.filter(b => b.start > currentRef).sort((a,b) => a.start.localeCompare(b.start));
        if (futureBlocks.length > 0) {
            const fb = futureBlocks[0];
            soon.push({ summary: s, startDate: fb.start, endDate: fb.end, returnDate: fb.returnDate });
            return;
        }

        // 3. Check for past block (Back)
        const pastBlocks = blocks.filter(b => b.returnDate <= currentRef).sort((a,b) => b.returnDate.localeCompare(a.returnDate));
        if (pastBlocks.length > 0) {
            const pb = pastBlocks[0];
            back.push({ summary: s, startDate: pb.start, endDate: pb.end, returnDate: pb.returnDate });
        }
     });

     out.sort((a, b) => a.startDate.localeCompare(b.startDate));
     soon.sort((a, b) => a.startDate.localeCompare(b.startDate));
     back.sort((a, b) => a.returnDate.localeCompare(b.returnDate));

     return { out, soon, back };
  }, [filteredSummaries, allSummaries, attrKey, latestDate, globalTimeFilter]);

  
  // Use periodSummaries size if it has elements (meaning filters applied)
  // or fall back to allSummaries length
  const totalEmployees = (globalTimeFilter !== 'all' || (basePeriodCount !== undefined && basePeriodCount < allSummaries.length)) ? filteredPeriodSummaries.length : allSummaries.length;
  
  let affectedCount = 0;
  let affectedText = '';

  if (activeExtraStatus && extData) {
      if (globalTimeFilter === 'all' || globalTimeFilter === 'month') {
          affectedCount = extData.out.length;
          affectedText = `${t('inStatus')} ${activeExtraStatus}`;
      } else {
          affectedCount = extData.out.length + extData.soon.length + extData.back.length;
          affectedText = `${t('inStatus')} ${activeExtraStatus}`;
      }
  } else if (isCheckOnly) {
       affectedCount = filteredSummaries.length;
      affectedText = t('outsideSchedule');
  } else if (isNonModOnly) {
      affectedCount = filteredSummaries.filter(s => s.dailyRecords.some(r => r.breaks.some(b => b.type === 'non_moderating'))).length;
      affectedText = t('inNonMod');
  } else if (isWcOnly) {
      affectedCount = filteredSummaries.filter(s => s.wcAlerts > 0).length;
      affectedText = t('organicExcess');
  } else if (isIdleOnly) {
      affectedCount = filteredSummaries.filter(s => s.idleAlerts > 0).length;
      affectedText = t('withIdle');
  } else if (isTardinessOnly) {
      affectedCount = filteredSummaries.filter(s => s.dailyRecords.some(r => (r.tardinessMinutes || 0) >= 15)).length;
      affectedText = t('tardyAgents');
  } else if (isMinorTardinessOnly) {
      affectedCount = filteredSummaries.filter(s => s.dailyRecords.some(r => (r.tardinessMinutes || 0) > 0 && (r.tardinessMinutes || 0) < 15)).length;
      affectedText = t('minorTardyAgents');
  } else if (isShort30MinOnly) {
      affectedCount = filteredSummaries.filter(s => (s.totalShort30MinRecords || 0) > 0).length;
      affectedText = t('onlyOneBreak');
  } else if (isEarlyLeaveOnly) {
      affectedCount = filteredSummaries.filter(s => s.dailyRecords.some(r => (r.earlyLeaveMinutes || 0) > 0)).length;
      affectedText = t('earlyLeaveAlerts');
  } else if (isAbsencesOnly) {
      affectedCount = filteredPeriodSummaries.filter(s => (s.totalAbsences || 0) > 0).length;
      affectedText = t('withAbsencesPeriod');
  } else if (isOffboardedOnly) {
      affectedCount = filteredSummaries.filter(s => s.isOffboarded).length;
      affectedText = t('offboardedAgents');
  } else if (globalTypeFilter === 'idle_overbreak_wc') {
      affectedCount = filteredSummaries.filter(s => s.totalOverbreakMinutes > 0 || (globalIncludeWc && s.wcAlerts > 0) || (globalIncludeIdle && s.idleAlerts > 0) || (globalIncludeTardiness && s.dailyRecords.some(r => (globalIncludeMinorTardiness ? ((r.tardinessMinutes || 0) > 0 && (r.tardinessMinutes || 0) < 15) : (r.tardinessMinutes || 0) >= 15))) || (globalIncludeEarlyLeave && s.dailyRecords.some(r => (r.earlyLeaveMinutes || 0) > 0))).length;
      affectedText = t('overbreakAffected');
  } else {
      affectedCount = filteredSummaries.filter(s => s.totalOverbreakMinutes > 0 || (globalIncludeWc && s.wcAlerts > 0) || (globalIncludeIdle && s.idleAlerts > 0) || (globalIncludeTardiness && s.dailyRecords.some(r => (globalIncludeMinorTardiness ? ((r.tardinessMinutes || 0) > 0 && (r.tardinessMinutes || 0) < 15) : (r.tardinessMinutes || 0) >= 15))) || (globalIncludeEarlyLeave && s.dailyRecords.some(r => (r.earlyLeaveMinutes || 0) > 0))).length;
      affectedText = t('overbreakAffectedGeneral');
  }

  const isDefaultNoFilters = globalTypeFilter === 'all' && !globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && !globalIncludeTardiness;

  const isWcApplicable = (isDefaultNoFilters || globalIncludeWc) && !isCheckOnly;
  const isIdleApplicable = (isDefaultNoFilters || globalIncludeIdle) && !isCheckOnly;

  const totalOverbreak = filteredSummaries.reduce((acc, curr) => acc + curr.totalOverbreakMinutes, 0);
  const distinctDaysInPeriod = useMemo(() => {
     const days = new Set<string>();
     filteredSummaries.forEach(s => s.dailyRecords.forEach(r => days.add(r.date)));
     return days.size;
  }, [filteredSummaries]);

  const avgAgentsMismatched = useMemo(() => {
     if (distinctDaysInPeriod === 0) return 0;
     let totalMismatches = 0;
     filteredSummaries.forEach(s => {
        totalMismatches += s.dailyRecords.filter(r => isShiftMismatch(r.scheduledShift, r.inferredShift)).length;
     });
     return Math.round(totalMismatches / distinctDaysInPeriod);
  }, [filteredSummaries, distinctDaysInPeriod]);
  const totalDays = filteredSummaries.reduce((acc, curr) => acc + curr.dailyRecords.length, 0);
  const totalWcMinutes = filteredSummaries.reduce((acc, curr) => 
    acc + curr.dailyRecords.reduce((a, r) => a + r.wcDuration, 0)
  , 0);
  const totalIdleMinutes = filteredSummaries.reduce((acc, curr) => 
    acc + curr.dailyRecords.reduce((a, r) => a + r.idleDuration, 0)
  , 0);
  const totalWcAgents = filteredSummaries.filter(s => s.dailyRecords.some(r => r.wcDuration > 0)).length;
  const totalIdleAgents = filteredSummaries.filter(s => s.idleAlerts > 0).length;

  const isOnlyOrganic = isWcOnly;
  const isOnlyIdle = isIdleOnly;
  const isOnlyTardiness = isTardinessOnly || isEarlyLeaveOnly;

  let sumDailyAverages = 0;
  let validAgentsCount = 0;
  let agentDailyAverages: number[] = [];

  filteredSummaries.forEach(s => {
    const daysWorked = s.dailyRecords.length;
    if (daysWorked > 0) {
      let metricTotal = 0;
      if (isCheckOnly) {
          metricTotal = s.dailyRecords.filter(r => isShiftMismatch(r.scheduledShift, r.inferredShift)).length;
      } else if (isOnlyOrganic) {
          metricTotal = s.dailyRecords.reduce((acc, r) => acc + (r.wcDuration || 0), 0);
      } else if (isOnlyIdle) {
          metricTotal = s.dailyRecords.reduce((acc, r) => acc + (r.idleDuration || 0), 0);
      } else if (isTardinessOnly) {
          metricTotal = s.dailyRecords.reduce((acc, r) => acc + ((r.tardinessMinutes || 0) >= 15 ? r.tardinessMinutes! : 0), 0);
      } else if (isEarlyLeaveOnly) {
          metricTotal = s.dailyRecords.reduce((acc, r) => acc + (r.earlyLeaveMinutes || 0), 0);
      } else if (isMinorTardinessOnly) {
          metricTotal = s.dailyRecords.reduce((acc, r) => acc + ((r.tardinessMinutes || 0) > 0 && (r.tardinessMinutes || 0) < 15 ? r.tardinessMinutes! : 0), 0);
      } else {
          metricTotal = s.totalOverbreakMinutes;
      }
      
      const dailyAvg = metricTotal / daysWorked;
      sumDailyAverages += dailyAvg;
      validAgentsCount++;
      agentDailyAverages.push(dailyAvg);
    }
  });

  const avgDailyMetric = validAgentsCount ? (sumDailyAverages / validAgentsCount) : 0;
  
  let avgDailyWithoutTop5 = 0;
  if (agentDailyAverages.length > 5) {
      const sortedAverages = [...agentDailyAverages].sort((a, b) => b - a);
      const withoutTop5 = sortedAverages.slice(5);
      const sumWithoutTop5 = withoutTop5.reduce((acc, curr) => acc + curr, 0);
      avgDailyWithoutTop5 = sumWithoutTop5 / withoutTop5.length;
  } else {
      avgDailyWithoutTop5 = avgDailyMetric;
  }

  const averageTotalOverbreak = Math.round(avgDailyMetric);
  const averageWithoutTop5 = Math.round(avgDailyWithoutTop5);

  const shiftStats = useMemo(() => {
    const stats: Record<string, { minutes: number, occurrences: number }> = {};
    filteredSummaries.forEach(s => {
      const recordedShiftsForAgent = new Set<string>();
      
      s.dailyRecords.forEach(r => {
        if (!r.inferredShift && !r.scheduledShift) return;
        let shiftToUse = r.inferredShift || '';
        if (isCheckOnly) {
           shiftToUse = r.scheduledShift || shiftToUse;
        }
        if (!shiftToUse) return;
        const match = shiftToUse.match(/\b(\d{2}:\d{2}-\d{2}:\d{2})\b/);
        const shiftLabel = match ? match[1] : shiftToUse;
        if (!stats[shiftLabel]) stats[shiftLabel] = { minutes: 0, occurrences: 0 };
        
        if (isCheckOnly) {
           const mismatch = isShiftMismatch(r.scheduledShift, r.inferredShift);
           if (mismatch && !recordedShiftsForAgent.has(shiftLabel)) {
             stats[shiftLabel].occurrences += 1;
             recordedShiftsForAgent.add(shiftLabel);
           }
        } else if (isOnlyOrganic) {
           if (r.wcDuration > 0) {
             stats[shiftLabel].minutes += r.wcDuration;
             stats[shiftLabel].occurrences += 1;
           }
        } else if (isOnlyIdle) {
           if (r.idleDuration > 0) {
             stats[shiftLabel].minutes += r.idleDuration;
             stats[shiftLabel].occurrences += 1;
           }
        } else if (isTardinessOnly) {
           if ((r.tardinessMinutes || 0) >= 15) {
             stats[shiftLabel].minutes += r.tardinessMinutes || 0;
             stats[shiftLabel].occurrences += 1;
           }
        } else if (isEarlyLeaveOnly) {
           if ((r.earlyLeaveMinutes || 0) > 0) {
             stats[shiftLabel].minutes += r.earlyLeaveMinutes || 0;
             stats[shiftLabel].occurrences += 1;
           }
        } else if (isMinorTardinessOnly) {
           if ((r.tardinessMinutes || 0) > 0 && (r.tardinessMinutes || 0) < 15) {
             stats[shiftLabel].minutes += r.tardinessMinutes || 0;
             stats[shiftLabel].occurrences += 1;
           }
        } else {
           if (r.totalOverbreak > 0) {
             stats[shiftLabel].minutes += r.totalOverbreak;
             stats[shiftLabel].occurrences += 1;
           }
        }
      });
    });
    
    let mostMinutesShift = { shift: '-', minutes: 0 };
    let mostOccurrencesShift = { shift: '-', occurrences: 0 };
    
    Object.entries(stats).forEach(([shift, data]) => {
      if (data.minutes > mostMinutesShift.minutes) {
        mostMinutesShift = { shift, minutes: data.minutes };
      }
      if (data.occurrences > mostOccurrencesShift.occurrences) {
        mostOccurrencesShift = { shift, occurrences: data.occurrences };
      }
    });

    return { 
      mostMinutes: { shift: mostMinutesShift.shift, minutes: mostMinutesShift.minutes }, 
      mostOccurrences: { shift: mostOccurrencesShift.shift, occurrences: mostOccurrencesShift.occurrences }
    };
  }, [filteredSummaries]);
  
  // Metrics for "Precisa de atenção"
  const agentsByOverbreakCount = [...filteredSummaries]
    .map(s => {
      const incidentCount = s.dailyRecords.reduce((acc, r) => {
        const breakIncidents = r.breaks.filter(b => {
          let ideal = (b.type === 'meal') ? 60 : (b.type === 'short') ? 30 : (b.type === 'wellness' || b.type === 'praying') ? 15 : (b.type === 'wc') ? 10 : 0;
          return ideal > 0 && b.durationMinutes > ideal;
        }).length;
        return acc + breakIncidents + (r.idleDuration > 0 ? 1 : 0);
      }, 0);
      return { ...s, incidentCount };
    })
    .filter(s => s.incidentCount > 0)
    .sort((a, b) => b.incidentCount - a.incidentCount)
    .slice(0, 10);

  const agentsByOverbreakDuration = [...filteredSummaries]
    .filter(s => {
      if (globalIncludeWc && globalTypeFilter === 'all') return (s.wcTotalOverbreak || 0) > 0;
      return s.totalOverbreakMinutes > 0;
    })
    .sort((a, b) => {
      if (globalIncludeWc && globalTypeFilter === 'all') return (b.wcTotalOverbreak || 0) - (a.wcTotalOverbreak || 0);
      return b.totalOverbreakMinutes - a.totalOverbreakMinutes;
    })
    .slice(0, 10);

  const topReviewAndAppeal = [...filteredSummaries]
    .filter(s => s.totalReviewAndAppealMinutes > 0)
    .sort((a, b) => b.totalReviewAndAppealMinutes - a.totalReviewAndAppealMinutes)
    .slice(0, 10);

  const topAwaitingTasks = [...filteredSummaries]
    .filter(s => s.totalAwaitingTasksMinutes > 0)
    .sort((a, b) => b.totalAwaitingTasksMinutes - a.totalAwaitingTasksMinutes)
    .slice(0, 10);

  const topNonModTotal = [...filteredSummaries]
    .filter(s => s.totalNonModMinutes > 0)
    .sort((a, b) => b.totalNonModMinutes - a.totalNonModMinutes)
    .slice(0, 10);

  const topForgotStatus = [...filteredSummaries]
    .filter(s => (s.totalForgotStatusMinutes || 0) > 0)
    .sort((a, b) => (b.totalForgotStatusMinutes || 0) - (a.totalForgotStatusMinutes || 0))
    .slice(0, 10);

  const agentsBottom5Special = [...filteredSummaries]
    .filter(s => {
      if (s.isTraining || s.totalOverbreakMinutes === 0) return false;
      return true;
    })
    .sort((a, b) => a.totalOverbreakMinutes - b.totalOverbreakMinutes)
    .slice(0, 10);

  const topProblematic = agentsByOverbreakDuration;

  // Top WC
  const topWc = [...filteredSummaries]
    .map(s => {
      const totalWcDur = s.wcTotalMinutes || 0;
      const totalWcOver = s.dailyRecords.reduce((acc, r) => acc + r.wcOverbreak, 0);
      return { ...s, totalWcOver, totalWcDur };
    })
    .filter(s => s.totalWcDur > 0 || s.wcAlerts > 0)
    .sort((a, b) => b.totalWcDur - a.totalWcDur || b.wcAlerts - a.wcAlerts)
    .slice(0, 10);

  // Top Short 30Min
  const topShort30Min = [...filteredSummaries]
    .filter(s => (s.totalShort30MinRecords || 0) > 0)
    .sort((a, b) => (b.totalShort30MinRecords || 0) - (a.totalShort30MinRecords || 0))
    .slice(0, 10);

  // Top Mismatch
  const topCheck = [...filteredSummaries]
    .map(s => {
      const mismatchCount = s.dailyRecords.filter(r => isShiftMismatch(r.scheduledShift, r.inferredShift)).length;
      return { ...s, mismatchCount };
    })
    .filter(s => s.mismatchCount > 0)
    .sort((a, b) => b.mismatchCount - a.mismatchCount)
    .slice(0, 10);

  // Top Performers
  const topPerformers = [...filteredSummaries]
    .filter(s => !s.isTraining)
    .sort((a, b) => a.totalOverbreakMinutes - b.totalOverbreakMinutes)
    .slice(0, 10);

  // Top No Overbreaks
  const topNoOverbreaks = [...filteredSummaries]
    .filter(s => !s.isTraining && s.totalOverbreakMinutes === 0)
    .slice(0, 10);

  const chartData = topProblematic.map(s => {
    const mealOver = s.dailyRecords.reduce((acc, r) => acc + r.mealOverbreak, 0);
    const shortOver = s.dailyRecords.reduce((acc, r) => acc + r.shortOverbreak, 0);
    const wellnessOver = s.dailyRecords.reduce((acc, r) => acc + r.wellnessOverbreak, 0);
    const prayingOver = s.dailyRecords.reduce((acc, r) => acc + r.prayingOverbreak, 0);
    const wcOver = s.dailyRecords.reduce((acc, r) => acc + r.wcOverbreak, 0);
    const idleOver = s.dailyRecords.reduce((acc, r) => acc + r.idleOverbreak, 0);
    
    const mealDur = s.dailyRecords.reduce((acc, r) => acc + r.mealDuration, 0);
    const shortDur = s.dailyRecords.reduce((acc, r) => acc + r.shortDuration, 0);
    const wellnessDur = s.dailyRecords.reduce((acc, r) => acc + r.wellnessDuration, 0);
    const prayingDur = s.dailyRecords.reduce((acc, r) => acc + r.prayingDuration, 0);
    const wcDur = s.dailyRecords.reduce((acc, r) => acc + r.wcDuration, 0);

    return {
      name: s.employeeName,
      overbreak: s.totalOverbreakMinutes,
      formattedOverbreak: s.totalOverbreakMinutes > 0 ? `${Math.floor(s.totalOverbreakMinutes / 60)}h ${Math.round(s.totalOverbreakMinutes % 60)}m` : '',
      hours: Math.floor(s.totalOverbreakMinutes / 60),
      minutes: s.totalOverbreakMinutes % 60,
      breakdown: { mealOver, shortOver, wellnessOver, prayingOver, wcOver, idleOver, mealDur, shortDur, wellnessDur, prayingDur, wcDur }
    };
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const b = data.breakdown;
      return (
        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs font-medium border border-slate-700">
          <p className="font-black mb-2 text-sm text-slate-100">{data.name}</p>
          <div className="space-y-1.5 text-slate-300">
            <p className="flex justify-between gap-4"><span>Meal</span> <strong className={b.mealOver > 0 ? "text-rose-400" : "text-emerald-400"}>{b.mealOver > 0 ? `+${b.mealOver}m` : (b.mealDur > 0 ? `OK (${b.mealDur}m/60m)` : `OK`)}</strong></p>
            <p className="flex justify-between gap-4"><span>Short</span> <strong className={b.shortOver > 0 ? "text-rose-400" : "text-emerald-400"}>{b.shortOver > 0 ? `+${b.shortOver}m` : (b.shortDur > 0 ? `OK (${b.shortDur}m/30m)` : `OK`)}</strong></p>
            <p className="flex justify-between gap-4"><span>Wellness</span> <strong className={b.wellnessOver > 0 ? "text-rose-400" : "text-emerald-400"}>{b.wellnessOver > 0 ? `+${b.wellnessOver}m` : (b.wellnessDur > 0 ? `OK (${b.wellnessDur}m/15m)` : `OK`)}</strong></p>
            <p className="flex justify-between gap-4"><span>Praying</span> <strong className={b.prayingOver > 0 ? "text-rose-400" : "text-emerald-400"}>{b.prayingOver > 0 ? `+${b.prayingOver}m` : (b.prayingDur > 0 ? `OK (${b.prayingDur}m/15m)` : `OK`)}</strong></p>
            <p className="flex justify-between gap-4"><span>Organic</span> <strong className={b.wcOver > 0 ? "text-amber-400" : "text-emerald-400"}>{b.wcOver > 0 ? `+${b.wcOver}m` : (b.wcDur > 0 ? `OK (${b.wcDur}m/10m)` : `OK`)}</strong></p>
            <p className="flex justify-between gap-4"><span>Idle</span> <strong className={b.idleOver > 0 ? "text-red-400" : "text-emerald-400"}>{b.idleOver > 0 ? `+${b.idleOver}m` : `OK`}</strong></p>
          </div>
          <p className="mt-3 pt-2 border-t border-slate-700/50 text-rose-300 font-bold flex justify-between gap-4">
              <span>Total Overbreak</span>
              <span>{data.hours}h {data.minutes}m</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // Helper for rendering agent lines with tooltips
  const AgentLine = ({ summary, rank, metricValue, metricLabel, colorClass, hideTooltip }: { 
    summary: EmployeeSummary & { incidentCount?: number; totalWcOver?: number }, 
    rank: number, 
    metricValue: string, 
    metricLabel: string,
    colorClass: string,
    hideTooltip?: boolean,
    key?: React.Key
  }) => {
    const mealOver = summary.dailyRecords.reduce((acc, r) => acc + r.mealOverbreak, 0);
    const shortOver = summary.dailyRecords.reduce((acc, r) => acc + r.shortOverbreak, 0);
    const wellnessOver = summary.dailyRecords.reduce((acc, r) => acc + r.wellnessOverbreak, 0);
    const prayingOver = summary.dailyRecords.reduce((acc, r) => acc + r.prayingOverbreak, 0);
    const wcOver = summary.dailyRecords.reduce((acc, r) => acc + r.wcOverbreak, 0);
    const idleOver = summary.dailyRecords.reduce((acc, r) => acc + r.idleOverbreak, 0);

    const mealDur = summary.dailyRecords.reduce((acc, r) => acc + r.mealDuration, 0);
    const shortDur = summary.dailyRecords.reduce((acc, r) => acc + r.shortDuration, 0);
    const wellnessDur = summary.dailyRecords.reduce((acc, r) => acc + r.wellnessDuration, 0);
    const prayingDur = summary.dailyRecords.reduce((acc, r) => acc + r.prayingDuration, 0);
    const wcDur = summary.dailyRecords.reduce((acc, r) => acc + r.wcDuration, 0);

    const [tooltipPos, setTooltipPos] = useState<'left' | 'right' | 'center'>('center');
    const handleMouseEnter = (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.right > window.innerWidth - 250) {
            setTooltipPos('left');
        } else if (rect.left < 250) {
            setTooltipPos('right');
        } else {
            setTooltipPos('center');
        }
    };

    const exceptions: any[] = [];
    if (showRealTime || (globalTimeFilter === 'day' && summary.dailyRecords.length === 1)) {
      summary.dailyRecords.forEach(r => {
        const typeSums: Record<string, number> = {};
        const sortedBreaks = [...r.breaks].sort((a,b) => a.startTime.getTime() - b.startTime.getTime());
        sortedBreaks.forEach(b => {
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
  
           if (b.type === 'idle' || b.type === 'forgot_status') {
               if (!globalFilterMajorOverbreaks || b.durationMinutes > 2) {
                   isOverbreak = true;
                   excessTime = b.durationMinutes;
               }
           } else if (idealTime > 0) {
               if (newSum > idealTime) {
                   const excess = Math.min(b.durationMinutes, newSum - idealTime);
                   if (b.type === 'wc' || b.type === 'praying' || b.type === 'wellness') {
                       isOverbreak = true;
                   } else {
                       if (!globalFilterMajorOverbreaks || excess > 2) isOverbreak = true;
                   }
                   if (isOverbreak) {
                       excessTime = excess;
                   }
               }
           }
  
           if (isOverbreak) {
              let typeLabel = b.type.toUpperCase();
              if (b.type === 'wc') typeLabel = 'ORGANIC';
              if (b.type === 'forgot_status') typeLabel = 'IDLE';
              exceptions.push({
                type: typeLabel,
                excess: excessTime,
                time: (b.startTime && b.endTime) ? `${format(new Date(b.startTime), 'HH:mm')} - ${format(new Date(b.endTime), 'HH:mm')}` : '-'
              });
           }
        });
      });
      exceptions.sort((a,b) => a.time.localeCompare(b.time));
    }

    return (
      <div onMouseEnter={handleMouseEnter} className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors relative group">
        <div className="flex items-center gap-3 w-full">
          <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black shrink-0 ${rank === 1 ? `${colorClass.replace('text-', 'bg-').replace('-700', '-500')} text-white shadow-md` : `${colorClass.replace('text-', 'bg-').replace('-700', '-100')} ${colorClass}`}`}>{rank}</span>
          <div className="min-w-0 pr-4 cursor-help flex flex-col">
            <p className="font-bold text-xs text-slate-800 truncate flex items-center gap-1">
              {summary.workdayId && (
                <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-100/85 px-0.5 py-0.2 rounded shrink-0 leading-none">
                  {summary.workdayId}
                </span>
              )}
              <span>{summary.employeeName}</span>
            </p>
            {summary.email && <p className="text-[9px] text-slate-500 truncate">{summary.email}</p>}
            <div className="flex gap-1 mt-1">
              {summary.lob && <span className="bg-blue-50 text-blue-600 text-[8px] px-1.5 py-0.5 rounded font-black tracking-widest">{formatLOB(summary.lob)}</span>}
              {summary.language && <span className="bg-purple-50 text-purple-600 text-[8px] px-1.5 py-0.5 rounded font-black tracking-widest">{summary.language}</span>}
            </div>
            <p className="text-[10px] text-slate-400 truncate mt-0.5">
              {isNonModOnly ? (
                <>
                  {t('total')}: {Math.floor(summary.totalOverbreakMinutes / 60)}h {Math.round(summary.totalOverbreakMinutes % 60)}m | {t('avgDay')}: {Math.floor((summary.totalOverbreakMinutes / summary.dailyRecords.length) / 60)}h {Math.round((summary.totalOverbreakMinutes / summary.dailyRecords.length) % 60)}m
                </>
              ) : (
                <>{metricValue} {metricLabel}</>
              )}
            </p>
          </div>
        </div>

        {/* Tooltip Hover */}
        <div className={`absolute bottom-[110%] z-[100] hidden group-hover:block w-56 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-xl p-4 text-white animate-in fade-in zoom-in-95 duration-200 ${tooltipPos === 'left' ? 'right-0' : tooltipPos === 'right' ? 'left-0' : 'left-1/2 -translate-x-1/2'}`}>
          <p className="font-black text-sm border-b border-slate-700/50 pb-2 mb-2 text-white tracking-tight leading-none">{summary.employeeName}</p>
          <div className="space-y-1.5 text-xs">
             {(showRealTime || (globalTimeFilter === 'day' && summary.dailyRecords.length === 1)) ? (
                <>
                   {exceptions.length > 0 ? exceptions.map((exc, idx) => (
                      <div key={idx} className="flex justify-between items-center text-slate-300 font-bold border-b border-slate-800 pb-1.5 mb-1.5 last:border-0 last:pb-0 last:mb-0">
                         <div className="flex flex-col">
                            <span className="text-[9px] text-slate-400 leading-none mb-0.5">{exc.time}</span>
                            <span className="text-white text-xs tracking-widest uppercase leading-none">{exc.type}</span>
                         </div>
                         <span className="text-rose-400 font-black text-xs leading-none">+{exc.excess}m</span>
                      </div>
                   )) : (
                      <div className="text-center py-1 text-emerald-400 font-black text-[10px]">
                         Nenhum Overbreak
                      </div>
                   )}
                </>
             ) : (
                <>
                  <div className="flex justify-between items-center text-slate-300 font-bold">
                    <span>Meal:</span> 
                    <span className={mealOver > 0 ? "text-rose-400 font-black" : "text-emerald-400 font-black"}>
                      {mealOver > 0 ? `+${mealOver}m` : (mealDur > 0 ? `OK (${mealDur}m)` : `OK`)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300 font-bold">
                    <span>Short:</span> 
                    <span className={shortOver > 0 ? "text-rose-400 font-black" : "text-emerald-400 font-black"}>
                      {shortOver > 0 ? `+${shortOver}m` : (shortDur > 0 ? `OK (${shortDur}m)` : `OK`)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300 font-bold">
                    <span>Wellness:</span> 
                    <span className={wellnessOver > 0 ? "text-rose-400 font-black" : "text-emerald-400 font-black"}>
                      {wellnessOver > 0 ? `+${wellnessOver}m` : (wellnessDur > 0 ? `OK (${wellnessDur}m)` : `OK`)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300 font-bold">
                    <span>Praying:</span> 
                    <span className={prayingOver > 0 ? "text-rose-400 font-black" : "text-emerald-400 font-black"}>
                      {prayingOver > 0 ? `+${prayingOver}m` : (prayingDur > 0 ? `OK (${prayingDur}m)` : `OK`)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300 font-bold">
                    <span>Organic:</span> 
                    <span className={wcOver > 0 ? "text-amber-400 font-black" : "text-emerald-400 font-black"}>
                      {wcOver > 0 ? `+${wcOver}m` : (wcDur > 0 ? `OK (${wcDur}m)` : `OK`)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300 font-bold">
                    <span>{t('idleLabel')}:</span> 
                    <span className={idleOver > 0 ? "text-red-400 font-black" : "text-emerald-400 font-black"}>
                      {idleOver > 0 ? `+${idleOver}m` : t('okLabel')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300 font-bold">
                    <span>{t('status')}:</span> 
                    <span className={summary.isOffboarded ? "text-slate-400 font-black" : "text-emerald-400 font-black"}>
                      {summary.isOffboarded ? t('offboarded') : t('active')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300 font-bold">
                    <span>{t('absencesString')}:</span> 
                    <span className={(summary.totalAbsences || 0) > 0 ? "text-red-500 font-black" : "text-emerald-400 font-black"}>
                      {summary.totalAbsences || 0}
                    </span>
                  </div>
                </>
             )}
             <div className="mt-3 pt-2.5 border-t border-slate-700/50 flex justify-between items-center font-black">
                <span className="text-rose-400/80 text-[9px] uppercase tracking-wider">{t('totalOverbreakLabel')}:</span>
                <span className="text-rose-400 text-base">{summary.totalOverbreakMinutes}m</span>
             </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Top Banner Section: Total Agents and Status Filter */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-stretch">
        <Card className="rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-1 bg-gradient-to-br from-blue-50 to-white">
          <CardContent className="p-6 flex items-center gap-6 h-full">
            <div className={`w-14 h-14 rounded-2xl ${isCheckAndShift ? 'bg-amber-100/80 text-amber-600 border-amber-200/50' : 'bg-blue-100/80 text-blue-600 border-blue-200/50'} flex items-center justify-center shrink-0 border shadow-inner hidden sm:flex`}>
              <Users size={28} strokeWidth={2.5} />
            </div>
            <div className="flex items-center gap-6 divide-x divide-slate-200 justify-between w-full">
              <div className="flex items-center gap-6 divide-x divide-slate-200 min-w-max">
                {isCheckAndShift ? (
                  <>
                  <div className="pr-2">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1">{t('agentsInPeriod')}</p>
                    <div className="flex items-baseline gap-1.5">
                       <p className="text-3xl font-black text-slate-900 tracking-tight">{agentsDoPeriodoCount}</p>
                       <span className="text-xs font-bold text-slate-400 tracking-wide uppercase">{t('calendar')}</span>
                    </div>
                  </div>
                  <div className="pl-6 flex-1 min-w-max">
                    <p className="text-[11px] font-black uppercase tracking-widest mb-1 truncate text-amber-500">{t('agentsInPeriod')}</p>
                    <div className="flex items-baseline gap-1.5">
                       <p className="text-3xl font-black tracking-tight text-amber-600">{agentsNoPeriodoCount}</p>
                       <span className="text-xs font-bold tracking-wide uppercase text-amber-500/70">
                         {agentsDeOutroPeriodoCount > 0 ? `${agentsDeOutroPeriodoCount} ${t('fromAnotherPeriod')}` : t('allFromPeriod')}
                       </span>
                    </div>
                  </div>
                  </>
                ) : (
                  <>
                  <div className="pr-6">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1">{t('agentsInPeriod')}</p>
                    <div className="flex items-center gap-6 divide-x divide-slate-200">
                      <div className="flex items-baseline gap-1.5">
                         <p className="text-3xl font-black text-slate-900 tracking-tight">{totalEmployees}</p>
                         <span className="text-xs font-bold text-slate-400 tracking-wide uppercase">{t('total')}</span>
                      </div>
                      
                      {(globalTimeFilter === 'all' || globalTimeFilter === 'month') && activeExtraStatus && (
                         <div className="pl-6 flex flex-col">
                            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-0.5">{t('whoHad')} {activeExtraStatus.split(' (')[0]}</p>
                            <p className="text-xl font-black text-emerald-700 tracking-tight leading-none">{extData.back.length}</p>
                         </div>
                      )}

                      {(globalShiftFilter.length === 0 || isAbsencesOnly || globalIncludeAbsences) && !activeExtraStatus && (
                        <div className="pl-6 flex flex-col">
                           <p className="text-[9px] font-black uppercase tracking-widest text-red-500 mb-0.5">{t('absencesString')}</p>
                           <p className="text-xl font-black text-red-600 tracking-tight leading-none">{totalAbsencesInPeriod}</p>
                        </div>
                      )}

                      {(isOffboardedOnly || globalIncludeOffboarded) && !activeExtraStatus && (
                        <div className="pl-6 flex flex-col">
                           <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Offboarded</p>
                           <p className="text-xl font-black text-slate-700 tracking-tight leading-none">{totalOffboardedInPeriod}</p>
                        </div>
                      )}

                      {(globalIncludeATT) && !activeExtraStatus && (
                        <div className="pl-6 flex flex-col border-l border-slate-200">
                           <p className="text-[9px] font-black uppercase tracking-widest text-slate-800 mb-0.5">ATT</p>
                           <p className="text-xl font-black text-slate-900 tracking-tight leading-none">{totalATTInPeriod}</p>
                        </div>
                      )}
                      {(globalIncludeLOA) && !activeExtraStatus && (
                        <div className="pl-6 flex flex-col border-l border-slate-200">
                           <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-0.5">LOA</p>
                           <p className="text-xl font-black text-indigo-600 tracking-tight leading-none">{totalLOAInPeriod}</p>
                        </div>
                      )}
                      {(globalIncludePTO) && !activeExtraStatus && (
                        <div className="pl-6 flex flex-col border-l border-slate-200">
                           <p className="text-[9px] font-black uppercase tracking-widest text-cyan-500 mb-0.5">PTO</p>
                           <p className="text-xl font-black text-cyan-600 tracking-tight leading-none">{totalPTOInPeriod}</p>
                        </div>
                      )}
                      {(globalIncludeSL) && !activeExtraStatus && (
                        <div className="pl-6 flex flex-col border-l border-slate-200">
                           <p className="text-[9px] font-black uppercase tracking-widest text-rose-400 mb-0.5">SL</p>
                           <p className="text-xl font-black text-rose-500 tracking-tight leading-none">{totalSLInPeriod}</p>
                        </div>
                      )}
                      {(globalIncludeSUSPP) && !activeExtraStatus && (
                        <div className="pl-6 flex flex-col border-l border-slate-200">
                           <p className="text-[9px] font-black uppercase tracking-widest text-red-700 mb-0.5">SUSPP</p>
                           <p className="text-xl font-black text-red-800 tracking-tight leading-none">{totalSUSPPInPeriod}</p>
                        </div>
                      )}
                      {(globalIncludeOFF) && !activeExtraStatus && (
                        <div className="pl-6 flex flex-col border-l border-slate-200">
                           <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">OFF</p>
                           <p className="text-xl font-black text-slate-600 tracking-tight leading-none">{totalOFFInPeriod}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="pl-6 flex-1 min-w-max border-l border-slate-200">
                     <p className={`text-[11px] font-black uppercase tracking-widest mb-1 truncate ${isNonModOnly ? 'text-amber-500' : (affectedCount > 0 ? 'text-rose-500' : 'text-emerald-500')}`}>{isNonModOnly ? String(t('agentsString') || '').toUpperCase() : t('withOverbreakGen')}</p>
                     <div className="flex items-baseline gap-1.5">
                        <p className={`text-3xl font-black tracking-tight ${isNonModOnly ? 'text-amber-600' : (affectedCount > 0 ? 'text-rose-600' : 'text-emerald-600')}`}>{affectedCount}</p>
                        <span className={`text-xs font-bold tracking-wide uppercase ${isNonModOnly ? 'text-amber-400' : (affectedCount > 0 ? 'text-rose-400' : 'text-emerald-400')}`}>
                          {isNonModOnly ? String(t('agentsString') || '').toUpperCase() : t('affected')}
                        </span>
                     </div>
                  </div>
                  </>
                )}
              </div>
              {(!globalShiftFilter || globalShiftFilter.length !== 1) && (
              <div className="pl-6 flex-1 hidden xl:flex flex-col gap-2">
                 {/* Most Minutes */}
                 {(!isCheckOnly && !activeExtraStatus && !showRealTime) && (
                 <div className="flex flex-col">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5" title={t('shiftMostMinutes')}>{t('shiftMostMinutes')}</p>
                   <div className="flex items-center gap-1.5">
                     <span className="text-[10px] font-black text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded uppercase border border-slate-200">{shiftStats.mostMinutes.shift}</span>
                     <span className="text-[11px] font-bold text-rose-500">
                       {shiftStats.mostMinutes.minutes > 59 
                         ? <>{Math.floor(shiftStats.mostMinutes.minutes / 60)}h {Math.round(shiftStats.mostMinutes.minutes % 60)}m <span className="text-rose-500/70 ml-1">({Math.round(shiftStats.mostMinutes.minutes)}m)</span></>
                         : `${Math.round(shiftStats.mostMinutes.minutes)}m`}
                     </span>
                   </div>
                 </div>
                 )}
                 {/* Most Occurrences */}
                 {(!activeExtraStatus && !showRealTime) && (
                 <div className="flex flex-col">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5" title={t('shiftMostOccurrences')}>{isCheckOnly ? t('shiftMostOccurrencesAgents') : t('shiftMostOccurrences')}</p>
                   <div className="flex items-center gap-1.5">
                     <span className="text-[10px] font-black text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded uppercase border border-slate-200">{shiftStats.mostOccurrences.shift}</span>
                     <span className="text-[11px] font-bold text-amber-500">{shiftStats.mostOccurrences.occurrences}x</span>
                   </div>
                 </div>
                 )}
              </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {(() => {
         const isOverbreaksOnly = globalTypeFilter === 'idle_overbreak_wc';
         const showIdleCard = isIdleApplicable && !isOverbreaksOnly && !isTardinessOnly;
         const showOverbreakCard = (isOverbreaksOnly || isTardinessOnly) && !isCheckOnly;

         let topCardsCount = 1; // avg
         if (isWcApplicable && !isTardinessOnly) topCardsCount++;
         if (showIdleCard || showOverbreakCard) topCardsCount++;
         
         const topGridClass = topCardsCount === 3 ? "md:grid-cols-3" : topCardsCount === 2 ? "md:grid-cols-2" : "md:grid-cols-1";

         const showTopPerformers = !isIdleOnly && !isTardinessOnly && !isCheckOnly && !isShort30MinOnly && !isNonModOnly && !isAbsencesOnly && !isOffboardedOnly && agentsByOverbreakDuration.length > 0;
         const isShort30MinApplicable = !isIdleOnly && !isTardinessOnly && !isCheckOnly && !isNonModOnly && !isWcOnly && !isEarlyLeaveOnly && !isShort30MinOnly && !isAbsencesOnly && !isOffboardedOnly && topShort30Min.length > 0;
         const showBottom10 = !isNonModOnly && !isAbsencesOnly && !isOffboardedOnly && agentsBottom5Special.length > 0;
         const showTopWcCard = isWcApplicable && !isTardinessOnly && !isWcOnly && topWc.length > 0;
         const botPanesCount = (showBottom10 ? 1 : 0) + (showTopWcCard ? 1 : 0) + (showTopPerformers ? 1 : 0) + (isShort30MinApplicable ? 1 : 0) + (isNonModOnly ? 4 : 0);
         const paneSpan = botPanesCount >= 4 ? 'lg:col-span-3' : botPanesCount === 3 ? 'lg:col-span-4' : botPanesCount === 2 ? 'lg:col-span-6' : 'lg:col-span-12';

         return (
            <>
              {!activeExtraStatus && (
               <div className={`grid grid-cols-1 ${topGridClass} gap-6 mb-8`}>
                <Card className="rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <CardContent className="p-5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      {isCheckOnly ? (globalTimeFilter === 'day' ? t('totalAgentsTitle') : t('avgAgentsTitle')) : 
                       isNonModOnly ? t('avgNonModDay') :
                       isWcOnly ? t('avgOrganicDay') :
                       isIdleOnly ? t('avgIdleDay') :
                       (isTardinessOnly || isMinorTardinessOnly) ? t('avgTardinessDay') :
                       isEarlyLeaveOnly ? t('avgEarlyLeaveDay') :
                       isShort30MinOnly ? t('avg30minDay') :
                       t('avgOverbreakDay')}
                    </p>
                    <div className="flex items-baseline gap-1">
                      {isCheckOnly ? (
                        <div className="flex items-baseline gap-1">
                           <p className="text-2xl font-black text-slate-900">{avgAgentsMismatched}</p>
                           <span className="text-xs font-bold text-slate-400">{globalTimeFilter === 'day' ? t('agentsOutOfShift') : t('agentsAverage')}</span>
                        </div>
                      ) : isShort30MinOnly ? (
                        <div className="flex items-baseline gap-1">
                           <p className="text-2xl font-black text-slate-900">{validAgentsCount ? (filteredSummaries.reduce((acc, s) => acc + (s.totalShort30MinRecords || 0), 0) / validAgentsCount).toFixed(1) : 0}</p>
                           <span className="text-xs font-bold text-slate-400">dias/ag.</span>
                        </div>
                      ) : isNonModOnly ? (
                        <>
                          <p className="text-2xl font-black text-slate-900">
                            {totalDays ? Math.floor((totalOverbreak / totalDays) / 60) : 0}<span className="text-sm">h</span> {totalDays ? Math.round((totalOverbreak / totalDays) % 60) : 0}
                          </p>
                          <span className="text-xs font-bold text-slate-400">m</span>
                        </>
                      ) : (
                        <div className="flex flex-col gap-1 w-full relative">
                          <div className="flex items-baseline gap-1">
                            {averageTotalOverbreak > 59 ? (
                              <>
                                <p className="text-2xl font-black text-slate-900">{Math.floor(averageTotalOverbreak / 60)}</p>
                                <span className="text-xs font-bold text-slate-400">h</span>
                                <p className="text-2xl font-black text-slate-900 ml-1">{averageTotalOverbreak % 60}</p>
                                <span className="text-xs font-bold text-slate-400">m</span>
                              </>
                            ) : (
                              <>
                                <p className="text-2xl font-black text-slate-900">{averageTotalOverbreak}</p>
                                <span className="text-xs font-bold text-slate-400">min</span>
                              </>
                            )}
                          </div>
                          {isWcOnly && (
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 border-l border-slate-200 pl-3">
                            <p className="text-[9px] font-black uppercase text-slate-400 leading-tight mb-0.5">{t('avgWithoutTop5')}</p>
                               <p className="text-sm font-bold text-slate-600 tracking-tight leading-none">
                                 {averageWithoutTop5 > 59 ? (
                                   `${Math.floor(averageWithoutTop5 / 60)}h ${Math.round(averageWithoutTop5 % 60)}m`
                                 ) : (
                                   <>{averageWithoutTop5} <span className="text-[10px] font-bold text-slate-400">min</span></>
                                 )}
                               </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {isWcApplicable && !isTardinessOnly && (
                  <Card className="rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <CardContent className="p-5">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t('wcAlerts')}</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-2xl font-black text-amber-600">
                          {totalWcMinutes > 59 ? (
                            <>{Math.floor(totalWcMinutes / 60)}<span className="text-xs mr-1">h</span>{Math.round(totalWcMinutes % 60)}<span className="text-[14px] ml-2 text-amber-600/70">({Math.round(totalWcMinutes)}m)</span></>
                          ) : (
                            <>{totalWcMinutes}<span className="text-xs">m</span></>
                          )}
                        </p>
                        <p className="text-xs font-bold text-amber-700/60 uppercase">/ {totalWcAgents} {t('agents')}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {showIdleCard && (
                  <Card className="rounded-2xl shadow-sm border border-rose-200 overflow-hidden bg-rose-50">
                    <CardContent className="p-5">
                      <p className="text-[10px] font-bold text-rose-800 uppercase tracking-widest mb-1">{t('idleAlerts')}</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-2xl font-black text-rose-600">
                          {totalIdleMinutes > 59 ? (
                            <>{Math.floor(totalIdleMinutes / 60)}<span className="text-xs mr-1">h</span>{Math.round(totalIdleMinutes % 60)}<span className="text-[14px] ml-2 text-rose-600/70">({Math.round(totalIdleMinutes)}m)</span></>
                          ) : (
                            <>{totalIdleMinutes}<span className="text-xs">m</span></>
                          )}
                        </p>
                        <p className="text-xs font-bold text-rose-700/60 uppercase">/ {totalIdleAgents} {t('agents')}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {showOverbreakCard && (
                  <Card className="rounded-2xl shadow-sm border border-rose-200 overflow-hidden bg-rose-50">
                    <CardContent className="p-5">
                      <p className="text-[10px] font-bold text-rose-800 uppercase tracking-widest mb-1">{(isTardinessOnly || isMinorTardinessOnly) ? t('totalTardinessTime') : t('totalOverbreakTime')}</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-2xl font-black text-rose-600">
                           {totalOverbreak > 59 ? (
                             <>{Math.floor(totalOverbreak / 60)}<span className="text-sm mr-1">h</span> {Math.round(totalOverbreak % 60)}<span className="text-xs">m</span><span className="text-[14px] ml-2 text-rose-600/70">({Math.round(totalOverbreak)}m)</span></>
                           ) : (
                             <>{totalOverbreak}<span className="text-sm">m</span></>
                           )}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
              )}
              
              {!activeExtraStatus && botPanesCount > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
                {showBottom10 && (
                <Card className={`${paneSpan} rounded-2xl shadow-sm border border-slate-200 bg-white flex flex-col overflow-visible`}>
                  <CardHeader className={`${isCheckOnly ? 'bg-amber-50/50 border-amber-100/50' : isWcOnly ? 'bg-amber-50/50 border-amber-100/50' : isNonModOnly || isShort30MinOnly ? 'bg-emerald-50/50 border-emerald-100/50' : 'bg-rose-50/50 border-rose-100/50'} border-b py-4 shrink-0 rounded-t-2xl`}>
                      <CardTitle className={`text-sm font-black uppercase tracking-widest ${isCheckOnly ? 'text-amber-800' : isWcOnly ? 'text-amber-800' : isNonModOnly || isShort30MinOnly ? 'text-emerald-800' : isTardinessOnly || isEarlyLeaveOnly || isMinorTardinessOnly ? 'text-orange-800' : 'text-rose-800'} flex items-center gap-2`}>
                        <AlertCircle size={16} /> {isCheckOnly ? (globalTimeFilter === 'day' ? t('mismatchDetails') : t('top10Mismatch')) : isWcOnly ? t('top10Organic') : isNonModOnly ? "BOTTOM 10" : isShort30MinOnly ? "TOP 10" : isIdleOnly ? t('totalIdleTime') : (isTardinessOnly || isMinorTardinessOnly) ? t('top10Tardiness') : isEarlyLeaveOnly ? t('top10EarlyLeave') : t('totalOverbreakTime')}
                      </CardTitle>
                    <CardDescription className={`text-xs ${isCheckOnly ? 'text-amber-600/80' : isWcOnly ? 'text-amber-600/80' : isNonModOnly || isShort30MinOnly ? 'text-emerald-600/80' : isTardinessOnly || isEarlyLeaveOnly || isMinorTardinessOnly ? 'text-orange-600/80' : 'text-rose-600/80'} mt-1`}>
                      {isCheckOnly 
                         ? (globalTimeFilter === 'day' ? t('mismatchDescShort') : t('mismatchDaysDesc'))
                         : isWcOnly
                         ? t('topOrganicDesc')
                         : isNonModOnly 
                         ? t('lessNonModDesc')
                         : isShort30MinOnly ? t('agentsWith1BreakDesc') : isIdleOnly ? t('idleDesc') : (isTardinessOnly || isMinorTardinessOnly) ? t('tardinessDesc') : isEarlyLeaveOnly ? t('earlyLeaveDesc') : t('mostOverbreakTimeDesc')}
                    </CardDescription>
                   </CardHeader>
                  <CardContent className="p-0 flex-1">
                    <div className="divide-y divide-slate-50">
                      {isCheckOnly ? (
                         topCheck.map((s, i) => {
                            const mismatchRecord = s.dailyRecords.find(r => isShiftMismatch(r.scheduledShift, r.inferredShift));
                            return (
                               <AgentLine 
                                  key={`${s.employeeName}-${i}`} 
                                  summary={s} 
                                  rank={i+1} 
                                  metricValue={globalTimeFilter === 'day' && mismatchRecord ? `${mismatchRecord.scheduledShift} ➔ ${mismatchRecord.inferredShift}` : `${s.mismatchCount}`} 
                                  metricLabel={globalTimeFilter === 'day' ? "" : (s.mismatchCount === 1 ? t('day').toLowerCase() : t('days').toLowerCase())} 
                                  colorClass="text-amber-700"
                                  
                               />
                            );
                         })
                      ) : isShort30MinOnly ? (
                         topShort30Min.map((s, i) => (
                            <AgentLine 
                               key={`${s.employeeName}-${i}`} 
                               summary={s} 
                               rank={i+1} 
                               metricValue={`${s.totalShort30MinRecords}`} 
                               metricLabel={s.totalShort30MinRecords === 1 ? t('day').toLowerCase() : t('days').toLowerCase()} 
                               colorClass="text-emerald-700"
                            />
                         ))
                      ) : isNonModOnly ? (
                         agentsBottom5Special.map((s, i) => (
                            <AgentLine 
                               key={`${s.employeeName}-${i}`} 
                               summary={s} 
                               rank={i+1} 
                               metricValue={s.totalOverbreakMinutes >= 60 ? `${Math.floor(s.totalOverbreakMinutes / 60)}h ${Math.round(s.totalOverbreakMinutes % 60)}m` : `${Math.round(s.totalOverbreakMinutes)}m`} 
                               metricLabel="total" 
                               colorClass="text-emerald-700"
                            />
                         ))
                      ) : isWcOnly ? (
                         topWc.map((s, i) => (
                            <AgentLine 
                               key={`${s.employeeName}-${i}`} 
                               summary={s} 
                               rank={i+1} 
                               metricValue={s.totalWcDur >= 60 ? `${Math.floor(s.totalWcDur / 60)}h ${Math.round(s.totalWcDur % 60)}m` : `${Math.round(s.totalWcDur)}m`} 
                               metricLabel="total" 
                               colorClass="text-amber-700"
                            />
                         ))
                      ) : (
                         agentsByOverbreakDuration.map((s, i) => (
                            <AgentLine 
                               key={`${s.employeeName}-${i}`} 
                               summary={s} 
                               rank={i+1} 
                               metricValue={s.totalOverbreakMinutes >= 60 ? `${Math.floor(s.totalOverbreakMinutes / 60)}h ${Math.round(s.totalOverbreakMinutes % 60)}m` : `${Math.round(s.totalOverbreakMinutes)}m`} 
                               metricLabel={(isTardinessOnly || isMinorTardinessOnly) ? t('delays').toLowerCase() : isEarlyLeaveOnly ? "early leave" : t('overbreakExceeded')} 
                               colorClass={(isTardinessOnly || isMinorTardinessOnly) || isEarlyLeaveOnly ? "text-orange-700" : "text-rose-700"}
                            />
                         ))
                      )}
                      {(isCheckOnly ? topCheck : isShort30MinOnly ? topShort30Min : isNonModOnly ? agentsBottom5Special : isWcOnly ? topWc : agentsByOverbreakDuration).length === 0 && (
                        <div className="p-8 text-center text-xs font-bold text-slate-400">{t('noData')}</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                )}

                {showTopWcCard && (
                  <Card className={`${paneSpan} rounded-2xl shadow-sm border border-slate-200 bg-white flex flex-col overflow-visible`}>
                    <CardHeader className="bg-amber-50/50 border-b border-amber-100/50 py-4 shrink-0 rounded-t-2xl">
                      <CardTitle className="text-sm font-black uppercase tracking-widest text-amber-800 flex items-center gap-2">
                        <AlertCircle size={16} /> TOP 10 ORGANIC
                      </CardTitle>
                      <CardDescription className="text-xs text-amber-600/80 mt-1">{t('topOrganicDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 flex-1">
                      <div className="divide-y divide-slate-50">
                        {topWc.map((s, i) => (
                           <AgentLine 
                              key={`${s.employeeName}-${i}`} 
                              summary={s} 
                              rank={i+1} 
                              metricValue={s.totalWcDur >= 60 ? `${Math.floor(s.totalWcDur / 60)}h ${Math.round(s.totalWcDur % 60)}m` : `${Math.round(s.totalWcDur)}m`} 
                              metricLabel="total" 
                              colorClass="text-amber-700"
                           />
                        ))}
                        {topWc.length === 0 && (
                          <div className="p-8 text-center text-xs font-bold text-slate-400">{t('noData')}</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isShort30MinApplicable && (
                  <Card className={`${paneSpan} rounded-2xl shadow-sm border border-slate-200 bg-white flex flex-col overflow-visible`}>
                    <CardHeader className="bg-emerald-50/50 border-b border-emerald-100/50 py-4 shrink-0 rounded-t-2xl">
                      <CardTitle className="text-sm font-black uppercase tracking-widest text-emerald-800 flex items-center gap-2">
                        <AlertCircle size={16} /> SHORTBREAKS 30MIN
                      </CardTitle>
                      <CardDescription className="text-xs text-emerald-600/80 mt-1">{t('agentsWith1BreakDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 flex-1">
                      <div className="divide-y divide-slate-50">
                        {topShort30Min.map((s, i) => (
                           <AgentLine 
                              key={`${s.employeeName}-${i}`} 
                              summary={s} 
                              rank={i+1} 
                              metricValue={`${s.totalShort30MinRecords}`} 
                              metricLabel={s.totalShort30MinRecords === 1 ? (lang === 'pt' ? 'dia' : 'day') : (lang === 'pt' ? 'dias' : 'days')} 
                              colorClass="text-emerald-700"
                              
                           />
                        ))}
                        {topShort30Min.length === 0 && (
                          <div className="p-8 text-center text-xs font-bold text-slate-400">{t('noData')}</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {showTopPerformers && (
                  <Card className={`${paneSpan} rounded-2xl shadow-sm border border-slate-200 bg-white flex flex-col overflow-visible`}>
                    <CardHeader className={`bg-emerald-50/50 border-emerald-100/50 border-b py-4 shrink-0 rounded-t-2xl`}>
                      <CardTitle className={`text-sm font-black uppercase tracking-widest text-emerald-800 flex items-center gap-2`}>
                        <CheckCircle2 size={16} /> {t('topPerformers')}
                      </CardTitle>
                      <CardDescription className={`text-xs text-emerald-600/80 mt-1`}>
                        {t('topPerformersDesc')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 flex-1">
                      <div className="divide-y divide-slate-50">
                        {topPerformers.map((s, i) => (
                             <AgentLine 
                                key={`${s.employeeName}-${i}`} 
                                summary={s} 
                                rank={i+1} 
                                metricValue={s.totalOverbreakMinutes === 0 ? (lang === 'pt' ? 'Perfeito' : 'Perfect') : `${s.totalOverbreakMinutes}m`} 
                                metricLabel={s.totalOverbreakMinutes === 0 ? "" : t('overbreakExceeded')} 
                                colorClass="text-emerald-700"
                                
                             />
                        ))}
                        {topPerformers.length === 0 && (
                          <div className="p-8 text-center text-xs font-bold text-slate-400">{t('noData')}</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isNonModOnly && (
                  <>
                  <Card className={`${paneSpan} rounded-2xl shadow-sm border border-slate-200 bg-white flex flex-col overflow-visible`}>
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100/50 py-4 shrink-0 rounded-t-2xl">
                      <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800 flex items-center gap-2">
                        <AlertCircle size={16} /> {t('forgotStatus')}
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-600/80 mt-1">{t('forgotStatusDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 flex-1">
                      <div className="divide-y divide-slate-50">
                        {topForgotStatus.map((s, i) => (
                           <AgentLine 
                              key={`${s.employeeName}-${i}`} 
                              summary={s} 
                              rank={i+1} 
                              metricValue={`${Math.floor(s.totalForgotStatusMinutes / 60)}h ${Math.round(s.totalForgotStatusMinutes % 60)}m`} 
                              metricLabel={lang === 'pt' ? 'tempo' : 'time'} 
                              colorClass="text-slate-700"
                              
                           />
                        ))}
                        {topForgotStatus.length === 0 && (
                          <div className="p-8 text-center text-xs font-bold text-slate-400">{t('noData')}</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={`${paneSpan} rounded-2xl shadow-sm border border-slate-200 bg-white flex flex-col overflow-visible`}>
                    <CardHeader className="bg-purple-50/50 border-b border-purple-100/50 py-4 shrink-0 rounded-t-2xl">
                      <CardTitle className="text-sm font-black uppercase tracking-widest text-purple-800 flex items-center gap-2">
                        <AlertCircle size={16} /> {t('top10ReviewAppeal')}
                      </CardTitle>
                      <CardDescription className="text-xs text-purple-600/80 mt-1">{t('reviewAndAppealDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 flex-1">
                      <div className="divide-y divide-slate-50">
                        {topReviewAndAppeal.map((s, i) => (
                           <AgentLine 
                              key={`${s.employeeName}-${i}`} 
                              summary={s} 
                              rank={i+1} 
                              metricValue={`${Math.floor(s.totalReviewAndAppealMinutes / 60)}h ${s.totalReviewAndAppealMinutes % 60}m`} 
                              metricLabel={lang === 'pt' ? 'tempo' : 'time'} 
                              colorClass="text-purple-700"
                              
                           />
                        ))}
                        {topReviewAndAppeal.length === 0 && (
                          <div className="p-8 text-center text-xs font-bold text-slate-400">{t('noData')}</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={`${paneSpan} rounded-2xl shadow-sm border border-slate-200 bg-white flex flex-col overflow-visible`}>
                    <CardHeader className="bg-indigo-50/50 border-b border-indigo-100/50 py-4 shrink-0 rounded-t-2xl">
                      <CardTitle className="text-sm font-black uppercase tracking-widest text-indigo-800 flex items-center gap-2">
                        <AlertCircle size={16} /> {t('top10Awaiting')}
                      </CardTitle>
                      <CardDescription className="text-xs text-indigo-600/80 mt-1">{t('awaitingTasksDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 flex-1">
                      <div className="divide-y divide-slate-50">
                        {topAwaitingTasks.map((s, i) => (
                           <AgentLine 
                              key={`${s.employeeName}-${i}`} 
                              summary={s} 
                              rank={i+1} 
                              metricValue={`${Math.floor(s.totalAwaitingTasksMinutes / 60)}h ${s.totalAwaitingTasksMinutes % 60}m`} 
                              metricLabel={lang === 'pt' ? 'tempo' : 'time'} 
                              colorClass="text-indigo-700"
                              
                           />
                        ))}
                        {topAwaitingTasks.length === 0 && (
                          <div className="p-8 text-center text-xs font-bold text-slate-400">{t('noData')}</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={`${paneSpan} rounded-2xl shadow-sm border border-slate-200 bg-white flex flex-col overflow-visible`}>
                    <CardHeader className="bg-teal-50/50 border-b border-teal-100/50 py-4 shrink-0 rounded-t-2xl">
                      <CardTitle className="text-sm font-black uppercase tracking-widest text-teal-800 flex items-center gap-2">
                        <AlertCircle size={16} /> {t('top10NonMod')}
                      </CardTitle>
                      <CardDescription className="text-xs text-teal-600/80 mt-1">{t('totalNonModDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 flex-1">
                      <div className="divide-y divide-slate-50">
                        {topNonModTotal.map((s, i) => (
                           <AgentLine 
                              key={`${s.employeeName}-${i}`} 
                              summary={s} 
                              rank={i+1} 
                              metricValue={`${Math.floor(s.totalNonModMinutes / 60)}h ${s.totalNonModMinutes % 60}m`} 
                              metricLabel={lang === 'pt' ? 'tempo' : 'time'} 
                              colorClass="text-teal-700"
                              
                           />
                        ))}
                        {topNonModTotal.length === 0 && (
                          <div className="p-8 text-center text-xs font-bold text-slate-400">{t('noData')}</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  </>
                )}
              </div>
              )}
            </>
         );
      })()}
      
      {activeExtraStatus ? (() => {
        const isPTO = activeExtraStatus === 'PTO (VAC)';
        const hideBackAgents = globalTimeFilter === 'week' || globalTimeFilter === 'yesterday' || globalTimeFilter === 'day';
        const showVoltando = periodSummaries.length > 0 && !hideBackAgents;
        const showPTOBack = isPTO && !hideBackAgents;
        
        let cols = 1;
        if (isPTO) cols = showPTOBack ? 3 : 2;
        else if (showVoltando) cols = 2;

        const colClass = cols === 3 ? "lg:col-span-4" : cols === 2 ? "lg:col-span-6" : "lg:col-span-12";

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
             {(() => {
                const isMonthOrAll = globalTimeFilter === 'all' || globalTimeFilter === 'month';
                if (isMonthOrAll) {
                   const todayStr = format(new Date(), 'yyyy-MM-dd');
                   const tomorrowStr = format(new Date(new Date().getTime() + 86400000), 'yyyy-MM-dd');
                   const dayAfterTomorrowStr = format(new Date(new Date().getTime() + 172800000), 'yyyy-MM-dd');
                   
                   const backAgents = [...extData.out, ...extData.soon]
                     .filter((d:any) => d.returnDate === tomorrowStr || d.returnDate === dayAfterTomorrowStr)
                     .sort((a:any, b:any) => a.returnDate.localeCompare(b.returnDate));
                     
                   const extStatusName = activeExtraStatus.split(' (')[0];
                   
                   const cols = 3;
                   const cl = "lg:col-span-4";
                   
                   return (
                     <>
                       <Card className={`${cl} rounded-2xl shadow-sm border border-slate-200 bg-white flex flex-col overflow-visible`}>
                         <CardHeader className="bg-rose-50/50 border-b border-rose-100 py-4 shrink-0 rounded-t-2xl">
                           <CardTitle className="text-sm font-black uppercase tracking-widest text-rose-800 flex items-center gap-2">
                             <AlertCircle size={16} /> AGENTES EM {activeExtraStatus}
                           </CardTitle>
                           <CardDescription className="text-xs text-rose-600/80 mt-1">Agentes que estão no status</CardDescription>
                         </CardHeader>
                         <CardContent className="p-0 flex-1 flex flex-col min-h-0">
                           <div className="flex-1 overflow-hidden h-[600px] custom-scrollbar">
                              <PaginatedAgentList items={extData.out} renderItem={(d, i) => (
                                <AgentLine 
                                   key={`${d.summary.employeeName}-${i}`} 
                                   summary={d.summary} 
                                   rank={i+1} 
                                   metricValue={d.startDate === d.endDate ? format(new Date(d.startDate), 'dd/MM/yyyy') : `${format(new Date(d.startDate), 'dd/MM/yyyy')} a ${format(new Date(d.endDate), 'dd/MM/yyyy')}`}
                                   metricLabel=""
                                   colorClass="text-rose-700"
                                />
                              )} />
                           </div>
                         </CardContent>
                       </Card>

                       <Card className={`${cl} rounded-2xl shadow-sm border border-slate-200 bg-white flex flex-col overflow-visible`}>
                         <CardHeader className="bg-emerald-50/50 border-b border-emerald-100 py-4 shrink-0 rounded-t-2xl">
                           <CardTitle className="text-sm font-black uppercase tracking-widest text-emerald-800 flex items-center gap-2">
                             <AlertCircle size={16} /> Agentes Back
                           </CardTitle>
                           <CardDescription className="text-xs text-emerald-600/80 mt-1">Agentes que voltam nos próximos 1-2 dias</CardDescription>
                         </CardHeader>
                         <CardContent className="p-0 flex-1 flex flex-col min-h-0">
                           <div className="flex-1 overflow-hidden h-[600px] custom-scrollbar">
                              <PaginatedAgentList items={backAgents} renderItem={(d:any, i:any) => (
                                <AgentLine 
                                   key={`${d.summary.employeeName}-${i}`} 
                                   summary={d.summary} 
                                   rank={i+1} 
                                   metricValue={d.startDate === d.endDate ? format(new Date(d.startDate), 'dd/MM/yyyy') : `${format(new Date(d.startDate), 'dd/MM/yyyy')} a ${format(new Date(d.endDate), 'dd/MM/yyyy')}`}
                                   metricLabel={format(new Date(d.returnDate), 'dd/MM/yyyy')} 
                                   colorClass="text-emerald-700"
                                />
                              )} />
                           </div>
                         </CardContent>
                       </Card>

                       <Card className={`${cl} rounded-2xl shadow-sm border border-slate-200 bg-white flex flex-col overflow-visible`}>
                         <CardHeader className="bg-amber-50/50 border-b border-amber-100 py-4 shrink-0 rounded-t-2xl">
                           <CardTitle className="text-sm font-black uppercase tracking-widest text-amber-800 flex items-center gap-2">
                             <AlertCircle size={16} /> NEXT {extStatusName}'s
                           </CardTitle>
                           <CardDescription className="text-xs text-amber-600/80 mt-1">Próximos agentes a entrar no status</CardDescription>
                         </CardHeader>
                         <CardContent className="p-0 flex-1 flex flex-col min-h-0">
                           <div className="flex-1 overflow-hidden h-[600px] custom-scrollbar">
                              <PaginatedAgentList items={extData.soon} renderItem={(d:any, i:any) => (
                                <AgentLine 
                                   key={`${d.summary.employeeName}-${i}`} 
                                   summary={d.summary} 
                                   rank={i+1} 
                                   metricValue={d.startDate === d.endDate ? format(new Date(d.startDate), 'dd/MM/yyyy') : `${format(new Date(d.startDate), 'dd/MM/yyyy')} a ${format(new Date(d.endDate), 'dd/MM/yyyy')}`}
                                   metricLabel="" 
                                   colorClass="text-amber-700"
                                />
                              )} />
                           </div>
                         </CardContent>
                       </Card>
                     </>
                   );
                } 

                return (
                  <>
                    <Card className={`${colClass} rounded-2xl shadow-sm border border-slate-200 bg-white flex flex-col overflow-visible`}>
                        <CardHeader className="bg-rose-50/50 border-b border-rose-100 py-4 shrink-0 rounded-t-2xl">
                          <CardTitle className="text-sm font-black uppercase tracking-widest text-rose-800 flex items-center gap-2">
                            <AlertCircle size={16} /> Agentes em {isPTO ? 'PTO/VAC (Out)' : activeExtraStatus}
                          </CardTitle>
                          <CardDescription className="text-xs text-rose-600/80 mt-1">Agentes que já iniciaram o status</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 flex flex-col min-h-0">
                           <div className="flex-1 overflow-hidden h-[600px] custom-scrollbar">
                              <PaginatedAgentList items={extData.out} renderItem={(d, i) => {
                                 return (
                                 <AgentLine 
                                    key={`${d.summary.employeeName}-${i}`} 
                                    summary={d.summary} 
                                    rank={i+1} 
                                    metricValue={d.startDate === d.endDate ? format(new Date(d.startDate), 'dd/MM/yyyy') : `${format(new Date(d.startDate), 'dd/MM/yyyy')} a ${format(new Date(d.endDate), 'dd/MM/yyyy')}`}
                                    metricLabel=""
                                    colorClass="text-rose-700"
                                    
                                 />
                                 );
                              }} />
                           </div>
                        </CardContent>
                    </Card>

                    {(isPTO || showVoltando) && (
                    <Card className={`${colClass} rounded-2xl shadow-sm border border-slate-200 bg-white flex flex-col overflow-visible`}>
                        <CardHeader className="bg-amber-50/50 border-b border-amber-100 py-4 shrink-0 rounded-t-2xl">
                          <CardTitle className="text-sm font-black uppercase tracking-widest text-amber-800 flex items-center gap-2">
                            <AlertCircle size={16} /> {isPTO ? 'Agentes em PTO/VAC (Soon)' : 'Agentes voltando'}
                          </CardTitle>
                          <CardDescription className="text-xs text-amber-600/80 mt-1">
                             {isPTO ? 'Agentes que iniciarão o status ou retornam amanhã' : 'Agentes que vão voltar de status futuramente'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 flex flex-col min-h-0">
                           <div className="flex-1 overflow-hidden h-[600px] custom-scrollbar">
                              <PaginatedAgentList items={isPTO ? extData.soon : extData.back} renderItem={(d, i) => (
                                 <AgentLine 
                                    key={`${d.summary.employeeName}-${i}`} 
                                    summary={d.summary} 
                                    rank={i+1} 
                                    metricValue={d.startDate === d.endDate ? format(new Date(d.startDate), 'dd/MM/yyyy') : `${format(new Date(d.startDate), 'dd/MM/yyyy')} a ${format(new Date(d.endDate), 'dd/MM/yyyy')}`}
                                    metricLabel="" 
                                    colorClass="text-amber-700"
                                    
                                 />
                              )} />
                           </div>
                        </CardContent>
                    </Card>
                    )}

                    {showPTOBack && (
                    <Card className={`${colClass} rounded-2xl shadow-sm border border-slate-200 bg-white flex flex-col overflow-visible`}>
                        <CardHeader className="bg-emerald-50/50 border-b border-emerald-100 py-4 shrink-0 rounded-t-2xl">
                          <CardTitle className="text-sm font-black uppercase tracking-widest text-emerald-800 flex items-center gap-2">
                            <AlertCircle size={16} /> Agentes {isPTO ? 'Back' : 'Back'}
                          </CardTitle>
                          <CardDescription className="text-xs text-emerald-600/80 mt-1">Agentes que já voltaram ou voltam em breve</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 flex flex-col min-h-0">
                           <div className="flex-1 overflow-hidden h-[600px] custom-scrollbar">
                              <PaginatedAgentList items={extData.back} renderItem={(d, i) => (
                                 <AgentLine 
                                    key={`${d.summary.employeeName}-${i}`} 
                                    summary={d.summary} 
                                    rank={i+1} 
                                    metricValue={d.startDate === d.endDate ? format(new Date(d.startDate), 'dd/MM/yyyy') : `${format(new Date(d.startDate), 'dd/MM/yyyy')} a ${format(new Date(d.endDate), 'dd/MM/yyyy')}`}
                                    metricLabel="" 
                                    colorClass="text-emerald-700"
                                    
                                 />
                              )} />
                           </div>
                        </CardContent>
                    </Card>
                    )}
                  </>
                );
             })()}
          </div>
        );
      })() : (
        <Card className="lg:col-span-12 rounded-2xl shadow-sm border border-slate-200 overflow-hidden bg-white">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-700">
               {isCheckOnly ? t('mismatchDetails') :
               isNonModOnly ? t('nonModAlerts') : 
               isWcOnly ? t('organicAlerts') : 
               isIdleOnly ? t('idleAlertsTitle') : 
               (isTardinessOnly || isMinorTardinessOnly) ? t('tardinessAlerts') :
               isEarlyLeaveOnly ? t('earlyLeaveAlerts') :
               t('auditLogOverbreak')}
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-1">
              {isCheckOnly ? t('mismatchDesc') :
               isNonModOnly ? t('nonModDesc') : 
               isWcOnly ? t('organicDesc') : 
               isIdleOnly ? t('idleDesc') : 
               (isTardinessOnly || isMinorTardinessOnly) ? t('tardinessDesc') :
               isEarlyLeaveOnly ? t('earlyLeaveDesc') :
               t('needAttentionDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 flex flex-col h-[600px] custom-scrollbar relative">
               <PaginatedAgentList items={isCheckOnly ? topCheck : topProblematic} renderItem={(s, i) => (
                <div key={`${s.employeeName}-${i}`} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-50 transition-colors gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black shrink-0 ${i === 0 ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'}`}>{i+1}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        {s.workdayId && (
                          <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100/80 border border-slate-200/50 px-1 py-0.5 rounded">
                            {s.workdayId}
                          </span>
                        )}
                        <span className="font-bold text-sm text-slate-800">{s.employeeName}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {isCheckOnly ? t('workedOutsideShiftDesc') : isWcOnly ? t('organicUsedDesc') : isIdleOnly ? t('criticalIdleDesc') : isNonModOnly ? t('nonModDesc') : (isTardinessOnly || isMinorTardinessOnly) ? t('tardinessRecordedDesc') : isEarlyLeaveOnly ? t('earlyLeaveRecordedDesc') : t('exceededBreaksDesc')}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Dialog>
                      <DialogTrigger className={`px-3 py-1.5 text-xs font-black rounded-lg uppercase shadow-sm flex items-center gap-1 group transition-colors ${isCheckOnly ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : isWcOnly ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : isIdleOnly ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : isTardinessOnly || isEarlyLeaveOnly ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'}`}>
                           {isCheckOnly ? (
                             globalTimeFilter === 'day' ? (
                                (() => {
                                   const mmr = s.dailyRecords.find(r => isShiftMismatch(r.scheduledShift, r.inferredShift));
                                   return <span>{mmr ? `${mmr.scheduledShift} ➔ ${mmr.inferredShift}` : "VER DETALHES"}</span>;
                                })()
                             ) : (
                               <span>{s.mismatchCount} {s.mismatchCount === 1 ? 'DIA' : 'DIAS'} DIFERENTES</span>
                             )
                           ) : isWcOnly ? (
                             <span className="flex items-center gap-1.5">
                               <span>TOT: <span className="font-bold">{Math.floor((s.wcTotalMinutes || 0) / 60)}h {(s.wcTotalMinutes || 0) % 60}m</span></span>
                               <span className="opacity-40 font-normal">|</span>
                               <span className="text-rose-600">EXC: <span className="font-bold">{Math.floor((s.wcTotalOverbreak || 0) / 60)}h {(s.wcTotalOverbreak || 0) % 60}m</span></span>
                             </span>
                           ) : (isTardinessOnly || isMinorTardinessOnly) ? (
                             <span>{Math.floor(s.totalOverbreakMinutes / 60)}h {s.totalOverbreakMinutes % 60}m ATRASO</span>
                           ) : isEarlyLeaveOnly ? (
                             <span>{Math.floor(s.totalOverbreakMinutes / 60)}h {s.totalOverbreakMinutes % 60}m EARLY LEAVE</span>
                           ) : (
                             <span>{Math.floor(s.totalOverbreakMinutes / 60)}h {s.totalOverbreakMinutes % 60}m {isIdleOnly ? 'IDLE' : 'OVER'}</span>
                           )}
                           <span className={`rounded px-1 group-hover:bg-opacity-80 ml-1 ${isCheckOnly ? 'bg-amber-200 text-amber-800' : isWcOnly ? 'bg-amber-200 text-amber-800' : isIdleOnly ? 'bg-rose-200 text-rose-800' : isTardinessOnly || isEarlyLeaveOnly ? 'bg-orange-200 text-orange-800' : 'bg-rose-200 text-rose-800'}`}>Detalhes</span>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border-slate-200 p-0 overflow-hidden shadow-2xl">
                         <div className="bg-slate-900 text-white p-6 shrink-0 flex flex-col gap-4">
                            <div>
                              <DialogHeader>
                                 <DialogTitle className="text-xl font-black flex items-center gap-1.5">{s.workdayId && <span className="text-xs font-mono font-black bg-slate-800 text-slate-350 border border-slate-700/60 px-1.5 py-0.5 rounded leading-none shrink-0">{s.workdayId}</span>}<span>{s.employeeName}</span></DialogTitle>
                              </DialogHeader>
                              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">
                                {isWcOnly ? (
                                   <span>{Math.floor((s.wcTotalMinutes || 0) / 60)}h {(s.wcTotalMinutes || 0) % 60}m Total <span className="mx-2 opacity-50">|</span> <span className="text-amber-500">{Math.floor((s.wcTotalOverbreak || 0) / 60)}h {(s.wcTotalOverbreak || 0) % 60}m Excedidos</span></span>
                                ) : isIdleOnly ? (
                                   <span>{Math.floor(s.totalOverbreakMinutes / 60)}h {s.totalOverbreakMinutes % 60}m <span className="text-rose-500">Em Ociosidade</span></span>
                                ) : (
                                   <span>{Math.floor(s.totalOverbreakMinutes / 60)}h {s.totalOverbreakMinutes % 60}m <span className="text-rose-500">Excedidos</span></span>
                                )}
                              </p>
                            </div>
                            <div className="flex bg-slate-800 p-1 rounded-lg shrink-0 self-start">
                              <button onClick={() => setDetailsSortMode('duration')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${detailsSortMode === 'duration' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>Mais Longos</button>
                              <button onClick={() => setDetailsSortMode('date')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${detailsSortMode === 'date' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>Cronológico</button>
                            </div>
                         </div>
                         {isCheckOnly ? (
                          <div className="flex-1 overflow-y-auto w-full bg-slate-50">
                             <div className="space-y-3 p-6 min-h-max">
                                {s.dailyRecords
                                   .filter(r => isShiftMismatch(r.scheduledShift, r.inferredShift))
                                   .map((r, idx) => (
                                      <div key={idx} className="flex justify-between items-center bg-white p-4 rounded-xl border border-amber-200 shadow-sm">
                                        <div>
                                          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{format(new Date(r.date), 'dd/MM/yyyy')}</p>
                                          <div className="flex items-center gap-3 mt-1.5">
                                            <div className="flex flex-col">
                                              <span className="text-[9px] uppercase font-bold text-slate-400">Schedule</span>
                                              <span className="text-sm font-black text-slate-700">{r.scheduledShift}</span>
                                            </div>
                                            <span className="text-slate-300 font-bold">→</span>
                                            <div className="flex flex-col">
                                              <span className="text-[9px] uppercase font-black text-amber-500">Realizado</span>
                                              <span className="text-sm font-black text-amber-600">{r.inferredShift}</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                   ))}
                             </div>
                          </div>
                         ) : isTardinessOnly || isMinorTardinessOnly || isEarlyLeaveOnly ? (
                          <div className="flex-1 overflow-y-auto w-full bg-slate-50">
                             <div className="space-y-3 p-6 min-h-max">
                                {s.dailyRecords
                                   .filter(r => (isTardinessOnly || isMinorTardinessOnly) ? (r.tardinessMinutes || 0) > 0 : (r.earlyLeaveMinutes || 0) > 0)
                                   .map((r, idx) => {
                                      const shiftParts = (r.inferredShift || r.scheduledShift || '').split('-');
                                      const expectedTime = (isTardinessOnly || isMinorTardinessOnly) ? shiftParts[0] : (shiftParts[1] || shiftParts[0] || 'N/A');
                                      return (
                                      <div key={idx} className="flex justify-between items-center bg-white p-4 rounded-xl border border-orange-200 shadow-sm">
                                        <div>
                                          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{format(new Date(r.date + 'T12:00:00'), 'dd/MM/yyyy')}</p>
                                          <div className="flex items-center gap-3 mt-1.5">
                                            <div className="flex flex-col">
                                              <span className="text-[9px] uppercase font-bold text-slate-400">Previsto</span>
                                              <span className="text-sm font-black text-slate-700">{expectedTime}</span>
                                            </div>
                                            <span className="text-slate-300 font-bold">→</span>
                                            <div className="flex flex-col">
                                              <span className="text-[9px] uppercase font-black text-orange-500">Real</span>
                                              <span className="text-sm font-black text-orange-600">
                                                {(isTardinessOnly || isMinorTardinessOnly)
                                                  ? (r.actualStartTime ? format(r.actualStartTime, 'HH:mm') : 'N/A') 
                                                  : (r.actualEndTime ? format(r.actualEndTime, 'HH:mm') : 'N/A')}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="text-right flex items-center">
                                           <span className="font-black text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg text-lg">
                                               +{(() => {
                                                   const min = (isTardinessOnly || isMinorTardinessOnly) ? (r.tardinessMinutes || 0) : (r.earlyLeaveMinutes || 0);
                                                   const h = Math.floor(min / 60);
                                                   const m = min % 60;
                                                   return h > 0 ? `${h}h ${m}m` : `${m}m`;
                                               })()}
                                           </span>
                                        </div>
                                      </div>
                                   )})}
                             </div>
                          </div>
                         ) : (
                         <div className="flex-1 overflow-y-auto w-full bg-slate-50">
                            <div className="space-y-3 p-6 min-h-max">
                               {(() => {
                                   const taggedAll = s.dailyRecords.flatMap(r => {
                                       const typeSums: Record<string, number> = {};
                                       const sorted = r.breaks ? [...r.breaks].sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()) : [];
                                       return sorted.map(b => {
                                          const prevSum = typeSums[b.type] || 0;
                                          const newSum = prevSum + b.durationMinutes;
                                          typeSums[b.type] = newSum;
                                          
                                          let idealTime = (b.type === 'meal') ? 60 : (b.type === 'short') ? 30 : (b.type === 'wellness' || b.type === 'praying') ? 15 : (b.type === 'wc') ? 10 : 0;
                                          let isOverbreak = false;
                                          let excessTime = 0;
                                          let usedIdeal = 0;

                                          if (b.type === 'idle' || b.type === 'forgot_status') {
                                             if (!globalFilterMajorOverbreaks || b.durationMinutes > 2) {
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
                                                    if (!globalFilterMajorOverbreaks || excess > 2) isOverbreak = true;
                                                }
                                                if (isOverbreak) {
                                                    excessTime = excess;
                                                    usedIdeal = b.durationMinutes - excess;
                                                }
                                             }
                                          }
                                          return { ...b, date: r.date, isOverbreak, allowed: usedIdeal, excess: excessTime, total: b.durationMinutes };
                                       });
                                   }).filter((b: any) => b.type !== 'forgot_status' && b.type !== 'offline');

                                   const filteredTagged = taggedAll.filter((b: any) => {
                                      if (isNonModOnly) return b.type === 'non_moderating';
                                      
                                      const isWcOnlyFilt = globalIncludeWc && !globalIncludeIdle && !globalIncludeNonMod && globalTypeFilter === 'all';
                                      const isIdleOnlyFilt = globalIncludeIdle && !globalIncludeWc && !globalIncludeNonMod && globalTypeFilter === 'all';

                                      if (isWcOnlyFilt) return b.type === 'wc';
                                      if (isIdleOnlyFilt) return b.type === 'idle' && (!globalFilterMajorOverbreaks || b.durationMinutes > 2);
                                      
                                      if (b.type === 'wc') return globalIncludeWc;
                                      if (b.type === 'idle') return globalIncludeIdle && (!globalFilterMajorOverbreaks || b.durationMinutes > 2);
                                      if (b.type === 'non_moderating') return globalIncludeNonMod;
                                      
                                      return b.isOverbreak;
                                   }).sort((a: any, b: any) => detailsSortMode === 'duration' ? b.durationMinutes - a.durationMinutes : new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

                                   if (filteredTagged.length === 0) {
                                       return <div className="text-center p-8 text-slate-400 font-bold text-sm">{t('noDetailedBreaks')}</div>;
                                   }

                                   return filteredTagged.map((b: any, idx: number) => {
                                      const isOvb = b.isOverbreak;
                                      return (
                                          <div key={idx} className={`flex flex-col gap-2 bg-white p-4 rounded-xl border shadow-sm ${b.type === 'forgot_status' ? 'border-slate-200' : isWcOnly ? 'border-amber-100' : isIdleOnly ? 'border-rose-100' : 'border-rose-100'}`}>
                                            <div className="flex justify-between items-center w-full min-h-[44px]">
                                              <div>
                                                <p className={`text-sm font-black uppercase tracking-tight ${b.type === 'forgot_status' ? 'text-slate-800' : isWcOnly ? 'text-amber-800' : isIdleOnly ? 'text-rose-800' : 'text-rose-800'}`} title={b.rawStatus}>{b.type === 'forgot_status' ? t('forgotStatusLabel') : b.type === 'other' ? (b.rawStatus || b.type) : b.type}</p>
                                                <p className="text-xs font-bold text-slate-500">{format(new Date(b.date), 'dd/MM/yyyy')} • {t('fromLabel')} {format(new Date(b.startTime), 'HH:mm')} {t('toLabel')} {format(new Date(b.endTime), 'HH:mm')}</p>
                                              </div>
                                              <div className="text-right flex flex-col items-end gap-1">
                                                 <div className="flex items-center gap-1.5 justify-end">
                                                    {isOvb ? (
                                                       <>
                                                          {b.allowed > 0 && <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded shadow-sm text-sm" title="Tempo permitido">{b.allowed}m</span>}
                                                          {b.excess > 0 && <span className="font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded shadow-sm text-sm" title="Tempo excedido">+{b.excess}m</span>}
                                                       </>
                                                    ) : (
                                                       <span className="font-black text-slate-700 text-lg">{b.durationMinutes}m</span>
                                                    )}
                                                 </div>
                                              </div>
                                            </div>
                                            {(() => {
                                              if (!b.remarks || b.remarks.trim().length === 0) return false;
                                              const lowRemark = b.remarks.toLowerCase();
                                              if (lowRemark.includes("system changes state to idle") || lowRemark.includes("系统切换空闲状态")) return false;
                                              const isRelevantNote = b.type === 'non_moderating' || b.type === 'short' || b.type === 'meeting' || b.type === 'training' || b.rawStatus.toLowerCase().includes('coaching') || (b.subType || '').toLowerCase().includes('coaching') || lowRemark.includes('coaching');
                                              return isRelevantNote;
                                            })() && (
                                              <div className="mt-2 text-xs bg-slate-50 p-2 rounded border border-slate-100 italic text-slate-600">
                                                <span className="font-bold not-italic text-[10px] uppercase text-slate-400 block mb-1">{t('agentObservation')}</span>
                                                "{b.remarks.trim()}"
                                              </div>
                                            )}
                                          </div>
                                      );
                                   });
                                })()}
                            </div>
                         </div>
                         )}
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
               )} />
            </div>
            {totalEmployees === 0 && (
              <div className="text-center py-20 text-slate-400 italic text-sm">
                {t('waitingDataImport')}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      </div>
    );
}
