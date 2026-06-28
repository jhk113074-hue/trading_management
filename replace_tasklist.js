const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'app', 'src', 'pages', 'TaskList.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

// Match the entire filter container area up to the closing div of the Column settings popup container.
const pattern = /<div style=\{\{\s*display:\s*['"]flex['"],\s*alignItems:\s*['"]center['"],\s*gap:\s*['"]10px['"],\s*marginBottom:\s*['"]10px['"],\s*flexWrap:\s*['"]wrap['"]\s*\}\}>.*?<select\s+className="btn"\s+style=\{\{\s*padding:\s*['"]6px\s+12px['"]\s*\}\}\s+value=\{filterStatus\}.*?⚙️\s*열\s*설정\s*<\/button>\s*\{showColMenu\s+&&\s+\(\s*<div.*?<\/div>\s*\}\s*<\/div>\s*<\/div>/s;

const replacement = `<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#111827', margin: 0 }}>전체 업무 리스트</h2>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '4px 10px', borderRadius: '20px' }}>
            총 {filteredTasks.length}건 / {dateMode === 'weekly' ? formatWeekLabel(weekOffset) : dateMode === 'daily' ? selectedDate : \`\${startDate} ~ \${endDate}\`} 결과 {filteredTasks.length}건
          </span>
        </div>

        {/* 필터링 통합 한 줄 카드 */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          alignItems: 'center', 
          flexWrap: 'nowrap', 
          background: '#ffffff',
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          overflowX: 'auto',
          marginBottom: '10px'
        }}>
          {/* ── 조회 모드 탭 ── */}
          <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', background: '#fff', flexShrink: 0 }}>
            <button
              onClick={() => {
                setDateMode('daily');
                setSelectedDate(new Date().toISOString().split('T')[0]);
              }}
              style={{
                padding: '5px 10px',
                border: 'none',
                background: dateMode === 'daily' ? '#3b82f6' : '#fff',
                color: dateMode === 'daily' ? '#fff' : '#475569',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '11.5px',
                transition: 'all 0.15s'
              }}
            >
              일간
            </button>
            <button
              onClick={() => {
                setDateMode('weekly');
                setWeekOffset(0);
              }}
              style={{
                padding: '5px 10px',
                border: 'none',
                background: dateMode === 'weekly' ? '#3b82f6' : '#fff',
                color: dateMode === 'weekly' ? '#fff' : '#475569',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '11.5px',
                transition: 'all 0.15s',
                borderLeft: '1px solid #cbd5e1'
              }}
            >
              주간
            </button>
            <button
              onClick={() => {
                setDateMode('range');
                const today = new Date();
                const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                setStartDate(firstDay.toISOString().split('T')[0]);
                setEndDate(lastDay.toISOString().split('T')[0]);
              }}
              style={{
                padding: '5px 10px',
                border: 'none',
                background: dateMode === 'range' ? '#3b82f6' : '#fff',
                color: dateMode === 'range' ? '#fff' : '#475569',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '11.5px',
                transition: 'all 0.15s',
                borderLeft: '1px solid #cbd5e1'
              }}
            >
              기간 검색
            </button>
          </div>

          {/* ── 상세 날짜 선택 영역 ── */}
          {dateMode === 'daily' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', background: '#fff', flexShrink: 0 }}>
              <button onClick={handlePrevDay} style={{ padding: '5px 9px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#374151', borderRight: '1px solid #e2e8f0' }}>‹</button>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                style={{
                  padding: '3px 6px',
                  border: 'none',
                  outline: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#1e293b',
                  cursor: 'pointer',
                  background: '#fff'
                }}
              />
              <button onClick={handleNextDay} style={{ padding: '5px 9px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#374151', borderLeft: '1px solid #e2e8f0' }}>›</button>
              {selectedDate !== new Date().toISOString().split('T')[0] && (
                <button
                  onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                  style={{
                    padding: '5px 9px',
                    border: 'none',
                    borderLeft: '1px solid #e2e8f0',
                    background: '#f0fdf4',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#16a34a'
                  }}
                >
                  오늘
                </button>
              )}
            </div>
          )}

          {dateMode === 'weekly' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', background: '#fff', flexShrink: 0 }}>
              <button onClick={() => setWeekOffset(w => w - 1)} style={{ padding: '5px 9px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#374151' }}>‹</button>
              <div style={{ padding: '4px 10px', background: weekOffset === 0 ? '#eff6ff' : '#f8fafc', color: weekOffset === 0 ? '#2563eb' : '#374151', fontWeight: 700, fontSize: '12px', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', whiteSpace: 'nowrap' }}>
                📅 \${formatWeekLabel(weekOffset)}
              </div>
              <button onClick={() => setWeekOffset(w => w + 1)} style={{ padding: '5px 9px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#374151' }}>›</button>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} style={{ padding: '5px 8px', border: 'none', borderLeft: '1px solid #cbd5e1', background: '#fff7ed', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#ea580c' }}>이번주</button>
              )}
            </div>
          )}

          {dateMode === 'range' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', background: '#fff' }}>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  style={{
                    padding: '3px 6px',
                    border: 'none',
                    outline: 'none',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: '#1e293b',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ padding: '0 6px', color: '#94a3b8', fontSize: '11.5px', fontWeight: 700, background: '#f8fafc', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', height: '24px', display: 'flex', alignItems: 'center' }}>~</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  style={{
                    padding: '3px 6px',
                    border: 'none',
                    outline: 'none',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: '#1e293b',
                    cursor: 'pointer'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '3px' }}>
                <button onClick={() => setRangePreset('today')} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '10.5px', fontWeight: 700, color: '#475569' }}>오늘</button>
                <button onClick={() => setRangePreset('week')} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '10.5px', fontWeight: 700, color: '#475569' }}>이번주</button>
                <button onClick={() => setRangePreset('month')} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '10.5px', fontWeight: 700, color: '#475569' }}>이번달</button>
                <button onClick={() => setRangePreset('all')} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '10.5px', fontWeight: 700, color: '#475569' }}>전체</button>
              </div>
            </div>
          )}

          {/* 얇은 수직 구분선 */}
          <div style={{ width: '1px', height: '20px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

          <select className="btn" style={{ padding: '4px 8px', fontSize: '12px', height: '26px', borderRadius: '6px', border: '1px solid #cbd5e1', flexShrink: 0 }} value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
            <option>전체 담당자</option>
            {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>

          <select className="btn" style={{ padding: '4px 8px', fontSize: '12px', height: '26px', borderRadius: '6px', border: '1px solid #cbd5e1', flexShrink: 0 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option>모든 유형</option>
            {Object.values(typeLabels).map(l => <option key={l}>{l}</option>)}
          </select>

          <select className="btn" style={{ padding: '4px 8px', fontSize: '12px', height: '26px', borderRadius: '6px', border: '1px solid #cbd5e1', flexShrink: 0 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option>모든 상태</option>
            <option>시작 안 함 + 진행중</option>
            {Object.values(statusLabels).map(l => <option key={l}>{l}</option>)}
          </select>
          
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setShowColMenu(!showColMenu)}
              className="btn"
              style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', height: '26px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
            >
              ⚙️ 열 설정
            </button>
            {showColMenu && (
              <div style={{
                position: 'absolute', top: '35px', left: 0, background: '#fff', border: '1px solid #cbd5e1',
                borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: '10px', zIndex: 100,
                width: '180px', maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px'
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '4px' }}>표시할 열 선택</div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const selectable = columns.filter(c => c.key !== 'select' && c.key !== 'title' && c.key !== 'actions').map(c => c.key);
                      setVisibleColumns(['select', 'title', 'actions', ...selectable]);
                    }}
                    style={{ flex: 1, padding: '3px 0', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#f8fafc' }}
                  >
                    전체 선택
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVisibleColumns(['select', 'title', 'actions']);
                    }}
                    style={{ flex: 1, padding: '3px 0', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#f8fafc' }}
                  >
                    전체 해제
                  </button>
                </div>
                {columns.filter(c => c.key !== 'select' && c.key !== 'title' && c.key !== 'actions').map(col => {
                  const isChecked = visibleColumns.includes(col.key);
                  return (
                    <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', userSelect: 'none', padding: '2px 0' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setVisibleColumns(prev => prev.filter(k => k !== col.key));
                          } else {
                            setVisibleColumns(prev => [...prev, col.key]);
                          }
                        }}
                      />
                      {col.label}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>`;

if (pattern.test(content)) {
  content = content.replace(pattern, replacement);
  fs.writeFileSync(targetPath, content, 'utf8');
  console.log('✅ TaskList.tsx regex matched & replaced successfully!');
} else {
  console.log('❌ Regex match failed. Double-check file markup.');
}
