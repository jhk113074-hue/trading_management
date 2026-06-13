import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Product } from '../types/product';
import { ProductModal } from '../components/ProductModal';
import * as XLSX from 'xlsx';
import { useColumnResize } from '../hooks/useColumnResize';

const excelMapping = [
  { header: "상품코드(ID)", key: "productCode" },
  { header: "상품명(한글)", key: "nameKo" },
  { header: "상품명(영문)", key: "nameEn" },
  { header: "대분류", key: "categoryLarge" },
  { header: "중분류", key: "categoryMedium" },
  { header: "소분류", key: "categorySmall" },
  { header: "상세설명", key: "description" },
  { header: "규격/스펙(Spec)", key: "spec" },
  { header: "이미지URL", key: "imageUrl" },
  { header: "공급업체명", key: "supplierName" },
  { header: "공급업체코드", key: "supplierCode" },
  { header: "공급담당자", key: "supplierContact" },
  { header: "공급연락처", key: "supplierPhone" },
  { header: "공급이메일", key: "supplierEmail" },
  { header: "공급업체주소", key: "supplierAddress" },
  { header: "MOQ", key: "minOrderQty" },
  { header: "구매가", key: "purchasePrice" },
  { header: "구매통화", key: "currency" },
  { header: "가격유효시작일", key: "priceValidFrom" },
  { header: "가격유효종료일", key: "priceValidTo" },
  { header: "할인율", key: "discountRate" },
  { header: "배송비포함여부", key: "freightIncluded" },
  { header: "단위", key: "unit" },
  { header: "포장형태", key: "packageType" },
  { header: "파렛트당적재수량", key: "qtyPerPallet" },
  { header: "제품가로(mm)", key: "unitWidth" },
  { header: "제품세로(mm)", key: "unitLength" },
  { header: "제품높이(mm)", key: "unitHeight" },
  { header: "제품순중량(kg)", key: "unitWeight" },
  { header: "제품총중량(kg)", key: "unitGrossWeight" },
  { header: "파렛트가로(mm)", key: "palletWidth" },
  { header: "파렛트세로(mm)", key: "palletLength" },
  { header: "파렛트높이(mm)", key: "palletHeight" },
  { header: "파렛트순중량(kg)", key: "palletWeight" },
  { header: "파렛트총중량(kg)", key: "palletGrossWeight" },
  { header: "가로(mm)", key: "specWidth" },
  { header: "세로(mm)", key: "specLength" },
  { header: "높이(mm)", key: "specHeight" },
  { header: "순중량(kg)", key: "weight" },
  { header: "총중량(kg)", key: "grossWeight" },
  { header: "다단적재", key: "stackable" },
  { header: "회전허용", key: "rotation" },
  { header: "색상", key: "color" },
  { header: "재질", key: "material" },
  { header: "원산지", key: "origin" },
  { header: "재고수량", key: "stockQty" },
  { header: "리드타임", key: "leadTimeDays" },
  { header: "보관위치", key: "storageLocation" },
  { header: "보관온도", key: "storageTemp" },
  { header: "보관습도", key: "storageHumidity" },
  { header: "제조사명", key: "manufacturer" },
  { header: "제조일자", key: "manufactureDate" },
  { header: "품질유효종료일", key: "expiryDate" },
  { header: "MSDS관리여부", key: "msdsManaged" },
  { header: "인증정보", key: "certifications" }
];

