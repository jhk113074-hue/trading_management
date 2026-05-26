import re

file_path = "e:/무역관리프로그램/dashboard/products.html"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix search input
content = re.sub(r'oninput="filterProducts\(\)"', 'oninput="renderProducts()"', content)

# Fix filters
content = re.sub(r'<select class="filter" id="cat_filter" onchange="filterProducts\(\)">[\s\S]*?</select>',
                 '<select class="filter" id="cat_large_filter" onchange="renderProducts()">\n        <option value="">전체 대분류</option>\n      </select>\n      <select class="filter" id="cat_medium_filter" onchange="renderProducts()">\n        <option value="">전체 중분류</option>\n      </select>', content)

content = re.sub(r'<select class="filter" id="curr_filter" onchange="filterProducts\(\)">',
                 '<select class="filter" id="curr_filter" onchange="renderProducts()">', content)

# Fix table headers
old_thead = re.search(r'<thead>[\s\S]*?</thead>', content).group(0)

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

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated successfully")
