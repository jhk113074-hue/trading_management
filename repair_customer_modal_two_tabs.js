const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const cmPath = path.join(rootDir, 'app', 'src', 'components', 'CustomerModal.tsx');

if (fs.existsSync(cmPath)) {
  let content = fs.readFileSync(cmPath, 'utf8').replace(/\r\n/g, '\n');

  // 1. 탭 버튼 리스트를 3개에서 2개로 축소 및 명칭 변경
  const oldTabOptions = `          {[
            { id: 'basic', label: '📋 1. 기본 회사 정보' },
            { id: 'finance', label: '🏦 2. 무역/세무/금융 거래 정보' },
            { id: 'contacts', label: '👥 3. 바이어 담당자 명부 (' + (formData.contacts?.length || 0) + ')' }
          ]`;

  const newTabOptions = `          {[
            { id: 'basic', label: '📋 1. 고객사 및 무역/금융 정보' },
            { id: 'contacts', label: '👥 2. 바이어 담당자 명부 (' + (formData.contacts?.length || 0) + ')' }
          ]`;

  if (content.includes(oldTabOptions)) {
    content = content.replace(oldTabOptions, newTabOptions);
  }

  // 2. finance 탭 조건문을 basic 탭 안으로 매핑하여 하단에 자연스럽게 이어서 보여줌
  content = content.replace(
    `          {/* TAB 2: Shipping / Finance Info */}
          {activeSubTab === 'finance' && (`,
    `          {/* TAB 2: Shipping / Finance Info (integrated into Tab 1) */}
          {activeSubTab === 'basic' && (`
  );

  fs.writeFileSync(cmPath, content, 'utf8');
  console.log('✅ CustomerModal.tsx consolidated into 2 tabs cleanly.');
} else {
  console.log('❌ CustomerModal.tsx not found');
}
