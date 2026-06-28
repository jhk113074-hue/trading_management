const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

// 1. Layout.tsx 헤더에 클래스 부여
const layoutPath = path.join(rootDir, 'app', 'src', 'components', 'Layout.tsx');
if (fs.existsSync(layoutPath)) {
  let content = fs.readFileSync(layoutPath, 'utf8').replace(/\r\n/g, '\n');

  // YSACC 업무포탈 div에 header-logo-text 클래스 부여
  const oldLogoDiv = `<div style={{ fontSize: '26px', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center' }}>
              <span style={{ color: '#be123c', marginRight: '6px' }}>YSACC</span>
              <span style={{ color: '#334155' }}>업무포탈</span>
            </div>`;
  const newLogoDiv = `<div className="header-logo-text" style={{ fontSize: '26px', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#be123c', marginRight: '6px' }}>YSACC</span>
              <span style={{ color: '#334155' }}>업무포탈</span>
            </div>`;

  // 로그인 중 span에 header-user-text 클래스 부여
  const oldUserSpan = `<span style={{ marginRight: '16px', fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                {userProfile.department ? \`\${userProfile.department} \` : ''}{userProfile.name}님 로그인 중
              </span>`;
  const newUserSpan = `<span className="header-user-text" style={{ marginRight: '16px', fontSize: '15px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
                {userProfile.department ? \`\${userProfile.department} \` : ''}{userProfile.name}님 로그인 중
              </span>`;

  if (content.includes(oldLogoDiv)) {
    content = content.replace(oldLogoDiv, newLogoDiv);
  }
  if (content.includes(oldUserSpan)) {
    content = content.replace(oldUserSpan, newUserSpan);
  }

  fs.writeFileSync(layoutPath, content, 'utf8');
  console.log('✅ Layout.tsx responsive header classes injected.');
}

// 2. Dashboard.tsx 통계 카드 그리드 반응형 수정
const dbPath = path.join(rootDir, 'app', 'src', 'pages', 'Dashboard.tsx');
if (fs.existsSync(dbPath)) {
  let content = fs.readFileSync(dbPath, 'utf8').replace(/\r\n/g, '\n');

  const oldGrid = `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>`;
  const newGrid = `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '16px' }}>`;

  if (content.includes(oldGrid)) {
    content = content.replace(oldGrid, newGrid);
    fs.writeFileSync(dbPath, content, 'utf8');
    console.log('✅ Dashboard.tsx KPI grid made responsive (auto-fit).');
  } else {
    console.log('❌ Could not match oldGrid in Dashboard.tsx');
  }
}

// 3. index.css 에 미디어 쿼리 추가
const cssPath = path.join(rootDir, 'app', 'src', 'index.css');
if (fs.existsSync(cssPath)) {
  let content = fs.readFileSync(cssPath, 'utf8').replace(/\r\n/g, '\n');

  const mediaRules = `
/* 모바일 반응형 헤더 & 대시보드 보완 스타일 */
@media (max-width: 768px) {
  .header {
    padding: 0 12px !important;
    height: 56px !important;
  }
  .header-logo-text {
    font-size: 18px !important;
  }
  .header-logo-text span {
    margin-right: 3px !important;
  }
  .header-user-text {
    display: none !important; /* 모바일 환경에서는 좁아서 이름님 로그인중 텍스트를 숨겨 겹침 방지 */
  }
}
`;

  if (!content.includes('header-logo-text')) {
    content = content + mediaRules;
    fs.writeFileSync(cssPath, content, 'utf8');
    console.log('✅ index.css responsive styles appended.');
  }
}
