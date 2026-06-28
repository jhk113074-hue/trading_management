const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const pmPath = path.join(rootDir, 'app', 'src', 'components', 'ProductModal.tsx');

if (fs.existsSync(pmPath)) {
  let content = fs.readFileSync(pmPath, 'utf8').replace(/\r\n/g, '\n');

  // 중괄호 짝(brace matching)을 찾아 범위(index)를 반환하는 함수
  function getBraceBlockRange(text, startKeyword) {
    const keywordIndex = text.indexOf(startKeyword);
    if (keywordIndex === -1) return null;
    
    // 키워드 뒤의 첫 번째 '{' 찾기
    const openBraceIndex = text.indexOf('{', keywordIndex);
    if (openBraceIndex === -1) return null;
    
    let depth = 1;
    let idx = openBraceIndex + 1;
    while (depth > 0 && idx < text.length) {
      const char = text[idx];
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
      }
      idx++;
    }
    
    if (depth === 0) {
      return {
        start: openBraceIndex,
        end: idx // } 다음 인덱스
      };
    }
    return null;
  }

  // 1. 탭 리스트 배열 수정 (622~628 라인 부근)
  // {[ ... ]}.map(tab => ( ... )) 부분 정밀 대체
  const oldTabOptions = `            {[
                { id: 1, label: '📑 1. 기본 정보' },
                { id: 2, label: '🏭 2. 공급 유통망' },
                { id: 3, label: '💰 3. 가격(단가) 관리' },
                { id: 4, label: '📦 4. 패킹 정보' },
                { id: 6, label: '🔬 5. 기술 자료' },
            ]`;
  
  if (content.includes(oldTabOptions)) {
    content = content.replace(oldTabOptions, `            {[
                { id: 1, label: '📋 1. 상품 스펙 및 패킹/기술자료' },
                { id: 2, label: '💰 2. 공급 유통사 및 단가 이력' }
            ]`);
  } else {
    // 혹시 줄바꿈이 다른 경우 정규식으로 대응
    content = content.replace(/\{\s*id:\s*1,\s*label:\s*'📑 1\. 기본 정보'[\s\S]*?'🔬 5\. 기술 자료'\s*\}/g, `{ id: 1, label: '📋 1. 상품 스펙 및 패킹/기술자료' },\n                { id: 2, label: '💰 2. 공급 유통사 및 단가 이력' }`);
  }

  // 2. 탭 블록 추출
  const range1 = getBraceBlockRange(content, 'activeTab === 1 &&');
  const range2 = getBraceBlockRange(content, 'activeTab === 2 &&');
  const range3 = getBraceBlockRange(content, 'activeTab === 3 &&');
  const range4 = getBraceBlockRange(content, 'activeTab === 4 &&');
  const range6 = getBraceBlockRange(content, 'activeTab === 6 &&');

  if (range1 && range2 && range3 && range4 && range6) {
    // 각 블록의 실제 JSX 텍스트 추출 (여는 { 와 닫는 } 제외한 내부 내용)
    // `{activeTab === 1 && (\n  <>\n    ...\n  </>\n)}` 형태에서
    // `activeTab === 1 && (\n  <>\n    ...\n  </>\n)` 를 확보
    const tab1JSX = content.substring(range1.start + 1, range1.end - 1);
    const tab2JSX = content.substring(range2.start + 1, range2.end - 1);
    const tab3JSX = content.substring(range3.start + 1, range3.end - 1);
    const tab4JSX = content.substring(range4.start + 1, range4.end - 1);
    const tab6JSX = content.substring(range6.start + 1, range6.end - 1);

    // 내부 JSX에서 프래그먼트(<></>) 내부만 안전하게 발라냅니다.
    // `<>\n ... \n</>` 에서 `...` 만 추출
    function extractFragmentInner(jsxText) {
      const openFrag = jsxText.indexOf('<>');
      const closeFrag = jsxText.lastIndexOf('</>');
      if (openFrag !== -1 && closeFrag !== -1) {
        return jsxText.substring(openFrag + 2, closeFrag).trim();
      }
      return jsxText.trim();
    }

    const tab1Inner = extractFragmentInner(tab1JSX);
    const tab2Inner = extractFragmentInner(tab2JSX);
    const tab3Inner = extractFragmentInner(tab3JSX);
    const tab4Inner = extractFragmentInner(tab4JSX);
    const tab6Inner = extractFragmentInner(tab6JSX);

    // 새 탭 1 조합
    const nextTab1 = `{activeTab === 1 && (
              <>
                ${tab1Inner}
                
                {/* 📦 4. 패킹 정보 통합 */}
                <div style={{ marginTop: '28px', borderTop: '2px dashed #e2e8f0', paddingTop: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '16px' }}>📦</span>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', margin: 0 }}>포장 및 팰릿 스펙 관리</h4>
                  </div>
                  ${tab4Inner}
                </div>
                
                {/* 🔬 5. 기술 자료 통합 */}
                <div style={{ marginTop: '28px', borderTop: '2px dashed #e2e8f0', paddingTop: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '16px' }}>🔬</span>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', margin: 0 }}>기술 자료 및 인증서 파일</h4>
                  </div>
                  ${tab6Inner}
                </div>
              </>
            )}`;

    // 새 탭 2 조합
    const nextTab2 = `{activeTab === 2 && (
              <>
                ${tab2Inner}
                
                {/* 💰 3. 가격(단가) 관리 통합 */}
                <div style={{ marginTop: '28px', borderTop: '2px dashed #cbd5e1', paddingTop: '24px' }}>
                  ${tab3Inner}
                </div>
              </>
            )}`;

    // 문자열 치환 시 인덱스 변화를 피하기 위해 뒤에 있는 블록부터 역순으로 치환/제거 진행
    // 정렬: range6, range4, range3, range2, range1
    const ranges = [
      { name: 'tab6', range: range6, replaceWith: '' },
      { name: 'tab4', range: range4, replaceWith: '' },
      { name: 'tab3', range: range3, replaceWith: '' },
      { name: 'tab2', range: range2, replaceWith: nextTab2 },
      { name: 'tab1', range: range1, replaceWith: nextTab1 }
    ].sort((a, b) => b.range.start - a.range.start);

    let output = content;
    for (const item of ranges) {
      const { start, end } = item.range;
      output = output.substring(0, start) + item.replaceWith + output.substring(end);
    }

    fs.writeFileSync(pmPath, output, 'utf8');
    console.log('✅ ProductModal.tsx consolidated into 2 tabs successfully (v5 depth-parser).');
  } else {
    console.log('❌ Depth parser failed to locate all activeTab blocks. Range status:', {
      tab1: !!range1,
      tab2: !!range2,
      tab3: !!range3,
      tab4: !!range4,
      tab6: !!range6
    });
  }
} else {
  console.log('❌ ProductModal.tsx not found');
}
