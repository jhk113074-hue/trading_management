const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

// 1. Orders.tsx (주문 관리 대시보드)
const ordersPath = path.join(rootDir, 'app', 'src', 'pages', 'Orders.tsx');
if (fs.existsSync(ordersPath)) {
  let content = fs.readFileSync(ordersPath, 'utf8').replace(/\r\n/g, '\n');
  const oldHeader = "      {/* 헤더 */}\n      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>";
  const newHeader = "      {/* 헤더 */}\n      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>";
  
  if (content.includes(oldHeader)) {
    content = content.replace(oldHeader, newHeader);
    fs.writeFileSync(ordersPath, content, 'utf8');
    console.log('✅ Orders.tsx header bottom margin updated to 20px!');
  } else {
    console.log('❌ Could not match header in Orders.tsx');
  }
}

// 2. ProformaInvoices.tsx (견적관리)
const piPath = path.join(rootDir, 'app', 'src', 'pages', 'ProformaInvoices.tsx');
if (fs.existsSync(piPath)) {
  let content = fs.readFileSync(piPath, 'utf8').replace(/\r\n/g, '\n');
  const oldHeader = "      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>";
  const newHeader = "      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>";
  
  if (content.includes(oldHeader)) {
    content = content.replace(oldHeader, newHeader);
    fs.writeFileSync(piPath, content, 'utf8');
    console.log('✅ ProformaInvoices.tsx header bottom margin updated to 20px!');
  } else {
    console.log('❌ Could not match header in ProformaInvoices.tsx');
  }
}

// 3. TaskList.tsx (전체 업무 리스트)
const taskListPath = path.join(rootDir, 'app', 'src', 'pages', 'TaskList.tsx');
if (fs.existsSync(taskListPath)) {
  let content = fs.readFileSync(taskListPath, 'utf8').replace(/\r\n/g, '\n');
  const oldHeader = "        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>";
  const newHeader = "        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>";
  
  if (content.includes(oldHeader)) {
    content = content.replace(oldHeader, newHeader);
    fs.writeFileSync(taskListPath, content, 'utf8');
    console.log('✅ TaskList.tsx header bottom margin updated to 20px!');
  } else {
    console.log('❌ Could not match header in TaskList.tsx');
  }
}
