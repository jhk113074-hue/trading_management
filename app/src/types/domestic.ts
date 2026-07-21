export interface DomesticTradeItem {
  id: string;
  tradeDate: string;           // 주문일자 (YYYY-MM-DD)
  tradeNo: string;             // 주문번호 (예: DOM-ORD-2026-001)
  companyType: 'YSACC' | 'YS';  // 주체 구분 (YSACC / 영성)
  supplierName: string;        // 국내 매입처 (공급사)
  customerName: string;        // 국내 매출처 (고객사)
  productName: string;         // 품목명
  quantity: number;            // 수량
  unitPriceBuying?: number;    // 매입 단가 (원)
  unitPriceSales?: number;     // 매출 단가 (원)
  buyingAmount: number;        // 총 매입액 (원)
  salesAmount: number;         // 총 매출액 (원)
  margin: number;              // 매출 마진 (salesAmount - buyingAmount)
  marginRate: number;          // 마진율 (%)
  taxInvoiceIssued: boolean;   // 세금계산서 발행 여부
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED'; // 정산/거래 상태 (대기/완료/취소)
  memo?: string;               // 비고
  createdAt: string;
  updatedAt?: string;
}

export interface DomesticQuoteLineItem {
  id: string;
  productName: string;         // 품명 (예: GP525)
  spec?: string;               // 규격 (예: GPPS (25KG/BAG))
  unit?: string;               // 단위 (예: KG, EA, BAG)
  quantity: number;            // 수량
  buyingUnitPrice: number;     // 원가 / 매입 단가 (원)
  targetMarginRate?: number;   // 마진율 (%)
  salesUnitPrice: number;      // 매출 / 견적 단가 (원)
  buyingAmount: number;        // 품목 원가 총액 (quantity * buyingUnitPrice)
  salesAmount: number;         // 품목 견적 총액 (quantity * salesUnitPrice)
  margin: number;              // 품목 예상 마진 (salesAmount - buyingAmount)
  note?: string;               // 비고 (예: 안산 도착도)
}

export interface DomesticQuoteItem {
  id: string;
  quoteDate: string;           // 견적일자 (YYYY-MM-DD)
  quoteNo: string;             // 견적번호 (예: 2026-YSACC-KPI-01)
  revision: number;            // 리비전 차수 (0 = 최초, 1 = Rev 1, 2 = Rev 2...)
  parentQuoteId?: string;      // 이전 리비전 견적 ID
  companyType: 'YSACC' | 'YS';  // 주체 구분 (YSACC / 영성)
  supplierName: string;        // 국내 매입처 (공급처)
  customerName: string;        // 국내 매출처 / 수신 (고객사)
  
  // Header details matching Excel template
  receiverAttention?: string;  // 참조 (예: 민재준 이사님)
  receiverTel?: string;        // 전화번호
  receiverFax?: string;        // FAX
  
  // Product Line Items (다중 품목)
  items: DomesticQuoteLineItem[];
  productName?: string;        // 주요 품목 요약명
  quantity?: number;           // 총 수량 요약

  // Totals
  expectedBuyingAmount: number;// 총 원가/매입액 (원)
  quoteAmount: number;         // 총 견적 금액 (원)
  expectedMargin: number;      // 총 예상 마진 (원)
  expectedMarginRate: number;  // 총 예상 마진율 (%)

  // Terms & Footer matching Excel template
  specialNotes?: string;       // 특고사항
  vatType?: string;            // 부가가치세 (예: 부가가치세(VAT): 별도)
  paymentTerms?: string;       // 결제조건 (예: 선금 30%, 잔금 70%)
  
  // Manager details
  managerTitle?: string;       // 직책 (예: 이사)
  managerName?: string;        // 담당자 (예: 이한중)
  managerContact?: string;     // 연락처 (예: 010-6277-7418)

  status: 'REVIEW' | 'APPROVED' | 'REJECTED'; // 견적 상태 (검토중 / 고객승인 / 반려)
  validUntil?: string;         // 견적 유효기간
  memo?: string;               // 기타 비고
  createdAt: string;
  updatedAt?: string;
}
