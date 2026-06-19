import React, { useState, useEffect } from 'react';
import { collection, doc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Supplier } from '../types/supplier';

interface PackingItem {
  marks?: string;
  descOfGoods?: string;
  qty?: number;
  packageType?: string;
  netWeight?: number;
  grossWeight?: number;
  measurement?: string;
}

interface Props {
  supplierName: string;
  orderInfo: {
    id: string;
    custPo: string;
    incoterms: string;
    paymentTerms: string;
    issuingCompany: 'YS' | 'YSACC';
    portOfLoading?: string;
    finalDestination?: string;
    carrier?: string;
    sailingOnOrAbout?: string;
    cfsAddress?: string;
    cfsEntryDate?: string;
    items: any[];
  };
  initialData?: {
    shipper?: string;
    bookingNo?: string;
    remarks?: string;
    consignee?: string;
    notifyParty?: string;
    portOfLoading?: string;
    finalDestination?: string;
    carrier?: string;
    sailingOnOrAbout?: string;
    cfsAddress?: string;
    cfsEta?: string;
    packingItems?: PackingItem[];
  };
  onClose: () => void;
  onSave: (data: any) => void;
}

export const ArrivalReportModal: React.FC<Props> = ({ supplierName, orderInfo, initialData, onClose, onSave }) => {
  const [cfsList, setCfsList] = useState<string[]>([]);
  const [isAddingCfs, setIsAddingCfs] = useState(false);
  const [newCfsVal, setNewCfsVal] = useState('');

  // 1. Shipper default info from DB suppliers
  const [shipperVal, setShipperVal] = useState('');
  // 2. Consignee default info based on orderInfo.issuingCompany
  const [consigneeVal, setConsigneeVal] = useState('');

  // Initialize packing items
  const [packingItems, setPackingItems] = useState<PackingItem[]>([]);

  const [formData, setFormData] = useState({
    bookingNo: initialData?.bookingNo || '',
    remarks: initialData?.remarks || 'ORIGIN : MADE IN KOREA\n입고일: 연도-월-일 오전 10시까지',
    notifyParty: initialData?.notifyParty || 'SAME AS ABOVE',
    portOfLoading: initialData?.portOfLoading || orderInfo.portOfLoading || 'BUSAN PORT, SOUTH KOREA',
    finalDestination: initialData?.finalDestination || orderInfo.finalDestination || 'HAMAD PORT, QATAR',
    carrier: initialData?.carrier || orderInfo.carrier || '',
    sailingOnOrAbout: initialData?.sailingOnOrAbout || orderInfo.sailingOnOrAbout || '',
    cfsAddress: initialData?.cfsAddress || orderInfo.cfsAddress || 'CMK LOGISTICS / 김경태 주임 / T.055-543-7200\n경남 창원시 진해구 신항8로 13',
    cfsEta: initialData?.cfsEta || orderInfo.cfsEntryDate || '',
  });

  // Load suppliers and CFS list
  useEffect(() => {
    const loadSuppliersAndCfs = async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', COMPANY_ID, 'suppliers'));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));
        // Find matches for shipper
        const matched = list.find(s => s.name === supplierName);
        if (matched && !initialData?.shipper) {
          const formatted = `${matched.name}\n${matched.address || ''}\nTEL: ${matched.phone || matched.managerPhone || ''}`;
          setShipperVal(formatted);
        } else {
          setShipperVal(initialData?.shipper || supplierName);
        }

        // Fetch saved CFS locations
        const cfsSnap = await getDocs(collection(db, 'companies', COMPANY_ID, 'cfsLocations'));
        const savedCfs = cfsSnap.docs.map(doc => doc.data().address as string);
        if (savedCfs.length === 0) {
          const defaultCfs = 'CMK LOGISTICS / 김경태 주임 / T.055-543-7200\n경남 창원시 진해구 신항8로 13';
          setCfsList([defaultCfs]);
        } else {
          setCfsList(savedCfs);
        }
      } catch (err) {
        console.error("Failed to load shippers/CFS:", err);
      }
    };
    loadSuppliersAndCfs();
  }, [supplierName, initialData]);

  // Consignee setup
  useEffect(() => {
    if (initialData?.consignee) {
      setConsigneeVal(initialData.consignee);
      return;
    }
    const isYS = orderInfo.issuingCompany === 'YS';
    if (isYS) {
      setConsigneeVal(
        `영성에이씨씨(YS ACC)\n경기 김포시 양촌읍 듬박로 89\nTEL: 010-4494-1028\n담당자: 김주한`
      );
    } else {
      setConsigneeVal(
        `(주)와이에스에이씨씨(YSACC CO., LTD.)\n서울 강남구 테헤란로 419, 16층\nTEL: 010-4494-1028\n담당자: 김주한`
      );
    }
  }, [orderInfo.issuingCompany, initialData]);

  // Packing Items setup
  useEffect(() => {
    if (initialData?.packingItems && initialData.packingItems.length > 0) {
      setPackingItems(initialData.packingItems);
    } else {
      // Default to one packing item referencing first order item
      const itemDesc = orderInfo.items.map(it => `P#${orderInfo.custPo || '1'}. ${it.name}`).join(' / ');
      const totalQty = orderInfo.items.reduce((sum, it) => sum + (it.qty || 0), 0);
      setPackingItems([
        {
          marks: '2026\n/ALMUFTAH/\nDOHA/QATAR',
          descOfGoods: itemDesc || '',
          qty: totalQty || 1,
          packageType: 'PL',
          netWeight: 0,
          grossWeight: 0,
          measurement: ''
        }
      ]);
    }
  }, [orderInfo.items, initialData]);

  const handleSave = () => {
    onSave({
      ...formData,
      shipper: shipperVal,
      consignee: consigneeVal,
      packingItems
    });
  };

  const addPackingItem = () => {
    setPackingItems(prev => [
      ...prev,
      { marks: '2026\n/ALMUFTAH/\nDOHA/QATAR', descOfGoods: '', qty: 1, packageType: 'PL', netWeight: 0, grossWeight: 0, measurement: '' }
    ]);
  };

  const removePackingItem = (idx: number) => {
    if (packingItems.length === 1) return;
    setPackingItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updatePackingItem = (idx: number, field: keyof PackingItem, val: any) => {
    setPackingItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  };

  const handleRegisterCfs = async () => {
    if (!newCfsVal.trim()) return;
    try {
      const cfsId = newCfsVal.trim().substring(0, 15).replace(/\s+/g, '');
      await setDoc(doc(db, 'companies', COMPANY_ID, 'cfsLocations', cfsId), {
        address: newCfsVal.trim(),
        createdAt: serverTimestamp()
      });
      setCfsList(prev => [...prev, newCfsVal.trim()]);
      setFormData(prev => ({ ...prev, cfsAddress: newCfsVal.trim() }));
      setNewCfsVal('');
      setIsAddingCfs(false);
      alert('✅ 신규 CFS 입고지가 정상적으로 저장되었습니다.');
    } catch (e: any) {
      alert('❌ CFS 등록 실패: ' + e.message);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '95%', maxWidth: '1050px', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
        
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: '12px 12px 0 0' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>도착보고 상세정보 및 다중 패킹 정보 입력 ({supplierName})</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>도착보고서 출력을 위해 선적(Shipping) 정보 및 패킹(Packing) 규격을 입력해주세요.</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>
          
          {/* Section 1: 선적 정보 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid #3b82f6', paddingBottom: '4px' }}>1. 선적 및 입고 정보 (Shipping Info)</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>1) Shipper (송하인)</label>
              <textarea rows={3} value={shipperVal} onChange={e => setShipperVal(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11.5px', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>2) For Account & Risk Messrs. (수하인)</label>
              <textarea rows={3} value={consigneeVal} onChange={e => setConsigneeVal(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11.5px', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>3) Notify Party (통지처)</label>
              <input type="text" value={formData.notifyParty} onChange={e => setFormData(p => ({ ...p, notifyParty: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>4) Port of Loading (선적항)</label>
                <input type="text" value={formData.portOfLoading} onChange={e => setFormData(p => ({ ...p, portOfLoading: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>5) Final Destination (목적지)</label>
                <input type="text" value={formData.finalDestination} onChange={e => setFormData(p => ({ ...p, finalDestination: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>6) Carrier (선명/항차)</label>
                <input type="text" value={formData.carrier} onChange={e => setFormData(p => ({ ...p, carrier: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>7) Sailing Date (출항일)</label>
                <input type="text" value={formData.sailingOnOrAbout} onChange={e => setFormData(p => ({ ...p, sailingOnOrAbout: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>8) Booking No.</label>
                <input type="text" value={formData.bookingNo} onChange={e => setFormData(p => ({ ...p, bookingNo: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>9) 입고요청일</label>
                <input type="text" value={formData.cfsEta} onChange={e => setFormData(p => ({ ...p, cfsEta: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
              </div>
            </div>

            {/* CFS Address with Dropdown/Database Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', position: 'relative' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>입고지 (CFS) 선택/신규등록</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select
                  value={formData.cfsAddress}
                  onChange={e => setFormData(p => ({ ...p, cfsAddress: e.target.value }))}
                  style={{ flex: 1, padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', outline: 'none' }}
                >
                  {cfsList.map((addr, idx) => (
                    <option key={idx} value={addr}>{addr.substring(0, 50)}...</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsAddingCfs(prev => !prev)}
                  style={{ padding: '6px 10px', fontSize: '11px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                >
                  {isAddingCfs ? '닫기' : '신규등록'}
                </button>
              </div>
              {isAddingCfs && (
                <div style={{ marginTop: '6px', border: '1px solid #93c5fd', borderRadius: '8px', padding: '10px', background: '#eff6ff', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <textarea
                    rows={2}
                    placeholder="신규 CFS 주소 및 담당자 정보 입력..."
                    value={newCfsVal}
                    onChange={e => setNewCfsVal(e.target.value)}
                    style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11.5px', outline: 'none', background: '#fff' }}
                  />
                  <button
                    type="button"
                    onClick={handleRegisterCfs}
                    style={{ padding: '5px 10px', fontSize: '11px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, alignSelf: 'flex-end' }}
                  >
                    CFS 저장등록
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>특이사항 (Remarks)</label>
              <textarea rows={2} value={formData.remarks} onChange={e => setFormData(p => ({ ...p, remarks: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11.5px', outline: 'none' }} />
            </div>
          </div>

          {/* Section 2: 다중 패킹 정보 리스트 에디터 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '72vh', overflowY: 'auto', paddingRight: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0d9488', paddingBottom: '4px' }}>
              <h4 style={{ margin: '0', fontSize: '13px', fontWeight: 800, color: '#0f766e' }}>2. 패킹 및 화물 상세 목록 (Packing Info List)</h4>
              <button
                type="button"
                onClick={addPackingItem}
                style={{ padding: '3px 10px', fontSize: '11.5px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}
              >
                ➕ 패킹 행 추가
              </button>
            </div>

            {packingItems.map((item, idx) => (
              <div key={idx} style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#0f766e' }}>📦 화물 #{idx + 1}</span>
                  {packingItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePackingItem(idx)}
                      style={{ padding: '2px 6px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}
                    >
                      삭제
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569' }}>10) Marks</label>
                    <textarea rows={2} value={item.marks || ''} onChange={e => updatePackingItem(idx, 'marks', e.target.value)} style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', outline: 'none', background: '#fff' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569' }}>11) Description of Goods (품명)</label>
                    <textarea rows={2} value={item.descOfGoods || ''} onChange={e => updatePackingItem(idx, 'descOfGoods', e.target.value)} style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', outline: 'none', background: '#fff' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569' }}>12) Qty (수량)</label>
                    <input type="number" value={item.qty || ''} onChange={e => updatePackingItem(idx, 'qty', parseInt(e.target.value, 10) || 0)} style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', textAlign: 'right', outline: 'none', background: '#fff' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569' }}>13) Package (단위)</label>
                    <input type="text" value={item.packageType || ''} onChange={e => updatePackingItem(idx, 'packageType', e.target.value)} style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', outline: 'none', background: '#fff' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569' }}>14) Net Wt (kg)</label>
                    <input type="number" value={item.netWeight || ''} onChange={e => updatePackingItem(idx, 'netWeight', parseFloat(e.target.value) || 0)} style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', textAlign: 'right', outline: 'none', background: '#fff' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569' }}>15) Gross Wt (kg)</label>
                    <input type="number" value={item.grossWeight || ''} onChange={e => updatePackingItem(idx, 'grossWeight', parseFloat(e.target.value) || 0)} style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', textAlign: 'right', outline: 'none', background: '#fff' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569' }}>16) Measurement (용적/규격)</label>
                  <input type="text" value={item.measurement || ''} onChange={e => updatePackingItem(idx, 'measurement', e.target.value)} placeholder="예: 1150×1250×1800" style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', outline: 'none', background: '#fff' }} />
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '10px', borderRadius: '0 0 12px 12px' }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '12.5px', color: '#475569', cursor: 'pointer', fontWeight: 600 }}>취소</button>
          <button onClick={handleSave} style={{ padding: '6px 18px', borderRadius: '6px', border: 'none', background: '#2563eb', fontSize: '12.5px', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>💾 저장 후 인쇄</button>
        </div>

      </div>
    </div>
  );
};
