import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Customer } from '../types/customer';
import { CustomerModal } from '../components/CustomerModal';
import * as XLSX from 'xlsx';
import { useColumnResize } from '../hooks/useColumnResize';

const excelMapping = [
  { header: "고객코드(ID)", key: "customerCode" },
  { header: "고객명(영문)", key: "name" },
  { header: "고객약자", key: "nameKo" },
  { header: "고객유형", key: "customerType" },
  { header: "국가코드", key: "countryCode" },
  { header: "국가명", key: "countryName" },
  { header: "도시", key: "city" },
  { header: "대표자명", key: "representative" },
  { header: "업종분류", key: "industryType" },
  { header: "전화번호", key: "phone" },
  { header: "팩스번호", key: "fax" },
  { header: "이메일", key: "email" },
  { header: "웹사이트", key: "website" },
  { header: "주소(영문)", key: "addressEn" },
  { header: "우편번호", key: "zipCode" },
  { header: "배송지주소(영문)", key: "shippingAddressEn" },
  { header: "배송지우편번호", key: "shippingZipCode" },
  { header: "담당자명(영문)", key: "contactPerson" },
  { header: "담당자연락처", key: "contactPhone" },
  { header: "담당자이메일", key: "contactEmail" },
  { header: "거래시작일", key: "tradeStartDate" },
  { header: "거래상태", key: "tradeStatus" },
  { header: "거래등급", key: "tradeGrade" },
  { header: "결제조건", key: "paymentTerms" },
  { header: "신용한도(USD)", key: "creditLimit" },
  { header: "거래통화", key: "currency" },
  { header: "거래담당팀", key: "tradeTeam" },
  { header: "세금ID_VAT", key: "taxId" },
  { header: "사업자등록번호", key: "businessLicense" },
  { header: "법인/개인구분", key: "entityType" },
  { header: "은행명", key: "bankName" },
  { header: "계좌번호", key: "bankAccount" },
  { header: "SWIFT코드", key: "swiftCode" },
  { header: "IBAN", key: "iban" },
  { header: "예금주명(영문)", key: "bankHolder" },
  { header: "기본배송지/인도처", key: "shippingPort" },
  { header: "배송방법_Incoterms", key: "preferredIncoterms" },
  { header: "통관담당자명", key: "customsBroker" },
  { header: "HS코드관리여부", key: "hsCodeManaged" },
  { header: "등록담당자명", key: "registrar" },
  { header: "비고/메모", key: "remarks" }
];

