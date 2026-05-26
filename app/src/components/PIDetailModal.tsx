import React, { useState, useEffect } from 'react';
import { doc, getDocs, collection, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { ProformaInvoice, PIItem } from '../types/pi';
import { generatePIPdf } from '../utils/piPdfGenerator';
import { generatePIExcel } from '../utils/piExcelGenerator';

interface Props {
  pi: ProformaInvoice;
  onClose: () => void;
  onEdit: () => void;
}

export const PIDetailModal: React.FC<Props> = ({ pi, onClose, onEdit }) => {
  const [items, setItems] = useState<PIItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const revSnap = await getDocs(collection(doc(db, "companies", COMPANY_ID, "proforma_invoices", pi.id), "revisions"));
        if (!revSnap.empty) {
          const latestRev = revSnap.docs.sort((a,b) => (b.data().createdAt?.seconds||0)-(a.data().createdAt?.seconds||0))[0];
          const liSnap = await getDocs(collection(latestRev.ref, "line_items"));
          const loadedItems = liSnap.docs.map(d => d.data() as PIItem).sort((a,b) => a.lineNumber - b.lineNumber);
          setItems(loadedItems);
        }
      } catch (e) {
        console.error("Error fetching items", e);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, [pi.id]);

  const updateStatus = async (status: 'draft' | 'confirmed' | 'sent') => {
    if (!window.confirm(`PI 상태를 '${status}'(으)로 변경하시겠습니까?`)) return;
    try {
      await updateDoc(doc(db, "companies", COMPANY_ID, "proforma_invoices", pi.id), {
        status,
        updatedAt: serverTimestamp()
      });
      alert('✅ 상태가 업데이트되었습니다.');
      onClose(); // close modal to refresh state in parent
    } catch (e: any) {
      alert('❌ 상태 변경 실패: ' + e.message);
    }
  };

  const badgeStyle = pi.status === 'confirmed' ? { bg: '#d1fae5', color: '#065f46' } 
                   : pi.status === 'sent' ? { bg: '#e0f2fe', color: '#0369a1' } 
                   : { bg: '#ede9fe', color: '#5b21b6' };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '14px', width: '900px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #e8ecf0', background: '#fafafa' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em', color: '#111827' }}>
              {pi.piNumber || '-'}
            </div>
            <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '3px' }}>
              {pi.piDate} · {pi.customerName} · {pi.destinationPort}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ padding: '4px 12px', borderRadius: '5px', fontSize: '12px', fontWeight: 600, background: badgeStyle.bg, color: badgeStyle.color, textTransform: 'uppercase' }}>
              {pi.status}
            </span>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '20px', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px' }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
            
            <div style={{ background: '#f9fafb', border: '1px solid #e8ecf0', borderRadius: '8px', padding: '16px' }}>
              <h4 style={{ fontSize: '10px', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px', fontWeight: 700 }}>📋 PI 정보</h4>
              <DetailRow label="견적 발행사" value={pi.issuingCompany === 'YS' ? '영성ACC (YS ACC)' : '(주)와이에스에이씨씨 (YSACC CO.,LTD)'} valueColor={pi.issuingCompany === 'YS' ? '#059669' : '#2563eb'} bold />
              <DetailRow label="PI Number" value={pi.piNumber} />
              <DetailRow label="PI Date" value={pi.piDate} />
              <DetailRow label="Valid Until" value={pi.validUntilDate} />
              <DetailRow label="Revision" value={pi.currentVersion?.toString()} />
            </div>

            <div style={{ background: '#f9fafb', border: '1px solid #e8ecf0', borderRadius: '8px', padding: '16px' }}>
              <h4 style={{ fontSize: '10px', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px', fontWeight: 700 }}>🏢 고객 정보</h4>
              <DetailRow label="Customer Name" value={pi.customerName} bold />
              <DetailRow label="Contact Person" value={pi.contactPerson} />
              <DetailRow label="Email" value={pi.email} />
            </div>

            <div style={{ background: '#f9fafb', border: '1px solid #e8ecf0', borderRadius: '8px', padding: '16px', gridColumn: '1 / -1' }}>
              <h4 style={{ fontSize: '10px', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px', fontWeight: 700 }}>🚢 무역 조건 (Trade Terms)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'x-14px y-4px' }}>
                <DetailRow label="Incoterms" value={pi.incoterms} />
                <DetailRow label="Destination Port" value={pi.destinationPort} />
                <DetailRow label="Departure Port" value={pi.departurePort} />
                <DetailRow label="Shipping Method" value={pi.shippingMethod} />
                <DetailRow label="Payment Terms" value={pi.paymentTerms} />
                <DetailRow label="Packaging Spec." value={pi.packagingSpec} />
              </div>
            </div>

          </div>

          <div>
            <h4 style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>📦 상품 리스트 (Line Items)</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>상품명(Desc)</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>수량</th>
                  <th style={thStyle}>단위</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>단가($)</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>총액($)</th>
                  <th style={thStyle}>비고</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>아이템 로딩 중...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>등록된 아이템이 없습니다.</td></tr>
                ) : (
                  items.map(item => (
                    <tr key={item.lineNumber} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={tdStyle}>{item.lineNumber}</td>
                      <td style={tdStyle}>{item.description}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{item.quantity}</td>
                      <td style={tdStyle}>{item.unit}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>${(item.salePriceUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#059669' }}>${(item.lineTotalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td style={tdStyle}>{item.remarks}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ background: '#f9fafb', border: '1px solid #e8ecf0', borderRadius: '8px', padding: '16px', textAlign: 'right', marginTop: '16px' }}>
            <div style={{ fontSize: '13px', color: '#475569', marginBottom: '4px' }}>Subtotal: <b>${(pi.subtotalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</b></div>
            <div style={{ fontSize: '13px', color: '#475569', marginBottom: '8px' }}>Extras: <b>${(pi.extrasUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</b></div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#059669', marginTop: '4px' }}>GRAND TOTAL: ${(pi.totalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #e8ecf0', display: 'flex', gap: '10px', justifyContent: 'space-between', background: '#fafafa' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => generatePIPdf(pi, items)} disabled={loading} style={{ padding: '9px 18px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', background: '#fff', border: '1px solid #dc2626', color: '#dc2626', opacity: loading ? 0.5 : 1 }}>📄 PDF</button>
            <button onClick={() => generatePIExcel(pi, items)} disabled={loading} style={{ padding: '9px 18px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', background: '#fff', border: '1px solid #16a34a', color: '#16a34a', opacity: loading ? 0.5 : 1 }}>📊 Excel</button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', background: '#fff', border: '1px solid #cbd5e1', color: '#475569' }}>닫기</button>
            <button onClick={() => { onClose(); onEdit(); }} style={{ padding: '9px 18px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', background: 'rgba(37,99,235,0.05)', border: '1px solid #2563eb', color: '#2563eb' }}>✏ 수정</button>
            <button onClick={() => updateStatus('sent')} style={{ padding: '9px 18px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', background: '#fff', border: '1px solid #cbd5e1', color: '#0369a1' }}>📨 Sent</button>
            <button onClick={() => updateStatus('confirmed')} style={{ padding: '9px 18px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', background: '#2563eb', border: 'none', color: '#fff' }}>✔ Confirmed</button>
          </div>
        </div>

      </div>
    </div>
  );
};

const DetailRow = ({ label, value, bold = false, valueColor = '#111827' }: any) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid #f3f4f6' }}>
    <span style={{ color: '#6b7280' }}>{label}</span>
    <span style={{ fontWeight: bold ? 700 : 500, color: valueColor, textAlign: 'right', maxWidth: '60%' }}>{value || '-'}</span>
  </div>
);

const thStyle = { background: '#f9fafb', padding: '8px 10px', textAlign: 'left' as any, color: '#6b7280', borderBottom: '1px solid #e8ecf0', textTransform: 'uppercase' as any, letterSpacing: '0.04em', fontWeight: 600 };
const tdStyle = { padding: '9px 10px', borderBottom: '1px solid #f3f4f6' };
