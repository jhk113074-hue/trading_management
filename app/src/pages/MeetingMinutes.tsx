import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, deleteDoc, doc, onSnapshot, setDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { CustomerSearchModal } from '../components/CustomerSearchModal';

interface Customer {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface MeetingCompany {
  companyId: string;
  companyName: string;
  type: 'CUSTOMER' | 'SUPPLIER';
  attendees: string; // Attendees from this company
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
  isDraft?: boolean;
  companies?: MeetingCompany[]; // Multi-company list
}

interface PresenceUser {
  id: string;
  name: string;
  lastActive: string;
}

export const MeetingMinutes: React.FC = () => {
  const { userProfile } = useAuth();
  const [meetings, setMeetings] = useState<MeetingMinute[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterProject, setFilterProject] = useState('');

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingMinute | null>(null);
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);
  const [isMailShareOpen, setIsMailShareOpen] = useState(false);

  // Add Company overlay states
  const [isAddCompanyOpen, setIsAddCompanyOpen] = useState(false);
  const [tempCompanyType, setTempCompanyType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [tempCompanyId, setTempCompanyId] = useState('');
  const [tempCompanyName, setTempCompanyName] = useState('');
  const [tempAttendees, setTempAttendees] = useState('');

  // Form states
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [projectName, setProjectName] = useState('');
  const [companies, setCompanies] = useState<MeetingCompany[]>([]);
  const [contentHTML, setContentHTML] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Mail Share recipient
  const [mailReceiverId, setMailReceiverId] = useState('');

  // Collaboration and Presence states
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const lastLocalInputTimeRef = useRef<number>(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const isUpdatingRef = useRef<boolean>(false);

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

    // Load suppliers
    const fetchSuppliers = async () => {
      try {
        const snap = await getDocs(collection(db, 'suppliers'));
        const list: Supplier[] = [];
        snap.forEach(d => {
          const data = d.data();
          list.push({ id: d.id, name: data.name || data.nameKo || data.nameEn || '' });
        });
        setSuppliers(list);
      } catch (err) {
        console.error("Failed to load suppliers:", err);
      }
    };
    fetchSuppliers();

    // Load users
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const list: any[] = [];
        snap.forEach(d => {
          list.push({ id: d.id, ...d.data() });
        });
        setUsers(list);
      } catch (err) {
        console.error("Failed to load users:", err);
      }
    };
    fetchUsers();

