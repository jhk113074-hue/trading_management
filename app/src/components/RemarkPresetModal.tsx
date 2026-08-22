import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';

export interface RemarkPreset {
  id: string;
  title: string;
  content: string;
}

export const DEFAULT_REMARK_PRESETS: RemarkPreset[] = [
  {
    id: 'cert_standard',
    title: '✨ 표준 수출 인증 문구 (Certification)',
    content: `WE HEREBY CERTIFY THAT:\n(A) THIS INVOICE IS AUTHENTIC.\n(B) IT IS THE ONLY INVOICE ISSUED BY US FOR THE GOODS DESCRIBED HEREIN.\n(C) IT SHOWS THEIR EXACT VALUE WITHOUT DEDUCTION OF ANY DISCOUNT\n(D) THEIR ORIGIN IS SOUTH KOREA.\n(E) ALL ITEMS ARE ACCORDING TO SAMPLES APPROVED BY THE APPLICANT.\n*PO NO.: {PO_NO}`
  },
  {
    id: 'freight_prepaid',
    title: 'FREIGHT PREPAID',
    content: '"FREIGHT PREPAID"'
  },
  {
    id: 'freight_collect',
    title: 'FREIGHT COLLECT',
    content: '"FREIGHT COLLECT"'
  }
];

interface RemarkPresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: RemarkPreset[];
  onSelectPreset?: (content: string) => void;
  currentPoNo?: string;
}

export const RemarkPresetModal: React.FC<RemarkPresetModalProps> = ({
  isOpen,
  onClose,
  presets,
  onSelectPreset,
  currentPoNo = ''
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleStartNew = () => {
    setEditingId('new');
    setTitleInput('');
    setContentInput('');
  };

  const handleStartEdit = (preset: RemarkPreset) => {
    setEditingId(preset.id);
    setTitleInput(preset.title);
    setContentInput(preset.content);
  };

  const handleSave = async () => {
    if (!titleInput.trim()) {
      alert('문구 제목(이름)을 입력해주세요.');
      return;
    }
    if (!contentInput.trim()) {
      alert('문구 내용을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      let updatedPresets: RemarkPreset[] = [];
      if (editingId === 'new') {
        const newPreset: RemarkPreset = {
          id: `preset_${Date.now()}`,
          title: titleInput.trim(),
          content: contentInput.trim()
        };
        updatedPresets = [...presets, newPreset];
      } else {
        updatedPresets = presets.map(p =>
          p.id === editingId
            ? { ...p, title: titleInput.trim(), content: contentInput.trim() }
            : p
        );
      }

      const docRef = doc(db, 'companies', COMPANY_ID, 'settings', 'ci_remark_presets');
      await setDoc(docRef, { presets: updatedPresets });
      setEditingId(null);
      setTitleInput('');
      setContentInput('');
    } catch (err) {
      console.error('Error saving remark preset:', err);
      alert('표준 문구 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (idToDelete: string) => {
    if (!window.confirm('해당 표준 문구를 삭제하시겠습니까?')) return;

    try {
      const updatedPresets = presets.filter(p => p.id !== idToDelete);
      const docRef = doc(db, 'companies', COMPANY_ID, 'settings', 'ci_remark_presets');
      await setDoc(docRef, { presets: updatedPresets });
      if (editingId === idToDelete) {
        setEditingId(null);
        setTitleInput('');
        setContentInput('');
      }
    } catch (err) {
      console.error('Error deleting preset:', err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleApply = (content: string) => {
    let replaced = content;
    if (currentPoNo) {
      replaced = replaced.replace(/\{PO_NO\}/g, currentPoNo);
    } else {
      replaced = replaced.replace(/\{PO_NO\}/g, '');
    }
    if (onSelectPreset) {
      onSelectPreset(replaced);
    }
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          borderRadius: '6px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 20px 40px rgba(15,23,42,0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 20px',
            background: '#fafafa',
            borderBottom: '1px solid #cbd5e1',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>⚙️</span>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
              REMARKS 표준 문구 관리 (신규등록 / 수정 / 삭제)
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              color: '#64748b',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
              등록된 표준 문구 목록 ({presets.length}개)
            </span>
            <button
              type="button"
              onClick={handleStartNew}
              style={{
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                height: '32px',
                padding: '0 12px',
                borderRadius: '4px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ➕ 새 표준문구 등록
            </button>
          </div>

          {/* Preset List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
            {presets.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', background: '#f8fafc', borderRadius: '4px' }}>
                등록된 표준 문구가 없습니다.
              </div>
            ) : (
              presets.map(p => (
                <div
                  key={p.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    padding: '10px 14px',
                    background: editingId === p.id ? '#eff6ff' : '#f8fafc',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 750, color: '#1e293b', marginBottom: '2px' }}>
                      {p.title}
                    </div>
                    <div
                      style={{
                        fontSize: '11.5px',
                        color: '#64748b',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontFamily: 'monospace'
                      }}
                    >
                      {p.content.split('\n')[0]}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleApply(p.content)}
                      style={{
                        height: '28px',
                        padding: '0 10px',
                        background: '#0f766e',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      적용
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(p)}
                      style={{
                        height: '28px',
                        padding: '0 8px',
                        background: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        color: '#334155',
                        cursor: 'pointer'
                      }}
                    >
                      ✏️ 수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      style={{
                        height: '28px',
                        padding: '0 6px',
                        background: '#fee2e2',
                        border: '1px solid #fca5a5',
                        borderRadius: '4px',
                        fontSize: '11.5px',
                        color: '#dc2626',
                        cursor: 'pointer'
                      }}
                      title="삭제"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Edit / New Form */}
          {editingId && (
            <div
              style={{
                borderTop: '2px solid #e2e8f0',
                paddingTop: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                background: '#fafafa',
                padding: '16px',
                borderRadius: '6px'
              }}
            >
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e3a8a' }}>
                {editingId === 'new' ? '📝 새 표준문구 등록' : '✏️ 표준문구 내용 수정'}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
                  문구 제목 (Title) <span style={{ color: '#ef4444' }}>*</span>
                </span>
                <input
                  type="text"
                  placeholder="예: 중동 전용 인증문구, 일반 선적 비고 등"
                  value={titleInput}
                  onChange={e => setTitleInput(e.target.value)}
                  style={{
                    height: '34px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#1e293b',
                    padding: '0 10px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
                    문구 상세 내용 (Content) <span style={{ color: '#ef4444' }}>*</span>
                  </span>
                  <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 600 }}>
                    💡 <code>{'{PO_NO}'}</code> 입력 시 현재 오더의 PO번호로 자동 치환됩니다.
                  </span>
                </div>
                <textarea
                  rows={6}
                  placeholder={`예:\nWE HEREBY CERTIFY THAT:\n(A) THIS INVOICE IS AUTHENTIC.\n*PO NO.: {PO_NO}`}
                  value={contentInput}
                  onChange={e => setContentInput(e.target.value)}
                  style={{
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12.5px',
                    color: '#1e293b',
                    padding: '8px 10px',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    lineHeight: '1.4'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  style={{
                    height: '34px',
                    padding: '0 14px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    height: '34px',
                    padding: '0 16px',
                    background: '#3b82f6',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '13px',
                    fontWeight: 750,
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  {saving ? '저장 중...' : '💾 표준문구 저장'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            background: '#fafafa',
            borderTop: '1px solid #cbd5e1',
            display: 'flex',
            justifyContent: 'flex-end'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              height: '34px',
              padding: '0 16px',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
