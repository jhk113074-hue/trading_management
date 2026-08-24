import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, doc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Supplier } from '../types/supplier';
import { SupplierModal } from '../components/SupplierModal';
import * as XLSX from 'xlsx';
import { useColumnResize } from '../hooks/useColumnResize';

const excelMapping = [
  { header: "공급업체코드(ID)", key: "supplierCode" },
  { header: "공급업체명", key: "name" },
  { header: "사업자등록번호", key: "bizNumber" },
  { header: "대표자명", key: "representative" },
  { header: "대표전화번호", key: "phone" },
  { header: "구매담당이메일", key: "purchaseEmail" },
  { header: "기본참조이메일", key: "defaultCcEmails" },
  { header: "본사주소", key: "address" },
  { header: "구매담당자명", key: "managerName" },
  { header: "구매담당자연락처", key: "managerPhone" },
  { header: "원화통장 정보", key: "bankKrw" },
  { header: "외화통장 정보", key: "bankUsd" }
];

export const Suppliers: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [orderStatsBySupplier, setOrderStatsBySupplier] = useState<Record<string, { count: number; totalKrw: number; totalUsd: number }>>({});

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'companies', COMPANY_ID, 'orders'), (snap) => {
      const stats: Record<string, { count: number; totalKrw: number; totalUsd: number }> = {};
      
      snap.docs.forEach(d => {
        const data = d.data();
        const items = data.items || [];
        const basicForm = data.basicForm || {};
        const grouped: Record<string, any[]> = {};
        items.forEach((it: any) => {
          const sup = (it.supplier || it.supplierName || '').trim();
          if (sup) {
            if (!grouped[sup]) grouped[sup] = [];
            grouped[sup].push(it);
          }
        });
        
        Object.entries(grouped).forEach(([supName, supItems]) => {
          const cleanName = supName.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
          if (!stats[cleanName]) {
            stats[cleanName] = { count: 0, totalKrw: 0, totalUsd: 0 };
          }
          stats[cleanName].count += 1;
          
          let sumKrw = 0;
          let sumUsd = 0;
          supItems.forEach(it => {
            const qty = Number(it.qty || 1);
            const price = Number(it.purchasePrice || it.purchaseUnitPrice || it.unitPrice || 0);
            const curr = (it.purchaseUnitCurrency || it.currency || 'KRW').toUpperCase();
            if (curr === 'USD') {
              sumUsd += qty * price;
            } else {
              sumKrw += qty * price;
            }
          });
          const taxType = (data.supplierTaxTypes || basicForm.supplierTaxTypes || {})[supName] || '과세';
          if (taxType !== '영세') {
            sumKrw = Math.round(sumKrw * 1.1);
            sumUsd = parseFloat((sumUsd * 1.1).toFixed(2));
          }
          stats[cleanName].totalKrw += sumKrw;
          stats[cleanName].totalUsd += sumUsd;
        });
      });
      setOrderStatsBySupplier(stats);
    });
    return () => unsub();
  }, []);

  // Column resize: [코드, 공급업체명, 사업자등록, 대표전화, 담당자, 주소, 작업]
  const { thStyle, resizerProps } = useColumnResize([110, 200, 140, 120, 160, 220, 90]);
  
  // Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | '공급사' | '포워딩사'>('ALL');
  const [countryTypeFilter, setCountryTypeFilter] = useState<'ALL' | '국내' | '해외'>('ALL');
  
  // Sorting
  const [sortKey, setSortKey] = useState<keyof Supplier>('supplierCode');
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupId, setEditingSupId] = useState<string | null>(null);

  const handleOpenModal = (id?: string | null) => {
    setEditingSupId(id || null);
    setIsModalOpen(true);
    if (id) {
      const sup = suppliers.find(s => s.id === id);
      const urlId = sup?.supplierCode || id;
      setSearchParams({ id: urlId }, { replace: true });
    } else {
      setSearchParams({ id: 'new' }, { replace: true });
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSupId(null);
    setSearchParams({}, { replace: true });
  };

  // 🔗 URL Query Sync for Supplier Master direct linking (?id=S0003 or docId)
  useEffect(() => {
    const targetId = searchParams.get('id');
    if (targetId && suppliers.length > 0 && !isModalOpen) {
      if (targetId === 'new') {
        setEditingSupId(null);
        setIsModalOpen(true);
      } else {
        const found = suppliers.find(s => s.id === targetId || s.supplierCode === targetId);
        if (found) {
          setEditingSupId(found.id);
          setIsModalOpen(true);
        }
      }
    }
  }, [searchParams, suppliers]);

  const exportExcel = () => {
    const data = suppliers.map(s => {
      let row: any = {};
      excelMapping.forEach(m => {
        row[m.header] = (s as any)[m.key] ?? "";
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Suppliers");
    XLSX.writeFile(wb, "suppliers_master.xlsx");
  };

  const importExcel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);

    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet);
        
        let successCount = 0;
        for (const row of json as any[]) {
          let supplierData: any = {};
          excelMapping.forEach(m => {
            if (row[m.header] !== undefined && row[m.header] !== null) {
               supplierData[m.key] = String(row[m.header]).trim();
            }
          });
          
          const docId = supplierData.supplierCode;
          if (!docId) continue;

          supplierData.updatedAt = serverTimestamp();
          
          const existing = suppliers.find(s => s.id === docId);
          if (!existing) {
            supplierData.createdAt = serverTimestamp();
          }
          await setDoc(doc(db, "companies", COMPANY_ID, "suppliers", docId), supplierData, { merge: true });
          successCount++;
        }
        alert(`✅ Excel 업로드 완료: 총 ${successCount}건 처리되었습니다.`);
      } catch (err: any) {
        alert("❌ Excel 업로드 오류: " + err.message);
        console.error(err);
      } finally {
        event.target.value = ""; // Reset file input
        setIsUploading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(doc(db, "companies", COMPANY_ID), "suppliers"), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));
      setSuppliers(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredAndSorted = useMemo(() => {
    let filtered = suppliers.filter(s => {
      // Category filter
      if (categoryFilter !== 'ALL') {
        const itemCat = s.category || '공급사';
        if (itemCat !== categoryFilter) return false;
      }
      // Country type filter
      if (countryTypeFilter !== 'ALL') {
        const itemCountry = s.countryType || '국내';
        if (itemCountry !== countryTypeFilter) return false;
      }
      // Keyword Search
      const q = searchQuery.toLowerCase();
      if (!q) return true;
      return (
        String(s.name || "").toLowerCase().includes(q) ||
        String(s.supplierCode || "").toLowerCase().includes(q) ||
        String(s.bizNumber || "").toLowerCase().includes(q) ||
        String(s.managerName || "").toLowerCase().includes(q)
      );
    });

    filtered.sort((a, b) => {
      let va = a[sortKey] ?? "";
      let vb = b[sortKey] ?? "";
      return String(va).localeCompare(String(vb), "ko") * sortDir;
    });

    return filtered;
  }, [suppliers, searchQuery, categoryFilter, countryTypeFilter, sortKey, sortDir]);

  const handleSort = (key: keyof Supplier) => {
    if (sortKey === key) {
      setSortDir(sortDir === 1 ? -1 : 1);
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`⚠️ 정말로 공급업체 [${name}]을(를) DB에서 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      await deleteDoc(doc(db, "companies", COMPANY_ID, "suppliers", id));
      alert("✅ 성공적으로 삭제되었습니다.");
    } catch (e: any) {
      alert("❌ 삭제 실패: " + e.message);
    }
  };

  const getSortIcon = (key: keyof Supplier) => {
    if (sortKey !== key) return "⇅";
    return sortDir === 1 ? "▲" : "▼";
  };

  return (
    <div className="page-container" style={{ padding: '24px 30px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', margin: 0 }}>공급업체 관리 (Suppliers)</h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>원소재 제조사 및 국내외 공급처 마스터 정보와 핵심 스펙 관리</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', height: '34px' }}>
          <button 
            onClick={exportExcel}
            style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '0 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '12.5px', transition: 'background 0.2s', height: '100%', boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
          >
            ⬇ Excel 다운로드
          </button>
          <button 
            onClick={() => document.getElementById('excel_upload_input')?.click()}
            disabled={isUploading}
            style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '0 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '12.5px', transition: 'background 0.2s', height: '100%', boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
          >
            {isUploading ? '⏳ 업로드 중...' : '⬆ Excel 업로드'}
          </button>
          <input 
            type="file" 
            id="excel_upload_input" 
            accept=".xlsx, .xls" 
            style={{ display: 'none' }} 
            onChange={importExcel} 
          />
          <button 
            onClick={() => handleOpenModal(null)}
            style={{ backgroundColor: '#3b82f6', color: 'white', padding: '0 16px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '12.5px', transition: 'background 0.2s', height: '100%', boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            ➕ 신규 공급업체 등록
          </button>
        </div>
      </header>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', backgroundColor: '#fff', padding: '16px', borderRadius: '4px', border: '1px solid #cbd5e1', flexWrap: 'wrap', alignItems: 'center' }}>
        <input 
          type="text" 
          placeholder="공급업체명, 코드, 사업자번호, 담당자 검색..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', flex: '1', minWidth: '240px', maxWidth: '380px', fontSize: '13px', outline: 'none', height: '34px', boxSizing: 'border-box' }}
        />
        <select
          value={categoryFilter}
          onChange={(e: any) => setCategoryFilter(e.target.value)}
          style={{ height: '34px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', background: '#fff', outline: 'none' }}
        >
          <option value="ALL">🏢 전체 업체구분 (공급사/포워딩사)</option>
          <option value="공급사">🏭 공급사 (제조/소싱)</option>
          <option value="포워딩사">✈️ 포워딩사 (물류/운송)</option>
        </select>
        <select
          value={countryTypeFilter}
          onChange={(e: any) => setCountryTypeFilter(e.target.value)}
          style={{ height: '34px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', background: '#fff', outline: 'none' }}
        >
          <option value="ALL">🌏 전체 지역 (국내/해외)</option>
          <option value="국내">🇰🇷 국내 업체</option>
          <option value="해외">🌐 해외 업체</option>
        </select>
      </div>

      <div style={{ marginBottom: '12px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>
        총 {filteredAndSorted.length}건 {(categoryFilter !== 'ALL' || countryTypeFilter !== 'ALL' || searchQuery) && `(전체 ${suppliers.length}건 중 필터링됨)`}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', backgroundColor: 'white', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
          <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
            <tr>
              <th onClick={() => handleSort('supplierCode')} style={thStyle(0, { padding: '12px 10px', cursor: 'pointer', fontWeight: 750, color: '#475569', fontSize: '11px', letterSpacing: '0.02em', textTransform: 'uppercase' })}>공급업체코드 {getSortIcon('supplierCode')}<span {...resizerProps(0)} /></th>
              <th onClick={() => handleSort('name')} style={thStyle(1, { padding: '12px 10px', cursor: 'pointer', fontWeight: 750, color: '#475569', fontSize: '11px', letterSpacing: '0.02em', textTransform: 'uppercase' })}>공급업체명 (대표자) {getSortIcon('name')}<span {...resizerProps(1)} /></th>
              <th onClick={() => handleSort('bizNumber')} style={thStyle(2, { padding: '12px 10px', cursor: 'pointer', fontWeight: 750, color: '#475569', fontSize: '11px', letterSpacing: '0.02em', textTransform: 'uppercase' })}>사업자등록번호 {getSortIcon('bizNumber')}<span {...resizerProps(2)} /></th>
              <th style={thStyle(3, { padding: '12px 10px', fontWeight: 750, color: '#475569', fontSize: '11px', letterSpacing: '0.02em', textTransform: 'uppercase' })}>대표전화번호<span {...resizerProps(3)} /></th>
              <th style={thStyle(4, { padding: '12px 10px', fontWeight: 750, color: '#475569', fontSize: '11px', letterSpacing: '0.02em', textTransform: 'uppercase' })}>구매담당자 (연락처)<span {...resizerProps(4)} /></th>
              <th style={thStyle(5, { padding: '12px 10px', fontWeight: 750, color: '#475569', fontSize: '11px', letterSpacing: '0.02em', textTransform: 'uppercase' })}>본사 주소<span {...resizerProps(5)} /></th>
              <th style={thStyle(6, { padding: '12px 10px', textAlign: 'center', fontWeight: 750, color: '#475569', fontSize: '11px', letterSpacing: '0.02em', textTransform: 'uppercase' })}>작업<span {...resizerProps(6)} /></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>데이터 로딩 중...</td></tr>
            ) : filteredAndSorted.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>조건에 부합하는 공급업체가 없습니다.</td></tr>
            ) : (
              filteredAndSorted.map(s => (
                <tr 
                  key={s.id} 
                  onClick={() => handleOpenModal(s.id)}
                  style={{ borderBottom: '1px solid #cbd5e1', fontSize: '13px', cursor: 'pointer', transition: 'background-color 0.1s', height: '56px' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <strong style={{ color: '#0891b2' }}>{s.supplierCode || '-'}</strong>
                      {s.category === '포워딩사' ? (
                        <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, backgroundColor: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', whiteSpace: 'nowrap' }}>포워더</span>
                      ) : (
                        <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>공급사</span>
                      )}
                      {s.countryType === '해외' && (
                        <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, backgroundColor: '#fefce8', color: '#a16207', border: '1px solid #fef08a', whiteSpace: 'nowrap' }}>해외</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span>{s.name || '-'}</span>
                      {s.shortCode && (
                        <span style={{ fontSize: '10.5px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 5px', borderRadius: '3px', fontWeight: 800 }}>
                          PO: {s.shortCode}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span>대표: {s.representative || '-'}</span>
                      {(() => {
                        const cleanName = (s.name || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
                        const stat = orderStatsBySupplier[cleanName];
                        if (stat && stat.count > 0) {
                          const amtStr = [
                            stat.totalKrw > 0 ? `₩${Math.round(stat.totalKrw).toLocaleString()}` : null,
                            stat.totalUsd > 0 ? `${stat.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : null
                          ].filter(Boolean).join(' / ');
                          return (
                            <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '1px 6px', borderRadius: '3px', fontWeight: 700, fontSize: '10.5px' }}>
                              📦 발주 {stat.count}건 ({amtStr})
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>{s.bizNumber || '-'}</td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>{s.phone || '-'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: '12px', color: '#475569' }}>{s.managerName || '-'}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1.5px' }}>{s.managerPhone || '-'}</div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11.5px', color: '#64748b' }}>
                      {s.address || '-'}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleOpenModal(s.id); }}
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
                        onClick={(e) => { e.stopPropagation(); handleDelete(s.id, s.name); }}
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <SupplierModal 
          initialSupplier={editingSupId ? suppliers.find(s => s.id === editingSupId) : undefined}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};
