// Step 1: PI 기본 정보 저장 (SQL 쿼리 실행)
// AntiGravity의 API 액션이나 SQL 쿼리 블록을 호출합니다.
const piResult = await {{ query_insert_pi.trigger({
  additionalScope: {
    company_id: '{{ currentCompanyId }}',
    customer_id: '{{ Dropdown_Customer.value }}',
    pi_date: '{{ DatePicker_PIDate.value }}',
    incoterms: '{{ Input_Incoterms.value }}',
    destination: '{{ Input_Destination.value }}',
    payment_terms: '{{ Input_PaymentTerms.value }}',
    delivery_term: '{{ Input_DeliveryTerm.value }}',
    validity_term: '{{ Input_Validity.value }}',
    subtotal_usd: '{{ Text_Subtotal.value }}',
    total_usd: '{{ Text_Total.value }}'
  }
}) }};

// 생성된 PI의 ID를 받아옵니다.
const newPiId = piResult[0].pi_id;
const newPiNumber = piResult[0].pi_number;

// Step 2: 라인 아이템 저장
const lineItems = {{ state_lineItems.value }};
for (let i = 0; i < lineItems.length; i++) {
  const item = lineItems[i];
  await {{ query_insert_pi_line_item.trigger({
    additionalScope: {
      pi_id: newPiId,
      line_number: i + 1,
      product: item.product,
      spec: item.spec,
      price_usd: item.price,
      quantity: item.quantity,
      unit: item.unit,
      total_usd: (item.price * item.quantity)
    }
  }) }};
}

// Step 3: 성공 메시지 표시 및 이동
{{ utils.showNotification({ title: 'Success', description: `PI-${newPiNumber} saved successfully!`, type: 'success' }) }};

// 페이지 이동 (상세 페이지로)
{{ utils.openUrl(`/pi-detail/${newPiId}`) }};
