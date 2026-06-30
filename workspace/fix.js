const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');
content = content.replace(
  "         } else if (typeFilter === 'idle_overbreak_wc' && !includeOffboardedGlobal && !includeAbsencesGlobal && !includeShort30MinGlobal && !includeWcGlobal && !includeIdleGlobal && !includeNonModGlobal && !includeTardinessGlobal && !includeEarlyLeaveGlobal) {",
  "         } else if (typeFilter === 'idle_overbreak_wc' && !includeOffboardedGlobal && !includeAbsencesGlobal && !includeShort30MinGlobal && !includeWcGlobal && !includeIdleGlobal && !includeNonModGlobal && !includeRaGlobal && !includeAtGlobal && !includeTardinessGlobal && !includeEarlyLeaveGlobal) {"
);
content = content.replace(
  "         } else if (includeWcGlobal || includeIdleGlobal || includeNonModGlobal || includeTardinessGlobal || includeEarlyLeaveGlobal || includeShort30MinGlobal || includeAbsencesGlobal || includeOffboardedGlobal || typeFilter === 'idle_overbreak_wc') {",
  "         } else if (includeWcGlobal || includeIdleGlobal || includeNonModGlobal || includeRaGlobal || includeAtGlobal || includeTardinessGlobal || includeEarlyLeaveGlobal || includeShort30MinGlobal || includeAbsencesGlobal || includeOffboardedGlobal || typeFilter === 'idle_overbreak_wc') {"
);
fs.writeFileSync('src/App.tsx', content);
