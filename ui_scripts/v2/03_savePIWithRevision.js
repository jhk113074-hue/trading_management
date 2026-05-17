// Step 1: PI 기본 정보 저장 (트리거로 인해 pi_number 자동 생성됨)
const piResult = await {{ query_insert_pi_v2.trigger({
  additionalScope: {
    company_id: '{{ currentCompanyId }}',
    customer_id: '{{ Dropdown_Customer.value }}',
    pi_date: '{{ DatePicker_PIDate.value }}',
    incoterms: '{{ Dropdown_Incoterms.value }}',
    destination_port: '{{ Input_Destination.value }}',
    payment_terms: '{{ Dropdown_PaymentTerms.value }}',
    exchange_rate: '{{ Input_ExchangeRate.value }}',
    default_profit_margin: '{{ Input_DefaultMargin.value }}',
    subtotal_usd: '{{ Text_Subtotal.value }}',
    freight_charges: '{{ Input_Freight.value }}',
    insurance_charges: '{{ Input_Insurance.value }}',
    total_usd: '{{ Text_GrandTotal.value }}'
  }
}) }};

const newPiId = piResult[0].pi_id;

// Step 2: 초기 Revision 'A' 생성
const revisionResult = await {{ query_insert_revision.trigger({
  additionalScope: {
    company_id: '{{ currentCompanyId }}',
    pi_id: newPiId,
    version: 'A',
    revision_number: 1,
    subtotal_usd: '{{ Text_Subtotal.value }}',
    total_usd: '{{ Text_GrandTotal.value }}',
    status: 'draft'
  }
}) }};

const newRevisionId = revisionResult[0].pr_id;

// Step 3: Revision Line Items 저장
const lineItems = {{ state_lineItems.value }};
for (let i = 0; i < lineItems.length; i++) {
  const item = lineItems[i];
  await {{ query_insert_revision_line.trigger({
    additionalScope: {
      company_id: '{{ currentCompanyId }}',
      pi_revision_id: newRevisionId,
      product_id: item.product_id,
      description: item.description,
      cost_krw: item.cost_krw,
      quantity: item.quantity,
      unit: item.unit,
      exchange_rate: '{{ Input_ExchangeRate.value }}',
      profit_margin: item.profit_margin,
      sale_price_usd: item.sale_price_usd,
      line_total_usd: (item.sale_price_usd * item.quantity)
    }
  }) }};
}

{{ utils.showNotification({ title: '완료', description: `PI 및 Revision A 저장 완료!`, type: 'success' }) }};
{{ utils.openUrl(`/pi-detail/${newPiId}`) }};
