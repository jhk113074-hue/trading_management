// 선택한 고객 ID를 가져옵니다. (Dropdown 컴포넌트의 값)
const selectedCustomerId = {{ Dropdown_Customer.value }};

// 전체 고객 데이터 배열에서 해당 고객을 찾습니다.
const customerData = {{ query_customers.data }}.find(c => c.customer_id === selectedCustomerId);

if (customerData) {
  // UI의 다른 컴포넌트(텍스트 인풋 등)에 값을 세팅합니다.
  // (AntiGravity의 상태 관리 방식에 따라 문법이 다를 수 있습니다)
  
  // 예시: 전역 변수나 Form 상태에 저장
  {{ state_piData.setValue({
    ...state_piData.value,
    incoterms: customerData.incoterms,
    destination: customerData.destination,
    payment_terms: customerData.payment_terms,
    delivery_term: customerData.delivery_term,
    validity_term: customerData.validity_term
  }) }};
  
  // 만약 직접 컴포넌트 값을 바꾼다면:
  // {{ Input_Incoterms.setValue(customerData.incoterms) }};
  // {{ Input_Destination.setValue(customerData.destination) }};
}
