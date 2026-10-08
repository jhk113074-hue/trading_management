export interface PortalInstruction {
  title: string;
  desc: string;
  badge?: string;
}

export interface PortalFieldStep {
  stepNo: string; // e.g. '01', '02', '03'
  title: string;
  field: string;
  exampleValue: string;
  actionGuide: string;
  required: boolean | '선택' | '자동계산';
}

export interface VisualCallout {
  pin: number;
  title: string;
  targetElement: string;
  description: string;
  actionTip?: string;
}

export interface ScreenMockupConfig {
  screenName: string;
  mockupType: 'order_detail' | 'order_tab_info' | 'order_tab_sourcing' | 'order_tab_shipping' | 'order_tab_customs' | 'order_tab_settlement' | 'pi_form' | 'orders_list' | 'dashboard' | 'approvals' | 'profit' | 'standard';
  callouts: VisualCallout[];
}

export interface PortalTabGuide {
  tabId: string;
  tabName: string;
  tabIcon?: string;
  tabSummary: string;
  screenMockup: ScreenMockupConfig;
  fieldSteps: PortalFieldStep[];
  tips?: string[];
  notices?: string[];
}

export interface PortalGuide {
  id: string;
  path: string; // e.g. '/', '/orders', '/orders/:id'
  matchRegex?: RegExp;
  category: '영업관리' | '구매관리' | '업무관리' | 'DB관리' | '시스템' | '홈/대시보드';
  title: string;
  subtitle: string;
  icon: string;
  summary: string;
  workflow: string[];
  instructions: PortalInstruction[];
  tips: string[];
  notices?: string[];
  relatedPaths?: { label: string; path: string }[];
  lastUpdated: string;
  screenMockup?: ScreenMockupConfig;
  fieldSteps?: PortalFieldStep[];
  tabGuides?: PortalTabGuide[];
}

