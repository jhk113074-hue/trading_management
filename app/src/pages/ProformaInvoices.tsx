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
    <div className="page-container" style={{ padding: '24px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0 }}>견적관리(Proforma Invoice)</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>전체 PI 목록 · Firestore 실시간 연동</p>
        </div>
        <button 
          onClick={() => { setSelectedPiId(null); setIsFormOpen(true); }}
          style={{ backgroundColor: '#2563eb', color: 'white', padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}
        >
          ➕ New PI
        </button>
      </header>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
        
        {/* ── 조회 모드 탭 ── */}
        <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
          <button
            onClick={() => setDateMode('daily')}
            style={{
              padding: '6px 12px',
              border: 'none',
              background: dateMode === 'daily' ? '#3b82f6' : '#fff',
              color: dateMode === 'daily' ? '#fff' : '#475569',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px',
              transition: 'all 0.15s'
            }}
          >
            일간
          </button>
          <button
            onClick={() => setDateMode('weekly')}
            style={{
              padding: '6px 12px',
              border: 'none',
              background: dateMode === 'weekly' ? '#3b82f6' : '#fff',
              color: dateMode === 'weekly' ? '#fff' : '#475569',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px',
              transition: 'all 0.15s',
              borderLeft: '1px solid #cbd5e1'
            }}
          >
            주간
          </button>
          <button
            onClick={() => setDateMode('range')}
            style={{
              padding: '6px 12px',
              border: 'none',
              background: dateMode === 'range' ? '#3b82f6' : '#fff',
              color: dateMode === 'range' ? '#fff' : '#475569',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px',
              transition: 'all 0.15s',
              borderLeft: '1px solid #cbd5e1'
            }}
          >
            기간 검색
          </button>
        </div>

        {/* ── 상세 날짜 선택 영역 ── */}
        {dateMode === 'daily' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
            <button onClick={handlePrevDay} style={{ padding: '6px 12px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151', borderRight: '1px solid #e2e8f0' }}>‹</button>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{
                padding: '4px 10px',
                border: 'none',
                outline: 'none',
                fontSize: '13px',
                fontWeight: 700,
                color: '#1e293b',
                cursor: 'pointer',
                background: '#fff'
              }}
            />
            <button onClick={handleNextDay} style={{ padding: '6px 12px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151', borderLeft: '1px solid #e2e8f0' }}>›</button>
            {selectedDate !== new Date().toISOString().split('T')[0] && (
              <button
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderLeft: '1px solid #e2e8f0',
                  background: '#f0fdf4',
                  cursor: 'pointer',
                  fontSize: '11px',
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
            <button onClick={() => setWeekOffset(w => w - 1)} style={{ padding: '6px 12px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151' }}>‹</button>
            <div style={{ padding: '6px 14px', background: weekOffset === 0 ? '#eff6ff' : '#f8fafc', color: weekOffset === 0 ? '#2563eb' : '#374151', fontWeight: 700, fontSize: '13px', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', whiteSpace: 'nowrap' }}>
              📅 {formatWeekLabel(weekOffset)}
            </div>
            <button onClick={() => setWeekOffset(w => w + 1)} style={{ padding: '6px 12px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151' }}>›</button>
            {weekOffset !== 0 && (
              <button onClick={() => setWeekOffset(0)} style={{ padding: '6px 10px', border: 'none', borderLeft: '1px solid #cbd5e1', background: '#fff7ed', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#ea580c' }}>이번주</button>
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
                  padding: '6px 10px',
                  border: 'none',
                  outline: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#1e293b',
                  cursor: 'pointer'
                }}
              />
              <span style={{ padding: '0 8px', color: '#94a3b8', fontSize: '12px', fontWeight: 700, background: '#f8fafc', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', height: '30px', display: 'flex', alignItems: 'center' }}>~</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  border: 'none',
                  outline: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#1e293b',
                  cursor: 'pointer'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => setRangePreset('today')} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#475569' }}>오늘</button>
              <button onClick={() => setRangePreset('week')} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#475569' }}>이번주</button>
              <button onClick={() => setRangePreset('month')} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#475569' }}>이번달</button>
              <button onClick={() => setRangePreset('all')} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#475569' }}>전체</button>
            </div>
          </div>
        )}
        
        <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', minWidth: '150px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
          <option value="">전체 고객</option>
          {Object.entries(customers).map(([id, c]) => (
            <option key={id} value={id}>{c.name}</option>
          ))}
        </select>
        
        <input type="text" placeholder="PI Number 검색..." value={filterPiNum} onChange={e => setFilterPiNum(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', width: '180px', fontSize: '13px' }} />
 
        <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 600, color: '#475569' }}>
          총 {filteredAndSorted.length}건
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
            <tr>
              <th onClick={() => handleSort('piDate')} style={{ padding: '10px 10px', cursor: 'pointer', whiteSpace: 'nowrap', borderRight: '1px solid #cbd5e1', width: '95px' }}>DATE {getSortIcon('piDate')}</th>
              <th onClick={() => handleSort('piNumber')} style={{ padding: '10px 10px', cursor: 'pointer', whiteSpace: 'nowrap', borderRight: '1px solid #cbd5e1', width: '150px' }}>PI NUMBER {getSortIcon('piNumber')}</th>
              <th onClick={() => handleSort('currentVersion')} style={{ padding: '10px 10px', cursor: 'pointer', textAlign: 'center', borderRight: '1px solid #cbd5e1', width: '55px' }}>VER. {getSortIcon('currentVersion')}</th>
              <th onClick={() => handleSort('customerName')} style={{ padding: '10px 10px', cursor: 'pointer', borderRight: '1px solid #cbd5e1', width: '180px' }}>CUSTOMER {getSortIcon('customerName')}</th>
              <th style={{ padding: '10px 10px', borderRight: '1px solid #cbd5e1' }}>ITEMS</th>
              <th onClick={() => handleSort('totalUsd')} style={{ padding: '10px 10px', cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap', borderRight: '1px solid #cbd5e1', width: '120px' }}>TOTAL (USD) {getSortIcon('totalUsd')}</th>
              <th style={{ padding: '10px 10px', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1px solid #cbd5e1', width: '85px' }}>ISSUER</th>
              <th onClick={() => handleSort('createdByName')} style={{ padding: '10px 10px', cursor: 'pointer', whiteSpace: 'nowrap', borderRight: '1px solid #cbd5e1', width: '75px' }}>WRITER {getSortIcon('createdByName')}</th>
              <th style={{ padding: '10px 10px', textAlign: 'center', width: '150px' }}>작업</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>데이터 로딩 중...</td></tr>
            ) : filteredAndSorted.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>검색 결과가 없습니다</td></tr>
            ) : (
              filteredAndSorted.map(p => {
                const issuerBadge = p.issuingCompany === 'YS' 
                                 ? <span style={{ fontSize: '11px', fontWeight: 800, background: '#d1fae5', color: '#065f46', padding: '3px 8px', borderRadius: '10px' }}>영성ACC</span>
                                 : <span style={{ fontSize: '11px', fontWeight: 800, background: '#dbeafe', color: '#1e40af', padding: '3px 8px', borderRadius: '10px' }}>YSACC</span>;
 
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0' }} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedPiId(p.id); setIsFormOpen(true); }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{p.piDate || '-'}</td>
                    <td style={{ padding: '8px 10px', color: '#2563eb', fontWeight: 600, whiteSpace: 'nowrap' }}>{p.piNumber || '-'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {p.currentVersion && p.currentVersion > 1 ? `R${p.currentVersion - 1}` : '-'}
                    </td>
                    <td style={{ padding: '8px 10px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customers[p.customerId]?.name || '-'}</td>
                    <td style={{ padding: '8px 10px', maxWidth: '300px', fontSize: '12px', color: '#6b7280' }}>
                      {p.itemsSummary && p.itemsSummary.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '52px', overflowY: 'auto', paddingRight: '4px' }}>
                          {p.itemsSummary.map((item, idx) => (
                            <div key={idx} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item}</div>
                          ))}
                        </div>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                      ${(p.totalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>{issuerBadge}</td>
                    <td style={{ padding: '8px 10px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(() => {
                        const name = p.createdByName || '-';
                        if (name === 'jhkim1130' || name === '대표이사 김주한') return '김주한';
                        return name.replace('대표이사 ', '');
                      })()}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button onClick={() => { setSelectedPiId(p.id); setIsFormOpen(true); }} style={{ background: '#eff6ff', color: '#1d4ed8', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>수정</button>
                        <button onClick={() => handleCopy(p)} style={{ background: '#ecfdf5', color: '#047857', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>복사</button>
                        <button 
                          onClick={() => handleDelete(p.id, p.piNumber)}
                          style={{ background: '#fef2f2', color: '#b91c1c', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                        >삭제</button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

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
