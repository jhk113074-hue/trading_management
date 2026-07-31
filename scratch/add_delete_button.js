const fs = require('fs');
const filePath = 'e:/무역관리프로그램/app/src/pages/OrderDetail.tsx';

let content = fs.readFileSync(filePath, 'utf8');

const regex = /<td style=\{\{ padding: '6px', textAlign: 'center', display: 'flex', gap: '4px', justifyContent: 'center' \}\}>\s*<button[\s\S]*?<\/button>\s*<\/td>/g;

const replacement = `<td style={{ padding: '6px', textAlign: 'center' }}>
                                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                                            <button
                                              type="button"
                                              onClick={() => previewFile(doc.fileUrl, doc.fileName)}
                                              style={{ padding: '4px 8px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                              title="미리보기 (보기)"
                                            >
                                              🔍
                                            </button>
                                            <button 
                                              type="button"
                                              onClick={() => handleDeletePoIssuedDoc(doc.id, doc.fileName)} 
                                              style={{ padding: '4px 8px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: '4px', color: '#dc2626', fontSize: '13.5px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}
                                              title="발행 문서 삭제"
                                            >
                                              🗑️ 삭제
                                            </button>
                                          </div>
                                        </td>`;

if (regex.test(content)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully replaced individual archive table action column with Delete button!');
} else {
  console.log('Regex did not match.');
}
