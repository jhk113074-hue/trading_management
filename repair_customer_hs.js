const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'app', 'src', 'pages', 'OrderDetail.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

content = content.replace(/\r\n/g, '\n');

const oldCodeBlock = `        const itemsWithHs = (data.items || []).map((it) => {
          const codeMatch = (it.name || '').match(/^\\[(.*?)\\]\\s*(.*)$/);
          const code = codeMatch ? codeMatch[1] : (it.itemId || '');
          const matchedProd = products.find(p => p.productCode === code || p.id === code);
          return {
            ...it,
            hsCode: it.hsCode || matchedProd?.hsCode || ''
          };
        });`;

const newCodeBlock = `        const itemsWithHs = (data.items || []).map((it) => {
          const codeMatch = (it.name || '').match(/^\\[(.*?)\\]\\s*(.*)$/);
          const code = codeMatch ? codeMatch[1] : (it.itemId || '');
          const matchedProd = products.find(p => p.productCode === code || p.id === code);
          const custSpecificHs = matchedProd?.customerHsCodes?.[data.customer || ''] || '';
          return {
            ...it,
            hsCode: it.hsCode || custSpecificHs || matchedProd?.hsCode || ''
          };
        });`;

const oldClean = oldCodeBlock.replace(/\r\n/g, '\n').trim();
const newClean = newCodeBlock.replace(/\r\n/g, '\n').trim();

if (content.includes(oldClean)) {
  content = content.replace(oldClean, newClean);
  
  // Also we must update CiPlPreviewModal mapping logic inside OrderDetail.tsx to prioritize customerHsCodes
  // Let's replace the modal mapping as well
  const oldModalMap = "hsCode: it.hsCode || matchedProd?.hsCode || '',";
  const newModalMap = "hsCode: it.hsCode || matchedProd?.customerHsCodes?.[basicForm.customer || ''] || matchedProd?.hsCode || '',";
  content = content.replace(oldModalMap, newModalMap);

  fs.writeFileSync(targetPath, content, 'utf8');
  console.log('✅ OrderDetail.tsx customerHsCodes loading lookup success!');
} else {
  console.log('❌ Could not match items load code block in OrderDetail.tsx.');
}
