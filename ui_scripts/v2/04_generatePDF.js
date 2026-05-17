// 1. 현재 화면에 표시된 PI 데이터를 모읍니다.
const piData = {{ query_get_pi.data[0] }};
const customerData = {{ query_get_customer.data[0] }};
const lineItems = {{ query_get_line_items.data }};

// 2. AntiGravity의 PDF 생성 유틸리티를 호출하여 HTML 템플릿에 데이터를 주입합니다.
// (템플릿은 05_pdfTemplate.html 의 내용을 사용)
const pdfFile = await {{ utils.generatePdf({
  template: '{{ HTML_Template_Component.value }}', // 또는 템플릿 코드 직접 입력
  data: {
    piData: piData,
    customerData: customerData,
    lineItems: lineItems.map((item, index) => ({...item, '@index_plus_1': index + 1}))
  },
  filename: `Proforma_Invoice_${piData.pi_number}.pdf`,
  margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
}) }};

// 3. 브라우저에서 다운로드 실행
{{ utils.downloadFile(pdfFile, `Proforma_Invoice_${piData.pi_number}.pdf`, 'pdf') }};
