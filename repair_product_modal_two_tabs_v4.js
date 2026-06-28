const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const pmPath = path.join(rootDir, 'app', 'src', 'components', 'ProductModal.tsx');

if (fs.existsSync(pmPath)) {
  let content = fs.readFileSync(pmPath, 'utf8').replace(/\r\n/g, '\n');

  // 라인 줄바꿈 기준으로 split 하여 배열 생성
  const lines = content.split('\n');

  // 1. 탭 네비게이션 헤더 변경 (622~628라인 영역)
  // 622번째 줄 부근의 탭 배열 렌더링 수정
  const tabBtnStartIdx = lines.findIndex(l => l.includes('{[') && l.includes('{ id: 1'));
  const tabBtnEndIdx = lines.findIndex((l, idx) => idx > tabBtnStartIdx && l.includes('].map('));
  
  if (tabBtnStartIdx !== -1 && tabBtnEndIdx !== -1) {
    const nextTabBtns = [
      `            {[`,
      `                { id: 1, label: '📋 1. 상품 스펙 및 패킹/기술자료' },`,
      `                { id: 2, label: '💰 2. 공급 유통사 및 단가 이력' }`,
      `            ].map(tab => (`
    ];
    lines.splice(tabBtnStartIdx, tabBtnEndIdx - tabBtnStartIdx + 1, ...nextTabBtns);
  }

  // 변경된 라인을 다시 문자열로 합쳐서 정밀 위치 분석
  content = lines.join('\n');

  // 2. 탭 컨텐츠 추출을 위해 각 activeTab 조건 블록 정밀 매칭
  // Tab 1: {activeTab === 1 && ( <> ... </> )}
  // Tab 2: {activeTab === 2 && ( <> ... </> )}
  // Tab 3: {activeTab === 3 && ( <> ... </> )}
  // Tab 4: {activeTab === 4 && ( <> ... </> )}
  // Tab 6: {activeTab === 6 && ( <> ... </> )}

  // 각 탭의 구체적인 소스코드를 캡쳐
  const tab1Match = content.match(/\{activeTab\s*===\s*1\s*&&\s*\(\s*<>\s*([\s\S]*?)\s*<>\s*\)\}/);
  const tab2Match = content.match(/\{activeTab\s*===\s*2\s*&&\s*\(\s*<>\s*([\s\S]*?)\s*<>\s*\)\}/);
  const tab3Match = content.match(/\{activeTab\s*===\s*3\s*&&\s*\(\s*<>\s*([\s\S]*?)\s*<>\s*\)\}/);
  const tab4Match = content.match(/\{activeTab\s*===\s*4\s*&&\s*\(\s*<>\s*([\s\S]*?)\s*<>\s*\)\}/);
  const tab6Match = content.match(/\{activeTab\s*===\s*6\s*&&\s*\(\s*<>\s*([\s\S]*?)\s*<>\s*\)\}/);

  if (tab1Match && tab2Match && tab3Match && tab4Match && tab6Match) {
    const tab1Inner = tab1Match[1];
    const tab2Inner = tab2Match[1];
    const tab3Inner = tab3Match[1];
    const tab4Inner = tab4Match[1];
    const tab6Inner = tab6Match[1];

    // 통합 Tab 1: 기존 Tab 1 + 기존 Tab 4 + 기존 Tab 6 (구분선(hr) 또는 마진으로 분리)
    const integratedTab1 = `
            {activeTab === 1 && (
              <>
                ${tab1Inner}
                
                {/* 📦 패킹 정보 통합 */}
                <div style={{ marginTop: '24px', borderTop: '1px dashed #cbd5e1', paddingTop: '20px' }}>
                  ${tab4Inner}
                </div>
                
                {/* 🔬 기술 자료 통합 */}
                <div style={{ marginTop: '24px', borderTop: '1px dashed #cbd5e1', paddingTop: '20px' }}>
                  ${tab6Inner}
                </div>
              </>
            )}`;

    // 통합 Tab 2: 기존 Tab 2 + 기존 Tab 3 (구분선으로 분리)
    const integratedTab2 = `
            {activeTab === 2 && (
              <>
                ${tab2Inner}
                
                {/* 💰 가격(단가) 관리 통합 */}
                <div style={{ marginTop: '24px', borderTop: '1px dashed #cbd5e1', paddingTop: '20px' }}>
                  ${tab3Inner}
                </div>
              </>
            )}`;

    // 기존의 모든 activeTab 1, 2, 3, 4, 6 블록을 정규표현식으로 완전히 대체/지우기
    let newContent = content;
    // 먼저 activeTab === 1 블록을 통합 Tab 1로 치환
    newContent = newContent.replace(/\{activeTab\s*===\s*1\s*&&\s*\([\s\S]*?\)\}/, integratedTab1);
    // 그 다음 activeTab === 2 블록을 통합 Tab 2로 치환
    newContent = newContent.replace(/\{activeTab\s*===\s*2\s*&&\s*\([\s\S]*?\)\}/, integratedTab2);
    // 구 activeTab === 3 블록 제거
    newContent = newContent.replace(/\{activeTab\s*===\s*3\s*&&\s*\([\s\S]*?\)\}/g, '');
    // 구 activeTab === 4 블록 제거
    newContent = newContent.replace(/\{activeTab\s*===\s*4\s*&&\s*\([\s\S]*?\)\}/g, '');
    // 구 activeTab === 6 블록 제거
    newContent = newContent.replace(/\{activeTab\s*===\s*6\s*&&\s*\([\s\S]*?\)\}/g, '');

    fs.writeFileSync(pmPath, newContent, 'utf8');
    console.log('✅ ProductModal.tsx consolidated into 2 tabs perfectly (v4).');
  } else {
    console.log('❌ Failed to capture all tab inner blocks. Matches status:', {
      tab1: !!tab1Match,
      tab2: !!tab2Match,
      tab3: !!tab3Match,
      tab4: !!tab4Match,
      tab6: !!tab6Match
    });
  }
} else {
  console.log('❌ ProductModal.tsx not found');
}
