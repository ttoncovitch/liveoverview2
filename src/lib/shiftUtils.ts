export const formatLOB = (lob: string): string => {
  if (!lob) return lob;
  const name = lob.trim();
  const lower = name.toLowerCase();
  
  if (lower === 'high reported queue') return 'HRQ';
  if (lower === 'live joint labeling') return 'LJL';
  if (lower === 'ms taxonomy') return 'MS TAX';
  if (lower === 'multi-guest live labeling') return 'MGLL';
  
  return name;
};

export const isShiftMismatch = (scheduledShift?: string | null, inferredShift?: string | null): boolean => {
  if (!scheduledShift || !inferredShift) return false;
  
  const sStr = String(scheduledShift || '');
  const iStr = String(inferredShift || '');
  
  const schedNorm = sStr.toUpperCase().replace(/\s+/g, '');
  const inferNorm = iStr.toUpperCase().replace(/\s+/g, '');

  if (schedNorm === inferNorm) return false;

  const extractTime = (str: string) => {
    const match = str.match(/(?:^|\b|[^0-9])(\d{1,2}:\d{2})\s*(?:-|to|–|—|−)\s*(\d{1,2}:\d{2})(?:\b|[^0-9]|$)/i);
    if (match) {
        const start = match[1].padStart(5, '0');
        const end = match[2].padStart(5, '0');
        return `${start}-${end}`;
    }
    return null;
  };

  const cleanSched = extractTime(sStr);
  const cleanInfer = extractTime(iStr);
  
  if (cleanSched && cleanInfer) {
      if (cleanSched === cleanInfer) return false;
      return true;
  }

  const isLeave = (str: string) => {
      const leaves = ['OFF', 'VAC', 'PTO', 'SL', 'SICK', 'MEDICO', 'ATESTADO', 'LOA', 'LICENÇA', 'SUSP', 'ATT', 'RESIGN', 'SAÍDA', 'FOLGA'];
      return leaves.some(l => str.includes(l));
  };

  const schedIsLeave = isLeave(schedNorm);
  const inferIsLeave = isLeave(inferNorm);

  if (cleanInfer && schedIsLeave) return true;
  if (cleanSched && inferIsLeave) return true;

  return false;
};
