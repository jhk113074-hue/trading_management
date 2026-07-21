export interface DomesticTradeItem {
  id: string;
  tradeDate: string;           // 거래일자 (YYYY-MM-DD)
  tradeNo: string;             // 관리번호 (예: DOM-2026-001)
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
