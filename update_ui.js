const fs = require('fs');

const path = 'app/src/pages/OrderDetail.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add state
content = content.replace(
  "const [forwardersList, setForwardersList] = useState<ForwarderEntry[]>([]);",
  "const [forwardersList, setForwardersList] = useState<ForwarderEntry[]>([]);\n  const [issuedDocs, setIssuedDocs] = useState<any[]>([]);"
);

// 2. Add fetchIssuedDocs in useEffect
content = content.replace(
  "  // Load Order document\n  useEffect(() => {\n    if (!id) return;",
  "  // Load Order document\n  useEffect(() => {\n    if (!id) return;\n    const fetchIssuedDocs = async () => {\n      try {\n        const res = await fetch(`http://localhost:3000/api/po/${id}/documents`);\n        const data = await res.json();\n        if (data.documents) {\n          setIssuedDocs(data.documents);\n        }\n      } catch (e) {\n        console.error(\"Failed to fetch issued docs\", e);\n      }\n    };\n    fetchIssuedDocs();"
);

// 3. Refactor handlePrintSupplierPo to buildPoHtml + issueAndSavePO
const printRegex = /const handlePrintSupplierPo = async \(supplierName: string, items: OrderItem\[\]\) => \{([\s\S]*?)const printWin = window\.open\('', '_blank', 'width=850,height=900,scrollbars=yes,resizable=yes'\);/m;

const match = content.match(printRegex);
if (match) {
  const body = match[1]; // Everything up to window.open
  const refactored = `const buildPoHtml = async (supplierName: string, items: OrderItem[]) => {${body}return { html: printHtml, poNum, cleanSupplierName, taxType, supplierCode };
  };

  const handlePrintSupplierPo = async (supplierName: string, items: OrderItem[]) => {
    const res = await buildPoHtml(supplierName, items);
    if (!res) return;
    const printHtml = res.html;
    const printWin = window.open('', '_blank', 'width=850,height=900,scrollbars=yes,resizable=yes');`;

  content = content.replace(printRegex, refactored);
  
  // Now add issueAndSavePO
  const emailRegex = /const handleEmailSupplierPo = \(supplierName: string, items: OrderItem\[\]\) => \{/m;
  const issueAndSave = `const issueAndSavePO = async (supplierName: string, items: OrderItem[]) => {
    const res = await buildPoHtml(supplierName, items);
    if (!res) return;
    const { html, poNum } = res;
    
    const totalAmount = items.reduce((sum, it) => {
      const price = (it as any).purchaseUnitPrice !== undefined ? (it as any).purchaseUnitPrice : it.unitPrice;
      return sum + (price || 0) * (it.qty || 0);
    }, 0);

    const confirmed = window.confirm(\`발주서를 발행하시겠습니까?\\n\\nPO번호: \${poNum}\\n거래처: \${supplierName}\\n⚠️ 발행 후 금액/수량 수정 시 재발행이 필요합니다.\`);
    if (!confirmed) return;

    try {
      const resApi = await fetch(\`http://localhost:3000/api/po/\${order?.id}/issue\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htmlContent: html,
          poNumber: poNum,
          supplierName,
          totalAmount
        })
      });
      const data = await resApi.json();
      if (data.success) {
        alert('✅ 발주서가 발행 저장되었습니다.');
        // Refresh issued docs
        const resDocs = await fetch(\`http://localhost:3000/api/po/\${order?.id}/documents\`);
        const docsData = await resDocs.json();
        if (docsData.documents) setIssuedDocs(docsData.documents);
      } else {
        alert('발행 실패: ' + data.error);
      }
    } catch (e) {
      console.error(e);
      alert('발행 중 오류가 발생했습니다.');
    }
  };

  const handleEmailSupplierPo = (supplierName: string, items: OrderItem[]) => {`;
  
  content = content.replace(emailRegex, issueAndSave);
}

// 4. Update UI buttons
const buttonsRegex = /<button[\s\S]*?onClick=\{\(\) => handlePrintSupplierPo\(supplierName, items\)\}[\s\S]*?>[\s\S]*?🖨️ 인쇄 \/ PDF[\s\S]*?<\/button>/m;
const buttonsMatch = content.match(buttonsRegex);
if (buttonsMatch) {
  const newButtons = `<button 
                                  onClick={() => handlePrintSupplierPo(supplierName, items)}
                                  style={{ padding: '5px 10px', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px' }}
                                >
                                  미리보기 / 인쇄
                                </button>
                                <button 
                                  onClick={() => issueAndSavePO(supplierName, items)}
                                  style={{ padding: '5px 10px', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px' }}
                                >
                                  📥 발주서 발행 및 저장
                                </button>`;
  content = content.replace(buttonsMatch[0], newButtons);
}

// 5. Add Document List table at the bottom of the items table
const endOfTableRegex = /<div style=\{\{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end', marginTop: '10px' \}\}>/m;

const docsTable = `
{issuedDocs.filter(d => d.supplier_name === supplierName || d.po_number.includes(supplierName.replace(/\\s+/g, '').substring(0,3).toUpperCase())).length > 0 && (
  <div style={{ marginTop: '20px', padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
    <h4 style={{ margin: '0 0 10px 0', fontSize: '12.5px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
      📁 발행 문서 보관함
    </h4>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', backgroundColor: '#fff' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #cbd5e1', backgroundColor: '#f1f5f9' }}>
          <th style={{ padding: '6px', textAlign: 'center', width: '50px' }}>No</th>
          <th style={{ padding: '6px', textAlign: 'left' }}>문서명</th>
          <th style={{ padding: '6px', textAlign: 'center', width: '120px' }}>발행일시</th>
          <th style={{ padding: '6px', textAlign: 'center', width: '60px' }}>버전</th>
          <th style={{ padding: '6px', textAlign: 'center', width: '80px' }}>발행자</th>
          <th style={{ padding: '6px', textAlign: 'center', width: '120px' }}>액션</th>
        </tr>
      </thead>
      <tbody>
        {issuedDocs
          .filter(d => d.supplier_name === supplierName || d.po_number.includes(supplierName.replace(/\\s+/g, '').substring(0,3).toUpperCase()))
          .map((doc, idx) => (
          <tr key={doc.id} style={{ borderBottom: '1px solid #e2e8f0', color: doc.status === 'superseded' ? '#94a3b8' : 'inherit' }}>
            <td style={{ padding: '6px', textAlign: 'center' }}>{idx + 1}</td>
            <td style={{ padding: '6px', textAlign: 'left' }}>
              {doc.fileName}
              {doc.status === 'active' && <span style={{ marginLeft: '6px', padding: '2px 6px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>최신</span>}
            </td>
            <td style={{ padding: '6px', textAlign: 'center' }}>{new Date(doc.issuedAt).toLocaleString()}</td>
            <td style={{ padding: '6px', textAlign: 'center' }}>v{doc.version}</td>
            <td style={{ padding: '6px', textAlign: 'center' }}>{doc.issuedBy}</td>
            <td style={{ padding: '6px', textAlign: 'center', display: 'flex', gap: '4px', justifyContent: 'center' }}>
              <a href={\`http://localhost:3000\${doc.fileUrl}\`} target="_blank" style={{ padding: '3px 8px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#334155', textDecoration: 'none', fontSize: '11px' }}>보기</a>
              <a href={\`http://localhost:3000\${doc.fileUrl}\`} download style={{ padding: '3px 8px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#334155', textDecoration: 'none', fontSize: '11px' }}>↓ 다운</a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
<div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end', marginTop: '10px' }}>`;

content = content.replace(endOfTableRegex, docsTable);

fs.writeFileSync(path, content, 'utf8');
console.log('Update complete!');