    // Load meeting minutes list (sync real-time)
    const unsub = onSnapshot(collection(db, 'meetings'), (snap) => {
      const list: MeetingMinute[] = [];
      snap.forEach(d => {
        const data = d.data() as MeetingMinute;
        if (!data.isDraft) {
          list.push({ ...data, id: d.id });
        }
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

  // Parse URL query parameter for direct meeting details linking on mount
  useEffect(() => {
    if (meetings.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const targetId = params.get('id');
      if (targetId) {
        const found = meetings.find(m => m.id === targetId);
        if (found) {
          setSelectedMeeting(found);
          setIsDetailOpen(true);
        }
      }
    }
  }, [meetings]);

  // Listen to Firestore document updates for real-time collaborative editing
  useEffect(() => {
    if (!isFormOpen || !editId) return;

    const docRef = doc(db, 'meetings', editId);
    const unsubDoc = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && !isUpdatingRef.current) {
        const data = docSnap.data();
        
        // Sync inputs if not typing
        const now = Date.now();
        if (now - lastLocalInputTimeRef.current > 1200) {
          if (editorRef.current && data.content !== editorRef.current.innerHTML) {
            editorRef.current.innerHTML = data.content || '';
            setContentHTML(data.content || '');
          }
          if (data.title !== undefined && data.title !== title) setTitle(data.title);
          if (data.date !== undefined && data.date !== date) setDate(data.date);
          if (data.projectName !== undefined && data.projectName !== projectName) setProjectName(data.projectName);
          if (data.companies !== undefined) setCompanies(data.companies || []);
        }
      }
    });

    // Write user presence inside sub-collection for the active document
    const userPresenceRef = doc(db, 'meetings', editId, 'presence', userProfile?.id || 'anonymous');
    setDoc(userPresenceRef, {
      name: userProfile?.name || 'Anonymous',
      lastActive: new Date().toISOString()
    }, { merge: true });

    // Periodically update user presence
    const presenceInterval = setInterval(() => {
      setDoc(userPresenceRef, {
        lastActive: new Date().toISOString()
      }, { merge: true });
    }, 8000);

    // Read active participants presence list
    const presenceColRef = collection(db, 'meetings', editId, 'presence');
    const unsubPresence = onSnapshot(presenceColRef, (presenceSnap) => {
      const usersList: PresenceUser[] = [];
      const threshold = Date.now() - 20000; // Active within last 20 seconds
      presenceSnap.forEach(d => {
        const data = d.data();
        if (new Date(data.lastActive).getTime() > threshold) {
          usersList.push({ id: d.id, name: data.name, lastActive: data.lastActive });
        }
      });
      setActiveUsers(usersList);
    });

    return () => {
      unsubDoc();
      unsubPresence();
      clearInterval(presenceInterval);
      // Delete local user presence on leave
      deleteDoc(userPresenceRef).catch(console.error);
    };
  }, [isFormOpen, editId, userProfile]);

  // Throttled/Debounced updates to Firestore to share typing in real-time
  const syncToFirestore = async (fields: Partial<MeetingMinute>) => {
    if (!editId) return;
    isUpdatingRef.current = true;
    try {
      await setDoc(doc(db, 'meetings', editId), {
        ...fields,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.error("Firestore collaborative sync failed:", e);
    } finally {
      isUpdatingRef.current = false;
    }
  };

  const handleLocalChange = (fieldName: string, value: any) => {
    lastLocalInputTimeRef.current = Date.now();
    if (fieldName === 'title') {
      setTitle(value);
      syncToFirestore({ title: value });
    } else if (fieldName === 'date') {
      setDate(value);
      syncToFirestore({ date: value });
    } else if (fieldName === 'projectName') {
      setProjectName(value);
      syncToFirestore({ projectName: value });
    }
  };

  // Add Company to companies state
  const handleAddCompanySubmit = () => {
    if (!tempCompanyName) {
      alert("연계 업체를 선택하거나 입력해 주세요.");
      return;
    }
    const newComp: MeetingCompany = {
      companyId: tempCompanyId || `temp_${Date.now()}`,
      companyName: tempCompanyName,
      type: tempCompanyType,
      attendees: tempAttendees || '미지정'
    };
    const updated = [...companies, newComp];
    setCompanies(updated);
    setIsAddCompanyOpen(false);

    // Sync to firestore
    lastLocalInputTimeRef.current = Date.now();
    syncToFirestore({ companies: updated });

    // Reset values
    setTempCompanyId('');
    setTempCompanyName('');
    setTempAttendees('');
  };

  // Delete Company from list
  const handleDeleteCompany = (index: number) => {
    const updated = companies.filter((_, idx) => idx !== index);
    setCompanies(updated);
    lastLocalInputTimeRef.current = Date.now();
    syncToFirestore({ companies: updated });
  };

  const handleOpenNewForm = async () => {
    setIsSaving(false);
    // Pre-create document draft for real-time collaboration session
    const docRef = doc(collection(db, 'meetings'));
    const draftData: MeetingMinute = {
      id: docRef.id,
      title: '',
      date: new Date().toISOString().split('T')[0],
      projectName: '',
      customerId: '',
      customerName: '',
      attendees: '',
      content: '',
      createdAt: new Date().toISOString(),
      createdBy: userProfile?.id || '',
      createdByName: userProfile?.name || '시스템',
      isDraft: true,
      companies: []
    };
    await setDoc(docRef, draftData);

    setEditId(docRef.id);
    setTitle('');
    setDate(draftData.date);
    setProjectName('');
    setCompanies([]);
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
    setCompanies(m.companies || []);
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
    // Aggregate for backward compatibility and card rendering
    const aggregatedCustName = companies.map(c => c.companyName).join(', ');
    const aggregatedAttendees = companies.map(c => `${c.companyName}(${c.attendees})`).join(', ');

    try {
      if (editId) {
        await updateDoc(doc(db, 'meetings', editId), {
          title,
          date,
          projectName,
          customerId: companies.length > 0 ? companies[0].companyId : '',
          customerName: aggregatedCustName,
          attendees: aggregatedAttendees,
          companies,
          content: currentEditorContent,
          isDraft: false, // Save draft to public list
          updatedAt: new Date().toISOString()
        });
        alert("회의록이 성공적으로 저장되었습니다.");
        setIsFormOpen(false);
      }
    } catch (err) {
      console.error(err);
      alert("회의록 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelForm = async () => {
    setIsFormOpen(false);
    if (editId) {
      try {
        const snap = await getDocs(collection(db, 'meetings'));
        snap.forEach(async (d) => {
          if (d.id === editId && d.data().isDraft) {
            await deleteDoc(doc(db, 'meetings', editId));
          }
        });
      } catch (err) {
        console.error("Failed to clean up draft:", err);
      }
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

  // Clipboard copy sharing link
  const handleCopyLink = (m: MeetingMinute) => {
    const url = `${window.location.origin}/meetings?id=${m.id}`;
    navigator.clipboard.writeText(url).then(() => {
      alert("회의록 다이렉트 공유 링크가 클립보드에 복사되었습니다!");
    }).catch(err => {
      console.error("Link copy failed:", err);
    });
  };

  // Send meeting minute via corporate internal email
  const handleSendMailShare = async () => {
    if (!selectedMeeting || !mailReceiverId) return;
    const receiver = users.find(u => u.id === mailReceiverId);
    if (!receiver) return;

    try {
      await addDoc(collection(db, 'mails'), {
        senderId: userProfile?.id || 'SYSTEM',
        senderName: userProfile?.name || '시스템',
        receiverId: mailReceiverId,
        receiverName: receiver.name,
        title: `[회의록 공유] ${selectedMeeting.title}`,
        content: `
          <div style="background: #f1f5f9; padding: 12px; border-left: 4px solid #4f46e5; border-radius: 4px; margin-bottom: 12px;">
            <strong>📋 회의록 공유 알림</strong><br>
            ${userProfile?.name}님이 회의록을 공유했습니다. 아래 회의록 카드를 누르면 상세 화면으로 이동합니다.
          </div>
          <h3>제목: ${selectedMeeting.title}</h3>
          <p>일자: ${selectedMeeting.date} | 참석자: ${selectedMeeting.attendees || '미지정'}</p>
          ${selectedMeeting.projectName ? `<p>프로젝트: ${selectedMeeting.projectName}</p>` : ''}
          <hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 16px 0;" />
          <div style="padding: 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;">
            ${selectedMeeting.content}
          </div>
          <br>
          <a href="${window.location.origin}/meetings?id=${selectedMeeting.id}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 13px;">회의록으로 바로 이동</a>
        `,
        isRead: false,
        createdAt: new Date().toISOString()
      });
      alert(`${receiver.name}님에게 사내 메일로 회의록 공유본이 전송되었습니다.`);
      setIsMailShareOpen(false);
    } catch (err) {
      console.error(err);
      alert("메일 전송에 실패했습니다.");
    }
  };

  // Rich editor key & input triggers
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
    handleEditorInput();
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
      const html = editorRef.current.innerHTML;
      setContentHTML(html);
      lastLocalInputTimeRef.current = Date.now();
      syncToFirestore({ content: html });
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
    
    handleEditorInput();
  };

  const filteredMeetings = meetings.filter(m => {
    const matchesQuery = m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (m.attendees || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (m.projectName || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    // Check if any linked company matches filter
    const matchesCustomer = filterCustomer ? (m.companies || []).some(c => c.companyId === filterCustomer) : true;
    const matchesProject = filterProject ? (m.projectName || '').toLowerCase().includes(filterProject.toLowerCase()) : true;

    return matchesQuery && matchesCustomer && matchesProject;
  });

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>회의록 데이터를 불러오는 중...</div>;
  }

  const addressableUsers = users.filter(u => u.id !== userProfile?.id);

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

              {/* Company Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(m.companies || []).map((c, cIdx) => (
                  <span
                    key={cIdx}
                    style={{
                      fontSize: '11px',
                      background: c.type === 'CUSTOMER' ? '#e0f2fe' : '#fef3c7',
                      color: c.type === 'CUSTOMER' ? '#0369a1' : '#d97706',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 700
                    }}
                  >
                    {c.type === 'CUSTOMER' ? '🏢' : '⚙️'} {c.companyName}
                  </span>
                ))}
                {m.projectName && (
                  <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#047857', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                    🚀 {m.projectName}
                  </span>
                )}
              </div>

              <div style={{ fontSize: '12px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '50px', overflow: 'hidden' }}>
                <strong>참석자 목록:</strong>
                {(m.companies || []).map((c, cIdx) => (
                  <span key={cIdx} style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    • {c.companyName}: {c.attendees}
                  </span>
                ))}
              </div>

              <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '10px', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={e => { e.stopPropagation(); handleCopyLink(m); }}
                  style={{ background: '#e0f2fe', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', fontWeight: 700, color: '#0369a1', cursor: 'pointer' }}
                >
                  🔗 링크복사
                </button>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={e => { e.stopPropagation(); handleOpenEditForm(m); }}
                    style={{ background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                  >
                    수정
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(m.id); }}
                    style={{ background: '#fee2e2', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', fontWeight: 700, color: '#dc2626', cursor: 'pointer' }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Wide-Scale Collaborative Add / Edit Modal */}
      {isFormOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '1000px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ padding: '16px 24px', background: '#4f46e5', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800 }}>
                  {editId ? '📝 회의록 협업 작성 중' : '✍️ 새 회의록 협업 작성 중'}
                </span>
                {activeUsers.length > 0 && (
                  <span style={{ fontSize: '11.5px', color: '#a5f3fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#22c55e', borderRadius: '50%' }}></span>
                    실시간 접속 참석자: {activeUsers.map(u => u.name).join(', ')}
                  </span>
                )}
              </div>
              <button onClick={handleCancelForm} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '80vh', overflowY: 'auto' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>회의 일자 ★</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => handleLocalChange('date', e.target.value)}
                    style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>연계 프로젝트명</label>
                  <input
                    type="text"
                    placeholder="예: 삼익HDS 프로젝트"
                    value={projectName}
                    onChange={e => handleLocalChange('projectName', e.target.value)}
                    style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                  />
                </div>
              </div>

              {/* Companies and Attendees list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155' }}>👥 연계 참여업체 및 참석자 목록 ({companies.length})</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTempCompanyType('CUSTOMER');
                      setTempCompanyId('');
                      setTempCompanyName('');
                      setTempAttendees('');
                      setIsAddCompanyOpen(true);
                    }}
                    style={{ padding: '4px 10px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    + 업체 추가하기
                  </button>
                </div>

                {companies.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>등록된 참여업체가 없습니다. 상단 버튼을 클릭하여 추가해 주세요.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {companies.map((c, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: c.type === 'CUSTOMER' ? '#e0f2fe' : '#fef3c7', color: c.type === 'CUSTOMER' ? '#0369a1' : '#d97706' }}>
                            {c.type === 'CUSTOMER' ? '고객사' : '공급사'}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#334155' }}>{c.companyName}</span>
                          <span style={{ fontSize: '12.5px', color: '#64748b' }}>(참석자: {c.attendees})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCompany(idx)}
                          style={{ border: 'none', background: 'transparent', color: '#ef4444', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>회의 제목 ★</label>
                <input
                  type="text"
                  required
                  placeholder="회의 핵심 안건 제목을 적어주세요"
                  value={title}
                  onChange={e => handleLocalChange('title', e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
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
                    minHeight: '380px',
                    border: '1px solid #cbd5e1',
                    borderBottomLeftRadius: '6px',
                    borderBottomRightRadius: '6px',
                    padding: '16px',
                    outline: 'none',
                    backgroundColor: '#fff',
                    overflowY: 'auto',
                    fontSize: '13.5px',
                    lineHeight: 1.7
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

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px 0', fontWeight: 800 }}
                >
                  {isSaving ? '저장 중...' : '회의록 저장 및 종료'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  style={{ flex: 1, padding: '12px 0', background: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                >
                  작성 취소 (임시저장 취소)
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Customer Finder Modal */}
      {isCustomerSearchOpen && (
        <CustomerSearchModal
          onClose={() => setIsCustomerSearchOpen(false)}
          onSelect={(cust) => {
            setTempCompanyId(cust.id);
            setTempCompanyName(cust.name);
            setIsCustomerSearchOpen(false);
          }}
          customers={customers as any}
        />
      )}

      {/* Add Company Sub-Modal Window */}
      {isAddCompanyOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '440px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: '#4f46e5', color: '#fff', fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>👥 참여업체 추가</span>
              <button onClick={() => setIsAddCompanyOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>업체 유형</label>
                <select
                  value={tempCompanyType}
                  onChange={e => {
                    setTempCompanyType(e.target.value as any);
                    setTempCompanyId('');
                    setTempCompanyName('');
                  }}
                  style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', backgroundColor: '#fff', outline: 'none' }}
                >
                  <option value="CUSTOMER">고객사 (Customer)</option>
                  <option value="SUPPLIER">공급업체 (Supplier)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>업체 찾기 ★</label>
                {tempCompanyType === 'CUSTOMER' ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      readOnly
                      placeholder="고객사를 검색해 선택해주세요"
                      value={tempCompanyName}
                      style={{ flex: 1, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', background: '#f8fafc' }}
                    />
                    <button
                      type="button"
                      onClick={() => setIsCustomerSearchOpen(true)}
                      style={{ padding: '8px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: '#475569' }}
                    >
                      🔍 찾기
                    </button>
                  </div>
                ) : (
                  <select
                    value={tempCompanyId}
                    onChange={e => {
                      const selected = suppliers.find(s => s.id === e.target.value);
                      if (selected) {
                        setTempCompanyId(selected.id);
                        setTempCompanyName(selected.name);
                      } else {
                        setTempCompanyId('');
                        setTempCompanyName('');
                      }
                    }}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', backgroundColor: '#fff', outline: 'none' }}
                  >
                    <option value="">공급업체를 선택해 주세요</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>참석자 명단</label>
                <input
                  type="text"
                  placeholder="예: 김대리, 이과장"
                  value={tempAttendees}
                  onChange={e => setTempAttendees(e.target.value)}
                  style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={handleAddCompanySubmit}
                  style={{ flex: 1, padding: '10px 0', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 800, fontSize: '13px' }}
                >
                  추가
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddCompanyOpen(false)}
                  style={{ flex: 1, padding: '10px 0', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}
                >
                  취소
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {isDetailOpen && selectedMeeting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '900px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
            
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>📅 {selectedMeeting.date}</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '16px', fontWeight: 850, color: '#1e293b' }}>{selectedMeeting.title}</h3>
              </div>
              <button onClick={() => setIsDetailOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
              
              {/* Metadata area */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                {selectedMeeting.projectName && (
                  <div style={{ fontSize: '12.5px', color: '#334155' }}>
                    <strong>🚀 프로젝트:</strong> <span style={{ color: '#047857', fontWeight: 700 }}>{selectedMeeting.projectName}</span>
                  </div>
                )}
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '4px' }}>
                  <strong>👥 연계 참여업체 및 참석자:</strong>
                  {(selectedMeeting.companies || []).map((c, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', fontSize: '12.5px', color: '#334155' }}>
                      <span style={{ fontWeight: 800, color: c.type === 'CUSTOMER' ? '#0369a1' : '#d97706' }}>
                        [{c.type === 'CUSTOMER' ? '고객사' : '공급사'}] {c.companyName}
                      </span>
                      <span>(참석자: {c.attendees})</span>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: '12px', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '6px', marginTop: '4px' }}>
                  작성자: {selectedMeeting.createdByName} | 등록일: {new Date(selectedMeeting.createdAt).toLocaleString()}
                </div>
              </div>

              {/* Meeting Notes Detail Content */}
              <div
                dangerouslySetInnerHTML={{ __html: selectedMeeting.content }}
                style={{
                  padding: '20px',
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '13.5px',
                  lineHeight: 1.7,
                  color: '#334155',
                  minHeight: '260px'
                }}
              />

            </div>

            <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => handleCopyLink(selectedMeeting)}
                style={{ padding: '8px 16px', background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
              >
                🔗 공유 링크 복사
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setIsMailShareOpen(true)}
                  style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                >
                  ✉️ 사내 메일로 공유
                </button>
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
        </div>
      )}

      {/* Send Mail Share Recipients Modal Overlay */}
      {isMailShareOpen && selectedMeeting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: '#10b981', color: '#fff', fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>✉️ 사내 메일로 공유 발송</span>
              <button onClick={() => setIsMailShareOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>수신 대상 직원 선택</label>
                <select
                  value={mailReceiverId}
                  onChange={e => setMailReceiverId(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', backgroundColor: '#fff', outline: 'none' }}
                >
                  <option value="">직원을 선택해 주세요</option>
                  {addressableUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.department || '부서'} / {u.position || '직급'})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  onClick={handleSendMailShare}
                  disabled={!mailReceiverId}
                  style={{ flex: 1, padding: '10px 0', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 800, fontSize: '13px' }}
                >
                  보내기
                </button>
                <button
                  onClick={() => setIsMailShareOpen(false)}
                  style={{ flex: 1, padding: '10px 0', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
