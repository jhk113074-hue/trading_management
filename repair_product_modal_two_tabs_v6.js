const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const pmPath = path.join(rootDir, 'app', 'src', 'components', 'ProductModal.tsx');

if (fs.existsSync(pmPath)) {
  let content = fs.readFileSync(pmPath, 'utf8').replace(/\r\n/g, '\n');

  // 1. 탭 네비게이션 헤더 변경 (622~628라인 영역)
  // { id: 1, label: '📑 1. 기본 정보' } 등 5개 탭을 2개 탭으로 치환
  content = content.replace(
    /\{\s*id:\s*1,\s*label:\s*'📑 1\. 기본 정보'\s*\},\s*\{\s*id:\s*2,\s*label:\s*'🏭 2\. 공급 유통망'\s*\},\s*\{\s*id:\s*3,\s*label:\s*'💰 3\. 가격\(단가\) 관리'\s*\},\s*\{\s*id:\s*4,\s*label:\s*'📦 4\. 패킹 정보'\s*\},\s*\{\s*id:\s*6,\s*label:\s*'🔬 5\. 기술 자료'\s*\}/g,
    `{ id: 1, label: '📋 1. 상품 스펙 및 패킹/기술자료' },\n                { id: 2, label: '💰 2. 공급 유통사 및 단가 이력' }`
  );

  // 2. 각 탭의 활성 조건을 1번과 2번에 매핑되게 변경하여 자연스럽게 하단 노출
  // 3번 탭(가격) -> 2번 탭에 병합
  content = content.replace(/activeTab === 3 && \(/g, 'activeTab === 2 && (');
  
  // 4번 탭(패킹) -> 1번 탭에 병합
  content = content.replace(/activeTab === 4 && \(/g, 'activeTab === 1 && (');

  // 6번 탭(기술자료) -> 1번 탭에 병합
  content = content.replace(/activeTab === 6 && \(/g, 'activeTab === 1 && (');

  fs.writeFileSync(pmPath, content, 'utf8');
  console.log('✅ ProductModal.tsx consolidated into 2 tabs cleanly (v6 condition-mapping).');
} else {
  console.log('❌ ProductModal.tsx not found');
}
