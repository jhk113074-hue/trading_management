const fs = require('fs');
const file = 'app/src/pages/ProformaInvoices.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/padding: '12px'/g, "padding: '6px 8px'");
fs.writeFileSync(file, content);
