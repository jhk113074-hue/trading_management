import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db, COMPANY_ID } from '../firebase';
import { type QuoteSettings, DEFAULT_QUOTE_SETTINGS } from '../types/quoteSettings';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (settings: QuoteSettings) => void;
}

export const QuoteSettingsModal: React.FC<Props> = ({ isOpen, onClose, onSave }) => {
  const [settings, setSettings] = useState<QuoteSettings>(DEFAULT_QUOTE_SETTINGS);
  const [liveUsdRate, setLiveUsdRate] = useState<number>(1450);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const auth = getAuth();
  let currentUserName = auth.currentUser?.email?.split('@')[0] || '사용자';
  if (currentUserName === 'jhkim1130') currentUserName = '대표이사 김주한';
  else if (currentUserName === 'jhk010624') currentUserName = '김하은 사원';
  else if (currentUserName === 'alexpark') currentUserName = '박현 차장';

  // 1. 실시간 환율 및 저장된 설정 불러오기
  useEffect(() => {
    if (!isOpen) return;

    // (1) 실시간 환율 확보
    const fetchLiveRate = async () => {
      try {
        const saved = localStorage.getItem('site_live_usd_rate');
        if (saved && Number(saved) > 0) {
          setLiveUsdRate(Number(saved));
        }
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (res.ok) {
          const data = await res.json();
          const krw = data.rates?.KRW;
          if (krw && krw > 0) {
            const rounded = Math.round(krw * 10) / 10;
            setLiveUsdRate(rounded);
            try {
              localStorage.setItem('site_live_usd_rate', String(rounded));
            } catch (_) {}
          }
        }
      } catch (err) {
        console.warn('Failed to fetch live rate in QuoteSettingsModal:', err);
      }
    };
    fetchLiveRate();

    // (2) Firestore 설정 로드
    const loadSettings = async () => {
      setLoading(true);
      try {
        // 캐시 우선 확인
        const cached = localStorage.getItem('ysacc_quote_settings');
        if (cached) {
          try {
            setSettings(JSON.parse(cached));
          } catch (_) {}
        }

        const docRef = doc(db, 'companies', COMPANY_ID, 'settings', 'quote_settings');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as QuoteSettings;
          setSettings({
            exchangeRateDiff: data.exchangeRateDiff !== undefined ? data.exchangeRateDiff : -50,
            defaultMarginRate: data.defaultMarginRate !== undefined ? data.defaultMarginRate : 15,
            defaultValidityDays: data.defaultValidityDays !== undefined ? data.defaultValidityDays : 30,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy
          });
          try {
            localStorage.setItem('ysacc_quote_settings', JSON.stringify(data));
          } catch (_) {}
        }
      } catch (e) {
        console.error('Failed to load quote settings:', e);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [isOpen]);

  if (!isOpen) return null;

  // 계산 미리보기: 실시간 환율 + 보정액
  const simulatedRate = Math.round((liveUsdRate + (Number(settings.exchangeRateDiff) || 0)) * 10) / 10;

  const handleSave = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, 'companies', COMPANY_ID, 'settings', 'quote_settings');
      const updatedData: QuoteSettings = {
        exchangeRateDiff: Number(settings.exchangeRateDiff) || 0,
        defaultMarginRate: Number(settings.defaultMarginRate) || 15,
        defaultValidityDays: Number(settings.defaultValidityDays) || 30,
        updatedAt: serverTimestamp(),
        updatedBy: currentUserName
      };

      await setDoc(docRef, updatedData, { merge: true });

      try {
        localStorage.setItem('ysacc_quote_settings', JSON.stringify({
          ...updatedData,
          updatedAt: new Date().toISOString()
        }));
      } catch (_) {}

      if (onSave) {
        onSave(updatedData);
      }

      alert('✅ 견적환경설정이 성공적으로 저장되었습니다.');
      onClose();
    } catch (e: any) {
      console.error('Failed to save quote settings:', e);
      alert('❌ 저장 중 오류가 발생했습니다: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const presetDiffs = [-50, -30, -20, -10, 0, 10];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          width: '100%',
          maxWidth: '560px',
          borderRadius: '4px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 20px 40px rgba(15, 23, 42, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
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
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                견적환경설정 (Quote Settings)
              </h3>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                견적서(PI) 작성 시 기본 적용되는 실시간 환율 차이 및 기본 정책을 설정합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              color: '#64748b',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* 모달 본문 */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
              환경설정을 불러오는 중입니다...
            </div>
          ) : (
            <>
              {/* 섹션 1: 실시간 환율 연동 및 보정 시뮬레이션 카드 */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>
                    📊 실시간 견적 환율 산출 시뮬레이션
                  </span>
                  <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 700 }}>
                    ● 실시간 USD 연동
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 1fr auto 1.2fr',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#ffffff',
                    padding: '12px',
                    borderRadius: '4px',
                    border: '1px solid #e2e8f0',
                    textAlign: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '2px' }}>
                      오늘 실시간 환율
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>
                      ₩{liveUsdRate.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </div>
                  </div>

                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#94a3b8' }}>+</div>

                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '2px' }}>
                      설정 환율 차액
                    </div>
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 800,
                        color: (settings.exchangeRateDiff || 0) < 0 ? '#ef4444' : '#10b981'
                      }}
                    >
                      {(settings.exchangeRateDiff || 0) > 0 ? `+${settings.exchangeRateDiff}` : settings.exchangeRateDiff}원
                    </div>
                  </div>

                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#94a3b8' }}>=</div>

                  <div style={{ background: '#eff6ff', padding: '6px 8px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 800, marginBottom: '2px' }}>
                      최종 견적 적용환율
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#1e40af' }}>
                      ₩{simulatedRate.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </div>
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: '11.5px', color: '#64748b', lineHeight: 1.4 }}>
                  ※ 신규 견적(PI)을 열면 실시간 환율에서 위 설정 차액이 자동 가감되어 기준환율로 자동 입력됩니다. (기존: -50원 고정)
                </p>
              </div>

              {/* 섹션 2: 환율 차액 입력 및 프리셋 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label
                  style={{
                    fontSize: '11px',
                    fontWeight: 750,
                    color: '#475569',
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase'
                  }}
                >
                  견적 환율 가감차액 (KRW) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="number"
                    step="1"
                    value={settings.exchangeRateDiff}
                    onChange={e =>
                      setSettings(prev => ({ ...prev, exchangeRateDiff: parseFloat(e.target.value) || 0 }))
                    }
                    placeholder="-50"
                    style={{
                      height: '34px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#1e293b',
                      padding: '0 10px',
                      outline: 'none',
                      width: '160px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>원</span>

                  {/* 빠른 프리셋 버튼 모음 */}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginLeft: 'auto' }}>
                    {presetDiffs.map(diff => (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => setSettings(prev => ({ ...prev, exchangeRateDiff: diff }))}
                        style={{
                          height: '28px',
                          padding: '0 8px',
                          borderRadius: '4px',
                          border: settings.exchangeRateDiff === diff ? '1px solid #3b82f6' : '1px solid #cbd5e1',
                          background: settings.exchangeRateDiff === diff ? '#eff6ff' : '#f8fafc',
                          color: settings.exchangeRateDiff === diff ? '#1d4ed8' : '#475569',
                          fontSize: '11.5px',
                          fontWeight: settings.exchangeRateDiff === diff ? 800 : 600,
                          cursor: 'pointer'
                        }}
                      >
                        {diff === -50 ? '-50원(기본)' : diff > 0 ? `+${diff}원` : `${diff}원`}
                      </button>
                    ))}
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  • 음수(-) 입력 시 환율 인하 차감 (예: -50원 입력 시 1480원 $\rightarrow$ 1430원)
                  <br />• 양수(+) 입력 시 할증 가산 (예: +20원 입력 시 1480원 $\rightarrow$ 1500원)
                </span>
              </div>

              {/* 섹션 3: 기본 마진율 & 견적 유효기간 */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  paddingTop: '8px',
                  borderTop: '1px solid #f1f5f9'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label
                    style={{
                      fontSize: '11px',
                      fontWeight: 750,
                      color: '#475569',
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase'
                    }}
                  >
                    기본 타겟 마진율 (%)
                  </label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={settings.defaultMarginRate || 15}
                      onChange={e =>
                        setSettings(prev => ({ ...prev, defaultMarginRate: parseFloat(e.target.value) || 0 }))
                      }
                      style={{
                        height: '34px',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#1e293b',
                        padding: '0 10px',
                        outline: 'none',
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>%</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label
                    style={{
                      fontSize: '11px',
                      fontWeight: 750,
                      color: '#475569',
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase'
                    }}
                  >
                    기본 견적 유효기간 (일)
                  </label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={settings.defaultValidityDays || 30}
                      onChange={e =>
                        setSettings(prev => ({ ...prev, defaultValidityDays: parseInt(e.target.value) || 30 }))
                      }
                      style={{
                        height: '34px',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#1e293b',
                        padding: '0 10px',
                        outline: 'none',
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>일</span>
                  </div>
                </div>
              </div>

              {/* 최종 수정 정보 */}
              {settings.updatedBy && (
                <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'right', marginTop: '4px' }}>
                  최종 수정: {settings.updatedBy}
                </div>
              )}
            </>
          )}
        </div>

        {/* 모달 푸터 버튼 */}
        <div
          style={{
            padding: '12px 20px',
            background: '#fafafa',
            borderTop: '1px solid #cbd5e1',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#475569',
              height: '34px',
              padding: '0 16px',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              background: '#3b82f6',
              border: 'none',
              color: '#fff',
              height: '34px',
              padding: '0 18px',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: saving || loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              opacity: saving || loading ? 0.7 : 1
            }}
            onMouseEnter={e => {
              if (!saving && !loading) e.currentTarget.style.backgroundColor = '#2563eb';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#3b82f6';
            }}
          >
            {saving ? '저장 중...' : '설정 저장'}
          </button>
        </div>
      </div>
    </div>
  );
};
