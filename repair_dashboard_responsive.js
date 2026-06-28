const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const dbPath = path.join(rootDir, 'app', 'src', 'pages', 'Dashboard.tsx');
const cssPath = path.join(rootDir, 'app', 'src', 'index.css');

// 1. Dashboard.tsx 변경
if (fs.existsSync(dbPath)) {
  let content = fs.readFileSync(dbPath, 'utf8').replace(/\r\n/g, '\n');

  // Main Kanban Container를 class를 부여하도록 수정
  const oldMainContainer = `      {/* Main Kanban Container: Sidebar on left + Board on right */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch' }}>`;

  const newMainContainer = `      {/* Main Kanban Container: Sidebar on left + Board on right */}
      <div className="kanban-main-layout" style={{ display: 'flex', gap: '20px', alignItems: 'stretch' }}>`;

  // Left Side Panel에 클래스 부여 및 flex-basis/width를 미디어 쿼리 제어가 가능하게 클래스명 매핑
  const oldLeftPanel = `        {/* Left Side Panel (담당자별 배당 현황 & 미배당 업무) */}
        <div style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px', borderRight: '1px solid #e2e8f0', paddingRight: '20px' }}>`;

  const newLeftPanel = `        {/* Left Side Panel (담당자별 배당 현황 & 미배당 업무) */}
        <div className="kanban-left-panel" style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px', borderRight: '1px solid #e2e8f0', paddingRight: '20px' }}>`;

  // 4 Baskets Kanban Board에 클래스 부여 및 반응형 그리드 설정
  const oldKanbanBoard = `          {/* 4 Baskets Kanban Board */}
          <div className="board-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', alignItems: 'start' }}>`;

  const newKanbanBoard = `          {/* 4 Baskets Kanban Board */}
          <div className="board-container kanban-board-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', alignItems: 'start' }}>`;

  if (content.includes(oldMainContainer)) {
    content = content.replace(oldMainContainer, newMainContainer);
  }
  if (content.includes(oldLeftPanel)) {
    content = content.replace(oldLeftPanel, newLeftPanel);
  }
  if (content.includes(oldKanbanBoard)) {
    content = content.replace(oldKanbanBoard, newKanbanBoard);
  }

  fs.writeFileSync(dbPath, content, 'utf8');
  console.log('✅ Dashboard.tsx kanban structures injected with responsive classes.');
}

// 2. index.css 변경
if (fs.existsSync(cssPath)) {
  let content = fs.readFileSync(cssPath, 'utf8').replace(/\r\n/g, '\n');

  const mediaRules = `
/* 모바일 및 소형 기기 칸반 레이아웃 대응 */
@media (max-width: 1024px) {
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
}

@media (max-width: 600px) {
  .kanban-board-grid {
    grid-template-columns: 1fr !important; /* 모바일폰에서는 1열 세로 정렬 */
  }
}
`;

  if (!content.includes('kanban-main-layout')) {
    content = content + mediaRules;
    fs.writeFileSync(cssPath, content, 'utf8');
    console.log('✅ index.css kanban responsive styles appended.');
  }
}
