import React, { useState } from 'react';
import { EmployeeSummary } from '../types';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface PaginatedAgentListProps {
  items: any[];
  renderItem: (item: any, globalIndex: number) => React.ReactNode;
  pageSize?: number;
}

export function PaginatedAgentList({ items, renderItem, pageSize = 10 }: PaginatedAgentListProps) {
  const { t, lang } = useLanguage();
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(items.length / pageSize);

  if (items.length === 0) {
    return <div className="p-4 text-center text-slate-400 text-xs">{t('noMatchAgent')}</div>;
  }

  const currentItems = items.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="flex flex-col h-full relative">
      <div className="divide-y divide-slate-50 flex-1">
        {currentItems.map((item, index) => renderItem(item, page * pageSize + index))}
      </div>
      {totalPages > 1 && (
        <div className="flex justify-between items-center px-4 py-2 bg-slate-50/80 border-t border-slate-100 mt-auto sticky bottom-0">
          <button 
            disabled={page === 0} 
            onClick={() => setPage(p => p - 1)}
            className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent text-slate-500 transition-colors"
          >
            <ChevronUp size={16} />
          </button>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{page + 1} {lang === 'pt' ? 'de' : 'of'} {totalPages}</span>
          <button 
            disabled={page === totalPages - 1} 
            onClick={() => setPage(p => p + 1)}
            className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent text-slate-500 transition-colors"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
