import codecs

file_path = "e:/무역관리프로그램/dashboard/products.html"

with codecs.open(file_path, 'r', 'utf-8') as f:
    content = f.read()

old_toolbar = """    <!-- Toolbar -->
    <div class="toolbar">
      <div class="search-box">
        <span>🔍</span>
        <input type="text" id="search_input" placeholder="상품명(한글/영문), 상품코드, 공급업체 검색..." oninput="filterProducts()">
      </div>
      <select class="filter" id="cat_filter" onchange="filterProducts()">
        <option value="">전체 대분류</option>
        <option>Carbon Fiber</option>
        <option>Epoxy Resin</option>
        <option>Aramid Paper</option>
      </select>
      <select class="filter" id="curr_filter" onchange="filterProducts()">
        <option value="">전체 통화</option>
        <option>USD</option>
        <option>KRW</option>
        <option>EUR</option>
      </select>
      <span class="result-count" id="result_count">총 0건</span>
    </div>"""

new_toolbar = """    <!-- Toolbar -->
    <div class="toolbar">
      <div class="search-box">
        <span>🔍</span>
        <input type="text" id="search_input" placeholder="상품명(한글/영문), 상품코드, 공급업체 검색..." oninput="renderProducts()">
      </div>
      <select class="filter" id="cat_large_filter" onchange="renderProducts()">
        <option value="">전체 대분류</option>
      </select>
      <select class="filter" id="cat_medium_filter" onchange="renderProducts()">
        <option value="">전체 중분류</option>
      </select>
      <select class="filter" id="curr_filter" onchange="renderProducts()">
        <option value="">전체 통화</option>
        <option>USD</option>
        <option>KRW</option>
        <option>EUR</option>
      </select>
      <span class="result-count" id="result_count">총 0건</span>
    </div>"""

content = content.replace(old_toolbar, new_toolbar)

old_thead = """          <thead>
            <tr>
              <th>상품코드</th>
              <th>상품명 (한글/영문)</th>
              <th>카테고리</th>
              <th>구매 단가 / MOQ</th>
              <th>공급업체 (공급코드)</th>
              <th>규격 / 단위</th>
              <th style="text-align:center">재고 수량</th>
              <th>원산지</th>
              <th style="text-align:right">작업</th>
            </tr>
          </thead>"""

new_thead = """          <thead>
            <tr>
              <th data-sort="productCode" onclick="sortProducts('productCode')" style="cursor:pointer;">상품코드<span class="sort-icon"> ⇅</span></th>
              <th data-sort="nameKo" onclick="sortProducts('nameKo')" style="cursor:pointer;">상품명 (한글/영문)<span class="sort-icon"> ⇅</span></th>
              <th data-sort="categoryLarge" onclick="sortProducts('categoryLarge')" style="cursor:pointer;">카테고리<span class="sort-icon"> ⇅</span></th>
              <th data-sort="purchasePrice" onclick="sortProducts('purchasePrice')" style="cursor:pointer;">구매 단가 / MOQ<span class="sort-icon"> ⇅</span></th>
              <th data-sort="supplierName" onclick="sortProducts('supplierName')" style="cursor:pointer;">공급업체 (공급코드)<span class="sort-icon"> ⇅</span></th>
              <th data-sort="specWidth" onclick="sortProducts('specWidth')" style="cursor:pointer;">규격 / 단위<span class="sort-icon"> ⇅</span></th>
              <th data-sort="stockQty" onclick="sortProducts('stockQty')" style="cursor:pointer;text-align:center;">재고 수량<span class="sort-icon"> ⇅</span></th>
              <th data-sort="origin" onclick="sortProducts('origin')" style="cursor:pointer;">원산지<span class="sort-icon"> ⇅</span></th>
              <th style="text-align:right">작업</th>
            </tr>
          </thead>"""

content = content.replace(old_thead, new_thead)

resizer_script = """
    function initResizableColumns() {
      const cols = document.querySelectorAll('th');
      cols.forEach(col => {
        if(col.querySelector('.resizer')) return;
        const resizer = document.createElement('div');
        resizer.classList.add('resizer');
        col.appendChild(resizer);
        
        let x = 0;
        let w = 0;
        const mouseDownHandler = function(e) {
          e.stopPropagation();
          x = e.clientX;
          const styles = window.getComputedStyle(col);
          w = parseInt(styles.width, 10);
          document.addEventListener('mousemove', mouseMoveHandler);
          document.addEventListener('mouseup', mouseUpHandler);
          resizer.classList.add('resizing');
        };
        const mouseMoveHandler = function(e) {
          const dx = e.clientX - x;
          col.style.width = `${w + dx}px`;
        };
        const mouseUpHandler = function() {
          resizer.classList.remove('resizing');
          document.removeEventListener('mousemove', mouseMoveHandler);
          document.removeEventListener('mouseup', mouseUpHandler);
        };
        resizer.addEventListener('mousedown', mouseDownHandler);
      });
    }
"""

content = content.replace('window.addEventListener("DOMContentLoaded", () => {', resizer_script + '\n    window.addEventListener("DOMContentLoaded", () => {\n      initResizableColumns();')

resizer_css = """
    th { text-align:left; padding:11px 12px; color:var(--text-muted); font-size:11px; font-weight:600; border-bottom:1px solid var(--border); white-space:nowrap; text-transform:uppercase; letter-spacing:.04em; background:#fafafa; position: relative; }
    .resizer {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 5px;
      cursor: col-resize;
      background-color: transparent;
      z-index: 1;
    }
    .resizer:hover, .resizing {
      background-color: var(--accent);
    }
"""
content = content.replace("    th { text-align:left; padding:11px 12px; color:var(--text-muted); font-size:11px; font-weight:600; border-bottom:1px solid var(--border); white-space:nowrap; text-transform:uppercase; letter-spacing:.04em; background:#fafafa; }", resizer_css)

with codecs.open(file_path, 'w', 'utf-8') as f:
    f.write(content)
print("Updated successfully")
