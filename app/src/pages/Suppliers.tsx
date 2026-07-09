import React, { useState, useEffect, useMemo } from 'react';
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
  { header: "본사주소", key: "address" },
  { header: "구매담당자명", key: "managerName" },
  { header: "구매담당자연락처", key: "managerPhone" },
  { header: "원화통장 정보", key: "bankKrw" },
  { header: "외화통장 정보", key: "bankUsd" }
];

export const Suppliers: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Column resize: [코드, 공급업체명, 사업자등록, 대표전화, 담당자, 주소, 작업]
  const { thStyle, resizerProps } = useColumnResize([110, 200, 140, 120, 160, 220, 90]);
  
  // Filtering
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sorting
  const [sortKey, setSortKey] = useState<keyof Supplier>('supplierCode');
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupId, setEditingSupId] = useState<string | null>(null);

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
      const q = searchQuery.toLowerCase();
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
  }, [suppliers, searchQuery, sortKey, sortDir]);

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
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>공급업체 관리 (Suppliers)</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>원소재 제조사 및 국내외 공급처 마스터 정보와 핵심 스펙 관리</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={exportExcel}
            style={{ backgroundColor: '#fff', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            ⬇ Excel 다운로드
          </button>
          <button 
            onClick={() => document.getElementById('excel_upload_input')?.click()}
            disabled={isUploading}
            style={{ backgroundColor: '#fff', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
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
            onClick={() => { setEditingSupId(null); setIsModalOpen(true); }}
            style={{ backgroundColor: '#2563eb', color: 'white', padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            ➕ 신규 공급업체 등록
          </button>
        </div>
      </header>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <input 
          type="text" 
          placeholder="공급업체명, 코드, 사업자번호, 담당자 검색..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border-default)', borderRadius: '4px', flex: '1', maxWidth: '400px' }}
        />
      </div>

      <div style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 600 }}>
        총 {filteredAndSorted.length}건
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', backgroundColor: 'white', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
          <thead style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid var(--border-color)' }}>
            <tr>
              <th onClick={() => handleSort('supplierCode')} style={thStyle(0, { padding: '12px', cursor: 'pointer' })}>공급업체코드 {getSortIcon('supplierCode')}<span {...resizerProps(0)} /></th>
              <th onClick={() => handleSort('name')} style={thStyle(1, { padding: '12px', cursor: 'pointer' })}>공급업체명 (대표자) {getSortIcon('name')}<span {...resizerProps(1)} /></th>
              <th onClick={() => handleSort('bizNumber')} style={thStyle(2, { padding: '12px', cursor: 'pointer' })}>사업자등록번호 {getSortIcon('bizNumber')}<span {...resizerProps(2)} /></th>
              <th style={thStyle(3, { padding: '12px' })}>대표전화번호<span {...resizerProps(3)} /></th>
              <th style={thStyle(4, { padding: '12px' })}>구매담당자 (연락처)<span {...resizerProps(4)} /></th>
              <th style={thStyle(5, { padding: '12px' })}>본사 주소<span {...resizerProps(5)} /></th>
              <th style={thStyle(6, { padding: '12px', textAlign: 'right' })}>작업<span {...resizerProps(6)} /></th>
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
                  onClick={() => { setEditingSupId(s.id); setIsModalOpen(true); }}
                  style={{ borderBottom: '1px solid var(--border-color)', fontSize: '13px', cursor: 'pointer', transition: 'background-color 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <strong style={{ color: '#0891b2' }}>{s.supplierCode || '-'}</strong>
                      {s.category === '포워딩사' && (
                        <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, backgroundColor: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', whiteSpace: 'nowrap' }}>포워더</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{s.name || '-'}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>대표: {s.representative || '-'}</div>
                  </td>
                  <td style={{ padding: '12px' }}>{s.bizNumber || '-'}</td>
                  <td style={{ padding: '12px' }}>{s.phone || '-'}</td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontSize: '12px' }}>{s.managerName || '-'}</div>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '1.5px' }}>{s.managerPhone || '-'}</div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11.5px', color: '#6b7280' }}>
                      {s.address || '-'}
                    </div>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingSupId(s.id); setIsModalOpen(true); }}
                      style={{ background: 'rgba(37,99,235,0.05)', color: '#2563eb', border: '1px solid #2563eb', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, marginRight: '4px' }}
                    >✏ 수정</button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(s.id, s.name); }}
                      style={{ background: '#fee2e2', color: '#991b1b', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
                    >✕ 삭제</button>
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
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
};
