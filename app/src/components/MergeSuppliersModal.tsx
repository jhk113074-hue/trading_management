import React, { useState, useMemo } from 'react';
import { doc, updateDoc, deleteDoc, getDocs, collection, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Supplier } from '../types/supplier';
import { cleanCompanyName, normalizeCompanyKey, isSameCompany } from '../utils/companyUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  allKnownSupplierNames?: string[];
  defaultTargetSupplierName?: string;
  onMergedSuccess?: () => void;
}

export const MergeSuppliersModal: React.FC<Props> = ({
  isOpen,
  onClose,
  suppliers,
  allKnownSupplierNames = [],
  defaultTargetSupplierName,
  onMergedSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'merge' | 'manage'>('merge');

  // 대표 업체 선택
  const [targetSupplierId, setTargetSupplierId] = useState<string>('');
  const [supplierSearch, setSupplierSearch] = useState<string>('');

  // 병합할 대상 업체명들
  const [selectedAliases, setSelectedAliases] = useState<string[]>([]);
  const [candidateSearch, setCandidateSearch] = useState<string>('');
  const [customAliasInput, setCustomAliasInput] = useState<string>('');

  // 옵션들
  const [updateExistingDocs, setUpdateExistingDocs] = useState<boolean>(false);
  const [absorbDuplicateMasters, setAbsorbDuplicateMasters] = useState<boolean>(false);

  // 진행 상태
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processStatusText, setProcessStatusText] = useState<string>('');

  // 대표 공급업체 초기값 설정
  React.useEffect(() => {
    if (isOpen && defaultTargetSupplierName) {
      const matched = suppliers.find(s => isSameCompany(s.name, defaultTargetSupplierName) || s.supplierCode === defaultTargetSupplierName);
      if (matched) {
        setTargetSupplierId(matched.id);
      }
    }
  }, [isOpen, defaultTargetSupplierName, suppliers]);

  // 선택된 대표 공급업체 객체
  const targetSupplier = useMemo(() => {
    return suppliers.find(s => s.id === targetSupplierId);
  }, [suppliers, targetSupplierId]);

  // 대표 업체 후보 목록 (필터링)
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    const q = supplierSearch.toLowerCase();
    return suppliers.filter(s =>
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.supplierCode && s.supplierCode.toLowerCase().includes(q)) ||
      (s.representative && s.representative.toLowerCase().includes(q)) ||
      (s.bizNumber && s.bizNumber.includes(q))
    );
  }, [suppliers, supplierSearch]);

  // 병합 후보로 선택 가능한 전체 고유 공급업체명 목록
  const candidateSupplierNames = useMemo(() => {
    const names = new Set<string>();

    // 1. 주문/수입/매입에 등장한 모든 상호명
    allKnownSupplierNames.forEach(n => {
      const c = cleanCompanyName(n);
      if (c) names.add(c);
    });

    // 2. 공급업체 마스터 상호명
    suppliers.forEach(s => {
      if (s.name) names.add(cleanCompanyName(s.name));
    });

    // 대표 공급업체의 주 상호명은 후보에서 제외
    if (targetSupplier?.name) {
      names.delete(cleanCompanyName(targetSupplier.name));
    }

    // 이미 등록된 별칭도 제외
    if (Array.isArray(targetSupplier?.aliases)) {
      targetSupplier.aliases.forEach(a => names.delete(cleanCompanyName(a)));
    }

    const list = Array.from(names).sort();
    if (!candidateSearch.trim()) return list;
    const q = candidateSearch.toLowerCase();
    return list.filter(n => n.toLowerCase().includes(q));
  }, [allKnownSupplierNames, suppliers, targetSupplier, candidateSearch]);

  // 후보 체크박스 토글
  const handleToggleCandidate = (name: string) => {
    setSelectedAliases(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  // 직접 입력한 별칭 추가
  const handleAddCustomAlias = () => {
    const trimmed = cleanCompanyName(customAliasInput);
    if (!trimmed) return;
    if (targetSupplier && isSameCompany(targetSupplier.name, trimmed)) {
      alert('대표 업체의 상호명과 동일합니다.');
      return;
    }
    if (selectedAliases.includes(trimmed)) {
      alert('이미 추가된 항목입니다.');
      return;
    }
    setSelectedAliases(prev => [...prev, trimmed]);
    setCustomAliasInput('');
  };

  // 선택된 별칭 제거
  const handleRemoveSelectedAlias = (name: string) => {
    setSelectedAliases(prev => prev.filter(n => n !== name));
  };

  // 병합 실행
  const handleExecuteMerge = async () => {
    if (!targetSupplier) {
      alert('기준이 될 대표 공급업체를 먼저 선택해 주세요.');
      return;
    }
    if (selectedAliases.length === 0) {
      alert('대표 업체와 하나로 합칠 대상 업체명을 1개 이상 선택하거나 추가해 주세요.');
      return;
    }

    const confirmMsg = `[${targetSupplier.supplierCode}] ${targetSupplier.name} 업체에\n다음 ${selectedAliases.length}개 업체를 하나로 합치시겠습니까?\n\n• 합칠 대상: ${selectedAliases.join(', ')}\n\n합치면 매입관리, 채무관리, 채권관리 장부에서 모두 [${targetSupplier.name}] 한 회사로 통합되어 집계됩니다.`;
    if (!window.confirm(confirmMsg)) return;

    setIsProcessing(true);
    setProcessStatusText('대표 업체 별칭(Alias) 등록 중...');

    try {
      // 1. 대표 업체의 aliases 및 mergedFromCodes 업데이트
      const existingAliases = Array.isArray(targetSupplier.aliases) ? targetSupplier.aliases : [];
      const updatedAliasesSet = new Set([...existingAliases]);
      selectedAliases.forEach(a => updatedAliasesSet.add(a));
      const updatedAliases = Array.from(updatedAliasesSet);

      const existingMergedCodes = Array.isArray(targetSupplier.mergedFromCodes) ? targetSupplier.mergedFromCodes : [];
      const updatedMergedCodesSet = new Set([...existingMergedCodes]);

      // 2. 마스터 공급업체 중 흡수 대상 확인
      const absorbedMasterIds: string[] = [];
      if (absorbDuplicateMasters) {
        setProcessStatusText('중복 마스터 공급업체 흡수 처리 중...');
        selectedAliases.forEach(alias => {
          const matchedDup = suppliers.find(s => s.id !== targetSupplier.id && isSameCompany(s.name, alias));
          if (matchedDup) {
            if (matchedDup.supplierCode && matchedDup.supplierCode !== '-') {
              updatedMergedCodesSet.add(matchedDup.supplierCode);
            }
            absorbedMasterIds.push(matchedDup.id);
          }
        });
      }

      // 대표 공급업체 문서 갱신
      await updateDoc(doc(db, 'companies', COMPANY_ID, 'suppliers', targetSupplier.id), {
        aliases: updatedAliases,
        mergedFromCodes: Array.from(updatedMergedCodesSet),
        updatedAt: serverTimestamp()
      });

      // 중복 마스터 공급업체 삭제 처리 (선택 시)
      for (const dupId of absorbedMasterIds) {
        try {
          await deleteDoc(doc(db, 'companies', COMPANY_ID, 'suppliers', dupId));
        } catch (delErr) {
          console.error('중복 마스터 삭제 실패:', delErr);
        }
      }

      // 3. 기존 원장 데이터 일괄 변경 (선택 시)
      if (updateExistingDocs) {
        setProcessStatusText('기존 발주서/수입/국내매입 원장 상호명 일괄 변경 중...');
        const targetCleanName = targetSupplier.name;
        const targetCode = targetSupplier.supplierCode || '';

        // A. Orders
        const ordersSnap = await getDocs(collection(db, 'companies', COMPANY_ID, 'orders'));
        for (const orderDoc of ordersSnap.docs) {
          const data = orderDoc.data();
          let changed = false;
          const items = Array.isArray(data.items) ? [...data.items] : [];
          items.forEach((it: any) => {
            const itSup = it.supplier || it.supplierName || '';
            if (selectedAliases.some(alias => isSameCompany(alias, itSup))) {
              it.supplier = targetCleanName;
              it.supplierName = targetCleanName;
              if (targetCode && targetCode !== '-') it.supplierCode = targetCode;
              changed = true;
            }
          });

          const forwarders = Array.isArray(data.forwarders) ? [...data.forwarders] : [];
          forwarders.forEach((fw: any) => {
            if (selectedAliases.some(alias => isSameCompany(alias, fw.name))) {
              fw.name = targetCleanName;
              if (targetCode && targetCode !== '-') fw.code = targetCode;
              changed = true;
            }
          });

          if (changed) {
            await updateDoc(doc(db, 'companies', COMPANY_ID, 'orders', orderDoc.id), {
              items,
              forwarders,
              updatedAt: serverTimestamp()
            });
          }
        }

        // B. Imports
        const importsSnap = await getDocs(collection(db, 'companies', COMPANY_ID, 'imports'));
        for (const impDoc of importsSnap.docs) {
          const data = impDoc.data();
          const impSup = data.importerName || data.supplierName || data.exporter || data.seller || '';
          if (selectedAliases.some(alias => isSameCompany(alias, impSup))) {
            await updateDoc(doc(db, 'companies', COMPANY_ID, 'imports', impDoc.id), {
              supplierName: targetCleanName,
              importerName: targetCleanName,
              exporter: targetCleanName,
              seller: targetCleanName,
              updatedAt: serverTimestamp()
            });
          }
        }

        // C. Domestic Trades
        const domSnap = await getDocs(collection(db, 'companies', COMPANY_ID, 'domesticTrades'));
        for (const domDoc of domSnap.docs) {
          const data = domDoc.data();
          const domSup = data.supplierName || '';
          if (selectedAliases.some(alias => isSameCompany(alias, domSup))) {
            await updateDoc(doc(db, 'companies', COMPANY_ID, 'domesticTrades', domDoc.id), {
              supplierName: targetCleanName,
              updatedAt: serverTimestamp()
            });
          }
        }
      }

      alert(`성공적으로 병합되었습니다!\n\n[${targetSupplier.supplierCode}] ${targetSupplier.name} 업체로 총 ${selectedAliases.length}개 상호명이 하나로 묶였습니다.`);
      setSelectedAliases([]);
      if (onMergedSuccess) onMergedSuccess();
      onClose();
    } catch (err: any) {
      console.error('업체 병합 오류:', err);
      alert('업체 병합 처리 중 오류가 발생했습니다: ' + (err.message || String(err)));
    } finally {
      setIsProcessing(false);
      setProcessStatusText('');
    }
  };

  // 등록된 별칭 단일 해제
  const handleUnlinkAlias = async (sup: Supplier, aliasToUnlink: string) => {
    if (!window.confirm(`[${sup.name}] 업체에서 별칭 [${aliasToUnlink}] 연결을 해제하시겠습니까?`)) return;
    try {
      const currentAliases = Array.isArray(sup.aliases) ? sup.aliases : [];
      const updated = currentAliases.filter(a => a !== aliasToUnlink);
      await updateDoc(doc(db, 'companies', COMPANY_ID, 'suppliers', sup.id), {
        aliases: updated,
        updatedAt: serverTimestamp()
      });
      alert(`[${aliasToUnlink}] 별칭 연결이 해제되었습니다.`);
      if (onMergedSuccess) onMergedSuccess();
    } catch (err: any) {
      alert('해제 중 오류가 발생했습니다: ' + String(err));
    }
  };

  // 별칭이 등록된 공급업체 목록
  const suppliersWithAliases = useMemo(() => {
    return suppliers.filter(s => Array.isArray(s.aliases) && s.aliases.length > 0);
  }, [suppliers]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !isProcessing) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          backgroundColor: '#fff',
          borderRadius: '6px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 20px 40px rgba(15, 23, 42, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* 모달 헤더 */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#fafafa',
            borderBottom: '1px solid #cbd5e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🔗</span>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                동일 공급업체 수동 병합(Merge) 및 별칭(Alias) 통합 관리
              </h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>
                표기 방식이나 상호명이 달라도 관리자가 직접 지정하여 하나의 대표 업체로 묶을 수 있습니다.
              </p>
            </div>
          </div>
          <button
            disabled={isProcessing}
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              color: '#94a3b8',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              padding: '4px 8px'
            }}
          >
            ✕
          </button>
        </div>

        {/* 탭 헤더 */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 20px' }}>
          <button
            onClick={() => setActiveTab('merge')}
            style={{
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 750,
              color: activeTab === 'merge' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'merge' ? '2.5px solid #2563eb' : '2.5px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>➕</span> 새 업체 하나로 합치기
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            style={{
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 750,
              color: activeTab === 'manage' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'manage' ? '2.5px solid #2563eb' : '2.5px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📋</span> 현재 병합된 업체 목록 ({suppliersWithAliases.length}개사)
          </button>
        </div>

        {/* 탭 내용 */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {activeTab === 'merge' ? (
            <>
              {/* 1단계: 대표 업체 선택 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f8fafc', padding: '12px 14px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                  1단계: 통합 기준이 될 대표 공급업체 선택 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="검색 (상호명, 코드, 대표자)..."
                    value={supplierSearch}
                    onChange={e => setSupplierSearch(e.target.value)}
                    style={{
                      height: '34px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      padding: '0 10px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#1e293b'
                    }}
                  />
                  <select
                    value={targetSupplierId}
                    onChange={e => {
                      setTargetSupplierId(e.target.value);
                      setSelectedAliases([]);
                    }}
                    style={{
                      height: '34px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      padding: '0 10px',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#1e293b'
                    }}
                  >
                    <option value="">-- 기준 대표 공급업체를 선택하세요 --</option>
                    {filteredSuppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        [{s.supplierCode || '-'}] {s.name} {s.representative ? `(대표: ${s.representative})` : ''} {s.bizNumber ? `(${s.bizNumber})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {targetSupplier && (
                  <div style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>✓ 대표 업체 확정:</span>
                    <strong>[{targetSupplier.supplierCode || '-'}] {targetSupplier.name}</strong>
                    <span style={{ color: '#64748b' }}>({targetSupplier.category || '공급사'} / {targetSupplier.representative || '대표 미기재'})</span>
                  </div>
                )}
              </div>

              {/* 2단계: 합칠 대상 업체 선택 및 추가 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    2단계: 대표 업체와 하나로 합칠 대상 업체(별칭) 선택 및 입력 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 700 }}>
                    선택된 대상: {selectedAliases.length}개
                  </span>
                </div>

                {/* 직접 입력 추가창 */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="목록에 없는 상호명이나 옛날 상호 직접 입력 (예: KANGNAM KPI, 강남케이에프아이)..."
                    value={customAliasInput}
                    onChange={e => setCustomAliasInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomAlias();
                      }
                    }}
                    style={{
                      flex: 1,
                      height: '34px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      padding: '0 10px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#1e293b'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomAlias}
                    style={{
                      height: '34px',
                      padding: '0 14px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#f1f5f9',
                      color: '#334155',
                      fontSize: '12.5px',
                      fontWeight: 750,
                      cursor: 'pointer'
                    }}
                  >
                    + 직접 추가
                  </button>
                </div>

                {/* 선택된 대상 칩(태그) 목록 */}
                {selectedAliases.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '10px', background: '#eff6ff', borderRadius: '4px', border: '1px dashed #93c5fd' }}>
                    {selectedAliases.map(alias => (
                      <span
                        key={alias}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '3px 8px',
                          backgroundColor: '#2563eb',
                          color: '#fff',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 700
                        }}
                      >
                        {alias}
                        <button
                          type="button"
                          onClick={() => handleRemoveSelectedAlias(alias)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '13px',
                            lineHeight: 1,
                            padding: 0
                          }}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* 기존 거래처 목록에서 선택하기 */}
                <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', fontWeight: 750, color: '#475569' }}>
                      기존 등록/거래처 목록에서 선택 ({candidateSupplierNames.length}개)
                    </span>
                    <input
                      type="text"
                      placeholder="상호명 검색..."
                      value={candidateSearch}
                      onChange={e => setCandidateSearch(e.target.value)}
                      style={{
                        height: '26px',
                        width: '180px',
                        borderRadius: '3px',
                        border: '1px solid #cbd5e1',
                        padding: '0 6px',
                        fontSize: '12px'
                      }}
                    />
                  </div>
                  <div style={{ maxHeight: '170px', overflowY: 'auto', padding: '6px 12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px' }}>
                    {candidateSupplierNames.length === 0 ? (
                      <div style={{ padding: '16px', color: '#94a3b8', fontSize: '12px', gridColumn: '1 / -1', textAlign: 'center' }}>
                        선택 가능한 공급업체가 없습니다.
                      </div>
                    ) : (
                      candidateSupplierNames.map(name => {
                        const isChecked = selectedAliases.includes(name);
                        return (
                          <label
                            key={name}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '5px 8px',
                              borderRadius: '4px',
                              backgroundColor: isChecked ? '#eff6ff' : '#fff',
                              border: isChecked ? '1px solid #bfdbfe' : '1px solid #f1f5f9',
                              cursor: 'pointer',
                              fontSize: '12.5px',
                              color: isChecked ? '#1e40af' : '#334155',
                              fontWeight: isChecked ? 700 : 500
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleCandidate(name)}
                              style={{ cursor: 'pointer' }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {name}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* 3단계: 병합 처리 옵션 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#fafafa', padding: '12px 14px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                  3단계: 병합 옵션 선택
                </span>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', color: '#1e293b', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={true}
                    disabled={true}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <strong>[기본] 대표 업체의 공식 통합 별칭(Alias)으로 등록 (강력 권장)</strong>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                      기존 원장의 데이터를 훼손하지 않고, 매입관리/채무관리/채권관리 화면에서 항상 대표 업체로 자동 묶여 집계됩니다. 언제든지 해제 가능합니다.
                    </div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', color: '#1e293b', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={updateExistingDocs}
                    onChange={e => setUpdateExistingDocs(e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <strong>기존 발주서(Orders)/수입(Imports)/국내매입 원장의 상호명도 대표 상호로 일괄 변경 (선택)</strong>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                      과거 주문서나 수입 원장 문서의 공급업체명을 대표 상호명 및 코드로 실제 일괄 업데이트합니다.
                    </div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', color: '#1e293b', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={absorbDuplicateMasters}
                    onChange={e => setAbsorbDuplicateMasters(e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <strong>선택 대상 중 마스터 공급업체로 따로 등록되어 있던 중복 레코드는 흡수 삭제 (선택)</strong>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                      공급업체 관리 목록에 중복으로 등록되어 있던 별개의 마스터 문서를 대표 업체로 흡수하고 삭제 처리합니다.
                    </div>
                  </div>
                </label>
              </div>
            </>
          ) : (
            /* 기존 병합 내역 관리 탭 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>
                현재 다른 상호명이나 별칭들이 하나로 묶여 있는 공급업체 목록입니다. 잘못 묶인 항목은 [✕]를 눌러 바로 해제할 수 있습니다.
              </div>
              {suppliersWithAliases.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', background: '#f8fafc', borderRadius: '4px' }}>
                  현재 수동으로 병합된 별칭이 있는 공급업체가 없습니다.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {suppliersWithAliases.map(s => (
                    <div
                      key={s.id}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '4px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ padding: '2px 6px', background: '#e2e8f0', borderRadius: '3px', fontSize: '11px', fontWeight: 800, color: '#334155' }}>
                            {s.supplierCode || '-'}
                          </span>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>
                            {s.name}
                          </span>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            (대표: {s.representative || '-'} / {s.category || '공급사'})
                          </span>
                        </div>
                        <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 700 }}>
                          연결된 별칭 {s.aliases?.length || 0}개
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingLeft: '8px' }}>
                        {s.aliases?.map(alias => (
                          <span
                            key={alias}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '2px 8px',
                              backgroundColor: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              fontSize: '12px',
                              color: '#334155',
                              fontWeight: 600
                            }}
                          >
                            {alias}
                            <button
                              type="button"
                              onClick={() => handleUnlinkAlias(s, alias)}
                              title="별칭 연결 해제"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 800,
                                padding: 0
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 하단 버튼 바 */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#fafafa',
            borderTop: '1px solid #cbd5e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600 }}>
            {isProcessing && processStatusText}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              disabled={isProcessing}
              onClick={onClose}
              style={{
                height: '34px',
                padding: '0 16px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isProcessing ? 'not-allowed' : 'pointer'
              }}
            >
              닫기
            </button>
            {activeTab === 'merge' && (
              <button
                type="button"
                disabled={isProcessing || !targetSupplierId || selectedAliases.length === 0}
                onClick={handleExecuteMerge}
                style={{
                  height: '34px',
                  padding: '0 18px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: isProcessing || !targetSupplierId || selectedAliases.length === 0 ? '#94a3b8' : '#3b82f6',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 750,
                  cursor: isProcessing || !targetSupplierId || selectedAliases.length === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🔗</span>
                {isProcessing ? '병합 처리 중...' : '선택한 업체 하나로 합치기'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