export const PORTAL_GUIDES: PortalGuide[] = [
  {
    id: 'dashboard',
    path: '/',
    category: '홈/대시보드',
    title: '홈 대시보드 (통합 상황판)',
    subtitle: '전사 무역 현황, 실시간 환율 및 주요 업무 지표 요약',
    icon: '⊞',
    summary: '실시간 서울외환시장 매매기준율, 긴급 처리 업무, 수주/선적 현황 및 주요 경영 지표를 한눈에 모니터링하는 통합 관제 포탈입니다.',
    workflow: [
      '1. 오늘의 기준환율 변동 확인 (USD / EUR / CNY)',
      '2. 긴급/오늘 마감 업무 및 결재 대기 건 점검',
      '3. 진행 중인 수출/수입 선적 진행 현황 체크',
      '4. 미수 채권 및 채무 만기 일정 검토'
    ],
    instructions: [
      {
        title: '실시간 기준환율 위젯 & 차트',
        desc: '상단 환율 바에서 국내 시중은행 고시 실시간 매매기준율, 전일대비(1D), 3일 전 대비(3D) 및 30일 이동평균(MA30)을 확인할 수 있으며, [📊 차트] 버튼 클릭 시 기간별 변동 추이와 T/T 송금/수취 환율을 정밀 분석할 수 있습니다.',
        badge: '실시간'
      },
      {
        title: '아이젠하워 중요도/긴급도 매트릭스',
        desc: '오늘 처리해야 할 업무를 Q1(긴급+중요), Q2(중요), Q3(긴급), Q4(일반) 사분면으로 분류하여 업무 우선순위를 즉시 파악하고 카드를 드래그하여 상태를 변경합니다.',
        badge: '업무관리'
      },
      {
        title: '신규 업무 등록 & 바로가기',
        desc: '상단 우측 [+ 새 업무 등록] 버튼을 눌러 담당자 지정, 마감일, 관련 프로젝트(주문/견적)를 연결하여 업무를 등록할 수 있습니다.',
        badge: '등록'
      }
    ],
    tips: [
      '상단 기준환율 위젯의 🔄 버튼을 누르면 즉시 최신 환율 데이터를 다시 조회합니다.',
      '알림 센터(🔔)에서 나에게 위임된 업무 및 결재 요청 내역을 실시간 사운드와 함께 확인할 수 있습니다.'
    ],
    screenMockup: {
      screenName: '홈 대시보드 (통합 상황판)',
      mockupType: 'dashboard',
      callouts: [
        {
          pin: 1,
          title: '서울외환시장 실시간 기준환율 바 & 차트',
          targetElement: '상단 [💵 기준환율] 위젯',
          description: '국내 시중은행 고시 실시간 매매기준율, 전일대비(1D), 3일전 대비(3D), 30일 이동평균(MA30) 및 [📊 차트] 분석을 원클릭으로 조회합니다.'
        },
        {
          pin: 2,
          title: '+ 새 업무 등록 버튼',
          targetElement: '상단 우측 [+ 새 업무 등록] 버튼',
          description: '오늘 해야 할 긴급 업무나 프로젝트를 즉시 등록하고 담당자 지정 및 중요도/긴급도를 설정합니다.'
        },
        {
          pin: 3,
          title: 'Q1 긴급/중요 아이젠하워 매트릭스',
          targetElement: '대시보드 Q1 적색 카드 영역',
          description: '오늘 반드시 마감해야 할 통관 서류, 선적 일정, 결재 건을 한눈에 파악하고 카드를 클릭하여 즉시 업무를 처리합니다.'
        }
      ]
    },
    fieldSteps: [
      {
        stepNo: '01',
        title: '실시간 환율 점검 & 트랜드 확인',
        field: 'USD, EUR, CNY 기준환율 및 1D/3D 변동',
        exampleValue: 'USD ₩1,361.3 (▼ -10.9)',
        actionGuide: '상단 환율 바를 확인하고 [📊 차트]를 눌러 최근 30일간의 이동평균 및 T/T 송금 환율을 파악하여 수출입 채산성을 점검합니다.',
        required: true
      },
      {
        stepNo: '02',
        title: 'Q1 오늘 마감 긴급 업무 처리',
        field: 'Q1 (긴급+중요) 사분면 업무 카드',
        exampleValue: 'UNG-01 선적 서류 검수 (D-Day)',
        actionGuide: 'Q1 사분면에 있는 업무 카드를 클릭하여 상세 모달을 열고, 상태를 TODO ➔ DOING ➔ DONE으로 변경하거나 관련 주문으로 이동합니다.',
        required: true
      },
      {
        stepNo: '03',
        title: '신규 프로젝트/업무 생성',
        field: '+ 새 업무 등록 모달',
        exampleValue: '담당자: 김주한 / 중요도: B / 긴급도: 4',
        actionGuide: '우측 상단 [+ 새 업무 등록] 버튼을 눌러 제목, 마감일, 담당자, 중요도/긴급도를 지정하고 연관 주문번호(PO)를 태그합니다.',
        required: '선택'
      }
    ],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'orders-detail',
    path: '/orders/:id',
    category: '영업관리',
    title: '수출 주문 상세 (소싱 / 선적 / 패킹 / 통관 / 원가정산)',
    subtitle: '수주부터 최종 선적, 공급사 발주, 패킹, 도착보고, 통관 및 원가정산까지 전 과정 총괄',
    icon: '📦',
    summary: '주문 상세 정보, 공급사별 소싱 및 발주서(PO), 컨테이너별 패킹리스트, 선적 분할(차수별 선적), 도착보고서 및 쉬핑마크 발행, 통관 서류 및 최종 원가/이익 정산을 수행하는 핵심 업무 포탈입니다.',
    workflow: [
      'Step 1: [수주정보] PI 매칭 및 고객사, 납기, 인코텀즈 확인',
      'Step 2: [소싱/발주] 공급사별 품목 배정 및 발주서(PO) 발행 / 이메일·카톡 발송',
      'Step 3: [소싱/선적] 1차/분할 선적 배정 및 컨테이너 패킹리스트 작성',
      'Step 4: [도착보고/쉬핑마크] 라벨 출력, 미리보기 및 PDF 바로 저장',
      'Step 5: [통관서류/원가] BL일자 기준환율 자동조회 및 원가/이익 최종 정산'
    ],
    instructions: [
      {
        title: '도착보고서 & 쉬핑마크 미리보기 및 PDF 바로 저장 (신규)',
        desc: '공급사별 카드 상단의 [📋 도착보고 미리보기] 및 [🏷️ 쉬핑마크 미리보기]를 통해 화면에서 A4 실제 출력 형태를 즉시 검수할 수 있으며, [📥 PDF 저장] 시 A4 표준 14.5mm 좌우 여백과 상하 균형 레이아웃이 적용된 고화질 PDF로 즉시 다운로드됩니다.',
        badge: 'v2.8.618 최신'
      },
      {
        title: '선적수량 vs 패킹수량 실시간 자동 대조 검증 (Reconciliation)',
        desc: '[소싱/선적] 탭 상단의 [⚖️ 선적수량 vs 패킹수량 대조 검증] 버튼을 누르면 Step 1에서 배정한 선적수량과 Step 2 패킹리스트의 실제 적재 수량을 품목별/세트별로 자동 대조하여 누락(❌), 부족(⚠️), 일치(✅)를 즉시 시각화해 줍니다.',
        badge: '자동 검증'
      },
      {
        title: 'BL 선적일자 기준환율 원클릭 자동 조회 (SMBS)',
        desc: '[통관서류 및 선적 진행현황] 탭에서 선적일자(ETD)를 입력한 후 [⚡ BL일자 기준환율 자동조회]를 누르면 서울외국환중개(SMBS)의 해당일자 매매기준율(주말/공휴일인 경우 직전 영업일 환율 자동 반영)을 원클릭으로 불러와 Firestore에 영구 저장합니다.',
        badge: '환율 연동'
      },
      {
        title: '발주서 입고요청일 "추후통보" 원클릭 설정',
        desc: '납기일이 미정인 경우 [☑ 추후통보] 체크박스를 체크하면 공급사 발주서 카드 및 인쇄/PDF 문서에 "입고요청일: 추후통보"가 자동으로 반영됩니다.',
        badge: '발주 편의'
      },
      {
        title: '다단적재(Stackable) 및 회전허용(Rotation) 자동 저장',
        desc: '패킹리스트 품목별 다단적재(🔼/⛔) 및 회전(🔄/🔒) 토글 버튼을 클릭하면 전체 저장 버튼을 누르지 않아도 즉시 실시간 자동 저장되어 데이터가 영구 보존됩니다.',
        badge: '자동 저장'
      }
    ],
    tips: [
      '패킹리스트에서 수량이 변경된 경우 공급사 카드 상단의 [🔄 패킹리스트 동기화] 버튼을 누르면 도착보고서 테이블에 최신 파렛트/수량이 즉시 업데이트됩니다.',
      '공급사 발주서 발행 후 [메일 발송] 또는 [카톡 발송]을 누르면 원본 링크가 포함된 정형화된 업무 메시지가 클립보드에 복사되거나 메일창이 열립니다.'
    ],
    notices: [
      '인쇄 시 브라우저 설정에 따라 깨짐이 발생할 수 있으므로, 보관용 및 바이어/공급사 전달용 문서는 항상 [📥 PDF 저장] 또는 모달 상단의 [📥 PDF 바로 저장] 기능을 사용해 주세요.'
    ],
    relatedPaths: [
      { label: '수출 주문 목록', path: '/orders' },
      { label: '수출 견적관리 (PI)', path: '/proforma-invoices' },
      { label: '이익관리', path: '/profit-management' }
    ],
    screenMockup: {
      screenName: '수출 주문 상세 (소싱 / 선적 / 패킹 / 도착보고 / 통관 / 원가정산)',
      mockupType: 'order_detail',
      callouts: [
        {
          pin: 1,
          title: '선적수량 vs 패킹수량 자동 대조 검증',
          targetElement: '상단 [⚖️ 선적수량 vs 패킹수량 대조 검증] 버튼',
          description: 'Step 1에서 배정한 선적수량과 Step 2 패킹리스트의 실제 적재 수량을 품목별/세트별로 자동 대조하여 완벽 일치(✅), 부족(⚠️), 미패킹(❌)을 팝업으로 정밀 검증합니다.'
        },
        {
          pin: 2,
          title: '발주서 입고요청일 "추후통보" 체크박스',
          targetElement: '납기일 옆 [☑ 추후통보] 체크박스',
          description: '납기가 미정인 경우 체크하면 공급사 발주서 카드 및 인쇄/PDF 양식에 "입고요청일: 추후통보"로 자동 표기되며 파란색 배지로 강조됩니다.'
        },
        {
          pin: 3,
          title: '도착보고서 미리보기 & 도착보고 PDF 저장',
          targetElement: '공급사 카드 상단 [📋 도착보고 미리보기] + [📥 도착보고 PDF 저장]',
          description: '화면에서 실제 A4 출력 형태를 사전 검수할 수 있으며, [📥 도착보고 PDF 저장]을 누르면 A4 표준 14.5mm 여백이 반영된 고화질 PDF로 즉시 다운로드됩니다.'
        },
        {
          pin: 4,
          title: '쉬핑마크 라벨 미리보기 & 쉬핑마크 PDF 저장',
          targetElement: '공급사 카드 상단 [🏷️ 쉬핑마크 미리보기] + [📥 쉬핑마크 PDF 저장]',
          description: '파렛트별 쉬핑마크 라벨을 화면에서 검수한 뒤, [📥 쉬핑마크 PDF 저장] 클릭 한 번으로 가로형 A4 규격 라벨 PDF로 즉시 저장하여 공급사에 전달할 수 있습니다.'
        },
        {
          pin: 5,
          title: '다단적재 & 회전허용 토글 실시간 자동저장',
          targetElement: '패킹 테이블 적재설정 [🔼/⛔], [🔄/🔒]',
          description: '버튼을 클릭하는 즉시 전체 저장 버튼을 누르지 않아도 Firestore에 실시간 자동 동기화되어 영구적으로 보존됩니다.'
        },
        {
          pin: 6,
          title: 'BL일자 기준환율 원클릭 자동 조회 (SMBS)',
          targetElement: '통관 탭 [⚡ BL일자 기준환율 자동조회]',
          description: '선적일자(ETD)를 입력한 뒤 버튼을 누르면 서울외국환중개(SMBS)의 공식 매매기준율(주말/공휴일은 직전 영업일 환율 자동 탐색)을 원클릭으로 불러와 저장합니다.'
        }
      ]
    },
    fieldSteps: [
      {
        stepNo: '01',
        title: '수주 기본정보 & 바이어 확인',
        field: '고객사, 요청 납기일, 인코텀즈',
        exampleValue: 'UNG / 2026-10-31 / FOB BUSAN',
        actionGuide: '[1. 수주정보] 탭에서 고객사명을 선택하고 납기일을 지정합니다. 납기가 미정인 경우 [추후통보] 체크박스를 체크합니다.',
        required: true
      },
      {
        stepNo: '02',
        title: '공급사 소싱 & 매입 단가 입력',
        field: '공급사 선택, 매입단가(KRW/외화)',
        exampleValue: '대한볼트산업 / ₩420 / PCS',
        actionGuide: '[2. 소싱/발주] 탭에서 수주 품목을 생산/공급할 협력사를 지정하고 매입 단가를 기입한 후 [발주서 발행]을 진행합니다.',
        required: true
      },
      {
        stepNo: '03',
        title: '선적 차수 배정 (Step 1)',
        field: '선적 수량 배정 (차수별 분할)',
        exampleValue: '1차 선적: 10,000 PCS (100%)',
        actionGuide: '[3. 소싱/선적] 탭 상단에서 이번에 출하할 선적 수량을 입력합니다. 분할 선적 건은 1차 선적 수량만 배정합니다.',
        required: true
      },
      {
        stepNo: '04',
        title: '패킹리스트 작성 (Step 2)',
        field: '컨테이너, 파렛트(PLT), 중량, 부피',
        exampleValue: '20ft #1 / PLT 1~5번 / G/W 1,320kg',
        actionGuide: '컨테이너를 추가하고 파렛트별 적재 품목, 수량, N/W, G/W를 입력합니다. 다단적재(🔼/⛔), 회전(🔄/🔒) 옵션을 클릭합니다.',
        required: true
      },
      {
        stepNo: '05',
        title: '선적수량 vs 패킹수량 대조 검증',
        field: '수량 대조 검증 모달',
        exampleValue: '배정 10,000 vs 패킹 10,000 (✅ 일치)',
        actionGuide: '상단 [⚖️ 선적수량 vs 패킹수량 대조 검증] 버튼을 눌러 Step 1 배정수량과 Step 2 패킹수량에 누락(❌)이나 부족(⚠️)이 없는지 최종 점검합니다.',
        required: true
      },
      {
        stepNo: '06',
        title: '도착보고서 & 쉬핑마크 발행',
        field: '도착보고서 & 쉬핑마크 라벨 출력',
        exampleValue: '[📋 도착보고 미리보기] / [📥 PDF 저장]',
        actionGuide: '공급사 카드 상단에서 미리보기로 문서를 화면 검수한 후 [📥 PDF 저장]을 눌러 고화질 PDF를 다운로드하여 공급사에 메일/카톡 발송합니다.',
        required: true
      },
      {
        stepNo: '07',
        title: 'B/L 선적일자 & 환율 자동조회',
        field: '선적일자(ETD), B/L 번호, 기준환율',
        exampleValue: 'ETD: 2026-10-15 ➔ ₩1,361.3 / USD',
        actionGuide: '[4. 통관서류] 탭에서 선적일자를 넣고 [⚡ BL일자 기준환율 자동조회]를 눌러 서울외국환중개 공식 환율을 자동 저장합니다.',
        required: true
      },
      {
        stepNo: '08',
        title: '최종 원가 & 마진 정산',
        field: '매출액, 매입비, 운임, 관세사비용, 순이익',
        exampleValue: '매출 $45,000 / 마진율 14.8%',
        actionGuide: '[5. 원가/이익 정산] 탭에서 인보이스 매출액과 제반 매입 원가를 대조하여 최종 공헌이익과 마진율(%)을 확정합니다.',
        required: '자동계산'
      }
    ],
    tabGuides: [
      {
        tabId: 'tab-order-info',
        tabName: '1. 수주정보',
        tabIcon: '📄',
        tabSummary: '바이어(고객사), 요청 납기일, 인코텀즈(FOB/CIF), 결제 조건 및 수주 품목/금액 확인 및 관리',
        screenMockup: {
          screenName: '수출 주문 상세 - [1. 수주정보] 탭 화면',
          mockupType: 'order_tab_info',
          callouts: [
            {
              pin: 1,
              title: '고객사(바이어) 검색 및 선택',
              targetElement: '고객사 입력창 및 [검색] 버튼',
              description: '고객사 DB에서 바이어를 검색하여 선택하면 기본 인코텀즈와 결제조건이 자동으로 채워집니다.'
            },
            {
              pin: 2,
              title: '요청 납기일 & [☑ 추후통보] 체크박스',
              targetElement: '납기일 달력 및 추후통보 체크박스',
              description: '바이어와의 약정 납기일을 입력하거나, 납기가 미정인 경우 [추후통보]를 체크하여 발주서에 자동 연동합니다.'
            },
            {
              pin: 3,
              title: '인코텀즈 & 선적항/도착항',
              targetElement: 'Incoterms 드롭다운 및 Port of Loading/Discharge',
              description: 'FOB, CIF, CFR 등 거래조건과 출항지(BUSAN, INCHEON 등), 도착지를 지정합니다.'
            },
            {
              pin: 4,
              title: '수주 품목 리스트 & 외화 총액',
              targetElement: '수주 품목 테이블 및 합계 금액',
              description: '수주받은 품명, 규격, 수량, 외화 단가 및 총 견적금액을 검토하고 행을 편집합니다.'
            }
          ]
        },
        fieldSteps: [
          {
            stepNo: '01',
            title: '고객사(바이어) 지정',
            field: 'Customer Name, Code, ID',
            exampleValue: 'United Neama Group (UNG)',
            actionGuide: '고객사 검색 모달에서 바이어를 선택합니다. 고객사 기본 인코텀즈와 결제조건이 자동으로 연동됩니다.',
            required: true
          },
          {
            stepNo: '02',
            title: '요청 납기일 설정',
            field: '납기일자 / [☑ 추후통보]',
            exampleValue: '2026-10-31 또는 [추후통보]',
            actionGuide: '달력에서 납기일을 지정합니다. 출하 일정이 미정인 경우 [☑ 추후통보]를 체크하면 발주서 문서에 즉시 반영됩니다.',
            required: true
          },
          {
            stepNo: '03',
            title: '인코텀즈 및 결제조건',
            field: 'Incoterms, Payment Terms',
            exampleValue: 'FOB BUSAN / T/T 30% Advance, 70% B/L Copy',
            actionGuide: '정형거래조건과 대금 지급 방식을 선택합니다.',
            required: true
          },
          {
            stepNo: '04',
            title: '수주 품목 및 단가 확인',
            field: 'Description, Spec, Qty, Unit Price',
            exampleValue: 'HEX BOLT SET M16 / 10,000 PCS @ $0.45',
            actionGuide: '품목별 수량과 단가를 확인하고 변경이 필요한 경우 우측 상단 [수정] 모드에서 수정 후 [저장]합니다.',
            required: true
          }
        ],
        tips: ['PI를 통해 주문을 생성한 경우 수주정보가 100% 자동 채움되므로 내용 검토 후 바로 2번 탭으로 이동하실 수 있습니다.']
      },
      {
        tabId: 'tab-sourcing-po',
        tabName: '2. 소싱/발주',
        tabIcon: '🏭',
        tabSummary: '수주 품목별 공급사(협력사) 배정, 매입 단가 입력 및 공급사 발주서(PO) 발행 / 이메일·카톡 발송',
        screenMockup: {
          screenName: '수출 주문 상세 - [2. 소싱/발주] 탭 화면',
          mockupType: 'order_tab_sourcing',
          callouts: [
            {
              pin: 1,
              title: '수주 품목별 공급사 배정',
              targetElement: '품목 행 내 [공급사] 드롭다운',
              description: '각 품목을 제조/납품할 협력사를 등록된 공급사 목록에서 선택합니다.'
            },
            {
              pin: 2,
              title: '매입 단가 입력 (KRW / 외화)',
              targetElement: '매입단가(Unit Price) 입력란',
              description: '공급사 매입 단가를 기입하면 매입 총액과 예상 원가가 실시간 자동 산출됩니다.'
            },
            {
              pin: 3,
              title: '공급사별 발주서(PO) 발행 버튼',
              targetElement: '공급사 카드 [발주서 발행]',
              description: '공급사별로 배정된 품목만 취합하여 자사 직인이 날인된 정식 발주서 문서를 생성합니다.'
            },
            {
              pin: 4,
              title: '발주서 [메일 발송] & [카톡 발송]',
              targetElement: '공급사 카드 상단 메일/카톡 버튼',
              description: '공급사 담당자에게 발주서 PDF 또는 온라인 열람 링크를 원클릭으로 전송합니다.'
            }
          ]
        },
        fieldSteps: [
          {
            stepNo: '01',
            title: '품목별 제작 공급사 지정',
            field: '공급사(Supplier) 선택',
            exampleValue: '대한볼트산업, 한국와셔공업',
            actionGuide: '품목 테이블 각 행의 공급사 셀렉트박스에서 해당 품목을 납품할 업체를 지정합니다.',
            required: true
          },
          {
            stepNo: '02',
            title: '협력사 매입단가 기입',
            field: '매입단가 (KRW / 외화)',
            exampleValue: '₩420 (VAT 별도)',
            actionGuide: '공급사와 약정한 개당 매입단가를 입력합니다. 공급가 합계액이 자동 계산됩니다.',
            required: true
          },
          {
            stepNo: '03',
            title: '공급사별 발주서 생성',
            field: '하단 공급사 카드 [발주서 발행]',
            exampleValue: 'PO-2026-UNG-01-S01',
            actionGuide: '하단 공급사별 카드에서 [발주서 발행] 버튼을 누르면 발주서 번호와 문서가 자동 생성됩니다.',
            required: true
          },
          {
            stepNo: '04',
            title: '발주서 전송 (메일 / 카톡)',
            field: '[✉️ 메일 발송] / [카톡 발송]',
            exampleValue: '공급사 이메일 및 카톡 클립보드 복사',
            actionGuide: '공급사 카드 우측의 [메일 발송] 또는 [카톡 발송]을 눌러 공급사 담당자에게 발주서를 송부합니다.',
            required: true
          }
        ],
        tips: ['1번 탭에서 [추후통보]로 설정한 경우 발주서 카드 헤더에 [입고요청일: 추후통보] 뱃지가 표시되며 발주서 양식에도 자동 출력됩니다.']
      },
      {
        tabId: 'tab-sourcing-shipping',
        tabName: '3. 소싱/선적 (물류/선적 & 패킹 & 도착보고 & 쉬핑마크)',
        tabIcon: '🚚',
        tabSummary: '선적 차수 배정, 컨테이너 로딩 플랜, 엑셀 수식(=ROUNDUP) CBM/중량 자동연산, 파렛트 합치기/분할, 다단적재/회전 설정 및 3D 적재 시뮬레이션 연동',
        screenMockup: {
          screenName: '수출 주문 상세 - [3. 소싱/선적 ➔ 패킹 및 컨테이너로딩플랜] 화면',
          mockupType: 'order_tab_shipping',
          callouts: [
            {
              pin: 1,
              title: '선적 차수 관리 (1차 선적 / + 분할 선적 추가)',
              targetElement: '상단 선적 차수 선택 영역',
              description: '단일 선적 건은 1차 선적으로 진행하며, 분할 출하인 경우 [+ 분할 선적 추가] 버튼을 눌러 2차, 3차 차수별 출하 일정을 독립 관리합니다. 선택된 차수는 URL(?round=1, ?round=2)에 실시간 동기화되어 새로고침이나 링크 공유 시에도 완벽히 유지됩니다.'
            },
            {
              pin: 2,
              title: '중량 & CBM 엑셀 함수 및 사칙연산 수식 지원',
              targetElement: '노란색 엑셀 수식 안내 바 (ROUNDUP / ROUNDDOWN / ROUND)',
              description: 'NET WT, GROSS WT, CBM 입력창에 `=ROUNDUP(1200 * 1.15, 0)`, `=ROUND(1437.5, 0)`, `=ROUNDDOWN(...)`, `=1.15*1.25*1.28` 등 엑셀 수식을 넣으면 대소문자 무관하게 실시간 자동 연산됩니다.'
            },
            {
              pin: 3,
              title: '컨테이너 번호 & Seal 번호 입력 및 [+ 컨테이너 추가]',
              targetElement: 'Container No & Seal No 입력란',
              description: '포워더로부터 배정받은 컨테이너 식별번호(예: MSCU1234567)와 봉인 씰 번호를 입력합니다. 복수 컨테이너 작업 시 우측 상단 [+ 컨테이너 추가]를 누릅니다.'
            },
            {
              pin: 4,
              title: '파렛트 일괄 조작 버튼 ([🔗 합치기] / [✂️ 분할] / [↩️ 원복])',
              targetElement: '컨테이너 헤더 PALLET 조작 버튼 그룹',
              description: '복수 파렛트를 체크 후 [🔗 PALLET 합치기]를 눌러 1개 파렛트로 혼적하거나, 수량이 큰 파렛트를 [✂️ PALLET 분할]로 쪼갤 수 있으며, 실수 시 [↩️ PALLET 원복]으로 복원합니다.'
            },
            {
              pin: 5,
              title: '규격(WxLxH) 및 다단적재(🔼/⛔), 회전허용(🔄/🔒) 자동저장',
              targetElement: '패킹 테이블 규격 입력란 및 적재설정 토글 버튼',
              description: '파렛트 치수(mm)를 기입하면 CBM이 자동 연동되며, 다단적재(🔼/⛔) 및 회전(🔄/🔒) 토글 버튼을 클릭하면 전체 저장 버튼 없이도 클라우드(Firestore)에 즉시 실시간 자동 저장됩니다.'
            },
            {
              pin: 6,
              title: '실시간 CBM 및 중량 합계 집계 (fx 수식 표기)',
              targetElement: '패킹 테이블 CBM/중량 열 및 하단 합계 바',
              description: '각 파렛트별로 계산 수식(fx: =ROUNDUP...)과 함께 결과값이 자동 산출되며, 하단 합계 행에 총 항목 수, 총 수량, 총 PKG수, 총 중량(N/W, G/W), 총 CBM이 실시간 집계됩니다.'
            },
            {
              pin: 7,
              title: '전체 및 컨테이너별 엑셀 다운로드 / 업로드',
              targetElement: '[📊 전체 엑셀 다운로드], [📥 전체 엑셀 업로드]',
              description: '대량의 패킹 데이터를 엑셀 파일로 일괄 내려받아 오프라인에서 편집한 후 다시 업로드하여 한 번에 수십 개의 파렛트 정보를 동기화할 수 있습니다.'
            },
            {
              pin: 8,
              title: 'Step 3. [🚚 3D적재 시뮬레이션 연동 및 적재 검토 실행]',
              targetElement: '하단 Step 3. 3D적재 시뮬레이션 연동 영역',
              description: '버튼을 클릭하면 패킹리스트의 컨테이너 규격과 파렛트 치수/중량/적재옵션이 3D 적재 시뮬레이터 프로그램으로 자동 전달되어 최적의 적재율과 컨테이너 밸런스를 3D 그래픽으로 시각화 검증합니다.'
            },
            {
              pin: 9,
              title: '패킹플랜 ➔ 도착보고 상관관계 & [🔄 패킹리스트 동기화]',
              targetElement: '서브탭 [도착보고] 및 공급사 카드 헤더',
              description: '[패킹 및 컨테이너로딩플랜]에서 입력한 Supplier(유통사), Pallet No, 수량, 치수, 중량은 [도착보고] 탭의 공급사별 도착보고서 및 쉬핑마크 라벨의 원천 데이터(Source of Truth)가 됩니다. 패킹 데이터 수정 시 공급사 카드의 [🔄 패킹리스트 동기화]를 누르면 최신 내용으로 즉시 재집계됩니다.'
            }
          ]
        },
        fieldSteps: [
          {
            stepNo: '01',
            title: '선적 차수 선택 및 분할 추가',
            field: '1차 선적 / [+ 분할 선적 추가]',
            exampleValue: '1차 선적 (2026-10-04)',
            actionGuide: '출하할 선적 차수를 선택합니다. 1차 출하 후 잔여 수량이 있을 경우 [+ 분할 선적 추가]를 눌러 2차 선적 일정을 생성합니다.',
            required: true
          },
          {
            stepNo: '02',
            title: '컨테이너 식별정보(No, Seal No) 입력',
            field: 'Container No, Seal No',
            exampleValue: 'MSCU1234567 / ML-KR98765',
            actionGuide: '선사/포워더로부터 전달받은 컨테이너 일련번호와 봉인 씰 번호를 입력합니다. 필요 시 우측 [+ 컨테이너 추가]를 누릅니다.',
            required: true
          },
          {
            stepNo: '03',
            title: '파렛트 품명 확인 및 공급사 지정 (도착보고 분류 기준)',
            field: 'Description of Goods / Supplier [✏️]',
            exampleValue: '[P0043] Fibre Glass Cloth / 주식회사 메디치인터내셔널',
            actionGuide: '적재할 품목의 영문 품명을 확인하고, [✏️] 버튼을 눌러 해당 파렛트 물품을 납품한 협력사를 지정합니다. 이 지정값에 따라 [도착보고] 공급사 카드가 자동 생성됩니다.',
            required: true
          },
          {
            stepNo: '04',
            title: '수량, PKG수 및 규격(WxLxH) 기재',
            field: '수량, PKG수, 규격(WxLxH mm)',
            exampleValue: '1,000 PCS / 1 PLT / 1150 x 1250 x 1280 mm',
            actionGuide: '파렛트당 적재 수량과 포장 수량을 입력하고, 가로x세로x높이(mm) 치수를 넣으면 CBM이 실시간 자동 연산됩니다.',
            required: true
          },
          {
            stepNo: '05',
            title: '다단적재(Stackable) 및 회전허용(Rotation) 설정',
            field: '다단적재 [🔼/⛔], 회전허용 [🔄/🔒]',
            exampleValue: '🔼 다단적재 허용 / 🔄 회전 허용',
            actionGuide: '화물의 파손 위험 여부에 따라 버튼을 클릭합니다. 클릭 즉시 클라우드에 자동 저장되어 데이터가 영구 보존됩니다.',
            required: '선택'
          },
          {
            stepNo: '06',
            title: '중량(NET/GROSS WT) 및 CBM 수식 연산',
            field: 'NET WT (Kg), GROSS WT (Kg), CBM',
            exampleValue: '=ROUNDUP(1.15*1.25*1.28, 3) ➔ 1.900 CBM',
            actionGuide: '숫자를 직접 넣거나, 상단 안내처럼 `=ROUNDUP(...)`, `=ROUND(...)`, `=ROUNDDOWN(...)`, 사칙연산 수식을 작성하여 자동 계산합니다.',
            required: true
          },
          {
            stepNo: '07',
            title: '파렛트 합치기 / 분할 / 원복 조작',
            field: '[🔗 PALLET 합치기] / [✂️ PALLET 분할] / [↩️ 원복]',
            exampleValue: '2개 행 체크 후 [🔗 PALLET 합치기] 클릭',
            actionGuide: '한 파렛트에 여러 품목을 혼적할 때는 체크박스 선택 후 [🔗 PALLET 합치기]를 실행하고, 분할 시 [✂️ PALLET 분할]을 누릅니다.',
            required: '선택'
          },
          {
            stepNo: '08',
            title: 'Step 3. 3D적재 시뮬레이션 연동 및 적재 검토',
            field: '[🚚 3D적재 시뮬레이션 연동 및 적재 검토 실행]',
            exampleValue: '3D 뷰어 검증 ➔ 적재결과 파일 보관',
            actionGuide: '하단 [🚚 3D적재 시뮬레이션 연동] 버튼을 눌러 최적의 적재율, 공간 배치 및 무게 중심을 3D 그래픽으로 시각화 검토합니다.',
            required: '선택'
          },
          {
            stepNo: '09',
            title: '[패킹플랜] ➔ [도착보고] 실시간 상관관계 동기화 & 서류 발행',
            field: '[도착보고] 서브탭 ➔ [📋 도착보고 미리보기] + [🏷️ 쉬핑마크]',
            exampleValue: '도착보고서_주식회사메디치인터내셔널.pdf',
            actionGuide: '패킹플랜 입력 후 [도착보고] 서브탭으로 이동하여 [🔄 패킹리스트 동기화]를 누르면 패킹 데이터가 공급사별 도착보고서 및 쉬핑마크 라벨에 100% 자동 반영되어 [📥 PDF 저장] 또는 메일/카톡으로 즉시 발송할 수 있습니다.',
            required: true
          }
        ],
        tips: [
          '중량과 CBM 필드에는 엑셀처럼 "=ROUNDUP(값, 자릿수)" 형태로 수식을 직접 입력할 수 있으며 소문자(=roundup)로 입력해도 실시간 자동 계산됩니다.',
          '파렛트 적재 설정(다단적재 🔼, 회전 🔄)은 토글 버튼을 클릭하는 즉시 자동 저장되므로 전체 저장 버튼을 누를 필요가 없습니다.',
          '수량이 많아 일괄 작업이 필요할 경우 [📊 전체 엑셀 다운로드]를 받아 엑셀에서 편집 후 [📥 전체 엑셀 업로드]를 이용하시면 매우 편리합니다.',
          '【패킹플랜과 도착보고의 상관관계】: 패킹리스트의 Supplier(유통사)별로 도착보고 카드가 자동 분할 생성되며, Pallet No와 포장 규격/총중량이 공급사 쉬핑마크 라벨로 1:1 직결됩니다. 패킹리스트를 수정한 경우 도착보고 카드 상단의 [🔄 패킹리스트 동기화]를 누르면 언제든 최신 수량이 즉시 재집계됩니다.'
        ],
        notices: [
          '파렛트 규격(WxLxH)을 mm 단위로 정확히 입력해야 3D 적재 시뮬레이션 및 컨테이너 CBM이 오차 없이 정확하게 산출됩니다.'
        ]
      },
      {
        tabId: 'tab-customs-shipping',
        tabName: '4. 통관서류 & 선적 진행현황',
        tabIcon: '⚓',
        tabSummary: 'B/L 선적일자 기준환율 원클릭 자동 조회(SMBS), B/L 번호, C/I & P/L 서류 및 세관 통관 상태 관리',
        screenMockup: {
          screenName: '수출 주문 상세 - [4. 통관서류 & 선적현황] 탭 화면',
          mockupType: 'order_tab_customs',
          callouts: [
            {
              pin: 1,
              title: 'BL일자 기준환율 원클릭 자동 조회 (SMBS)',
              targetElement: '[⚡ BL일자 기준환율 자동조회] 버튼',
              description: '선적일자(ETD)를 입력한 뒤 버튼을 누르면 서울외국환중개(SMBS)의 공식 매매기준율(비영업일은 직전 영업일 환율)을 원클릭으로 동기화합니다.'
            },
            {
              pin: 2,
              title: 'B/L 선하증권 정보 등록',
              targetElement: 'B/L No, Vessel Name, ETD, ETA',
              description: '포워더로부터 수령한 마스터/하우스 B/L 번호와 출항일, 입항 예정일을 기입합니다.'
            },
            {
              pin: 3,
              title: '상업송장(C/I) & 포장명세서(P/L) 발행',
              targetElement: '상단 [C/I 출력], [P/L 출력] 버튼',
              description: '수출신고 및 바이어 통관을 위한 공식 Commercial Invoice 및 Packing List 문서를 출력/다운로드합니다.'
            }
          ]
        },
        fieldSteps: [
          {
            stepNo: '01',
            title: '선적일자(ETD) 기재',
            field: 'ETD (Estimated Time of Departure)',
            exampleValue: '2026-10-15',
            actionGuide: '선박이 출항한 실제 선적일자(On-Board Date)를 기재합니다.',
            required: true
          },
          {
            stepNo: '02',
            title: '기준환율 원클릭 자동 조회',
            field: '[⚡ BL일자 기준환율 자동조회] 버튼',
            exampleValue: '서울외국환중개 ₩1,361.30 / USD',
            actionGuide: '버튼을 클릭하면 세법 규정에 따른 해당일자 공식 매매기준율을 자동으로 가져와 저장합니다.',
            required: true
          },
          {
            stepNo: '03',
            title: 'B/L 번호 및 선박 정보 입력',
            field: 'B/L No, Vessel/Voyage, Forwarder',
            exampleValue: 'HDMU1234567 / HYUNDAI FORWARD 001W',
            actionGuide: '포워더 선하증권 번호와 운송선사 정보를 입력합니다.',
            required: true
          },
          {
            stepNo: '04',
            title: 'C/I & P/L 서류 다운로드',
            field: '상단 서류 출력 버튼',
            exampleValue: 'CI_PO-2026-UNG-01.pdf',
            actionGuide: '상업송장과 포장명세서를 다운로드하여 관세사 수출신고 및 해외 바이어에게 송부합니다.',
            required: true
          }
        ],
        tips: ['[🔗 SMBS 사이트 ↗] 링크를 클릭하면 서울외국환중개 공식 사이트에서 기간별 매매기준율을 교차 검증하실 수 있습니다.']
      },
      {
        tabId: 'tab-cost-settlement',
        tabName: '5. 원가/이익 정산',
        tabIcon: '📊',
        tabSummary: '인보이스 외화 매출액 환산, 공급사 매입비, 물류 부대비용 및 최종 순이익(마진율) 정산',
        screenMockup: {
          screenName: '수출 주문 상세 - [5. 원가/이익 정산] 탭 화면',
          mockupType: 'order_tab_settlement',
          callouts: [
            {
              pin: 1,
              title: '총 매출액 (외화 & 원화 환산)',
              targetElement: '인보이스 매출액 영역',
              description: '인보이스 외화 총액에 BL 선적일자 기준환율을 곱하여 원화 환산 매출을 확정합니다.'
            },
            {
              pin: 2,
              title: '총 매입 원가 집계',
              targetElement: '공급사 매입비용 영역',
              description: '공급사별 발주서 매입 금액을 자동 합산하여 원자재/제품 매입 원가를 산출합니다.'
            },
            {
              pin: 3,
              title: '물류비 & 부대비용 기입',
              targetElement: '해상운임, 관세사 통관료, 내륙운송료',
              description: '포워더 및 관세사로부터 청구된 실비 지출 내역을 입력합니다.'
            },
            {
              pin: 4,
              title: '최종 공헌이익 & 마진율(%)',
              targetElement: '최종 순이익(Gross Profit) 카드',
              description: '총 매출액에서 매입원가와 부대비용을 차감한 실제 순이익과 마진율(%)을 실시간 확정합니다.'
            }
          ]
        },
        fieldSteps: [
          {
            stepNo: '01',
            title: '원화 환산 매출액 확인',
            field: '외화 매출액 x 적용환율',
            exampleValue: 'USD $45,000.00 x ₩1,361.3 = ₩61,258,500',
            actionGuide: 'BL 선적일자 기준환율이 적용된 원화 총 매출액을 검토합니다.',
            required: '자동계산'
          },
          {
            stepNo: '02',
            title: '공급사 매입 원가 대조',
            field: '공급사별 발주 매입액 합계',
            exampleValue: '대한볼트 ₩38,500,000 (VAT 별도)',
            actionGuide: '공급사에 실제 결제할 발주서 금액과 세금계산서를 대조합니다.',
            required: '자동계산'
          },
          {
            stepNo: '03',
            title: '해상운임 및 관세사 통관료 기입',
            field: 'Ocean Freight, Customs Clearance Fee',
            exampleValue: '운임: $1,200 (₩1,633,560) / 통관료: ₩150,000',
            actionGuide: '포워더 및 관세사 청구서 금액을 각 항목에 입력합니다.',
            required: true
          },
          {
            stepNo: '04',
            title: '최종 순이익 확정 및 주문 마감',
            field: '순이익(Profit), 마진율(%)',
            exampleValue: '순이익 ₩8,608,500 / 마진율 14.05%',
            actionGuide: '정산 수치를 확인하고 주문 상태를 [정산완료]로 승격하여 회계 마감합니다.',
            required: '자동계산'
          }
        ],
        tips: ['분할 선적 건은 각 차수별(Round)로 개별 정산이 가능하여 부분 선적에 따른 이익을 투명하게 관리할 수 있습니다.']
      }
    ],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'orders',
    path: '/orders',
    category: '영업관리',
    title: '수출 주문관리 (Orders List)',
    subtitle: '확정된 수출 주문 목록 조회, 검색, 필터링 및 신규 주문 등록',
    icon: '📦',
    summary: '고객사로부터 수주받은 모든 수출 주문(PO)을 통합 관리하며, 수주 상태(진행중, 선적완료, 정산완료), 바이어, 기간별 검색과 엑셀 다운로드를 지원합니다.',
    workflow: [
      '1. 신규 주문 등록: [+ 신규 주문 등록] 버튼 클릭 후 PI 매칭 또는 직접 등록',
      '2. 상태 필터링: [전체 / 진행중 / 선적대기 / 완료] 탭으로 현황 파악',
      '3. 주문 상세 진입: 목록에서 해당 주문 행 또는 [상세보기] 클릭',
      '4. 일괄 데이터 내보내기: [엑셀 다운로드] 버튼을 통한 장부 출력'
    ],
    instructions: [
      {
        title: 'PI 기반 원클릭 주문 전환',
        desc: '신규 주문 등록 시 이미 발행된 견적서(PI)를 선택하면 고객사, 품목 리스트, 단가, 결제 조건이 자동으로 완벽히 연동되어 재입력 없이 즉시 주문이 생성됩니다.',
        badge: '연동'
      },
      {
        title: '다중 차수 선적(Split Shipment) 상태 표시',
        desc: '주문 건 중 1차, 2차 등 분할 선적 건은 각 차수별 선적 진행률과 완료 여부가 상태 뱃지로 표기되어 진행 현황을 직관적으로 확인할 수 있습니다.',
        badge: '분할선적'
      }
    ],
    tips: [
      '발주번호, 고객사명, 인코텀즈, 선적항으로 빠른 다중 검색이 가능합니다.'
    ],
    screenMockup: {
      screenName: '수출 주문 목록 (Orders List)',
      mockupType: 'orders_list',
      callouts: [
        {
          pin: 1,
          title: '주문 상태 탭 필터링',
          targetElement: '[전체 / 진행중 / 선적완료 / 정산완료]',
          description: '원하는 상태 탭을 클릭하여 현재 진행 중인 수출 건과 완료된 건을 즉시 필터링하여 조회합니다.'
        },
        {
          pin: 2,
          title: '엑셀 다운로드 & + 신규 주문 등록',
          targetElement: '상단 우측 엑셀 및 신규 등록 버튼',
          description: '현재 필터링된 주문 목록을 엑셀 파일로 일괄 출력하거나, 새 주문을 생성하는 창을 엽니다.'
        },
        {
          pin: 3,
          title: '주문 상세 진입 및 분할 선적 뱃지',
          targetElement: '주문 목록 행 및 [상세보기] 링크',
          description: '주문 카드를 클릭하면 [수출 주문 상세] 포탈로 진입하여 소싱/선적/패킹/원가 정산 작업을 진행합니다.'
        }
      ]
    },
    fieldSteps: [
      {
        stepNo: '01',
        title: '신규 주문 등록 클릭',
        field: '+ 신규 주문 등록 모달',
        exampleValue: 'PI-YS-2026-UNG-01 선택',
        actionGuide: '[+ 신규 주문 등록] 버튼을 누르고 이미 발행된 견적서(PI)를 선택하여 원클릭으로 주문을 생성합니다.',
        required: true
      },
      {
        stepNo: '02',
        title: '주문 검색 및 상태 필터링',
        field: '검색창 (발주번호/고객사명)',
        exampleValue: 'UNG 또는 PO-2026-001 검색',
        actionGuide: '통합 검색창에 발주번호나 바이어명을 입력하여 빠르게 대상 주문 건을 찾습니다.',
        required: '선택'
      },
      {
        stepNo: '03',
        title: '주문 상세 관리 진입',
        field: '목록 클릭 또는 [상세보기 ➔]',
        exampleValue: 'PO-2026-UNG-01 클릭',
        actionGuide: '해당 주문을 클릭하여 [수출 주문상세]로 진입해 패킹리스트 작성 및 도착보고서/쉬핑마크를 발행합니다.',
        required: true
      }
    ],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'proforma-invoices',
    path: '/proforma-invoices',
    category: '영업관리',
    title: '수출 견적관리 (Proforma Invoice)',
    subtitle: '해외 바이어 대상 공식 수출 견적서(PI) 작성, 인쇄, PDF 및 이메일 발송',
    icon: '📤',
    summary: '해외 거래처에 제안하는 공식 Proforma Invoice를 작성하고 회사 공식 레터헤드와 직인이 날인된 견적 문서를 자동 생성/발송하는 포탈입니다.',
    workflow: [
      '1. [+ 신규 PI 작성] 클릭 및 바이어(Customer) 선택',
      '2. 인코텀즈(FOB, CIF, CFR 등), 통화(USD/EUR), 선적항, 결제조건 지정',
      '3. 품목 DB 연동 또는 신규 행 추가하여 품명, 규격, 수량, 단가 입력',
      '4. [미리보기 & PDF 다운로드]로 정밀 문서 확인 후 바이어 송부',
      '5. 바이어 컨펌 시 [주문으로 전환] 버튼을 눌러 수출 주문으로 즉시 승격'
    ],
    instructions: [
      {
        title: '부대비용(Incidental Charges) CIF/FOB 운임 자동 합산 및 분리 노출 방지 (신규)',
        desc: '수출신고필증, 내륙운송비, 구매확인서 발급비 등 5대 부대비용을 입력하더라도 해외 바이어에게 발행되는 견적서(PI) 인쇄/PDF/Excel 상에는 별도 행으로 노출되지 않고, CIF CHARGES 또는 FOB CHARGES 단가 및 합계에 완벽히 자동 합산되어 단일 항목으로 깔끔하게 표기됩니다.',
        badge: 'v2.8.617 최신'
      },
      {
        title: '결제 조건(Payment Terms) 실시간 직접 편집 & 마스터 관리',
        desc: 'PAYMENT 항목 레이블 우측의 [✏️ 직접수정] 버튼 또는 드롭다운의 "✏️ 현재 값 직접 수정"을 누르면 텍스트 인풋으로 즉시 전환되어 문구를 자유롭게 편집할 수 있습니다. 또한 [⚙️] 버튼 또는 "⚙️ 항목 관리"를 열어 드롭다운 목록의 오타 수정(Edit) 및 불필요한 항목을 영구 삭제(Delete)할 수 있습니다.',
        badge: '편의기능'
      },
      {
        title: '상품 DB 및 가격 자동 계산',
        desc: '품목 선택 시 기본 단가 및 규격이 자동 기입되며, 총액(Subtotal), 운임(Ocean Freight), 보험료(Insurance)가 인코텀즈에 맞춰 자동 합산됩니다.',
        badge: '자동계산'
      },
      {
        title: '수주 확정 원클릭 주문 연동',
        desc: '바이어의 승인이 완료된 견적서는 목록에서 [주문 전환] 버튼을 눌러 즉시 수출 주문 관리로 이관할 수 있습니다.',
        badge: '전환'
      }
    ],
    tips: [
      '자사 정보 관리(레터헤드, 명판 직인)가 등록되어 있으면 견적서 출력 시 자동으로 고화질 서명이 첨부됩니다.',
      '결제조건(Payment Terms), 도착항(Port), 포장조건(Packaging) 등 무역조건은 [✏️ 직접수정]으로 임의 편집 후 [💾 목록추가]로 공용 마스터 DB에 저장할 수 있습니다.'
    ],
    screenMockup: {
      screenName: '수출 견적서 작성 (PROFORMA INVOICE)',
      mockupType: 'pi_form',
      callouts: [
        {
          pin: 1,
          title: '바이어(Customer) 선택 및 영문 주소 로드',
          targetElement: '바이어 검색 입력란',
          description: '고객사 DB에서 바이어를 검색하여 선택하면 영문 사명, 정식 사업장 주소, 담당자 연락처가 자동으로 서식에 입력됩니다.'
        },
        {
          pin: 2,
          title: '인코텀즈 & 통화(USD/EUR) 지정',
          targetElement: '인코텀즈 드롭다운 (FOB, CIF, CFR 등)',
          description: '정형거래조건을 지정하면 운임/보험료 항목의 활성화 여부 및 총 견적 합계액(Total Amount) 계산 공식이 자동 적용됩니다.'
        },
        {
          pin: 3,
          title: '결제조건 직접수정 [✏️] 및 마스터 관리 [⚙️]',
          targetElement: 'PAYMENT 항목 우측 [✏️ 직접수정] & [⚙️] 버튼',
          description: '선택한 결제조건 문구를 인라인 텍스트로 자유롭게 직접 수정할 수 있으며, 관리 모달에서 드롭다운에 등록된 오타 및 중복 항목을 수정하거나 삭제할 수 있습니다.'
        },
        {
          pin: 4,
          title: '미리보기 & 직인 날인 PDF 다운로드',
          targetElement: '상단 [미리보기 & PDF 다운로드] 버튼',
          description: '자사 레터헤드와 대표 명판 직인이 날인된 완성형 고화질 PDF 견적서를 즉시 생성하여 바이어에게 메일 송부할 수 있습니다.'
        }
      ]
    },
    fieldSteps: [
      {
        stepNo: '01',
        title: '해외 바이어(Buyer) 선택',
        field: 'Buyer Name, Address, Contact',
        exampleValue: 'United Neama Group (UNG) / Dammam, KSA',
        actionGuide: '[바이어 검색] 버튼을 눌러 등록된 고객사를 선택합니다. 미등록 바이어는 [고객사 관리]에서 먼저 등록하거나 직접 입력할 수 있습니다.',
        required: true
      },
      {
        stepNo: '02',
        title: '정형거래조건(Incoterms) & 통화',
        field: 'Incoterms, Currency, Port of Loading',
        exampleValue: 'FOB BUSAN, KOREA / USD ($)',
        actionGuide: '인코텀즈 조건(FOB/CIF/CFR/EXW)을 선택하고 거래 통화(USD 또는 EUR)와 선적항을 지정합니다.',
        required: true
      },
      {
        stepNo: '03',
        title: '견적 품목 리스트 & 단가 입력',
        field: 'Item Code, Description, Spec, Qty, Unit Price',
        exampleValue: 'HEX BOLT M16 / 10,000 PCS @ $0.45',
        actionGuide: '품목 DB에서 상품을 선택하거나 [행 추가]를 눌러 품명, 규격, 수량, 외화 단가를 기입합니다. 공급가액(Amount)은 자동 계산됩니다.',
        required: true
      },
      {
        stepNo: '04',
        title: '해상운임 & 보험료 (CIF 조건 시)',
        field: 'Ocean Freight, Marine Insurance',
        exampleValue: 'Ocean Freight: $500.00 / Ins: $100.00',
        actionGuide: 'CIF 또는 CFR 조건인 경우 포워더로부터 견적받은 예상 해상 운임과 적하보험료를 입력합니다. (FOB 조건은 0원 유지)',
        required: '선택'
      },
      {
        stepNo: '05',
        title: '결제 조건(Payment Terms) 기재 & 직접 수정·목록 관리',
        field: 'Payment Terms, Validity, Delivery',
        exampleValue: 'T/T 30% Advance, 70% against B/L copy',
        actionGuide: '드롭다운에서 조건을 선택하거나, 레이블 우측 [✏️ 직접수정] 버튼을 눌러 자유롭게 문구를 직접 입력/수정합니다. 오타나 불필요한 항목은 [⚙️] 버튼(항목 관리 모달)에서 수정(Edit) 및 삭제(Delete)할 수 있습니다.',
        required: true
      },
      {
        stepNo: '06',
        title: '견적서 검수 및 PDF 다운로드',
        field: '상단 [미리보기 & PDF 다운로드]',
        exampleValue: 'PROFORMA_INVOICE_UNG_01.pdf',
        actionGuide: '상단 미리보기 버튼을 눌러 레터헤드와 직인이 날인된 A4 규격 문서를 검수하고 PDF를 다운로드하여 바이어에게 송부합니다.',
        required: true
      }
    ],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'import-quotes',
    path: '/import-quotes',
    category: '영업관리',
    title: '수입 견적관리 (Import Quotes)',
    subtitle: '해외 공급사로부터 수신한 수입 견적서 검토, 비교 및 채택 관리',
    icon: '📥',
    summary: '해외 공급업체로부터 입수한 외화 견적을 등록하고 원화 환산 가격, 관부가세 예상치 및 국내 판매 예상 마진을 사전 시뮬레이션하는 포탈입니다.',
    workflow: [
      '1. 공급사별 견적 접수 등록 (외화 단가, 통화, 공급사명)',
      '2. 수입 부대비용(해상운임, 관세, 통관료) 반영 및 수입 원가 계산',
      '3. 경쟁 공급사 간 단가/품질 비교 검토',
      '4. 최적 견적 선정 후 [수입 주문(PO) 발주]로 전환'
    ],
    instructions: [
      {
        title: '수입 원가 & 예상 마진 계산기',
        desc: '적용 환율과 관세율을 입력하면 수입 개당 매입 원가를 자동 산출하여 적정 국내 판매가를 미리 설정해 볼 수 있습니다.',
        badge: '시뮬레이션'
      }
    ],
    tips: ['공급사의 결제 조건(T/T Advance, L/C, CAD)을 꼼꼼히 기록해 두면 자금 집행 계획 시 유용합니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'imports',
    path: '/imports',
    category: '영업관리',
    title: '수입 주문관리 (Import Orders)',
    subtitle: '해외 발주서(PO) 관리, 선적 진행, B/L 입수 및 국내 수입통관 추적',
    icon: '⚓',
    summary: '해외 공급사에 발주한 수입 건의 진행 현황, 선박 출항(ETD)/입항(ETA) 일정, 수입신고필증 및 수입 부대비용 정산을 총괄하는 포탈입니다.',
    workflow: [
      '1. 수입 PO 발행 및 해외 공급사 송부',
      '2. 외화 계약금/잔금 송금(T/T) 일정 체크',
      '3. 선적 서류(B/L, C/I, P/L) 수령 및 포워더 입항 일정 확인',
      '4. 관세사 수입통관 진행 및 관부가세/부대비용 납부',
      '5. 국내 창고 입고 검수 및 매입 전표 확정'
    ],
    instructions: [
      {
        title: 'B/L 및 통관 일정 실시간 관리',
        desc: '마스터/하우스 B/L 번호와 입항 예정일을 기입하여 세관 수입신고 및 창고 보관료 발생을 사전에 방지합니다.',
        badge: '물류'
      }
    ],
    tips: ['수입통관 완료 후 발행된 수입세금계산서는 [매입관리] 포탈로 연동되어 회계 처리됩니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'domestic-quotes',
    path: '/domestic-quotes',
    category: '영업관리',
    title: '국내 견적관리 (Domestic Quotes)',
    subtitle: '국내 거래처 대상 원화(KRW) 견적서 작성, 공급가액/부가세 계산 및 출력',
    icon: '📋',
    summary: '국내 납품 거래처를 대상으로 부가세(VAT 10%)가 자동 계산된 표준 견적서를 발행하고 거래처별 특약 사항을 기재하여 즉시 인쇄/발송하는 포탈입니다.',
    workflow: [
      '1. [+ 신규 견적 작성] 및 국내 고객사 선택',
      '2. 품목 선택 및 수량, 공급단가 입력 (부가세 자동 계산)',
      '3. 견적 유효기간, 납기, 결제조건(현금/전자어음/말일마감) 설정',
      '4. PDF 저장 또는 출력 후 고객사 송부',
      '5. 수주 체결 시 [국내 주문으로 전환] 클릭'
    ],
    instructions: [
      {
        title: '표준 부가세 자동 산출 & 직인 날인',
        desc: '공급가액에 따라 부가세 10%와 합계 금액이 실시간 산출되며, 자사 직인이 인쇄되는 표준 양식으로 PDF가 생성됩니다.',
        badge: '국내규격'
      }
    ],
    tips: ['자주 견적을 요청하는 단골 고객사는 [고객사 관리]에서 기본 결제 조건을 설정해두면 자동으로 불러와집니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'domestic-orders',
    path: '/domestic-orders',
    category: '영업관리',
    title: '국내 주문관리 (Domestic Trade)',
    subtitle: '국내 수주 주문 진행, 납품 관리, 전자세금계산서 발행 및 수금 추적',
    icon: '🏬',
    summary: '국내 거래처 수주 건에 대한 납품 일정 관리, 거래명세표 출력, 세금계산서 청구/영수 상태 및 입금 확인을 체계적으로 관리합니다.',
    workflow: [
      '1. 수주 등록 및 납기/출하 일정 수립',
      '2. 거래명세서(출하표) 발행 및 물품 납품',
      '3. 전자세금계산서 역발행/발행 연동',
      '4. 수금 만기일 체크 및 채권/수금관리 연계'
    ],
    instructions: [
      {
        title: '거래명세서 원클릭 출력',
        desc: '납품 시 동봉할 품목 규격, 수량, 납품처가 명시된 거래명세서를 바로 인쇄하거나 PDF로 저장할 수 있습니다.',
        badge: '출력'
      }
    ],
    tips: ['세금계산서 발행일자와 수금예정일을 정확히 기입하면 [채권/수금관리] 포탈에서 미수금 현황을 자동으로 관리할 수 있습니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'profit-management',
    path: '/profit-management',
    category: '영업관리',
    title: '이익관리 (Profit Analysis)',
    subtitle: '수출/수입/국내 건별 매출액, 매입원가, 부대비용 및 순이익/마진율 정밀 분석',
    icon: '📊',
    summary: '각 주문별 최종 매출(인보이스 기준)과 매입(공급사 PO 및 통관/물류 부대비용)을 결합하여 실질적인 공헌이익과 마진율(%)을 정산하는 손익 포탈입니다.',
    workflow: [
      '1. 정산 대상 주문 선택 (수출/수입/국내)',
      '2. 총 매출액(Revenue) 및 통화별 원화 환산액 검증',
      '3. 공급사 매입비용, 해상/항공 운임, 관세사 비용, 보험료 취합',
      '4. 최종 순이익(Gross Profit) 및 이익률(Margin %) 확정',
      '5. 부서별/담당자별 실적 통계 보고서 산출'
    ],
    instructions: [
      {
        title: '다중 통화 자동 원화 환산',
        desc: '수출 USD, 공급사 매입 CNY/KRW 등 다중 통화가 혼재된 프로젝트도 실제 정산 환율을 적용하여 단일 원화 기준으로 정확한 마진을 계산합니다.',
        badge: '정산'
      }
    ],
    tips: ['선적 차수별(Round)로 분할 정산이 가능하므로 부분 선적 건도 개별 이익을 투명하게 집계할 수 있습니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'receivables',
    path: '/receivables',
    category: '영업관리',
    title: '채권 / 수금관리 (Receivables)',
    subtitle: '바이어 및 거래처별 외상매출금, 수금 예정일 및 연체 미수금 집중 관리',
    icon: '💰',
    summary: '발행된 인보이스 및 세금계산서의 수금 현황을 추적하고, 입금 확인, 잔액 정산 및 장기 미수 채권에 대한 연체 알림을 제공하는 자금 관리 포탈입니다.',
    workflow: [
      '1. 수금 대기 건 조회 (만기 도래순 / 거래처별)',
      '2. 바이어 입금 확인 (외화 송금 입금증 또는 원화 입금)',
      '3. [수금 완료 등록] 처리 및 입금일자, 외환차손익 기록',
      '4. 미수 잔액 실시간 업데이트 및 거래처별 원장 대조'
    ],
    instructions: [
      {
        title: '미수금 회수 예정일 캘린더 & D-Day 알림',
        desc: '결제 기일이 임박하거나 초과된 채권을 색상 배지(D-Day, 초과일수)로 강조하여 자금 회수 누락을 방지합니다.',
        badge: '리스크관리'
      }
    ],
    tips: ['T/T 분할 입금(계약금 30%, 선적 후 70%) 건도 회차별 부분 수금 입력이 지원됩니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'purchases',
    path: '/purchases',
    category: '구매관리',
    title: '매입관리 (Purchases Management)',
    subtitle: '국내외 매입 세금계산서, 공급사 거래명세서 및 매입 전표 통합 집계',
    icon: '📦',
    summary: '제조사, 가공업체, 포워더, 관세사 등으로부터 청구된 매입 내역을 주문 건별로 매핑하여 누락 없는 원가 반영과 회계 전표를 관리합니다.',
    workflow: [
      '1. 매입 전표 등록 (공급업체, 품목, 공급가, 세액)',
      '2. 관련 수주/주문 번호(PO) 연결',
      '3. 세금계산서 일치 여부 대조 및 승인',
      '4. 채무/지급관리 포탈로 지급 요청 연계'
    ],
    instructions: [
      {
        title: '주문 건별 매입 원가 자동 귀속',
        desc: '매입 전표 등록 시 관련 수출/국내 주문 번호를 선택하면 해당 주문의 [이익관리] 원가 항목에 자동 반영됩니다.',
        badge: '자동귀속'
      }
    ],
    tips: ['포워더 운임 청구서, 보세창고료 등 물류 부대비용도 매입 구분을 "물류비"로 지정하여 정확히 구분할 수 있습니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'payables',
    path: '/payables',
    category: '구매관리',
    title: '채무 / 지급관리 (Payables Management)',
    subtitle: '공급사 외상매입금, 해외 송금(T/T), 지급 만기일 및 자금 출금 계획 관리',
    icon: '💳',
    summary: '공급업체에 지급해야 할 대금(원화 결제 및 해외 T/T 송금)의 결제 기일을 통제하고, 지급 승인 및 출금 완료 내역을 정산하는 포탈입니다.',
    workflow: [
      '1. 지급 예정 목록 검토 (결제 조건: 당월말, 익월 15일, 선적전 T/T 등)',
      '2. 결재 요청 및 자금 집행 승인',
      '3. 은행 이체 또는 외화 송금 완료 후 지급 완료 처리',
      '4. 공급사별 미지급 잔액 대조 및 마감'
    ],
    instructions: [
      {
        title: '해외 외화 송금 수수료 및 적용 환율 기록',
        desc: '해외 T/T 송금 시 실제 은행 적용 송금환율과 전신료/수수료를 함께 기록하여 정확한 회계 전표를 생성합니다.',
        badge: '외환정산'
      }
    ],
    tips: ['지급일자별 캘린더 뷰를 통해 일자별 자금 소요 계획을 한눈에 파악할 수 있습니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'products',
    path: '/products',
    category: 'DB관리',
    title: '상품 DB 관리 (Products Database)',
    subtitle: '수출입 품목 마스터, HS코드, 규격, 중량/부피 및 기본 단가 등록',
    icon: '◫',
    summary: '회사가 취급하는 모든 제품의 품목 코드, 영문/국문 품명, HS Code, 규격 단위, 포장 사양(CBM, 중량) 및 표준 매가/원가를 등록하고 관리하는 기준 정보 포탈입니다.',
    workflow: [
      '1. [+ 신규 상품 등록] 클릭',
      '2. 품번(Item Code), 영문/국문 품명, 사양(Spec) 입력',
      '3. HS Code 및 표준 단위(PCS, SET, MT, KG) 설정',
      '4. 기본 매입가, 판매 단가 및 규격 포장 치수(L x W x H) 입력',
      '5. 저장 후 견적서 및 주문 작성 시 자동 호출 사용'
    ],
    instructions: [
      {
        title: 'HS Code 기반 세율 및 통관 서류 연동',
        desc: '등록된 HS Code는 수출신고, 수입신고 및 C/I, P/L 발행 시 자동으로 기입되어 서류 작성 시간을 대폭 단축합니다.',
        badge: '자동연동'
      }
    ],
    tips: ['엑셀 일괄 등록 기능을 통해 대량의 제품 마스터를 한 번에 업로드할 수 있습니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'customers',
    path: '/customers',
    category: 'DB관리',
    title: '고객사 관리 (Customers Database)',
    subtitle: '해외 바이어 및 국내 고객사 프로필, 담당자 연락처, 인코텀즈 및 결제 조건 관리',
    icon: '◎',
    summary: '해외 수입상 및 국내 거래처의 사업자 등록번호, 담당자 명함 정보, 이메일, 선호 인코텀즈, 결제 조건(Credit Terms), 지정 목적항을 중앙 집중 관리합니다.',
    workflow: [
      '1. 신규 거래처 등록 및 구분(해외 바이어 / 국내 고객) 설정',
      '2. 기본 인코텀즈(FOB, CIF 등), 도착항(Port of Discharge), 지불조건 설정',
      '3. 다중 담당자(영업, 회계, 물류) 연락처 및 이메일 등록',
      '4. 견적서/주문서 작성 시 고객사 선택으로 모든 조건 자동 채움'
    ],
    instructions: [
      {
        title: '바이어별 거래 이력 및 통계 조회',
        desc: '고객사 상세 화면에서 그동안 진행한 수주 내역, 총 거래 금액, 미수 채권 현황을 한눈에 확인할 수 있습니다.',
        badge: 'CRM'
      }
    ],
    tips: ['바이어의 영문 공식 사명과 주소를 등록해두면 인보이스 발행 시 그대로 레터헤드에 반영됩니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'suppliers',
    path: '/suppliers',
    category: 'DB관리',
    title: '공급업체 관리 (Suppliers Database)',
    subtitle: '제조 공장, 가공업체, 포워더, 관세사 등 협력사 마스터 및 계좌 정보 관리',
    icon: '◉',
    summary: '제품을 공급하는 제조사 및 물류 협력사(포워더, 선사, 관세법인)의 정보, 주거래 품목, 계좌 번호, 발주서 수신 담당자 이메일을 관리합니다.',
    workflow: [
      '1. 협력사 등록 및 카테고리 지정 (제조사 / 포워더 / 관세사 / 기타)',
      '2. 발주서 수신 이메일 및 카카오톡 담당자 연락처 등록',
      '3. 대금 지급 결제 계좌(국내 계좌 및 해외 외화 송금 영문 계좌) 등록',
      '4. 주문 상세에서 공급사 선택 시 발주서 자동 발송 연동'
    ],
    instructions: [
      {
        title: '발주서 & 도착보고서 즉시 발송 연동',
        desc: '공급업체에 등록된 이메일과 전화번호로 주문 상세 화면에서 클릭 한 번으로 발주서와 도착보고서를 바로 전송할 수 있습니다.',
        badge: '원클릭발송'
      }
    ],
    tips: ['공급사의 결제 계좌 정보를 미리 등록해 두면 [채무/지급관리]에서 송금증 작성 시 오타 없이 자동 입력됩니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'my-company',
    path: '/my-company',
    category: 'DB관리',
    title: '자사 정보 관리 (My Company Profile)',
    subtitle: '회사 기본 정보, 영문 레터헤드 이미지, 법인 명판 및 직인 관리',
    icon: '🏢',
    summary: '견적서(PI), 발주서(PO), 상업송장(CI), 포장명세서(PL) 등 모든 무역 서식에 인쇄되는 자사 영문/국문 상호, 사업자번호, 주소, 은행 계좌 및 명판 직인을 설정합니다.',
    workflow: [
      '1. 자사 기본 정보(상호, 대표자, 사업자번호, 통신판매번호) 입력',
      '2. 공식 영문 주소, 전화/팩스, 대표 이메일 기입',
      '3. 공식 외환 결제 은행(Beneficiary Bank, Swift Code, Account No) 등록',
      '4. 고화질 투명 배경 회사 직인(도장) 및 레터헤드 이미지 업로드'
    ],
    instructions: [
      {
        title: '무역 서식 자동 직인 날인',
        desc: '업로드된 법인 직인과 레터헤드는 모든 공식 서식 발행 및 PDF 생성 시 정위치에 고해상도로 자동 합성 날인됩니다.',
        badge: '자동날인'
      }
    ],
    tips: ['직인 이미지는 배경이 투명한 PNG 파일로 등록하시면 문서 출력 시 깔끔하게 날인됩니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'approvals',
    path: '/approvals',
    category: '업무관리',
    title: '전자결재 포탈 (Approval System)',
    subtitle: '기안서 작성, 다단계 승인 라인 설정, 전결 및 반려 프로세스',
    icon: '✍️',
    summary: '수출입 계약, 특별 할인, 자금 지출 결재, 휴가 신청 등 사내 주요 의사결정을 온라인으로 기안하고 결재선에 따라 전자서명 승인하는 포탈입니다.',
    workflow: [
      '1. [+ 새 기안서 작성] 클릭 및 양식 선택 (품의서 / 지출결의서 / 계약승인)',
      '2. 결재선(중간 결재자, 최종 승인자, 참조자) 지정',
      '3. 문서 작성 및 관련 주문/견적 첨부 파일 업로드 후 [상신]',
      '4. 결재권자 알림 수신 ➔ 내용 검토 후 [승인] 또는 [반려] 처리',
      '5. 최종 승인 완료 시 전산 시스템 자동 반영 및 관련 부서 공유'
    ],
    instructions: [
      {
        title: '실시간 결재 알림 센터 연동',
        desc: '결재 대기 문서가 도착하면 상단 헤더의 🔔 종 아이콘과 배지에 실시간 숫자가 표시되며 알림음이 재생됩니다.',
        badge: '실시간알림'
      }
    ],
    tips: ['휴가 신청 결재가 최종 승인되면 [연월차 관리] 포탈에 잔여 휴가일수가 자동으로 차감 반영됩니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'task-list',
    path: '/list',
    category: '업무관리',
    title: '전체 업무 리스트 (Task Management)',
    subtitle: '개인 및 팀 전체의 프로젝트 일정, 중요도/긴급도 우선순위 및 진척도 관리',
    icon: '📋',
    summary: '회사 내 모든 업무와 프로젝트를 칸반 보드, 사분면 매트릭스, 리스트 뷰로 조회하고 담당자 위임, 상태 변경(TODO, DOING, DONE)을 수행하는 포탈입니다.',
    workflow: [
      '1. 신규 업무 등록 및 프로젝트 연결',
      '2. 중요도(A/B/C) 및 긴급도(1~5) 지정으로 사분면 자동 분류',
      '3. 동료 직원에게 업무 위임(Delegation) 및 진행 알림 발송',
      '4. 업무 완료 시 상태 변경 및 완료 보고서 작성'
    ],
    instructions: [
      {
        title: '다중 뷰 지원 (매트릭스 / 칸반 / 리스트)',
        desc: '업무 스타일과 목적에 맞춰 아이젠하워 매트릭스, 칸반 카드, 스프레드시트형 리스트로 자유롭게 전환하며 조회할 수 있습니다.',
        badge: '다중뷰'
      }
    ],
    tips: ['주문 진행 중 발생하는 특이사항은 해당 주문을 태그하여 업무로 등록하면 이력이 안전하게 보존됩니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'leave-management',
    path: '/leave-management',
    category: '업무관리',
    title: '연월차 관리 (Leave Management)',
    subtitle: '임직원 연차 발생/사용 현황 조회, 휴가 신청 및 잔여일수 자동 정산',
    icon: '📅',
    summary: '근로기준법에 따른 입사일/회계연도 기준 연차 발생 일수, 사용 내역, 잔여 일수를 관리하고 전자결재와 연동하여 투명하게 휴가를 관리합니다.',
    workflow: [
      '1. 본인의 잔여 연차 및 사용 이력 확인',
      '2. [휴가 신청] 클릭하여 기간 및 휴가 구분(연차, 반차, 경조사 등) 선택',
      '3. 전자결재 승인 완료 시 캘린더 자동 등록 및 잔여 일수 자동 차감'
    ],
    instructions: [
      {
        title: '전사 휴가 캘린더',
        desc: '팀원들의 휴가 일정을 캘린더에서 한눈에 확인하여 업무 공백을 사전에 조정할 수 있습니다.',
        badge: '캘린더'
      }
    ],
    tips: ['반차(오전/오후)는 0.5일로 자동 계산되어 차감됩니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'mails',
    path: '/mails',
    category: '업무관리',
    title: '사내 메일 & 메신저 (Internal Messages)',
    subtitle: '사내 임직원 간 업무 지시, 협조 요청, 첨부 파일 전송 및 시스템 알림 열람',
    icon: '✉️',
    summary: '임직원 간의 업무 커뮤니케이션과 시스템 자동 알림(업무 위임, 결재 요청, 납기 도래 등)을 한곳에서 수신/발신하는 사내 메시징 포탈입니다.',
    workflow: [
      '1. 수신함, 발신함, 보관함 확인',
      '2. [메일 쓰기]로 수신자, 참조자 지정 및 내용 작성/파일 첨부',
      '3. 알림 클릭 시 해당 업무나 주문으로 원클릭 다이렉트 이동'
    ],
    instructions: [
      {
        title: '연관 업무 바로가기 링크',
        desc: '업무 관련 알림 메일에는 원본 업무 카드가 자동 첨부되어 클릭 시 바로 팝업으로 상세 내용을 열어볼 수 있습니다.',
        badge: '링크연동'
      }
    ],
    tips: ['알림 센터(상단 벨 아이콘)에서 읽지 않은 메일을 빠르게 확인하고 [🧹 읽은 알림 정리]할 수 있습니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'meetings',
    path: '/meetings',
    category: '업무관리',
    title: '회의록 관리 (Meeting Minutes)',
    subtitle: '주간 회의, 영업 회의록 작성, 안건 공유 및 결정된 액션 아이템 트래킹',
    icon: '📝',
    summary: '사내 회의 내용, 참석자, 논의 안건을 기록하고 회의에서 결정된 실행 과제를 담당자에게 업무(Task)로 즉시 연동 생성하는 포탈입니다.',
    workflow: [
      '1. [+ 신규 회의록 작성] 클릭 및 회의 일시, 장소, 참석자 선택',
      '2. 주요 논의 내용 및 결정 사항 마크다운/텍스트 작성',
      '3. 액션 아이템 도출 시 담당자 지정하여 업무로 즉시 등록',
      '4. 회의록 저장 및 참석자 자동 읽기 배지 갱신'
    ],
    instructions: [
      {
        title: '회의 액션 아이템 원클릭 업무화',
        desc: '회의록 본문에서 나온 실천 과제를 클릭 한 번으로 [전체 업무 리스트]에 할당하여 실행력을 극대화합니다.',
        badge: '실행연동'
      }
    ],
    tips: ['새로운 회의록이 등록되면 메뉴 옆에 New 배지가 표시되어 팀원들이 놓치지 않고 열람할 수 있습니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'credentials',
    path: '/credentials',
    category: 'DB관리',
    title: '비밀번호 관리 (Credentials Vault)',
    subtitle: '관세청 유니패스, 은행, 선사, 해외 포털 등 공용 업무 계정 안전 보관',
    icon: '🔑',
    summary: '무역 업무에 필수적인 유니패스, 코트라, 선사 웹사이트, 정부 포털 등의 공용 계정 아이디와 패스워드를 마스킹 처리하여 안전하게 보관/공유하는 보안 포탈입니다.',
    workflow: [
      '1. 카테고리별(관세/통관, 물류/선사, 은행/금융, 정부기관) 계정 확인',
      '2. [👁️ 비밀번호 보기] 또는 [복사] 버튼으로 간편 로그인',
      '3. 신규 사이트 계정 등록 및 접근 권한 설정'
    ],
    instructions: [
      {
        title: '원클릭 사이트 접속 및 비밀번호 클립보드 복사',
        desc: '사이트 바로가기 링크를 누르고 계정/비밀번호 복사 버튼을 누르면 오타 없이 손쉽게 외부 포털에 로그인할 수 있습니다.',
        badge: '보안편의'
      }
    ],
    tips: ['비밀번호는 기본적으로 별표(***) 마스킹되어 화면 노출을 차단하며, 필요한 경우에만 잠시 확인할 수 있습니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'system-logs',
    path: '/system-logs',
    category: '시스템',
    title: '시스템 업데이트 로그 (Changelog)',
    subtitle: '버전별 신규 기능, 화면 개선, 성능 최적화 및 버그 수정 내역 열람',
    icon: '📜',
    summary: 'YSACC 무역관리 포탈의 빌드 버전별 변경 이력과 상세 개선 사항을 사용자 및 관리자에게 투명하게 공유하는 업데이트 히스토리 포탈입니다.',
    workflow: [
      '1. 최신 배포 버전 및 빌드 일시 확인',
      '2. 카테고리별(신규기능, 기능개선, 버그수정, UI/UX) 필터링',
      '3. 버전별 상세 변경 내역 및 사용 방법 확인'
    ],
    instructions: [
      {
        title: '지속적인 기능 업데이트 반영',
        desc: '사용자 요청 사항 및 시스템 개선 패치가 배포될 때마다 버전 번호와 상세 설명이 실시간으로 기록됩니다.',
        badge: '버전추적'
      }
    ],
    tips: ['화면 상단 우측의 버전 배지(예: v2.8.609)를 클릭해도 이 로그 페이지로 바로 이동할 수 있습니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'team-management',
    path: '/team-management',
    category: '시스템',
    title: '직원 계정 관리 (Team Management)',
    subtitle: '임직원 계정 승인, 부서/직급 지정, 관리자/일반 권한 및 접근 제어',
    icon: '⚙️',
    summary: '사내 임직원의 계정 활성화, 부서(영업팀, 무역팀, 관리팀), 직급 및 시스템 관리자 권한을 부여하고 제어하는 보안 관리 포탈입니다.',
    workflow: [
      '1. 신규 가입 직원 승인 및 이메일 확인',
      '2. 소속 부서, 직급 및 권한(관리자/일반 사용자) 배정',
      '3. 퇴사자 계정 비활성화 및 접근 차단'
    ],
    instructions: [
      {
        title: '역할 기반 접근 권한 (RBAC)',
        desc: '관리자 권한을 가진 계정만 직원 계정 관리 및 자사 기본 정보를 수정할 수 있도록 안전하게 통제됩니다.',
        badge: '보안'
      }
    ],
    tips: ['부서 설정은 전자결재 기안 시 결재선 추천 및 알림 전달의 기준이 됩니다.'],
    lastUpdated: '2026.10.08'
  },
  {
    id: 'issues',
    path: '/issues',
    category: '시스템',
    title: '오류 / 수정 건의 게시판 (Issue Board)',
    subtitle: '시스템 개선 제안, 오류 신고 및 실시간 개발 처리 상태 확인',
    icon: '🛠️',
    summary: '업무 포탈 사용 중 발견된 버그나 추가가 필요한 편의 기능을 실시간으로 접수하고 조치 진행 상태(접수, 진행중, 완료)를 열람하는 소통 포탈입니다.',
    workflow: [
      '1. [+ 문제 신고 / 기능 건의] 클릭',
      '2. 문제 발생 화면, 현상 및 개선 희망 사항 작성 (스크린샷 첨부 가능)',
      '3. 개발팀 접수 및 실시간 처리 상태(해결됨) 피드백 확인'
    ],
    instructions: [
      {
        title: '투명한 오류 조치 현황',
        desc: '신고된 안건의 진행 상태를 태그(빨간색: 미해결, 초록색: 해결됨)로 한눈에 확인하실 수 있습니다.',
        badge: '실시간피드백'
      }
    ],
    tips: ['오류 제보 시 브라우저 종류나 문제가 발생한 발주번호를 함께 적어주시면 훨씬 빠르게 조치됩니다.'],
    lastUpdated: '2026.10.08'
  }
];

export function getPortalGuideByPath(currentPath: string): PortalGuide {
  // 1. Exact match
  const exact = PORTAL_GUIDES.find(g => g.path === currentPath);
  if (exact) return exact;

  // 2. Pattern match (e.g. /orders/:id)
  if (currentPath.startsWith('/orders/') && currentPath !== '/orders') {
    const orderDetail = PORTAL_GUIDES.find(g => g.id === 'orders-detail');
    if (orderDetail) return orderDetail;
  }
  if (currentPath.startsWith('/imports/') && currentPath !== '/imports') {
    const importDetail = PORTAL_GUIDES.find(g => g.id === 'imports');
    if (importDetail) return importDetail;
  }

  // 3. Fallback based on start prefix
  const prefixMatch = PORTAL_GUIDES.find(g => g.path !== '/' && currentPath.startsWith(g.path));
  if (prefixMatch) return prefixMatch;

  // 4. Fallback to dashboard
  return PORTAL_GUIDES[0];
}
