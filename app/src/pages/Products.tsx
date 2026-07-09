import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, deleteDoc, setDoc, serverTimestamp, terminate, clearIndexedDbPersistence } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Product } from '../types/product';
import { ProductModal } from '../components/ProductModal';
import * as XLSX from 'xlsx';
import { useColumnResize } from '../hooks/useColumnResize';

const excelMapping = [
  { header: "상품코드(ID)", key: "productCode" },
  { header: "상품명(한글)", key: "nameKo" },
  { header: "상품명(영문)", key: "nameEn" },
  { header: "HS CODE", key: "hsCode" },
  { header: "고객사별 HS CODE(바이어명:HSCODE,바이어명2:HSCODE)", key: "customerHsCodes" },
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
  { header: "제조업체명", key: "manufacturerName" },
  { header: "제조업체코드", key: "manufacturerCode" },
  { header: "제조담당자", key: "manufacturerContact" },
  { header: "제조연락처", key: "manufacturerPhone" },
  { header: "제조이메일", key: "manufacturerEmail" },
  { header: "제조업체주소", key: "manufacturerAddress" },
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
  { header: "제조사명(Legacy)", key: "manufacturer" },
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
        if (m.key === 'customerHsCodes') {
          const map = p.customerHsCodes || {};
          row[m.header] = Object.entries(map).map(([k, v]) => `${k}:${v}`).join(',');
        } else {
          row[m.header] = (p as any)[m.key] ?? "";
        }
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
               
               if (m.key === 'customerHsCodes') {
                 const record: Record<string, string> = {};
                 if (val) {
                   val.split(',').forEach(pair => {
                     const [k, v] = pair.split(':');
                     if (k && v) {
                       record[k.trim()] = v.trim();
                     }
                   });
                 }
                 productData.customerHsCodes = record;
               } else {
                 productData[m.key] = val;
               }
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
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id } as Product));
      setProducts(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const cleanupDuplicates = async () => {
      if (products.length === 0) return;

      // 1. First delete explicit legacy formats: _copied_ or lowercase IDs
      const explicitLegacy = products.filter(p => p.id.includes('_copied_') || /^p\d+$/.test(p.id));
      if (explicitLegacy.length > 0) {
        for (const p of explicitLegacy) {
          try {
            await deleteDoc(doc(db, "companies", COMPANY_ID, "products", p.id));
            console.log('Deleted legacy duplicate doc ID:', p.id);
          } catch (err) {
            console.error('Failed to delete legacy doc ID:', p.id, err);
          }
        }
        return;
      }

      // 2. Group products by productCode (case-insensitive)
      const groups: Record<string, typeof products> = {};
      products.forEach(p => {
        const code = (p.productCode || p.id || '').trim().toUpperCase();
        if (code) {
          if (!groups[code]) groups[code] = [];
          groups[code].push(p);
        }
      });

      // 3. For each group with duplicates, keep the best one and delete the rest
      for (const [code, list] of Object.entries(groups)) {
        if (list.length > 1) {
          console.log(`Found duplicate productCode [${code}]:`, list.map(p => p.id));
          
          list.sort((a, b) => {
            const aMatches = a.id.toUpperCase() === code ? 1 : 0;
            const bMatches = b.id.toUpperCase() === code ? 1 : 0;
            if (aMatches !== bMatches) return bMatches - aMatches;
            
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return aTime - bTime;
          });

          const toDelete = list.slice(1);
          for (const p of toDelete) {
            try {
              await deleteDoc(doc(db, "companies", COMPANY_ID, "products", p.id));
              console.log(`Deleted redundant duplicate product doc [${p.id}] for code [${code}]`);
            } catch (err) {
              console.error(`Failed to delete redundant product doc [${p.id}]:`, err);
            }
          }
        }
      }
    };
    cleanupDuplicates();
  }, [products]);


  const categories = useMemo(() => {
    const large = [...new Set(products.map(p => p.categoryLarge).filter(Boolean))].sort();
    const filteredProductsForMedium = catLargeFilter 
      ? products.filter(p => p.categoryLarge === catLargeFilter)
      : products;
    const medium = [...new Set(filteredProductsForMedium.map(p => p.categoryMedium).filter(Boolean))].sort();
    return { large, medium };
  }, [products, catLargeFilter]);

  useEffect(() => {
    if (catMediumFilter && !categories.medium.includes(catMediumFilter)) {
      setCatMediumFilter('');
    }
  }, [categories.medium, catMediumFilter]);

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

  const handleClearCache = async () => {
    try {
      setLoading(true);
      await terminate(db);
      await clearIndexedDbPersistence(db);
      alert("✅ 로컬 캐시가 성공적으로 초기화되었습니다. 페이지를 새로고침합니다.");
      window.location.reload();
    } catch (err: any) {
      alert("캐시 초기화 실패: " + err.message);
      window.location.reload();
    }
  };

  const getSortIcon = (key: keyof Product) => {
    if (sortKey !== key) return "⇅";
    return sortDir === 1 ? "▲" : "▼";
  };

  return (
    <div className="page-container" style={{ padding: '24px 30px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>상품 마스터 관리</h1>
          <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '2px' }}>회사 내 모든 무역 상품 스펙, 단가, 물류 정보를 중앙 관리합니다.</p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button 
            onClick={exportExcel}
            style={{ backgroundColor: '#fff', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            ⬇ Excel 다운로드
          </button>
          <button 
            onClick={() => document.getElementById('excel_upload_input')?.click()}
            disabled={isUploading}
            style={{ backgroundColor: '#fff', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
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
            onClick={handleClearCache}
            style={{ backgroundColor: '#fff', border: '1px solid #ef4444', color: '#ef4444', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            🔄 캐시 초기화
          </button>
          <button 
            onClick={() => { setEditingProdId(null); setIsCopyMode(false); setIsModalOpen(true); }}
            style={{ backgroundColor: '#2563eb', color: 'white', padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            ➕ 신규 상품 등록
          </button>
        </div>
      </header>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', backgroundColor: '#fff', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="상품명, 코드, 스펙 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid var(--border-color)', borderRadius: '7px', flex: '1', minWidth: '200px', fontSize: '13px', outline: 'none', color: 'var(--text-primary)' }}
        />
        <select value={catLargeFilter} onChange={(e) => setCatLargeFilter(e.target.value)} style={{ padding: '7px 10px', border: '1px solid var(--border-color)', borderRadius: '7px', fontSize: '12.5px', color: '#334155', outline: 'none', cursor: 'pointer' }}>
          <option value="">전체 대분류</option>
          {categories.large.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={catMediumFilter} onChange={(e) => setCatMediumFilter(e.target.value)} style={{ padding: '7px 10px', border: '1px solid var(--border-color)', borderRadius: '7px', fontSize: '12.5px', color: '#334155', outline: 'none', cursor: 'pointer' }}>
          <option value="">전체 중분류</option>
          {categories.medium.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={currFilter} onChange={(e) => setCurrFilter(e.target.value)} style={{ padding: '7px 10px', border: '1px solid var(--border-color)', borderRadius: '7px', fontSize: '12.5px', color: '#334155', outline: 'none', cursor: 'pointer' }}>
          <option value="">통화(전체)</option>
          <option value="USD">USD</option>
          <option value="KRW">KRW</option>
          <option value="EUR">EUR</option>
        </select>
        <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} style={{ padding: '7px 10px', border: '1px solid var(--border-color)', borderRadius: '7px', fontSize: '12.5px', color: '#334155', outline: 'none', cursor: 'pointer' }}>
          <option value="">공급업체(전체)</option>
          {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {/* 필터 초기화 */}
        {(searchQuery || catLargeFilter || catMediumFilter || currFilter || supplierFilter) && (
          <button
            onClick={() => { setSearchQuery(''); setCatLargeFilter(''); setCatMediumFilter(''); setCurrFilter(''); setSupplierFilter(''); }}
            style={{ padding: '7px 10px', border: '1px solid #fecaca', borderRadius: '7px', background: '#fef2f2', color: '#dc2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >✕ 초기화</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', background: '#f1f5f9', padding: '5px 12px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
          총 {filteredAndSorted.length}건
          {filteredAndSorted.length !== products.length && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> / 전체 {products.length}건</span>}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', backgroundColor: 'white', border: '1px solid var(--border-color)', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
          <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1.5px solid var(--border-color)', fontSize: '11px' }}>
            <tr>
              <th onClick={() => handleSort('productCode')} style={thStyle(0, { padding: '9px 10px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' })}>상품코드 {getSortIcon('productCode')}<span {...resizerProps(0)} /></th>
              <th onClick={() => handleSort('nameKo')} style={thStyle(1, { padding: '9px 10px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' })}>상품명 / 규격 {getSortIcon('nameKo')}<span {...resizerProps(1)} /></th>
              <th onClick={() => handleSort('categoryLarge')} style={thStyle(2, { padding: '9px 10px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' })}>분류 {getSortIcon('categoryLarge')}<span {...resizerProps(2)} /></th>
              <th onClick={() => handleSort('purchasePrice')} style={thStyle(3, { padding: '9px 10px', cursor: 'pointer', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' })}>단가(구매가) {getSortIcon('purchasePrice')}<span {...resizerProps(3)} /></th>
              <th onClick={() => handleSort('supplierName')} style={thStyle(4, { padding: '9px 10px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' })}>공급업체 / 제조사 {getSortIcon('supplierName')}<span {...resizerProps(4)} /></th>
              <th onClick={() => handleSort('origin')} style={thStyle(5, { padding: '9px 10px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' })}>원산지 {getSortIcon('origin')}<span {...resizerProps(5)} /></th>
              <th style={thStyle(6, { padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' })}>관리<span {...resizerProps(6)} /></th>
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

                return (
                  <tr
                    key={p.id}
                    onClick={() => { setEditingProdId(p.id); setIsCopyMode(false); setIsModalOpen(true); }}
                    style={{ borderBottom: '1px solid #f1f5f9', fontSize: '13px', transition: 'background 0.1s', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                  >
                    {/* 상품코드 */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#2563eb' }}>{p.productCode || '-'}</div>
                      {p.hsCode && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px', display: 'inline-block', marginTop: '3px', fontWeight: 600 }}>
                          HS {p.hsCode}
                        </div>
                      )}
                      <div style={{ fontSize: '10px', color: 'var(--border-default)', marginTop: '2px' }}>{p.id}</div>
                    </td>

                    {/* 상품명 / 규격 — 핵심 정보 2줄로 압축 */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                      {/* 1줄: 한글명(굵게) + 영문명(연하게) */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>{p.nameKo || '-'}</span>
                        {p.nameEn && p.nameEn !== p.nameKo && (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>{p.nameEn}</span>
                        )}
                      </div>
                      {/* 2줄: 스펙 + UNIT/PLT/적재 뱃지 */}
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
                        {p.spec && (
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{p.spec}</span>
                        )}
                        {(unitW || unitL || unitH || unitWt) ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <span style={{ background: '#eff6ff', color: '#2563eb', padding: '0px 4px', borderRadius: '3px', fontWeight: 700, fontSize: '11px' }}>UNIT</span>
                            <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{unitW}x{unitL}x{unitH} ({unitWt}kg)</span>
                          </span>
                        ) : null}
                        {(palletW || palletL || palletH) ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <span style={{ background: '#ecfeff', color: '#0891b2', padding: '0px 4px', borderRadius: '3px', fontWeight: 700, fontSize: '11px' }}>PLT</span>
                            <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{palletW}x{palletL}x{palletH}</span>
                          </span>
                        ) : null}
                        {p.qtyPerPallet ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <span style={{ background: '#fffbeb', color: '#d97706', padding: '0px 4px', borderRadius: '3px', fontWeight: 700, fontSize: '11px' }}>적재</span>
                            <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700 }}>{p.qtyPerPallet} EA</span>
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* 분류 */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: '#f8fafc', border: '1px solid var(--border-color)', padding: '2px 7px', borderRadius: '4px', display: 'inline-block', lineHeight: 1.4 }}>
                        {p.categoryLarge || '-'}
                        {p.categoryMedium && <span style={{ color: 'var(--text-muted)' }}> &gt; {p.categoryMedium}</span>}
                      </div>
                    </td>

                    {/* 단가 */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#16a34a' }}>
                        {p.currency || 'KRW'} {priceFormatted}
                      </div>
                      <div style={{ fontSize: '11px', color: '#2563eb', fontWeight: 700 }}>/ {p.unit || 'KG'}</div>
                      {(p.minOrderQty || 0) > 0 && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>MOQ {p.minOrderQty}</div>
                      )}
                    </td>

                    {/* 공급업체 / 제조사 */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>{p.supplierName || '-'}</div>
                      {p.manufacturerName && p.manufacturerName !== p.supplierName && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>제조: </span>{p.manufacturerName}
                        </div>
                      )}
                    </td>

                    {/* 원산지 */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{p.origin || '-'}</span>
                    </td>

                    {/* 관리 — 삭제는 수정 모달 안에서만, 목록에서는 숨김 */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingProdId(p.id); setIsCopyMode(false); setIsModalOpen(true); }}
                        style={{ background: '#fff', border: '1px solid var(--border-color)', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', marginRight: '4px', fontWeight: 600, transition: 'all 0.1s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2563eb'; (e.currentTarget as HTMLButtonElement).style.color = '#2563eb'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-color)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
                      >수정</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingProdId(p.id); setIsCopyMode(true); setIsModalOpen(true); }}
                        style={{ background: '#fff', border: '1px solid var(--border-color)', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2563eb'; (e.currentTarget as HTMLButtonElement).style.color = '#2563eb'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-color)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
                      >복사</button>
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
