const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

// 1. MyCompanySettings.tsx (자사 정보 관리)
const companyPath = path.join(rootDir, 'app', 'src', 'pages', 'MyCompanySettings.tsx');
if (fs.existsSync(companyPath)) {
  let content = fs.readFileSync(companyPath, 'utf8').replace(/\r\n/g, '\n');
  const oldWrapper = "    <div style={{ padding: '24px 30px', maxWidth: '900px', margin: '0 auto' }}>";
  const newWrapper = "    <div style={{ padding: '24px 30px', maxWidth: '900px' }}>"; // Remove margin: '0 auto' to left-align
  
  if (content.includes(oldWrapper)) {
    content = content.replace(oldWrapper, newWrapper);
    fs.writeFileSync(companyPath, content, 'utf8');
    console.log('✅ MyCompanySettings.tsx container aligned left!');
  } else {
    console.log('❌ Could not match old wrapper in MyCompanySettings.tsx');
  }
}

// 2. IssueBoard.tsx (프로그램 오류/수정 게시판)
const boardPath = path.join(rootDir, 'app', 'src', 'pages', 'IssueBoard.tsx');
if (fs.existsSync(boardPath)) {
  let content = fs.readFileSync(boardPath, 'utf8').replace(/\r\n/g, '\n');
  const oldWrapper = "    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 30px' }}>";
  const newWrapper = "    <div style={{ padding: '24px 30px' }}>"; // Remove margin: '0 auto' and maxWidth to left-align fully
  
  if (content.includes(oldWrapper)) {
    content = content.replace(oldWrapper, newWrapper);
    fs.writeFileSync(boardPath, content, 'utf8');
    console.log('✅ IssueBoard.tsx container aligned left!');
  } else {
    console.log('❌ Could not match old wrapper in IssueBoard.tsx');
  }
}
