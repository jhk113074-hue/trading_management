const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const dbPath = path.join(rootDir, 'app', 'src', 'pages', 'Dashboard.tsx');

if (fs.existsSync(dbPath)) {
  let content = fs.readFileSync(dbPath, 'utf8').replace(/\r\n/g, '\n');

  const oldBlock = `          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
            
            {/* 1. 이번달 PI 건수 */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }} />
                이번달 PI 건수
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>영성ACC</span>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#3b82f6' }}>{tradingKPIs.piYsCount} <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>건</span></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>(주)YSACC</span>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#3b82f6' }}>{tradingKPIs.piYsaccCount} <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>건</span></span>
                </div>
              </div>
            </div>

            {/* 2. 수주 금액 (발주일 기준) */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                수주 금액 (발주일 기준)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>영성ACC</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tradingKPIs.orderYsCount}건</span>
                  </div>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>\${tradingKPIs.orderYsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>(주)YSACC</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tradingKPIs.orderYsaccCount}건</span>
                  </div>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>\${tradingKPIs.orderYsaccAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* 3. 매출금액 (ETD기준) */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
                매출금액 (ETD기준)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>영성ACC</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tradingKPIs.salesYsCount}건</span>
                  </div>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b' }}>\${tradingKPIs.salesYsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>(주)YSACC</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tradingKPIs.salesYsaccCount}건</span>
                  </div>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b' }}>\${tradingKPIs.salesYsaccAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

          </div>`;

  const newBlock = `          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            
            {/* 1. 이번달 PI 건수 */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6' }} />
                이번달 PI 건수
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, justifyContent: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)' }}>영성ACC</span>
                  <span style={{ fontSize: '21px', fontWeight: 900, color: '#3b82f6' }}>{tradingKPIs.piYsCount} <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>건</span></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '2px' }}>
                  <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)' }}>(주)YSACC</span>
                  <span style={{ fontSize: '21px', fontWeight: 900, color: '#3b82f6' }}>{tradingKPIs.piYsaccCount} <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>건</span></span>
                </div>
              </div>
            </div>

            {/* 2. 수주 금액 (발주일 기준) */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                수주 금액 (발주일 기준)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, justifyContent: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)' }}>영성ACC</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{tradingKPIs.orderYsCount}건</span>
                  </div>
                  <span style={{ fontSize: '21px', fontWeight: 900, color: '#10b981' }}>\${tradingKPIs.orderYsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)' }}>(주)YSACC</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{tradingKPIs.orderYsaccCount}건</span>
                  </div>
                  <span style={{ fontSize: '21px', fontWeight: 900, color: '#10b981' }}>\${tradingKPIs.orderYsaccAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* 3. 매출금액 (ETD기준) */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }} />
                매출금액 (ETD기준)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, justifyContent: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)' }}>영성ACC</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{tradingKPIs.salesYsCount}건</span>
                  </div>
                  <span style={{ fontSize: '21px', fontWeight: 900, color: '#f59e0b' }}>\${tradingKPIs.salesYsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)' }}>(주)YSACC</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{tradingKPIs.salesYsaccCount}건</span>
                  </div>
                  <span style={{ fontSize: '21px', fontWeight: 900, color: '#f59e0b' }}>\${tradingKPIs.salesYsaccAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

          </div>`;

  if (content.includes(oldBlock)) {
    content = content.replace(oldBlock, newBlock);
    fs.writeFileSync(dbPath, content, 'utf8');
    console.log('✅ Dashboard.tsx KPI cards styling optimized (Larger fonts + Compact layout)!');
  } else {
    console.log('❌ Could not match old block in Dashboard.tsx');
  }
}
