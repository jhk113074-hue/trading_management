import React, { useState, useMemo } from 'react';
import type { Product } from '../types/product';
import { doc, deleteDoc } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import { ProductModal } from './ProductModal';

interface Props {
  onClose: () => void;
  onSelect: (product: Product) => void;
  products: Product[];
  initialSearchTerm?: string;
}

export const ProductSearchModal: React.FC<Props> = ({ onClose, onSelect, products, initialSearchTerm = '' }) => {

  // Modeless Drag-to-move state
  const [position, setPosition] = useState({ x: 100, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = React.useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const nextX = Math.max(0, Math.min(window.innerWidth - 300, e.clientX - dragStartRef.current.x));
      const nextY = Math.max(0, Math.min(window.innerHeight - 150, e.clientY - dragStartRef.current.y));
      setPosition({ x: nextX, y: nextY });
    };
    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedSupplier, setSelectedSupplier] = useState('All');
  const [isProdModalOpen, setIsProdModalOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<Product | undefined>(undefined);
  const [isCopyMode, setIsCopyMode] = useState(false);

  // Extract unique categories & suppliers for filtering
  const categories = useMemo(() => {
    const list = new Set<string>();
    products.forEach(p => {
      if (p.categoryLarge) list.add(p.categoryLarge);
    });
    return ['All', ...Array.from(list)];
  }, [products]);

  const suppliers = useMemo(() => {
    const list = new Set<string>();
    products.forEach(p => {
      if (p.supplierName) list.add(p.supplierName);
    });
    return ['All', ...Array.from(list)];
  }, [products]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = 
        (p.productCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.nameKo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.nameEn || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.spec || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.supplierName || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchCategory = selectedCategory === 'All' || p.categoryLarge === selectedCategory;
      const matchSupplier = selectedSupplier === 'All' || p.supplierName === selectedSupplier;

      return matchSearch && matchCategory && matchSupplier;
    });
  }, [products, searchTerm, selectedCategory, selectedSupplier]);

  return (
    <div style={{
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      zIndex: 30000,
      pointerEvents: 'none',
      userSelect: isDragging ? 'none' : 'auto'
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '90%', maxWidth: '1000px',
        height: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden', border: '1px solid #e2e8f0',
        pointerEvents: 'auto',
        resize: 'both',
        minWidth: '600px', minHeight: '350px'
      }}>
        {/* Header */}
        <div 
          onMouseDown={handleMouseDown}
          style={{
            padding: '20px 24px', borderBottom: '1px solid #e2e8f0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#f8fafc',
            cursor: 'move',
            userSelect: 'none'
          }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
              🔍 상품 검색 및 불러오기 (Subwindow)
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              더블 클릭하거나 [선택] 버튼을 눌러 견적서 상품 라인에 추가할 수 있습니다.
            </p>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: '24px',
              color: '#94a3b8', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              padding: '4px', borderRadius: '50%', width: '36px', height: '36px',
              transition: 'background-color 0.2s, color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f1f5f9';
              e.currentTarget.style.color = '#475569';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            ✕
          </button>
        </div>

        {/* Filters */}
        <div style={{
          padding: '16px 24px', background: '#fff', borderBottom: '1px solid #f1f5f9',
          display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center'
        }}>
          {/* Text Search */}
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
              color: '#94a3b8', fontSize: '14px'
            }}>🔍</span>
            <input
              type="text"
              placeholder="상품코드, 상품명, 규격, 공급사 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px 10px 36px',
                border: '1px solid #cbd5e1', borderRadius: '8px',
                fontSize: '13px', color: '#1e293b', outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s, box-shadow 0.2s'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#3b82f6';
                e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.15)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#cbd5e1';
                e.target.style.boxShadow = 'none';
              }}
              autoFocus
            />
          </div>

          {/* Large Category Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>대분류</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                fontSize: '13px', color: '#334155', outline: 'none', background: '#fff',
                cursor: 'pointer'
              }}
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat === 'All' ? '전체 대분류' : cat}</option>
              ))}
            </select>
          </div>

          {/* Supplier Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>공급사</label>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              style={{
                padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                fontSize: '13px', color: '#334155', outline: 'none', background: '#fff',
                cursor: 'pointer'
              }}
            >
              {suppliers.map(sup => (
                <option key={sup} value={sup}>{sup === 'All' ? '전체 공급사' : sup}</option>
              ))}
            </select>
          </div>

          {/* Reset Search */}
          {(searchTerm !== '' || selectedCategory !== 'All' || selectedSupplier !== 'All') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('All');
                setSelectedSupplier('All');
              }}
              style={{
                background: '#f1f5f9', border: 'none', padding: '9px 14px',
                borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                color: '#475569', cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            >
              초기화
            </button>
          )}
          <button
            onClick={() => {
              setEditingProd(undefined);
              setIsProdModalOpen(true);
            }}
            style={{
              background: '#2563eb', border: 'none', padding: '9px 16px',
              borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              color: '#fff', cursor: 'pointer', marginLeft: 'auto',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
          >
            ➕ 상품 등록
          </button>
        </div>

        {/* Results Info */}
        <div style={{
          padding: '8px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
          fontSize: '12px', color: '#64748b', fontWeight: 500
        }}>
          검색 결과: <span style={{ color: '#2563eb', fontWeight: 700 }}>{filteredProducts.length}</span>개 상품
        </div>

        {/* Table View */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{
                position: 'sticky', top: 0, background: '#fff', zIndex: 10,
                borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600
              }}>
                <th style={{ padding: '12px 8px' }}>상품코드</th>
                <th style={{ padding: '12px 8px' }}>상품명 (국문/영문)</th>
                <th style={{ padding: '12px 8px' }}>규격 / 스펙</th>
                <th style={{ padding: '12px 8px' }}>공급사</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>기준 단가</th>
                <th style={{ padding: '12px 8px', width: '160px', textAlign: 'center' }}>선택 / 관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{
                    textAlign: 'center', padding: '48px 0', color: '#94a3b8',
                    fontSize: '14px'
                  }}>
                    검색 결과가 없습니다. 다른 검색어를 입력해보세요.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr
                    key={p.id}
                    onDoubleClick={() => onSelect(p)}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td style={{ padding: '12px 8px', fontWeight: 600, color: '#0f172a' }}>
                      <span style={{
                        background: '#eff6ff', color: '#1d4ed8',
                        padding: '3px 8px', borderRadius: '4px', fontSize: '11px',
                        border: '1px solid #bfdbfe'
                      }}>
                        {p.productCode}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ fontWeight: 600, color: '#334155' }}>{p.nameKo || '-'}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{p.nameEn || '-'}</div>
                    </td>
                    <td style={{ padding: '12px 8px', color: '#475569', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.spec || p.description || '-'}
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{
                        fontSize: '11px', background: '#f0fdf4', color: '#15803d',
                        padding: '2px 6px', borderRadius: '4px', fontWeight: 500,
                        border: '1px solid #bbf7d0'
                      }}>
                        🏢 {p.supplierName || '없음'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                      {p.purchasePrice ? (
                        <>
                          <span style={{ fontSize: '11px', color: '#64748b', marginRight: '4px' }}>{p.currency || 'USD'}</span>
                          {p.purchasePrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>미지정</span>
                      )}
                      <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '4px' }}>/ {p.unit || 'KG'}</span>
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(p);
                          }}
                          style={{
                            background: '#2563eb', color: '#fff', border: 'none',
                            padding: '6px 10px', borderRadius: '6px', fontSize: '11px',
                            fontWeight: 600, cursor: 'pointer',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                        >
                          선택
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingProd(p);
                            setIsCopyMode(true);
                            setIsProdModalOpen(true);
                          }}
                          style={{
                            background: '#fef08a', color: '#854d0e', border: '1px solid #fef08a',
                            padding: '6px 8px', borderRadius: '6px', fontSize: '11px',
                            fontWeight: 600, cursor: 'pointer',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fde047'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fef08a'}
                          title="복사"
                        >
                          📋
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingProd(p);
                            setIsCopyMode(false);
                            setIsProdModalOpen(true);
                          }}
                          style={{
                            background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
                            padding: '6px 8px', borderRadius: '6px', fontSize: '11px',
                            fontWeight: 600, cursor: 'pointer',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                          title="수정"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm(`정말 "${p.nameKo || p.productCode}" 상품을 삭제하시겠습니까?`)) {
                              try {
                                const pRef = doc(db, 'companies', COMPANY_ID, 'products', p.id);
                                  await deleteDoc(pRef);
                                  alert('상품이 삭제되었습니다.');
                                } catch (err) {
                                  console.error('Failed to delete product:', err);
                                  alert('상품 삭제에 실패했습니다.');
                                }
                              }
                            }}
                            style={{
                              background: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2',
                              padding: '6px 8px', borderRadius: '6px', fontSize: '11px',
                              fontWeight: 600, cursor: 'pointer',
                              transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#fee2e2';
                              e.currentTarget.style.borderColor = '#fca5a5';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#fef2f2';
                              e.currentTarget.style.borderColor = '#fee2e2';
                            }}
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
        </div>
        {isProdModalOpen && (
          <ProductModal
            initialProduct={editingProd}
            onClose={() => {
              setIsProdModalOpen(false);
              setIsCopyMode(false);
            }}
            products={products}
            isCopy={isCopyMode}
          />
        )}
      </div>
    );
  };
