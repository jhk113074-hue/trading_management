const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const pmPath = path.join(rootDir, 'app', 'src', 'components', 'ProductModal.tsx');

if (fs.existsSync(pmPath)) {
  let content = fs.readFileSync(pmPath, 'utf8').replace(/\r\n/g, '\n');

  // 1. activeTab 기본값은 1로 유지하며 탭 정의 헤더를 2개 탭으로 정의
  const oldTabsHeader = `            {[
                { id: 1, label: '📑 1. 기본 정보' },
                { id: 2, label: '🏭 2. 공급 유통망' },
                { id: 3, label: '💰 3. 가격(단가) 관리' },
                { id: 4, label: '📦 4. 패킹 정보' },
                { id: 6, label: '🔬 5. 기술 자료' },
            ].map(tab => (`;

  const newTabsHeader = `            {[
                { id: 1, label: '📋 1. 상품 스펙 및 패킹/기술자료' },
                { id: 2, label: '💰 2. 공급 유통사 및 단가 이력' }
            ].map(tab => (`;

  if (content.includes(oldTabsHeader)) {
    content = content.replace(oldTabsHeader, newTabsHeader);
  }

  // 2. Tab 1 렌더링 구역에 4번(패킹) 및 5번(기술자료) UI를 합치기
  // 기존 Tab 4 (패킹) 및 Tab 5 (기술자료/6번)의 구분 렌더링 블록을 찾기 위해 content 조각 찾기
  // Tab 4 (패킹 정보) 블록:
  // `{activeTab === 4 && ( ... )}` 형태로 작성되어 있을 것입니다.
  // 이 블록을 제거하고, Tab 1 마지막 부분에 이어서 보여주겠습니다.

  // 탭 1의 마지막 부분은 보통 `</>`로 끝납니다. (activeTab === 1 블록의 끝)
  // Let's find:
  // ```
  //             {activeTab === 1 && (
  //               <>
  //                 ...
  //               </>
  //             )}
  // ```
  // 우리는 activeTab === 1 블록 내부의 맨 마지막(기존 </>) 직전에 패킹 정보와 기술 자료의 내용들을 주입하고,
  // 기존 activeTab === 4와 activeTab === 6 블록은 삭제할 것입니다.

  // 4번 탭 (패킹 정보) 구역 내용
  const tab4Start = `            {activeTab === 4 && (`;
  // 6번 탭 (기술 자료) 구역 내용
  const tab6Start = `            {activeTab === 6 && (`;
  // 3번 탭 (가격 관리) 구역 내용
  const tab3Start = `            {activeTab === 3 && (`;

  // 우리는 `ProductModal.tsx`에서 이 구역을 추출하여 Tab 1 또는 Tab 2 안으로 병합하겠습니다.
  // 탭 3은 탭 2 안으로 이관!
}
