import * as XLSX from 'xlsx';

export interface StaffInfoEntry {
    email: string;
    fullName: string;
    role: string;
    lob: string;
    language: string;
    tl?: string;
    status: string;
    workdayId?: string;
}

export async function parseStaffInfoFile(file: File): Promise<{ data: StaffInfoEntry[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        let sheetName = workbook.SheetNames.find(sn => sn.toLowerCase().includes('staff info'));
        
        if (!sheetName) {
            // Find the sheet that has Staff Info data
            for (const name of workbook.SheetNames) {
                const tempWorksheet = workbook.Sheets[name];
                const tempRows = XLSX.utils.sheet_to_json(tempWorksheet, { header: 1, range: 0, defval: '' }) as any[][];
                
                const isStaffInfo = tempRows.slice(0, Math.min(50, tempRows.length)).some(row => {
                    if (!row || row.length < 2) return false;
                    const rowStr = row.map(v => String(v).trim().toUpperCase());
                    const joined = rowStr.join('|');
                    
                    if (joined.includes('LOB|') || joined.includes('|LOB') || joined.includes('LANGUAGE') || joined.includes('TEAM LEADER') || joined.includes('SUPERVISOR') || joined.includes('ROLE')) {
                        if (joined.includes('ACTIVE') || joined.includes('STATUS') || joined.includes('NAME') || joined.includes('EMAIL') || joined.includes('UID') || joined.includes('EMPLID')) {
                            return true;
                        }
                    }
                    
                    let hasActive = false;
                    let hasLob = false;
                    let hasLanguage = false;
                    for (let c = 0; c < Math.min(50, row.length); c++) {
                        const val = rowStr[c];
                        if (val === 'ACTIVE') hasActive = true;
                        if (val === 'LOB') hasLob = true;
                        if (val === 'LANGUAGE' || val === 'IDIOMA') hasLanguage = true;
                    }
                    
                    if (hasActive && (hasLob || hasLanguage)) return true;
                    if (hasLob && hasLanguage) return true;
                    
                    return false;
                });
                
                if (isStaffInfo) {
                    sheetName = name;
                    break;
                }
            }
        }
        
        if (!sheetName) sheetName = workbook.SheetNames[0]; // fallback
        
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to array of arrays
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as string[][];
        if (rows.length < 2) {
             throw new Error('Staff Info format not recognized');
        }

        const entries: StaffInfoEntry[] = [];

        let headerRowIndex = 0;
        let maxPopulated = 0;
        
        // Find the most populated row in the first 20 rows, usually that's the header
        for (let r = 0; r < Math.min(20, rows.length); r++) {
            const populated = rows[r].filter(c => String(c).trim() !== '').length;
            if (populated > maxPopulated) {
                maxPopulated = populated;
                headerRowIndex = r;
            }
        }

        let langIndex = 30; // Default AE
        const headers = rows[headerRowIndex] || [];
        for (let j = 0; j < headers.length; j++) {
            const h = String(headers[j] || '').trim().toLowerCase();
            if (h === 'language' || h === 'idioma' || h === 'língua' || h === 'lingua' || h === 'language / skill') {
                langIndex = j;
                break;
            }
        }

        let statusIndex = 0;
        for (let j = 0; j < Math.min(50, headers.length); j++) {
            const h = String(headers[j] || '').trim().toLowerCase();
            if (h === 'status' || h === 'estado') {
                statusIndex = j;
                break;
            }
        }
        
        // If not found by header, guess by first occurrence of ACTIVE
        if (statusIndex === 0) {
           for (let r = 0; r < Math.min(30, rows.length); r++) {
               for (let c = 0; c < Math.min(50, (rows[r]||[]).length); c++) {
                   if (String(rows[r][c] || '').trim().toUpperCase() === 'ACTIVE') {
                       statusIndex = c;
                       break;
                   }
               }
           }
        }

        let nameIndex = 4;
        let roleIndex = 5;
        let lobIndex = 17;
        let tlIndex = 9;
        let workdayIdIndex = -1;
        
        for (let j = 0; j < Math.min(100, headers.length); j++) {
            const h = String(headers[j] || '').trim().toLowerCase();
            if (h === 'name' || h === 'nome' || h === 'employee name' || h.includes('full name')) nameIndex = j;
            if (h === 'role' || h === 'cargo' || h.includes('job title')) roleIndex = j;
            if (h === 'lob' || h.includes('line of business') || h === 'campaign') lobIndex = j;
            if (h === 'tl' || h === 'team leader' || h === 'supervisor' || h.includes('manager')) tlIndex = j;
            if (h === 'workday' || h === 'workday id' || h === 'workday_id' || h === 'id workday' || h === 'id_workday' || h === 'emplid' || h === 'employee id' || h === 'id' || h === 'uid' || h === 'worker id' || h.includes('id workday') || h.includes('workday id')) {
                workdayIdIndex = j;
            }
        }

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
           const row = rows[i];
           if (!row || row.length < 2) continue; // some rows might be shorter
           
           const statusStr = String(row[statusIndex] || '').trim().toUpperCase();
           if (statusStr !== 'ACTIVE') continue;

           const name = String(row[nameIndex] || '').trim();
           // if name is empty try looking at nearby columns
           if (!name) continue;

           const roleStr = String(row[roleIndex] || '').trim();
           const lobStr = String(row[lobIndex] || '').trim();
           const langStr = String(row[langIndex] || '').trim(); 
           const workdayIdStr = workdayIdIndex !== -1 ? String(row[workdayIdIndex] || '').trim() : '';
           let emailStr = String(row[65] || '').trim().toLowerCase();
           if (!emailStr.includes('@')) {
               for (let c = row.length - 1; c >= 0; c--) {
                   const cellValue = String(row[c] || '').trim().toLowerCase();
                   if (cellValue.includes('@')) {
                       emailStr = cellValue;
                       break;
                   }
               }
           }
           const tlStr = String(row[9] || '').trim(); // J is index 9

           entries.push({
               email: emailStr,
               fullName: name,
               role: roleStr,
               lob: lobStr,
               language: langStr,
               tl: tlStr,
               status: statusStr,
               workdayId: workdayIdStr
           });
        }

        resolve({ data: entries });
      } catch (error) {
        console.error("Error parsing staff info file:", error);
        reject(error);
      }
    };

    reader.onerror = (error) => {
      reject(error);
    };

    reader.readAsArrayBuffer(file);
  });
}
