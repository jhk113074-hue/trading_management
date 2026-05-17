// 1. Subtotal 계산
// 상품 테이블의 데이터 소스 (예: state_lineItems)
const lineItems = {{ state_lineItems.value }};

let subtotal = 0;
lineItems.forEach(item => {
  // 가격 * 수량 계산 (소수점 고려)
  const itemTotal = (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0);
  subtotal += itemTotal;
});

// UI에 표시할 합계 업데이트
{{ Text_Subtotal.setValue(subtotal.toFixed(2)) }};
{{ Text_Total.setValue(subtotal.toFixed(2)) }}; // 현재는 Subtotal과 Total이 동일