export const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Column resize: [코드, 고객명, 국가/도시, 대표자, 담당자, 결제, 등급, 상태, 작업]
  const { thStyle, resizerProps } = useColumnResize([100, 200, 130, 110, 160, 110, 60, 90, 90]);
  
  // Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  
  // Sorting
  const [sortKey, setSortKey] = useState<keyof Customer>('customerCode');
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustId, setEditingCustId] = useState<string | null>(null);

  const exportExcel = () => {
    const data = customers.map(c => {
      let row: any = {};
      excelMapping.forEach(m => {
        row[m.header] = (c as any)[m.key] ?? "";
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, "customers_master.xlsx");
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
          let customerData: any = {};
          excelMapping.forEach(m => {
            if (row[m.header] !== undefined && row[m.header] !== null) {
               customerData[m.key] = String(row[m.header]).trim();
            }
          });
          
          if (customerData.creditLimit) {
            customerData.creditLimit = parseFloat(customerData.creditLimit) || 0;
          }

          const docId = customerData.customerCode;
          if (!docId) continue;

          customerData.updatedAt = serverTimestamp();
          
          const existing = customers.find(c => c.id === docId);
          if (!existing) {
            customerData.createdAt = serverTimestamp();
          }
          await setDoc(doc(db, "companies", COMPANY_ID, "customers", docId), customerData, { merge: true });
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
    const unsub = onSnapshot(collection(doc(db, "companies", COMPANY_ID), "customers"), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer));
      setCustomers(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredAndSorted = useMemo(() => {
    let filtered = customers.filter(c => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        String(c.name || "").toLowerCase().includes(q) ||
        String(c.customerCode || "").toLowerCase().includes(q) ||
        String(c.countryName || "").toLowerCase().includes(q) ||
        String(c.nameKo || "").toLowerCase().includes(q);
      
      const matchesStatus = !statusFilter || c.tradeStatus === statusFilter;
      const matchesGrade = !gradeFilter || c.tradeGrade === gradeFilter;

      return matchesSearch && matchesStatus && matchesGrade;
    });

    filtered.sort((a, b) => {
      let va = a[sortKey] ?? "";
      let vb = b[sortKey] ?? "";
      if (typeof va === "number" && typeof vb === "number") {
        return (va - vb) * sortDir;
      }
      return String(va).localeCompare(String(vb), "ko") * sortDir;
    });

    return filtered;
  }, [customers, searchQuery, statusFilter, gradeFilter, sortKey, sortDir]);

  const handleSort = (key: keyof Customer) => {
    if (sortKey === key) {
      setSortDir(sortDir === 1 ? -1 : 1);
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`⚠️ 정말로 고객 [${name}]을(를) DB에서 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      await deleteDoc(doc(db, "companies", COMPANY_ID, "customers", id));
      alert("✅ 성공적으로 삭제되었습니다.");
    } catch (e: any) {
      alert("❌ 삭제 실패: " + e.message);
    }
  };

  const getSortIcon = (key: keyof Customer) => {
    if (sortKey !== key) return "⇅";
    return sortDir === 1 ? "▲" : "▼";
  };

  return (
    <div className="page-container" style={{ padding: '24px 30px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>고객사 관리 (Customers)</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>해외 거래처 정보 조회, 등록 및 36개 세부 무역 스펙 관리 도구</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={exportExcel}
            style={{ backgroundColor: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            ⬇ Excel 다운로드
          </button>
          <button 
            onClick={() => document.getElementById('excel_upload_input')?.click()}
            disabled={isUploading}
            style={{ backgroundColor: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
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
            onClick={() => { setEditingCustId(null); setIsModalOpen(true); }}
            style={{ backgroundColor: '#2563eb', color: 'white', padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            ➕ 신규 고객사 등록
          </button>
        </div>
      </header>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <input 
          type="text" 
          placeholder="고객명, 코드, 국가 검색..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', flex: '1', minWidth: '200px' }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
          <option value="">전체 상태</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Blocked">Blocked</option>
        </select>
        <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
          <option value="">전체 등급</option>
          <option value="S">S 등급</option>
          <option value="A">A 등급</option>
          <option value="B">B 등급</option>
          <option value="C">C 등급</option>
        </select>
      </div>

      <div style={{ marginBottom: '12px', fontSize: '14px', color: '#475569', fontWeight: 600 }}>
        총 {filteredAndSorted.length}건
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
          <thead style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
            <tr>
              <th onClick={() => handleSort('customerCode')} style={thStyle(0, { padding: '12px', cursor: 'pointer' })}>고객코드 {getSortIcon('customerCode')}<span {...resizerProps(0)} /></th>
              <th onClick={() => handleSort('name')} style={thStyle(1, { padding: '12px', cursor: 'pointer' })}>고객명(영문/현지어) {getSortIcon('name')}<span {...resizerProps(1)} /></th>
              <th onClick={() => handleSort('countryName')} style={thStyle(2, { padding: '12px', cursor: 'pointer' })}>국가 / 도시 {getSortIcon('countryName')}<span {...resizerProps(2)} /></th>
              <th style={thStyle(3, { padding: '12px' })}>대표자<span {...resizerProps(3)} /></th>
              <th style={thStyle(4, { padding: '12px' })}>주 담당자 / 연락망<span {...resizerProps(4)} /></th>
              <th style={thStyle(5, { padding: '12px' })}>결제 조건<span {...resizerProps(5)} /></th>
              <th onClick={() => handleSort('tradeGrade')} style={thStyle(6, { padding: '12px', cursor: 'pointer', textAlign: 'center' })}>등급 {getSortIcon('tradeGrade')}<span {...resizerProps(6)} /></th>
              <th onClick={() => handleSort('tradeStatus')} style={thStyle(7, { padding: '12px', cursor: 'pointer', textAlign: 'center' })}>거래 상태 {getSortIcon('tradeStatus')}<span {...resizerProps(7)} /></th>
              <th style={thStyle(8, { padding: '12px', textAlign: 'right' })}>작업<span {...resizerProps(8)} /></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>데이터 로딩 중...</td></tr>
            ) : filteredAndSorted.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>조건에 부합하는 고객이 없습니다.</td></tr>
            ) : (
              filteredAndSorted.map(c => {
                const statusColor = c.tradeStatus === 'Active' ? '#065f46' : c.tradeStatus === 'Blocked' ? '#991b1b' : '#92400e';
                const statusBg = c.tradeStatus === 'Active' ? '#d1fae5' : c.tradeStatus === 'Blocked' ? '#fee2e2' : '#fef3c7';

                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>
                    <td style={{ padding: '12px' }}><strong style={{ color: '#0891b2' }}>{c.customerCode || '-'}</strong></td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{c.name || '-'}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{c.nameKo || '-'}</div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontSize: '12px' }}>{c.countryName || '-'}</div>
                      <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '1px' }}>{c.city || '-'}</div>
                    </td>
                    <td style={{ padding: '12px' }}>{c.representative || '-'}</td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontSize: '12px' }}>{c.contactPerson || '-'}</div>
                      <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '1px' }}>{c.contactEmail || c.email || c.contactPhone || '-'}</div>
                    </td>
                    <td style={{ padding: '12px', fontSize: '12px' }}>{c.paymentTerms || '-'}</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#d97706' }}>{c.tradeGrade || 'A'}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '5px', fontWeight: 600, color: statusColor, backgroundColor: statusBg }}>
                        {c.tradeStatus || 'Active'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button 
                        onClick={() => { setEditingCustId(c.id); setIsModalOpen(true); }}
                        style={{ background: 'rgba(37,99,235,0.05)', color: '#2563eb', border: '1px solid #2563eb', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, marginRight: '4px' }}
                      >✏ 수정</button>
                      <button 
                        onClick={() => handleDelete(c.id, c.name)}
                        style={{ background: '#fee2e2', color: '#991b1b', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
                      >✕ 삭제</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <CustomerModal 
          initialCustomer={editingCustId ? customers.find(c => c.id === editingCustId) : undefined}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
};
