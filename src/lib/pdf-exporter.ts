import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parse, isValid, parseISO } from 'date-fns';
import { EmployeeSummary } from '../types';
import { translations, Language } from './i18n';
import { isShiftMismatch } from './shiftUtils';

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function translateToEnglish(text: string): string {
  if (!text) return text;
  let result = text;
  
  // Custom manual replacements for common combinations or title structures
  const replacements: [RegExp, string][] = [
    [/Agentes\s*-\s*\(Todos\)/gi, "Agents - (All)"],
    [/Agentes\s*-\s*Todos/gi, "Agents - (All)"],
    [/Agentes\s*/gi, "Agents"],
    [/Relatório Geral/gi, "General Report"],
    [/Relatório de Pausas/gi, "Breaks Report"],
    [/Início Programado/gi, "Scheduled Start"],
    [/Fim Programado/gi, "Scheduled End"],
    [/Duração \(m\)/gi, "Duration (m)"],
    [/Tempo de Overbreak/gi, "Overbreak Time"],
    [/Tempo de Trabalho/gi, "Work Time"],
    [/Faltas/gi, "Absences"],
    [/Atrasos/gi, "Tardiness"],
    [/Saídas Antecipadas/gi, "Early Leaves"],
    [/Desempenho de LOBs/gi, "LOBs Performance"],
    [/Relatório de LOBs/gi, "LOBs Performance Report"],
    [/Relatório de LOB/gi, "LOB Report"],
    [/Relatório do dia/gi, "Report for"],
    [/ao dia/gi, "to"],
    [/\bHoje\b/gi, "Today"],
    [/\bOntem\b/gi, "Yesterday"],
    [/\bSemana\b/gi, "Week"],
    [/\bMês\b/gi, "Month"],
    [/\bTodos\b/gi, "All"],
    [/\bSomente Exceções\b/gi, "Only Exceptions"],
    [/\bDivergência de horário\b/gi, "Schedule Mismatch"],
    [/\bSelecione\b/gi, "Select"],
  ];

  for (const [regex, replacement] of replacements) {
    result = result.replace(regex, replacement);
  }

  // Double check any other translations keys
  const ptEntries = Object.entries(translations.pt);
  ptEntries.sort((a, b) => b[1].length - a[1].length);

  for (const [key, ptVal] of ptEntries) {
    if (ptVal && ptVal.length > 2) {
      const enVal = (translations.en as any)[key];
      if (enVal) {
        const regex = new RegExp(escapeRegExp(ptVal), 'gi');
        result = result.replace(regex, enVal);
      }
    }
  }

  return result;
}

function getCleanStatusText(statusFiltersText: string | undefined): string | null {
  if (!statusFiltersText) return null;
  const clean = statusFiltersText.replace(/^status\s+info:\s*/i, '').trim();
  return clean || null;
}

function getEffectiveShiftValue(scheduledShift: string | null | undefined, inferredShift: string | null | undefined): string {
  if (!inferredShift) return '-';
  if (!scheduledShift) return inferredShift;
  
  if (isShiftMismatch(scheduledShift, inferredShift)) {
    return inferredShift;
  }
  
  // Extra fallback comparison:
  const sNorm = scheduledShift.trim().toUpperCase().replace(/\s+/g, '');
  const iNorm = inferredShift.trim().toUpperCase().replace(/\s+/g, '');
  if (sNorm !== iNorm) {
    const isTime = (str: string) => /\d{1,2}:\d{2}/.test(str);
    if (isTime(sNorm) && isTime(iNorm)) {
      return inferredShift;
    }
    const leaves = ['OFF', 'VAC', 'PTO', 'SL', 'SICK', 'MEDICO', 'ATESTADO', 'LOA', 'LICENÇA', 'SUSP', 'ATT', 'RESIGN', 'SAÍDA', 'FOLGA'];
    const sIsLeave = leaves.some(l => sNorm.includes(l));
    const iIsLeave = leaves.some(l => iNorm.includes(l));
    if (sIsLeave !== iIsLeave) {
      return inferredShift;
    }
  }
  
  return 'OK';
}


export interface PDFOptions {
  showCheck?: boolean;
  isTardiness?: boolean;
  isMinorTardiness?: boolean;
  isEarlyLeave?: boolean;
  isAbsences?: boolean;
  isShort30Min?: boolean;
  isIdle?: boolean;
  isWc?: boolean;
  isNonMod?: boolean;
  isRa?: boolean;
  isAt?: boolean;
  isOverbreaks?: boolean;
  isCheck?: boolean;
  isAgentDetail?: boolean;
  statusFiltersText?: string;
  activeExtraStatus?: string | null;
  activeExtraStatuses?: string[] | null;
  attrKey?: string | null;
  attrKeys?: string[] | null;
  totalAgentsCount?: number;
  affectedAgentsCount?: number;
  periodFilter?: string;
  lang?: Language;
  teamProductiveMinutes?: number;
  teamNonModMinutes?: number;
  showAllTimeline?: boolean;
  isGroupedByTL?: boolean;
  isNextVacations?: boolean;
  isRefresher?: boolean;
  allSummaries?: EmployeeSummary[];
  showRealTime?: boolean;
  latestDate?: Date;
  selectedDateStrs?: string[];
  periodMinDateStr?: string;
  periodMaxDateStr?: string;
  periodSummaries?: EmployeeSummary[];
  showBPO?: boolean;
}

export function getShiftEndDateTime(dateStr: string, shiftStr: string | null | undefined): Date | null {
  if (!shiftStr) return null;
  const match = shiftStr.match(/(?:^|\b|[^0-9])(\d{1,2}:\d{2})\s*(?:-|to|–|—|−)\s*(\d{1,2}:\d{2})(?:\b|[^0-9]|$)/i);
  if (!match) return null;
  
  const startStr = match[1].padStart(5, '0'); // e.g. "09:00"
  const endStr = match[2].padStart(5, '0'); // e.g. "18:00"
  
  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);
  
  // Create date object for same day start and end
  const startD = new Date(`${dateStr}T${startStr}:00`);
  const endD = new Date(`${dateStr}T${endStr}:00`);
  
  // If it crosses midnight, end is on the next day
  if (startH > endH || (startH === endH && startM > endM)) {
    endD.setDate(endD.getDate() + 1);
  }
  
  return endD;
}

export function isSupportRole(summary: { role?: string; lob?: string }): boolean {
  const roleUpper = (summary.role || '').trim().toUpperCase();
  const lobUpper = (summary.lob || '').trim().toUpperCase();

  // LED QUALITY is explicitly NOT a support role, it's CSR
  if (lobUpper.includes('LED QUALITY')) return false;

  // Exact match for OS in either column
  if (roleUpper === 'OS' || lobUpper === 'OS') return true;
  
  // Known support roles - check both Role and LOB to catch RTA or QA listed under LOB
  const supportRegex = /\b(QA|RTA|TRAINER|SUPERVISOR|MANAGER|TL|WFM|REAL TIME|OPS|COORDINATOR|QUALITY|OPERATIONAL SUPPORT)\b/i;
  
  if (supportRegex.test(roleUpper) || supportRegex.test(lobUpper)) {
    return true;
  }

  return false;
}

