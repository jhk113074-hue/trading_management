const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'app', 'src', 'pages', 'OrderDetail.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

// 1. Find and slice top simulation compare card
const compareHeading = '📦 3D 적재 시뮬레이션 계획 대조 (Planned vs Actual)';
const headingIndex = content.indexOf(compareHeading);

if (headingIndex !== -1) {
  const prevSlice = content.substring(headingIndex - 500, headingIndex);
  const divStartOffset = prevSlice.lastIndexOf('<div style={{ background: \'#f8fafc\'');
  
  if (divStartOffset !== -1) {
    const startIndex = headingIndex - 500 + divStartOffset;
    const endAnchor = '{/* 1단계: 제품별 팔레트화';
    const endIndex = content.indexOf(endAnchor, headingIndex);
    
    if (endIndex !== -1) {
      const blockSlice = content.substring(startIndex, endIndex);
      const lastDivCloseOffset = blockSlice.lastIndexOf('</div>');
      
      if (lastDivCloseOffset !== -1) {
        const actualEndIndex = startIndex + lastDivCloseOffset + 6;
        const targetBlock = content.substring(startIndex, actualEndIndex);
        
        // Remove from content
        content = content.substring(0, startIndex) + '\n\n' + content.substring(actualEndIndex);
        
        // 2. Find Step 3 start index and trace nesting div tags to find its exact end
        const step3StartKey = `{/* Step 3. 3D적재 시뮬레이션 연동 */}`;
        const step3StartIndex = content.indexOf(step3StartKey);
        
        if (step3StartIndex !== -1) {
          // Find the opening div of Step 3
          const postStep3Slice = content.substring(step3StartIndex);
          const firstDivIndex = postStep3Slice.indexOf('<div');
          
          if (firstDivIndex !== -1) {
            let scanPos = step3StartIndex + firstDivIndex;
            let openDivs = 0;
            
            // Loop forward to trace balanced open/close div tags
            while (scanPos < content.length) {
              if (content.substring(scanPos, scanPos + 4) === '<div') {
                openDivs++;
                scanPos += 4;
              } else if (content.substring(scanPos, scanPos + 6) === '</div>') {
                openDivs--;
                scanPos += 6;
                if (openDivs === 0) {
                  // Balanced closing div found!
                  const insertionPoint = scanPos;
                  
                  const cleanBlock = targetBlock.trim();
                  const blockToInsert = `\n\n                      {/* 3D 적재 시뮬레이션 계획 대조 (Planned vs Actual) */}\n                      <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginBottom: '8px', marginTop: '16px' }}>\n` + 
                                        cleanBlock.substring(cleanBlock.indexOf('<h4 style=')) + 
                                        `\n`;
                  
                  content = content.substring(0, insertionPoint) + blockToInsert + content.substring(insertionPoint);
                  fs.writeFileSync(targetPath, content, 'utf8');
                  console.log('✅ Relocation successfully completed via balanced div tracing!');
                  break;
                }
              } else {
                scanPos++;
              }
            }
          } else {
            console.log('❌ Could not find Step 3 opening div.');
          }
        } else {
          console.log('❌ Could not find Step 3 start keyword.');
        }
      }
    }
  }
}
