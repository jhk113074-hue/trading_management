import os
import re

path = 'app/src/pages/OrderDetail.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Locate the entire `📁 발주서(PO) 통합 보관함` block
start_header = "📁 발주서(PO) 통합 보관함"
start_idx = content.find(start_header)

if start_idx != -1:
    # Go back to find the parent div
    block_start_idx = content.rfind("<div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>", 0, start_idx)
    
    coa_start_idx = content.find("🔬 COA 및 시험성적서 첨부 파일 관리", start_idx)
    coa_parent_div_idx = content.rfind("<div style", start_idx, coa_start_idx)
    
    if block_start_idx != -1 and coa_parent_div_idx != -1:
        block_to_move = content[block_start_idx:coa_parent_div_idx]
        
        # Remove from original place
        content = content[:block_start_idx] + content[coa_parent_div_idx:]
        
        # Find destination: right before `{/* 2) 선적관리 탭 */}`
        dest_marker = "{/* 2) 선적관리 탭 */}"
        dest_idx = content.find(dest_marker)
        
        # Go back to find the closing tag `</>` and `)}`
        insert_idx = content.rfind("</>", 0, dest_idx)
        
        if insert_idx != -1:
            content = content[:insert_idx] + block_to_move + "                " + content[insert_idx:]
            
            with open(path, 'w', encoding='utf-8') as fw:
                fw.write(content)
            print("Move successful!")
        else:
            print("Insert index not found")
    else:
        print("COA parent div not found or block_start_idx not found")
else:
    print("Start header not found")

