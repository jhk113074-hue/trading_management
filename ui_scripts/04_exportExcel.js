// 현재 화면의 상태(state)에 있는 PI 라인 아이템 데이터를 가져옵니다.
const lineItems = {{ state_lineItems.value }};
const piNumber = '{{ Text_PINumber.value }}' || 'Draft';

// 내보낼 데이터를 보기 좋게 가공합니다.
const exportData = lineItems.map(item => {
  return {
    "Product": item.product,
    "Spec": item.spec,
    "Unit Price (USD)": item.price,
    "Quantity": item.quantity,
    "Unit": item.unit,
    "Total Amount (USD)": item.price * item.quantity,
    "Remark": item.remark
  };
});

// AntiGravity(또는 내장 유틸리티)에서 제공하는 엑셀 다운로드 함수를 실행합니다.
{{ utils.downloadFile(exportData, `Proforma_Invoice_${piNumber}`, 'xlsx') }};
