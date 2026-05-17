// 선택한 상품의 매입 원가 정보를 가져옵니다. (임시로 하드코딩된 예시이거나 DB 조회)
const selectedProductId = {{ Dropdown_Product.value }};
const currentExchangeRate = parseFloat({{ Input_ExchangeRate.value }}) || 1468.96;
const defaultMargin = parseFloat({{ Input_ProfitMargin.value }}) / 100 || 0.10; // 10%

// DB에서 product_id로 cost_master 조회 (AntiGravity 쿼리 연동)
const productCostData = {{ query_cost_master.data }}.find(p => p.product_id === selectedProductId);

if (productCostData) {
  const costKrw = parseFloat(productCostData.cost_krw);
  const costUsd = costKrw / currentExchangeRate;
  const salePriceUsd = costUsd / (1 - defaultMargin);
  
  // 현재 추가하려는 라인 아이템 폼에 값 자동 세팅
  {{ form_newLine.setValue({
    ...form_newLine.value,
    cost_krw: costKrw,
    cost_usd: costUsd.toFixed(4),
    sale_price_usd: salePriceUsd.toFixed(4)
  }) }};
}
