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
    id: 'log-v2.8.426',
    version: 'v2.8.426',
    date: '2026-08-24',
    category: 'UI/UX',
    title: '서류 업로드 화면 하단에 실제 발행된 발주서/도착보고서 서류 목록만 깔끔하게 단일 테이블로 간소화',
    content: '• 복잡한 공급업체별 중복 카드 및 폼을 제거하고, 본 주문에서 실제로 발행된 PDF 서류(발주서, 도착보고서, 쉬핑마크)만 심플한 목록 테이블로 표시하도록 UI 대폭 간소화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.425',
    version: 'v2.8.425',
    date: '2026-08-24',
    category: 'UI/UX',
    title: '서류 업로드 및 수출신고 탭 내에 각 공급업체별 발주서/도착보고서/쉬핑마크 통합 서류함 일원화',
    content: '• 서류관리의 하위 탭 구조를 [CI/PL 작성]과 [서류 업로드 및 수출신고] 2개로 유지\\n• [서류 업로드 및 수출신고] 화면 하단에 모든 공급업체의 발주서, 도착보고서, 쉬핑마크 및 PDF 이력 관리 서류함을 통합 배치',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.424',
    version: 'v2.8.424',
    date: '2026-08-24',
    category: '기능개선',
    title: '서류관리 탭 내 각 공급업체별 발주서/도착보고서/쉬핑마크 통합 문서함 신설',
    content: '• 4단계 [서류관리] 탭 내에 [📦 업체별 발주서 / 도착보고서] 하위 탭 및 서류업로드 연동 바로가기 배너 추가\\n• 각 매입/공급업체별 발주서(PO), 도착보고서(Arrival Report), 쉬핑마크 라벨을 한눈에 확인하고 즉시 열람/인쇄/메일전송/카톡공유 및 발행 PDF 파일 다운로드 지원',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.423',
    version: 'v2.8.423',
    date: '2026-08-24',
    category: '기능개선',
    title: '견적서(PI) ➔ 수주(PO) 전환 속도 초고속화 (Batch Write & SPA 즉시 이동)',
    content: '• 수주 전환 시 발생하던 100회 이상의 순차 DB 요청과 브라우저 전체 새로고침(Hard Reload)을 제거\\n• Firestore writeBatch 단일 트랜잭션 및 React Router SPA 즉시 이동으로 전환 소요 시간을 15~20초에서 0.3초 이내로 단축',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.422',
    version: 'v2.8.422',
    date: '2026-08-24',
    category: '버그수정',
    title: 'PI 견적서 수주(PO) 전환 시 다건 품목(46건 등) 전수 100% 매핑 및 누락 방지',
    content: '• 견적서(PI)를 수주로 전환할 때 최신 리비전(R6 등)의 서브컬렉션 및 품목 배열을 전수 탐색하여 46개 등 대용량 품목이 단 1개도 누락 없이 수주 품목으로 100% 완벽히 전환되도록 개편',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.421',
    version: 'v2.8.421',
    date: '2026-08-24',
    category: 'UI/UX',
    title: '발주 품목 목록 상품명 및 입력란 글씨체 일반체(Regular)로 개선',
    content: '• 수주 상세 페이지의 발주 품목 목록 테이블 내 상품코드/상품명 및 수량, 단가, 공급사 입력란 글씨체를 두꺼운 Bold체에서 깔끔한 일반체(fontWeight: 400)로 변경하여 가독성 대폭 향상',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.420',
    version: 'v2.8.420',
    date: '2026-08-24',
    category: '버그수정',
    title: '수주 고유 PI 번호(PI-YSACC-2026-CIE-16 등) 견적서 목록 완전 포함 및 즉시 표시',
    content: '• 수주에 연결된 quotationId가 이전 견적서를 가리키고 있더라도, 고유 PI 번호(PI-YSACC-2026-CIE-16)를 가진 모든 수주건이 견적서 목록에 독립적으로 100% 빠짐없이 표시되도록 필터링 로직 수정',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.419',
    version: 'v2.8.419',
    date: '2026-08-24',
    category: '버그수정',
    title: '수주 데이터 기반 Proforma Invoice(PI) 필드 매핑 정밀화 및 견적 목록 완벽 표시',
    content: '• 수주 문서의 poDate, customer, piNumber, orderNumber 등 다양한 데이터 구조를 정밀하게 매핑하여 수주 확정된 모든 PI가 수출 견적관리 목록에 누락 없이 완벽히 표시되도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.418',
    version: 'v2.8.418',
    date: '2026-08-24',
    category: '신규기능',
    title: '수출 견적관리(PI) 목록과 수주관리(Orders) 양방향 자동 연동 및 전체 인보이스 통합 노출',
    content: '• 수주관리에서 바로 등록되었거나 확정된 오더의 Proforma Invoice(PI)도 수출 견적관리 목록에서 누락 없이 [수주확정] 상태로 자동 통합 노출되도록 개선\\n• 견적서 목록에서 원클릭으로 해당 수주 상세 및 인보이스(PI) 원본 확인/인쇄 지원',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.417',
    version: 'v2.8.417',
    date: '2026-08-24',
    category: '신규기능',
    title: '3D 뷰어 화면 내 마우스 직접 드래그앤드롭 위치 이동 및 실시간 연동 기능 추가',
    content: '• 3D 화면에서도 화물을 마우스로 직접 클릭하고 드래그하여 컨테이너 바닥/벽면 및 인접 화물에 자석 스냅으로 위치를 직관적으로 이동 가능\\n• 3D 드래그 중 하단 수치 패널, 2D 도면, 패킹 리스트 실시간 동기화 및 더블클릭 90° 회전 지원',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.416',
    version: 'v2.8.416',
    date: '2026-08-24',
    category: '버그수정',
    title: '화물 클릭/선택 시 화면 전체가 아래로 튕기듯 스크롤되는 현상 제거',
    content: '• 2D 도면에서 화물 선택 시 하단 패킹 리스트로의 자동 스크롤(scrollIntoView)을 제거하여 화면 위치가 흔들림 없이 고정되도록 수정',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.415',
    version: 'v2.8.415',
    date: '2026-08-24',
    category: '신규기능',
    title: '다단 적재 화물 층별(1단/2단) 분리 보기 및 원클릭 층간/칸 이동 시스템 구축',
    content: '• 2D 도면 상단에 [전체층 (ALL)], [1단 (바닥층)], [2단 (상단층)] 층별 분리 보기 탭 신설로 겹치는 화물도 손쉽게 독립 선택 및 드래그 가능\\n• 1단 화물 이동 시 얹혀진 2단 화물 동반 연동 이동 및 자석 착지 스냅 지원\\n• [⬇️ 1단 착지], [⬆️ 2단 올리기], [◀ 안쪽 1칸], [문쪽 1칸 ▶], [좌/우 정렬] 원클릭 간편 컨트롤 추가',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.414',
    version: 'v2.8.414',
    date: '2026-08-24',
    category: '신규기능',
    title: '컨테이너 시뮬레이터 [↩️ 원상복귀 (초기 배치 리셋)] 버튼 추가',
    content: '• 마우스 드래그 또는 수동 위치 조정 후 언제든지 최초 자동 적재(시뮬레이션) 배치 상태로 즉시 되돌릴 수 있는 원상복귀 버튼 추가 (도면 툴바 상단, 2D 가이드 배너, 위치조정 패널)',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.413',
    version: 'v2.8.413',
    date: '2026-08-24',
    category: '기능개선',
    title: '2D 마우스 드래그 앤 드롭 정밀도 및 스마트 자석 스냅 50mm 그리드 보정',
    content: '• 단순 클릭 시 의도치 않은 미세 위치 변경을 방지하기 위한 최소 이동 임계값(Threshold) 적용\\n• 인접 화물 및 벽면 자석 스냅 감도(100mm) 향상 및 깔끔한 정렬을 위한 50mm 그리드 라운딩 지원',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.412',
    version: 'v2.8.412',
    date: '2026-08-24',
    category: '버그수정',
    title: '3D 컨테이너 시뮬레이터 초기 카메라 초점 및 뷰포트 자동 정렬 최적화',
    content: '• 3D 뷰어 최초 로드 및 탭 전환 시 카메라가 특정 화물에 극도로 확대되거나 틀어지는 문제를 해결하고, 컨테이너 전체 규격에 맞춰 Iso 아이소메트릭 뷰로 자동 줌 및 중앙 정렬되도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.411',
    version: 'v2.8.411',
    date: '2026-08-24',
    category: '기능개선',
    title: '3D 시뮬레이터 패킹 리스트에 PKG NO.(Pallet 번호) 컬럼 연동 및 표시',
    content: '• 컨테이너 패킹리스트의 PKG NO. 번호를 3D 시뮬레이터에 실시간 연계하여 패킹 리스트 테이블 및 인쇄 미리보기에 PKG NO. 전용 컬럼 추가 및 정확한 번호 표시',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.410',
    version: 'v2.8.410',
    date: '2026-08-24',
    category: '버그수정',
    title: '서류관리 탭 렌더링 복구 및 제조사별 개별 문서함 UI 최적화',
    content: '• 서류관리 탭(CI/PL 작성, 서류 업로드 등) 클릭 시 화면이 정상적으로 표시되도록 구조 복구 및 렌더링 정상화\\n• 각 제조사별 도착보고 카드 하단에 전용 발행 문서함 배치 완료',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.409',
    version: 'v2.8.409',
    date: '2026-08-24',
    category: '버그수정',
    title: '컨테이너(CFS) 입고일 및 입고시간 수정 시 실시간 전역 동기화 및 즉시 반영 개선',
    content: '• 포워딩/운송사 탭에서 컨테이너(CFS) 입고일 또는 입고시간 수정 시, 각 제조사별 도착보고서의 비고(Remarks) 및 입고일시(CFS ETA)에 즉시 양방향 실시간 동기화되도록 수정\\n• 도착보고서 인쇄 및 메일/카톡 PDF 생성 시 구버전 비고 텍스트를 최신 입고일시로 자동 치환 및 Firestore에 완벽 저장되도록 안정화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.408',
    version: 'v2.8.408',
    date: '2026-08-24',
    category: '기능개선',
    title: '2D 도면 화물 마우스 직접 드래그앤드롭 위치 이동 & 자석 스냅 & 더블클릭 90° 회전 기능 지원',
    content: '• 3D 컨테이너 시뮬레이터의 2D 도면 뷰(Top/Side)에서 화물을 마우스로 직접 클릭하고 드래그하여 원하는 위치로 직관적으로 이동할 수 있는 인터랙티브 드래그앤드롭 시스템 구현\\n• 컨테이너 내벽(앞/뒤/좌/우) 및 인접 화물 경계면에 착 달라붙는 자석 스냅(Magnetic Snap) 기능 지원\\n• 2D 도면에서 화물 더블클릭 시 즉시 90° 회전(L↔W 교체) 및 실시간 3D/패킹리스트 연동 동기화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.407',
    version: 'v2.8.407',
    date: '2026-08-24',
    category: '기능개선',
    title: '메일 및 카톡 발송 시 최신 데이터 기반 도착보고서 & 쉬핑마크 자동 재생성 및 신규 버전 첨부',
    content: '• 도착보고/쉬핑마크 메일 발송 및 카톡 공유 버튼 클릭 시, 이전 버전 캐시나 구버전 파일에 의존하지 않고 현재 화면의 최신 패킹 데이터, CFS 입고지, 쉬핑마크 설정으로 PDF 문서를 즉시 최신 버전(v2, v3...)으로 재발행하여 유첨 발송하도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.406',
    version: 'v2.8.406',
    date: '2026-08-24',
    category: '버그수정',
    title: '3D 시뮬레이션 FCL 컨테이너 타입 및 대수(수량) 완벽 연동',
    content: '• 포워딩/운송사 선정 탭의 FCL 상세 정보(예: 20DG 2대 등)를 3D 적재 시뮬레이터로 전달 시 컨테이너 종류와 대수를 최우선으로 정확하게 연동하도록 수정\\n• 3D 시뮬레이터 로딩 시 전달받은 컨테이너 수량(setSelectedContainer)을 즉시 활성화하여 복수 컨테이너 적재 시뮬레이션이 자동으로 정상 실행되도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.405',
    version: 'v2.8.405',
    date: '2026-08-24',
    category: '기능개선',
    title: '3D 적재 시뮬레이션 파렛트 위치/회전/맞바꾸기 수동 조정 지원 및 견적서 매입가 입력폭 확대',
    content: '• 3D 컨테이너 적재 시뮬레이터에서 3D 뷰 및 패킹리스트의 파렛트를 클릭하여 X(길이), Y(폭), Z(높이) 위치를 10mm/100mm 단위로 미세 조정 및 90도 회전, 파렛트 간 위치 맞바꾸기(Swap) 기능 전면 추가\\n• 견적서(PI) 품목 테이블의 매입가 컬럼 너비를 대폭 확대(110px→165px)하여 천만 원 단위 이상의 고액 및 긴 숫자가 잘림 없이 완벽히 표시되도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.404',
    version: 'v2.8.404',
    date: '2026-08-24',
    category: '기능개선',
    title: '3D 적재 시뮬레이션 IFRAME_READY 메시지 혼적 통합 페이로드 적용',
    content: '• 3D 시뮬레이션 Iframe 초기 로딩 시(IFRAME_READY 이벤트) 개별 비통합 화물 데이터가 덮어써지던 문제를 완벽 해결하여, 혼적([혼적 N건])된 통합 화물이 정확하게 13개 패키지로 시뮬레이터에 전달되도록 수정',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.403',
    version: 'v2.8.403',
    date: '2026-08-24',
    category: '기능개선',
    title: '3D 적재 시뮬레이션 혼적(Mixed Cargo) 패키지 통합 연동 지원',
    content: '• 패킹리스트에서 여러 품목을 1개의 팔레트/패키지로 합친 혼적([혼적 N건]) 항목을 3D 컨테이너 적재 시뮬레이션 실행 시 개별 품목이 아닌 1개의 통합 팔레트 화물로 규격(WxDxH) 및 중량을 완벽 연동',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.402',
    version: 'v2.8.402',
    date: '2026-08-24',
    category: '기능개선',
    title: '패킹리스트 거래처(유통사/공급사) 우선 반영 및 컬럼명 변경',
    content: '• 패킹리스트의 공급사 컬럼명을 "Supplier (유통사)"로 변경하고, 원 제조사가 아닌 거래처(기본 등록 유통사/공급사명)가 우선적으로 자동 반영되도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.401',
    version: 'v2.8.401',
    date: '2026-08-24',
    category: 'UI/UX',
    title: '전체 테이블 행(Row) 드래그 순서 변경 전용 핸들(⋮⋮, ⠿)로 제한 전면 적용',
    content: '• 수주 상세 품목 라인(Line Items), 소싱/발주 품목, 신규 수주 모달, PI 모달 등 시스템 내 모든 테이블에서 텍스트 입력 및 드래그 선택 시 행이 흔들리거나 드래그되는 현상을 전면 차단하고 오직 좌/우측 전용 드래그 핸들(⋮⋮, ⠿)로만 순서 이동되도록 전면 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.400',
    version: 'v2.8.400',
    date: '2026-08-24',
    category: '기능개선',
    title: '패킹리스트 Pallet 규격(WxLxH) 기반 CBM 자동 정확 계산',
    content: '• 패킹리스트의 Pallet 규격(WxLxH) 및 PKG 수량을 기반으로 CBM이 자동 계산([W×L×H/1,000,000,000]×PKG)되도록 계산 로직 전면 개선 (분할 및 병합 시에도 팔레트별 CBM 정확 계산)',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.399',
    version: 'v2.8.399',
    date: '2026-08-24',
    category: 'UI/UX',
    title: '패킹리스트 드래그앤드롭 동작 영역 제한 (전용 핸들로만 순서 변경 가능)',
    content: '• 테이블 행 전체에 적용되던 드래그 이벤트를 우측 전용 핸들(⠿) 아이콘으로만 한정하여, 텍스트박스 클릭 및 텍스트 선택/수정 시 테이블이 불안정하게 흔들리거나 드래그되는 현상 완벽 방지',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.398',
    version: 'v2.8.398',
    date: '2026-08-24',
    category: 'UI/UX',
    title: '패킹리스트 품목별 제조사(Manufacturer) 실시간 즉시 동기화',
    content: '• 상품 마스터(Product Modal)에서 제조사/공급사를 변경 및 저장 시 패킹리스트 테이블의 제조사(Manufacturer) 컬럼 및 수주 품목 정보에 즉시 실시간 동기화 반영되도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.397',
    version: 'v2.8.397',
    date: '2026-08-24',
    category: 'UI/UX',
    title: '물류/선적 탭 컨테이너(CFS) 입고시간 입력 필드 복원 및 연동',
    content: '• 물류/선적 탭의 컨테이너(CFS)입고일 옆에 [입고시간](기본값: 오전 10시까지) 입력 필드를 추가/복원하여 도착보고서 9) Remarks에 입고일과 입고시간이 완벽히 반영되도록 연동',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.396',
    version: 'v2.8.396',
    date: '2026-08-24',
    category: 'UI/UX',
    title: '도착보고 담당자 및 이메일 정보 로그인 사용자 기반 동적 자동 반영',
    content: '• 도착보고(Arrival Report) 생성/수정/인쇄 시 Consignee 담당자란에 고정된 이름 대신 현재 로그인한 사용자의 이름(담당자)과 이메일 주소(E-mail)가 자동으로 정확히 반영되도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.395',
    version: 'v2.8.395',
    date: '2026-08-23',
    category: 'UI/UX',
    title: '쉬핑마크 도형(다이아몬드 외) 크기 및 내부 텍스트 최대화',
    content: '• 쉬핑마크 상단 도형(다이아몬드, 사각형, 원형, 삼각형)의 가로/세로 크기를 용지 및 캔버스 폭을 가득 채우도록 최대화하고, 내부 회사명 폰트와 선 굵기도 균형 있게 확대 (라벨 인쇄, 미리보기, Excel 동시 적용)',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.394',
    version: 'v2.8.394',
    date: '2026-08-23',
    category: 'UI/UX',
    title: '쉬핑마크 하단 3개 텍스트 크기를 초대형(52pt/44pt)으로 대폭 확대',
    content: '• 쉬핑마크 하단 3개 행(도착항/국가, PALLET NO, 원산지)의 글씨 크기를 A4 가로 폭의 약 70~80%에 달하는 초대형 폰트(인쇄 시 52pt / 화면 44pt Extra Bold)로 대폭 확대하여 멀리서도 확연히 보이도록 가독성 극대화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.393',
    version: 'v2.8.393',
    date: '2026-08-23',
    category: 'UI/UX',
    title: '쉬핑마크 하단 텍스트(3개 행)를 모두 동일한 최대 크기 및 굵기로 일원화',
    content: '• 쉬핑마크 하단의 3개 정보(도착항/국가, PALLET NO, 원산지) 글씨 크기를 모두 동일한 초대형 굵은 폰트(Extra Bold)로 일원화하여 시인성과 가독성을 극대화 (Excel 생성, 미리보기 화면, 대형 라벨 인쇄 동시 적용)',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.392',
    version: 'v2.8.392',
    date: '2026-08-23',
    category: 'UI/UX',
    title: '쉬핑마크 인쇄 팝업 창 스크롤바 제거 및 반응형 뷰포트 맞춤 렌더링',
    content: '• 쉬핑마크 인쇄/출력 팝업 창에서 화면 높이 초과로 인해 발생하던 스크롤바를 완전히 제거하고, 화면 뷰포트 크기에 딱 맞춰 한눈에 시원하게 보이도록 반응형 스타일링 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.391',
    version: 'v2.8.391',
    date: '2026-08-23',
    category: 'UI/UX',
    title: '쉬핑마크 하단 텍스트(도착항/국가, PALLET NO, 원산지) 글씨 크기 확대',
    content: '• 쉬핑마크 도형 하단에 표기되는 도착항/국가, PALLET NO.(강조), MADE IN KOREA 텍스트 폰트 크기를 비율에 맞춰 시원하고 큼직하게 확대 개선 (Excel 생성, 미리보기 화면, 대형 라벨 인쇄 동시 적용)',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.390',
    version: 'v2.8.390',
    date: '2026-08-23',
    category: 'UI/UX',
    title: '쉬핑마크 도형 내 회사명 글씨 크기 최대화(도형을 벗어나지 않는 최적 크기)',
    content: '• 쉬핑마크 다이아몬드/도형 내부의 텍스트(회사명)를 도형 테두리를 벗어나지 않는 최대 크기로 키워 한눈에 시원하고 또렷하게 보이도록 개선 (Excel 생성, 미리보기 화면, 라벨 인쇄 동시 적용)',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.389',
    version: 'v2.8.389',
    date: '2026-08-23',
    category: 'UI/UX',
    title: '쉬핑마크 도형 테두리 선 색상을 검은색(#000000)으로 일원화',
    content: '• 대형 쉬핑마크 출력/라벨 인쇄 시 다이아몬드/원형/사각형 등의 테두리선이 파란색으로 표시되던 부분을 선명한 검은색(#000000)으로 변경',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.388',
    version: 'v2.8.388',
    date: '2026-08-23',
    category: 'UI/UX',
    title: '쉬핑마크 원본 비율 유지 고정(종횡비 왜곡 및 과도한 상하 늘어남 방지)',
    content: '• CI 및 PL 쉬핑마크 이미지를 병합 셀 높이에 맞춰 왜곡하여 늘리지 않고, 본래 고유 비율(정비율) 그대로 상단에 선명하게 고정 렌더링되도록 개선',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.387',
    version: 'v2.8.387',
    date: '2026-08-23',
    category: 'UI/UX',
    title: '표 빈 행(Empty Rows)을 단일 병합 블록이 아닌 각 행별 개별 행/열 구조로 복원',
    content: '• 빈 품목 영역을 통으로 합치지 않고, 각 행마다 품명(C~H) 및 수량/단위/단가/금액(I, J, K, L)의 개별 행/열 구조를 유지하면서 내부 테두리선만 제거하여 자연스러운 엑셀 셀 그리드 유지 (Excel 및 미리보기 동시 적용)',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.386',
    version: 'v2.8.386',
    date: '2026-08-23',
    category: 'UI/UX',
    title: 'CI 품목 표 데이터 영역 내부의 모든 테두리(가로/세로선) 완전 제거',
    content: '• Commercial Invoice 품목 표 본문(일반 품목, 빈 여백, 운송비 행 전체) 내부의 모든 가로 격자선 및 세로 칸구획선을 제거하여, 테이블 외곽선 및 쉬핑마크 구분선만 남기고 깔끔한 무역 표준 서식으로 개선 (Excel 및 미리보기 동시 적용)',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.385',
    version: 'v2.8.385',
    date: '2026-08-23',
    category: 'UI/UX',
    title: '표 빈 영역 완전 여백 처리(가로/세로 모든 내부선 제거) 및 styles.xml 숫자서식(numFmt) 표준화로 복구 팝업 최종 완벽 해결',
    content: '• CI 품목 표 빈 줄 영역의 모든 가로/세로 내부 분할선을 제거하여 완전한 빈 여백 블록으로 매끄럽게 정리\\n• Excel styles.xml 오류 원인이었던 비표준 통화 서식 문자열(US$#,##0.00 등)을 엑셀 표준 서식($#,##0.00 및 텍스트 조합)으로 전면 교체하여 엑셀 실행 시 스타일 복구 경고창 완벽 제거',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.384',
    version: 'v2.8.384',
    date: '2026-08-23',
    category: 'UI/UX',
    title: '표 빈 줄(Empty Rows) 내부 세로 칸구획 완벽 제거 및 엑셀 그리기(drawings) XML 스키마 검증 오류 근본 해결',
    content: '• CI 품목 표 빈 줄(Empty Rows)에 표시되던 품명/수량/단가 등의 세로 격자선(칸구획)을 모두 제거하여 완전한 빈 칸 영역으로 깔끔하게 통합\\n• 엑셀 열기 시 발생하던 drawings(도형/이미지) 및 styles.xml 검증 오류의 원인이었던 이미지 앵커 부동소수점 좌표를 엄격한 OpenXML 정수 앵커 규격으로 정정하여 경고 없이 100% 정상 실행되도록 수정',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.383',
    version: 'v2.8.383',
    date: '2026-08-23',
    category: '버그수정',
    title: 'Excel styles.xml 복구 오류 해결 및 쉬핑마크 왜곡/비율 완벽 수정',
    content: '• Excel 열기 시 styles.xml 서식 복구 오류 원인이었던 border 객체 미정의 속성 직렬화 버그 완벽 제거\\n• 쉬핑마크(Shipping Mark)가 병합 셀 높이에 따라 상하로 길게 늘어지거나 왜곡되던 현상을 ext(고정 픽셀 규격 1:1.1 비율) 렌더링으로 변경하여 왜곡 없는 선명한 다이아몬드/텍스트 그래픽으로 최적화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.382',
    version: 'v2.8.382',
    date: '2026-08-23',
    category: 'UI/UX',
    title: 'CI/PL 서식 전면 개선: Tahoma 폰트 적용, 제목 및 전체 글씨 확대, 고해상도 쉬핑마크, 표 HS CODE 제거 및 빈줄/운송비/Total 배치 최적화, 서명란 확장',
    content: '• 문서 제목(Commercial Invoice / Packing List)을 18pt(2pt 확대)로 키우고 전체 기본 폰트를 Tahoma로 일괄 전환 및 글씨 크기 상향\\n• 쉬핑마크(Shipping Mark) 그래픽 해상도 및 선 두께, 회사명/텍스트 크기를 대폭 키워 시인성 강화\\n• CI 품목 표에서 불필요한 HS CODE 열을 제거하여 품명(Description) 열을 넓히고, HS CODE는 하단 요약란에만 표시\\n• 표 중간에 자동 빈 줄(Empty Rows)을 배치하여 운송비(Freight)와 TOTAL AMOUNT가 표 최하단에 위치하고 A4 용지가 꽉 차도록 레이아웃 최적화\\n• Signed by (서명 및 직인) 영역의 높이 및 공간을 대폭 확장하여 서명/날인 여유 공간 확보 (Excel 및 화면 미리보기 동시 적용)',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.381',
    version: 'v2.8.381',
    date: '2026-08-23',
    category: 'UI/UX',
    title: 'CI / PL 서식(Excel 및 PDF/미리보기) 각 항목 블록의 제목과 내용 합산 바깥쪽 테두리(Outer Border)만 적용',
    content: '• 상단 헤더의 각 블록(Shipper, Applicant, Notify, Remarks, Invoice No, LC No, 포트, 출항정보 등) 내부의 제목-내용 사이 가로 분할선을 제거하고, 블록 전체 바깥쪽 테두리만 깔끔하게 표시되도록 통일 적용 (Excel 및 화면 미리보기 동시 적용)',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.380',
    version: 'v2.8.380',
    date: '2026-08-23',
    category: 'UI/UX',
    title: 'CI / PL 서식(Excel 및 PDF/미리보기) 각 부제목(Label)과 내용(Value) 셀 독립 구획 및 Invoice/LC 번호 분리',
    content: '• 상단 5x2 헤더 영역의 모든 부제목을 1행 독립 칸(Bold)으로 분리하고, 실제 내용 데이터는 바로 아래 별도 내용칸(Regular)으로 구획화\\n• Invoice No. & Date와 L/C No. & Date를 각각 독립된 박스로 분리하여 개별 테두리 및 칸 구획 완성 (Excel 및 화면 미리보기 동시 적용)',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.379',
    version: 'v2.8.379',
    date: '2026-08-22',
    category: 'UI/UX',
    title: 'CI / PL 서식(Excel 및 PDF/미리보기) 각 칸들의 제목(Header/Title)만 BOLD 처리 및 내용 가는 글씨체(Regular) 일원화',
    content: '• Commercial Invoice 및 Packing List의 상단 5x2 정보 그리드, 테이블 헤더, 하단 세부섹션 타이틀만 볼드(Bold)체로 유지\\n• 품명, HS Code, 수량, 단가, 금액, 인보이스번호/날짜, 바이어 주소, 출항정보 등 모든 데이터 셀 내용은 가는 글씨체(Regular)로 완벽하게 통일 적용',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.378',
    version: 'v2.8.378',
    date: '2026-08-22',
    category: 'UI/UX',
    title: '등록된 쉬핑마크(도형+회사명+항구+수량)를 CI/PL 서식에 실제 그래픽 이미지로 삽입 연동',
    content: '• 화면 인쇄 미리보기 모달의 CI 및 PL 서식 Shipping Mark 영역에 실제 다이아몬드/도형 및 텍스트가 포함된 그래픽 SVG 렌더링 적용\\n• Excel 다운로드 시에도 Shipping Mark 영역에 고해상도 그래픽 마크 PNG 이미지를 자동 생성하여 엑셀 시트에 완벽하게 삽입',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.377',
    version: 'v2.8.377',
    date: '2026-08-22',
    category: 'UI/UX',
    title: '쉬핑마크(Shipping Mark) PALLET NO 포맷 "총포장수/총포장수" 표기 적용',
    content: '• 실시간 쉬핑마크 미리보기 및 CI/PL 서식 쉬핑마크의 팔레트 번호 라인을 "PALLET NO. : [총수량] / [총수량]"(예: PALLET NO. : 5 / 5) 포맷으로 일원화 적용',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.376',
    version: 'v2.8.376',
    date: '2026-08-22',
    category: 'UI/UX',
    title: '패킹 및 컨테이너로딩플랜 내 불필요한 구형 "PL 미리보기 및 PDF 저장" 버튼 정리/제거',
    content: '• CI/PL 탭으로 서식 미리보기 및 Excel 다운로드가 일원화됨에 따라 로딩플랜 상단의 중복/구형 PL 미리보기 버튼 제거',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.375',
    version: 'v2.8.375',
    date: '2026-08-22',
    category: 'UI/UX',
    title: '서류관리 탭 명칭 간소화(CI/PL 작성) 및 탭 우선 배치 순서 변경',
    content: '• "CI / PL 작성 및 Excel 내보내기" 탭 명칭을 간결하게 "CI/PL 작성"으로 변경\\n• 서류관리 진입 시 "CI/PL 작성" 탭을 1순위(첫 번째 탭)로 우선 배치하고, "서류 업로드 및 수출신고" 탭을 2순위로 순서 재배치',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.374',
    version: 'v2.8.374',
    date: '2026-08-22',
    category: 'UI/UX',
    title: 'CI 인쇄 미리보기 화면과 생성된 Excel 서식 간 컬럼 및 데이터 100% 일치 동기화',
    content: '• 미리보기 모달의 CI 테이블을 Excel 서식과 동일한 7개 컬럼(Shipping Mark, Description, HS Code, Quantity, Unit, Unit Price, Amount)으로 개편\\n• 인보이스 번호(Invoice No.)가 PI 번호로 대체 표시되던 현상을 수정하여 Excel과 1:1 완벽 일치',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.373',
    version: 'v2.8.373',
    date: '2026-08-22',
    category: '버그수정',
    title: 'CI 탭 품명 수정 시 실시간 즉시 저장 및 원본 품명으로 되돌아가는 현상 완벽 차단',
    content: '• CI 탭 품명 편집 시 즉각적인 Firestore 비동기 저장 및 상태 보존 처리\\n• onSnapshot 및 useEffect 의존성 루프로 인해 편집 도중 원본 품명으로 롤백되던 현상 원천 차단',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.372',
    version: 'v2.8.372',
    date: '2026-08-22',
    category: '기능개선',
    title: 'Commercial Invoice (CI 탭) 품명 및 사양 자유 수정 및 영구 저장 완벽 연동',
    content: '• 수주/발주 품목에서 CI 서식으로 불러온 후에도 품명(Description of Goods)을 사용자가 원하는 형태로 자유롭게 직접 수정/편집 가능\\n• 수정된 품명 및 CI 데이터가 오더 저장(기본정보/패킹플랜) 시 Firestore에 안전하게 영구 저장되어 인쇄 및 Excel 다운로드에 100% 반영',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.371',
    version: 'v2.8.371',
    date: '2026-08-22',
    category: 'UI/UX',
    title: 'CI / PL 서식 상단 5x2 정보 헤더 볼드체(굵은 글씨) 스타일 정밀 정돈',
    content: '• CI 및 PL 서식 상단 5x2 헤더 그리드에서 항목 라벨(제목) 및 당사/고객사 회사명만 굵은 글씨(Bold)로 유지하고, 나머지 세부 데이터 값(선적항, 양하항, 결제조건, 모선명, 출항일, 인도조건, 번호 및 일자 등)은 일반 폰트(Regular)로 전환하여 시각적 가독성 극대화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.370',
    version: 'v2.8.370',
    date: '2026-08-22',
    category: '기능개선',
    title: 'Packing List (PL 탭) 상단 품목 안내문 (Intro Text) 편집 및 CI/LC 실시간 양방향 연동 추가',
    content: '• PL 서식 탭 첫 번째 컨테이너 품목 상단에 [📝 상단 품목 안내문 (INTRO TEXT)] 편집란 추가\\n• L/C 물품 설명(Description) 또는 CI 탭에서 입력/수정한 안내문구가 PL 탭과 실시간 양방향 동기화되어 즉시 반영 및 수정 가능',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.369',
    version: 'v2.8.369',
    date: '2026-08-22',
    category: '기능개선',
    title: 'Packing List 서식 및 PL 편집 탭 내 합쳐진 혼적 PKG 통합 표현 완벽 동기화',
    content: '• 패킹 및 컨테이너로딩플랜에서 합쳐진(혼적) PKG 데이터를 CI/PL 작성 화면의 [PL 탭], 인쇄 미리보기 모달, Excel 2번째 시트(Packing List)에 100% 동일하게 1개 패키지 단위로 묶어서 표현\\n• PL 탭 테이블에서 혼적 패키지는 번호 및 중량/용적 셀을 병합(rowSpan)하여 일관된 시각화 제공',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.368',
    version: 'v2.8.368',
    date: '2026-08-22',
    category: '버그수정',
    title: 'Letterhead(회사 레터헤드) 포함/미포함 체크 토글 실시간 미리보기 및 Excel 연동 버그 수정',
    content: '• 화면 및 미리보기 모달 상단 [🏢 Letterhead 포함] 체크 해제 시, 미리보기 서식과 엑셀 시트에서 상단 레터헤드 이미지/텍스트가 즉시 완벽 제거되도록 상태 동기화 및 렌더링 조건문 수정 완료',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.367',
    version: 'v2.8.367',
    date: '2026-08-22',
    category: '기능개선',
    title: '발주서/도착보고/쉬핑마크 이메일 발송 시 발신자/수신자 순수 이메일 주소(Address Only) 적용',
    content: '• 이메일 발송 시 발신자(Sender) 및 수신자(To) 항목에서 직책/이름/회사명 접미사(예: 김주한 관리자 (YSACC))를 배제하고 순수 메일 주소(예: jhkim1130@ysacc.co.kr)만 전송되도록 최적화 완료',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.366',
    version: 'v2.8.366',
    date: '2026-08-22',
    category: 'UI/UX',
    title: '팀원 관리(Team Management) 내 영문이름(English Name) 컬럼 및 등록/수정 항목 추가',
    content: '• 팀원 관리 테이블에 [영문이름] 컬럼 추가 및 신규 팀원 추가/수정 모달에 영문이름 입력란 연동 완료\\n• 입력된 영문이름은 사용자 정보 DB 및 서식 작성 연동에 일관되게 활용 가능',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.365',
    version: 'v2.8.365',
    date: '2026-08-22',
    category: 'UI/UX',
    title: 'Packing List 하단 비고란(PL Remarks / 특약 문구) 편집 및 서식 출력 기능 추가',
    content: '• PL 서식 편집 탭 하단에 [📝 Packing List 하단 비고 및 추가 특약 문구 (PL Remarks)] 편집란 및 예시 문구(ISPM 15 목재 소독 증명, PO 번호 등) 버튼 추가\\n• 입력된 비고 문구는 Packing List 인쇄 미리보기 및 Excel 2번째 시트 하단에 자동 정렬되어 출력',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.364',
    version: 'v2.8.364',
    date: '2026-08-22',
    category: 'UI/UX',
    title: 'Company Letterhead 포함/미포함 선택 옵션(체크박스) 완벽 지원',
    content: '• 화면 상단 액션바 및 미리보기 모달 상단에 [🏢 Letterhead 포함] 체크박스 옵션 추가\\n• 레터헤드 미선택 시 상단 회사 로고 이미지를 제외하고 바로 본문 서식(Commercial Invoice / Packing List)부터 시작하는 간소화 서식으로 Excel 생성 및 인쇄 지원',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.363',
    version: 'v2.8.363',
    date: '2026-08-22',
    category: 'UI/UX',
    title: 'CI / PL 서식 작성 화면 하단 [CI 탭] 및 [PL 탭] 독립 분할 UI 적용',
    content: '• 상단 기본 5x2 서식 그리드 하부에 [📄 Commercial Invoice (CI)] 및 [📦 Packing List (PL)] 탭 버튼 추가\\n• CI 선택 시 선적 품목/운임 및 하단 Sections A/B/C 문구 편집, PL 선택 시 컨테이너별 패키지/중량/용적 상세 편집 및 실시간 집계 요약 독립 분할 제공',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.362',
    version: 'v2.8.362',
    date: '2026-08-22',
    category: 'UI/UX',
    title: '패킹리스트(Packing List) 정식 규격 서식(컨테이너별 팔레트 상세/서명/집계) 완벽 구축',
    content: '• 요청하신 공식 Packing List 양식에 맞춰 [Shipping Marks | Description of Goods & Quantity / Packages | Net Weight (KGS) | Gross Weight (KGS) | Measurement (CBM)] 5열 구조 구축\\n• 컨테이너별 좌측 셀(Shipping Mark / Container No / Seal No) 병합 및 각 행별 `P#1 JP-30-800KG` 패키지 상세 내역, Total GT / KGS / CBM 집계 완벽 연동',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.361',
    version: 'v2.8.361',
    date: '2026-08-22',
    category: 'UI/UX',
    title: '패킹리스트(Packing List) 및 CI 전반 `(완제 Pallet)` 등 내부 표기 완전 자동 제거',
    content: '• 패킹 및 컨테이너로딩플랜 UI 편집 화면 및 CI/PL 인쇄/Excel 내보내기 전반에서 `(완제 Pallet)`, `(완제)`, `(완제품)`, `(반제품)` 등 내부 식별 문구를 자동으로 정제하여 바이어용 순수 품명(예: JP-30)만 깔끔하게 표시',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.360',
    version: 'v2.8.360',
    date: '2026-08-22',
    category: 'UI/UX',
    title: '쉬핑마크(Shipping Mark) PALLET NO 포맷 간소화 (PALLET NO. : 39)',
    content: '• 쉬핑마크의 팔레트 번호 라인을 기존 `1-39 / 39` 대신 요청에 맞춰 총 수량 단일 표기(`PALLET NO. : 39`)로 간소화 적용',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.359',
    version: 'v2.8.359',
    date: '2026-08-22',
    category: 'UI/UX',
    title: 'Excel CI/PL 쉬핑마크(Shipping Mark) 최신 포맷(도형기호, 회사명, 항구, PALLET NO, 원산지) 완벽 반영',
    content: '• Excel 내보내기 시 Shipping Mark 영역에 설정된 도형 기호(◇, ○, □, △), 바이어/회사명, 도착항/국가, 포장 개수 기반 PALLET NO(예: PALLET NO. : 1-39 / 39), MADE IN KOREA가 온전히 포함되도록 연동 완료',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.358',
    version: 'v2.8.358',
    date: '2026-08-22',
    category: 'UI/UX',
    title: 'Excel A4 Letterhead 폭(108pt) 일치 및 텍스트 잘림 없는 여유로운 행 높이 보장',
    content: '• 전체 인쇄 폭을 Letterhead 이미지 규격(A1~L4, 총 108.0pt)과 100% 동일하게 맞춰 우측 여백 초과 현상 완벽 해결\n• Unit Price, Gross Wt 등 테이블 헤더 글자가 잘리지 않도록 컬럼폭 정밀 배분\n• Shipper(64pt), Applicant(52pt), Remarks(54pt+), Payment Terms(38pt) 등 다단 텍스트가 시원하게 다 보이도록 충분한 칸 높이 확보',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.357',
    version: 'v2.8.357',
    date: '2026-08-22',
    category: 'UI/UX',
    title: 'Excel 및 서식 제목/회사명/항목별 굵은 글씨(Bold) 적용 및 A4 페이지 최적화',
    content: '• Excel 및 미리보기 모달의 섹션 타이틀(Shipper, Applicant, Notify, 항구, 결제조건 등), 회사명, 인보이스 번호, 품목명, 합계 등에 리치 텍스트 굵은 글씨(Bold) 완벽 적용\n• 글씨 크기 축소 없이 표준 주문건이 A4 1페이지 내에 최적으로 수용되도록 여백 및 행 간격 최적화 (초과 항목은 다중 페이지로 자연스럽게 연속 출력)',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.356',
    version: 'v2.8.356',
    date: '2026-08-22',
    category: 'UI/UX',
    title: '웹 화면 CI/PL 기본 정보 입력 섹션을 실제 서식과 1:1 일치하는 5단 그리드로 전면 개편',
    content: '• 기존 2개로 분리되었던 기본정보/주소정보 박스를 실제 Commercial Invoice 서식과 동일한 5단 구조(Shipper vs InvNo/Date, Applicant vs Bank, Notify vs Remarks, 3분할 항구/결제조건, 3분할 선박/ETD/인코텀즈)로 완벽 일치화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.355',
    version: 'v2.8.355',
    date: '2026-08-22',
    category: 'UI/UX',
    title: 'Excel CI/PL 상단 2분할(50:50) 및 3분할(33.3:33.3:33.3) 균등 폭 완벽 수학적 규격화',
    content: '• 12열 표준 베이스 그리드(각 9.5pt)를 기반으로 상단 Row 1~3(Shipper, Applicant, Notify)은 정확히 50%:50%(6열:6열) 균등 분할 적용\n• Row 4~5(선적항/도착항/결제조건, 모선/ETD/인코텀즈)는 정확히 33.3%:33.3%:33.3%(4열:4열:4열) 균등 폭 적용',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.354',
    version: 'v2.8.354',
    date: '2026-08-22',
    category: 'UI/UX',
    title: '거래 당사자 주소창 리사이즈 지원 및 상단 품목 안내문(Intro Text) 위치 조정',
    content: '• Shipper, Applicant, Notify Party 주소 입력창을 상하 크기조절(Resizable Textarea)이 가능하도록 개편\n• 상단 품목 안내문(Intro Text)을 품목 테이블 헤더와 1번 품목 행 사이로 재배치하여 실제 인보이스 서식과 100% 직관적으로 일치화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.353',
    version: 'v2.8.353',
    date: '2026-08-22',
    category: '기능개선',
    title: 'CI 선적 품목 포워딩 운송비 기본 자동 포함 및 자유 수정 지원',
    content: '• 포워딩/운송사 & 운송비에 등록된 운송사명 및 발주금액(USD)을 기반으로 CI 품목 목록에 운송비 항목(CIF CHARGES)을 기본 자동 표시\n• 운임추가 버튼 제거 및 운송비 품명·단위·금액 자유 수정 지원',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.352',
    version: 'v2.8.352',
    date: '2026-08-22',
    category: '기능개선',
    title: 'Packing List 및 CI 상단 5x2 그리드 분할 정렬 완벽 반영 및 품명 내부코드 정제',
    content: '• CI 및 PL 상단 5x2 그리드에서 선적항/도착항/결제조건 및 모선/ETD/인코텀즈 1/2 분할 정렬 및 충분한 행 높이 반영\n• 품명에서 (완제 Pallet), (반제품) 등 사내 내부 식별 코드를 자동으로 정제하여 바이어 제출용 서식으로 생성',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.351',
    version: 'v2.8.351',
    date: '2026-08-22',
    category: '기능개선',
    title: 'CI / PL Excel 셀 높이·여백 최적화 및 깨끗한 공식 레터헤드 교체',
    content: '• Shipper, Applicant, Notify, Remarks, 항구 및 선적 정보 행 높이를 48~58pt로 확대하여 텍스트 겹침/잘림 현상 완전 해소\n• 라벨과 데이터 간 줄바꿈(개행) 적용 및 공식 레터헤드 이미지 바인딩',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.350',
    version: 'v2.8.350',
    date: '2026-08-22',
    category: '버그수정',
    title: 'CI / PL Excel 내보내기 동적 레이아웃 개편 및 실무 상업용 완벽 규격화',
    content: '• ExcelJS 셀 병합 충돌 버그 수정 (레터헤드 이미지 삽입 후 발생하던 빈 시트 오류 완벽 해결)\n• A4 인쇄 규격에 맞춘 7열 너비 최적화, 5x2 기본 서식 그리드, 통화 서식($), 이중 밑줄 합계선, Section A/하단 비고 동적 줄바꿈 완벽 적용',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.349',
    version: 'v2.8.349',
    date: '2026-08-22',
    category: '기능개선',
    title: '자사 정보관리 레터헤드(Letter Head) 등록 기능 추가 및 CI / PL 상단 서식 자동 연동',
    content: '• 자사 정보관리(영성ACC / YSACC)에 레터헤드(Letter Head) 이미지 파일 업로드/관리 기능 추가\n• Commercial Invoice(CI) 및 Packing List(PL) 상단에 등록된 자사 공식 레터헤드 이미지를 자동 바인딩하여 엑셀 및 미리보기에 반영',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.348',
    version: 'v2.8.348',
    date: '2026-08-22',
    category: '기능개선',
    title: '상품DB 기본 HS CODE 연동 및 거래처별 커스텀 HS CODE 자유 수정/초기화 보장',
    content: '• 상품 마스터 DB에서 기본 HS CODE를 자동으로 가져오되, 사용자가 거래처/인보이스별로 HS CODE를 자유롭게 수정, 변경, 지우기 가능하도록 상태 업데이트 핸들러 개선\n• 수정된 품목별 HS CODE가 Section A) 및 정식 Excel에 실시간 동기화',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.347',
    version: 'v2.8.347',
    date: '2026-08-22',
    category: '기능개선',
    title: 'CI 하단 Section A(필수) 유지 및 B, C 등 후속 신고 문구 대형 자유 입력란 구축',
    content: '• Section A) HS CODE 요약(필수) 아래에 사용자가 원하는 모든 추가 신고/인증 문구(B, C 등)를 제한 없이 자유롭게 작성할 수 있는 대형 자유 입력 텍스트 영역 구축\n• 엑셀 및 미리보기에서 작성된 문구가 규격에 맞춰 자동 줄바꿈 및 서식 반영되도록 지원',
    author: '시스템 관리자'
  },
  {
    id: 'log-v2.8.346',
    version: 'v2.8.346',
    date: '2026-08-22',
    category: '기능개선',
    title: 'REMARKS 표준 문구 관리 시스템 구축 (신규등록/선택/변경/수정/삭제 & Firestore 동기화)',
    content: '• Remarks 표준 문구 선택 드롭다운 및 [➕ 현재문구 등록] 빠른 저장 기능 탑재\n• [⚙️ 표준문구 관리] 전용 관리 모달을 통해 사내 표준 인증문구/특약사항을 자유롭게 신규등록, 수정, 삭제하고 {PO_NO} 자동 치환 지원',
    author: '시스템 관리자'
  },
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
