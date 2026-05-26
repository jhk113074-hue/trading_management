import re

file_path = "e:/무역관리프로그램/dashboard/products.html"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the entire toolbar
old_toolbar = re.search(r'    <!-- Toolbar -->\s*<div class="toolbar">[\s\S]*?</div>\s*<!-- Table Grid -->', content).group(0)

new_toolbar = """    <!-- Toolbar -->
    <div class="toolbar">
      <div class="search-box">
        <span>🔍</span>
        <input type="text" id="search_input" placeholder="상품명(한글/영문), 상품코드, 공급업체 검색..." onkeydown="if(event.key==='Enter') renderProducts()">
      </div>
      <select class="filter" id="cat_large_filter">
        <option value="">전체 대분류</option>
      </select>
      <select class="filter" id="cat_medium_filter">
        <option value="">전체 중분류</option>
      </select>
      <select class="filter" id="curr_filter">
        <option value="">전체 통화</option>
        <option>USD</option>
        <option>KRW</option>
        <option>EUR</option>
      </select>
      <button class="btn btn-primary" onclick="renderProducts()" style="padding: 9px 16px; margin-left: auto;">조회</button>
      <span class="result-count" id="result_count">총 0건</span>
    </div>

    <!-- Table Grid -->"""

content = content.replace(old_toolbar, new_toolbar)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated toolbar successfully")