export const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Column resize: [코드, 상품명/규격, 분류, 단가, 공급업체/제조사, 원산지, 관리]
  const { thStyle, resizerProps } = useColumnResize([85, 320, 120, 110, 180, 70, 160]);
  
  // Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [catLargeFilter, setCatLargeFilter] = useState('');
  const [catMediumFilter, setCatMediumFilter] = useState('');
  const [currFilter, setCurrFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  
  // Sorting
  const [sortKey, setSortKey] = useState<keyof Product>('productCode');
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProdId, setEditingProdId] = useState<string | null>(null);
  const [isCopyMode, setIsCopyMode] = useState(false);

  const exportExcel = () => {
    const data = products.map(p => {
      let row: any = {};
      excelMapping.forEach(m => {
        row[m.header] = (p as any)[m.key] ?? "";
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "products_master.xlsx");
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
          let productData: any = {};
          excelMapping.forEach(m => {
            if (row[m.header] !== undefined && row[m.header] !== null) {
               let val = String(row[m.header]).trim();
               if (m.key === 'unit') val = val.toUpperCase();
               productData[m.key] = val;
            }
          });
          
          // Number conversions
          ['minOrderQty', 'purchasePrice', 'discountRate', 'specWidth', 'specLength', 'specHeight', 'weight', 'grossWeight', 'stockQty', 'leadTimeDays',
           'unitWidth', 'unitLength', 'unitHeight', 'unitWeight', 'unitGrossWeight',
           'palletWidth', 'palletLength', 'palletHeight', 'palletWeight', 'palletGrossWeight', 'qtyPerPallet'
          ].forEach(numKey => {
             if (productData[numKey]) productData[numKey] = parseFloat(productData[numKey]) || 0;
          });

          const docId = productData.productCode;
          if (!docId) continue;

          productData.updatedAt = serverTimestamp();
          
          const existing = products.find(p => p.id === docId);
          if (!existing) {
            productData.createdAt = serverTimestamp();
          }
          await setDoc(doc(db, "companies", COMPANY_ID, "products", docId), productData, { merge: true });
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
    const unsub = onSnapshot(collection(doc(db, "companies", COMPANY_ID), "products"), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      setProducts(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const categories = useMemo(() => {
    const large = [...new Set(products.map(p => p.categoryLarge).filter(Boolean))].sort();
    const medium = [...new Set(products.map(p => p.categoryMedium).filter(Boolean))].sort();
    return { large, medium };
  }, [products]);

  const uniqueSuppliers = useMemo(() => {
    return [...new Set(products.map(p => p.supplierName).filter(Boolean))].sort();
  }, [products]);

  const filteredAndSorted = useMemo(() => {
    let filtered = products.filter(p => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        String(p.nameKo || "").toLowerCase().includes(q) ||
        String(p.nameEn || "").toLowerCase().includes(q) ||
        String(p.productCode || "").toLowerCase().includes(q) ||
        String(p.supplierName || "").toLowerCase().includes(q) ||
        String(p.categoryLarge || "").toLowerCase().includes(q) ||
        String(p.categoryMedium || "").toLowerCase().includes(q);
      
      const matchesLargeCat = !catLargeFilter || p.categoryLarge === catLargeFilter;
      const matchesMediumCat = !catMediumFilter || p.categoryMedium === catMediumFilter;
      const matchesCurr = !currFilter || p.currency === currFilter;
      const matchesSupplier = !supplierFilter || p.supplierName === supplierFilter;

      return matchesSearch && matchesLargeCat && matchesMediumCat && matchesCurr && matchesSupplier;
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
  }, [products, searchQuery, catLargeFilter, catMediumFilter, currFilter, supplierFilter, sortKey, sortDir]);

  const handleSort = (key: keyof Product) => {
    if (sortKey === key) {
      setSortDir(sortDir === 1 ? -1 : 1);
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`⚠️ 정말로 상품 [${name}]을(를) DB에서 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      await deleteDoc(doc(db, "companies", COMPANY_ID, "products", id));
      alert("✅ 성공적으로 삭제되었습니다.");
    } catch (e: any) {
      alert("❌ 삭제 실패: " + e.message);
    }
  };

  const getSortIcon = (key: keyof Product) => {
    if (sortKey !== key) return "⇅";
    return sortDir === 1 ? "▲" : "▼";
  };

  return (
    <div className="page-container" style={{ padding: '12px 16px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', margin: 0 }}>상품 마스터 관리</h1>
          <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '2px' }}>회사 내 모든 무역 상품 스펙, 단가, 물류 정보를 중앙 관리합니다.</p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button 
            onClick={exportExcel}
            style={{ backgroundColor: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            ⬇ Excel 다운로드
          </button>
          <button 
            onClick={() => document.getElementById('excel_upload_input')?.click()}
            disabled={isUploading}
            style={{ backgroundColor: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
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
            onClick={() => { setEditingProdId(null); setIsCopyMode(false); setIsModalOpen(true); }}
            style={{ backgroundColor: '#2563eb', color: 'white', padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            ➕ 신규 상품 등록
          </button>
        </div>
      </header>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
        <input 
          type="text" 
          placeholder="상품명, 코드, 카테고리 검색..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', flex: '1', minWidth: '200px', fontSize: '13px' }}
        />
        <select value={catLargeFilter} onChange={(e) => setCatLargeFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}>
          <option value="">전체 대분류</option>
          {categories.large.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={catMediumFilter} onChange={(e) => setCatMediumFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}>
          <option value="">전체 중분류</option>
          {categories.medium.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={currFilter} onChange={(e) => setCurrFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}>
          <option value="">통화(전체)</option>
          <option value="USD">USD</option>
          <option value="KRW">KRW</option>
          <option value="EUR">EUR</option>
        </select>
        <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}>
          <option value="">공급업체(전체)</option>
          {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: '12px', fontSize: '14px', color: '#475569', fontWeight: 600 }}>
        총 {filteredAndSorted.length}건
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
          <thead style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #e2e8f0', fontSize: '13px' }}>
            <tr>
              <th onClick={() => handleSort('productCode')} style={thStyle(0, { padding: '6px 8px', cursor: 'pointer' })}>상품코드 {getSortIcon('productCode')}<span {...resizerProps(0)} /></th>
              <th onClick={() => handleSort('nameKo')} style={thStyle(1, { padding: '6px 8px', cursor: 'pointer' })}>상품명 / 규격 {getSortIcon('nameKo')}<span {...resizerProps(1)} /></th>
              <th onClick={() => handleSort('categoryLarge')} style={thStyle(2, { padding: '6px 8px', cursor: 'pointer' })}>분류 {getSortIcon('categoryLarge')}<span {...resizerProps(2)} /></th>
              <th onClick={() => handleSort('purchasePrice')} style={thStyle(3, { padding: '6px 8px', cursor: 'pointer', textAlign: 'right' })}>단가(구매가) {getSortIcon('purchasePrice')}<span {...resizerProps(3)} /></th>
              <th onClick={() => handleSort('supplierName')} style={thStyle(4, { padding: '6px 8px', cursor: 'pointer' })}>공급업체 / 제조사 {getSortIcon('supplierName')}<span {...resizerProps(4)} /></th>
              <th onClick={() => handleSort('origin')} style={thStyle(5, { padding: '6px 8px', cursor: 'pointer' })}>원산지 {getSortIcon('origin')}<span {...resizerProps(5)} /></th>
              <th style={thStyle(6, { padding: '6px 8px', textAlign: 'right' })}>관리<span {...resizerProps(6)} /></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>데이터 로딩 중...</td></tr>
            ) : filteredAndSorted.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>조건에 부합하는 상품이 없습니다.</td></tr>
            ) : (
              filteredAndSorted.map(p => {
                const priceFormatted = p.purchasePrice 
                  ? (p.currency === 'KRW' 
                      ? Math.round(Number(p.purchasePrice)).toLocaleString('ko-KR')
                      : Number(p.purchasePrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
                  : (p.currency === 'KRW' ? "0" : "0.00");
                
                const unitW = p.unitWidth ?? p.specWidth ?? 0;
                const unitL = p.unitLength ?? p.specLength ?? 0;
                const unitH = p.unitHeight ?? p.specHeight ?? 0;
                const unitWt = p.unitWeight ?? p.weight ?? 0;
                
                const palletW = p.palletWidth ?? (p.packageType === 'Pallet' ? p.specWidth : 0);
                const palletL = p.palletLength ?? (p.packageType === 'Pallet' ? p.specLength : 0);
                const palletH = p.palletHeight ?? (p.packageType === 'Pallet' ? p.specHeight : 0);
                const palletWt = p.palletWeight ?? (p.packageType === 'Pallet' ? p.weight : 0);

                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>
                    <td style={{ padding: '6px 8px' }}><strong style={{ color: '#0891b2' }}>{p.productCode || '-'}</strong></td>
                    <td style={{ padding: '6px 8px' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{p.nameKo || '-'}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{p.nameEn || '-'}</div>
                      
                      {/* Spec and Packings */}
                      <div style={{ marginTop: '4px', fontSize: '11px', color: '#475569' }}>
                        <span style={{ fontWeight: 600, color: '#64748b' }}>Spec:</span> {p.spec || '-'}
                      </div>
                      <div style={{ marginTop: '3px', fontSize: '11px', color: '#475569', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>
                          <span style={{ background: 'rgba(37,99,235,0.08)', color: '#2563eb', padding: '1px 4px', borderRadius: '3px', fontWeight: 600, fontSize: '10px', marginRight: '4px' }}>UNIT</span>
                          {unitW}x{unitL}x{unitH} ({unitWt}kg)
                        </span>
                        {(palletW || palletL || palletH || palletWt || p.qtyPerPallet) ? (
                          <span>
                            <span style={{ background: 'rgba(8,145,178,0.08)', color: '#0891b2', padding: '1px 4px', borderRadius: '3px', fontWeight: 600, fontSize: '10px', marginRight: '4px' }}>PLT</span>
                            {palletW}x{palletL}x{palletH} ({palletWt}kg)
                          </span>
                        ) : null}
                        {p.qtyPerPallet ? (
                          <span>
                             <span style={{ background: 'rgba(217,119,6,0.08)', color: '#d97706', padding: '1px 4px', borderRadius: '3px', fontWeight: 600, fontSize: '10px', marginRight: '4px' }}>적재</span>
                             <strong style={{ color: '#111827' }}>{p.qtyPerPallet}</strong> EA
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <span style={{ fontSize: '11px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#6b7280' }}>
                        {p.categoryLarge || '-'} &gt; {p.categoryMedium || '-'}
                      </span>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#059669' }}>
                        {p.currency || 'USD'} {priceFormatted} / <span style={{ color: '#2563eb', fontWeight: 700 }}>{p.unit || 'KG'}</span>
                      </div>
                      <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '1px' }}>Min Qty: {p.minOrderQty || 0}</div>
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <div style={{ fontWeight: 600, color: '#334155' }}>
                        {p.supplierName || '-'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#7c3aed', marginTop: '2px' }}>
                        <span style={{ color: '#6b7280', fontSize: '10px', marginRight: '4px' }}>제조:</span> {p.manufacturerName || '-'}
                      </div>
                    </td>
                    <td style={{ padding: '6px 8px' }}><span style={{ fontSize: '11px', color: '#6b7280' }}>{p.origin || '-'}</span></td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button 
                        onClick={() => { setEditingProdId(p.id); setIsCopyMode(false); setIsModalOpen(true); }}
                        style={{ background: 'none', border: '1px solid #cbd5e1', padding: '3px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', marginRight: '4px' }}
                      >✏ 수정</button>
                      <button 
                        onClick={() => { setEditingProdId(p.id); setIsCopyMode(true); setIsModalOpen(true); }}
                        style={{ background: 'none', border: '1px solid #3b82f6', color: '#3b82f6', padding: '3px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', marginRight: '4px' }}
                      >📋 복사</button>
                      <button 
                        onClick={() => handleDelete(p.id, p.nameKo)}
                        style={{ background: 'none', border: '1px solid #ef4444', color: '#ef4444', padding: '3px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
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
        <ProductModal 
          initialProduct={editingProdId ? products.find(p => p.id === editingProdId) : undefined}
          onClose={() => setIsModalOpen(false)}
          products={products}
          isCopy={isCopyMode}
        />
      )}
    </div>
  );
};