export function exportLOBsToPDF(summaries: EmployeeSummary[], title: string = "LOBs Performance Report", filename: string = "lobs_report", lang: Language = 'pt', showBPO: boolean = false) {
  lang = 'en';
  const t = (key: keyof typeof translations['pt']) => translations[lang][key] || key;

  if (!showBPO) {
    summaries = summaries.filter(s => {
      const lobText = (s.lob || '').toLowerCase();
      return !lobText.includes('bpo');
    });
  }

  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text(translateToEnglish(title), 14, 22);
  
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`${t('generatedAt')}: ${format(new Date(), 'MM/dd/yyyy HH:mm')}`, 14, 30);
  
  let startYPos = 40;
  
  // Group summaries by LOB
  const lobs: Record<string, EmployeeSummary[]> = {};
  
  summaries.forEach(s => {
    const hasWorkingSchedule = s.dailyRecords.some(r => (!r.isOFF && !r.isPTO && !r.isLOA && !r.isSL && !r.isSUSPP && !r.isATT) || r.isAbsence);
    if (!hasWorkingSchedule) return;

    const lob = (s.lob && s.lob.trim() !== '') ? s.lob : t('unknown');
    if (isSupportRole(s)) return;
    if (['LEG', 'LMG', 'LMG BADNESS', 'LMG ES', 'LMG LATAM'].includes(lob.toUpperCase())) return;
    
    if (!lobs[lob]) {
      lobs[lob] = [];
    }
    lobs[lob].push(s);
  });

  const head = [['LOB', t('pdfAgentCount' as any) || 'Agents', t('pdfOverbreakTime' as any) || 'Overbreaks', t('pdfAbsences' as any) || 'Absences', t('pdfTardinessMins' as any) || 'Tardiness']];
  const tableData: any[][] = [];

  const sortedLobs = Object.keys(lobs).sort();

  sortedLobs.forEach(lobName => {
    const agents = lobs[lobName];
    const agentCount = agents.length;
    let totalOverbreak = 0;
    let totalAbsences = 0;
    let totalTardiness = 0;

    agents.forEach(s => {
      totalOverbreak += s.totalOverbreakMinutes;
      totalAbsences += s.dailyRecords.filter(r => r.isAbsence).length;
      totalTardiness += s.dailyRecords.reduce((acc, r) => acc + (r.tardinessMinutes || 0), 0);
    });

    tableData.push([
      lobName,
      agentCount,
      `${totalOverbreak}m`,
      totalAbsences,
      `${totalTardiness}m`
    ]);
  });

  autoTable(doc, {
    startY: startYPos,
    head: head,
    body: tableData,
    headStyles: { fillColor: [79, 70, 229], textColor: 255 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    didParseCell: function (data) {
      if (data.section === 'body') {
        const textStr = Array.isArray(data.cell.text) ? data.cell.text[0] : data.cell.text;
        if (data.column.index === 2 && textStr && textStr !== '0m') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  doc.save(`${filename}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

function getAgentMetricValue(s: EmployeeSummary, options: PDFOptions): number {
  if (options.isWc) {
    return s.dailyRecords.reduce((acc: number, r: any) => acc + (r.wcOverbreak || 0), 0);
  }
  if (options.isIdle) {
    return s.dailyRecords.reduce((acc: number, r: any) => acc + (r.idleOverbreak || 0), 0);
  }
  if (options.isTardiness || options.isMinorTardiness) {
    return s.totalTardinessMinutes || 0;
  }
  if (options.isEarlyLeave) {
    return s.totalEarlyLeaveMinutes || 0;
  }
  if (options.isNonMod) {
    return s.dailyRecords.reduce((acc: number, r: any) => acc + (r.nonModDuration || 0), 0);
  }
  if (options.isRa) {
    return s.totalReviewAndAppealMinutes || 0;
  }
  if (options.isAt) {
    return s.totalAwaitingTasksMinutes || 0;
  }
  if (options.isShort30Min) {
    return s.totalShort30MinRecords || 0;
  }
  if (options.isAbsences) {
    return s.totalAbsences || 0;
  }
  if (options.showCheck) {
    return s.dailyRecords.filter((r: any) => isShiftMismatch(r.scheduledShift, r.inferredShift)).length;
  }
  return s.totalOverbreakMinutes || 0;
}

function formatDisplayDate(dateStr: string, lang: string): string {
  try {
    const d = parse(dateStr, 'yyyy-MM-dd', new Date());
    if (isValid(d)) {
      return format(d, lang === 'pt' ? 'dd/MM/yyyy' : 'MM/dd/yyyy');
    }
  } catch (e) {
    // fallback
  }
  return dateStr;
}

function groupAgentExtraStatuses(s: EmployeeSummary, keys: string[], lang: string, isNextVacations?: boolean, options?: PDFOptions): any[][] {
  const rows: any[][] = [];
  const recordsWithStatus: { date: string; status: string }[] = [];
  
  const fullEmp = (options?.allSummaries?.find(emp => emp.employeeName === s.employeeName || (emp.email && s.email && emp.email.toLowerCase() === s.email.toLowerCase())) || s);

  if (keys.includes('isRefresher')) {
    if (s.isRefresher) {
      const agentName = s.email ? `${s.employeeName} (${s.email})` : s.employeeName;
      const retDate = s.refresherDate ? (() => { try { return formatDisplayDate(s.refresherDate, lang); } catch(e) { return s.refresherDate; } })() : 'N/A';
      return [[
        agentName,
        retDate,
        '-',
        `REFRESHER`
      ]];
    }
    return [];
  }

  fullEmp.dailyRecords.forEach(r => {
    const matchingKeys = keys.filter(k => !!r[k as keyof typeof r]);
    if (matchingKeys.length > 0) {
      const matchedStatusLabels = matchingKeys.map(k => {
        if (k === 'isATT') return 'ATT';
        if (k === 'isLOA') return 'LOA';
        if (k === 'isPTO') return 'PTO/VAC';
        if (k === 'isSL') return 'SL';
        if (k === 'isSUSPP') return 'SUSPP';
        if (k === 'isOFF') return 'OFF';
        if (k === 'isRefresher') return `REFRESHER (Volta: ${s.refresherDate ? (() => { try { return format(parseISO(s.refresherDate), 'dd/MM'); } catch(e) { return s.refresherDate; } })() : 'N/A'})`;
        return 'ACTIVE';
      });
      recordsWithStatus.push({
        date: r.date,
        status: matchedStatusLabels.join('/')
      });
    }
  });
  
  if (recordsWithStatus.length === 0) return [];
  
  // Sort by date ascending
  const sorted = [...recordsWithStatus].sort((a, b) => a.date.localeCompare(b.date));
  
  const groups: { startDate: string; endDate: string; status: string }[] = [];
  
  let currentStart = sorted[0].date;
  let currentEnd = sorted[0].date;
  let currentStatus = sorted[0].status;
  
  for (let i = 1; i < sorted.length; i++) {
    const nextRec = sorted[i];
    
    const currentEndD = new Date(currentEnd + 'T12:00:00');
    const nextD = new Date(nextRec.date + 'T12:00:00');
    
    const diffTime = Math.abs(nextD.getTime() - currentEndD.getTime());
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    // Bridge gap up to 3 days
    if (diffDays <= 3 && nextRec.status === currentStatus) {
      currentEnd = nextRec.date;
    } else {
      groups.push({
        startDate: currentStart,
        endDate: currentEnd,
        status: currentStatus
      });
      currentStart = nextRec.date;
      currentEnd = nextRec.date;
      currentStatus = nextRec.status;
    }
  }
  
  groups.push({
    startDate: currentStart,
    endDate: currentEnd,
    status: currentStatus
  });
  
  const agentName = s.email ? `${s.employeeName} (${s.email})` : s.employeeName;
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Lisbon" }));
  const todayStr = format(today, 'yyyy-MM-dd');
  
  const activeGroups = groups.filter(g => {
    if (isNextVacations) {
      return g.startDate >= todayStr;
    } else {
      if (options?.periodFilter === 'day') {
         return g.startDate <= todayStr && g.endDate >= todayStr;
      } else if (options?.periodFilter === 'yesterday') {
         const yesterday = new Date(today);
         yesterday.setDate(yesterday.getDate() - 1);
         const yestStr = format(yesterday, 'yyyy-MM-dd');
         return g.startDate <= yestStr && g.endDate >= yestStr;
      } else {
         return g.endDate >= todayStr;
      }
    }
  });

  activeGroups.forEach(g => {
    let startD = formatDisplayDate(g.startDate, lang);
    let endD = formatDisplayDate(g.endDate, lang);
    
    if (g.status.includes('REFRESHER')) {
      const retDate = s.refresherDate ? (() => { try { return formatDisplayDate(s.refresherDate, lang); } catch(e) { return s.refresherDate; } })() : 'N/A';
      startD = retDate;
      endD = '-';
    }

    rows.push([
      agentName,
      startD,
      endD,
      g.status
    ]);
  });
  
  return rows;
}

function buildSingleTableData(summaries: EmployeeSummary[], options: PDFOptions, t: any, lang: string): any[][] {
  let tableData: any[][] = [];

  if (options.isTardiness || options.isMinorTardiness) {
    summaries.forEach(s => {
      const filterFn = options.isTardiness 
        ? (r: any) => (r.tardinessMinutes || 0) >= 15
        : (r: any) => (r.tardinessMinutes || 0) > 0 && (r.tardinessMinutes || 0) < 15;

      s.dailyRecords.filter(filterFn).forEach(r => {
        let actualStart = t('pdfUnknown');
        if (r.actualStartTime) {
            actualStart = format(new Date(r.actualStartTime), 'HH:mm');
        } else {
            const breakFirst = [...r.breaks].sort((a,b) => String(a.startTime).localeCompare(String(b.startTime)))[0];
            actualStart = breakFirst ? (breakFirst.startTime ? format(new Date(breakFirst.startTime), 'HH:mm') : t('pdfUnknown')) : t('pdfUnknown');
        }
        let effectiveShift = 'OK';
        if (isShiftMismatch(r.scheduledShift, r.inferredShift)) {
            effectiveShift = r.inferredShift;
        } else if (!r.scheduledShift && r.inferredShift) {
            effectiveShift = r.inferredShift;
        }

        tableData.push([
          s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
          r.date,
          r.scheduledShift || r.inferredShift || t('pdfUnknown'),
          effectiveShift,
          actualStart,
          `${r.tardinessMinutes}m`
        ]);
      });
    });
  } else if (options.isEarlyLeave) {
    summaries.forEach(s => {
      s.dailyRecords.filter(r => (r.earlyLeaveMinutes || 0) > 0).forEach(r => {
        let actualEnd = t('pdfUnknown');
        if (r.actualEndTime) {
            actualEnd = format(new Date(r.actualEndTime), 'HH:mm');
        } else {
            const breakLast = [...r.breaks].sort((a,b) => String(b.endTime).localeCompare(String(a.endTime)))[0];
            actualEnd = breakLast ? (breakLast.endTime ? format(new Date(breakLast.endTime), 'HH:mm') : t('pdfUnknown')) : t('pdfUnknown');
        }
        tableData.push([
          s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
          r.date,
          r.scheduledShift || r.inferredShift || t('pdfUnknown'),
          actualEnd,
          `${r.earlyLeaveMinutes}m`
        ]);
      });
    });
  } else if (options.isAbsences) {
    summaries.forEach(s => {
      s.dailyRecords.filter(r => r.isAbsence).forEach(r => {
        tableData.push([
          s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
          r.date,
          r.scheduledShift || r.inferredShift || t('pdfUnknown'),
          t('pdfAbsence')
        ]);
      });
    });
  } else if (options.isCheck) {
    summaries.forEach(s => {
      s.dailyRecords.filter(r => isShiftMismatch(r.scheduledShift, r.inferredShift)).forEach(r => {
        tableData.push([
          s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
          r.date,
          r.scheduledShift || t('pdfUnknown'),
          r.inferredShift || t('pdfUnknown')
        ]);
      });
    });
  } else if ((options.activeExtraStatus && options.attrKey) || (options.activeExtraStatuses && options.activeExtraStatuses.length > 0 && options.attrKeys && options.attrKeys.length > 0)) {
    const keys = options.attrKeys || (options.attrKey ? [options.attrKey] : []);
    summaries.forEach(s => {
      const rows = groupAgentExtraStatuses(s, keys, lang, options.isNextVacations, options);
      tableData.push(...rows);
    });
  } else if (options.isWc) {
    summaries.forEach(s => {
      s.dailyRecords.filter(r => (r.wcOverbreak || 0) > 0).forEach(r => {
        const effectiveShift = getEffectiveShiftValue(r.scheduledShift, r.inferredShift);
         
        let allowedConsumed: Record<string, number> = { 'meal': 0, 'short': 0, 'wellness': 0, 'praying': 0, 'wc': 0, 'idle': 0 };
        let allowedLimits: Record<string, number> = {
            'meal': r.mealDuration - r.mealOverbreak,
            'short': r.shortDuration - r.shortOverbreak,
            'wellness': r.wellnessDuration - r.wellnessOverbreak,
            'praying': r.prayingDuration - r.prayingOverbreak,
            'wc': r.wcDuration - r.wcOverbreak,
            'idle': 0
        };

        const sortedBreaks = [...r.breaks].sort((a,b) => String(a.startTime).localeCompare(String(b.startTime)));

        sortedBreaks.forEach(b => {
           let typeKey = b.type;
           if (typeKey === 'forgot_status') typeKey = 'idle';

           if (typeKey in allowedLimits) {
               const allowedLimit = allowedLimits[typeKey];
               const currentConsumed = allowedConsumed[typeKey];
               const newConsumed = currentConsumed + b.durationMinutes;

               let exceededMinutes = 0;
               if (newConsumed > allowedLimit) {
                   exceededMinutes = Math.min(b.durationMinutes, newConsumed - Math.max(allowedLimit, currentConsumed));
               }
               
               allowedConsumed[typeKey] = newConsumed;

               if (b.type === 'wc') {
                   const timeWindow = `${b.startTime ? format(new Date(b.startTime), 'HH:mm') : '-'}-${b.endTime ? format(new Date(b.endTime), 'HH:mm') : '-'}`;
                   tableData.push([
                     s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
                     r.date,
                     r.scheduledShift || r.inferredShift || t('pdfUnknown'),
                     effectiveShift,
                     timeWindow,
                     exceededMinutes > 0 ? `+${exceededMinutes}m` : '-'
                   ]);
               }
           }
        });
      });
    });
  } else if (options.isIdle) {
    summaries.forEach(s => {
      s.dailyRecords.filter(r => (r.idleDuration || 0) > 0).forEach(r => {
        const effectiveShift = getEffectiveShiftValue(r.scheduledShift, r.inferredShift);
        tableData.push([
          s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
          r.date,
          r.scheduledShift || r.inferredShift || t('pdfUnknown'),
          effectiveShift,
          'IDLE',
          `${r.idleDuration || 0}m`
        ]);
      });
    });
  } else if (options.isOverbreaks) {
    summaries.forEach(s => {
      s.dailyRecords.filter(r => (r.totalOverbreak || 0) > 0).forEach(r => {
        const effectiveShift = getEffectiveShiftValue(r.scheduledShift, r.inferredShift);
        
        let allowedConsumed: Record<string, number> = { 'meal': 0, 'short': 0, 'wellness': 0, 'praying': 0, 'wc': 0, 'idle': 0 };
        let allowedLimits: Record<string, number> = {
            'meal': r.mealDuration - r.mealOverbreak,
            'short': r.shortDuration - r.shortOverbreak,
            'wellness': r.wellnessDuration - r.wellnessOverbreak,
            'praying': r.prayingDuration - r.prayingOverbreak,
            'wc': r.wcDuration - r.wcOverbreak,
            'idle': 0
        };

        const sortedBreaks = [...r.breaks].sort((a,b) => String(a.startTime).localeCompare(String(b.startTime)));

        sortedBreaks.forEach(b => {
           let typeKey = b.type;
           if (typeKey === 'forgot_status') typeKey = 'idle';

           if (typeKey in allowedLimits) {
               const allowedLimit = allowedLimits[typeKey];
               const currentConsumed = allowedConsumed[typeKey];
               const newConsumed = currentConsumed + b.durationMinutes;

               let exceededMinutes = 0;
               if (newConsumed > allowedLimit) {
                   exceededMinutes = Math.min(b.durationMinutes, newConsumed - Math.max(allowedLimit, currentConsumed));
               }
               
               allowedConsumed[typeKey] = newConsumed;

               if (exceededMinutes > 0 && (b.type === 'meal' || b.type === 'short' || b.type === 'wellness' || b.type === 'praying')) {
                   const timeWindow = `${b.startTime ? format(new Date(b.startTime), 'HH:mm') : '-'}-${b.endTime ? format(new Date(b.endTime), 'HH:mm') : '-'}`;
                   tableData.push([
                     s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
                     r.date,
                     r.scheduledShift || r.inferredShift || t('pdfUnknown'),
                     effectiveShift,
                     timeWindow,
                     b.type.toUpperCase(),
                     `+${exceededMinutes}m`
                   ]);
               }
           }
        });
      });
    });
  } else {
    const isNonModOnlyMode = options.isNonMod || options.isRa || options.isAt;

    summaries.filter(s => options.showRealTime || s.totalOverbreakMinutes > 0 || s.wcAlerts > 0 || s.idleAlerts > 0 || s.totalForgotStatusMinutes > 0 || (options.isShort30Min && (s.totalShort30MinRecords || 0) > 0)).forEach(s => {
      s.dailyRecords.forEach(r => {
        const sortedBreaks = [...r.breaks].sort((a,b) => String(a.startTime).localeCompare(String(b.startTime)));
        
        let allowedConsumed: Record<string, number> = {
            'meal': 0,
            'short': 0,
            'wellness': 0,
            'praying': 0,
            'wc': 0,
            'idle': 0
        };
        let allowedLimits: Record<string, number> = {
            'meal': r.mealDuration - r.mealOverbreak,
            'short': r.shortDuration - r.shortOverbreak,
            'wellness': r.wellnessDuration - r.wellnessOverbreak,
            'praying': r.prayingDuration - r.prayingOverbreak,
            'wc': r.wcDuration - r.wcOverbreak,
            'idle': 0
        };

        sortedBreaks.forEach(b => {
           let typeKey = b.type;
           if (typeKey === 'forgot_status') typeKey = 'idle';

           let isOverbreakInstance = false;
           let dispText = '-';

           if (typeKey in allowedLimits) {
               const allowedLimit = allowedLimits[typeKey];
               const currentConsumed = allowedConsumed[typeKey];
               const newConsumed = currentConsumed + b.durationMinutes;

               if (newConsumed > allowedLimit) {
                   isOverbreakInstance = true;
                   const increment = Math.min(b.durationMinutes, newConsumed - Math.max(allowedLimit, currentConsumed));
                   if (increment > 0) {
                       dispText = `+${increment}m`;
                   }
               }
               
               if (options.isShort30Min && b.type === 'short') {
                   isOverbreakInstance = true;
                   if (dispText === '-') {
                       dispText = `${b.durationMinutes}m`;
                   }
               }
               
               allowedConsumed[typeKey] = newConsumed;
           }

           let matchesFilter = false;

           const typeHasOverbreak = 
              (b.type === 'meal' && r.mealOverbreak > 0) ||
              (b.type === 'short' && r.shortOverbreak > 0) ||
              (b.type === 'wellness' && r.wellnessOverbreak > 0) ||
              (b.type === 'praying' && r.prayingOverbreak > 0) ||
              (b.type === 'wc' && r.wcOverbreak > 0) ||
              ((b.type === 'idle' || b.type === 'forgot_status') && r.idleOverbreak > 0);

          if (options.isOverbreaks && (b.type === 'meal' || b.type === 'wellness' || b.type === 'praying' || b.type === 'short') && (isOverbreakInstance || typeHasOverbreak)) {
               matchesFilter = true;
           }
           if (options.isShort30Min && b.type === 'short' && (isOverbreakInstance || typeHasOverbreak)) {
               matchesFilter = true;
           }
          if (options.isWc && b.type === 'wc' && (isOverbreakInstance || typeHasOverbreak)) {
               matchesFilter = true;
           }
          if (options.isIdle && typeKey === 'idle' && (isOverbreakInstance || typeHasOverbreak)) {
               matchesFilter = true;
           }
           if (options.isNonMod && b.type === 'non_moderating') {
               matchesFilter = true;
           }
           
           let noSpecificFilter = !options.isOverbreaks && !options.isWc && !options.isIdle && !options.isNonMod && !options.isShort30Min;
           
           if (noSpecificFilter) {
               if (b.type !== 'wc') {
                   matchesFilter = true;
               }
           }

           if (!matchesFilter) {
               isOverbreakInstance = false;
           }

          if (matchesFilter && (options.showRealTime || isOverbreakInstance || typeHasOverbreak || (b.type === 'non_moderating' && options.isNonMod))) {
               let label: string = b.type;
               if (b.type === 'other') label = b.rawStatus || b.type;
               else if (b.type === 'forgot_status') label = 'IDLE';
               else if (b.type === 'non_moderating' && b.subType) label = b.subType;
               else if (b.type === 'wc') label = 'ORGANIC';

               const rowData = [
                   s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
                   r.date,
                   label.toUpperCase(),
                   b.startTime ? format(new Date(b.startTime), 'HH:mm') : '-',
                   b.endTime ? format(new Date(b.endTime), 'HH:mm') : '-',
                   `${b.durationMinutes}m`
               ];
               
               if (!isNonModOnlyMode) {
                   rowData.push(dispText);
               }

               tableData.push(rowData);
           }
        });
      });
    });
  }

  let lastAgentName = '';
  let agentBgColor = false;
  tableData.forEach((row: any) => {
    if (row[0] === lastAgentName) {
      row[0] = '';
    } else {
      lastAgentName = String(row[0]);
      agentBgColor = !agentBgColor;
    }
    row._bg = agentBgColor;
  });

  return tableData;
}

export function exportToPDF(summaries: EmployeeSummary[], title: string = "Breaks Report", filename: string = "breaks_report", options: PDFOptions = {}) {
  const lang: string = 'en'; // Force English for all PDFs as requested by user
  const t = (key: keyof typeof translations['pt']) => translations[lang][key] || key;

  const isShowBPOSelected = !!options.showBPO;

  if (!isShowBPOSelected) {
    summaries = summaries.filter(s => {
      const lobText = (s.lob || '').toLowerCase();
      return !lobText.includes('bpo');
    });
    if (options.allSummaries) {
      options.allSummaries = options.allSummaries.filter(s => {
        const lobText = (s.lob || '').toLowerCase();
        return !lobText.includes('bpo');
      });
    }
    if (options.periodSummaries) {
      options.periodSummaries = options.periodSummaries.filter(s => {
        const lobText = (s.lob || '').toLowerCase();
        return !lobText.includes('bpo');
      });
    }
  }

  // Construct dynamic filename
  let filterName = "Extract";
  if (options.isOverbreaks) filterName = "Overbreaks";
  else if (options.isWc) filterName = "Organic";
  else if (options.isIdle) filterName = "Idle";
  else if (options.isTardiness) filterName = "Tardiness";
  else if (options.isMinorTardiness) filterName = "Minor_Tardiness";
  else if (options.isEarlyLeave) filterName = "Early_Leave";
  else if (options.isAbsences) filterName = "Absences";
  else if (options.isCheck) filterName = "OtherShift";
  else if (options.isShort30Min) filterName = "30min";
  else if (options.isNonMod) filterName = "Non_Mod";
  else if (options.isRa) filterName = "R_A";
  else if (options.isAt) filterName = "A_T";
  else if (options.activeExtraStatuses && options.activeExtraStatuses.length > 0) {
    filterName = options.activeExtraStatuses.join("_").replace(/[^a-zA-Z0-9]/g, "_");
  } else if (options.statusFiltersText) {
    const clean = getCleanStatusText(options.statusFiltersText);
    if (clean) {
      filterName = clean.replace(/[^a-zA-Z0-9]/g, "_");
    }
  }

  let contextName = "";
  if (filename && filename.startsWith("Report_")) {
    contextName = filename.replace(/^Report_/i, "");
  } else if (title && title.includes(" - ")) {
    const parts = title.split(" - ");
    const rightPart = parts[parts.length - 1].trim();
    if (rightPart && rightPart !== "(All)" && rightPart !== "(Todos)" && rightPart !== "All" && rightPart !== "Todos") {
      contextName = rightPart.replace(/[^a-zA-Z0-9_\s-]/g, "").trim().replace(/[\s-]+/g, "_");
    }
  }

  let finalFilename = filterName;
  if (contextName) {
    finalFilename += `_${contextName}`;
  }
  const dateStr = format(new Date(), 'dd-MM-yyyy-HH:mm');
  finalFilename += `_${dateStr}`;

  // Normalize check options for robust compatibility
  if (options.showCheck !== undefined && options.isCheck === undefined) {
    options.isCheck = options.showCheck;
  }
  if (options.isCheck !== undefined && options.showCheck === undefined) {
    options.showCheck = options.isCheck;
  }

  // Preprocess summaries to filter "HOJE" (day) extracts (no yesterday nightshift, no overtime)
  if (options.periodFilter === 'day' || options.showRealTime) {
    let latestTargetDateStr = '';
    summaries.forEach(s => {
      s.dailyRecords.forEach(r => {
        if (r.date && r.date > latestTargetDateStr) {
          latestTargetDateStr = r.date;
        }
      });
    });

    if (latestTargetDateStr) {
      summaries = summaries.map(s => {
        // 1. Exclude non-today records
        let filteredRecords = s.dailyRecords.filter(r => r.date === latestTargetDateStr);

        // 2. Exclude overtime breaks/sessions (startTime >= shiftEndLimit)
        filteredRecords = filteredRecords.map(r => {
          const shiftEnd = getShiftEndDateTime(r.date, r.scheduledShift || r.inferredShift);
          let filteredBreaks = r.breaks;
          if (shiftEnd) {
            filteredBreaks = r.breaks.filter(b => new Date(b.startTime).getTime() < shiftEnd.getTime());
          }
          
          // Recalculate break durations
          let mealDuration = 0;
          let shortDuration = 0;
          let wellnessDuration = 0;
          let prayingDuration = 0;
          let wcDuration = 0;
          let idleDuration = 0;
          let nonModDuration = 0;
          
          filteredBreaks.forEach(b => {
            if (b.type === 'meal') mealDuration += b.durationMinutes;
            else if (b.type === 'short') shortDuration += b.durationMinutes;
            else if (b.type === 'wellness') wellnessDuration += b.durationMinutes;
            else if (b.type === 'praying') prayingDuration += b.durationMinutes;
            else if (b.type === 'wc') wcDuration += b.durationMinutes;
            else if (b.type === 'idle' || b.type === 'forgot_status') idleDuration += b.durationMinutes;
            else if (b.type === 'non_moderating') nonModDuration += b.durationMinutes;
          });
          
          // Recalculate overbreaks safely
          const origMealPaid = r.mealDuration - r.mealOverbreak;
          const mealOverbreak = Math.max(0, mealDuration - origMealPaid);
          
          const origShortPaid = r.shortDuration - r.shortOverbreak;
          const shortOverbreak = Math.max(0, shortDuration - origShortPaid);
          
          const origWellnessPaid = r.wellnessDuration - r.wellnessOverbreak;
          const wellnessOverbreak = Math.max(0, wellnessDuration - origWellnessPaid);
          
          const origPrayingPaid = r.prayingDuration - r.prayingOverbreak;
          const prayingOverbreak = Math.max(0, prayingDuration - origPrayingPaid);
          
          const origWcPaid = r.wcDuration - r.wcOverbreak;
          const wcOverbreak = Math.max(0, wcDuration - origWcPaid);
          
          const idleOverbreak = idleDuration;
          
          const totalOverbreak = mealOverbreak + shortOverbreak + wellnessOverbreak + prayingOverbreak;
          
          return {
            ...r,
            breaks: filteredBreaks,
            mealDuration,
            shortDuration,
            wellnessDuration,
            prayingDuration,
            wcDuration,
            idleDuration,
            nonModDuration,
            mealOverbreak,
            shortOverbreak,
            wellnessOverbreak,
            prayingOverbreak,
            wcOverbreak,
            idleOverbreak,
            totalOverbreak
          };
        });

        // Recalculate individual summaries total minutes
        const totalBreakMinutes = filteredRecords.reduce((acc, r) => acc + r.breaks.reduce((sum, b) => sum + b.durationMinutes, 0), 0);
        const totalOverbreakMinutes = filteredRecords.reduce((acc, r) => acc + r.totalOverbreak, 0);
        const totalNonModMinutes = filteredRecords.reduce((acc, r) => acc + r.nonModDuration, 0);
        const totalTardinessMinutes = filteredRecords.reduce((acc, r) => acc + (r.tardinessMinutes || 0), 0);
        const totalEarlyLeaveMinutes = filteredRecords.reduce((acc, r) => acc + (r.earlyLeaveMinutes || 0), 0);

        return {
          ...s,
          dailyRecords: filteredRecords,
          totalBreakMinutes,
          totalOverbreakMinutes,
          totalNonModMinutes,
          totalTardinessMinutes,
          totalEarlyLeaveMinutes
        };
      });
    }
  }

  const doc = new jsPDF();
  
  let cleanStatus = getCleanStatusText(options.statusFiltersText);
  if (options.isCheck) {
    cleanStatus = "Other Shift";
  }
  if (cleanStatus) {
      cleanStatus = translateToEnglish(cleanStatus);
      cleanStatus = cleanStatus.replace(/Check|Divergências|Divergência|Divergences/gi, "Other Shift");
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42); // slate-900 (neutral deep charcoal)
      doc.text(cleanStatus.toUpperCase(), 105, 14, { align: 'center' });
      doc.setFont("helvetica", "normal");
  }
  
  doc.setFontSize(18);
  let displayTitle = translateToEnglish(title);
  if (options.isCheck) {
    displayTitle = displayTitle.replace(/Schedule Check \(Mismatch\)/gi, "Other Shift Report")
                               .replace(/Check/gi, "Other Shift")
                               .replace(/Diverg\u00EAncias/gi, "Other Shift")
                               .replace(/Diverg\u00EAncia/gi, "Other Shift")
                               .replace(/Divergences/gi, "Other Shift");
  }
  if (options.isNextVacations) {
    displayTitle = "Next PTO's";
  } else if (options.isRefresher) {
    displayTitle = lang === 'pt' ? "Retornos de Refresher" : "Refresher Returns";
  }
  doc.text(displayTitle, 14, 22);
  
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`${t('generatedAt')}: ${format(new Date(), 'MM/dd/yyyy HH:mm')}`, 14, 30);
  
  let dateSubtitle = '';
  let minDateStr: string | null = null;
  let maxDateStr: string | null = null;

  if (options.periodMinDateStr && options.periodMaxDateStr) {
      minDateStr = options.periodMinDateStr;
      maxDateStr = options.periodMaxDateStr;
  } else if (options.selectedDateStrs && options.selectedDateStrs.length > 0) {
      const sortedDates = [...options.selectedDateStrs].sort((a,b) => a.localeCompare(b));
      minDateStr = sortedDates[0];
      maxDateStr = sortedDates[sortedDates.length - 1];
  } else if (options.showRealTime) {
      const rtDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Lisbon" }));
      minDateStr = maxDateStr = format(rtDate, 'yyyy-MM-dd');
  } else if (options.periodFilter === 'day' && options.latestDate) {
      minDateStr = maxDateStr = format(options.latestDate, 'yyyy-MM-dd');
  } else if (options.periodFilter === 'yesterday' && options.latestDate) {
      const yesterday = new Date(options.latestDate);
      yesterday.setDate(yesterday.getDate() - 1);
      minDateStr = maxDateStr = format(yesterday, 'yyyy-MM-dd');
  } else {
      // Primarily extract dates from periodSummaries so it reflects the whole dataset/month without taking unrequested dates
      let listToUseForDates = (options.periodSummaries && options.periodSummaries.length > 0) ? options.periodSummaries : ((options.allSummaries && options.allSummaries.length > 0) ? options.allSummaries : summaries);
      let allDates = listToUseForDates.flatMap(s => s.dailyRecords.map(r => r.date))
          .filter(Boolean)
          .sort((a,b) => a.localeCompare(b));
      
      if (allDates.length > 0) {
          minDateStr = allDates[0];
          maxDateStr = allDates[allDates.length - 1];
          // For legacy compatibility, if it says single day but no options were passed
          const isSingleDay = options.periodFilter === 'day' || options.periodFilter === 'yesterday';
          if (isSingleDay) {
              minDateStr = maxDateStr;
          }
      }
  }

  if (minDateStr && maxDateStr) {
      const minD = parse(minDateStr, 'yyyy-MM-dd', new Date());
      const maxD = parse(maxDateStr, 'yyyy-MM-dd', new Date());
       
      if (minDateStr === maxDateStr) {
          dateSubtitle = lang === 'pt' ? `Relatório do dia ${format(minD, 'dd/MM/yyyy')}` : `Report for ${format(minD, 'MM/dd/yyyy')}`;
      } else {
          if (lang === 'pt') {
              dateSubtitle = `Relatório do dia ${format(minD, 'dd/MM/yyyy')} ao dia ${format(maxD, 'dd/MM/yyyy')}`;
          } else {
              dateSubtitle = `Report from ${format(minD, 'MM/dd/yyyy')} to ${format(maxD, 'MM/dd/yyyy')}`;
          }
      }
  }

  let startYPos = 40;
  if (dateSubtitle) {
      doc.setFontSize(12);
      doc.setTextColor(50);
      doc.text(dateSubtitle, 14, 38);
      startYPos = 48;
  }
  
  if (options.statusFiltersText) {
      // Old left-aligned Status info is removed as it's now centered at the top
  }

  if (options.totalAgentsCount !== undefined && options.affectedAgentsCount !== undefined) {
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`${t('totalAgentsPeriod')}: ${options.totalAgentsCount}`, 14, startYPos - 2);
    doc.text(`${t('affectedAgents')}: ${options.affectedAgentsCount}`, 14, startYPos + 6);
    startYPos += 14;
  }
  
  if (options.teamProductiveMinutes !== undefined && options.teamNonModMinutes !== undefined && (options.isNonMod || options.isRa || options.isAt)) {
      const prodTotalHours = Math.floor(options.teamProductiveMinutes / 60);
      const prodTotalMins = options.teamProductiveMinutes % 60;
      const nonModPct = options.teamProductiveMinutes > 0 ? ((options.teamNonModMinutes / options.teamProductiveMinutes) * 100).toFixed(1) : 0;
      
      const prodStr = `${prodTotalHours}h ${prodTotalMins}m`;
      const nonModStr = `${options.teamNonModMinutes}m`;
      
      doc.setFontSize(11);
      doc.setTextColor(100);
      
      doc.text(`${lang === 'pt' ? 'Tempo produtivo da equipe' : 'Team productive time'}: ${prodStr}  |  ${lang === 'pt' ? 'Total non-moderating da equipe' : 'Team total non-moderating'}: ${nonModStr} (${nonModPct}%)`, 14, startYPos);
      startYPos += 8;
  }

  const hasActiveExtra = !!(options.activeExtraStatus || (options.activeExtraStatuses && options.activeExtraStatuses.length > 0));
  if (options.isAgentDetail && !hasActiveExtra) {
    let nextY = startYPos;

    let sortedSummaries = [...summaries];
    if (options.isGroupedByTL) {
        sortedSummaries.sort((a, b) => {
          const tlA = (a.supervisor || 'No Team Leader').trim().toUpperCase();
          const tlB = (b.supervisor || 'No Team Leader').trim().toUpperCase();
          if (tlA !== tlB) return tlA.localeCompare(tlB);

          const lobA = (a.lob ? `${a.lob.trim()}${a.language ? ' ' + a.language.trim() : ''}` : 'No LOB').toUpperCase();
          const lobB = (b.lob ? `${b.lob.trim()}${b.language ? ' ' + b.language.trim() : ''}` : 'No LOB').toUpperCase();
          if (lobA !== lobB) return lobA.localeCompare(lobB);

          const valA = getAgentMetricValue(a, options);
          const valB = getAgentMetricValue(b, options);
          if (valA !== valB) return valB - valA; // Descending!

          return a.employeeName.localeCompare(b.employeeName);
        });
    }

    let lastTL = '';
    let lastLOB = '';

    sortedSummaries.forEach((s, index) => {
        const currentTL = (s.supervisor || 'No Team Leader').trim().toUpperCase();
        const currentLOB = (s.lob ? `${s.lob.trim()}${s.language ? ' ' + s.language.trim() : ''}` : 'No LOB').toUpperCase();

        if (index > 0) {
            if (options.isGroupedByTL) {
                const prevS = sortedSummaries[index - 1];
                const prevTL = (prevS.supervisor || 'No Team Leader').trim().toUpperCase();
                
                if (currentTL !== prevTL) {
                    if (nextY > 190) {
                        doc.addPage();
                        nextY = 20;
                        lastTL = '';  // Force reprint on new page
                        lastLOB = ''; // Force reprint on new page
                    } else {
                        nextY += 2;
                        // Draw a dividing line to separate TL sections on the same page
                        doc.setDrawColor(79, 70, 229); // Royal indigo
                        doc.setLineWidth(1.5); // Thicker line for explicit TL transition
                        doc.line(14, nextY, doc.internal.pageSize.getWidth() - 14, nextY);
                        nextY += 8; // small space after line
                    }
                } else {
                    // Check if current page is getting too full for another agent (to prevent truncation or weird overlapping)
                    if (nextY > 240) {
                        doc.addPage();
                        nextY = 20;
                        lastTL = '';  // Force reprint on new page
                        lastLOB = ''; // Force reprint on new page
                    } else {
                        nextY += 6; // Pack closer together to reduce white spaces
                    }
                }
            } else {
                doc.addPage();
                nextY = 20;
            }
        }

        if (options.isGroupedByTL) {
            // Print TL Header if changed
            if (currentTL !== lastTL) {
                doc.setFontSize(15);
                doc.setTextColor(79, 70, 229); // Royal indigo
                doc.setFont('helvetica', 'bold');
                doc.text(`TEAM LEADER: ${currentTL}`, 14, nextY);
                nextY += 7;
                lastTL = currentTL;
                lastLOB = ''; // Reset LOB for new TL
            }
            // Print LOB Header if changed (centered with a background banner)
            if (currentLOB !== lastLOB) {
                const pageWidth = doc.internal.pageSize.getWidth();
                const marginX = 14;
                const bannerHeight = 8;
                
                // Draw filled rectangle banner in a professional soft blue-indigo background
                doc.setFillColor(235, 241, 254);
                doc.rect(marginX, nextY - 1, pageWidth - 2 * marginX, bannerHeight, 'F');
                
                // Restyle text to be bold, slate gray, and centered
                doc.setFontSize(11);
                doc.setTextColor(30, 41, 59); // deep slate/charcoal
                doc.setFont('helvetica', 'bold');
                
                const labelText = `LOB: ${currentLOB.toUpperCase()}`;
                const textWidth = doc.getTextWidth(labelText);
                const textX = (pageWidth - textWidth) / 2;
                
                doc.text(labelText, textX, nextY + 5);
                nextY += bannerHeight + 5;
                lastLOB = currentLOB;
            }
            
            // Draw a neat separator line under the grouping headers
            doc.setDrawColor(223, 225, 230);
            doc.setLineWidth(0.5);
            doc.line(14, nextY, doc.internal.pageSize.getWidth() - 14, nextY);
            nextY += 6;
        }

        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text(s.email ? `${s.employeeName} (${s.email})` : s.employeeName, 14, nextY);
        doc.setFont('helvetica', 'normal');
        nextY += 4;
        
        doc.setDrawColor(220, 220, 220);
        doc.line(14, nextY, doc.internal.pageSize.getWidth() - 14, nextY);
        nextY += 6;

        const totalModeratingMinutes = Math.round(s.dailyRecords.reduce((acc, r) => acc + r.breaks.filter(b => b.type === 'moderating').reduce((sum, b) => sum + b.durationMinutes, 0), 0));
        
        const overbreakTypes = [];
        const mealOver = s.dailyRecords.reduce((acc, r) => acc + r.mealOverbreak, 0);
        if (mealOver > 0) overbreakTypes.push(t('meal'));
        const shortOver = s.dailyRecords.reduce((acc, r) => acc + r.shortOverbreak, 0);
        if (shortOver > 0) overbreakTypes.push(t('short'));
        const wellOver = s.dailyRecords.reduce((acc, r) => acc + r.wellnessOverbreak, 0);
        if (wellOver > 0) overbreakTypes.push(t('wellness'));
        const prayOver = s.dailyRecords.reduce((acc, r) => acc + r.prayingOverbreak, 0);
        if (prayOver > 0) overbreakTypes.push(t('praying'));
        const typesStr = overbreakTypes.length > 0 ? overbreakTypes.join(', ') : t('pdfNone');

        const isNonModOnlyMode = options.isNonMod || options.isRa || options.isAt;

        let head1Raw;
        let tableData1Row;

        if (isNonModOnlyMode) {
          const nonModTotal = Math.round(s.dailyRecords.reduce((acc, r) => acc + r.breaks.filter(b => {
             if (b.type !== 'non_moderating') return false;
             if (options.isNonMod && !b.subType?.toLowerCase()?.includes('review') && !b.subType?.toLowerCase()?.includes('appeal') && !b.subType?.toLowerCase()?.includes('awaiting task')) return true;
             if (options.isRa && (b.subType?.toLowerCase()?.includes('review') || b.subType?.toLowerCase()?.includes('appeal'))) return true;
             if (options.isAt && b.subType?.toLowerCase()?.includes('awaiting task')) return true;
             return false;
          }).reduce((sum, b) => sum + b.durationMinutes, 0), 0));

          if (options.isRa || options.isAt) {
             head1Raw = [lang === 'pt' ? 'Tempo total em non-moderating' : 'Total non-moderating time'];
             tableData1Row = [
               `${nonModTotal}m`
             ];
             head1Raw.push(t('pdfOverbreakTime'));
             if (options.isWc) head1Raw.push(t('pdfWcTime'), t('pdfWcAlerts'));
             
             tableData1Row.push(`${s.totalOverbreakMinutes}m`);
             if (options.isWc) {
                 tableData1Row.push(
                    s.wcTotalMinutes > 0 ? `${s.wcTotalMinutes}m` : '0m',
                    s.wcAlerts > 0 ? `${s.wcAlerts} ${t('pdfAlerts')}` : t('pdfNone')
                 );
             }
          } else {
             head1Raw = [lang === 'pt' ? 'Tempo total em non-moderating' : 'Total non-moderating time', t('pdfTotalBreaks'), t('pdfOverbreakTypes')];
             tableData1Row = [
               `${nonModTotal}m`,
               `${s.totalBreakMinutes}m`,
               typesStr
             ];
             head1Raw.push(t('pdfOverbreakTime'));
             if (options.isWc) head1Raw.push(t('pdfWcTime'), t('pdfWcAlerts'));
             
             tableData1Row.push(`${s.totalOverbreakMinutes}m`);
             if (options.isWc) {
                 tableData1Row.push(
                    s.wcTotalMinutes > 0 ? `${s.wcTotalMinutes}m` : '0m',
                    s.wcAlerts > 0 ? `${s.wcAlerts} ${t('pdfAlerts')}` : t('pdfNone')
                 );
             }
          }
        } else {
          head1Raw = [t('pdfTotalBreaks'), t('pdfOverbreakTypes')];
          tableData1Row = [
            `${s.totalBreakMinutes}m`,
            typesStr
          ];
          
          head1Raw.push(t('pdfOverbreakTime'));
          if (options.isWc) head1Raw.push(t('pdfWcTime'), t('pdfWcAlerts'));
          tableData1Row.push(`${s.totalOverbreakMinutes}m`);
          if (options.isWc) {
              tableData1Row.push(
                s.wcTotalMinutes > 0 ? `${s.wcTotalMinutes}m` : '0m',
                s.wcAlerts > 0 ? `${s.wcAlerts} ${t('pdfAlerts')}` : t('pdfNone')
              );
          }
        }
        
        const head1 = [head1Raw];
        const tableData1 = [tableData1Row];

        autoTable(doc, {
          startY: nextY,
          head: head1,
          body: tableData1,
          headStyles: { fillColor: [41, 128, 185], textColor: 255 },
          alternateRowStyles: { fillColor: [250, 250, 250] },
          didParseCell: function (data) {
            if (data.section === 'body' && !isNonModOnlyMode) {
              const textStr = Array.isArray(data.cell.text) ? data.cell.text[0] : data.cell.text;
              if (data.column.index === 3 && textStr && textStr !== '0m') {
                data.cell.styles.fillColor = [220, 38, 38];
                data.cell.styles.textColor = [255, 255, 255];
                data.cell.styles.fontStyle = 'bold';
              }
              if (data.column.index === 4 && textStr && textStr !== '0m') {
                 data.cell.styles.fillColor = [217, 119, 6];
                 data.cell.styles.textColor = [0, 0, 0];
                 data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        });

        nextY = (doc as any).lastAutoTable.finalY + 5;

        const records = [...s.dailyRecords].sort((a, b) => a.date.localeCompare(b.date));
        
        const hasSpecificBreakFilter = options.isWc || options.isIdle || options.isNonMod || options.isShort30Min || options.isRa || options.isAt;
        const isOverbreakGeneral = !hasSpecificBreakFilter && !options.isTardiness && !options.isMinorTardiness && !options.isEarlyLeave && !options.isAbsences && !options.isCheck && !options.activeExtraStatus && !(options.activeExtraStatuses && options.activeExtraStatuses.length > 0);

        records.forEach((r, rIdx) => {
            const sortedBreaks = [...r.breaks].sort((a,b) => String(a.startTime).localeCompare(String(b.startTime)));
            
            let allowedConsumed: Record<string, number> = { 'meal': 0, 'short': 0, 'wellness': 0, 'praying': 0, 'wc': 0, 'idle': 0 };
            let allowedLimits: Record<string, number> = {
                'meal': r.mealDuration - r.mealOverbreak,
                'short': r.shortDuration - r.shortOverbreak,
                'wellness': r.wellnessDuration - r.wellnessOverbreak,
                'praying': r.prayingDuration - r.prayingOverbreak,
                'wc': r.wcDuration - r.wcOverbreak,
                'idle': 0
            };

            const dayTableData: any[][] = [];

            sortedBreaks.forEach(b => {
                 let typeKey = b.type;
                 if (typeKey === 'forgot_status') typeKey = 'idle';

                 let isOverbreakInstance = false;
                 let dispText = '-';

                 if (typeKey in allowedLimits) {
                     const allowedLimit = allowedLimits[typeKey];
                     const currentConsumed = allowedConsumed[typeKey];
                     const newConsumed = currentConsumed + b.durationMinutes;

                     if (newConsumed > allowedLimit) {
                         isOverbreakInstance = true;
                         const increment = Math.min(b.durationMinutes, newConsumed - Math.max(allowedLimit, currentConsumed));
                         if (increment > 0) dispText = `+${increment}m`;
                     }
                     
                     if (options.isShort30Min && b.type === 'short') {
                         isOverbreakInstance = true;
                         if (dispText === '-') dispText = `${b.durationMinutes}m`;
                     }
                     allowedConsumed[typeKey] = newConsumed;
                 } else if (b.type === 'non_moderating' && r.nonModDuration > 0) {
                     // Non-moderating should just show its total duration, not as an overbreak
                     // and we don't put anything in dispText (exceeded) since it's not an overbreak
                 }

                 let matchesFilter = false;

                 const typeHasOverbreak = 
                     (b.type === 'meal' && r.mealOverbreak > 0) ||
                     (b.type === 'short' && r.shortOverbreak > 0) ||
                     (b.type === 'wellness' && r.wellnessOverbreak > 0) ||
                     (b.type === 'praying' && r.prayingOverbreak > 0) ||
                     (b.type === 'wc' && r.wcOverbreak > 0) ||
                     ((b.type === 'idle' || b.type === 'forgot_status') && r.idleOverbreak > 0);

                 if (options.isOverbreaks && (b.type === 'meal' || b.type === 'wellness' || b.type === 'praying' || b.type === 'short') && (isOverbreakInstance || typeHasOverbreak)) {
                     matchesFilter = true;
                 }
                 if (options.isShort30Min && b.type === 'short' && (isOverbreakInstance || typeHasOverbreak)) {
                     matchesFilter = true;
                 }
                 if (options.isWc && b.type === 'wc' && (isOverbreakInstance || typeHasOverbreak)) {
                     matchesFilter = true;
                 }
                 if (options.isIdle && typeKey === 'idle' && (isOverbreakInstance || typeHasOverbreak)) {
                     matchesFilter = true;
                 }
                 if (options.isNonMod && b.type === 'non_moderating' && !b.subType?.toLowerCase()?.includes('review') && !b.subType?.toLowerCase()?.includes('appeal') && !b.subType?.toLowerCase()?.includes('awaiting task')) {
                     matchesFilter = true;
                 }
                 if (options.isRa && b.type === 'non_moderating' && (b.subType?.toLowerCase()?.includes('review') || b.subType?.toLowerCase()?.includes('appeal'))) {
                     matchesFilter = true;
                 }
                 if (options.isAt && b.type === 'non_moderating' && b.subType?.toLowerCase()?.includes('awaiting task')) {
                     matchesFilter = true;
                 }
                 
                 let noSpecificFilter = !options.isOverbreaks && !options.isWc && !options.isIdle && !options.isNonMod && !options.isShort30Min && !options.isRa && !options.isAt;
                 
                 if (noSpecificFilter) {
                     if (b.type !== 'wc') {
                         matchesFilter = true;
                     }
                 }

                 if (!matchesFilter) {
                     isOverbreakInstance = false;
                 }

                 let shouldShow = options.showAllTimeline || false;
                 if (!options.showAllTimeline) {
                     if (hasSpecificBreakFilter || options.isOverbreaks) {
                         shouldShow = matchesFilter && (isOverbreakInstance || typeHasOverbreak || (b.type === 'non_moderating' && (options.isNonMod || options.isRa || options.isAt)));
                     } else if (isOverbreakGeneral) {
                         shouldShow = (isOverbreakInstance && dispText !== '-') || typeHasOverbreak;
                     } else {
                         // For check/tardiness/early leave tabs, show all to give context of the day
                         shouldShow = true;
                     }
                 }

                 if (shouldShow) {
                     let label: string = b.type;
                     if (b.type === 'other') label = b.rawStatus || b.type;
                     else if (b.type === 'forgot_status') label = 'IDLE';
                     else if (b.type === 'non_moderating' && b.subType) label = b.subType;
                     else if (b.type === 'wc') label = 'ORGANIC';

                     dayTableData.push([
                         label.toUpperCase(),
                         b.startTime ? format(new Date(b.startTime), 'HH:mm') : '-',
                         b.endTime ? format(new Date(b.endTime), 'HH:mm') : '-',
                         `${b.durationMinutes}m`,
                         dispText
                     ]);
                 }
            });

            if (dayTableData.length > 0) {
                nextY += 5;

                if (nextY > 270) {
                     doc.addPage();
                     nextY = 20;
                }

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12);
                doc.setTextColor(0);
                let shiftLabel = r.scheduledShift || r.inferredShift || t('pdfUnknown');
                if (isShiftMismatch(r.scheduledShift, r.inferredShift)) {
                    shiftLabel = `${r.scheduledShift} (Efetivo: ${r.inferredShift})`;
                }
                doc.text(`${r.date}   |   ${lang === 'pt' ? 'Escala' : 'Shift'}: ${shiftLabel}`, 14, nextY);
                doc.setFont('helvetica', 'normal');
                nextY += 3;

                const headDailyRow = [t('pdfStatus'), t('pdfStartedAt'), t('pdfActualEnd'), lang === 'pt' ? 'Duração (m)' : 'Duration (m)'];
                
                const isNonModOnlyMode = options.isNonMod || options.isRa || options.isAt;
                
                if (!isNonModOnlyMode) {
                   headDailyRow.push(lang === 'pt' ? 'Excedido' : 'Exceeded');
                }
                
                const finalDayTableData = dayTableData.map(row => {
                   if (isNonModOnlyMode) {
                      return row.slice(0, 4);
                   }
                   return row;
                });

                const headDaily = [headDailyRow];

                autoTable(doc, {
                  startY: nextY,
                  head: headDaily,
                  body: finalDayTableData,
                  headStyles: { fillColor: [79, 70, 229], textColor: 255 },
                  alternateRowStyles: { fillColor: [250, 250, 250] },
                  didParseCell: function(data) {
                      if (data.section === 'body' && !isNonModOnlyMode) {
                          const textStr = Array.isArray(data.cell.text) ? data.cell.text[0] : data.cell.text;
                          if (data.column.index === 4 && textStr && textStr !== '-') {
                              const statusCellStr = Array.isArray(data.row.cells[0].text) ? data.row.cells[0].text[0] : data.row.cells[0].text;
                              if (statusCellStr === 'ORGANIC') {
                                  data.cell.styles.fillColor = [217, 119, 6];
                                  data.cell.styles.textColor = [255, 255, 255];
                                  data.cell.styles.fontStyle = 'bold';
                              } else if (statusCellStr === 'NON-MOD' || statusCellStr === 'NON_MODERATING' || statusCellStr.includes('REVIEW') || statusCellStr.includes('APPEAL')) {
                                  // Do not apply red highlighting for non-moderating items
                              } else {
                                  data.cell.styles.fillColor = [220, 38, 38];
                                  data.cell.styles.textColor = [255, 255, 255];
                                  data.cell.styles.fontStyle = 'bold';
                              }
                          }

                          if (data.column.index === 0) {
                              if (textStr === 'MODERATING') {
                                  data.cell.styles.textColor = [34, 197, 94];
                                  data.cell.styles.fontStyle = 'bold';
                              } else if (textStr === 'IDLE' || textStr === 'FORGOT_STATUS') {
                                  data.cell.styles.textColor = [220, 38, 38];
                                  data.cell.styles.fontStyle = 'bold';
                              } else if (textStr === 'ORGANIC') {
                                  data.cell.styles.textColor = [217, 119, 6];
                                  data.cell.styles.fontStyle = 'bold';
                              } else if (textStr === 'MEAL' || textStr === 'SHORT' || textStr === 'WELLNESS') {
                                  data.cell.styles.textColor = [41, 128, 185];
                              } else if (textStr === 'OFFLINE') {
                                  data.cell.styles.textColor = [100, 116, 139];
                              }
                          }
                      }
                  }
                });
                nextY = (doc as any).lastAutoTable.finalY;
            }
        });
    });

    doc.save(`${finalFilename}.pdf`);
    return;
  }
  
  let head: string[][] = [];

  let tableData: any[][] = [];

  if (options.isTardiness || options.isMinorTardiness) {
    head = [[
      t('pdfAgent'),
      t('pdfDate'),
      lang === 'pt' ? 'Programado' : 'Scheduled',
      lang === 'pt' ? 'Turno' : 'Shift',
      t('pdfStartedAt'),
      t('pdfTardinessMins')
    ]];
    
    summaries.forEach(s => {
      const filterFn = options.isTardiness 
        ? (r: any) => (r.tardinessMinutes || 0) >= 15
        : (r: any) => (r.tardinessMinutes || 0) > 0 && (r.tardinessMinutes || 0) < 15;

      s.dailyRecords.filter(filterFn).forEach(r => {
        let actualStart = t('pdfUnknown');
        if (r.actualStartTime) {
            actualStart = format(new Date(r.actualStartTime), 'HH:mm');
        } else {
            const breakFirst = [...r.breaks].sort((a,b) => String(a.startTime).localeCompare(String(b.startTime)))[0];
            actualStart = breakFirst ? (breakFirst.startTime ? format(new Date(breakFirst.startTime), 'HH:mm') : t('pdfUnknown')) : t('pdfUnknown');
        }
        const effectiveShift = getEffectiveShiftValue(r.scheduledShift, r.inferredShift);

        tableData.push([
          s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
          r.date,
          r.scheduledShift || r.inferredShift || t('pdfUnknown'),
          effectiveShift,
          actualStart,
          `${r.tardinessMinutes}m`
        ]);
      });
    });
  } else if (options.isEarlyLeave) {
    head = [[
      t('pdfAgent'),
      t('pdfDate'),
      lang === 'pt' ? 'Programado' : 'Scheduled',
      t('pdfActualEnd'),
      t('pdfEarlyLeaveMins')
    ]];
    summaries.forEach(s => {
      s.dailyRecords.filter(r => (r.earlyLeaveMinutes || 0) > 0).forEach(r => {
        let actualEnd = t('pdfUnknown');
        if (r.actualEndTime) {
            actualEnd = format(new Date(r.actualEndTime), 'HH:mm');
        } else {
            const breakLast = [...r.breaks].sort((a,b) => String(b.endTime).localeCompare(String(a.endTime)))[0];
            actualEnd = breakLast ? (breakLast.endTime ? format(new Date(breakLast.endTime), 'HH:mm') : t('pdfUnknown')) : t('pdfUnknown');
        }
        tableData.push([
          s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
          r.date,
          r.scheduledShift || r.inferredShift || t('pdfUnknown'),
          actualEnd,
          `${r.earlyLeaveMinutes}m`
        ]);
      });
    });
  } else if (options.isAbsences) {
    head = [[
      t('pdfAgent'),
      t('pdfDate'),
      lang === 'pt' ? 'Programado' : 'Scheduled',
      t('pdfStatus')
    ]];
    summaries.forEach(s => {
      s.dailyRecords.filter(r => r.isAbsence).forEach(r => {
        tableData.push([
          s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
          r.date,
          r.scheduledShift || r.inferredShift || t('pdfUnknown'),
          t('pdfAbsence')
        ]);
      });
    });
  } else if (options.isCheck) {
    head = [[
      t('pdfAgent'),
      t('pdfDate'),
      lang === 'pt' ? 'Programado' : 'Scheduled',
      lang === 'pt' ? 'Turno' : 'Shift'
    ]];
    summaries.forEach(s => {
      s.dailyRecords.filter(r => isShiftMismatch(r.scheduledShift, r.inferredShift)).forEach(r => {
        tableData.push([
          s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
          r.date,
          r.scheduledShift || t('pdfUnknown'),
          r.inferredShift || t('pdfUnknown')
        ]);
      });
    });
  } else if ((options.activeExtraStatus && options.attrKey) || (options.activeExtraStatuses && options.activeExtraStatuses.length > 0 && options.attrKeys && options.attrKeys.length > 0)) {
    const hasRefresher = options.activeExtraStatuses?.includes('REFRESHER');
    head = [[
      t('pdfAgent'),
      hasRefresher ? (lang === 'pt' ? 'Data de Retorno' : 'Return Date') : (lang === 'pt' ? 'Início Programado' : 'Scheduled Start'),
      hasRefresher ? '-' : (lang === 'pt' ? 'Fim Programado' : 'Scheduled End'),
      t('pdfStatus')
    ]];
    const keys = options.attrKeys || (options.attrKey ? [options.attrKey] : []);
    summaries.forEach(s => {
      const rows = groupAgentExtraStatuses(s, keys, lang, options.isNextVacations, options);
      tableData.push(...rows);
    });
  } else if (options.isWc) {
    head = [[
      t('pdfAgent'),
      t('pdfDate'),
      lang === 'pt' ? 'Programado' : 'Scheduled',
      lang === 'pt' ? 'Turno' : 'Shift',
      lang === 'pt' ? 'Horário' : 'Time',
      lang === 'pt' ? 'Excedido' : 'Exceeded'
    ]];
    summaries.forEach(s => {
      s.dailyRecords.filter(r => (r.wcOverbreak || 0) > 0).forEach(r => {
        const effectiveShift = getEffectiveShiftValue(r.scheduledShift, r.inferredShift);
        
        let allowedConsumed: Record<string, number> = { 'meal': 0, 'short': 0, 'wellness': 0, 'praying': 0, 'wc': 0, 'idle': 0 };
        let allowedLimits: Record<string, number> = {
            'meal': r.mealDuration - r.mealOverbreak,
            'short': r.shortDuration - r.shortOverbreak,
            'wellness': r.wellnessDuration - r.wellnessOverbreak,
            'praying': r.prayingDuration - r.prayingOverbreak,
            'wc': r.wcDuration - r.wcOverbreak,
            'idle': 0
        };

        const sortedBreaks = [...r.breaks].sort((a,b) => String(a.startTime).localeCompare(String(b.startTime)));

        sortedBreaks.forEach(b => {
           let typeKey = b.type;
           if (typeKey === 'forgot_status') typeKey = 'idle';

           if (typeKey in allowedLimits) {
               const allowedLimit = allowedLimits[typeKey];
               const currentConsumed = allowedConsumed[typeKey];
               const newConsumed = currentConsumed + b.durationMinutes;

               let exceededMinutes = 0;
               if (newConsumed > allowedLimit) {
                   exceededMinutes = Math.min(b.durationMinutes, newConsumed - Math.max(allowedLimit, currentConsumed));
               }
               
               allowedConsumed[typeKey] = newConsumed;

               if (b.type === 'wc') {
                   const timeWindow = `${b.startTime ? format(new Date(b.startTime), 'HH:mm') : '-'}-${b.endTime ? format(new Date(b.endTime), 'HH:mm') : '-'}`;
                   tableData.push([
                     s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
                     r.date,
                     r.scheduledShift || r.inferredShift || t('pdfUnknown'),
                     effectiveShift,
                     timeWindow,
                     exceededMinutes > 0 ? `+${exceededMinutes}m` : '-'
                   ]);
               }
           }
        });
      });
    });
  } else if (options.isIdle) {
    head = [[
      t('pdfAgent'),
      t('pdfDate'),
      lang === 'pt' ? 'Programado' : 'Scheduled',
      lang === 'pt' ? 'Turno' : 'Shift',
      lang === 'pt' ? 'Estado' : 'Status',
      lang === 'pt' ? 'Tempo Total Ocioso' : 'Total Idle Time'
    ]];
    summaries.forEach(s => {
      s.dailyRecords.filter(r => (r.idleDuration || 0) > 0).forEach(r => {
        const effectiveShift = getEffectiveShiftValue(r.scheduledShift, r.inferredShift);
         tableData.push([
           s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
           r.date,
           r.scheduledShift || r.inferredShift || t('pdfUnknown'),
           effectiveShift,
           'IDLE',
           `${r.idleDuration || 0}m`
         ]);
       });
     });
  } else if (options.isOverbreaks) {
    head = [[
      t('pdfAgent'),
      t('pdfDate'),
      lang === 'pt' ? 'Programado' : 'Scheduled',
      lang === 'pt' ? 'Turno' : 'Shift',
      lang === 'pt' ? 'Horário' : 'Time',
      t('pdfStatus'),
      lang === 'pt' ? 'Excedido' : 'Exceeded'
    ]];
    summaries.forEach(s => {
      s.dailyRecords.filter(r => (r.totalOverbreak || 0) > 0).forEach(r => {
        const effectiveShift = getEffectiveShiftValue(r.scheduledShift, r.inferredShift);
        
        let allowedConsumed: Record<string, number> = { 'meal': 0, 'short': 0, 'wellness': 0, 'praying': 0, 'wc': 0, 'idle': 0 };
        let allowedLimits: Record<string, number> = {
            'meal': r.mealDuration - r.mealOverbreak,
            'short': r.shortDuration - r.shortOverbreak,
            'wellness': r.wellnessDuration - r.wellnessOverbreak,
            'praying': r.prayingDuration - r.prayingOverbreak,
            'wc': r.wcDuration - r.wcOverbreak,
            'idle': 0
        };

        const sortedBreaks = [...r.breaks].sort((a,b) => String(a.startTime).localeCompare(String(b.startTime)));

        sortedBreaks.forEach(b => {
           let typeKey = b.type;
           if (typeKey === 'forgot_status') typeKey = 'idle';

           if (typeKey in allowedLimits) {
               const allowedLimit = allowedLimits[typeKey];
               const currentConsumed = allowedConsumed[typeKey];
               const newConsumed = currentConsumed + b.durationMinutes;

               let exceededMinutes = 0;
               if (newConsumed > allowedLimit) {
                   exceededMinutes = Math.min(b.durationMinutes, newConsumed - Math.max(allowedLimit, currentConsumed));
               }
               
               allowedConsumed[typeKey] = newConsumed;

               if (exceededMinutes > 0 && (b.type === 'meal' || b.type === 'short' || b.type === 'wellness' || b.type === 'praying')) {
                   const timeWindow = `${b.startTime ? format(new Date(b.startTime), 'HH:mm') : '-'}-${b.endTime ? format(new Date(b.endTime), 'HH:mm') : '-'}`;
                   tableData.push([
                     s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
                     r.date,
                     r.scheduledShift || r.inferredShift || t('pdfUnknown'),
                     effectiveShift,
                     timeWindow,
                     b.type.toUpperCase(),
                     `+${exceededMinutes}m`
                   ]);
               }
           }
        });
      });
    });
  } else {
    const isNonModOnlyMode = options.isNonMod || options.isRa || options.isAt;

    const headRow = [
      t('pdfAgent'),
      t('pdfDate'),
      t('pdfStatus'),
      t('pdfStartedAt'),
      t('pdfActualEnd'),
      lang === 'pt' ? 'Duração (m)' : 'Duration (m)',
    ];

    if (!isNonModOnlyMode) {
      headRow.push(lang === 'pt' ? 'Excedido' : 'Exceeded');
    }

    head = [headRow];

    summaries.filter(s => options.showRealTime || s.totalOverbreakMinutes > 0 || s.wcAlerts > 0 || s.idleAlerts > 0 || s.totalForgotStatusMinutes > 0 || (options.isShort30Min && (s.totalShort30MinRecords || 0) > 0)).forEach(s => {
      s.dailyRecords.forEach(r => {
        const sortedBreaks = [...r.breaks].sort((a,b) => String(a.startTime).localeCompare(String(b.startTime)));
        
        let allowedConsumed: Record<string, number> = {
            'meal': 0,
            'short': 0,
            'wellness': 0,
            'praying': 0,
            'wc': 0,
            'idle': 0
        };
        let allowedLimits: Record<string, number> = {
            'meal': r.mealDuration - r.mealOverbreak,
            'short': r.shortDuration - r.shortOverbreak,
            'wellness': r.wellnessDuration - r.wellnessOverbreak,
            'praying': r.prayingDuration - r.prayingOverbreak,
            'wc': r.wcDuration - r.wcOverbreak,
            'idle': 0
        };

        sortedBreaks.forEach(b => {
           let typeKey = b.type;
           if (typeKey === 'forgot_status') typeKey = 'idle';

           let isOverbreakInstance = false;
           let dispText = '-';

           if (typeKey in allowedLimits) {
               const allowedLimit = allowedLimits[typeKey];
               const currentConsumed = allowedConsumed[typeKey];
               const newConsumed = currentConsumed + b.durationMinutes;

               if (newConsumed > allowedLimit) {
                   isOverbreakInstance = true;
                   const increment = Math.min(b.durationMinutes, newConsumed - Math.max(allowedLimit, currentConsumed));
                   if (increment > 0) {
                       dispText = `+${increment}m`;
                   }
               }
               
               // Special case when we want to display the break in the Short30Min report even if it wasn't an overbreak
               if (options.isShort30Min && b.type === 'short') {
                   isOverbreakInstance = true;
                   if (dispText === '-') {
                       dispText = `${b.durationMinutes}m`;
                   }
               }
               
               allowedConsumed[typeKey] = newConsumed;
           } else if (b.type === 'non_moderating' && r.nonModDuration > 0) {
               // Non-moderating should just show its total duration, not as an overbreak
               // and we don't put anything in dispText (exceeded) since it's not an overbreak
           }

           let matchesFilter = false;

           const typeHasOverbreak = 
              (b.type === 'meal' && r.mealOverbreak > 0) ||
              (b.type === 'short' && r.shortOverbreak > 0) ||
              (b.type === 'wellness' && r.wellnessOverbreak > 0) ||
              (b.type === 'praying' && r.prayingOverbreak > 0) ||
              (b.type === 'wc' && r.wcOverbreak > 0) ||
              ((b.type === 'idle' || b.type === 'forgot_status') && r.idleOverbreak > 0);

          if (options.isOverbreaks && (b.type === 'meal' || b.type === 'wellness' || b.type === 'praying' || b.type === 'short') && (isOverbreakInstance || typeHasOverbreak)) {
               matchesFilter = true;
           }
           if (options.isShort30Min && b.type === 'short' && (isOverbreakInstance || typeHasOverbreak)) {
               matchesFilter = true;
           }
          if (options.isWc && b.type === 'wc' && (isOverbreakInstance || typeHasOverbreak)) {
               matchesFilter = true;
           }
          if (options.isIdle && typeKey === 'idle' && (isOverbreakInstance || typeHasOverbreak)) {
               matchesFilter = true;
           }
           if (options.isNonMod && b.type === 'non_moderating') {
               matchesFilter = true;
           }
           
           let noSpecificFilter = !options.isOverbreaks && !options.isWc && !options.isIdle && !options.isNonMod && !options.isShort30Min;
           
           if (noSpecificFilter) {
               if (b.type !== 'wc') {
                   matchesFilter = true;
               }
           }

           if (!matchesFilter) {
               isOverbreakInstance = false;
           }

          if (matchesFilter && (options.showRealTime || isOverbreakInstance || typeHasOverbreak || (b.type === 'non_moderating' && options.isNonMod))) {
               let label: string = b.type;
               if (b.type === 'other') label = b.rawStatus || b.type;
               else if (b.type === 'forgot_status') label = 'IDLE';
               else if (b.type === 'non_moderating' && b.subType) label = b.subType;
               else if (b.type === 'wc') label = 'ORGANIC';

               const rowData = [
                   s.email ? `${s.employeeName} (${s.email})` : s.employeeName,
                   r.date,
                   label.toUpperCase(),
                   b.startTime ? format(new Date(b.startTime), 'HH:mm') : '-',
                   b.endTime ? format(new Date(b.endTime), 'HH:mm') : '-',
                   `${b.durationMinutes}m`
               ];
               
               if (!(options.isNonMod || options.isRa || options.isAt)) {
                   rowData.push(dispText);
               }

               tableData.push(rowData);
           }
        });
      });
    });
  }

  if (options.isGroupedByTL) {
    // 1. Group summaries by TL and then LOB
    const grouped: Record<string, Record<string, EmployeeSummary[]>> = {};
    summaries.forEach(s => {
      const tl = (s.supervisor && s.supervisor.trim() !== '') ? s.supervisor.trim() : 'No Team Leader';
      const langSuffix = s.language ? ' ' + s.language.trim() : '';
      const lob = (s.lob && s.lob.trim() !== '') ? s.lob.trim() + langSuffix : 'No LOB';
      if (!grouped[tl]) grouped[tl] = {};
      if (!grouped[tl][lob]) grouped[tl][lob] = [];
      grouped[tl][lob].push(s);
    });

    const sortedTLs = Object.keys(grouped).sort();

    let currentY = startYPos;
    let lastTL = '';

    sortedTLs.forEach((tlName, tlIndex) => {
      const lobs = grouped[tlName];
      const sortedLOBs = Object.keys(lobs).sort();

      // Force a page break if page is almost full, otherwise draw a dividing line when changing TL
      if (tlIndex > 0) {
        if (currentY > 190) {
          doc.addPage();
          currentY = 20;
          lastTL = ''; // Reset to force drawing TL header on the new page
        } else {
          currentY += 4;
          // Draw a dividing line to separate TL sections on the same page
          doc.setDrawColor(79, 70, 229); // Royal indigo
          doc.setLineWidth(1.5); // Thicker line for explicit TL transition
          doc.line(14, currentY, doc.internal.pageSize.getWidth() - 14, currentY);
          currentY += 8;
        }
      }

      sortedLOBs.forEach(lobName => {
        const lobSummaries = lobs[lobName];

        // Sort summaries in descending order of active metric!
        lobSummaries.sort((a, b) => {
          const valA = getAgentMetricValue(a, options);
          const valB = getAgentMetricValue(b, options);
          if (valA !== valB) return valB - valA; // Descending
          return a.employeeName.localeCompare(b.employeeName);
        });

        const childTableData = buildSingleTableData(lobSummaries, options, t, lang);
        if (childTableData.length === 0) return; // Skip empty tables under this filter/LOB

        // Check if we need to add a page (only on vertical space overflow)
        if (currentY > 235) {
          doc.addPage();
          currentY = 20;
          lastTL = ''; // Reset to force drawing TL header on the new page
        } else {
          currentY += 8;
        }

        // Print TL header only if changed or at top of a new/auto page
        if (tlName !== lastTL) {
          doc.setFontSize(13);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(79, 70, 229); // indigo
          doc.text(`Team Leader: ${tlName.toUpperCase()}`, 14, currentY);
          currentY += 5;
          lastTL = tlName;
        }

        // Print LOB header/subtitle (centered with a background banner)
        const pageWidth = doc.internal.pageSize.getWidth();
        const marginX = 14;
        const bannerHeight = 8;
        
        doc.setFillColor(235, 241, 254); // pleasant, clean, modern soft corporate blue-indigo tone
        doc.rect(marginX, currentY - 1, pageWidth - 2 * marginX, bannerHeight, 'F');
        
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59); // deep slate / charcoal
        doc.setFont('helvetica', 'bold');
        
        const labelText = `LOB: ${lobName.toUpperCase()}`;
        const textWidth = doc.getTextWidth(labelText);
        const textX = (pageWidth - textWidth) / 2;
        
        doc.text(labelText, textX, currentY + 5);
        currentY += bannerHeight + 5;

        autoTable(doc, {
          startY: currentY,
          head: head,
          body: childTableData,
          styles: { 
            fontSize: (options.isOverbreaks || options.isWc) ? 8.2 : 9.5, 
            cellPadding: (options.isOverbreaks || options.isWc) 
              ? { top: 3.5, right: 1.5, bottom: 3.5, left: 1.5 } 
              : 3.5 
          },
          headStyles: { fillColor: [41, 128, 185], textColor: 255 },
          columnStyles: {
            1: { minCellWidth: 28 }, // Date
            ...((options.isOverbreaks || options.isWc || options.isIdle || options.isTardiness || options.isMinorTardiness || options.isCheck) ? {
              2: { halign: 'center' as any },
              3: { halign: 'center' as any },
              4: { halign: 'center' as any },
              5: { halign: 'center' as any },
              6: { halign: 'center' as any }
            } : {})
          },
          didDrawCell: function (data) {
            if (data.section === 'body' && data.row.index > 0) {
              if (data.row.raw[0] !== '') {
                doc.setDrawColor(200, 200, 200);
                doc.setLineWidth(0.5);
                doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
              }
            }
          },
          didParseCell: function (data) {
            if ((options.isOverbreaks || options.isWc || options.isIdle || options.isTardiness || options.isMinorTardiness || options.isCheck) && 
                (data.column.index === 2 || data.column.index === 3 || data.column.index === 4 || data.column.index === 5 || data.column.index === 6)) {
              if (data.cell && data.cell.styles) {
                data.cell.styles.halign = 'center';
              }
            }

            if (data.section === 'body') {
              const rowRaw = data.row.raw as any;
              if (rowRaw._bg) {
                  data.cell.styles.fillColor = [250, 250, 250];
              } else {
                  data.cell.styles.fillColor = [255, 255, 255];
              }

              if (data.column.index === 1) {
                  data.cell.styles.minCellWidth = 24;
              }
              if ((options.isTardiness || options.isMinorTardiness || options.isEarlyLeave || options.isCheck || options.isWc || options.isIdle || options.isOverbreaks) && (data.column.index === 2 || data.column.index === 3)) {
                  data.cell.styles.minCellWidth = (options.isOverbreaks || options.isWc) ? 14 : 24;
              }
              if (data.column.index === 3) {
                  data.cell.styles.halign = 'center';
              }

              if (options.isWc && data.column.index === 5) {
                data.cell.styles.fillColor = [217, 119, 6];
                data.cell.styles.textColor = [255, 255, 255];
                data.cell.styles.fontStyle = 'bold';
              }
              if (options.isIdle && data.column.index === 5) {
                data.cell.styles.fillColor = [220, 38, 38];
                data.cell.styles.textColor = [255, 255, 255];
                data.cell.styles.fontStyle = 'bold';
              }
              if (options.isOverbreaks && data.column.index === 6) {
                data.cell.styles.fillColor = [220, 38, 38];
                data.cell.styles.textColor = [255, 255, 255];
                data.cell.styles.fontStyle = 'bold';
              }
              if (options.isOverbreaks && data.column.index === 5) {
                const textStr = Array.isArray(data.cell.text) ? data.cell.text[0] : data.cell.text;
                if (textStr === 'MEAL' || textStr === 'SHORT' || textStr === 'WELLNESS' || textStr === 'PRAYING') {
                  data.cell.styles.textColor = [41, 128, 185];
                  data.cell.styles.fontStyle = 'bold';
                }
              }

              if (!options.isTardiness && !options.isMinorTardiness && !options.isEarlyLeave && !options.isAbsences && !options.isCheck && !options.isWc && !options.isIdle && !options.isOverbreaks && !options.activeExtraStatus && !(options.activeExtraStatuses && options.activeExtraStatuses.length > 0)) {
                const textStr = Array.isArray(data.cell.text) ? data.cell.text[0] : data.cell.text;
                
                if (!options.isNonMod && !options.isRa && !options.isAt && data.column.index === 6 && textStr && textStr !== '-') {
                  const statusCellStr = Array.isArray(data.row.cells[2].text) ? data.row.cells[2].text[0] : data.row.cells[2].text;
                  if (statusCellStr === 'ORGANIC') {
                    data.cell.styles.fillColor = [217, 119, 6];
                    data.cell.styles.textColor = [255, 255, 255];
                    data.cell.styles.fontStyle = 'bold';
                  } else if (statusCellStr === 'NON-MOD' || statusCellStr === 'NON_MODERATING' || statusCellStr.includes('REVIEW') || statusCellStr.includes('APPEAL')) {
                    // Do not apply red highlighting for non-moderating items
                  } else {
                    data.cell.styles.fillColor = [220, 38, 38];
                    data.cell.styles.textColor = [255, 255, 255];
                    data.cell.styles.fontStyle = 'bold';
                  }
                }
                
                if (data.column.index === 2) {
                   if (textStr === 'ORGANIC') {
                      data.cell.styles.textColor = [217, 119, 6];
                      data.cell.styles.fontStyle = 'bold';
                   } else if (textStr === 'IDLE' || textStr === 'FORGOT_STATUS') {
                      data.cell.styles.textColor = [220, 38, 38];
                      data.cell.styles.fontStyle = 'bold';
                   }
                }
              }
            }
          }
        });

        currentY = (doc as any).lastAutoTable.finalY;
      });
    });

    doc.save(`${finalFilename}.pdf`);
    return;
  }

  let lastAgentName = '';
  let agentBgColor = false;
  tableData.forEach((row: any) => {
    if (row[0] === lastAgentName) {
      row[0] = '';
    } else {
      lastAgentName = String(row[0]);
      agentBgColor = !agentBgColor;
    }
    row._bg = agentBgColor;
  });

  autoTable(doc, {
    startY: startYPos,
    head: head,
    body: tableData,
    styles: { 
      fontSize: (options.isOverbreaks || options.isWc) ? 8.2 : 9.5, 
      cellPadding: (options.isOverbreaks || options.isWc) 
        ? { top: 3.5, right: 1.5, bottom: 3.5, left: 1.5 } 
        : 3.5 
    },
    headStyles: { fillColor: [41, 128, 185], textColor: 255 },
    columnStyles: {
      1: { minCellWidth: 28 }, // Date
      ...((options.isOverbreaks || options.isWc || options.isIdle || options.isTardiness || options.isMinorTardiness || options.isCheck) ? {
        2: { halign: 'center' as any },
        3: { halign: 'center' as any },
        4: { halign: 'center' as any },
        5: { halign: 'center' as any },
        6: { halign: 'center' as any }
      } : {})
    },
    didDrawCell: function (data) {
      if (data.section === 'body' && data.row.index > 0) {
        if (data.row.raw[0] !== '') {
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.5);
          doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
        }
      }
    },
    didParseCell: function (data) {
      if ((options.isOverbreaks || options.isWc || options.isIdle || options.isTardiness || options.isMinorTardiness || options.isCheck) && 
          (data.column.index === 2 || data.column.index === 3 || data.column.index === 4 || data.column.index === 5 || data.column.index === 6)) {
        if (data.cell && data.cell.styles) {
          data.cell.styles.halign = 'center';
        }
      }

      if (data.section === 'body') {
        const rowRaw = data.row.raw as any;
        if (rowRaw._bg) {
            data.cell.styles.fillColor = [250, 250, 250];
        } else {
            data.cell.styles.fillColor = [255, 255, 255];
        }

        if (data.column.index === 1) {
            data.cell.styles.minCellWidth = 24;
        }
        if ((options.isTardiness || options.isMinorTardiness || options.isEarlyLeave || options.isCheck || options.isWc || options.isIdle || options.isOverbreaks) && (data.column.index === 2 || data.column.index === 3)) {
            data.cell.styles.minCellWidth = (options.isOverbreaks || options.isWc) ? 14 : 24;
        }
        if (data.column.index === 3) {
            data.cell.styles.halign = 'center';
        }

        if (options.isWc && data.column.index === 5) {
          data.cell.styles.fillColor = [217, 119, 6];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = 'bold';
        }
        if (options.isIdle && data.column.index === 5) {
          data.cell.styles.fillColor = [220, 38, 38];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = 'bold';
        }
        if (options.isOverbreaks && data.column.index === 6) {
          data.cell.styles.fillColor = [220, 38, 38];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = 'bold';
        }
        if (options.isOverbreaks && data.column.index === 5) {
          const textStr = Array.isArray(data.cell.text) ? data.cell.text[0] : data.cell.text;
          if (textStr === 'MEAL' || textStr === 'SHORT' || textStr === 'WELLNESS' || textStr === 'PRAYING') {
            data.cell.styles.textColor = [41, 128, 185];
            data.cell.styles.fontStyle = 'bold';
          }
        }

        if (!options.isTardiness && !options.isMinorTardiness && !options.isEarlyLeave && !options.isAbsences && !options.isCheck && !options.isWc && !options.isIdle && !options.isOverbreaks && !options.activeExtraStatus && !(options.activeExtraStatuses && options.activeExtraStatuses.length > 0)) {
          const textStr = Array.isArray(data.cell.text) ? data.cell.text[0] : data.cell.text;
          
          if (!options.isNonMod && !options.isRa && !options.isAt && data.column.index === 6 && textStr && textStr !== '-') {
            const statusCellStr = Array.isArray(data.row.cells[2].text) ? data.row.cells[2].text[0] : data.row.cells[2].text;
            if (statusCellStr === 'ORGANIC') {
              data.cell.styles.fillColor = [217, 119, 6];
              data.cell.styles.textColor = [255, 255, 255];
              data.cell.styles.fontStyle = 'bold';
            } else if (statusCellStr === 'NON-MOD' || statusCellStr === 'NON_MODERATING' || statusCellStr.includes('REVIEW') || statusCellStr.includes('APPEAL')) {
              // Do not apply red highlighting for non-moderating items
            } else {
              data.cell.styles.fillColor = [220, 38, 38];
              data.cell.styles.textColor = [255, 255, 255];
              data.cell.styles.fontStyle = 'bold';
            }
          }
          
          if (data.column.index === 2) {
             if (textStr === 'ORGANIC') {
                data.cell.styles.textColor = [217, 119, 6];
                data.cell.styles.fontStyle = 'bold';
             } else if (textStr === 'IDLE' || textStr === 'FORGOT_STATUS') {
                data.cell.styles.textColor = [220, 38, 38];
                data.cell.styles.fontStyle = 'bold';
             }
          }
        }
      }
    }
  });

  doc.save(`${finalFilename}.pdf`);
}
