const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'app', 'src', 'pages', 'OrderDetail.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

const oldLoad = `        setOrderItems(data.items || []);`;

const newLoad = `        const itemsWithHs = (data.items || []).map((it) => {
          const codeMatch = (it.name || '').match(/^\\[(.*?)\\]\\s*(.*)$/);
          const code = codeMatch ? codeMatch[1] : (it.itemId || '');
          const matchedProd = products.find(p => p.productCode === code || p.id === code);
          return {
            ...it,
            hsCode: it.hsCode || matchedProd?.hsCode || ''
          };
        });
        setOrderItems(itemsWithHs);`;

const contentClean = content.replace(/\r\n/g, '\n');
const oldClean = oldLoad.replace(/\r\n/g, '\n').trim();
const newClean = newLoad.replace(/\r\n/g, '\n').trim();

if (contentClean.includes(oldClean)) {
  const updatedContent = contentClean.replace(oldClean, newClean);
  fs.writeFileSync(targetPath, updatedContent, 'utf8');
  console.log('✅ OrderDetail.tsx items load hsCode mapping success!');
} else {
  console.log('❌ Could not match items load code block in OrderDetail.tsx.');
}
