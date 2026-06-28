const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const dbPath = path.join(rootDir, 'app', 'src', 'pages', 'Dashboard.tsx');
const cssPath = path.join(rootDir, 'app', 'src', 'index.css');

// 1. Dashboard.tsx 수정
if (fs.existsSync(dbPath)) {
  let content = fs.readFileSync(dbPath, 'utf8').replace(/\r\n/g, '\n');

  // Right Main Area 컨테이너에 class="kanban-right-panel" 부여
  const oldRight = `        {/* Right Main Area (Selected Assignee profile + Info banner + 4 Baskets) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>`;

  const newRight = `        {/* Right Main Area (Selected Assignee profile + Info banner + 4 Baskets) */}
        <div className="kanban-right-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0, width: '100%' }}>`;

  if (content.includes(oldRight)) {
    content = content.replace(oldRight, newRight);
    fs.writeFileSync(dbPath, content, 'utf8');
    console.log('✅ Dashboard.tsx right panel class added.');
  } else {
    console.log('❌ Could not match right panel div in Dashboard.tsx');
  }
}

// 2. index.css 에 모바일 너비 100% 강제 규칙 보완 추가
if (fs.existsSync(cssPath)) {
  let content = fs.readFileSync(cssPath, 'utf8').replace(/\r\n/g, '\n');

  const oldMedia = `@media (max-width: 1024px) {
  .kanban-main-layout {
    flex-direction: column !important;
    gap: 16px !important;
  }
  .kanban-left-panel {
    width: 100% !important;
    border-right: none !important;
    border-bottom: 1px solid #cbd5e1 !important;
    padding-right: 0 !important;
    padding-bottom: 20px !important;
  }
  .kanban-board-grid {
    grid-template-columns: repeat(2, 1fr) !important; /* 태블릿에서는 2열 */
  }
}`;

  const newMedia = `@media (max-width: 1024px) {
  .kanban-main-layout {
    flex-direction: column !important;
    gap: 16px !important;
  }
  .kanban-left-panel {
    width: 100% !important;
    border-right: none !important;
    border-bottom: 1px solid #cbd5e1 !important;
    padding-right: 0 !important;
    padding-bottom: 20px !important;
  }
  .kanban-right-panel {
    width: 100% !important;
    min-width: 100% !important;
  }
  .kanban-board-grid {
    grid-template-columns: repeat(2, 1fr) !important; /* 태블릿에서는 2열 */
  }
}`;

  if (content.includes(oldMedia)) {
    content = content.replace(oldMedia, newMedia);
    fs.writeFileSync(cssPath, content, 'utf8');
    console.log('✅ index.css media query updated for right panel.');
  } else {
    // 혹시 매치가 안될 경우를 위한 대체 보완 규칙 추가
    const appendRules = `
/* 보완 패널 규칙 */
@media (max-width: 1024px) {
  .kanban-right-panel {
    width: 100% !important;
    min-width: 100% !important;
  }
}
`;
    content = content + appendRules;
    fs.writeFileSync(cssPath, content, 'utf8');
    console.log('✅ index.css extra fallback responsive rules appended.');
  }
}
