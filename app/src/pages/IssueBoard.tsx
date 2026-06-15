import React, { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, onSnapshot, doc,
  updateDoc, serverTimestamp, query, orderBy, Timestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const COMPANY_ID = 'YSACC';

type Priority = '높음' | '보통' | '낮음';
type Status = '미해결' | '진행중' | '해결됨';
type Category = '기능오류' | 'UI/UX' | '데이터' | '개선요청' | '기타';

interface Attachment { name: string; url: string; type: string; }

interface Issue {
  id: string;
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
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 4px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>📌 이슈 게시판</h1>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 3 }}>버그·개선 요청을 등록하고 팔로업하세요</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} style={{
          background: 'linear-gradient(135deg,#0d9488,#0891b2)',
          color: '#fff', border: 'none', borderRadius: 8,
          padding: '9px 20px', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(13,148,136,0.3)'
        }}>+ 이슈 등록</button>
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
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!title.trim()) { alert('제목을 입력하세요'); return; }
    setSaving(true);
    try {
      const attachments: Attachment[] = [];
      for (const file of files) {
        const r = ref(storage, `companies/${COMPANY_ID}/issues/${Date.now()}_${file.name}`);
        await uploadBytes(r, file);
        const url = await getDownloadURL(r);
        attachments.push({ name: file.name, url, type: file.type });
      }
      await addDoc(collection(doc(db, 'companies', COMPANY_ID), 'issues'), {
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>📌 이슈 등록</h2>
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
          onClick={() => fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]); }}
          onDragOver={e => e.preventDefault()}
          style={{ border: '2px dashed #cbd5e1', borderRadius: 8, padding: '18px', textAlign: 'center', cursor: 'pointer', background: '#f8fafc', marginBottom: 8 }}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>📎</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>클릭하거나 파일을 드래그하여 첨부</div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>이미지·PDF·Excel 등 지원</div>
        </div>
        <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.docx,.doc" onChange={handleFiles} style={{ display: 'none' }} />
        {files.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {files.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', borderRadius: 6, padding: '4px 10px', fontSize: '0.75rem' }}>
                {f.type.startsWith('image/') ? '🖼️' : '📄'} {f.name}
                <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onClose} style={{ ...btnStyle, background: '#f1f5f9', color: '#475569' }}>취소</button>
          <button onClick={handleSubmit} disabled={saving} style={{ ...btnStyle, background: 'linear-gradient(135deg,#0d9488,#0891b2)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
            {saving ? '저장 중...' : '등록'}
          </button>
        </div>
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
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [status, setStatus] = useState<Status>(issue.status);
  const commentFileRef = useRef<HTMLInputElement>(null);

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

  const handleStatusChange = async (s: Status) => {
    setStatus(s);
    await updateDoc(doc(db, 'companies', COMPANY_ID, 'issues', issue.id), {
      status: s, updatedAt: serverTimestamp()
    });
    onUpdate({ ...issue, status: s });
  };

  const postComment = async () => {
    if (!newComment.trim() && commentFiles.length === 0) return;
    setPosting(true);
    try {
      const attachments: Attachment[] = [];
      for (const f of commentFiles) {
        const r = ref(storage, `companies/${COMPANY_ID}/issues/comments/${Date.now()}_${f.name}`);
        await uploadBytes(r, f);
        const url = await getDownloadURL(r);
        attachments.push({ name: f.name, url, type: f.type });
      }
      await addDoc(
        collection(doc(db, 'companies', COMPANY_ID), `issues/${issue.id}/comments`),
        { content: newComment.trim(), attachments, createdBy: userName, createdAt: serverTimestamp() }
      );
      setNewComment('');
      setCommentFiles([]);
    } catch (e) { console.error(e); alert('댓글 저장 실패'); }
    setPosting(false);
  };

  const pc = priorityColor(issue.priority);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 700, maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: categoryColor(issue.category), background: `${categoryColor(issue.category)}18`, padding: '2px 10px', borderRadius: 10 }}>{issue.category}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: pc.text, background: pc.bg, padding: '2px 10px', borderRadius: 10 }}>{issue.priority}</span>
            </div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{issue.title}</h2>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 5 }}>
              {issue.createdBy} · {fmtDate(issue.createdAt)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94a3b8', marginLeft: 12 }}>✕</button>
        </div>

        {/* 상태 변경 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
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

        {/* 내용 */}
        {issue.content && (
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: '0.88rem', color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {issue.content}
          </div>
        )}

        {/* 첨부파일 */}
        {issue.attachments?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: 8 }}>📎 첨부파일</div>
            <AttachmentList attachments={issue.attachments} />
          </div>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid #e8ecf0', margin: '16px 0' }} />

        {/* 댓글 목록 */}
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', marginBottom: 10 }}>
          💬 댓글 ({comments.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, maxHeight: 240, overflowY: 'auto' }}>
          {comments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#cbd5e1', fontSize: '0.82rem' }}>첫 댓글을 작성해보세요</div>
          ) : comments.map(c => (
            <div key={c.id} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', border: '1px solid #e8ecf0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{c.createdBy}</span>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{fmtDate(c.createdAt)}</span>
              </div>
              {c.content && <div style={{ fontSize: '0.85rem', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{c.content}</div>}
              {c.attachments?.length > 0 && <div style={{ marginTop: 8 }}><AttachmentList attachments={c.attachments} /></div>}
            </div>
          ))}
        </div>

        {/* 댓글 입력 */}
        <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="댓글을 입력하세요..."
            rows={3}
            style={{ width: '100%', border: 'none', padding: '10px 14px', fontSize: '0.85rem', resize: 'none', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') postComment(); }}
          />
          {commentFiles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 12px', background: '#f8fafc' }}>
              {commentFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#e2e8f0', borderRadius: 6, padding: '3px 8px', fontSize: '0.72rem' }}>
                  {f.type.startsWith('image/') ? '🖼️' : '📄'} {f.name}
                  <button onClick={() => setCommentFiles(prev => prev.filter((_,idx)=>idx!==i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, fontSize: '0.78rem' }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderTop: '1px solid #e8ecf0' }}>
            <button
              onClick={() => commentFileRef.current?.click()}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}
            >📎 파일 첨부</button>
            <input ref={commentFileRef} type="file" multiple accept="image/*,.pdf,.xlsx,.docx" onChange={e => { if (e.target.files) setCommentFiles(prev => [...prev, ...Array.from(e.target.files!)]); }} style={{ display: 'none' }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>Ctrl+Enter</span>
              <button onClick={postComment} disabled={posting} style={{ ...btnStyle, background: 'linear-gradient(135deg,#0d9488,#0891b2)', color: '#fff', padding: '6px 16px', opacity: posting ? 0.7 : 1 }}>
                {posting ? '...' : '댓글 등록'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── 첨부파일 미리보기 컴포넌트 ────────────────────────────────────────
const AttachmentList: React.FC<{ attachments: Attachment[] }> = ({ attachments }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
    {attachments.map((a, i) => (
      a.type?.startsWith('image/') ? (
        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer">
          <img src={a.url} alt={a.name} style={{ height: 80, borderRadius: 6, border: '1px solid #e2e8f0', objectFit: 'cover', cursor: 'pointer' }} />
        </a>
      ) : (
        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', borderRadius: 6, padding: '5px 10px', textDecoration: 'none', color: '#334155', fontSize: '0.75rem', border: '1px solid #e2e8f0' }}>
          📄 {a.name}
        </a>
      )
    ))}
  </div>
);

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
