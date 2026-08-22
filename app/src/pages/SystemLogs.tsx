import React, { useState, useEffect } from 'react';
import { APP_VERSION } from '../version';
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export interface SystemLogItem {
  id?: string;
  version: string;
  date: string;
  title: string;
  category: '신규기능' | '기능개선' | '버그수정' | 'UI/UX';
  content: string;
  author?: string;
  createdAt?: any;
}

// Built-in initial logs history starting from today and recent key updates
const INITIAL_LOGS: SystemLogItem[] = [
  {
    id: 'log-v2.8.345',
    version: 'v2.8.345',
    date: '2026-08-22',
    category: '기능개선',
    title: 'Remarks (수출인증문구/특약사항) 대형 편집 영역 및 Section B) TRN Number 전용 입력 영역 구축',
    content: '• Remarks 입력칸을 전용 대형 텍스트 영역으로 독립 확장 및 [✨ 표준 수출 인증 문구 자동 입력] 원클릭 버튼 제공\n• Section B) TRN Number 입력란을 독립 및 완벽 서식 지원(B) TRN Number: ...)하도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.344',
    version: 'v2.8.344',
    date: '2026-08-22',
    category: '기능개선',
    title: 'Commercial Invoice 실무 서식 완전 일치화 (다줄 Certification Remarks, CONTAINER 프리픽스, Section A/B/C 가변 높이)',
    content: '• Remarks 입력란 다줄(Textarea) 확장 및 Excel/미리보기 내 Certification 문구 자동 줄바꿈/동적 높이 지원\n• CONTAINER : {SPEC} 표준 접두어 자동 생성 및 Section A/B/C 규격 정밀 일치화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.343',
    version: 'v2.8.343',
    date: '2026-08-22',
    category: '기능개선',
    title: '선적관리 FCL 컨테이너 상세 정보(20DG/40HC 등) CI 하단 컨테이너 규격 및 수량 자동 연동',
    content: '• [물류/선적 - 선적관리]의 [수출량 VOLUME - FCL 컨테이너 상세 정보]에 등록된 컨테이너 규격 및 대수(예: 20DG X 2 NO, 40HC X 2 NO & 20GP X 1 NO)가 CI 하단의 [컨테이너 규격 및 수량 (CONTAINER INFO)]에 실시간 자동 집계 연동',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.342',
    version: 'v2.8.342',
    date: '2026-08-22',
    category: '기능개선',
    title: '상품 마스터 DB 기반 Default HS CODE 자동 매핑 및 CI/수주 품목 실시간 동기화',
    content: '• 상품 마스터 DB(품목코드/품명/영문명/사양/바이어별 HS코드)를 기반으로 기본 HS CODE를 정밀 매핑하여 빈칸 없이 자동 바인딩\n• CI 품목 목록 및 Section A) HS CODE 요약에 상품 DB의 기본 HS CODE가 즉시 표시되도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.341',
    version: 'v2.8.341',
    date: '2026-08-22',
    category: '기능개선',
    title: 'L/C Description 상단 안내문 자동 바인딩 및 CI 선적품목 기반 Section A) HS CODE 실시간 자동 연동',
    content: '• 상단 L/C 상세 정보의 [물품 설명 (LC Description)]이 CI 하단의 [상단 품목 안내문 (Intro Text)]으로 실시간 자동 연동\n• [CI 선적 품목 편집 테이블]의 품명 및 HS CODE가 [Section A) HS CODE 요약 리스트]에 즉시 자동 생성되어 반영',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.340',
    version: 'v2.8.340',
    date: '2026-08-22',
    category: '기능개선',
    title: 'Commercial Invoice 하단 부가 정보(Sections A, B, C) 기본값 빈칸(Empty) 처리 및 조건부 출력',
    content: '• CI 하단 부가 정보(상단 안내문, 컨테이너 정보, A) HS CODE, B) TRN, C) 제조사 정보)의 기본값을 빈칸으로 초기화\n• 사용자가 직접 입력한 내용만 미리보기 및 정식 Excel에 깔끔하게 출력되도록 최적화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.339',
    version: 'v2.8.339',
    date: '2026-08-22',
    category: '기능개선',
    title: 'Commercial Invoice 실무 양식 완벽 반영 (운임비용/품목 자유 편집/HS CODE 요약/TRN/제조사/순수 품명 출력)',
    content: '• Commercial Invoice(CI)에서 당사 품목코드([Pxxxx]) 자동 제거 및 순수 영문 품명/사양 출력 지원\n• 운임(Freight/CIF) 및 일반 품목 자유 추가/수정/삭제 및 단가·수량 실시간 금액 계산 지원\n• CI 실무 필수 양식 완벽 구현: 상단 품목 요약문, 컨테이너 정보, A) HS CODE 요약, B) VAT(TRN) 번호, C) 제조사/생산자 정보 및 서명선\n• Excel 내보내기 및 모달 미리보기에 실무 서식 완벽 동기화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.338',
    version: 'v2.8.338',
    date: '2026-08-22',
    category: '기능개선',
    title: 'Commercial Invoice 품목 데이터 수주정보 기반 연동 및 패킹 팔레트 중복 출력 제거',
    content: '• Commercial Invoice(CI)는 수주 품목 정보(발주 품목 목록)를 기준으로 통합 수량/단가/금액을 출력하도록 개편하여 동일 제품이 패킹 팔레트 개수만큼 반복 출력되던 현상 해결\n• Packing List(PL)는 기존과 같이 실제 컨테이너 패킹 내역을 정확하게 유지',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.337',
    version: 'v2.8.337',
    date: '2026-08-22',
    category: 'UI/UX',
    title: '발주 품목 목록 상품명 칸 확장 및 자유로운 크기 조절(Resize Textarea) 지원',
    content: '• 발주 품목 목록 테이블의 상품코드/품명 열 너비를 대폭 확장하고, 기존 한 줄 고정 input을 자유롭게 높낮이 조절이 가능한 Textarea로 개편하여 긴 전체 Full Name(규격, 재질, 사이즈 등)을 한눈에 확인하고 편집 가능하도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.336',
    version: 'v2.8.336',
    date: '2026-08-22',
    category: '버그수정',
    title: '패키지 합치기/분할 후 원상복귀 현상 완벽 해결 및 클라우드 영구 저장 보장',
    content: '• 패킹리스트에서 [🔗 PKG 합치기] 실행 시 Firestore 저장 과정에서 발생할 수 있는 데이터 포맷 불일치(undefined 필드)를 완전히 제거하고 안전한 클라우드 실시간 동기화 파이프라인 구축\n• 합치기 완료 후 화면 롤백 현상 원천 차단 및 영구 저장 보장',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.335',
    version: 'v2.8.335',
    date: '2026-08-22',
    category: '기능개선',
    title: '패킹리스트 인쇄/미리보기 6열 표준 규격 개편, 창 크기 조절/최대화 지원, 쉬핑마크 총수량 연동',
    content: '• 패킹리스트 출력/PDF 인쇄 및 미리보기 모달을 실제 컨테이너 패킹리스트 데이터 기반 6열 규격(Shipping Marks, Description, Quantity/Packages, Net Wt, Gross Wt, CBM)으로 일원화 개편\n• 쉬핑마크에 전체 컨테이너 패킹 총 수량(PALLET NO. : 1-N / N) 일괄 표기 지원\n• 미리보기 다이얼로그 창의 마우스 모서리 크기 조절(Resize) 및 전체화면 최대화(Maximize) 기능 추가',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.334',
    version: 'v2.8.334',
    date: '2026-08-22',
    category: '버그수정',
    title: '도착보고서 품목 설명의 수량 단위 오류(kg -> 실제 단위 EA 등) 수정',
    content: '• 도착보고서 품목 설명(Description of Goods) 생성 시 발주 품목의 실제 수량 단위(EA, ROLL, SET 등)를 그대로 정확히 반영하도록 로직 수정 (불필요하게 kg으로 강제 치환되던 오류 해결)',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.333',
    version: 'v2.8.333',
    date: '2026-08-22',
    category: '기능개선',
    title: '패킹 합치기/분할/이동 시 쉬핑마크 PKG 총수량 및 번호 실시간 자동 갱신',
    content: '• 패킹리스트에서 [🔗 PKG 합치기], [✂️ PKG 분할], [↩️ PKG 원복], 또는 드래그 앤 드롭으로 순서 변경 시, 변경된 전체 PKG 총 수량(분모) 및 각 품목별 PKG 번호(분자)가 도착보고서 및 쉬핑마크(PALLET NO. : X / Y)에 실시간으로 즉시 자동 동기화되도록 연동 로직 완성',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.332',
    version: 'v2.8.332',
    date: '2026-08-22',
    category: '기능개선',
    title: '패킹리스트 테이블 마우스 드래그 앤 드롭 행 순서 변경 지원 및 화살표 버튼 제거',
    content: '• 패킹리스트 테이블의 동작 컬럼에서 위/아래(▲/▼) 화살표 버튼을 제거하고, 마우스로 행을 직접 잡고 끌어서 원하는 위치로 이동시킬 수 있는 직관적인 드래그 앤 드롭(Drag & Drop) 기능 구현\n• 드래그 이동 시 후속 PKG NO 자동 재계산 및 클라우드 실시간 자동 저장 연동',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.331',
    version: 'v2.8.331',
    date: '2026-08-22',
    category: '기능개선',
    title: '도착보고서 혼적 테이블 병합(rowSpan) 연동 및 쉬핑마크 인쇄 라벨 중복 방지',
    content: '• 도착보고서 작성/인쇄 시에도 패킹리스트의 혼적/묶음(rowSpan) 구조가 동일하게 반영되어 쉬핑마크/수량/중량/CBM이 통합 렌더링되도록 구현\n• 쉬핑마크 인쇄 시 동일 파렛트(예: PALLET NO. 1)에 여러 품목이 적재된 경우 중복 페이지가 인쇄되지 않고 실제 파렛트 수량만큼 1장씩 정밀 인쇄되도록 중복 제거\n• 도착보고서 헤더에 [🔄 패킹리스트 동기화] 버튼을 추가하여 패킹리스트 변경사항을 원클릭으로 즉시 반영 지원',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.330',
    version: 'v2.8.330',
    date: '2026-08-22',
    category: '버그수정',
    title: '패킹리스트 [✂️ PKG 분할] 혼적 묶음 해제 및 대량 수량 분할 완벽 지원',
    content: '• [✂️ PKG 분할] 실행 시 기존에 묶여 있던 혼적 패키지의 개별 분리 해제뿐만 아니라, 단일 품목 대량 수량(예: 2,800개 등)을 N개 분할하거나 지정 단위로 쪼갤 수 있도록 프롬프트 및 계산 로직 전면 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.329',
    version: 'v2.8.329',
    date: '2026-08-22',
    category: '기능개선',
    title: '패킹리스트 혼적/묶음 PKG 테이블 병합(rowSpan) UI 레이아웃 완성',
    content: '• 복수 품목을 [🔗 PKG 합치기] 시, 사용자가 제공한 디자인 구조에 맞추어 체크박스/PKG NO/규격/중량(NET, GROSS)/CBM 컬럼은 1개의 통합 셀(rowSpan)로 시각적으로 결합하고, 품명/제조사/수량 및 개별 동작 버튼은 각 행별로 독립 분리 렌더링되도록 완벽 구현',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.328',
    version: 'v2.8.328',
    date: '2026-08-22',
    category: '버그수정',
    title: '패킹리스트 [🔗 PKG 합치기] 실시간 화면 즉시 렌더링 및 자동 저장 반영',
    content: '• [🔗 PKG 합치기] 및 [✂️ PKG 분할] 실행 시 React 상태 불변성 딥클론(Deep Clone) 처리 및 Firestore 자동 저장을 연동하여 화면에 즉시 변경된 PKG 번호가 렌더링되도록 수정 완료',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.327',
    version: 'v2.8.327',
    date: '2026-08-22',
    category: '기능개선',
    title: '패킹리스트 [↩️ PKG 원복] 실행 시 기존 소싱/발주 품목 데이터 원본 즉시 재연동',
    content: '• [↩️ PKG 원복] 클릭 시, 주문의 소싱/발주(PO) 품목 원본 데이터를 즉시 다시 불러와 모든 상품(품명, 사양, 주문수량, 제조사, 규격, 중량/CBM)을 초기 상태의 개별 행 및 순차 고유 PKG 번호로 완전 복원하도록 기능 개편',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.326',
    version: 'v2.8.326',
    date: '2026-08-22',
    category: '기능개선',
    title: '패킹리스트 품목/수량 개별 유지형 PKG 합치기, [↩️ PKG 원복] 버튼 추가, 포장형태 및 상단 배정버튼 정리',
    content: '• [🔗 PKG 합치기] 실행 시 선택한 복수 품목들의 품명 및 수량을 하나로 뭉개지 않고 개별 행으로 온전히 유지하면서 동일한 PKG NO로 묶이도록 개선하고, 후속 품목들의 PKG 번호가 순차적으로 자동 업데이트되도록 고도화\n• 언제든지 모든 품목의 PKG 번호를 1, 2, 3... 개별 순차 고유 번호로 즉시 되돌릴 수 있는 [↩️ PKG 원복] 버튼 신설\n• 테이블 상단의 [⚡ 제품별 1줄 요약 배정] 및 [📋 1장씩 개별 전개 배정] 버튼 제거 및 테이블 내 [포장형태] 컬럼 정리로 화면 간결화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.325',
    version: 'v2.8.325',
    date: '2026-08-22',
    category: '기능개선',
    title: '패킹리스트 체크박스 선택 기반 [PKG 합치기] / [PKG 분할] 및 제조사 컬럼 위치 개편',
    content: '• 패킹리스트 테이블에 전체/개별 선택 체크박스(Checkbox) 신설하여 다중 항목 선택 후 원클릭 조작 지원\n• 테이블 컬럼 순서를 [품목명/사양] 바로 다음에 [Manufacturer (제조사)]가 오도록 재배치하여 품목 정보 확인 동선 최적화\n• [✂️ 전체 1장씩 분할] 버튼을 정리하고, [🔗 PKG 합치기] 및 [✂️ PKG 분할] 버튼으로 명칭 및 기능 전면 고도화\n• PKG 수량이 많거나 큰 경우(예: 38 PLT 등) 원하는 분할 단위(예: 1개씩, 10개씩 등)를 입력하여 스마트하게 균등 분할할 수 있도록 분할 로직 개편',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.324',
    version: 'v2.8.324',
    date: '2026-08-22',
    category: '기능개선',
    title: '패킹 및 컨테이너 로딩 플랜 Step 1/Step 2 이원화 구조 완전 통합 및 단일화 완료',
    content: '• 기존 2단계(Step 1 제품별 팔레트화 설정 + Step 2 컨테이너 적재)로 분리되어 있던 복잡한 화면 구조를 [📦 컨테이너 로딩 플랜 및 패킹리스트] 단일 통합 테이블 구조로 전격 일원화\n• 불필요한 별도 설정 테이블을 제거하고, 컨테이너 패킹리스트 테이블 내에서 수량, 포장방식(Pallet/단품 등), 규격(WxLxH), 제조사, 중량/CBM, 분할/합치기/복사/삭제를 즉시 원스톱으로 처리할 수 있도록 최적화\n• [⚡ 제품별 1줄 요약 배정], [📋 1장씩 개별 전개 배정], [🔗 동일 품목 합치기], [✂️ 1장씩 분할] 등 모든 패킹 유틸리티 완벽 연동 유지',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.323',
    version: 'v2.8.323',
    date: '2026-08-22',
    category: '기능개선',
    title: '패킹 및 컨테이너 로딩 플랜 제품별 1줄 요약 배정, 1장씩 전개, 동일 품목 합치기 및 개별 행 분할 기능 구축',
    content: '• Step 2 컨테이너 패킹리스트에서 수십 장의 동일 품목 팔레트(예: JP-30 38 PLT)를 기본 제품별 1줄 요약(범위 1-38, 수량 30,400, 38 PLT, 중량/CBM 합산) 형태로 배정하도록 개선\n• 패킹 배정 버튼을 [⚡ 제품별 1줄 요약 배정]과 [📋 1장씩 개별 전개 배정] 2종으로 분리 제공하여 상황에 맞춘 유연한 패킹 편성 지원\n• 컨테이너 헤더에 [🔗 동일 품목 합치기](동일 규격 제품군을 1-38 범위 1줄로 병합) 및 [✂️ 전체 1장씩 분할](전체 품목을 1장씩 개별 행으로 전개) 기능 탑재\n• 각 품목 행(Row) 우측 동작 컬럼에 [✂️] 분할 버튼을 제공하여 복수 패키지 항목(pkg > 1 또는 범위 1-38)을 원클릭으로 개별 1장씩 즉시 분할할 수 있도록 구현',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.322',
    version: 'v2.8.322',
    date: '2026-08-22',
    category: 'UI/UX',
    title: '이메일 본문 내 긴 URL 텍스트 완전 제거 및 정식 다운로드 카드 버튼 전용 렌더링 최적화',
    content: '• 이메일 발송 시 본문 텍스트에 길게 노출되던 원본 스토리지 URL 문자열을 완전히 제거하여 간결하고 품격 있는 요약 카드 형태로 개선\n• 하단 [📎 정식 전자 문서 다운로드] 전용 카드 버튼을 통해서만 안전하고 편리하게 도착보고서 PDF 및 쉬핑마크 라벨 PDF를 즉시 열람/다운로드하도록 구현\n• 발주서 발행 이메일 및 도착보고서 발행 이메일 양식 일원화 및 최신 버전 반영',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.321',
    version: 'v2.8.321',
    date: '2026-08-22',
    category: '기능개선',
    title: '도착보고서 & 쉬핑마크 라벨 2종 전용 다운로드 카드 레이아웃 이메일 발송 템플릿 통합 반영 및 5개 버튼 간소화',
    content: '• 도착보고 카드 상단 액션 버튼을 필수 5개 버튼([➕ 패킹 행 추가], [🖨️ 도착보고 인쇄], [🏷️ 쉬핑마크 인쇄], [✉️ 메일 발송], [💬 카톡 발송])으로 완전 표준화\n• [✉️ 메일 발송] 및 [💬 카톡 발송] 클릭 시 도착보고서 PDF와 쉬핑마크 라벨 PDF를 백그라운드에서 자동 동시 발행 및 Firebase Storage 영구 보관 연동\n• Outlook 및 모든 이메일 클라이언트에서 도착보고서 PDF 및 쉬핑마크 라벨 PDF 원본 다운로드 전용 2종 카드 버튼 템플릿 완벽 렌더링 지원\n• 거래처 관리 마스터의 CC(참조) 이메일 목록 자동 연동 및 발신자/수신자 정보 완전 동기화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.320',
    version: 'v2.8.320',
    date: '2026-08-22',
    category: '기능개선',
    title: '쉬핑마크 다이아몬드 도형 자동 스케일링, 파렛트 번호(PALLET NO.) 및 총수량 실시간 연동 완료',
    content: '• 쉬핑마크 라벨 및 인쇄물에서 긴 거래처명(예: R.N. SOLICO.)이 다이아몬드 및 외곽 도형 밖으로 벗어나지 않도록 글자수 기반 동적 폰트 크기 자동 계산 및 700px 와이드 다이아몬드 SVG 뷰박스 적용\n• 도착보고서 10) Marks 및 쉬핑마크 라벨의 파렛트 표기를 전체 주문 패킹리스트의 총 파렛트 수량(grandTotalPlt)과 실제 파렛트 번호(it.pkgNo)에 맞추어 PALLET NO. : [현재번호] / [총수량]으로 100% 자동 연동\n• 파렛트 번호 범위(예: 2-3, 4-5) 지정 시 개별 라벨 1장씩 분할 생성하여 출력 및 PDF 저장 지원\n• 도착보고서 인쇄 및 PDF 저장 시 Shipper 대표 담당자(손지연 선임, 02-3463-6732, jyson@twohchem.com) 자동 로딩 및 Remarks 날짜 연동 안정화\n• 공급사 이메일 및 카카오톡 공유 모달에 도착보고서 및 쉬핑마크 라벨 개별 다운로드 링크 지원',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.316',
    version: 'v2.8.316',
    date: '2026-08-22',
    category: '기능개선',
    title: '3D 적재 시뮬레이션 컨테이너 수량(FCL 대수 및 컨테이너별 수량) 자동 연동 및 발주서 금액 숨김(수량만 발주) 옵션 지원',
    content: '• 주문관리(PO) 물류정보의 FCL 컨테이너 상세 정보(예: 20DG 2대 등)를 3D 적재 시뮬레이션 프로그램과 완벽 연동하여 컨테이너 종류 및 대수가 자동으로 반영되도록 구현\n• 공급업체 발주서(PO) 발행 시 금액 없이 품목 및 수량만 표기하여 출력/발행/발송할 수 있는 [금액 숨김 (수량만 발주)] 옵션 추가\n• 실시간 쉬핑마크 미리보기(Live Preview) 비율 및 텍스트 폰트 시인성 대폭 확대\n• Step 3 3D 적재 시뮬레이션 헤더 카드 1줄 컴팩트화 및 불필요 블록 정리',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.313',
    version: 'v2.8.313',
    date: '2026-08-21',
    category: '기능개선',
    title: '도착보고서 공급업체(1. Shipper) 대표 담당자(이름, 전화번호, 이메일) 자동 연동 및 품명 수량단위 kg 표기',
    content: '• 도착보고서 1) Shipper 항목에 등록된 대표 담당자(손지연 선임, 02-3463-6732, jyson@twohchem.com)의 정보가 우선 연동되어 인쇄 및 PDF에 출력되도록 개선\n• 도착보고서 11) Description of Goods 품명에 표시되던 수량단위를 EA에서 kg으로 변경',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.311',
    version: 'v2.8.311',
    date: '2026-08-21',
    category: '기능개선',
    title: '물류정보 입고시간 입력 기능 추가 및 도착보고서 9) Remarks 입고일/입고시간 자동 연동',
    content: '• 물류정보 탭에 [입고시간](기본 오전 10시까지 등) 입력 필드 신설\n• 도착보고서 9) Remarks에 물류정보의 입고일 및 입고시간이 자동으로 결합되어 표시되도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.202',
    version: 'v2.8.202',
    date: '2026-08-07',
    category: '버그수정',
    title: '수출 견적관리(ProformaInvoices) 대시보드 NO. 컬럼 너비 비정상 확장 현구 수정',
    content: '• 기존 사용자 브라우저 localStorage에 저장된 이전 컬럼 너비 설정 파싱 시 NO. 컬럼 너비가 누락(undefined)되어 테이블 열이 비정상적으로 넓어지던 현상을 55px 표준 너비 및 안전 처리로 완벽 수정',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.201',
    version: 'v2.8.201',
    date: '2026-08-07',
    category: '기능개선',
    title: '영업관리 전 메뉴 대시보드(수출/수입/국내 견적 및 주문) 행 번호(NO.) 넘버링 일괄 적용',
    content: '• 영업관리 섹션 내 모든 6개 대시보드(수출 견적/주문, 수입 견적/주문, 국내 견적/주문) 테이블 최좌측에 행 번호(NO.) 컬럼을 일괄 적용하여 시각적 가독성 및 건수 식별 편의성 극대화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.200',
    version: 'v2.8.200',
    date: '2026-08-07',
    category: '기능개선',
    title: '수주 주문관리 대시보드 테이블 최좌측에 행 번호(No.) 넘버링 컬럼 추가',
    content: '• 주문 목록 테이블 가장 좌측에 1번부터 시작하는 순서 넘버링(No.) 컬럼을 추가하여 주문 건수 식별 및 가독성 향상',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.199',
    version: 'v2.8.199',
    date: '2026-08-07',
    category: '기능개선',
    title: 'PO 상세화면과 주문 대시보드 간 진행 현황(done/total 및 다음단계) 데이터 동기화 최적화',
    content: '• 주문 필드 데이터 기반 동적 자동감지(getEffectiveStageCompletion) 로직을 공용 유틸에 구축\n• PO 상세를 열어 수동 저장하지 않은 신규/기존 주문도 대시보드 테이블에서 PO 상세와 100% 동일한 진행률(예: 수주 2/2✓, 전체 2/12 17%) 및 다음 업무 단계가 정확히 계산되어 정밀 일치하도록 동기화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.198',
    version: 'v2.8.198',
    date: '2026-08-07',
    category: '기능개선',
    title: '수주 주문관리 대시보드 테이블에 주문별 5단계 상세 진행 현황(done/total) 시각화 적용',
    content: '• 주문 목록의 [단계] 컬럼에 PO 상세와 동일한 5개 단계(수주, 소싱, 선적, 서류, 정산)의 세부 완료 건수(예: 2/2✓, 1/3 등) 및 전체 진척도(전체 done/total, %)를 정밀 표시하도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.197',
    version: 'v2.8.197',
    date: '2026-08-07',
    category: '기능개선',
    title: 'PO 상세 [정산/결제] 탭 진입 시 첫 번째 업무 단계인 [세금계산서] 서브탭 기본 선택 적용',
    content: '• 기존 정산/결제 클릭 시 정산현황부터 열리던 동선을 업무 프로세스 순서상 첫 번째 단계인 [세금계산서] 서브탭으로 기본 진입되도록 변경하여 편의성 향상',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.196',
    version: 'v2.8.196',
    date: '2026-08-06',
    category: '기능개선',
    title: '위임자 및 자기 스스로 등록/계획한 업무 완료 보고서 작성 모달 면제(예외 처리)',
    content: '• 본인이 위임자(requester)인 업무 및 자기 스스로 계획/등록한 업무 완료 시 완료 보고서 코멘트 작성 팝업 창 없이 바로 완료(DONE) 처리되도록 개선\n• 타인에게 위임받은 업무 완료 시에만 선별적으로 완료 보고서 및 코멘트 작성 모달이 팝업되도록 업무 흐름 최적화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.195',
    version: 'v2.8.195',
    date: '2026-08-06',
    category: '기능개선',
    title: '빠른 업무 등록 시 마감일 필수 입력 검증 및 안내 메시지 팝업 추가',
    content: '• 마감일을 지정하지 않고 업무 등록 버튼/Enter 입력 시 "마감일을 입력해주세요." 경고 메시지가 표시되며 즉시 달력 선택 모달이 자동으로 열리도록 필수 검증 처리',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.194',
    version: 'v2.8.194',
    date: '2026-08-06',
    category: '기능개선',
    title: '마감일 버튼 클릭 시 브라우저 네이티브 달력(showPicker) 강제 팝업 바인딩',
    content: '• 마감일 컴팩트 버튼 클릭 시 HTMLInputElement.showPicker() API를 직접 호출하여 어떤 웹 브라우저 및 디바이스에서도 달력 선택 모달이 100% 동작하도록 보장',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.193',
    version: 'v2.8.193',
    date: '2026-08-06',
    category: '기능개선',
    title: '빠른 업무 등록 입력 바 마감일 트리거 초슬림 컴팩트 UI 최적화',
    content: '• 빠른 업무 등록 입력 바(+ 업무명 입력 후 Enter)에서 기존 넓은 마감일 입력 박스를 컴팩트한 [📅 마감일] 버튼 트리거로 슬림화하여 업무명 타이핑 공간 90% 이상 확보\n• 날짜 선택 시 [📅 MM-DD ✕] 초소형 뱃지로 변경되어 마감일 취소 및 확인이 직관적이며 입력란 텍스트 잘림 현상 완벽 방지',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.192',
    version: 'v2.8.192',
    date: '2026-08-06',
    category: '기능개선',
    title: '마감일 미설정 미완료 업무 카드에 빨간색 [🚨 마감일 등록요..] 안내 뱃지 직관적 적용',
    content: '• 마감일이 지정되지 않은 미완료 업무 카드에 기존 "마감 미정" 대신 빨간색(Red) 경고 스타일의 [🚨 마감일 등록요..] 뱃지가 시각적으로 명확하게 표시되도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.191',
    version: 'v2.8.191',
    date: '2026-08-06',
    category: '기능개선',
    title: '당일 마감일 및 마감 초과 업무 실시간 깜박임(Blink) 효과 및 완료/날짜변경 시 자동 종료 적용',
    content: '• 마감일이 당일이거나 이미 초과된 미완료 업무 카드에 실시간 애니메이션 블링크(🔥 오늘마감: 주황 깜박임 / 🚨 마감초과: 붉은색 깜박임) 적용\n• 업무 상태가 [완료]로 이동하거나, 마감일이 미래 날짜로 변경되는 즉시 깜박임 효과 자동 해제되도록 제어 로직 반영',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.190',
    version: 'v2.8.190',
    date: '2026-08-06',
    category: '기능개선',
    title: 'Dashboard 빠른 업무 등록(Enter) 시 마감일 선택/자동인식 기능 추가 및 카니반 마감일 뱃지 시각화 강화',
    content: '• 대기 업무 및 미배당 업무 빠른 입력란(+ 업무명 입력 후 Enter)에 마감일 날짜 선택(Date Picker) 및 [등록] 버튼 추가\n• 업무명 입력 시 텍스트 내 날짜(예: 8/15 또는 2026-08-15) 입력 자동 감지 및 마감일 자동 세팅 기능 적용\n• 메인 대시보드 칸반 카드에 [📅 마감 YYYY-MM-DD], [🔥 오늘마감], [🚨 마감초과], [📅 마감 미정] 구분 뱃지 적용으로 각 업무별 마감일 명확화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.189',
    version: 'v2.8.189',
    date: '2026-08-05',
    category: '기능개선',
    title: '연월차 관리 승인완료 휴가 데이터 YSACC 스케줄러 달력 및 일정 목록 실시간 자동 연동',
    content: '• [연월차 관리] 메뉴에서 최종 승인완료된 전 직원 연차/반차/시간차 신청 내역을 메인 화면 [YSACC 스케줄러] 달력에 실시간 연동\n• 달력 날짜 셀에 로즈 핑크(Rose) 뱃지 및 표시 아이콘(✈️ [휴가] 이름 (구분)) 적용, [금주의 일정] 및 [월 전체 일정] 카드 목록에 기간/구분/사유/결재 정보 자동 통합 표시',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.188',
    version: 'v2.8.188',
    date: '2026-08-04',
    category: '기능개선',
    title: '고객사 CRM 이력 내 (주)와이에스에이씨씨 vs 영성ACC 발행 주체 별도 구분 및 필터링 적용',
    content: '• 고객사 정보 모달 내 [통합 주문/판매 및 수금 이력] 테이블에 [발행 주체] 컬럼 및 색상 뱃지((주)와이에스에이씨씨 - Blue / 영성ACC - Green) 추가\n• [전체 발행사], [(주)와이에스에이씨씨], [영성ACC] 드롭다운 필터 선택 시 주체별 매출/수금/미수금 금액 및 내역 자동 분리 집계 기능 구현',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.187',
    version: 'v2.8.187',
    date: '2026-08-04',
    category: '기능개선',
    title: '고객사 검색 모달(Subwindow) 열기 시 입력란 텍스트 자동 검색어 반영 연동',
    content: '• 주문/견적/무역관리 양식의 [고객정보] 입력란 옆 [검색] 버튼 클릭 시, 기존에 작성/선택되어 있던 업체명 텍스트가 고객사 검색 팝업 검색창에 자동으로 사전 입력되어 즉시 검색되도록 기능 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.186',
    version: 'v2.8.186',
    date: '2026-08-04',
    category: '버그수정',
    title: '고객사 팝업 이력 내 타 고객사 주문 교차 혼선 매칭 방지 정밀화',
    content: '• 고객사 코드/ID(customerCode/customerId)가 존재하는 주문건의 경우 타 거래처 이력에 혼선 매칭되지 않도록 코드 매칭 우선권 엄격 적용\n• 유사업체명(예: Union / Vina / Factory 등) 부분 키워드 오매칭 방지 로직 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.185',
    version: 'v2.8.185',
    date: '2026-08-04',
    category: '기능개선',
    title: '고객사 정보 [통합 주문/판매 및 수금 이력] 각 주문 행 클릭 시 해당 주문 상세 바로가기 연동',
    content: '• 고객사 정보 팝업의 [통합 주문/판매 및 수금 이력] 테이블 행(또는 CI/문서번호 링크) 클릭 시 해당 수출주문(OrderDetail)/수입주문(ImportDetail)/국내주문 상세 페이지로 즉시 이동 연동\n• 행 마우스 호버 효과 및 CI 번호 링크 아이콘(🔗) 시각화 적용',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.184',
    version: 'v2.8.184',
    date: '2026-08-04',
    category: '버그수정',
    title: '고객사 정보 [통합 주문/판매 및 수금 이력] 수금/입금 금액 실시간 집계 동기화 수정',
    content: '• 주문 상세 [대금 수금 관리 (분할 영수)]에 등록된 수금 내역(paymentCollectedInstallments) 및 최상위 입금 금액 필드가 고객사 CRM 매출/수금 이력 탭에 정확히 집계 반영되도록 수금액 파싱 로직 개선\n• 수금 상태를 [🟢 수금완료 / 🟡 부분수금 / 🔴 미수금]으로 세분화 및 시각적 가독성 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.183',
    version: 'v2.8.183',
    date: '2026-08-04',
    category: '기능개선',
    title: '주문관리 자동 업무 생성 중단 및 기존 자동생성 건 자동 정돈',
    content: '• 주문 변경/저장 시 자동업무([자동] 주문 관리...)가 생성·갱신되지 않도록 비활성화 적용\n• 기존에 자동 생성되었던 주문관리 자동 업무 항목 자동 정리 정돈',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.182',
    version: 'v2.8.182',
    date: '2026-08-04',
    category: '기능개선',
    title: '주문 상세 [📦 주문 기본 정보] 카드 내 ETD (출항예정일) 입력/조회 필드 추가',
    content: '• 주문 상세 상단 [📦 주문 기본 정보] 영역 3번째 줄에 [ETD (출항예정일)] 날짜 선택 및 조회 필드 직관적 추가 적용\n• 수정 모드에서 ETD 일자를 자유롭게 지정·저장 및 물류 프로세스 연동 가능',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.181',
    version: 'v2.8.181',
    date: '2026-08-04',
    category: '기능개선',
    title: '환율 명칭 개편 [BL 선적일자 기준 환율 (서울외국환중개 사이트)] 적용',
    content: '• 기존 [수출면장 기준환율] / [면장상 환율] 레이블 명칭을 사용자 요청에 맞춰 [BL 선적일자 기준 환율(서울외국환중개 사이트)]로 명확히 명칭 변경 적용\n• 주문 상세 및 퀵 수정 모달 등의 관련 UI 레이블 일괄 동기화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.180',
    version: 'v2.8.180',
    date: '2026-08-04',
    category: '기능개선',
    title: '업무 BASKET & 전체업무리스트 완료 보고 팝업 연동 및 위임자 보고서 제출/셀프위임 예외 처리',
    content: '• 업무중 BASKET에서 완료 BASKET으로 드래그 이동 시 [✅ 업무 완료 보고 & 코멘트 작성] 팝업창 자동 연결\n• 타인 위임 업무 완료 시 위임자에게 완료보고서 쪽지/메일 자동 제출 처리\n• 스스로 위임(셀프 생성/담당)된 업무는 위임자 보고서 제출 대상에서 자동 제외 및 팝업 레이블 정리 적용',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.179',
    version: 'v2.8.179',
    date: '2026-08-04',
    category: '기능개선',
    title: 'AI 견적서 초안 생성 엔진 고도화 (동적 바이어 매칭 & DB/이력 상품 검색 연동)',
    content: '• 기존 하드코딩 볼트/너트 응답 방식에서 바이어명 동적 매칭(예: AL BASSAM INDUSTRIES) 및 마스터 상품/과거 주문 이력 DB 연동 구조로 스마트 고도화\n• 프롬프트 입력어(예: Insulation skin 1개씩 등) 키워드 자동 추출 및 해당 바이어의 구매 이력/상품 DB 실시간 검색·리스트업 연동',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.178',
    version: 'v2.8.178',
    date: '2026-08-04',
    category: '기능개선',
    title: '발주서 번호/일자 수정 & 발행 완료된 PO 수정/재발행(v2, v3...) 및 DB 즉시 저장 기능 적용',
    content: '• 공급사별 발주서 번호(PO NO) 및 발주일자(PO Date) 사용자 수동 직접 수정 및 저장 연동 기능 추가\n• 이미 발행완료(✅)된 발주서도 품목, 가격, 수량, 일반사항 수정 후 [✏️ 발주서 수정 & 재발행 (v2...)] 버튼을 눌러 새 차수 PDF로 재발행 가능\n• PDF 재발행 없이 변경 사항만 DB에 저장하는 [💾 발주 내역 저장] 버튼 추가',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.177',
    version: 'v2.8.177',
    date: '2026-08-04',
    category: '버그수정',
    title: '소싱/발주 탭 공급사별 PO 품목 테이블 Drag & Drop 순서 변경 핸들 및 이동 기능 완형 반영',
    content: '• 주문 상세(OrderDetail) 페이지 소싱/발주 탭 내 공급사 카드별 PO 품목 목록 테이블에 Drag & Drop 순서 변경 핸들(⋮⋮) 및 드래그 반응 UI 적용\n• 마우스로 끌어서 공급사 내부 품목 순서를 자유롭게 재배치 가능',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.176',
    version: 'v2.8.176',
    date: '2026-08-04',
    category: '기능개선',
    title: '수주정보(주문 상세 1단계) 발주 품목 목록 Drag & Drop 및 No. 수동 수정 완형 적용',
    content: '• 주문 상세 페이지(OrderDetail)의 수주정보 탭 내 [📦 발주 품목 목록] 테이블에 마우스 Drag & Drop 순서 이동 기능 적용\n• 기존 ▲/▼ 화살표 버튼 제거 및 핸들(⋮⋮) 배치, No. 자유 수정/직접 입력 지원',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.175',
    version: 'v2.8.175',
    date: '2026-08-04',
    category: '기능개선',
    title: '전체 발주(PO)/소싱 품목 테이블 Drag & Drop 순서 변경 및 📋 복사 기능 완성',
    content: '• 주문 등록 모달(NewOrderModal) 및 소싱/발주 상세(OrderDetail) 품목 테이블 전반에 Drag & Drop 순서 변경 UI 적용\n• 번거로웠던 ▲/▼ 화살표 버튼 제거 및 📋 (복사) 아이콘 버튼 및 자유 No. 입력 필드로 일관되게 고도화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.174',
    version: 'v2.8.174',
    date: '2026-08-04',
    category: '신규기능',
    title: '견적서(PI) 품목 행 단위 📋 복사 기능 추가',
    content: '• 견적서 작성/수정 모달 품목 라인 테이블 우측에 📋 (복사) 아이콘 버튼 배치\n• 클릭 시 해당 품목의 코드, 규격, 마진율, 패킹방식 등 모든 세부 옵션이 그대로 복사되어 바로 아래 행에 추가됨\n• 유사한 제품을 반복 입력 시 신속하고 편리하게 작성 가능',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.172',
    version: 'v2.8.172',
    date: '2026-08-04',
    category: '기능개선',
    title: '견적서(PI) 품목 No.(순번) 수동 자유 텍스트/숫자 직접 입력 지원',
    content: '• 견적서 품목 No. 입력란에 10, 1-1, A-1 등 임의의 번호 및 문자를 자유롭게 수동 입력 가능하도록 변경\n• 수동 입력 시 다른 행의 순번이나 위치가 강제로 변경되지 않고 지정한 값이 그대로 유지됨',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.171',
    version: 'v2.8.171',
    date: '2026-08-04',
    category: '기능개선',
    title: '마우스 Drag & Drop 시 품목 No.(순번) 자동 갱신 및 동기화 강화',
    content: '• 품목 행을 드래그 앤 드롭으로 재배치할 때 모든 행의 No. 입력 필드가 실시간 순서대로 완벽하게 연동\n• React Key 및 브라우저 DragEvent 데이터 전송 로직 고도화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.170',
    version: 'v2.8.170',
    date: '2026-08-04',
    category: '신규기능',
    title: '견적서(PI) 품목 No. 컬럼 추가 및 마우스 Drag & Drop 손잡이 적용',
    content: '• 품목 테이블 맨 앞에 No. 컬럼 및 드래그 손잡이(⋮⋮) 신설\n• 복잡했던 우측 화살표(▲/▼) 버튼 제거 후 삭제(✕) 버튼만 깔끔하게 유지',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.169',
    version: 'v2.8.169',
    date: '2026-08-03',
    category: 'UI/UX',
    title: '수출 주문관리(PO) 목록 테이블 11열 복사(📋) 아이콘 컬럼 추가',
    content: '• PO 주문번호 컬럼의 텍스트 잘림 현상을 방지하기 위해 복사 버튼을 11번째 전용 관리 컬럼(60px)으로 이전',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.168',
    version: 'v2.8.168',
    date: '2026-08-03',
    category: '신규기능',
    title: '수출 주문(PO) 복사 등록 기능 구현',
    content: '• 기존 PO 데이터의 바이어, 품목 라인, 운송비 정보를 그대로 복사하여 신규 PO를 손쉽게 작성 가능',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.167',
    version: 'v2.8.167',
    date: '2026-08-03',
    category: '신규기능',
    title: '상품 DB 단일/일괄 선택 삭제 기능 구현',
    content: '• 상품 마스터 DB에서 불필요한 상품을 🗑️ 단일 삭제 또는 다중 체크박스로 일괄 삭제 가능\n• 삭제 시 기존 작성된 과거 견적서/PO의 히스토리 데이터는 유지되도록 안전 처리',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.165',
    version: 'v2.8.165',
    date: '2026-08-03',
    category: 'UI/UX',
    title: '견적서 품목 테이블 격자 교차 행 배경색 적용',
    content: '• 많은 수의 품목 라인 검토 시 시선 가독성을 위해 홀수/짝수 행 배경색을 교차 구분 적용',
    author: '시스템 관리자'
  }
];

