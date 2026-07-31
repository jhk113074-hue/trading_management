const fs = require('fs');
const filePath = 'e:/무역관리프로그램/app/src/pages/OrderDetail.tsx';

let content = fs.readFileSync(filePath, 'utf8');

const targetStr = `<button 
                                  onClick={() => handleEmailSupplierPo(supplierName, items)}
                                  style={{ padding: '5px 10px', background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '14.5px' }}
                                  title="이메일로 발주서 및 PDF 다운로드 링크 전달"
                                >
                                  ✉️ 이메일 발송
                                </button>
                                <button 
                                  onClick={() => handleKakaoSupplierPo(supplierName, items)}
                                  style={{ padding: '5px 10px', background: '#fef9c3', border: '1px solid #fef08a', color: '#854d0e', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '14.5px' }}
                                  title="카카오톡으로 발주서 안내 및 PDF 링크 전달"
                                >
                                  💬 카카오톡 전송
                                </button>`;

console.log('Includes targetStr?', content.includes('✉️ 이메일 발송'));

if (content.includes('✉️ 이메일 발송')) {
  // Regex to remove the two buttons
  const regex = /<button\s+onClick=\{\(\) => handleEmailSupplierPo[\s\S]*?<\/button>\s*<button\s+onClick=\{\(\) => handleKakaoSupplierPo[\s\S]*?<\/button>/g;
  content = content.replace(regex, '');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully removed email & kakao buttons from OrderDetail.tsx!');
} else {
  console.log('Buttons not found or already removed.');
}
