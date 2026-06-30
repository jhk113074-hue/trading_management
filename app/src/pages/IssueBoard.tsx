import React, { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, onSnapshot, doc,
  updateDoc, serverTimestamp, query, orderBy, Timestamp, getDocs
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const COMPANY_ID = 'YSACC';

type Priority = '높음' | '보통' | '낮음';
type Status = '미해결' | '진행중' | '해결됨';
type Category = '기능오류' | 'UI/UX' | '데이터' | '개선요청' | '기타';

interface Attachment { name: string; url: string; type: string; }

interface Issue {
  id: string;
  issueNo?: number;
  title: string;
  content: string;
  category: Category;
  priority: Priority;
  status: Status;
  attachments: Attachment[];
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

interface Comment {
  id: string;
  content: string;
  attachments: Attachment[];
  createdBy: string;
  createdAt: Timestamp | null;
}

// ── 색상 헬퍼 ──────────────────────────────────────────────────────────
const priorityColor = (p: Priority) =>
  p === '높음' ? { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5' }
  : p === '보통' ? { bg: '#fef9c3', text: '#ca8a04', border: '#fde047' }
  : { bg: '#dcfce7', text: '#16a34a', border: '#86efac' };

const statusColor = (s: Status) =>
  s === '미해결' ? { bg: '#fee2e2', text: '#dc2626' }
  : s === '진행중' ? { bg: '#dbeafe', text: '#2563eb' }
  : { bg: '#dcfce7', text: '#16a34a' };

const categoryColor = (c: Category) =>
  c === '기능오류' ? '#ef4444'
  : c === 'UI/UX' ? '#8b5cf6'
  : c === '데이터' ? '#f59e0b'
  : c === '개선요청' ? '#0ea5e9'
  : '#64748b';

// ── 날짜 포맷 ─────────────────────────────────────────────────────────
const fmtDate = (ts: Timestamp | null) => {
  if (!ts) return '';
  const d = ts.toDate();
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

// ══════════════════════════════════════════════════════════════════════
export const IssueBoard: React.FC = () => {
  const { userProfile } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<Status | '전체'>('전체');
  const [filterCategory, setFilterCategory] = useState<Category | '전체'>('전체');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // ── 이슈 목록 구독 ──────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(doc(db, 'companies', COMPANY_ID), 'issues'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setIssues(snap.docs.map(d => ({ id: d.id, ...d.data() } as Issue)));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
    return unsub;
  }, []);

  const filtered = issues.filter(i =>
    (filterStatus === '전체' || i.status === filterStatus) &&
    (filterCategory === '전체' || i.category === filterCategory)
  );

  const counts = {
    total: issues.length,
    미해결: issues.filter(i => i.status === '미해결').length,
    진행중: issues.filter(i => i.status === '진행중').length,
    해결됨: issues.filter(i => i.status === '해결됨').length,
  };

  return (
    <div style={{ padding: '24px 30px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>🛠️ 프로그램 오류/수정 게시판</h1>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 3 }}>프로그램 오류 및 기능 개선 요청을 등록하고 팔로업하세요</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} style={{
          background: 'linear-gradient(135deg,#0d9488,#0891b2)',
          color: '#fff', border: 'none', borderRadius: 8,
          padding: '9px 20px', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(13,148,136,0.3)'
        }}>+ 오류/수정 등록</button>
      </div>

      {/* 통계 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '전체', count: counts.total, color: '#6366f1', bg: '#eef2ff' },
          { label: '미해결', count: counts.미해결, color: '#dc2626', bg: '#fee2e2' },
          { label: '진행중', count: counts.진행중, color: '#2563eb', bg: '#dbeafe' },
          { label: '해결됨', count: counts.해결됨, color: '#16a34a', bg: '#dcfce7' },
        ].map(s => (
          <div key={s.label}
            onClick={() => setFilterStatus(s.label as any)}
            style={{
              background: filterStatus === s.label ? s.bg : '#fff',
              border: `2px solid ${filterStatus === s.label ? s.color : '#e8ecf0'}`,
              borderRadius: 10, padding: '12px 16px', cursor: 'pointer',
              transition: 'all 0.15s', textAlign: 'center'
            }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 카테고리 필터 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['전체', '기능오류', 'UI/UX', '데이터', '개선요청', '기타'] as const).map(c => (
          <button key={c} onClick={() => setFilterCategory(c as any)} style={{
            padding: '5px 14px', borderRadius: 20, border: '1.5px solid',
            borderColor: filterCategory === c ? categoryColor(c as any) : '#e2e8f0',
            background: filterCategory === c ? categoryColor(c as any) : '#fff',
            color: filterCategory === c ? '#fff' : '#64748b',
            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s'
          }}>{c}</button>
        ))}
      </div>

      {/* 이슈 목록 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: '0.9rem' }}>등록된 이슈가 없습니다</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(issue => (
            <IssueRow key={issue.id} issue={issue} onClick={() => setSelectedIssue(issue)} />
          ))}
        </div>
      )}

      {/* 모달들 */}
      {showCreateModal && (
        <CreateIssueModal
          onClose={() => setShowCreateModal(false)}
          userName={userProfile?.name || '익명'}
        />
      )}
      {selectedIssue && (
        <IssueDetailModal
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          userName={userProfile?.name || '익명'}
          onUpdate={(updated) => setSelectedIssue(updated)}
        />
      )}
    </div>
  );
};

// ── 이슈 행 컴포넌트 ───────────────────────────────────────────────────
const IssueRow: React.FC<{ issue: Issue; onClick: () => void }> = ({ issue, onClick }) => {
  const pc = priorityColor(issue.priority);
  const sc = statusColor(issue.status);
  return (
    <div onClick={onClick} style={{
      background: '#fff', border: '1.5px solid #e8ecf0', borderRadius: 10,
      padding: '14px 18px', cursor: 'pointer', transition: 'all 0.15s',
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center'
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#0d9488'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 10px rgba(13,148,136,0.1)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e8ecf0'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b' }}>No. {issue.issueNo || '-'}</span>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: categoryColor(issue.category), background: `${categoryColor(issue.category)}18`, padding: '2px 8px', borderRadius: 10 }}>{issue.category}</span>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: pc.text, background: pc.bg, padding: '2px 8px', borderRadius: 10 }}>{issue.priority}</span>
          {issue.attachments?.length > 0 && <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>📎 {issue.attachments.length}</span>}
        </div>
        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1e293b', marginBottom: 3 }}>{issue.title}</div>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
          {issue.createdBy} · {fmtDate(issue.createdAt)}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: sc.text, background: sc.bg, padding: '4px 12px', borderRadius: 20 }}>{issue.status}</span>
      </div>
    </div>
  );
};

// ── 이슈 생성 모달 ─────────────────────────────────────────────────────
const CreateIssueModal: React.FC<{ onClose: () => void; userName: string }> = ({ onClose, userName }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Category>('기능오류');
  const [priority, setPriority] = useState<Priority>('보통');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string; type: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [position, setPosition] = useState({ x: 100, y: 120 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const nextX = Math.max(10, Math.min(window.innerWidth - 300, e.clientX - dragStartRef.current.x));
    const nextY = Math.max(10, Math.min(window.innerHeight - 150, e.clientY - dragStartRef.current.y));
    setPosition({ x: nextX, y: nextY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const clipboardFiles = e.clipboardData?.files;
      if (clipboardFiles && clipboardFiles.length > 0) {
        const hasFile = Array.from(clipboardFiles).some(f => f.size > 0);
        if (hasFile) {
          e.preventDefault();
          setFiles(prev => [...prev, ...Array.from(clipboardFiles)]);
        }
      }
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!title.trim()) { alert('제목을 입력하세요'); return; }
    setSaving(true);
    try {
      const snap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'issues'));
      let maxNo = 0;
      snap.forEach(d => {
        const no = d.data().issueNo || 0;
        if (no > maxNo) maxNo = no;
      });
      const nextNo = maxNo + 1;

      const attachments: Attachment[] = [];
      for (const file of files) {
        const r = ref(storage, `companies/${COMPANY_ID}/issues/${Date.now()}_${file.name}`);
        await uploadBytes(r, file);
        const url = await getDownloadURL(r);
        attachments.push({ name: file.name, url, type: file.type });
      }
      await addDoc(collection(doc(db, 'companies', COMPANY_ID), 'issues'), {
        issueNo: nextNo,
        title: title.trim(),
        content: content.trim(),
        category, priority,
        status: '미해결',
        attachments,
        createdBy: userName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onClose();
    } catch (e) { console.error(e); alert('저장 실패'); }
    setSaving(false);
  };

  return (
    <div style={{
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: '600px',
      zIndex: 1000,
      userSelect: isDragging ? 'none' : 'auto'
    }}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(15,23,42,0.3)', border: '2px solid #cbd5e1', overflow: 'hidden', padding: '16px' }} onClick={e => e.stopPropagation()}>
        <div 
          onMouseDown={handleMouseDown}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, cursor: 'move', userSelect: 'none' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>🛠️ 프로그램 오류/수정 등록</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>

        <FieldLabel>제목 *</FieldLabel>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="이슈 제목을 입력하세요" style={inputStyle} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '12px 0' }}>
          <div>
            <FieldLabel>카테고리</FieldLabel>
            <select value={category} onChange={e => setCategory(e.target.value as Category)} style={inputStyle}>
              {(['기능오류','UI/UX','데이터','개선요청','기타'] as Category[]).map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>우선순위</FieldLabel>
            <select value={priority} onChange={e => setPriority(e.target.value as Priority)} style={inputStyle}>
              {(['높음','보통','낮음'] as Priority[]).map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <FieldLabel>내용</FieldLabel>
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={5} placeholder="이슈를 상세히 설명해주세요..." style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />

        {/* 파일 첨부 */}
        <FieldLabel>파일 첨부 (캡처 이미지 포함)</FieldLabel>
        <div
          style={{ background: '#f8fafc', border: '2px dashed #cbd5e1', padding: '16px', borderRadius: '8px', textAlign: 'center', transition: 'all 0.2s', cursor: 'pointer', marginBottom: '8px' }}
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#0d9488'; e.currentTarget.style.background = '#f0fdfa'; }}
          onDragLeave={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
          onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]); }}
          onClick={() => fileRef.current?.click()}
          tabIndex={0}
        >
          <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '8px' }}>📁 이곳에 파일이나 캡처 이미지(Ctrl+V)를 드래그 앤 드롭하여 첨부하세요.</div>
          <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.docx,.doc" onChange={handleFiles} style={{ display: 'none' }} id="issue-create-file-upload" />
          <label htmlFor="issue-create-file-upload" style={{ background: '#0d9488', color: '#fff', padding: '7px 16px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600, display: 'inline-block' }}>
            파일 선택하기
          </label>
        </div>
        {files.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {files.map((f, i) => {
              const isImg = f.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name);
              const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', borderRadius: 6, padding: '4px 10px', fontSize: '0.75rem' }}>
                  <span 
                    onClick={() => {
                      const url = URL.createObjectURL(f);
                      setPreviewFile({ name: f.name, url, type: f.type });
                    }} 
                    style={{ cursor: (isImg || isPdf) ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 4 }}
                    title={(isImg || isPdf) ? "클릭하여 미리보기" : ""}
                  >
                    {f.type.startsWith('image/') ? '🖼️' : '📄'} {f.name}
                  </span>
                  <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>✕</button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onClose} style={{ ...btnStyle, background: '#f1f5f9', color: '#475569' }}>취소</button>
          <button onClick={handleSubmit} disabled={saving} style={{ ...btnStyle, background: 'linear-gradient(135deg,#0d9488,#0891b2)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
            {saving ? '저장 중...' : '등록'}
          </button>
        </div>
        {previewFile && (
          <FilePreviewModal 
            file={previewFile} 
            onClose={() => { 
              if (previewFile.url.startsWith('blob:')) {
                URL.revokeObjectURL(previewFile.url);
              }
              setPreviewFile(null); 
            }} 
          />
        )}
      </div>
    </div>
  );
};

// ── 이슈 상세 + 댓글 모달 ─────────────────────────────────────────────
const IssueDetailModal: React.FC<{
  issue: Issue; onClose: () => void; userName: string;
  onUpdate: (updated: Issue) => void;
}> = ({ issue, onClose, userName, onUpdate }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>(issue.attachments || []);
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string; type: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [status, setStatus] = useState<Status>(issue.status);
  const fileRef = useRef<HTMLInputElement>(null);

  // Edit fields states
  const [editTitle, setEditTitle] = useState(issue.title);
  const [editContent, setEditContent] = useState(issue.content || '');
  const [editCategory, setEditCategory] = useState<Category>(issue.category);
  const [editPriority, setEditPriority] = useState<Priority>(issue.priority);
  const [savingChanges, setSavingChanges] = useState(false);

  const [position, setPosition] = useState({ x: 150, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const nextX = Math.max(10, Math.min(window.innerWidth - 300, e.clientX - dragStartRef.current.x));
    const nextY = Math.max(10, Math.min(window.innerHeight - 150, e.clientY - dragStartRef.current.y));
    setPosition({ x: nextX, y: nextY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const q = query(
      collection(doc(db, 'companies', COMPANY_ID), `issues/${issue.id}/comments`),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
    });
    return unsub;
  }, [issue.id]);

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const clipboardFiles = e.clipboardData?.files;
      if (clipboardFiles && clipboardFiles.length > 0) {
        const hasFile = Array.from(clipboardFiles).some(f => f.size > 0);
        if (hasFile) {
          e.preventDefault();
          handleFileUpload(clipboardFiles);
        }
      }
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [attachments]);

  const handleStatusChange = async (s: Status) => {
    setStatus(s);
    await updateDoc(doc(db, 'companies', COMPANY_ID, 'issues', issue.id), {
      status: s, updatedAt: serverTimestamp()
    });
    onUpdate({ ...issue, status: s });
  };

  const handleFileUpload = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    const updatedAttachments = [...attachments];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uniquePath = `companies/${COMPANY_ID}/issues/attachments/${Date.now()}_${file.name}`;
        const r = ref(storage, uniquePath);
        await uploadBytes(r, file);
        const url = await getDownloadURL(r);
        updatedAttachments.push({ name: file.name, url, type: file.type });
      }
      setAttachments(updatedAttachments);
      await updateDoc(doc(db, 'companies', COMPANY_ID, 'issues', issue.id), {
        attachments: updatedAttachments,
        updatedAt: serverTimestamp()
      });
      onUpdate({ ...issue, attachments: updatedAttachments });
    } catch (e) {
      console.error(e);
      alert('파일 업로드 실패');
    }
    setIsUploading(false);
  };

  const handleDeleteAttachment = async (index: number) => {
    const att = attachments[index];
    if (!att) return;
    if (!window.confirm(`'${att.name}' 파일을 삭제하시겠습니까?`)) return;
    
    try {
      const storageRef = ref(storage, att.url);
      await deleteObject(storageRef).catch(console.warn);

      const updatedAttachments = [...attachments];
      updatedAttachments.splice(index, 1);
      setAttachments(updatedAttachments);
      
      await updateDoc(doc(db, 'companies', COMPANY_ID, 'issues', issue.id), {
        attachments: updatedAttachments,
        updatedAt: serverTimestamp()
      });
      onUpdate({ ...issue, attachments: updatedAttachments });
    } catch (e) {
      console.error(e);
      alert('파일 삭제 중 오류가 발생했습니다.');
    }
  };

  const postComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      await addDoc(
        collection(doc(db, 'companies', COMPANY_ID), `issues/${issue.id}/comments`),
        { content: newComment.trim(), attachments: [], createdBy: userName, createdAt: serverTimestamp() }
      );
      setNewComment('');
    } catch (e) { console.error(e); alert('댓글 저장 실패'); }
    setPosting(false);
  };

  const handleSaveChanges = async () => {
    if (!editTitle.trim()) { alert('제목을 입력하세요'); return; }
    setSavingChanges(true);
    try {
      const docRef = doc(db, 'companies', COMPANY_ID, 'issues', issue.id);
      await updateDoc(docRef, {
        title: editTitle.trim(),
        content: editContent.trim(),
        category: editCategory,
        priority: editPriority,
        updatedAt: serverTimestamp()
      });
      onUpdate({
        ...issue,
        title: editTitle.trim(),
        content: editContent.trim(),
        category: editCategory,
        priority: editPriority,
        status
      });
      alert('이슈 정보가 수정되었습니다.');
    } catch (e) {
      console.error(e);
      alert('저장 실패');
    }
    setSavingChanges(false);
  };

  return (
    <div style={{
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: '700px',
      zIndex: 1000,
      userSelect: isDragging ? 'none' : 'auto'
    }}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(15,23,42,0.3)', border: '2px solid #cbd5e1', overflow: 'hidden', padding: '16px' }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div 
          onMouseDown={handleMouseDown}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid #cbd5e1', paddingBottom: 10, cursor: 'move', userSelect: 'none' }}>
          <div>
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569' }}>No. {issue.issueNo || '-'} 상세 정보</span>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
              작성자: {issue.createdBy} · {fmtDate(issue.createdAt)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>

        {/* Scrollable Contents Area */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* 상태 변경 */}
          <div>
            <FieldLabel>완료 처리 및 상태</FieldLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['미해결','진행중','해결됨'] as Status[]).map(s => {
                const sc = statusColor(s);
                const active = status === s;
                return (
                  <button key={s} onClick={() => handleStatusChange(s)} style={{
                    padding: '5px 16px', borderRadius: 20, border: `2px solid ${active ? sc.text : '#e2e8f0'}`,
                    background: active ? sc.bg : '#fff', color: active ? sc.text : '#94a3b8',
                    fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.15s'
                  }}>{s}</button>
                );
              })}
            </div>
          </div>

          <FieldLabel>제목 *</FieldLabel>
          <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="이슈 제목을 입력하세요" style={inputStyle} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '4px 0' }}>
            <div>
              <FieldLabel>카테고리</FieldLabel>
              <select value={editCategory} onChange={e => setEditCategory(e.target.value as Category)} style={inputStyle}>
                {(['기능오류','UI/UX','데이터','개선요청','기타'] as Category[]).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>우선순위</FieldLabel>
              <select value={editPriority} onChange={e => setEditPriority(e.target.value as Priority)} style={inputStyle}>
                {(['높음','보통','낮음'] as Priority[]).map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <FieldLabel>내용</FieldLabel>
          <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={4} placeholder="이슈를 상세히 설명해주세요..." style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />

        {/* ─── 파일 첨부 (드래그&드롭 / Ctrl+V / 파일선택) ─── */}
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: 6 }}>📎 파일 첨부 (드래그&드롭 / Ctrl+V)</div>
        <div
          style={{ background: '#f8fafc', border: '2px dashed #cbd5e1', padding: '14px', borderRadius: '8px', textAlign: 'center', transition: 'all 0.2s', cursor: 'pointer', marginBottom: '16px' }}
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#0d9488'; e.currentTarget.style.background = '#f0fdfa'; }}
          onDragLeave={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
          onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; handleFileUpload(e.dataTransfer.files); }}
          onPaste={e => { const pasteFiles = e.clipboardData?.files; if (pasteFiles && pasteFiles.length > 0) { e.preventDefault(); handleFileUpload(pasteFiles); } }}
          onClick={() => fileRef.current?.click()}
          tabIndex={0}
        >
          <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '8px' }}>📁 이곳에 파일이나 캡처 이미지(Ctrl+V)를 드래그 앤 드롭하여 첨부하세요.</div>
          <input ref={fileRef} type="file" multiple onChange={e => handleFileUpload(e.target.files)} style={{ display: 'none' }} id="issue-detail-file-upload" />
          <label htmlFor="issue-detail-file-upload" style={{ background: '#0d9488', color: '#fff', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 600, display: 'inline-block' }}>
            {isUploading ? '업로드 중...' : '파일 선택하기'}
          </label>

          {attachments.length > 0 && (
            <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
              {attachments.map((att, idx) => {
                const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name) || att.type?.startsWith('image/');
                const isPdf = /\.pdf$/i.test(att.name) || att.type === 'application/pdf';
                const isExcel = /\.(xls|xlsx)$/i.test(att.name);
                const handlePreview = () => {
                  setPreviewFile({ name: att.name, url: att.url, type: att.type });
                };
                return (
                  <div key={idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: (isImg || isPdf) ? 'pointer' : 'default' }} onClick={handlePreview} title={(isImg || isPdf) ? "클릭하여 미리보기" : ""}>
                      {isImg ? (
                        <img src={att.url} alt={att.name} style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                      ) : (
                        <span style={{ fontSize: '16px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                          {isPdf ? '📄' : isExcel ? '📊' : '📎'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', cursor: (isImg || isPdf) ? 'pointer' : 'default' }} onClick={handlePreview}>
                      <span style={{ color: '#1e293b', fontWeight: 600, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={att.name}>{att.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}>
                      <a href={att.url} download={att.name} target="_blank" rel="noreferrer" style={{ background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '3px 5px', fontSize: '10px', textDecoration: 'none' }} title="다운로드">⬇</a>
                      <button type="button" onClick={() => handleDeleteAttachment(idx)} style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '3px 5px', fontSize: '10px' }} title="삭제">✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #e8ecf0', margin: '16px 0' }} />

        {/* 댓글 목록 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#0f172a' }}>댓글</h4>
          <div style={{ background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '120px', overflowY: 'auto' }}>
            {comments.map(c => (
              <div key={c.id}>
                <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: '2px' }}>{c.createdBy} • {fmtDate(c.createdAt)}</div>
                <div style={{ fontSize: '0.8rem', color: '#0f172a', background: '#fff', padding: '6px 8px', borderRadius: '0 6px 6px 6px', border: '1px solid #e2e8f0', display: 'inline-block' }}>{c.content}</div>
              </div>
            ))}
            {comments.length === 0 && <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', padding: '8px' }}>댓글 없음</div>}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.8rem' }} value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="댓글 입력..." onKeyDown={e => { if (e.key === 'Enter') postComment(); }} />
            <button onClick={postComment} disabled={posting} style={{ background: '#0d9488', color: '#fff', border: 'none', padding: '0 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>등록</button>
        </div>
        </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12, borderTop: '1px solid #e8ecf0', paddingTop: 10 }}>
          <button onClick={onClose} style={{ ...btnStyle, background: '#f1f5f9', color: '#475569' }}>닫기</button>
          <button onClick={handleSaveChanges} disabled={savingChanges} style={{ ...btnStyle, background: 'linear-gradient(135deg,#0d9488,#0891b2)', color: '#fff', opacity: savingChanges ? 0.7 : 1 }}>
            {savingChanges ? '수정 중...' : '저장'}
          </button>
        </div>
        {previewFile && (
          <FilePreviewModal 
            file={previewFile} 
            onClose={() => setPreviewFile(null)} 
          />
        )}
      </div>
    </div>
  );
};


// ── 파일 미리보기 모달 ──────────────────────────────────────────────────
const FilePreviewModal: React.FC<{
  file: { name: string; url: string; type: string };
  onClose: () => void;
}> = ({ file, onClose }) => {
  const isImg = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(4px)',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      zIndex: 9999, padding: '20px', boxSizing: 'border-box'
    }} onClick={onClose}>
      <div style={{
        position: 'absolute', top: 20, right: 20, display: 'flex', gap: 12, zIndex: 10000
      }} onClick={e => e.stopPropagation()}>
        <a href={file.url} download={file.name} target="_blank" rel="noreferrer" style={{
          background: '#0d9488', color: '#fff', border: 'none', borderRadius: '8px',
          padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none',
          boxShadow: '0 2px 8px rgba(13,148,136,0.3)', display: 'inline-block', cursor: 'pointer'
        }}>다운로드</a>
        <button onClick={onClose} style={{
          background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px',
          padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(239,68,68,0.3)'
        }}>닫기</button>
      </div>

      <div style={{
        color: '#fff', fontSize: '1rem', fontWeight: 700, marginBottom: 16,
        textAlign: 'center', maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }} onClick={e => e.stopPropagation()}>
        {file.name}
      </div>

      <div style={{
        flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center',
        width: '100%', maxWidth: '1000px', height: '100%', position: 'relative'
      }} onClick={e => e.stopPropagation()}>
        {isImg ? (
          <img src={file.url} alt={file.name} style={{
            maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain',
            borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
          }} />
        ) : isPdf ? (
          <iframe src={file.url} title={file.name} style={{
            width: '100%', height: '80vh', border: 'none', borderRadius: '8px',
            background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
          }} />
        ) : (
          <div style={{
            background: '#fff', padding: '30px 40px', borderRadius: '12px',
            textAlign: 'center', maxWidth: '400px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>미리보기 미지원 파일</div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 16 }}>
              이 파일 형식은 브라우저에서 직접 미리보기를 할 수 없습니다. 다운로드하여 확인해주세요.
            </div>
            <a href={file.url} download={file.name} target="_blank" rel="noreferrer" style={{
              background: '#0d9488', color: '#fff', border: 'none', borderRadius: '8px',
              padding: '8px 20px', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none',
              display: 'inline-block'
            }}>파일 다운로드</a>
          </div>
        )}
      </div>
    </div>
  );
};

// ── 공통 스타일 ────────────────────────────────────────────────────────
const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: 5, marginTop: 12 }}>{children}</div>
);

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0',
  fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  background: '#fff', color: '#1e293b'
};

const btnStyle: React.CSSProperties = {
  padding: '8px 20px', borderRadius: 8, border: 'none', fontWeight: 700,
  fontSize: '0.85rem', cursor: 'pointer', transition: 'opacity 0.15s'
};
