const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

// 1. Orders.tsx 합계 폰트 수정
const ordersPath = path.join(rootDir, 'app', 'src', 'pages', 'Orders.tsx');
if (fs.existsSync(ordersPath)) {
  let content = fs.readFileSync(ordersPath, 'utf8').replace(/\r\n/g, '\n');
  
  const oldBlock = `                {processedOrders.length > 0 && (
                  <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #cbd5e1' }}>
                    <td colSpan={4} style={{ padding: '12px 16px', color: '#475569', textAlign: 'right', fontSize: '12.5px', fontWeight: 700 }}>합계</td>
                    <td style={{ padding: '12px 16px', color: '#0f172a', fontSize: '13px', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      \${processedOrders.reduce((sum, o) => {
                        const pi = quotations.find(q => q.id === o.quotationId);
                        return sum + (pi?.totalUsd || o.totalAmount || 0);
                      }, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td /><td />
                  </tr>
                )}`;

  const newBlock = `                {processedOrders.length > 0 && (
                  <tr style={{ backgroundColor: '#f8fafc', borderTop: '2.5px solid #cbd5e1' }}>
                    <td colSpan={4} style={{ padding: '14px 16px', color: '#1e293b', textAlign: 'right', fontSize: '16px', fontWeight: 800 }}>합계</td>
                    <td style={{ padding: '14px 16px', color: '#0f172a', fontSize: '16px', fontWeight: 800, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      \${processedOrders.reduce((sum, o) => {
                        const pi = quotations.find(q => q.id === o.quotationId);
                        return sum + (pi?.totalUsd || o.totalAmount || 0);
                      }, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td /><td />
                  </tr>
                )}`;

  if (content.includes(oldBlock)) {
    content = content.replace(oldBlock, newBlock);
    fs.writeFileSync(ordersPath, content, 'utf8');
    console.log('✅ Orders.tsx table total sum fonts maximized!');
  } else {
    console.log('❌ Could not match old block in Orders.tsx');
  }
}

// 2. ProformaInvoices.tsx 합계 폰트 수정
const piPath = path.join(rootDir, 'app', 'src', 'pages', 'ProformaInvoices.tsx');
if (fs.existsSync(piPath)) {
  let content = fs.readFileSync(piPath, 'utf8').replace(/\r\n/g, '\n');

  const oldBlock = `            {filteredAndSorted.length > 0 && (
              <tr style={{ backgroundColor: '#f8fafc', fontWeight: 'bold', borderTop: '2.5px solid #cbd5e1' }}>
                <td colSpan={4} style={{ padding: '12px 10px', color: '#475569', textAlign: 'right', fontSize: '13px' }}>합계</td>
                <td style={{ padding: '12px 10px', color: '#0f172a', whiteSpace: 'nowrap', fontSize: '13px', textAlign: 'right', paddingRight: '12px' }}>
                  \${filteredAndSorted.reduce((sum, p) => sum + (p.totalUsd || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td />
                <td />
                <td />
              </tr>
            )}`;

  const newBlock = `            {filteredAndSorted.length > 0 && (
              <tr style={{ backgroundColor: '#f8fafc', fontWeight: 'bold', borderTop: '2.5px solid #cbd5e1' }}>
                <td colSpan={4} style={{ padding: '14px 10px', color: '#1e293b', textAlign: 'right', fontSize: '16px', fontWeight: 800 }}>합계</td>
                <td style={{ padding: '14px 10px', color: '#0f172a', whiteSpace: 'nowrap', fontSize: '16px', fontWeight: 800, textAlign: 'right', paddingRight: '12px' }}>
                  \${filteredAndSorted.reduce((sum, p) => sum + (p.totalUsd || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td />
                <td />
                <td />
              </tr>
            )}`;

  if (content.includes(oldBlock)) {
    content = content.replace(oldBlock, newBlock);
    fs.writeFileSync(piPath, content, 'utf8');
    console.log('✅ ProformaInvoices.tsx table total sum fonts maximized!');
  } else {
    console.log('❌ Could not match old block in ProformaInvoices.tsx');
  }
}
