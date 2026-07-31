const fs = require('fs');
const filePath = 'e:/무역관리프로그램/app/src/pages/OrderDetail.tsx';

const lines = fs.readFileSync(filePath, 'utf8').split('\n');

const startIdx = lines.findIndex(l => l.includes('const buildPoNotificationMessage'));
const endIdx = lines.findIndex(l => l.includes('const handlePrintCI'));

console.log('startIdx:', startIdx, 'endIdx:', endIdx);

if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
  lines.splice(startIdx, endIdx - startIdx);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log('Successfully sliced out unused PO email/kakao helper functions!');
} else {
  console.log('Could not find start or end index.');
}
