import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { subscribeCustomCurrencies, handleCurrencySelection, DEFAULT_CURRENCIES } from '../utils/currency';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [customCurrencies, setCustomCurrencies] = useState<string[]>([]);
  useEffect(() => {
    return subscribeCustomCurrencies(setCustomCurrencies);
  }, []);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Column resize: [코드, 품명(한글), 품명(영어), 규격, 분류, 제조사, 공급업체, 단가, 원산지, TDS, MSDS, 관리]
  const { thStyle, resizerProps } = useColumnResize([80, 135, 140, 150, 120, 115, 115, 105, 55, 55, 55, 95]);
  
  // Filtering & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [catLargeFilter, setCatLargeFilter] = useState('');
  const [catMediumFilter, setCatMediumFilter] = useState('');
  const [currFilter, setCurrFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [pageSize, setPageSize] = useState<number>(30);
  const [currentPage, setCurrentPage] = useState<number>(1);
  
  // Sorting
  const [sortKey, setSortKey] = useState<keyof Product>('productCode');
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProdId, setEditingProdId] = useState<string | null>(null);
  const [isCopyMode, setIsCopyMode] = useState(false);

  const handleOpenModal = (id?: string | null, copyMode = false) => {
    setEditingProdId(id || null);
    setIsCopyMode(copyMode);
    setIsModalOpen(true);
    if (id) {
      const prod = products.find(p => p.id === id);
      const urlId = prod?.productCode || id;
      setSearchParams({ id: urlId }, { replace: true });
    } else {
      setSearchParams({ id: 'new' }, { replace: true });
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProdId(null);
    setIsCopyMode(false);
    setSearchParams({}, { replace: true });
  };

  // 🔗 URL Query Sync for Product Master direct linking (?id=P0001 or docId)
  useEffect(() => {
    const targetId = searchParams.get('id');
    if (targetId && products.length > 0 && !isModalOpen) {
      if (targetId === 'new') {
        setEditingProdId(null);
        setIsCopyMode(false);
        setIsModalOpen(true);
      } else {
        const found = products.find(p => p.id === targetId || p.productCode === targetId);
        if (found) {
          setEditingProdId(found.id);
          setIsCopyMode(false);
          setIsModalOpen(true);
        }
      }
    }
  }, [searchParams, products]);

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

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, catLargeFilter, catMediumFilter, currFilter, supplierFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedProducts = useMemo(() => {
    const start = (validCurrentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, validCurrentPage, pageSize]);

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
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', margin: 0 }}>상품 마스터 관리</h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>회사 내 모든 무역 상품 스펙, 단가, 분류 정보를 중앙 관리합니다.</p>
        </div>
        <div style={{ display: 'flex', gap: '6px', height: '34px' }}>
          <button 
            onClick={exportExcel}
            style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '0 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '12.5px', transition: 'background 0.2s', height: '100%', boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
          >
            ⬇ Excel 다운로드
          </button>
          <button 
            onClick={() => document.getElementById('excel_upload_input')?.click()}
            disabled={isUploading}
            style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '0 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '12.5px', transition: 'background 0.2s', height: '100%', boxSizing: 'border-box' }}
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
            onClick={handleClearCache}
            style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '0 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '12.5px', transition: 'background 0.2s', height: '100%', boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
          >
            🔄 캐시 초기화
          </button>
          <button 
            onClick={() => handleOpenModal(null, false)}
            style={{ backgroundColor: '#3b82f6', color: 'white', padding: '0 16px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '12.5px', transition: 'background 0.2s', height: '100%', boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            ➕ 신규 상품 등록
          </button>
        </div>
      </header>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', backgroundColor: '#fff', padding: '10px 14px', borderRadius: '4px', border: '1px solid #cbd5e1', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="상품명, 코드, 스펙 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', flex: '1', minWidth: '200px', fontSize: '13px', outline: 'none', color: '#1e293b', height: '34px', boxSizing: 'border-box' }}
        />
        <select value={catLargeFilter} onChange={(e) => setCatLargeFilter(e.target.value)} style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', color: '#1e293b', outline: 'none', cursor: 'pointer', height: '34px', boxSizing: 'border-box' }}>
          <option value="">전체 대분류</option>
          {categories.large.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={catMediumFilter} onChange={(e) => setCatMediumFilter(e.target.value)} style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', color: '#1e293b', outline: 'none', cursor: 'pointer', height: '34px', boxSizing: 'border-box' }}>
          <option value="">전체 중분류</option>
          {categories.medium.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={currFilter} onChange={(e) => handleCurrencySelection(e.target.value, currFilter, customCurrencies, setCurrFilter)} style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', color: '#1e293b', outline: 'none', cursor: 'pointer', height: '34px', boxSizing: 'border-box' }}>
          <option value="">통화(전체)</option>
          {[...DEFAULT_CURRENCIES, ...customCurrencies].map(c => <option key={c} value={c}>{c}</option>)}
          <option value="ADD_NEW_CURRENCY" style={{ color: '#2563eb', fontWeight: 'bold' }}>+ 추가등록</option>
        </select>
        <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', color: '#1e293b', outline: 'none', cursor: 'pointer', height: '34px', boxSizing: 'border-box' }}>
          <option value="">공급업체(전체)</option>
          {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {/* 필터 초기화 */}
        {(searchQuery || catLargeFilter || catMediumFilter || currFilter || supplierFilter) && (
          <button
            onClick={() => { setSearchQuery(''); setCatLargeFilter(''); setCatMediumFilter(''); setCurrFilter(''); setSupplierFilter(''); }}
            style={{ padding: '0 10px', border: '1px solid #fecaca', borderRadius: '4px', background: '#fef2f2', color: '#dc2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer', height: '34px', boxSizing: 'border-box' }}
          >✕ 초기화</button>
        )}
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', color: '#1e293b', fontWeight: 700, outline: 'none', cursor: 'pointer', height: '34px', boxSizing: 'border-box', backgroundColor: '#fff' }}
        >
          <option value={30}>30개씩 보기</option>
          <option value={50}>50개씩 보기</option>
          <option value={100}>100개씩 보기</option>
        </select>

        <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700, color: '#475569', background: '#f1f5f9', padding: '5px 12px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
          총 {filteredAndSorted.length}건
          {filteredAndSorted.length !== products.length && <span style={{ color: '#94a3b8', fontWeight: 400 }}> / 전체 {products.length}건</span>}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'hidden', backgroundColor: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
          <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1', fontSize: '12.5px' }}>
            <tr>
              <th onClick={() => handleSort('productCode')} style={thStyle(0, { padding: '10px', cursor: 'pointer', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' })}>상품코드 {getSortIcon('productCode')}<span {...resizerProps(0)} /></th>
              <th onClick={() => handleSort('nameKo')} style={thStyle(1, { padding: '10px', cursor: 'pointer', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' })}>품명(한글) {getSortIcon('nameKo')}<span {...resizerProps(1)} /></th>
              <th onClick={() => handleSort('nameEn')} style={thStyle(2, { padding: '10px', cursor: 'pointer', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' })}>품명(영어) {getSortIcon('nameEn')}<span {...resizerProps(2)} /></th>
              <th onClick={() => handleSort('spec')} style={thStyle(3, { padding: '10px', cursor: 'pointer', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' })}>규격(SPEC) {getSortIcon('spec')}<span {...resizerProps(3)} /></th>
              <th onClick={() => handleSort('categoryLarge')} style={thStyle(4, { padding: '10px', cursor: 'pointer', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' })}>분류 {getSortIcon('categoryLarge')}<span {...resizerProps(4)} /></th>
              <th onClick={() => handleSort('manufacturerName')} style={thStyle(5, { padding: '10px', cursor: 'pointer', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' })}>제조사 {getSortIcon('manufacturerName')}<span {...resizerProps(5)} /></th>
              <th onClick={() => handleSort('supplierName')} style={thStyle(6, { padding: '10px', cursor: 'pointer', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' })}>공급업체 {getSortIcon('supplierName')}<span {...resizerProps(6)} /></th>
              <th onClick={() => handleSort('purchasePrice')} style={thStyle(7, { padding: '10px', cursor: 'pointer', textAlign: 'right', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' })}>단가 {getSortIcon('purchasePrice')}<span {...resizerProps(7)} /></th>
              <th onClick={() => handleSort('origin')} style={thStyle(8, { padding: '10px', cursor: 'pointer', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' })}>원산지 {getSortIcon('origin')}<span {...resizerProps(8)} /></th>
              <th style={thStyle(9, { padding: '10px', textAlign: 'center', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' })}>TDS<span {...resizerProps(9)} /></th>
              <th style={thStyle(10, { padding: '10px', textAlign: 'center', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' })}>MSDS<span {...resizerProps(10)} /></th>
              <th style={thStyle(11, { padding: '10px', textAlign: 'right', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' })}>관리<span {...resizerProps(11)} /></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: '#6b7280', fontSize: '14px' }}>데이터 로딩 중...</td></tr>
            ) : filteredAndSorted.length === 0 ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: '#6b7280', fontSize: '14px' }}>조건에 부합하는 상품이 없습니다.</td></tr>
            ) : (
              paginatedProducts.map(p => {
                const priceFormatted = p.purchasePrice 
                  ? (p.currency === 'KRW' 
                      ? Math.round(Number(p.purchasePrice)).toLocaleString('ko-KR')
                      : Number(p.purchasePrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
                  : (p.currency === 'KRW' ? "0" : "0.00");
                
                const tdsCount = (p.technicalDocuments || []).filter(d => d.category === 'TDS').length;
                const msdsCount = (p.technicalDocuments || []).filter(d => d.category === 'MSDS').length;

                return (
                  <tr
                    key={p.id}
                    onClick={() => handleOpenModal(p.id, false)}
                    style={{ borderBottom: '1px solid #cbd5e1', fontSize: '13.5px', transition: 'background 0.1s', cursor: 'pointer', height: '48px', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                  >
                    {/* 상품코드 */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: 750, color: '#2563eb' }}>{p.productCode || '-'}</span>
                    </td>

                    {/* 품명 (한글) */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.nameKo || ''}>
                      <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>{p.nameKo || '-'}</span>
                    </td>

                    {/* 품명 (영어) */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.nameEn || ''}>
                      <span style={{ fontSize: '13.5px', color: '#475569', fontWeight: 600 }}>{p.nameEn || '-'}</span>
                    </td>

                    {/* 규격 (SPEC) */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.spec || ''}>
                      <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 500 }}>{p.spec || '-'}</span>
                    </td>

                    {/* 분류 */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '12.5px', color: '#334155', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        {p.categoryLarge || '-'}
                        {p.categoryMedium && <span style={{ color: '#64748b' }}> &gt; {p.categoryMedium}</span>}
                      </span>
                    </td>

                    {/* 제조사 */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.manufacturerName || p.supplierName || ''}>
                      <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 600 }}>{p.manufacturerName || p.supplierName || '-'}</span>
                    </td>

                    {/* 공급업체 */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.supplierName || ''}>
                      <span style={{ fontSize: '13.5px', fontWeight: 650, color: '#334155' }}>{p.supplierName || '-'}</span>
                    </td>

                    {/* 단가 */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: '#15803d' }}>
                        {p.currency || 'KRW'} {priceFormatted}
                      </span>
                      <span style={{ fontSize: '12px', color: '#475569', marginLeft: '3px', fontWeight: 600 }}>/ {p.unit || 'KG'}</span>
                    </td>

                    {/* 원산지 */}
                    <td style={{ padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>{p.origin || '-'}</span>
                    </td>

                    {/* TDS */}
                    <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      {tdsCount > 0 ? (
                        <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', padding: '3px 7px', borderRadius: '4px', fontSize: '12px', fontWeight: 800 }}>
                          📄 TDS ({tdsCount})
                        </span>
                      ) : (
                        <span style={{ color: '#cbd5e1', fontSize: '13px' }}>-</span>
                      )}
                    </td>

                    {/* MSDS */}
                    <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      {msdsCount > 0 ? (
                        <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', padding: '3px 7px', borderRadius: '4px', fontSize: '12px', fontWeight: 800 }}>
                          🧪 MSDS ({msdsCount})
                        </span>
                      ) : (
                        <span style={{ color: '#cbd5e1', fontSize: '13px' }}>-</span>
                      )}
                    </td>

                    {/* 관리 */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenModal(p.id, false); }}
                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px', color: '#334155', marginRight: '4px', fontWeight: 700, transition: 'background 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                      >수정</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenModal(p.id, true); }}
                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px', color: '#334155', fontWeight: 700, transition: 'background 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                      >복사</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {filteredAndSorted.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '12px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
          <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
            {filteredAndSorted.length > 0 ? (
              <span>
                총 <strong style={{ color: '#1e293b' }}>{filteredAndSorted.length}</strong>개 항목 중{' '}
                <strong style={{ color: '#3b82f6' }}>{(validCurrentPage - 1) * pageSize + 1}</strong> -{' '}
                <strong style={{ color: '#3b82f6' }}>{Math.min(validCurrentPage * pageSize, filteredAndSorted.length)}</strong> 표시 중
              </span>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => setCurrentPage(1)}
              disabled={validCurrentPage === 1}
              style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', background: validCurrentPage === 1 ? '#f1f5f9' : '#fff', color: validCurrentPage === 1 ? '#94a3b8' : '#334155', fontSize: '12.5px', fontWeight: 700, cursor: validCurrentPage === 1 ? 'not-allowed' : 'pointer' }}
            >
              ⏮️ 처음
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={validCurrentPage === 1}
              style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', background: validCurrentPage === 1 ? '#f1f5f9' : '#fff', color: validCurrentPage === 1 ? '#94a3b8' : '#334155', fontSize: '12.5px', fontWeight: 700, cursor: validCurrentPage === 1 ? 'not-allowed' : 'pointer' }}
            >
              ◀ 이전
            </button>

            {/* Page numbers (up to 7 max range) */}
            {(() => {
              const pages = [];
              const maxButtons = 7;
              let startPage = Math.max(1, validCurrentPage - Math.floor(maxButtons / 2));
              let endPage = startPage + maxButtons - 1;

              if (endPage > totalPages) {
                endPage = totalPages;
                startPage = Math.max(1, endPage - maxButtons + 1);
              }

              for (let i = startPage; i <= endPage; i++) {
                pages.push(
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i)}
                    style={{
                      padding: '6px 12px',
                      border: i === validCurrentPage ? '1px solid #3b82f6' : '1px solid #cbd5e1',
                      borderRadius: '4px',
                      background: i === validCurrentPage ? '#3b82f6' : '#fff',
                      color: i === validCurrentPage ? '#fff' : '#334155',
                      fontSize: '12.5px',
                      fontWeight: i === validCurrentPage ? 800 : 600,
                      cursor: 'pointer'
                    }}
                  >
                    {i}
                  </button>
                );
              }
              return pages;
            })()}

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={validCurrentPage === totalPages}
              style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', background: validCurrentPage === totalPages ? '#f1f5f9' : '#fff', color: validCurrentPage === totalPages ? '#94a3b8' : '#334155', fontSize: '12.5px', fontWeight: 700, cursor: validCurrentPage === totalPages ? 'not-allowed' : 'pointer' }}
            >
              다음 ▶
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={validCurrentPage === totalPages}
              style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', background: validCurrentPage === totalPages ? '#f1f5f9' : '#fff', color: validCurrentPage === totalPages ? '#94a3b8' : '#334155', fontSize: '12.5px', fontWeight: 700, cursor: validCurrentPage === totalPages ? 'not-allowed' : 'pointer' }}
            >
              끝 ⏭️
            </button>
          </div>
        </div>
      )}

      {isModalOpen && (
        <ProductModal 
          initialProduct={editingProdId ? products.find(p => p.id === editingProdId) : undefined}
          onClose={handleCloseModal}
          products={products}
          isCopy={isCopyMode}
        />
      )}
    </div>
  );
};
