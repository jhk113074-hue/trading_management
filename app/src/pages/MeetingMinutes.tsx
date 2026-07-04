import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

interface Customer {
  id: string;
  name: string;
}

interface MeetingMinute {
  id: string;
  title: string;
  date: string;
  projectName?: string;
  customerId?: string;
  customerName?: string;
  attendees: string;
  content: string; // HTML content from rich editor
  createdAt: string;
  createdBy: string;
  createdByName: string;
}

export const MeetingMinutes: React.FC = () => {
  const { userProfile } = useAuth();
  const [meetings, setMeetings] = useState<MeetingMinute[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterProject, setFilterProject] = useState('');

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingMinute | null>(null);

  // Form states
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [projectName, setProjectName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [attendees, setAttendees] = useState('');
  const [contentHTML, setContentHTML] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Rich Editor states
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load customers
    const fetchCustomers = async () => {
      try {
        const snap = await getDocs(collection(db, 'customers'));
        const list: Customer[] = [];
        snap.forEach(d => {
          list.push({ id: d.id, name: d.data().name || '' });
        });
        setCustomers(list);
      } catch (err) {
        console.error("Failed to load customers:", err);
      }
    };

    fetchCustomers();

    // Load meeting minutes list (realtime sync)
    const unsub = onSnapshot(collection(db, 'meetings'), (snap) => {
      const list: MeetingMinute[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as MeetingMinute);
      });
      list.sort((a, b) => b.date.localeCompare(a.date));
      setMeetings(list);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleOpenNewForm = () => {
    setEditId(null);
    setTitle('');
    setDate(new Date().toISOString().split('T')[0]);
    setProjectName('');
    setCustomerId('');
    setAttendees('');
    setContentHTML('');
    setIsFormOpen(true);
    setTimeout(() => {
      if (editorRef.current) editorRef.current.innerHTML = '';
    }, 100);
  };

  const handleOpenEditForm = (m: MeetingMinute) => {
    setEditId(m.id);
    setTitle(m.title);
    setDate(m.date);
    setProjectName(m.projectName || '');
    setCustomerId(m.customerId || '');
    setAttendees(m.attendees || '');
    setContentHTML(m.content);
    setIsFormOpen(true);
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = m.content;
      }
    }, 100);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) {
      alert("회의 제목과 회의 일자는 필수 항목입니다.");
      return;
    }

    const currentEditorContent = editorRef.current ? editorRef.current.innerHTML : contentHTML;
    if (!currentEditorContent || currentEditorContent.trim() === '<br>' || currentEditorContent.trim() === '') {
      alert("회의록 내용을 입력해 주세요.");
      return;
    }

    setIsSaving(true);
    const selectedCust = customers.find(c => c.id === customerId);
    const docData = {
      title,
      date,
      projectName,
      customerId,
      customerName: selectedCust ? selectedCust.name : '',
      attendees,
      content: currentEditorContent,
      updatedAt: new Date().toISOString()
    };

    try {
      if (editId) {
        // Update
        await updateDoc(doc(db, 'meetings', editId), docData);
        alert("회의록이 수정되었습니다.");
      } else {
        // Create
        await addDoc(collection(db, 'meetings'), {
          ...docData,
          createdAt: new Date().toISOString(),
          createdBy: userProfile?.id || '',
          createdByName: userProfile?.name || '시스템'
        });
        alert("회의록이 성공적으로 등록되었습니다.");
      }
      setIsFormOpen(false);
    } catch (err) {
      console.error(err);
      alert("회의록 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("이 회의록을 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'meetings', id));
      alert("회의록이 삭제되었습니다.");
      if (selectedMeeting?.id === id) {
        setIsDetailOpen(false);
        setSelectedMeeting(null);
      }
    } catch (err) {
      console.error(err);
      alert("회의록 삭제에 실패했습니다.");
    }
  };

  // Rich editor actions
  const format = (command: string) => {
    document.execCommand(command, false);
  };

  const insertTable = () => {
    const tableHTML = `
      <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px;">
        <thead>
          <tr style="background: #f1f5f9; font-weight: bold; border: 1px solid #cbd5e1;">
            <th style="border: 1px solid #cbd5e1; padding: 8px;">의제 및 안건</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px;">결정사항 / 담당자</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px;">목표 기한</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 8px; height: 24px;"></td>
            <td style="border: 1px solid #cbd5e1; padding: 8px;"></td>
            <td style="border: 1px solid #cbd5e1; padding: 8px;"></td>
          </tr>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 8px; height: 24px;"></td>
            <td style="border: 1px solid #cbd5e1; padding: 8px;"></td>
            <td style="border: 1px solid #cbd5e1; padding: 8px;"></td>
          </tr>
        </tbody>
      </table>
    `;
    document.execCommand('insertHTML', false, tableHTML);
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === '/') {
      setShowSlashMenu(true);
    } else if (e.key === 'Escape') {
      setShowSlashMenu(false);
    } else if (e.key === ' ' && editorRef.current) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      const text = range.startContainer.textContent || '';
      
      if (text.startsWith('#')) {
        e.preventDefault();
        range.startContainer.textContent = text.replace(/^#\s*/, '');
        document.execCommand('formatBlock', false, '<h2>');
      } else if (text.startsWith('##')) {
        e.preventDefault();
        range.startContainer.textContent = text.replace(/^##\s*/, '');
        document.execCommand('formatBlock', false, '<h3>');
      } else if (text.startsWith('-') || text.startsWith('*')) {
        e.preventDefault();
        range.startContainer.textContent = text.replace(/^[-*]\s*/, '');
        document.execCommand('insertUnorderedList', false);
      } else if (text.startsWith('>')) {
        e.preventDefault();
        range.startContainer.textContent = text.replace(/^>\s*/, '');
        const calloutHTML = `<div style="background: #f1f5f9; padding: 10px 14px; border-left: 4px solid #cbd5e1; border-radius: 4px; margin: 8px 0; font-style: italic; color: #475569;">${range.startContainer.textContent}</div><p><br></p>`;
        range.startContainer.textContent = '';
        document.execCommand('insertHTML', false, calloutHTML);
      }
    }
  };

  const handleEditorInput = () => {
    const text = editorRef.current?.innerText || '';
    if (!text.includes('/')) {
      setShowSlashMenu(false);
    }
    if (editorRef.current) {
      setContentHTML(editorRef.current.innerHTML);
    }
  };

  const handleSelectSlashCommand = (command: string) => {
    setShowSlashMenu(false);
    
    if (editorRef.current) {
      let html = editorRef.current.innerHTML;
      html = html.replace(/\/$/, '') || html;
      editorRef.current.innerHTML = html;
    }

    if (command === 'table') {
      insertTable();
    } else if (command === 'callout') {
      const calloutHTML = `<div style="background: #f1f5f9; padding: 12px; border-left: 4px solid #4f46e5; border-radius: 4px; margin: 8px 0; color: #334155;">💡 <b>주요 협의결과:</b> 결정 및 수행 과제를 적으세요...</div><p><br></p>`;
      document.execCommand('insertHTML', false, calloutHTML);
    } else if (command === 'divider') {
      const hrHTML = `<hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 16px 0;" /><p><br></p>`;
      document.execCommand('insertHTML', false, hrHTML);
    } else if (command === 'quote') {
      const quoteHTML = `<blockquote style="border-left: 4px solid #cbd5e1; padding-left: 12px; color: #64748b; font-style: italic; margin: 10px 0 10px 12px;">"의사결정 핵심 문장을 입력하세요."</blockquote><p><br></p>`;
      document.execCommand('insertHTML', false, quoteHTML);
    }
    
    if (editorRef.current) {
      setContentHTML(editorRef.current.innerHTML);
    }
  };

  const filteredMeetings = meetings.filter(m => {
    const matchesQuery = m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (m.attendees || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (m.projectName || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCustomer = filterCustomer ? m.customerId === filterCustomer : true;
    const matchesProject = filterProject ? (m.projectName || '').toLowerCase().includes(filterProject.toLowerCase()) : true;

    return matchesQuery && matchesCustomer && matchesProject;
  });

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>회의록 데이터를 불러오는 중...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 850, color: 'var(--primary-color)', margin: 0 }}>📝 회의록 관리</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>프로젝트 및 연계 고객사별 회의 내용을 체계적으로 작성하고 모니터링하는 허브입니다.</p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenNewForm}>
          ✍️ 새 회의록 작성
        </button>
      </div>

      {/* Filters Bar */}
      <div style={{ display: 'flex', gap: '12px', background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="회의 제목, 참석자, 프로젝트 검색..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ flex: 1, minWidth: '200px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
        />
        <select
          value={filterCustomer}
          onChange={e => setFilterCustomer(e.target.value)}
          style={{ width: '180px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', backgroundColor: '#fff', outline: 'none' }}
        >
          <option value="">모든 고객사 필터</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="프로젝트명 필터..."
          value={filterProject}
          onChange={e => setFilterProject(e.target.value)}
          style={{ width: '180px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
        />
      </div>

      {/* Card Grid List */}
      {filteredMeetings.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
          작성된 회의록이 없습니다. 새로운 회의록을 작성해보세요!
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {filteredMeetings.map(m => (
            <div
              key={m.id}
              onClick={() => { setSelectedMeeting(m); setIsDetailOpen(true); }}
              style={{
                background: '#fff',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '20px',
                cursor: 'pointer',
                transition: 'transform 0.15s, box-shadow 0.15s',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>📅 {m.date}</span>
                <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                  작성: {m.createdByName}
                </span>
              </div>

              <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#1e293b', lineHeight: 1.4 }}>{m.title}</h3>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {m.customerName && (
                  <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                    🏢 {m.customerName}
                  </span>
                )}
                {m.projectName && (
                  <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#047857', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                    🚀 {m.projectName}
                  </span>
                )}
              </div>

              <div style={{ fontSize: '12.5px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span>👥 <strong>참석자:</strong> {m.attendees || '미지정'}</span>
              </div>

              <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '10px', marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  onClick={e => { e.stopPropagation(); handleOpenEditForm(m); }}
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '11.5px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                >
                  수정
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(m.id); }}
                  style={{ background: '#fee2e2', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '11.5px', fontWeight: 700, color: '#dc2626', cursor: 'pointer' }}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isFormOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '680px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ padding: '16px 20px', background: '#4f46e5', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 800 }}>{editId ? '📝 회의록 수정' : '✍️ 새 회의록 작성'}</span>
              <button onClick={() => setIsFormOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSave} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '80vh', overflowY: 'auto' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>회의 일자 ★</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>연계 고객사</label>
                  <select
                    value={customerId}
                    onChange={e => setCustomerId(e.target.value)}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', backgroundColor: '#fff' }}
                  >
                    <option value="">고객사 선택 안 함</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>연계 프로젝트명</label>
                  <input
                    type="text"
                    placeholder="예: 삼익HDS 프로젝트"
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>회의 참석자</label>
                  <input
                    type="text"
                    placeholder="예: 김과장, 이대리, 바이어"
                    value={attendees}
                    onChange={e => setAttendees(e.target.value)}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>회의 제목 ★</label>
                <input
                  type="text"
                  required
                  placeholder="회의 핵심 안건 제목을 적어주세요"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                />
              </div>

              {/* Rich Editor Block */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>상세 회의록 내용 ★</label>
                
                <div style={{ display: 'flex', gap: '6px', padding: '6px 10px', background: '#f8fafc', border: '1px solid #cbd5e1', borderBottom: 'none', borderTopLeftRadius: '6px', borderTopRightRadius: '6px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => format('bold')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>가</button>
                  <button type="button" onClick={() => format('italic')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontStyle: 'italic', fontSize: '11px' }}><i>가</i></button>
                  <button type="button" onClick={() => format('underline')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', textDecoration: 'underline', fontSize: '11px' }}><u>가</u></button>
                  <button type="button" onClick={insertTable} style={{ padding: '4px 10px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    田 표 삽입
                  </button>
                </div>

                <div
                  contentEditable
                  ref={editorRef}
                  onKeyDown={handleEditorKeyDown}
                  onInput={handleEditorInput}
                  style={{
                    minHeight: '200px',
                    border: '1px solid #cbd5e1',
                    borderBottomLeftRadius: '6px',
                    borderBottomRightRadius: '6px',
                    padding: '12px',
                    outline: 'none',
                    backgroundColor: '#fff',
                    overflowY: 'auto',
                    fontSize: '13px',
                    lineHeight: 1.6
                  }}
                />

                {showSlashMenu && (
                  <div style={{
                    position: 'absolute',
                    top: '230px',
                    left: '12px',
                    background: '#fff',
                    border: '1px solid #cbd5e1',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    borderRadius: '8px',
                    zIndex: 10000,
                    width: '180px',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '4px 0'
                  }}>
                    <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>블록 명령어 선택</div>
                    <button type="button" onClick={() => handleSelectSlashCommand('table')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12px', cursor: 'pointer', display: 'flex', gap: '8px', color: '#1e293b' }}>
                      <span>田</span> <b>표 삽입</b>
                    </button>
                    <button type="button" onClick={() => handleSelectSlashCommand('callout')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12px', cursor: 'pointer', display: 'flex', gap: '8px', color: '#1e293b' }}>
                      <span>💡</span> <b>콜아웃 상자</b>
                    </button>
                    <button type="button" onClick={() => handleSelectSlashCommand('divider')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12px', cursor: 'pointer', display: 'flex', gap: '8px', color: '#1e293b' }}>
                      <span>➖</span> <b>구분선</b>
                    </button>
                    <button type="button" onClick={() => handleSelectSlashCommand('quote')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12px', cursor: 'pointer', display: 'flex', gap: '8px', color: '#1e293b' }}>
                      <span>✍️</span> <b>인용구 블록</b>
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '10px 0', fontWeight: 800 }}
                >
                  {isSaving ? '저장 중...' : '회의록 저장'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  style={{ flex: 1, padding: '10px 0', background: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                >
                  취소
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {isDetailOpen && selectedMeeting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '680px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
            
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>📅 {selectedMeeting.date}</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '16px', fontWeight: 850, color: '#1e293b' }}>{selectedMeeting.title}</h3>
              </div>
              <button onClick={() => setIsDetailOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
              
              {/* Badges and metadata */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                {selectedMeeting.customerName && (
                  <div style={{ fontSize: '12px', color: '#334155' }}>
                    <strong>🏢 연계 고객사:</strong> <span style={{ color: '#0369a1', fontWeight: 700 }}>{selectedMeeting.customerName}</span>
                  </div>
                )}
                {selectedMeeting.projectName && (
                  <div style={{ fontSize: '12px', color: '#334155', marginLeft: selectedMeeting.customerName ? '16px' : 0 }}>
                    <strong>🚀 프로젝트:</strong> <span style={{ color: '#047857', fontWeight: 700 }}>{selectedMeeting.projectName}</span>
                  </div>
                )}
                <div style={{ fontSize: '12px', color: '#334155', width: '100%', marginTop: '6px' }}>
                  <strong>👥 참석자:</strong> {selectedMeeting.attendees || '미지정'}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', width: '100%', borderTop: '1px solid #e2e8f0', paddingTop: '6px', marginTop: '6px' }}>
                  작성자: {selectedMeeting.createdByName} | 작성일: {new Date(selectedMeeting.createdAt).toLocaleString()}
                </div>
              </div>

              {/* Meeting Notes Detail Content */}
              <div
                dangerouslySetInnerHTML={{ __html: selectedMeeting.content }}
                style={{
                  padding: '16px',
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '13.5px',
                  lineHeight: 1.7,
                  color: '#334155',
                  minHeight: '200px'
                }}
              />

            </div>

            <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => { handleOpenEditForm(selectedMeeting); setIsDetailOpen(false); }}
                style={{ padding: '8px 16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
              >
                수정하기
              </button>
              <button
                onClick={() => setIsDetailOpen(false)}
                style={{ padding: '8px 16px', background: '#cbd5e1', color: '#1e293b', border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
              >
                닫기
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
