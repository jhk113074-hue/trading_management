const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

// 1. Suppliers.tsx (공급업체 관리)
const suppliersPath = path.join(rootDir, 'app', 'src', 'pages', 'Suppliers.tsx');
if (fs.existsSync(suppliersPath)) {
  let content = fs.readFileSync(suppliersPath, 'utf8').replace(/\r\n/g, '\n');
  const oldWrapper = '    <div className="page-container" style={{ padding: \'24px\' }}>';
  const newWrapper = '    <div className="page-container" style={{ padding: \'24px 30px\' }}>';
  
  const oldTitle = "<h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0 }}>공급업체 관리 (Suppliers)</h1>";
  const newTitle = "<h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>공급업체 관리 (Suppliers)</h1>";
  
  if (content.includes(oldWrapper)) {
    content = content.replace(oldWrapper, newWrapper);
  }
  if (content.includes(oldTitle)) {
    content = content.replace(oldTitle, newTitle);
  }
  fs.writeFileSync(suppliersPath, content, 'utf8');
  console.log('✅ Suppliers.tsx title and spacing unified!');
}

// 2. MyCompanySettings.tsx (자사 정보 관리)
const companyPath = path.join(rootDir, 'app', 'src', 'pages', 'MyCompanySettings.tsx');
if (fs.existsSync(companyPath)) {
  let content = fs.readFileSync(companyPath, 'utf8').replace(/\r\n/g, '\n');
  const oldWrapper = "    <div style={{ padding: '40px', maxWidth: '900px', margin: '0 auto' }}>";
  const newWrapper = "    <div style={{ padding: '24px 30px', maxWidth: '900px', margin: '0 auto' }}>";
  
  const oldTitle = "<h2 style={{ fontSize: '1.8rem', color: '#1e293b', marginBottom: '8px', fontWeight: 800 }}>🏢 자사 정보 관리</h2>";
  const newTitle = "<h1 style={{ fontSize: '26px', color: '#0f172a', marginBottom: '8px', fontWeight: 800, letterSpacing: '-0.025em' }}>🏢 자사 정보 관리</h1>";
  
  if (content.includes(oldWrapper)) {
    content = content.replace(oldWrapper, newWrapper);
  }
  if (content.includes(oldTitle)) {
    content = content.replace(oldTitle, newTitle);
  }
  fs.writeFileSync(companyPath, content, 'utf8');
  console.log('✅ MyCompanySettings.tsx title and spacing unified!');
}

// 3. IssueBoard.tsx (프로그램 오류/수정 게시판)
const boardPath = path.join(rootDir, 'app', 'src', 'pages', 'IssueBoard.tsx');
if (fs.existsSync(boardPath)) {
  let content = fs.readFileSync(boardPath, 'utf8').replace(/\r\n/g, '\n');
  const oldWrapper = "    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 4px' }}>";
  const newWrapper = "    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 30px' }}>";
  
  const oldTitle = "<h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>🛠️ 프로그램 오류/수정 게시판</h1>";
  const newTitle = "<h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>🛠️ 프로그램 오류/수정 게시판</h1>";
  
  if (content.includes(oldWrapper)) {
    content = content.replace(oldWrapper, newWrapper);
  }
  if (content.includes(oldTitle)) {
    content = content.replace(oldTitle, newTitle);
  }
  fs.writeFileSync(boardPath, content, 'utf8');
  console.log('✅ IssueBoard.tsx title and spacing unified!');
}
