const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

// 1. TaskList.tsx (전체 업무 리스트)
const taskListPath = path.join(rootDir, 'app', 'src', 'pages', 'TaskList.tsx');
if (fs.existsSync(taskListPath)) {
  let content = fs.readFileSync(taskListPath, 'utf8').replace(/\r\n/g, '\n');
  const oldWrapper = "    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fdfdfd' }}>\n      <div style={{ padding: '16px 30px 8px' }}>";
  const newWrapper = "    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fdfdfd' }}>\n      <div style={{ padding: '24px 30px 8px' }}>";
  
  const oldTitle = "<h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#111827', margin: 0 }}>전체 업무 리스트</h2>";
  const newTitle = "<h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>전체 업무 리스트</h1>";
  
  if (content.includes(oldWrapper)) {
    content = content.replace(oldWrapper, newWrapper);
  }
  if (content.includes(oldTitle)) {
    content = content.replace(oldTitle, newTitle);
  }
  fs.writeFileSync(taskListPath, content, 'utf8');
  console.log('✅ TaskList.tsx title and spacing unified!');
}

// 2. ProformaInvoices.tsx (견적관리)
const piPath = path.join(rootDir, 'app', 'src', 'pages', 'ProformaInvoices.tsx');
if (fs.existsSync(piPath)) {
  let content = fs.readFileSync(piPath, 'utf8').replace(/\r\n/g, '\n');
  const oldWrapper = '    <div className="page-container" style={{ padding: \'28px\', background: \'#f8fafc\', minHeight: \'100vh\', fontFamily: \'"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif\' }}>';
  const newWrapper = '    <div className="page-container" style={{ padding: \'24px 30px\', background: \'#f8fafc\', minHeight: \'100vh\', fontFamily: \'"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif\' }}>';
  
  if (content.includes(oldWrapper)) {
    content = content.replace(oldWrapper, newWrapper);
  }
  fs.writeFileSync(piPath, content, 'utf8');
  console.log('✅ ProformaInvoices.tsx spacing unified!');
}

// 3. Orders.tsx (주문 관리 대시보드)
const ordersPath = path.join(rootDir, 'app', 'src', 'pages', 'Orders.tsx');
if (fs.existsSync(ordersPath)) {
  let content = fs.readFileSync(ordersPath, 'utf8').replace(/\r\n/g, '\n');
  const oldWrapper = "    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>";
  const newWrapper = "    <div style={{ padding: '24px 30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>";
  
  if (content.includes(oldWrapper)) {
    content = content.replace(oldWrapper, newWrapper);
  }
  fs.writeFileSync(ordersPath, content, 'utf8');
  console.log('✅ Orders.tsx spacing unified!');
}

// 4. Products.tsx (상품 마스터 관리)
const productsPath = path.join(rootDir, 'app', 'src', 'pages', 'Products.tsx');
if (fs.existsSync(productsPath)) {
  let content = fs.readFileSync(productsPath, 'utf8').replace(/\r\n/g, '\n');
  const oldWrapper = '    <div className="page-container" style={{ padding: \'12px 16px\' }}>';
  const newWrapper = '    <div className="page-container" style={{ padding: \'24px 30px\' }}>';
  
  const oldTitle = "<h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', margin: 0 }}>상품 마스터 관리</h1>";
  const newTitle = "<h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>상품 마스터 관리</h1>";
  
  if (content.includes(oldWrapper)) {
    content = content.replace(oldWrapper, newWrapper);
  }
  if (content.includes(oldTitle)) {
    content = content.replace(oldTitle, newTitle);
  }
  fs.writeFileSync(productsPath, content, 'utf8');
  console.log('✅ Products.tsx title and spacing unified!');
}

// 5. Customers.tsx (고객사 관리)
const customersPath = path.join(rootDir, 'app', 'src', 'pages', 'Customers.tsx');
if (fs.existsSync(customersPath)) {
  let content = fs.readFileSync(customersPath, 'utf8').replace(/\r\n/g, '\n');
  const oldWrapper = '    <div className="page-container" style={{ padding: \'24px\' }}>';
  const newWrapper = '    <div className="page-container" style={{ padding: \'24px 30px\' }}>';
  
  const oldTitle = "<h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0 }}>고객사 관리 (Customers)</h1>";
  const newTitle = "<h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>고객사 관리 (Customers)</h1>";
  
  if (content.includes(oldWrapper)) {
    content = content.replace(oldWrapper, newWrapper);
  }
  if (content.includes(oldTitle)) {
    content = content.replace(oldTitle, newTitle);
  }
  fs.writeFileSync(customersPath, content, 'utf8');
  console.log('✅ Customers.tsx title and spacing unified!');
}
