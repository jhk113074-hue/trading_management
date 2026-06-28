const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

// 1. Orders.tsx (주문 관리 대시보드 스탯 카드)
const ordersPath = path.join(rootDir, 'app', 'src', 'pages', 'Orders.tsx');
if (fs.existsSync(ordersPath)) {
  let content = fs.readFileSync(ordersPath, 'utf8').replace(/\r\n/g, '\n');
  
  const oldBlock = `      {/* 스탯 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>진행 중 오더</span>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{stats.activeCount} 건</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>진행 수주금액</span>
            <span style={{ fontSize: '10px', color: '#64748b' }}>(YSACC: \${Math.round(stats.totalYsaccUsd).toLocaleString()} / 영성: \${Math.round(stats.totalYsUsd).toLocaleString()})</span>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f766e' }}>\${stats.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div style={{ background: stats.urgentCount > 0 ? '#fef2f2' : '#fff', border: stats.urgentCount > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: stats.urgentCount > 0 ? '#dc2626' : '#64748b' }}>오늘 처리 필요 (긴급)</span>
          <div style={{ fontSize: '15px', fontWeight: 800, color: stats.urgentCount > 0 ? '#dc2626' : '#0f172a' }}>{stats.urgentCount} 건</div>
        </div>
      </div>`;

  const newBlock = `      {/* 스탯 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '10px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>진행 중 오더</span>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>{stats.activeCount} 건</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>진행 수주금액</span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(YSACC: \${Math.round(stats.totalYsaccUsd).toLocaleString()} / 영성: \${Math.round(stats.totalYsUsd).toLocaleString()})</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f766e' }}>\${stats.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div style={{ background: stats.urgentCount > 0 ? '#fef2f2' : '#fff', border: stats.urgentCount > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: stats.urgentCount > 0 ? '#dc2626' : '#475569' }}>오늘 처리 필요 (긴급)</span>
          <div style={{ fontSize: '22px', fontWeight: 900, color: stats.urgentCount > 0 ? '#dc2626' : '#0f172a' }}>{stats.urgentCount} 건</div>
        </div>
      </div>`;

  if (content.includes(oldBlock)) {
    content = content.replace(oldBlock, newBlock);
    fs.writeFileSync(ordersPath, content, 'utf8');
    console.log('✅ Orders.tsx stats card fonts maximized!');
  } else {
    console.log('❌ Could not match old block in Orders.tsx');
  }
}

// 2. ProformaInvoices.tsx (견적관리 스탯 카드)
const piPath = path.join(rootDir, 'app', 'src', 'pages', 'ProformaInvoices.tsx');
if (fs.existsSync(piPath)) {
  let content = fs.readFileSync(piPath, 'utf8').replace(/\r\n/g, '\n');
  
  const oldBlock = `      {/* 간단 대시보드 스탯 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '10px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>진행 중 견적 (협상중)</span>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{piStats.activeCount} 건</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>진행 견적금액</span>
            <span style={{ fontSize: '10px', color: '#64748b' }}>(YSACC: \${Math.round(piStats.totalYsaccUsd).toLocaleString()} / 영성: \${Math.round(piStats.totalYsUsd).toLocaleString()})</span>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f766e' }}>\${piStats.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>수주 확정 (수주율)</span>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#2563eb' }}>{piStats.confirmedCount} 건 ({piStats.conversionRate.toFixed(1)}%)</div>
        </div>
      </div>`;

  const newBlock = `      {/* 간단 대시보드 스탯 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>진행 중 견적 (협상중)</span>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>{piStats.activeCount} 건</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>진행 견적금액</span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(YSACC: \${Math.round(piStats.totalYsaccUsd).toLocaleString()} / 영성: \${Math.round(piStats.totalYsUsd).toLocaleString()})</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f766e' }}>\${piStats.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>수주 확정 (수주율)</span>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#2563eb' }}>{piStats.confirmedCount} 건 ({piStats.conversionRate.toFixed(1)}%)</div>
        </div>
      </div>`;

  if (content.includes(oldBlock)) {
    content = content.replace(oldBlock, newBlock);
    fs.writeFileSync(piPath, content, 'utf8');
    console.log('✅ ProformaInvoices.tsx stats card fonts maximized!');
  } else {
    console.log('❌ Could not match old block in ProformaInvoices.tsx');
  }
}
