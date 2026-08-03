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
