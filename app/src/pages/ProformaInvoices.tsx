import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, deleteDoc, setDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, COMPANY_ID } from '../firebase';
import type { Customer } from '../types/customer';
import type { ProformaInvoice } from '../types/pi';
import { PIFormModal } from '../components/PIFormModal';
import { getAuth } from 'firebase/auth';

export const ProformaInvoices: React.FC = () => {
  const navigate = useNavigate();
  const [pis, setPIs] = useState<ProformaInvoice[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [orders, setOrders] = useState<{id: string; quotationId?: string}[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFilterType, setDateFilterType] = useState<string>('Monthly');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1);
  const [selectedHalf, setSelectedHalf] = useState<number>(new Date().getMonth() < 6 ? 1 : 2);
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');

  const [filterPiStatus, setFilterPiStatus] = useState<string>('All');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterIssuer, setFilterIssuer] = useState('All');
  const [filterPiNum, setFilterPiNum] = useState('');

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
  } else if (currentUser === 'jhk010624') {
    currentUser = '김하은 사원';
  } else if (currentUser === 'alexpark') {
    currentUser = '박현 차장';
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
    piStatus: 110,
    action: 210
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

    // Load Orders (for PI→주문 연결)
    const ordersRef = collection(doc(db, "companies", COMPANY_ID), "orders");
    const unsubOrders = onSnapshot(ordersRef, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });

    return () => {
      unsubCust();
      unsubPI();
      unsubOrders();
    };
  }, []);

  const getPiStatus = (p: ProformaInvoice) => {
    const hasOrder = orders.some(o => o.quotationId === p.id);
    if (hasOrder) return '수주확정';
    return (p as any).piStatus || '협상중';
  };

  const filteredAndSorted = useMemo(() => {
    let filtered = pis.filter(p => {
      // ── 날짜 및 기간 필터링 ──────────────────────────────────────────────
      if (dateFilterType !== 'All') {
        if (!p.piDate) return false;
        const d = new Date(p.piDate);
        if (isNaN(d.getTime())) return false;
        const y = d.getFullYear(), m = d.getMonth() + 1;
        if (dateFilterType === 'Monthly') {
          if (y !== selectedYear || m !== selectedMonth) return false;
        } else if (dateFilterType === 'Quarterly') {
          const q = Math.floor((m - 1) / 3) + 1;
          if (y !== selectedYear || q !== selectedQuarter) return false;
        } else if (dateFilterType === 'HalfYearly') {
          const h = m <= 6 ? 1 : 2;
          if (y !== selectedYear || h !== selectedHalf) return false;
        } else if (dateFilterType === 'Yearly') {
          if (y !== selectedYear) return false;
        } else if (dateFilterType === 'Range') {
          if (rangeStart && p.piDate < rangeStart) return false;
          if (rangeEnd && p.piDate > rangeEnd) return false;
        }
      }

      if (filterCustomer && p.customerId !== filterCustomer) return false;
      if (filterIssuer !== 'All' && p.issuingCompany !== filterIssuer) return false;
      if (filterPiNum && !(p.piNumber || "").toLowerCase().includes(filterPiNum.toLowerCase())) return false;

      // PI 상태 필터
      if (filterPiStatus !== 'All') {
        const piStatus = getPiStatus(p);
        if (piStatus !== filterPiStatus) return false;
      }

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
  }, [pis, orders, customers, dateFilterType, selectedYear, selectedMonth, selectedQuarter, selectedHalf, rangeStart, rangeEnd, filterCustomer, filterIssuer, filterPiNum, sortKey, sortDir]);

  const piStats = useMemo(() => {
    // 1. 총 견적 건수 & 각사 건수 (모든 상태 포함)
    const totalQuotesCount = pis.length;
    const quotesYsaccCount = pis.filter(p => p.issuingCompany === 'YSACC').length;
    const quotesYsCount = pis.filter(p => p.issuingCompany === 'YS' || p.issuingCompany === '영성ACC').length;

    // 2. 총 견적 금액 & 각사 금액 (모든 상태 포함)
    const totalQuotesAmount = pis.reduce((sum, p) => sum + (p.totalUsd || 0), 0);
    const quotesYsaccAmount = pis.filter(p => p.issuingCompany === 'YSACC').reduce((sum, p) => sum + (p.totalUsd || 0), 0);
    const quotesYsAmount = pis.filter(p => p.issuingCompany === 'YS' || p.issuingCompany === '영성ACC').reduce((sum, p) => sum + (p.totalUsd || 0), 0);

    // 3. 수주 건수
    const confirmedCount = pis.filter(p => ['수주확정', 'PO확정'].includes(getPiStatus(p))).length;
    const conversionRate = totalQuotesCount > 0 ? (confirmedCount / totalQuotesCount) * 100 : 0;

    // 4. 총 수주 금액 & 각사 수주 금액 (수주확정/PO확정 상태만 포함)
    const confirmedPis = pis.filter(p => ['수주확정', 'PO확정'].includes(getPiStatus(p)));
    const totalConfirmedAmount = confirmedPis.reduce((sum, p) => sum + (p.totalUsd || 0), 0);
    const confirmedYsaccAmount = confirmedPis.filter(p => p.issuingCompany === 'YSACC').reduce((sum, p) => sum + (p.totalUsd || 0), 0);
    const confirmedYsAmount = confirmedPis.filter(p => p.issuingCompany === 'YS' || p.issuingCompany === '영성ACC').reduce((sum, p) => sum + (p.totalUsd || 0), 0);

    return {
      totalQuotesCount,
      quotesYsaccCount,
      quotesYsCount,
      totalQuotesAmount,
      quotesYsaccAmount,
      quotesYsAmount,
      confirmedCount,
      conversionRate,
      totalConfirmedAmount,
      confirmedYsaccAmount,
      confirmedYsAmount
    };
  }, [pis, orders]);

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
    <div className="page-container" style={{ padding: '24px 30px', background: '#f8fafc', minHeight: '100vh', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>견적관리</h1>
          <select 
            value={filterIssuer} 
            onChange={e => setFilterIssuer(e.target.value)} 
            style={{ 
              padding: '6px 12px', border: '1.5px solid var(--border-default)', borderRadius: '6px', 
              fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', 
              outline: 'none', background: '#fff', cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <option value="All">🏢 전체 ISSUER</option>
            <option value="YSACC">YSACC</option>
            <option value="YS">영성ACC</option>
          </select>
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

      {/* 간단 대시보드 스탯 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
        <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)' }}>총 견적 건수</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>(YSACC: {piStats.quotesYsaccCount}건 / 영성ACC: {piStats.quotesYsCount}건)</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>{piStats.totalQuotesCount} 건</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)' }}>총 견적금액</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>(YSACC: ${Math.round(piStats.quotesYsaccAmount).toLocaleString()} / 영성ACC: ${Math.round(piStats.quotesYsAmount).toLocaleString()})</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f766e' }}>${piStats.totalQuotesAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)' }}>수주 확정 (수주율)</span>
            <span style={{ fontSize: '10.5px', color: '#1e40af', fontWeight: 700 }}>총수주: ${piStats.totalConfirmedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<br/><span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 500 }}>(YSACC: ${Math.round(piStats.confirmedYsaccAmount).toLocaleString()} / 영성ACC: ${Math.round(piStats.confirmedYsAmount).toLocaleString()})</span></span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#2563eb', textAlign: 'right' }}>{piStats.confirmedCount} 건 ({piStats.conversionRate.toFixed(1)}%)</div>
        </div>
      </div>

      {/* Filters Card */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '16px', 
        flexWrap: 'nowrap', 
        alignItems: 'center',
        background: '#ffffff',
        padding: '10px 16px',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        overflowX: 'auto'
      }}>
        
        {/* ── 조회 기간 필터 ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>조회 기간</span>
          <select value={dateFilterType} onChange={e => setDateFilterType(e.target.value)} style={{ padding: '5px 8px', border: '1.5px solid #2563eb', borderRadius: '6px', fontSize: '12.5px', backgroundColor: '#fff', color: '#2563eb', fontWeight: 600, outline: 'none', cursor: 'pointer' }}>
            <option value="All">전체 기간</option>
            <option value="Monthly">월별</option>
            <option value="Quarterly">분기별</option>
            <option value="HalfYearly">반기별</option>
            <option value="Yearly">연간</option>
            <option value="Range">직접 입력</option>
          </select>
        </div>

        {/* 년도/월 상세 선택기 */}
        {['Monthly', 'Quarterly', 'HalfYearly', 'Yearly'].includes(dateFilterType) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} style={{ padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '12.5px', background: '#fff', outline: 'none' }}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
          </div>
        )}

        {dateFilterType === 'Monthly' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))} style={{ padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '12.5px', background: '#fff', outline: 'none' }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
          </div>
        )}

        {dateFilterType === 'Quarterly' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <select value={selectedQuarter} onChange={e => setSelectedQuarter(parseInt(e.target.value))} style={{ padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '12.5px', background: '#fff', outline: 'none' }}>
              {[1, 2, 3, 4].map(q => <option key={q} value={q}>{q}분기</option>)}
            </select>
          </div>
        )}

        {dateFilterType === 'HalfYearly' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <select value={selectedHalf} onChange={e => setSelectedHalf(parseInt(e.target.value))} style={{ padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '12.5px', background: '#fff', outline: 'none' }}>
              <option value={1}>상반기</option>
              <option value={2}>하반기</option>
            </select>
          </div>
        )}

        {dateFilterType === 'Range' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} style={{ padding: '4px 8px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '12.5px', outline: 'none' }} />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>~</span>
            <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} style={{ padding: '4px 8px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '12.5px', outline: 'none' }} />
          </div>
        )}
        
        <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', minWidth: '150px', maxWidth: '170px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', outline: 'none', background: '#fff', flexShrink: 0 }}>
          <option value="">👥 전체 고객</option>
          {Object.entries(customers).map(([id, c]) => (
            <option key={id} value={id}>{c.name}</option>
          ))}
        </select>

        
        <input type="text" placeholder="🔍 PI Number 검색..." value={filterPiNum} onChange={e => setFilterPiNum(e.target.value)} style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', width: '150px', fontSize: '13px', outline: 'none', flexShrink: 0 }} />

        {/* PI 상태 필터 */}
        <select
          value={filterPiStatus}
          onChange={e => setFilterPiStatus(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', minWidth: '110px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', outline: 'none', background: '#fff', cursor: 'pointer', flexShrink: 0 }}
        >
          <option value="All">📋 전체 상태</option>
          <option value="협상중">협상중</option>
          <option value="수주확정">수주확정</option>
          <option value="취소">취소</option>
          <option value="만료">만료</option>
        </select>
 
        <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', background: '#f1f5f9', padding: '4px 10px', borderRadius: '20px', flexShrink: 0 }}>
          총 {filteredAndSorted.length}건
        </span>
      </div>

      {/* Table Card */}
      <div style={{ overflowX: 'auto', backgroundColor: 'white', border: '1px solid var(--border-color)', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid var(--border-color)' }}>
            <tr>
              <th onClick={() => handleSort('piDate')} style={{ padding: '12px 10px', cursor: 'pointer', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color)', width: colWidths.piDate, minWidth: colWidths.piDate, maxWidth: colWidths.piDate, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', textAlign: 'center', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                DATE {getSortIcon('piDate')}
                <ResizeHandle onMouseDown={(e) => handleResizeStart('piDate', e)} />
              </th>
              <th onClick={() => handleSort('piNumber')} style={{ padding: '12px 10px', cursor: 'pointer', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color)', width: colWidths.piNumber, minWidth: colWidths.piNumber, maxWidth: colWidths.piNumber, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', textAlign: 'center', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                PI NUMBER {getSortIcon('piNumber')}
                <ResizeHandle onMouseDown={(e) => handleResizeStart('piNumber', e)} />
              </th>
              <th onClick={() => handleSort('customerName')} style={{ padding: '12px 10px', cursor: 'pointer', borderRight: '1px solid var(--border-color)', width: colWidths.customerName, minWidth: colWidths.customerName, maxWidth: colWidths.customerName, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', textAlign: 'center', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                CUSTOMER {getSortIcon('customerName')}
                <ResizeHandle onMouseDown={(e) => handleResizeStart('customerName', e)} />
              </th>
              <th style={{ padding: '12px 10px', borderRight: '1px solid var(--border-color)', width: colWidths.itemsSummary, minWidth: colWidths.itemsSummary, maxWidth: colWidths.itemsSummary, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', textAlign: 'center', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                ITEMS
                <ResizeHandle onMouseDown={(e) => handleResizeStart('itemsSummary', e)} />
              </th>
              <th onClick={() => handleSort('totalUsd')} style={{ padding: '12px 10px', cursor: 'pointer', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color)', width: colWidths.totalUsd, minWidth: colWidths.totalUsd, maxWidth: colWidths.totalUsd, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                TOTAL (USD) {getSortIcon('totalUsd')}
                <ResizeHandle onMouseDown={(e) => handleResizeStart('totalUsd', e)} />
              </th>
              <th style={{ padding: '12px 10px', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color)', width: colWidths.issuingCompany, minWidth: colWidths.issuingCompany, maxWidth: colWidths.issuingCompany, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                ISSUER
                <ResizeHandle onMouseDown={(e) => handleResizeStart('issuingCompany', e)} />
              </th>
              <th onClick={() => handleSort('createdByName')} style={{ padding: '12px 10px', cursor: 'pointer', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color)', width: colWidths.createdByName, minWidth: colWidths.createdByName, maxWidth: colWidths.createdByName, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', textAlign: 'center', userSelect: 'none', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                WRITER {getSortIcon('createdByName')}
                <ResizeHandle onMouseDown={(e) => handleResizeStart('createdByName', e)} />
              </th>
              <th style={{ padding: '12px 10px', textAlign: 'center', width: colWidths.piStatus, minWidth: colWidths.piStatus, maxWidth: colWidths.piStatus, boxSizing: 'border-box', overflow: 'hidden', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', borderRight: '1px solid var(--border-color)', position: 'relative' }}>
                STATUS
                <ResizeHandle onMouseDown={(e) => handleResizeStart('piStatus', e)} />
              </th>
              <th style={{ padding: '12px 10px', textAlign: 'center', width: colWidths.action, minWidth: colWidths.action, maxWidth: colWidths.action, boxSizing: 'border-box', overflow: 'hidden', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>작업</th>
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

                // PI 상태 배지
                const piStatus = getPiStatus(p);
                const piStatusConfig: Record<string, { bg: string; color: string; border: string }> = {
                  '협상중':  { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
                  '수주확정': { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
                  '취소':    { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
                  '만료':    { bg: '#f8fafc', color: 'var(--text-muted)', border: 'var(--border-color)' },
                };
                const sc = piStatusConfig[piStatus] || piStatusConfig['협상중'];

                // 연결된 주문 찾기
                const linkedOrder = orders.find(o => o.quotationId === p.id);

                return (
                  <tr 
                    key={p.id} 
                    style={{ borderBottom: '1px solid var(--border-color)', height: '60px', transition: 'background-color 0.2s' }} 
                    className="hover-row"
                    onClick={() => { setSelectedPiId(p.id); setIsFormOpen(true); }}
                  >
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', width: colWidths.piDate, minWidth: colWidths.piDate, maxWidth: colWidths.piDate, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>{p.piDate || '-'}</td>
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', width: colWidths.piNumber, minWidth: colWidths.piNumber, maxWidth: colWidths.piNumber, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle', textAlign: 'left' }}>
                      <span style={{ color: '#2563eb', fontWeight: 700, fontSize: '13.5px' }}>{p.piNumber || '-'}</span>
                      {p.currentVersion && p.currentVersion > 1 && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '11.5px', fontWeight: 600, marginLeft: '6px' }}>
                          R{p.currentVersion - 1}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '9px 10px', width: colWidths.customerName, minWidth: colWidths.customerName, maxWidth: colWidths.customerName, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle', color: 'var(--text-primary)', fontWeight: 600, fontSize: '13.5px' }}>{customers[p.customerId]?.name || '-'}</td>
                    <td style={{ padding: '9px 10px', width: colWidths.itemsSummary, minWidth: colWidths.itemsSummary, maxWidth: colWidths.itemsSummary, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12.5px', color: 'var(--text-secondary)', verticalAlign: 'middle' }}>
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
                    <td style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap', width: colWidths.issuingCompany, minWidth: colWidths.issuingCompany, maxWidth: colWidths.issuingCompany, boxSizing: 'border-box', overflow: 'hidden', verticalAlign: 'middle' }}>{issuerBadge}</td>
                    <td style={{ padding: '9px 10px', width: colWidths.createdByName, minWidth: colWidths.createdByName, maxWidth: colWidths.createdByName, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>
                      {(() => {
                        let name = p.createdByName || '-';
                        if (name === 'jhkim1130' || name.includes('김주한')) return '김주한';
                        if (name === 'jhk010624' || name.includes('김하은')) return '김하은';
                        if (name === 'alexpark' || name.includes('박현')) return '박현';
                        return name.replace(/대표이사|차장|사원|과장|대리/g, '').trim();
                      })()}
                    </td>
                    {/* STATUS 배지 */}
                    <td style={{ padding: '9px 10px', textAlign: 'center', width: colWidths.piStatus, minWidth: colWidths.piStatus, maxWidth: colWidths.piStatus, boxSizing: 'border-box', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                      <select
                        value={piStatus}
                        onChange={async (e) => {
                          e.stopPropagation();
                          const newStatus = e.target.value;
                          try {
                            const { updateDoc } = await import('firebase/firestore');
                            await updateDoc(doc(db, "companies", COMPANY_ID, "proforma_invoices", p.id), { piStatus: newStatus });
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        style={{
                          background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                          borderRadius: '20px', padding: '4px 10px', fontSize: '12px', fontWeight: 700,
                          cursor: 'pointer', outline: 'none', width: '100%', textAlign: 'center',
                          appearance: 'none', WebkitAppearance: 'none'
                        }}
                      >
                        <option value="협상중">협상중</option>
                        <option value="수주확정">수주확정</option>
                        <option value="취소">취소</option>
                        <option value="만료">만료</option>
                      </select>
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap', width: colWidths.action, minWidth: colWidths.action, maxWidth: colWidths.action, boxSizing: 'border-box', overflow: 'hidden', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                        {linkedOrder ? (
                          <button
                            onClick={() => navigate(`/orders/${linkedOrder.id}?step=수주정보`)}
                            style={{
                              background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                              padding: '3px 9px', fontSize: '12px', fontWeight: 700,
                              cursor: 'pointer', borderRadius: '6px', transition: 'all 0.15s', whiteSpace: 'nowrap'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; }}
                            title="연결된 주문 보기"
                          >
                            주문보기
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate(`/orders?createFromPi=${p.id}`)}
                            style={{
                              background: '#f8fafc', color: 'var(--text-secondary)', border: '1px solid var(--border-color)',
                              padding: '3px 9px', fontSize: '12px', fontWeight: 700,
                              cursor: 'pointer', borderRadius: '6px', transition: 'all 0.15s', whiteSpace: 'nowrap'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                            title="이 PI로 주문 생성"
                          >
                            주문생성
                          </button>
                        )}
                        <button 
                          onClick={() => { setSelectedPiId(p.id); setIsFormOpen(true); }} 
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            padding: '4px', 
                            fontSize: '15px', 
                            cursor: 'pointer', 
                            transition: 'transform 0.15s' 
                          }}
                          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; }}
                          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                          title="수정"
                        >
                          ✏️
                        </button>
                        <button 
                          onClick={() => handleCopy(p)} 
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            padding: '4px', 
                            fontSize: '15px', 
                            cursor: 'pointer', 
                            transition: 'transform 0.15s' 
                          }}
                          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; }}
                          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                          title="복사"
                        >
                          📋
                        </button>
                        <button 
                          onClick={() => handleDelete(p.id, p.piNumber)}
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            padding: '4px', 
                            fontSize: '15px', 
                            cursor: 'pointer', 
                            transition: 'transform 0.15s' 
                          }}
                          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; }}
                          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                          title="삭제"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
            {filteredAndSorted.length > 0 && (
              <tr style={{ backgroundColor: '#f8fafc', fontWeight: 'bold', borderTop: '2.5px solid var(--border-default)' }}>
                <td colSpan={4} style={{ padding: '14px 10px', color: 'var(--text-primary)', textAlign: 'right', fontSize: '16px', fontWeight: 800 }}>합계</td>
                <td style={{ padding: '14px 10px', color: '#0f172a', whiteSpace: 'nowrap', fontSize: '16px', fontWeight: 800, textAlign: 'right', paddingRight: '12px' }}>
                  ${filteredAndSorted.reduce((sum, p) => sum + (p.totalUsd || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td />
                <td />
                <td />
              </tr>
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
        backgroundColor: hovered ? 'var(--border-default)' : 'transparent',
        transition: 'background-color 0.2s'
      }}
    />
  );
};
