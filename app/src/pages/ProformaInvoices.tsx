import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, deleteDoc, setDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Customer } from '../types/customer';
import type { ProformaInvoice } from '../types/pi';
import { PIFormModal } from '../components/PIFormModal';
import { getAuth } from 'firebase/auth';

export const ProformaInvoices: React.FC = () => {
  const [pis, setPIs] = useState<ProformaInvoice[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateMode, setDateMode] = useState<'daily' | 'weekly' | 'range'>('range');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState<string>('2020-01-01');
  const [endDate, setEndDate] = useState<string>('2030-12-31');
  const [weekOffset, setWeekOffset] = useState(0);

  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterPiNum, setFilterPiNum] = useState('');

  const getWeekRange = (offset: number) => {
    const now = new Date();
    const day = now.getDay(); // 0=일, 1=월 ...
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  };

  const formatWeekLabel = (offset: number) => {
    const { start, end } = getWeekRange(offset);
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    if (offset === 0) return `이번 주 (${fmt(start)}~${fmt(end)})`;
    if (offset === -1) return `지난 주 (${fmt(start)}~${fmt(end)})`;
    if (offset === 1) return `다음 주 (${fmt(start)}~${fmt(end)})`;
    return `${offset > 0 ? '+' : ''}${offset}주 (${fmt(start)}~${fmt(end)})`;
  };

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const setRangePreset = (preset: 'today' | 'week' | 'month' | 'all') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'week') {
      const day = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setStartDate(monday.toISOString().split('T')[0]);
      setEndDate(sunday.toISOString().split('T')[0]);
    } else if (preset === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(lastDay.toISOString().split('T')[0]);
    } else if (preset === 'all') {
      setStartDate('2020-01-01');
      setEndDate('2030-12-31');
    }
  };

  // Sorting
  const [sortKey, setSortKey] = useState<keyof ProformaInvoice | 'customerName'>('piDate');
  const [sortDir, setSortDir] = useState<1 | -1>(-1); // default desc

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedPiId, setSelectedPiId] = useState<string | null>(null);

  const auth = getAuth();
  let currentUser = auth.currentUser?.email?.split('@')[0] || 'Unknown';
  if (currentUser === 'jhkim1130') {
    currentUser = '대표이사 김주한';
  }

  // Resizable column widths state
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    piDate: 95,
    piNumber: 200,
    customerName: 180,
    itemsSummary: 240,
    totalUsd: 120,
    issuingCompany: 85,
    createdByName: 75,
    action: 170
  });

  // Load saved column widths from localStorage on load
  useEffect(() => {
    const userId = auth.currentUser?.uid || 'default';
    const saved = localStorage.getItem(`pi_col_widths_${userId}`);
    if (saved) {
      try {
        setColWidths(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, [auth.currentUser]);

  const handleResizeStart = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = colWidths[colKey];

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentWidth = Math.max(30, startWidth + (moveEvent.pageX - startX));
      setColWidths(prev => {
        const next = { ...prev, [colKey]: currentWidth };
        const userId = auth.currentUser?.uid || 'default';
        localStorage.setItem(`pi_col_widths_${userId}`, JSON.stringify(next));
        return next;
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    // Load Customers
    const unsubCust = onSnapshot(collection(doc(db, "companies", COMPANY_ID), "customers"), (snap) => {
      const custMap: Record<string, Customer> = {};
      snap.docs.forEach(d => { custMap[d.id] = d.data() as Customer; });
      setCustomers(custMap);
    });

    // Load PIs
    const piRef = collection(doc(db, "companies", COMPANY_ID), "proforma_invoices");
    const unsubPI = onSnapshot(piRef, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProformaInvoice));
      setPIs(data);
      setLoading(false);
    });

    return () => {
      unsubCust();
      unsubPI();
    };
  }, []);

  const filteredAndSorted = useMemo(() => {
    let filtered = pis.filter(p => {
      // ── 날짜 및 기간 필터링 ──────────────────────────────────────────────
      if (dateMode === 'daily') {
        if (p.piDate !== selectedDate) return false;
      } else if (dateMode === 'weekly') {
        const { start: wStart, end: wEnd } = getWeekRange(weekOffset);
        if (!p.piDate) return false;
        const dt = new Date(p.piDate);
        if (dt < wStart || dt > wEnd) return false;
      } else {
        // 기간 검색
        if (!p.piDate) return false;
        if (p.piDate < startDate || p.piDate > endDate) return false;
      }

      if (filterCustomer && p.customerId !== filterCustomer) return false;
      if (filterPiNum && !(p.piNumber || "").toLowerCase().includes(filterPiNum.toLowerCase())) return false;
      return true;
    });

    filtered.sort((a, b) => {
      let va: any = a[sortKey as keyof ProformaInvoice] ?? "";
      let vb: any = b[sortKey as keyof ProformaInvoice] ?? "";

      if (sortKey === 'customerName') {
        va = (customers[a.customerId]?.name || "").toLowerCase();
        vb = (customers[b.customerId]?.name || "").toLowerCase();
      } else if (typeof va === 'string' && typeof vb === 'string') {
        va = va.toLowerCase();
        vb = vb.toLowerCase();
      }

      if (va < vb) return -1 * sortDir;
      if (va > vb) return 1 * sortDir;
      return 0;
    });

    return filtered;
  }, [pis, customers, dateMode, selectedDate, startDate, endDate, weekOffset, filterCustomer, filterPiNum, sortKey, sortDir]);

  const handleSort = (key: keyof ProformaInvoice | 'customerName') => {
    if (sortKey === key) {
      setSortDir(sortDir === 1 ? -1 : 1);
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const handleDelete = async (id: string, num: string) => {
    if (!window.confirm(`⚠️ 정말로 PI [${num}]을(를) 영구 삭제하시겠습니까?`)) return;
    try {
      await deleteDoc(doc(db, "companies", COMPANY_ID, "proforma_invoices", id));
      alert("✅ 성공적으로 삭제되었습니다.");
    } catch (e: any) {
      alert("❌ 삭제 실패: " + e.message);
    }
  };

  const handleCopy = async (originalPi: ProformaInvoice) => {
    if (!window.confirm(`📋 PI [${originalPi.piNumber}]을(를) 복사하여 새 PI를 만드시겠습니까?`)) return;
    
    try {
      // 1. Calculate new PI number
      const regex = /(\d+)$/;
      const match = originalPi.piNumber.match(regex);
      let nextNumStr = '';
      if (match) {
        const numStr = match[1];
        const nextNum = parseInt(numStr, 10) + 1;
        nextNumStr = nextNum.toString().padStart(numStr.length, '0');
      } else {
        nextNumStr = '02'; // default fallback sequence
      }

      let newPiNumber = originalPi.piNumber;
      if (match) {
        newPiNumber = originalPi.piNumber.replace(regex, nextNumStr);
      } else {
        newPiNumber = originalPi.piNumber + '-' + nextNumStr;
      }

      // Check uniqueness and keep incrementing if already exists
      while (pis.some(p => p.piNumber === newPiNumber)) {
        const innerMatch = newPiNumber.match(regex);
        if (innerMatch) {
          const numStr = innerMatch[1];
          const nextNum = parseInt(numStr, 10) + 1;
          const padded = nextNum.toString().padStart(numStr.length, '0');
          newPiNumber = newPiNumber.replace(regex, padded);
        } else {
          newPiNumber = newPiNumber + '-02';
        }
      }

      const newPiId = newPiNumber;

      // 2. Load the original PI's revisions to find the latest version
      const originalRevisionsColRef = collection(db, "companies", COMPANY_ID, "proforma_invoices", originalPi.id, "revisions");
      const revSnap = await getDocs(originalRevisionsColRef);
      if (revSnap.empty) {
        throw new Error("원본 PI의 Revision 기록을 찾을 수 없습니다.");
      }

      const latestRevDoc = revSnap.docs.sort((a, b) => (b.data().version || 0) - (a.data().version || 0))[0];
      const latestRevData = latestRevDoc.data();

      // 3. Load original line items for this revision
      const liSnap = await getDocs(collection(latestRevDoc.ref, "line_items"));
      const originalLineItems = liSnap.docs.map(d => d.data());

      // 4. Save new main PI document
      const newPiData = {
        ...originalPi,
        id: newPiId,
        piNumber: newPiNumber,
        currentVersion: 1,
        createdAt: serverTimestamp(),
        createdBy: currentUser,
        updatedAt: serverTimestamp()
      };
      // Delete any metadata/auto-generated ID from the object to prevent copying wrong keys
      delete (newPiData as any).id;

      await setDoc(doc(db, "companies", COMPANY_ID, "proforma_invoices", newPiId), newPiData);

      // 5. Save new revision document
      const newRevRef = doc(collection(db, "companies", COMPANY_ID, "proforma_invoices", newPiId, "revisions"));
      const newRevData = {
        ...latestRevData,
        version: 1,
        revisionReason: `Copied from ${originalPi.piNumber}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(newRevRef, newRevData);

      // 6. Save new line items in subcollection
      for (const item of originalLineItems) {
        const itemRef = doc(collection(newRevRef, "line_items"));
        await setDoc(itemRef, {
          ...item,
          id: itemRef.id
        });
      }

      alert(`✅ PI 복사 완료! 새 PI 번호: ${newPiNumber}`);
    } catch (e: any) {
      console.error(e);
      alert(`❌ 복사 실패: ` + e.message);
    }
  };

  const getSortIcon = (key: string) => {
    if (sortKey !== key) return "⇅";
    return sortDir === 1 ? "▲" : "▼";
  };

  return (
    <div className="page-container" style={{ padding: '28px', background: '#f8fafc', minHeight: '100vh', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>견적관리 (Proforma Invoice)</h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px', fontWeight: 500 }}>전체 PI 목록 · 실시간 동기화 대시보드</p>
        </div>
        <button 
          onClick={() => { setSelectedPiId(null); setIsFormOpen(true); }}
          style={{ 
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', 
            color: 'white', 
            padding: '10px 20px', 
            borderRadius: '8px', 
            border: 'none', 
            cursor: 'pointer', 
            fontWeight: 700,
            fontSize: '14px',
            boxShadow: '0 4px 10px rgba(37, 99, 235, 0.2)',
            transition: 'transform 0.15s, box-shadow 0.15s',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 14px rgba(37, 99, 235, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 10px rgba(37, 99, 235, 0.2)';
          }}
        >
          <span>➕</span> New PI
        </button>
      </header>

      {/* Filters Card */}
      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        marginBottom: '24px', 
        flexWrap: 'wrap', 
        alignItems: 'center',
        background: '#ffffff',
        padding: '18px 24px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)'
      }}>
        
        {/* ── 조회 모드 Segmented Control ── */}
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px', border: '1px solid #e2e8f0' }}>
          <button
            onClick={() => setDateMode('daily')}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderRadius: '6px',
              background: dateMode === 'daily' ? '#ffffff' : 'transparent',
              color: dateMode === 'daily' ? '#0f172a' : '#475569',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '14px',
              boxShadow: dateMode === 'daily' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s'
            }}
          >
            일간
          </button>
          <button
            onClick={() => setDateMode('weekly')}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderRadius: '6px',
              background: dateMode === 'weekly' ? '#ffffff' : 'transparent',
              color: dateMode === 'weekly' ? '#0f172a' : '#475569',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '14px',
              boxShadow: dateMode === 'weekly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s'
            }}
          >
            주간
          </button>
          <button
            onClick={() => setDateMode('range')}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderRadius: '6px',
              background: dateMode === 'range' ? '#ffffff' : 'transparent',
              color: dateMode === 'range' ? '#0f172a' : '#475569',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '14px',
              boxShadow: dateMode === 'range' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s'
            }}
          >
            기간 검색
          </button>
        </div>

        {/* ── 상세 날짜 선택 영역 ── */}
        {dateMode === 'daily' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
            <button onClick={handlePrevDay} style={{ padding: '10px 14px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '15px', fontWeight: 700, color: '#475569', borderRight: '1px solid #cbd5e1' }}>‹</button>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{
                padding: '8px 14px',
                border: 'none',
                outline: 'none',
                fontSize: '15px',
                fontWeight: 700,
                color: '#1e293b',
                cursor: 'pointer',
                background: '#fff'
              }}
            />
            <button onClick={handleNextDay} style={{ padding: '10px 14px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '15px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #cbd5e1' }}>›</button>
            {selectedDate !== new Date().toISOString().split('T')[0] && (
              <button
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                style={{
                  padding: '10px 14px',
                  border: 'none',
                  borderLeft: '1px solid #cbd5e1',
                  background: '#f0fdf4',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#16a34a'
                }}
              >
                오늘
              </button>
            )}
          </div>
        )}

        {dateMode === 'weekly' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
            <button onClick={() => setWeekOffset(w => w - 1)} style={{ padding: '10px 14px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '15px', fontWeight: 700, color: '#475569' }}>‹</button>
            <div style={{ padding: '10px 18px', background: weekOffset === 0 ? '#eff6ff' : '#f8fafc', color: weekOffset === 0 ? '#1d4ed8' : '#334155', fontWeight: 700, fontSize: '15px', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', whiteSpace: 'nowrap' }}>
              📅 {formatWeekLabel(weekOffset)}
            </div>
            <button onClick={() => setWeekOffset(w => w + 1)} style={{ padding: '10px 14px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '15px', fontWeight: 700, color: '#475569' }}>›</button>
            {weekOffset !== 0 && (
              <button onClick={() => setWeekOffset(0)} style={{ padding: '10px 14px', border: 'none', borderLeft: '1px solid #cbd5e1', background: '#fff7ed', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#ea580c' }}>이번주</button>
            )}
          </div>
        )}

        {dateMode === 'range' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{
                  padding: '10px 14px',
                  border: 'none',
                  outline: 'none',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#1e293b',
                  cursor: 'pointer'
                }}
              />
              <span style={{ padding: '0 12px', color: '#94a3b8', fontSize: '15px', fontWeight: 700, background: '#f8fafc', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', height: '38px', display: 'flex', alignItems: 'center' }}>~</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{
                  padding: '10px 14px',
                  border: 'none',
                  outline: 'none',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#1e293b',
                  cursor: 'pointer'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setRangePreset('today')} style={{ padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#475569', transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>오늘</button>
              <button onClick={() => setRangePreset('week')} style={{ padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#475569', transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>이번주</button>
              <button onClick={() => setRangePreset('month')} style={{ padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#475569', transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>이번달</button>
              <button onClick={() => setRangePreset('all')} style={{ padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#475569', transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>전체</button>
            </div>
          </div>
        )}
        
        <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} style={{ padding: '10px 16px', border: '1px solid #cbd5e1', borderRadius: '8px', minWidth: '190px', fontSize: '15px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}>
          <option value="">👥 전체 고객</option>
          {Object.entries(customers).map(([id, c]) => (
            <option key={id} value={id}>{c.name}</option>
          ))}
        </select>
        
        <input type="text" placeholder="🔍 PI Number 검색..." value={filterPiNum} onChange={e => setFilterPiNum(e.target.value)} style={{ padding: '10px 16px', border: '1px solid #cbd5e1', borderRadius: '8px', width: '220px', fontSize: '15px', outline: 'none' }} />
 
        <span style={{ marginLeft: 'auto', fontSize: '16px', fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '8px 16px', borderRadius: '20px' }}>
          총 {filteredAndSorted.length}건
        </span>
      </div>

      {/* Table Card */}
      <div style={{ overflowX: 'auto', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
            <tr>
              <th onClick={() => handleSort('piDate')} style={{ padding: '12px 10px', cursor: 'pointer', whiteSpace: 'nowrap', borderRight: '1px solid #e2e8f0', width: colWidths.piDate, minWidth: colWidths.piDate, maxWidth: colWidths.piDate, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', textAlign: 'center', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>
                DATE {getSortIcon('piDate')}
                <ResizeHandle onMouseDown={(e) => handleResizeStart('piDate', e)} />
              </th>
              <th onClick={() => handleSort('piNumber')} style={{ padding: '12px 10px', cursor: 'pointer', whiteSpace: 'nowrap', borderRight: '1px solid #e2e8f0', width: colWidths.piNumber, minWidth: colWidths.piNumber, maxWidth: colWidths.piNumber, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', textAlign: 'center', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>
                PI NUMBER {getSortIcon('piNumber')}
                <ResizeHandle onMouseDown={(e) => handleResizeStart('piNumber', e)} />
              </th>
              <th onClick={() => handleSort('customerName')} style={{ padding: '12px 10px', cursor: 'pointer', borderRight: '1px solid #e2e8f0', width: colWidths.customerName, minWidth: colWidths.customerName, maxWidth: colWidths.customerName, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', textAlign: 'center', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>
                CUSTOMER {getSortIcon('customerName')}
                <ResizeHandle onMouseDown={(e) => handleResizeStart('customerName', e)} />
              </th>
              <th style={{ padding: '12px 10px', borderRight: '1px solid #e2e8f0', width: colWidths.itemsSummary, minWidth: colWidths.itemsSummary, maxWidth: colWidths.itemsSummary, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', textAlign: 'center', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>
                ITEMS
                <ResizeHandle onMouseDown={(e) => handleResizeStart('itemsSummary', e)} />
              </th>
              <th onClick={() => handleSort('totalUsd')} style={{ padding: '12px 10px', cursor: 'pointer', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1px solid #e2e8f0', width: colWidths.totalUsd, minWidth: colWidths.totalUsd, maxWidth: colWidths.totalUsd, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>
                TOTAL (USD) {getSortIcon('totalUsd')}
                <ResizeHandle onMouseDown={(e) => handleResizeStart('totalUsd', e)} />
              </th>
              <th style={{ padding: '12px 10px', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1px solid #e2e8f0', width: colWidths.issuingCompany, minWidth: colWidths.issuingCompany, maxWidth: colWidths.issuingCompany, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>
                ISSUER
                <ResizeHandle onMouseDown={(e) => handleResizeStart('issuingCompany', e)} />
              </th>
              <th onClick={() => handleSort('createdByName')} style={{ padding: '12px 10px', cursor: 'pointer', whiteSpace: 'nowrap', borderRight: '1px solid #e2e8f0', width: colWidths.createdByName, minWidth: colWidths.createdByName, maxWidth: colWidths.createdByName, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', textAlign: 'center', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>
                WRITER {getSortIcon('createdByName')}
                <ResizeHandle onMouseDown={(e) => handleResizeStart('createdByName', e)} />
              </th>
              <th style={{ padding: '12px 10px', textAlign: 'center', width: colWidths.action, minWidth: colWidths.action, maxWidth: colWidths.action, boxSizing: 'border-box', overflow: 'hidden', fontSize: '12px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>작업</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#6b7280', fontSize: '15px' }}>데이터 로딩 중...</td></tr>
            ) : filteredAndSorted.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#6b7280', fontSize: '15px' }}>검색 결과가 없습니다</td></tr>
            ) : (
              filteredAndSorted.map(p => {
                const issuerBadge = p.issuingCompany === 'YS' 
                                 ? <span style={{ fontSize: '12px', fontWeight: 800, background: '#ecfdf5', color: '#047857', padding: '4px 12px', borderRadius: '12px', border: '1px solid #a7f3d0' }}>영성ACC</span>
                                 : <span style={{ fontSize: '12px', fontWeight: 800, background: '#eff6ff', color: '#1d4ed8', padding: '4px 12px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>YSACC</span>;

                return (
                  <tr 
                    key={p.id} 
                    style={{ borderBottom: '1px solid #e2e8f0', height: '60px', transition: 'background-color 0.2s' }} 
                    className="hover-row"
                    onClick={() => { setSelectedPiId(p.id); setIsFormOpen(true); }}
                  >
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', width: colWidths.piDate, minWidth: colWidths.piDate, maxWidth: colWidths.piDate, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 500 }}>{p.piDate || '-'}</td>
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', width: colWidths.piNumber, minWidth: colWidths.piNumber, maxWidth: colWidths.piNumber, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle', textAlign: 'left' }}>
                      <span style={{ color: '#2563eb', fontWeight: 700, fontSize: '13.5px' }}>{p.piNumber || '-'}</span>
                      {p.currentVersion && p.currentVersion > 1 && (
                        <span style={{ color: '#94a3b8', fontSize: '11.5px', fontWeight: 600, marginLeft: '6px' }}>
                          R{p.currentVersion - 1}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '9px 10px', width: colWidths.customerName, minWidth: colWidths.customerName, maxWidth: colWidths.customerName, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle', color: '#1e293b', fontWeight: 600, fontSize: '13.5px' }}>{customers[p.customerId]?.name || '-'}</td>
                    <td style={{ padding: '9px 10px', width: colWidths.itemsSummary, minWidth: colWidths.itemsSummary, maxWidth: colWidths.itemsSummary, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12.5px', color: '#475569', verticalAlign: 'middle' }}>
                      {p.itemsSummary && p.itemsSummary.length > 0 ? (
                        <span title={p.itemsSummary.join(', ')}>
                          {p.itemsSummary[0]}
                          {p.itemsSummary.length > 1 && (
                            <span style={{ color: '#2563eb', fontWeight: 700, marginLeft: '6px' }}>
                              외 {p.itemsSummary.length - 1}종
                            </span>
                          )}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, width: colWidths.totalUsd, minWidth: colWidths.totalUsd, maxWidth: colWidths.totalUsd, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle', color: '#0f766e', fontSize: '14.5px' }}>
                      ${(p.totalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', width: colWidths.issuingCompany, minWidth: colWidths.issuingCompany, maxWidth: colWidths.issuingCompany, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{issuerBadge}</td>
                    <td style={{ padding: '9px 10px', width: colWidths.createdByName, minWidth: colWidths.createdByName, maxWidth: colWidths.createdByName, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center', color: '#475569', fontSize: '13px', fontWeight: 500 }}>
                      {(() => {
                        const name = p.createdByName || '-';
                        if (name === 'jhkim1130' || name === '대표이사 김주한') return '김주한';
                        return name.replace('대표이사 ', '');
                      })()}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap', width: colWidths.action, minWidth: colWidths.action, maxWidth: colWidths.action, boxSizing: 'border-box', overflow: 'hidden', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                        <button 
                          onClick={() => { setSelectedPiId(p.id); setIsFormOpen(true); }} 
                          style={{ 
                            background: 'none', 
                            color: '#3b82f6', 
                            border: 'none', 
                            padding: '2px 4px', 
                            fontSize: '12px', 
                            fontWeight: 700, 
                            cursor: 'pointer', 
                            transition: 'color 0.2s' 
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.color = '#1d4ed8';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.color = '#3b82f6';
                          }}
                        >
                          수정
                        </button>
                        <button 
                          onClick={() => handleCopy(p)} 
                          style={{ 
                            background: 'none', 
                            color: '#10b981', 
                            border: 'none', 
                            padding: '2px 4px', 
                            fontSize: '12px', 
                            fontWeight: 700, 
                            cursor: 'pointer', 
                            transition: 'color 0.2s'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.color = '#047857';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.color = '#10b981';
                          }}
                        >
                          복사
                        </button>
                        <button 
                          onClick={() => handleDelete(p.id, p.piNumber)}
                          style={{ 
                            background: 'none', 
                            color: '#ef4444', 
                            border: 'none', 
                            padding: '2px 4px', 
                            fontSize: '12px', 
                            fontWeight: 700, 
                            cursor: 'pointer', 
                            transition: 'color 0.2s'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.color = '#b91c1c';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.color = '#ef4444';
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        .hover-row:hover {
          background-color: #f1f5f9 !important;
        }
      `}</style>

      {isFormOpen && (
        <PIFormModal
          initialPI={selectedPiId ? pis.find(p => p.id === selectedPiId) : undefined}
          onClose={() => setIsFormOpen(false)}
          currentUser={currentUser}
        />
      )}
    </div>
  );
};

const ResizeHandle: React.FC<{ onMouseDown: (e: React.MouseEvent) => void }> = ({ onMouseDown }) => {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '6px',
        cursor: 'col-resize',
        zIndex: 10,
        backgroundColor: hovered ? '#cbd5e1' : 'transparent',
        transition: 'background-color 0.2s'
      }}
    />
  );
};
