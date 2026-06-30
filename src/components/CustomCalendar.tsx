import React, { useState, useMemo } from 'react';
import { EmployeeSummary } from '../types';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLanguage } from '../contexts/LanguageContext';

interface CustomCalendarProps {
  summaries: EmployeeSummary[];
  selectedDates: Date[] | undefined;
  onSelectDates: (dates: Date[] | undefined) => void;
}

export function CustomCalendar({ summaries, selectedDates, onSelectDates }: CustomCalendarProps) {
  const { t, lang } = useLanguage();
  const [view, setView] = useState<'year' | 'month' | 'day'>('year');
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    summaries.forEach(s => {
      s.dailyRecords.forEach(r => dates.add(r.date));
    });
    return Array.from(dates).sort();
  }, [summaries]);

  const structure = useMemo(() => {
    const struct: Record<string, Record<string, string[]>> = {};
    availableDates.forEach(dateStr => {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return;
      const year = parts[0];
      const month = `${parts[0]}-${parts[1]}`;
      const day = dateStr;
      
      if (!struct[year]) struct[year] = {};
      if (!struct[year][month]) struct[year][month] = [];
      struct[year][month].push(day);
    });
    return struct;
  }, [availableDates]);

  const years = Object.keys(structure).sort();

  if (view === 'year') {
    return (
      <div className="p-4 w-64">
        <h4 className="text-sm font-bold text-slate-700 mb-3 text-center uppercase tracking-wider">{lang === 'pt' ? 'Selecione o Ano' : 'Select Year'}</h4>
        <div className="grid grid-cols-2 gap-2">
          {years.map(year => (
            <Button
              key={year}
              variant="outline"
              onClick={() => {
                setSelectedYear(year);
                setView('month');
              }}
              className="w-full font-black text-slate-700"
            >
              {year}
            </Button>
          ))}
          {years.length === 0 && <p className="text-xs text-slate-500 col-span-2 text-center">{lang === 'pt' ? 'Nenhum dado disponível.' : 'No data available.'}</p>}
        </div>
      </div>
    );
  }

  if (view === 'month' && selectedYear) {
    const months = Object.keys(structure[selectedYear]).sort();
    return (
      <div className="p-4 w-64">
        <div className="flex items-center mb-3">
          <button onClick={() => setView('year')} className="p-1 hover:bg-slate-100 rounded text-slate-500">
            <ChevronLeft size={16} />
          </button>
          <h4 className="text-sm font-bold text-slate-700 flex-1 text-center uppercase tracking-wider">{selectedYear}</h4>
          <div className="w-6" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {months.map(monthStr => {
            const date = parseISO(`${monthStr}-01`);
            const monthName = format(date, 'MMM', { locale: lang === 'pt' ? ptBR : undefined });
            return (
              <Button
                key={monthStr}
                variant="outline"
                className="w-full font-bold uppercase text-xs"
                onClick={() => {
                  setSelectedMonth(monthStr);
                  setView('day');
                }}
              >
                {monthName}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  if (view === 'day' && selectedYear && selectedMonth) {
    const days = structure[selectedYear]?.[selectedMonth] || [];
    
    // To draw a proper calendar, find the first and last day of the month
    const yearNum = parseInt(selectedYear, 10);
    const monthNum = parseInt(selectedMonth.split('-')[1], 10) - 1; // 0-based
    
    const firstDayOfMonth = new Date(yearNum, monthNum, 1);
    const lastDayOfMonth = new Date(yearNum, monthNum + 1, 0);
    
    const startOffset = firstDayOfMonth.getDay(); // 0 (Sun) to 6 (Sat)
    const totalDaysInMonth = lastDayOfMonth.getDate();
    
    const handleSelectAll = () => {
      const newDates = days.map(d => new Date(d + 'T12:00:00'));
      onSelectDates(newDates);
    };

    const isSelected = (dayStr: string) => {
      if (!selectedDates) return false;
      return selectedDates.some(d => format(d, 'yyyy-MM-dd') === dayStr);
    };

    const handleSelectDay = (dayStr: string) => {
      const current = selectedDates ? [...selectedDates] : [];
      const matchIdx = current.findIndex(d => format(d, 'yyyy-MM-dd') === dayStr);
      
      if (current.length === 1 && matchIdx < 0) {
          // Range selection
          const prevDateStr = format(current[0], 'yyyy-MM-dd');
          const [prevYear, prevMonth, prevDay] = prevDateStr.split('-').map(Number);
          const [currYear, currMonth, currDay] = dayStr.split('-').map(Number);
          
          const start = new Date(prevYear, prevMonth - 1, prevDay);
          const end = new Date(currYear, currMonth - 1, currDay);
          
          const minDate = start < end ? start : end;
          const maxDate = start > end ? start : end;
          
          const newSelection: Date[] = [];
          for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
              // Only add if it's in `availableDates` or we just blindly select?
              // The user just said "selecione a semana toda", let's select the days within the range.
              const dStr = format(d, 'yyyy-MM-dd');
              newSelection.push(new Date(dStr + 'T12:00:00'));
          }
          // Merge avoiding duplicates
          const merged = [...current];
          newSelection.forEach(nd => {
              if (!merged.some(md => format(md, 'yyyy-MM-dd') === format(nd, 'yyyy-MM-dd'))) {
                  merged.push(nd);
              }
          });
          onSelectDates(merged);
      } else {
          // Regular toggle
          if (matchIdx >= 0) {
            current.splice(matchIdx, 1);
          } else {
            current.push(new Date(dayStr + 'T12:00:00'));
          }
          onSelectDates(current.length > 0 ? current : undefined);
      }
    };

    const weekDays = lang === 'pt' ? ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    return (
      <div className="p-4 w-[320px]">
        <div className="flex items-center mb-3">
          <button onClick={() => setView('month')} className="p-1 hover:bg-slate-100 rounded text-slate-500">
            <ChevronLeft size={16} />
          </button>
          <h4 className="text-sm font-bold text-slate-700 flex-1 text-center uppercase tracking-wider">
            {format(parseISO(`${selectedMonth}-01`), 'MMM yyyy', { locale: lang === 'pt' ? ptBR : undefined })}
          </h4>
          <div className="w-6" />
        </div>
        
        <Button 
          variant="secondary" 
          size="sm" 
          className="w-full mb-4 text-xs font-bold bg-slate-100/50 hover:bg-slate-200/50"
          onClick={handleSelectAll}
        >
          {lang === 'pt' ? 'SELECIONAR MÊS TODO' : 'SELECT ENTIRE MONTH'}
        </Button>

        <div className="grid grid-cols-7 gap-1 mb-2">
           {weekDays.map((wd, i) => (
               <div key={`wd-${i}`} className="text-[10px] font-black text-center text-slate-400">
                   {wd}
               </div>
           ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startOffset }).map((_, i) => (
             <div key={`empty-${i}`} className="h-8" />
          ))}
          {Array.from({ length: totalDaysInMonth }).map((_, i) => {
             const dayNum = i + 1;
             const dayStr = `${selectedMonth}-${String(dayNum).padStart(2, '0')}`;
             const isAvailable = days.includes(dayStr);
             const selected = isSelected(dayStr);
             
             return (
               <Button
                 key={dayStr}
                 variant={selected ? "default" : "outline"}
                 size="sm"
                 className={`h-8 font-black p-0 ${selected ? 'bg-blue-600 text-white border-blue-600' : isAvailable ? 'text-slate-700 hover:border-slate-300' : 'text-slate-300 border-slate-100 opacity-50'}`}
                 disabled={!isAvailable}
                 onClick={() => handleSelectDay(dayStr)}
               >
                 {dayNum}
               </Button>
             );
          })}
        </div>
      </div>
    );
  }

  return null;
}
