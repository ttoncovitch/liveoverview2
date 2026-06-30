const fs = require('fs');
let c = fs.readFileSync('src/components/EmployeeList.tsx', 'utf-8').split('\n');

const replacement = `                    <div className="flex items-center gap-2">
${c[731]}
                       <button
                           onClick={() => {
                               const totalIdle = records.reduce((acc, r) => acc + r.idleDuration, 0);
                               const tlEmail = s.tl ? \`\${s.tl.trim().normalize('NFD').replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/\\s+/g, '.')}@concentrix.com\` : '';
                               const ccList = ["sofia.fernandes@concentrix.com", tlEmail].filter(e => e).join(',');
                               const subj = \`IDLE Time Report - \${s.employeeName}\`;
                               const body = \`Hello \${s.employeeName},\\n\\nThis is an automated notification regarding your IDLE time.\\nDuring the selected period, you have accumulated a total of \${Math.floor(totalIdle / 60)}h \${totalIdle % 60}m of IDLE time.\\n\\nPlease review your timeline to ensure all activities are correctly logged.\\n\\nBest regards,\\nManagement\`;
                               const mailto = \`mailto:\${s.email || ''}?cc=\${encodeURIComponent(ccList)}&subject=\${encodeURIComponent(subj)}&body=\${encodeURIComponent(body)}\`;
                               window.location.href = mailto;
                           }}
                           className="p-1.5 rounded-full bg-slate-800 text-slate-300 hover:bg-indigo-500 hover:text-white transition-colors border border-slate-700"
                           title="Send IDLE Time Report via Email"
                       >
                           <Mail size={14} />
                       </button>
                    </div>`;

c[731] = replacement;
fs.writeFileSync('src/components/EmployeeList.tsx', c.join('\n'));