export const SystemLogs: React.FC = () => {
  const { userProfile } = useAuth();
  const [logs, setLogs] = useState<SystemLogItem[]>(INITIAL_LOGS);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');

  // Modal State for adding new log
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newLog, setNewLog] = useState<{
    version: string;
    date: string;
    title: string;
    category: '신규기능' | '기능개선' | '버그수정' | 'UI/UX';
    content: string;
  }>({
    version: APP_VERSION,
    date: new Date().toISOString().split('T')[0],
    title: '',
    category: '기능개선',
    content: ''
  });

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const logsRef = collection(db, 'companies', 'YSACC', 'system_update_logs');
      const q = query(logsRef, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const fetched = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as SystemLogItem[];
        // Combine fetched dynamic logs with initial static history, ensuring no duplicates by version/id
        const combined = [...fetched];
        INITIAL_LOGS.forEach(initLog => {
          if (!combined.some(l => l.id === initLog.id || (l.version === initLog.version && l.title === initLog.title))) {
            combined.push(initLog);
          }
        });
        setLogs(combined);
      }
    } catch (err) {
      console.error("Error fetching system logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLog.title.trim() || !newLog.content.trim()) {
      alert("제목과 업데이트 내용을 입력해 주세요.");
      return;
    }

    try {
      const logsRef = collection(db, 'companies', 'YSACC', 'system_update_logs');
      const logData = {
        ...newLog,
        author: userProfile?.name || '시스템 관리자',
        createdAt: serverTimestamp()
      };
      await addDoc(logsRef, logData);
      alert("✅ 시스템 업데이트 로그가 성공적으로 기록되었습니다.");
      setIsModalOpen(false);
      setNewLog({
        version: APP_VERSION,
        date: new Date().toISOString().split('T')[0],
        title: '',
        category: '기능개선',
        content: ''
      });
      fetchLogs();
    } catch (err) {
      console.error("Error saving system log:", err);
      alert("❌ 저장 중 오류가 발생했습니다.");
    }
  };

  const filteredLogs = logs.filter(item => {
    const matchesCategory = selectedCategory === '전체' || item.category === selectedCategory;
    const matchesSearch = searchQuery === '' || 
      item.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryBadgeStyle = (cat: string) => {
    switch (cat) {
      case '신규기능':
        return { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' };
      case '기능개선':
        return { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' };
      case '버그수정':
        return { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' };
      case 'UI/UX':
        return { bg: '#f3e8ff', color: '#6b21a8', border: '#e9d5ff' };
      default:
        return { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'inherit' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
        color: '#ffffff',
        padding: '24px 28px',
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.15)',
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              📜 시스템 업데이트 로그 (System Update Logs)
            </h1>
            <span style={{
              background: '#3b82f6',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: '12px'
            }}>
              현재 버전 {APP_VERSION}
            </span>
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: '13.5px', color: '#94a3b8' }}>
            YSACC 무역관리프로그램의 기능 신설, 개선, 버그 수정 및 시스템 변경 이력을 기록합니다.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            background: '#3b82f6',
            color: '#ffffff',
            border: 'none',
            height: '38px',
            padding: '0 16px',
            borderRadius: '4px',
            fontSize: '13.5px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
            transition: 'background 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
        >
          <span>＋</span> 새 업데이트 로그 기록
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#ffffff',
        padding: '14px 18px',
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {['전체', '신규기능', '기능개선', '버그수정', 'UI/UX'].map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                height: '32px',
                padding: '0 12px',
                borderRadius: '4px',
                border: selectedCategory === cat ? '1px solid #3b82f6' : '1px solid #cbd5e1',
                background: selectedCategory === cat ? '#eff6ff' : '#f8fafc',
                color: selectedCategory === cat ? '#2563eb' : '#475569',
                fontSize: '12.5px',
                fontWeight: selectedCategory === cat ? 750 : 600,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: '260px' }}>
          <input
            type="text"
            placeholder="버전 / 제목 / 내용 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              height: '34px',
              padding: '0 10px 0 32px',
              borderRadius: '4px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              boxSizing: 'border-box'
            }}
          />
          <span style={{ position: 'absolute', left: '10px', top: '8px', color: '#94a3b8', fontSize: '13px' }}>🔍</span>
        </div>
      </div>

      {/* Timeline / List View */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>업데이트 로그를 로드하는 중...</div>
      ) : filteredLogs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', background: '#fff', borderRadius: '6px', border: '1px solid #cbd5e1', color: '#94a3b8' }}>
          검색 조건에 해당되는 업데이트 로그가 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredLogs.map(item => {
            const badge = getCategoryBadgeStyle(item.category);
            return (
              <div
                key={item.id || item.version}
                style={{
                  background: '#ffffff',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  padding: '20px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.03)',
                  transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#93c5fd';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(15,23,42,0.06)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.03)';
                }}
              >
                {/* Log Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{
                      background: '#1e293b',
                      color: '#fff',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontFamily: 'monospace'
                    }}>
                      {item.version}
                    </span>
                    <span style={{
                      background: badge.bg,
                      color: badge.color,
                      border: `1px solid ${badge.border}`,
                      fontSize: '11.5px',
                      fontWeight: 750,
                      padding: '2px 8px',
                      borderRadius: '4px'
                    }}>
                      {item.category}
                    </span>
                    <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                      {item.title}
                    </h3>
                  </div>

                  <div style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>
                    📅 {item.date} {item.author && <span style={{ marginLeft: '6px', color: '#94a3b8' }}>by {item.author}</span>}
                  </div>
                </div>

                {/* Log Content Body */}
                <div style={{
                  background: '#f8fafc',
                  padding: '14px 16px',
                  borderRadius: '4px',
                  border: '1px solid #f1f5f9',
                  fontSize: '13.5px',
                  lineHeight: '1.65',
                  color: '#334155',
                  whiteSpace: 'pre-wrap'
                }}>
                  {item.content}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Log Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '6px',
            width: '560px',
            maxWidth: '92vw',
            border: '1px solid #cbd5e1',
            boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              background: '#fafafa',
              padding: '14px 20px',
              borderBottom: '1px solid #cbd5e1',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                📜 시스템 업데이트 로그 등록
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddLog} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                    버전 (Version) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newLog.version}
                    onChange={e => setNewLog(prev => ({ ...prev, version: e.target.value }))}
                    style={{ width: '100%', height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', padding: '0 8px', fontSize: '13px', fontWeight: 600, boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                    배포 일자 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={newLog.date}
                    onChange={e => setNewLog(prev => ({ ...prev, date: e.target.value }))}
                    style={{ width: '100%', height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', padding: '0 8px', fontSize: '13px', fontWeight: 600, boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                    분류 (Category) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={newLog.category}
                    onChange={e => setNewLog(prev => ({ ...prev, category: e.target.value as any }))}
                    style={{ width: '100%', height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', padding: '0 8px', fontSize: '13px', fontWeight: 600, background: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="신규기능">신규기능</option>
                    <option value="기능개선">기능개선</option>
                    <option value="버그수정">버그수정</option>
                    <option value="UI/UX">UI/UX</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  업데이트 요약 제목 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 견적서 품목 No. 수동 입력 및 드래그 앤 드롭 개선"
                  value={newLog.title}
                  onChange={e => setNewLog(prev => ({ ...prev, title: e.target.value }))}
                  style={{ width: '100%', height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', fontWeight: 600, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  상세 업데이트 내역 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="• 업데이트된 주요 변경 내용 및 개선 사항을 작성해 주세요."
                  value={newLog.content}
                  onChange={e => setNewLog(prev => ({ ...prev, content: e.target.value }))}
                  style={{ width: '100%', borderRadius: '4px', border: '1px solid #cbd5e1', padding: '10px', fontSize: '13px', lineHeight: '1.5', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              {/* Modal Footer Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', height: '34px', padding: '0 16px', borderRadius: '4px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  style={{ background: '#3b82f6', border: 'none', color: '#ffffff', height: '34px', padding: '0 18px', borderRadius: '4px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  로그 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
