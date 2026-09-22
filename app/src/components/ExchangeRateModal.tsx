import React, { useState } from 'react';

export interface HistoricalRateItem {
  date: string;
  usd: number;
  eur: number;
  cny: number;
  usdDiff1d?: number;
  usdPercent1d?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentRates: {
    usd: number;
    usd1dDiff: number;
    usd1dPercent: number;
    usd3dDiff: number;
    usdMa30: number | null;
    eur: number;
    eur1dDiff: number;
    eur1dPercent: number;
    eur3dDiff: number;
    eurMa30: number | null;
    cny: number;
    cny1dDiff: number;
    cny1dPercent: number;
    cny3dDiff: number;
    cnyMa30: number | null;
    time: string;
  };
  historyList: HistoricalRateItem[];
  onRefresh: () => void;
  isLoading: boolean;
}

export const ExchangeRateModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentRates,
  historyList,
  onRefresh,
  isLoading
}) => {
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'EUR' | 'CNY'>('USD');
  const [chartRange, setChartRange] = useState<'7D' | '30D'>('7D');
  const [hoveredDataPoint, setHoveredDataPoint] = useState<{ date: string; rate: number; x: number; y: number } | null>(null);

  if (!isOpen) return null;

  // 선택된 통화별 데이터 추출
  const getRateForCurr = (item: HistoricalRateItem) => {
    if (selectedCurrency === 'EUR') return item.eur;
    if (selectedCurrency === 'CNY') return item.cny;
    return item.usd;
  };

  const currSymbol = selectedCurrency === 'CNY' ? '' : '₩';
  const currDecimals = selectedCurrency === 'CNY' ? 2 : 1;

  const currentRate = selectedCurrency === 'EUR' ? currentRates.eur : selectedCurrency === 'CNY' ? currentRates.cny : currentRates.usd;
  const diff1d = selectedCurrency === 'EUR' ? currentRates.eur1dDiff : selectedCurrency === 'CNY' ? currentRates.cny1dDiff : currentRates.usd1dDiff;
  const percent1d = selectedCurrency === 'EUR' ? currentRates.eur1dPercent : selectedCurrency === 'CNY' ? currentRates.cny1dPercent : currentRates.usd1dPercent;
  const diff3d = selectedCurrency === 'EUR' ? currentRates.eur3dDiff : selectedCurrency === 'CNY' ? currentRates.cny3dDiff : currentRates.usd3dDiff;
  const ma30 = selectedCurrency === 'EUR' ? currentRates.eurMa30 : selectedCurrency === 'CNY' ? currentRates.cnyMa30 : currentRates.usdMa30;

  // 차트 및 요약용 데이터 필터링
  const rawData = [...historyList].reverse(); // 과거 -> 최근 순
  const chartDays = chartRange === '7D' ? 7 : 30;
  const chartData = rawData.slice(-chartDays);

  // 최고가 / 최저가 / 평균가 산출
  const rateValues = chartData.map(getRateForCurr).filter(Boolean);
  const maxRate = rateValues.length > 0 ? Math.max(...rateValues, currentRate) : currentRate;
  const minRate = rateValues.length > 0 ? Math.min(...rateValues, currentRate) : currentRate;
  const avgRate = rateValues.length > 0 ? Math.round((rateValues.reduce((a, b) => a + b, 0) / rateValues.length) * 10) / 10 : currentRate;
  const rangeSpread = Math.round((maxRate - minRate) * 100) / 100;

  // SVG 차트 좌표 계산
  const svgWidth = 600;
  const svgHeight = 170;
  const padding = { top: 20, right: 30, bottom: 25, left: 45 };
  const innerWidth = svgWidth - padding.left - padding.right;
  const innerHeight = svgHeight - padding.top - padding.bottom;

  const yMin = minRate - (maxRate - minRate) * 0.1 || minRate * 0.99;
  const yMax = maxRate + (maxRate - minRate) * 0.1 || maxRate * 1.01;
  const yRange = yMax - yMin || 1;

  // 차트 점 좌표 생성
  const points = chartData.map((item, idx) => {
    const rate = getRateForCurr(item);
    const x = padding.left + (idx / Math.max(1, chartData.length - 1)) * innerWidth;
    const y = padding.top + innerHeight - ((rate - yMin) / yRange) * innerHeight;
    return { x, y, date: item.date, rate };
  });

  const pathD = points.length > 0 ? points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '') : '';
  const areaD = points.length > 0 ? `${pathD} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z` : '';

  // 일별 종가 테이블 데이터 (최신순 15일)
  const tableData = [...historyList].slice(0, 15);

  const getDayOfWeek = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      return days[d.getDay()] || '';
    } catch {
      return '';
    }
  };

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(3px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div 
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '4px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 20px 40px rgba(15, 23, 42, 0.2)',
          width: '740px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease-out'
        }}
      >
        {/* ── 1. 모달 헤더 ── */}
        <div style={{ padding: '14px 22px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fafafa' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>💵</span>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>실시간 환율 & 시장 트랜드 정밀 분석</span>
                <span style={{ fontSize: '11px', fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: '10px' }}>
                  {currentRates.time ? `${currentRates.time} 갱신` : '실시간'}
                </span>
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                전일대비(1D) 실시간 등락폭, 최근 3일/7일/30일 최고·최저가 및 이동평균 추이를 분석합니다.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              style={{
                height: '30px',
                padding: '0 10px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#475569',
                cursor: isLoading ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="최신 실시간 환율 즉시 갱신"
            >
              <span>🔄</span>
              <span>새로고침</span>
            </button>
            <button 
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b', padding: '4px' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── 2. 통화 선택 탭 ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '8px 22px 0' }}>
          {(['USD', 'EUR', 'CNY'] as const).map(curr => {
            const isSelected = selectedCurrency === curr;
            const labelMap = { USD: 'USD (미국 달러)', EUR: 'EUR (유로)', CNY: 'USD/CNY (위안화)' };
            const rateVal = curr === 'EUR' ? currentRates.eur : curr === 'CNY' ? currentRates.cny : currentRates.usd;
            const diffVal = curr === 'EUR' ? currentRates.eur1dDiff : curr === 'CNY' ? currentRates.cny1dDiff : currentRates.usd1dDiff;
            const symbol = curr === 'CNY' ? '' : '₩';
            return (
              <button
                key={curr}
                type="button"
                onClick={() => setSelectedCurrency(curr)}
                style={{
                  padding: '8px 18px',
                  border: 'none',
                  borderBottom: isSelected ? '2.5px solid #3b82f6' : '2.5px solid transparent',
                  background: 'transparent',
                  color: isSelected ? '#1d4ed8' : '#64748b',
                  fontSize: '13px',
                  fontWeight: isSelected ? 800 : 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s'
                }}
              >
                <span>{labelMap[curr]}</span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: isSelected ? '#1e293b' : '#64748b' }}>
                  {symbol}{rateVal.toLocaleString()}
                </span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: diffVal > 0 ? '#ef4444' : diffVal < 0 ? '#2563eb' : '#64748b' }}>
                  {diffVal > 0 ? `▲+${diffVal}` : diffVal < 0 ? `▼${diffVal}` : '━0.0'}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── 3. 모달 컨텐츠 스크롤 영역 ── */}
        <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* 4대 기간별 요약 지표 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            {/* 1) 당일 전일대비 (1D) */}
            <div style={{ background: diff1d > 0 ? '#fff1f2' : diff1d < 0 ? '#eff6ff' : '#f8fafc', border: `1px solid ${diff1d > 0 ? '#fecdd3' : diff1d < 0 ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: '6px', padding: '10px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 750, color: '#64748b', textTransform: 'uppercase' }}>
                당일 전일비 (1D)
              </div>
              <div style={{ fontSize: '18px', fontWeight: 850, color: diff1d > 0 ? '#e11d48' : diff1d < 0 ? '#2563eb' : '#475569', marginTop: '2px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span>{diff1d > 0 ? '▲ +' : diff1d < 0 ? '▼ ' : '━ '}{Math.abs(diff1d)}{currSymbol}</span>
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: diff1d > 0 ? '#e11d48' : diff1d < 0 ? '#2563eb' : '#64748b', marginTop: '1px' }}>
                등락률: {percent1d > 0 ? '+' : ''}{percent1d}%
              </div>
            </div>

            {/* 2) 최근 3일 트랜드 (3D) */}
            <div style={{ background: diff3d > 0 ? '#fff1f2' : diff3d < 0 ? '#eff6ff' : '#f8fafc', border: `1px solid ${diff3d > 0 ? '#fecdd3' : diff3d < 0 ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: '6px', padding: '10px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 750, color: '#64748b', textTransform: 'uppercase' }}>
                최근 3일 변동 (3D)
              </div>
              <div style={{ fontSize: '18px', fontWeight: 850, color: diff3d > 0 ? '#e11d48' : diff3d < 0 ? '#2563eb' : '#475569', marginTop: '2px' }}>
                <span>{diff3d > 0 ? '▲ +' : diff3d < 0 ? '▼ ' : '━ '}{Math.abs(diff3d)}{currSymbol}</span>
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginTop: '1px' }}>
                {diff3d > 0 ? '3일간 단기 상승세' : diff3d < 0 ? '3일간 단기 하락세' : '3일간 보합세'}
              </div>
            </div>

            {/* 3) 기간 최고 / 최저가 ({chartRange}) */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 750, color: '#64748b', textTransform: 'uppercase' }}>
                {chartRange} 최고 / 최저
              </div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#e11d48', marginTop: '3px' }}>
                최고: {currSymbol}{maxRate.toLocaleString()}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                최저: {currSymbol}{minRate.toLocaleString()}
              </div>
            </div>

            {/* 4) 30일 이동평균 (MA30) */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 750, color: '#64748b', textTransform: 'uppercase' }}>
                30일 이동평균 (MA30)
              </div>
              <div style={{ fontSize: '18px', fontWeight: 850, color: '#0f172a', marginTop: '2px' }}>
                {currSymbol}{ma30?.toLocaleString() || '-'}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginTop: '1px' }}>
                평균대비: {ma30 ? `${currentRate >= ma30 ? '+' : ''}${Math.round((currentRate - ma30) * 10) / 10}${currSymbol}` : '-'}
              </div>
            </div>
          </div>

          {/* ── 4. 인터랙티브 SVG 미니 차트 ── */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '14px 18px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>
                  📈 {selectedCurrency} 환율 변동 추이 차트
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  (기간 내 변동폭: {rangeSpread}{currSymbol})
                </span>
              </div>

              {/* 7일 / 30일 전환 버튼 */}
              <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', height: '28px' }}>
                <button
                  type="button"
                  onClick={() => setChartRange('7D')}
                  style={{
                    padding: '0 12px',
                    border: 'none',
                    background: chartRange === '7D' ? '#3b82f6' : '#fff',
                    color: chartRange === '7D' ? '#fff' : '#475569',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  최근 7일
                </button>
                <button
                  type="button"
                  onClick={() => setChartRange('30D')}
                  style={{
                    padding: '0 12px',
                    border: 'none',
                    borderLeft: '1px solid #cbd5e1',
                    background: chartRange === '30D' ? '#3b82f6' : '#fff',
                    color: chartRange === '30D' ? '#fff' : '#475569',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  최근 30일
                </button>
              </div>
            </div>

            {/* SVG 차트 렌더링 */}
            <div style={{ position: 'relative', width: '100%', height: `${svgHeight}px`, overflow: 'hidden' }}>
              <svg 
                viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
                style={{ width: '100%', height: '100%', overflow: 'visible' }}
                onMouseLeave={() => setHoveredDataPoint(null)}
              >
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y축 가이드 라인 (최고, 중간, 최저) */}
                {[0, 0.5, 1].map((ratio, i) => {
                  const y = padding.top + innerHeight * ratio;
                  const val = Math.round((yMax - ratio * yRange) * 10) / 10;
                  return (
                    <g key={i}>
                      <line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                      <text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8" fontWeight="600">
                        {val.toLocaleString()}
                      </text>
                    </g>
                  );
                })}

                {/* 평균선 점선 */}
                {avgRate >= yMin && avgRate <= yMax && (
                  <g>
                    {(() => {
                      const avgY = padding.top + innerHeight - ((avgRate - yMin) / yRange) * innerHeight;
                      return (
                        <>
                          <line x1={padding.left} y1={avgY} x2={svgWidth - padding.right} y2={avgY} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 2" />
                          <text x={svgWidth - padding.right + 4} y={avgY + 3} textAnchor="start" fontSize="9" fill="#d97706" fontWeight="700">
                            평균 {avgRate.toLocaleString()}
                          </text>
                        </>
                      );
                    })()}
                  </g>
                )}

                {/* 영역 채우기 */}
                {areaD && <path d={areaD} fill="url(#chartGradient)" />}

                {/* 라인 */}
                {pathD && <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

                {/* 데이터 포인트 원 & 인터랙션 */}
                {points.map((p, idx) => {
                  const isHovered = hoveredDataPoint?.date === p.date;
                  return (
                    <g key={p.date}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isHovered ? 5 : 3}
                        fill={isHovered ? '#1d4ed8' : '#ffffff'}
                        stroke="#2563eb"
                        strokeWidth={isHovered ? 2.5 : 2}
                        style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={() => setHoveredDataPoint(p)}
                      />
                      {/* X축 날짜 라벨 (선택적으로 표시) */}
                      {(chartRange === '7D' || idx % 4 === 0 || idx === points.length - 1) && (
                        <text x={p.x} y={svgHeight - 6} textAnchor="middle" fontSize="10" fill="#94a3b8" fontWeight="600">
                          {p.date.slice(5)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* 마우스 오버 툴팁 */}
              {hoveredDataPoint && (
                <div 
                  style={{
                    position: 'absolute',
                    left: `${(hoveredDataPoint.x / svgWidth) * 100}%`,
                    top: `${hoveredDataPoint.y - 38}px`,
                    transform: 'translateX(-50%)',
                    background: '#0f172a',
                    color: '#ffffff',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
                    zIndex: 20
                  }}
                >
                  <div>{hoveredDataPoint.date}: {currSymbol}{hoveredDataPoint.rate.toLocaleString()}</div>
                </div>
              )}
            </div>
          </div>

          {/* ── 5. 최근 일별 종가 및 변동 내역 테이블 ── */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                📋 최근 일별 마감 환율 기록 (최신 15영업일)
              </span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                * 유럽중앙은행(ECB) / 글로벌 기준 종가 데이터
              </span>
            </div>

            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <tr style={{ height: '32px' }}>
                    <th style={{ padding: '0 12px', textAlign: 'left', color: '#475569', fontWeight: 750, fontSize: '11px', textTransform: 'uppercase' }}>일자 (요일)</th>
                    <th style={{ padding: '0 12px', textAlign: 'right', color: '#475569', fontWeight: 750, fontSize: '11px', textTransform: 'uppercase' }}>매매기준율</th>
                    <th style={{ padding: '0 12px', textAlign: 'right', color: '#475569', fontWeight: 750, fontSize: '11px', textTransform: 'uppercase' }}>전일대비 변동</th>
                    <th style={{ padding: '0 12px', textAlign: 'right', color: '#475569', fontWeight: 750, fontSize: '11px', textTransform: 'uppercase' }}>등락률 (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 최상단에 오늘 실시간 환율 행 추가 */}
                  <tr style={{ height: '36px', backgroundColor: '#eff6ff', borderBottom: '1.5px solid #bfdbfe', fontWeight: 750 }}>
                    <td style={{ padding: '0 12px', color: '#1d4ed8' }}>
                      <span style={{ background: '#2563eb', color: '#fff', fontSize: '10px', padding: '1px 5px', borderRadius: '3px', marginRight: '6px' }}>실시간</span>
                      오늘 ({currentRates.time || '현재'})
                    </td>
                    <td style={{ padding: '0 12px', textAlign: 'right', color: '#1e293b', fontSize: '13px', fontWeight: 800 }}>
                      {currSymbol}{currentRate.toLocaleString(undefined, { minimumFractionDigits: currDecimals, maximumFractionDigits: currDecimals })}
                    </td>
                    <td style={{ padding: '0 12px', textAlign: 'right', color: diff1d > 0 ? '#ef4444' : diff1d < 0 ? '#2563eb' : '#64748b' }}>
                      {diff1d > 0 ? `▲ +${diff1d}` : diff1d < 0 ? `▼ ${diff1d}` : '━ 0.0'}
                    </td>
                    <td style={{ padding: '0 12px', textAlign: 'right', color: diff1d > 0 ? '#ef4444' : diff1d < 0 ? '#2563eb' : '#64748b' }}>
                      {percent1d > 0 ? `+${percent1d}%` : `${percent1d}%`}
                    </td>
                  </tr>

                  {tableData.map((item, idx) => {
                    const rate = getRateForCurr(item);
                    // 전일 대비 변동 계산 (다음 인덱스가 직전일)
                    const prevItem = tableData[idx + 1];
                    const prevRate = prevItem ? getRateForCurr(prevItem) : null;
                    const diff = prevRate !== null ? Math.round((rate - prevRate) * 100) / 100 : 0;
                    const pct = prevRate ? Math.round(((rate - prevRate) / prevRate) * 10000) / 100 : 0;

                    return (
                      <tr 
                        key={item.date} 
                        style={{ height: '32px', borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <td style={{ padding: '0 12px', color: '#334155', fontWeight: 600 }}>
                          {item.date} ({getDayOfWeek(item.date)})
                        </td>
                        <td style={{ padding: '0 12px', textAlign: 'right', color: '#0f172a', fontWeight: 700 }}>
                          {currSymbol}{rate.toLocaleString(undefined, { minimumFractionDigits: currDecimals, maximumFractionDigits: currDecimals })}
                        </td>
                        <td style={{ padding: '0 12px', textAlign: 'right', fontWeight: 700, color: diff > 0 ? '#ef4444' : diff < 0 ? '#2563eb' : '#64748b' }}>
                          {diff > 0 ? `▲ +${diff}` : diff < 0 ? `▼ ${diff}` : '━ 0.0'}
                        </td>
                        <td style={{ padding: '0 12px', textAlign: 'right', fontWeight: 600, color: diff > 0 ? '#ef4444' : diff < 0 ? '#2563eb' : '#64748b' }}>
                          {pct > 0 ? `+${pct}%` : `${pct}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── 6. 하단 푸터 ── */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #cbd5e1', backgroundColor: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            💡 평일 외환거래시간(09:00~15:30) 중에는 10분마다 자동으로 환율이 갱신됩니다.
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: '34px',
              padding: '0 20px',
              background: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
};
