import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
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
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
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
      if (filterStart && p.piDate < filterStart) return false;
      if (filterEnd && p.piDate > filterEnd) return false;
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
  }, [pis, customers, filterStart, filterEnd, filterCustomer, filterPiNum, sortKey, sortDir]);

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

  const getSortIcon = (key: string) => {
    if (sortKey !== key) return "⇅";
    return sortDir === 1 ? "▲" : "▼";
  };

  return (
    <div className="page-container" style={{ padding: '24px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0 }}>Proforma Invoice</h1>
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
        <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
        <span style={{ color: '#6b7280' }}>~</span>
        <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
        
        <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', minWidth: '150px' }}>
          <option value="">전체 고객</option>
          {Object.entries(customers).map(([id, c]) => (
            <option key={id} value={id}>{c.name}</option>
          ))}
        </select>
        
        <input type="text" placeholder="PI Number 검색..." value={filterPiNum} onChange={e => setFilterPiNum(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', width: '180px' }} />

        <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 600, color: '#475569' }}>
          총 {filteredAndSorted.length}건
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
            <tr>
              <th onClick={() => handleSort('piDate')} style={{ padding: '6px 8px', cursor: 'pointer', whiteSpace: 'nowrap', resize: 'horizontal', overflow: 'auto', borderRight: '1px solid #cbd5e1', minWidth: '80px' }}>DATE {getSortIcon('piDate')}</th>
              <th onClick={() => handleSort('piNumber')} style={{ padding: '6px 8px', cursor: 'pointer', whiteSpace: 'nowrap', resize: 'horizontal', overflow: 'auto', borderRight: '1px solid #cbd5e1', minWidth: '130px' }}>PI NUMBER {getSortIcon('piNumber')}</th>
              <th onClick={() => handleSort('currentVersion')} style={{ padding: '6px 8px', cursor: 'pointer', textAlign: 'center', resize: 'horizontal', overflow: 'auto', borderRight: '1px solid #cbd5e1', minWidth: '60px' }}>VER. {getSortIcon('currentVersion')}</th>
              <th onClick={() => handleSort('customerName')} style={{ padding: '6px 8px', cursor: 'pointer', resize: 'horizontal', overflow: 'auto', borderRight: '1px solid #cbd5e1', minWidth: '150px' }}>CUSTOMER {getSortIcon('customerName')}</th>
              <th style={{ padding: '6px 8px', resize: 'horizontal', overflow: 'auto', borderRight: '1px solid #cbd5e1', minWidth: '200px' }}>ITEMS</th>
              <th onClick={() => handleSort('totalUsd')} style={{ padding: '6px 8px', cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap', resize: 'horizontal', overflow: 'auto', borderRight: '1px solid #cbd5e1', minWidth: '110px' }}>TOTAL (USD) {getSortIcon('totalUsd')}</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap', resize: 'horizontal', overflow: 'auto', borderRight: '1px solid #cbd5e1', minWidth: '80px' }}>ISSUER</th>
              <th onClick={() => handleSort('createdByName')} style={{ padding: '6px 8px', cursor: 'pointer', whiteSpace: 'nowrap', resize: 'horizontal', overflow: 'auto', borderRight: '1px solid #cbd5e1', minWidth: '80px' }}>WRITER {getSortIcon('createdByName')}</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', minWidth: '100px' }}>작업</th>
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
                                 ? <span style={{ fontSize: '0.7rem', fontWeight: 800, background: '#d1fae5', color: '#065f46', padding: '2px 7px', borderRadius: '10px' }}>영성ACC</span>
                                 : <span style={{ fontSize: '0.7rem', fontWeight: 800, background: '#dbeafe', color: '#1e40af', padding: '2px 7px', borderRadius: '10px' }}>YSACC</span>;

                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0' }} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedPiId(p.id); setIsFormOpen(true); }}>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{p.piDate || '-'}</td>
                    <td style={{ padding: '6px 8px', color: '#2563eb', fontWeight: 600, whiteSpace: 'nowrap' }}>{p.piNumber || '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      {p.currentVersion && p.currentVersion > 1 ? `R${p.currentVersion - 1}` : '-'}
                    </td>
                    <td style={{ padding: '6px 8px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customers[p.customerId]?.name || '-'}</td>
                    <td style={{ padding: '6px 8px', maxWidth: '250px', fontSize: '12px', color: '#6b7280' }}>
                      {p.itemsSummary && p.itemsSummary.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {p.itemsSummary.map((item, idx) => (
                            <div key={idx} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item}</div>
                          ))}
                        </div>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                      ${(p.totalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{issuerBadge}</td>
                    <td style={{ padding: '6px 8px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(() => {
                        const name = p.createdByName || '-';
                        if (name === 'jhkim1130' || name === '대표이사 김주한') return '김주한';
                        return name.replace('대표이사 ', '');
                      })()}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setSelectedPiId(p.id); setIsFormOpen(true); }} style={{ background: '#fff', border: '1px solid #2563eb', color: '#2563eb', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, marginRight: '4px', cursor: 'pointer' }}>✏ 수정</button>
                      <button 
                        onClick={() => handleDelete(p.id, p.piNumber)}
                        style={{ background: '#fee2e2', color: '#991b1b', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                      >✕ 삭제</button>
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
