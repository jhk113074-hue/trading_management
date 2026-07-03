import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { User } from '../types';

interface Attachment {
  name: string;
  size: number;
  data: string; // Base64 Data URL
  type: string;
}

interface ApprovalComment {
  senderName: string;
  content: string;
  createdAt: string;
}

interface ApprovalDoc {
  id: string;
  title: string;
  docType: 'DRAFT' | 'EXPENSE' | 'LEAVE';
  content: string; // HTML content
  amount?: number;
  requesterId: string;
  requesterName: string;
  approverId: string;
  approverName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectReason?: string;
  createdAt: string;
  approvedBy?: string;
  attachments?: Attachment[];
  comments?: ApprovalComment[];
}

export const ApprovalSystem: React.FC = () => {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [documents, setDocuments] = useState<ApprovalDoc[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'submitted' | 'archive'>('pending');
  const [loading, setLoading] = useState(true);

  // Draft Form State
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [docType, setDocType] = useState<'DRAFT' | 'EXPENSE'>('DRAFT');
  const [title, setTitle] = useState('');
  const [contentHTML, setContentHTML] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [selectedApproverId, setSelectedApproverId] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // View Document Modal
  const [selectedDoc, setSelectedDoc] = useState<ApprovalDoc | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  
  // Comment State inside View Modal
  const [newComment, setNewComment] = useState('');

  const editorRef = useRef<HTMLDivElement>(null);

  const fetchApprovalData = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersList: User[] = [];
      usersSnap.forEach(d => {
        usersList.push({ id: d.id, ...d.data() } as User);
      });
      setUsers(usersList);

      const docSnap = await getDocs(collection(db, 'approvals'));
      const docList: ApprovalDoc[] = [];
      docSnap.forEach(d => {
        docList.push({ id: d.id, ...d.data() } as ApprovalDoc);
      });
      docList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setDocuments(docList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovalData();
  }, []);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    if (!selectedApproverId) {
      alert("결재권자를 지정해 주세요.");
      return;
    }

    const targetApprover = users.find(u => u.id === selectedApproverId);
    if (!targetApprover) return;

    // Read current HTML from contenteditable
    const draftBody = editorRef.current ? editorRef.current.innerHTML : contentHTML;
    if (!draftBody || draftBody.trim() === '<br>' || draftBody.trim() === '') {
      alert("기안 내용을 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'approvals'), {
        title,
        docType,
        content: draftBody,
        amount: docType === 'EXPENSE' ? Number(amount) : null,
        requesterId: userProfile.id,
        requesterName: userProfile.name,
        approverId: selectedApproverId,
        approverName: targetApprover.name,
        status: 'PENDING',
        attachments,
        comments: [],
        createdAt: new Date().toISOString()
      });

      await addDoc(collection(db, 'mails'), {
        senderId: userProfile.id,
        senderName: userProfile.name,
        receiverId: selectedApproverId,
        receiverName: targetApprover.name,
        title: `[알림] 결재 기안서가 상신되었습니다: ${title}`,
        content: `${userProfile.name}님이 결재 기안서 "${title}"를 상신했습니다.\n\n구분: ${docType === 'EXPENSE' ? '지출결의서' : '일반기안서'}\n\n전자결재 메뉴에서 결재해 주시기 바랍니다.`,
        isRead: false,
        createdAt: new Date().toISOString()
      });

      setTitle('');
      setContentHTML('');
      setAmount('');
      setAttachments([]);
      if (editorRef.current) editorRef.current.innerHTML = '';
      setSelectedApproverId('');
      setShowDraftModal(false);
      fetchApprovalData();
      alert("기안이 완료되었습니다.");
    } catch (err) {
      console.error(err);
      alert("기안 상신에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      if (file.size > 500 * 1024) {
        alert(`500KB 이하의 파일만 업로드할 수 있습니다. (${file.name})`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachments(prev => [...prev, {
          name: file.name,
          size: file.size,
          data: reader.result as string,
          type: file.type
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleApprove = async (docId: string) => {
    if (!userProfile) return;
    if (!window.confirm("이 기안을 승인하시겠습니까?")) return;

    try {
      const targetDoc = documents.find(d => d.id === docId);
      await updateDoc(doc(db, 'approvals', docId), {
        status: 'APPROVED',
        approvedBy: userProfile.name
      });

      if (targetDoc) {
        await addDoc(collection(db, 'mails'), {
          senderId: 'SYSTEM',
          senderName: '시스템 알림',
          receiverId: targetDoc.requesterId,
          receiverName: targetDoc.requesterName,
          title: `[알림] 기안 결재 승인: ${targetDoc.title}`,
          content: `${userProfile.name}님이 기안서 "${targetDoc.title}"를 승인하였습니다.`,
          isRead: false,
          createdAt: new Date().toISOString()
        });
      }

      setSelectedDoc(null);
      fetchApprovalData();
      alert("기안이 최종 승인되었습니다.");
    } catch (err) {
      console.error(err);
      alert("승인 처리에 실패했습니다.");
    }
  };

  const handleReject = async (docId: string) => {
    if (!userProfile) return;
    if (!rejectReason) {
      alert("반려 사유를 입력해 주세요.");
      return;
    }

    try {
      const targetDoc = documents.find(d => d.id === docId);
      await updateDoc(doc(db, 'approvals', docId), {
        status: 'REJECTED',
        rejectReason,
        approvedBy: userProfile.name
      });

      if (targetDoc) {
        await addDoc(collection(db, 'mails'), {
          senderId: 'SYSTEM',
          senderName: '시스템 알림',
          receiverId: targetDoc.requesterId,
          receiverName: targetDoc.requesterName,
          title: `[알림] 기안 결재 반려: ${targetDoc.title}`,
          content: `${userProfile.name}님이 기안서 "${targetDoc.title}"를 반려하였습니다.\n\n반려 사유: "${rejectReason}"`,
          isRead: false,
          createdAt: new Date().toISOString()
        });
      }

      setSelectedDoc(null);
      setRejectReason('');
      setShowRejectInput(false);
      fetchApprovalData();
      alert("기안이 반려 처리되었습니다.");
    } catch (err) {
      console.error(err);
      alert("반려 처리에 실패했습니다.");
    }
  };

  const handleAddComment = async () => {
    if (!userProfile || !newComment.trim() || !selectedDoc) return;

    const commentObj: ApprovalComment = {
      senderName: userProfile.name,
      content: newComment.trim(),
      createdAt: new Date().toISOString()
    };

    const updatedComments = [...(selectedDoc.comments || []), commentObj];

    try {
      await updateDoc(doc(db, 'approvals', selectedDoc.id), {
        comments: updatedComments
      });

      // Send mail alert to the counterpart
      const receiverId = userProfile.id === selectedDoc.requesterId ? selectedDoc.approverId : selectedDoc.requesterId;
      const receiverName = userProfile.id === selectedDoc.requesterId ? selectedDoc.approverName : selectedDoc.requesterName;
      
      await addDoc(collection(db, 'mails'), {
        senderId: userProfile.id,
        senderName: userProfile.name,
        receiverId,
        receiverName,
        title: `[알림] 결재 기안에 새로운 의견이 등록되었습니다: ${selectedDoc.title}`,
        content: `${userProfile.name}님이 기안서 "${selectedDoc.title}"에 새로운 의견(댓글)을 남겼습니다:\n\n"${newComment.trim()}"\n\n전자결재 메뉴에서 상세 확인을 해주시기 바랍니다.`,
        isRead: false,
        createdAt: new Date().toISOString()
      });

      setSelectedDoc(prev => prev ? { ...prev, comments: updatedComments } : null);
      setNewComment('');
      fetchApprovalData();
    } catch (e) {
      console.error(e);
      alert("댓글 등록에 실패했습니다.");
    }
  };

  // Editor toolbar actions
  const format = (command: string) => {
    document.execCommand(command, false);
  };

  const insertTable = () => {
    const tableHTML = `
      <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px;">
        <thead>
          <tr style="background: #f1f5f9; font-weight: bold; border: 1px solid #cbd5e1;">
            <th style="border: 1px solid #cbd5e1; padding: 8px;">구분</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px;">상세 내역</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px;">비고</th>
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

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>데이터를 불러오는 중...</div>;
  }

  const pendingDocs = documents.filter(d => d.approverId === userProfile?.id && d.status === 'PENDING');
  const submittedDocs = documents.filter(d => d.requesterId === userProfile?.id);
  const archiveDocs = documents.filter(d => d.status !== 'PENDING' && (d.requesterId === userProfile?.id || d.approverId === userProfile?.id || userProfile?.role === '관리자'));
  const activeList = activeTab === 'pending' ? pendingDocs : activeTab === 'submitted' ? submittedDocs : archiveDocs;
  const potentialApprovers = users.filter(u => u.id !== userProfile?.id && (u.role === '관리자' || u.role === '매니저'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 850, color: 'var(--primary-color)', margin: 0 }}>✍️ 전자결재 시스템</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>온라인 기안 상신, 결재선 지정, 실시간 품의서 결재 및 반려 보관 시스템입니다.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setAttachments([]); setShowDraftModal(true); }}>
          📝 새 결재 기안서 작성
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', gap: '8px' }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            color: activeTab === 'pending' ? '#4f46e5' : '#64748b',
            borderBottom: activeTab === 'pending' ? '2.5px solid #4f46e5' : 'none'
          }}
        >
          📥 결재 대기 문서 ({pendingDocs.length})
        </button>
        <button
          onClick={() => setActiveTab('submitted')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            color: activeTab === 'submitted' ? '#4f46e5' : '#64748b',
            borderBottom: activeTab === 'submitted' ? '2.5px solid #4f46e5' : 'none'
          }}
        >
          📤 나의 상신 문서 ({submittedDocs.length})
        </button>
        <button
          onClick={() => setActiveTab('archive')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            color: activeTab === 'archive' ? '#4f46e5' : '#64748b',
            borderBottom: activeTab === 'archive' ? '2.5px solid #4f46e5' : 'none'
          }}
        >
          📁 결재 완료 보관함 ({archiveDocs.length})
        </button>
      </div>

      {/* List Container */}
      <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left', fontWeight: 'bold' }}>
                <th style={{ padding: '12px' }}>문서 종류</th>
                <th style={{ padding: '12px' }}>기안 제목</th>
                <th style={{ padding: '12px' }}>기안자</th>
                <th style={{ padding: '12px' }}>결재선 (결재권자)</th>
                <th style={{ padding: '12px' }}>기안일시</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>결재 상태</th>
              </tr>
            </thead>
            <tbody>
              {activeList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    보관함에 보관된 문서가 존재하지 않습니다.
                  </td>
                </tr>
              ) : (
                activeList.map(doc => (
                  <tr
                    key={doc.id}
                    onClick={() => {
                      setSelectedDoc(doc);
                      setShowRejectInput(false);
                    }}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: doc.docType === 'EXPENSE' ? '#fef3c7' : '#eff6ff',
                        color: doc.docType === 'EXPENSE' ? '#b45309' : '#1e40af'
                      }}>
                        {doc.docType === 'EXPENSE' ? '지출결의서' : '일반기안서'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontWeight: 800, color: '#0f172a' }}>
                      {doc.title} {doc.docType === 'EXPENSE' && `($${doc.amount?.toLocaleString()})`}
                    </td>
                    <td style={{ padding: '12px', color: '#475569' }}>{doc.requesterName}</td>
                    <td style={{ padding: '12px', color: '#64748b' }}>👤 {doc.approverName}</td>
                    <td style={{ padding: '12px', color: '#94a3b8', fontSize: '11.5px' }}>{new Date(doc.createdAt).toLocaleString()}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '11.5px',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '20px',
                        background: doc.status === 'APPROVED' ? '#d1fae5' : doc.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                        color: doc.status === 'APPROVED' ? '#065f46' : doc.status === 'REJECTED' ? '#991b1b' : '#92400e'
                      }}>
                        {doc.status === 'APPROVED' ? '승인완료' : doc.status === 'REJECTED' ? '반려됨' : '결재대기'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Draft Creation Modal */}
      {showDraftModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '640px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', background: '#4f46e5', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 800 }}>📝 새 결재 문서 기안 상신</span>
              <button onClick={() => setShowDraftModal(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            
            <form onSubmit={handleCreateDraft} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '80vh', overflowY: 'auto' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>결재 양식</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setDocType('DRAFT')}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: '6px',
                      border: docType === 'DRAFT' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                      background: docType === 'DRAFT' ? '#eff6ff' : '#fff',
                      color: docType === 'DRAFT' ? '#4f46e5' : '#475569',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    일반 기안서
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocType('EXPENSE')}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: '6px',
                      border: docType === 'EXPENSE' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                      background: docType === 'EXPENSE' ? '#eff6ff' : '#fff',
                      color: docType === 'EXPENSE' ? '#4f46e5' : '#475569',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    지출 결의서
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>기안 제목 ★</label>
                <input
                  type="text"
                  required
                  placeholder="예: [설계부] 서버 구매 품의서 건"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                />
              </div>

              {docType === 'EXPENSE' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>결의 금액 ($) ★</label>
                  <input
                    type="number"
                    required
                    placeholder="결의 총 금액을 입력하세요"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                  />
                </div>
              )}

              {/* HTML Editor Component */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>기안 내용 ★</label>
                
                <div style={{ display: 'flex', gap: '6px', padding: '6px 10px', background: '#f8fafc', border: '1px solid #cbd5e1', borderBottom: 'none', borderTopLeftRadius: '6px', borderTopRightRadius: '6px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => format('bold')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>가</button>
                  <button type="button" onClick={() => format('italic')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontStyle: 'italic', fontSize: '12px' }}><i>가</i></button>
                  <button type="button" onClick={() => format('underline')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', textDecoration: 'underline', fontSize: '12px' }}><u>가</u></button>
                  <button type="button" onClick={insertTable} style={{ padding: '4px 10px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    田 표 삽입
                  </button>
                </div>

                <div
                  contentEditable
                  ref={editorRef}
                  onBlur={() => {
                    if (editorRef.current) setContentHTML(editorRef.current.innerHTML);
                  }}
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
              </div>

              {/* Attachments Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '12px', borderRadius: '8px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <span>📎 첨부파일 추가</span>
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>기안 증빙 자료를 선택해 주세요. (개당 최대 500KB)</div>
                {attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {attachments.map((file, idx) => (
                      <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '15px', padding: '4px 12px', fontSize: '11.5px' }}>
                        <span style={{ color: '#475569', fontWeight: 600 }}>{file.name} ({Math.round(file.size / 1024)} KB)</span>
                        <button type="button" onClick={() => removeAttachment(idx)} style={{ border: 'none', background: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', padding: 0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>결재선 지정 (결재권자) ★</label>
                <select
                  required
                  value={selectedApproverId}
                  onChange={e => setSelectedApproverId(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none', backgroundColor: 'white' }}
                >
                  <option value="">결재권자를 선택해 주세요</option>
                  {potentialApprovers.map(approver => (
                    <option key={approver.id} value={approver.id}>
                      {approver.name} ({approver.department || '인사'} / {approver.position || '관리자'})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px 0', fontWeight: 800 }}
                >
                  {isSubmitting ? '기안서 전송 중...' : '기안 상신'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDraftModal(false)}
                  style={{ flex: 1, padding: '12px 0', background: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                >
                  취소
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Document View Details Modal */}
      {selectedDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '680px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', background: '#1e293b', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 800 }}>📄 품의/결재 문서 상세보기</span>
              <button onClick={() => setSelectedDoc(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Document Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '65vh', overflowY: 'auto' }}>
              
              {/* Stamp Table Grid */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '16px' }}>
                <div>
                  <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>
                    {selectedDoc.docType === 'EXPENSE' ? '지 출 결 의 서' : '기 안 품 의 서'}
                  </h1>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>등록번호: {selectedDoc.id.substring(0, 8).toUpperCase()}</span>
                </div>
                
                <table style={{ border: '1px solid #cbd5e1', borderCollapse: 'collapse', textAlign: 'center', fontSize: '11px' }}>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', background: '#f8fafc', color: '#475569', fontWeight: 'bold' }}>기안자</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', background: '#f8fafc', color: '#475569', fontWeight: 'bold' }}>결재권자</td>
                    </tr>
                    <tr style={{ height: '48px' }}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 800, color: '#334155' }}>{selectedDoc.requesterName}</div>
                        <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>상신</div>
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', verticalAlign: 'middle', minWidth: '70px' }}>
                        {selectedDoc.status === 'APPROVED' ? (
                          <>
                            <div style={{ fontWeight: 900, color: '#059669', fontSize: '12px' }}>✓ 승인</div>
                            <div style={{ fontSize: '9px', color: '#94a3b8' }}>{selectedDoc.approvedBy}</div>
                          </>
                        ) : selectedDoc.status === 'REJECTED' ? (
                          <>
                            <div style={{ fontWeight: 900, color: '#dc2626', fontSize: '12px' }}>✕ 반려</div>
                            <div style={{ fontSize: '9px', color: '#94a3b8' }}>{selectedDoc.approvedBy}</div>
                          </>
                        ) : (
                          <div style={{ color: '#d97706', fontStyle: 'italic' }}>대기중</div>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Meta details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div><strong>상신 일시:</strong> {new Date(selectedDoc.createdAt).toLocaleString()}</div>
                <div><strong>결재 권한:</strong> {selectedDoc.approverName}</div>
                {selectedDoc.docType === 'EXPENSE' && (
                  <div style={{ gridColumn: '1 / span 2', color: '#b45309', fontWeight: 'bold', fontSize: '13.5px', marginTop: '4px' }}>
                    지출 결의 총액: ${selectedDoc.amount?.toLocaleString()}
                  </div>
                )}
              </div>

              {/* Content Box (HTML Rendered) */}
              <div
                dangerouslySetInnerHTML={{ __html: selectedDoc.content }}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '20px',
                  minHeight: '120px',
                  background: '#fff',
                  fontSize: '13.5px',
                  lineHeight: 1.6,
                  color: '#334155',
                  overflowX: 'auto'
                }}
              />

              {/* View Attachments */}
              {selectedDoc.attachments && selectedDoc.attachments.length > 0 && (
                <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '12px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#475569', marginBottom: '8px' }}>📎 기안 증빙 첨부파일 ({selectedDoc.attachments.length}개)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {selectedDoc.attachments.map((file, idx) => (
                      <a
                        key={idx}
                        href={file.data}
                        download={file.name}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '20px', fontSize: '12px', textDecoration: 'none', color: '#1e293b', fontWeight: 700 }}
                      >
                        📥 {file.name} ({Math.round(file.size / 1024)} KB)
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Rejection Feedback */}
              {selectedDoc.status === 'REJECTED' && selectedDoc.rejectReason && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '14px 18px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#991b1b' }}>반려 피드백/의견:</div>
                  <div style={{ fontSize: '13px', color: '#b91c1c', marginTop: '4px', fontStyle: 'italic' }}>"{selectedDoc.rejectReason}"</div>
                </div>
              )}

              {/* Comments / Opinions Section (결재 의견) */}
              <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#334155', margin: 0 }}>💬 결재 의견 / 댓글 ({selectedDoc.comments?.length || 0}개)</h4>
                
                {/* List Comments */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                  {(!selectedDoc.comments || selectedDoc.comments.length === 0) ? (
                    <div style={{ padding: '12px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', background: '#f8fafc', borderRadius: '6px', textAlign: 'center' }}>
                      등록된 의견이 없습니다.
                    </div>
                  ) : (
                    selectedDoc.comments.map((comm, idx) => (
                      <div key={idx} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12.5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <strong style={{ color: '#475569' }}>{comm.senderName}</strong>
                          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>{new Date(comm.createdAt).toLocaleString()}</span>
                        </div>
                        <div style={{ color: '#1e293b', whiteSpace: 'pre-wrap' }}>{comm.content}</div>
                      </div>
                    ))
                  )}
                </div>

                {/* Comment Input Form */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="text"
                    placeholder="결재 관련 의견 또는 보완 필요 사유 등을 입력하세요..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddComment();
                    }}
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px', outline: 'none' }}
                  />
                  <button
                    onClick={handleAddComment}
                    style={{ padding: '8px 14px', background: '#475569', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    의견 등록
                  </button>
                </div>
              </div>

              {/* Reject Reason input */}
              {showRejectInput && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#fffbeb', border: '1px dashed #ca8a04', padding: '12px', borderRadius: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#854d0e' }}>반려 사유 작성 ★</label>
                  <input
                    type="text"
                    required
                    placeholder="예: 예산 검토 필요 또는 품목 재선정 바람"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <button
                      onClick={() => handleReject(selectedDoc.id)}
                      style={{ padding: '5px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      반려 최종완료
                    </button>
                    <button
                      onClick={() => setShowRejectInput(false)}
                      style={{ padding: '5px 12px', background: '#e2e8f0', border: 'none', borderRadius: '4px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              {selectedDoc.status === 'PENDING' && selectedDoc.approverId === userProfile?.id && !showRejectInput && (
                <>
                  <button
                    onClick={() => handleApprove(selectedDoc.id)}
                    style={{ padding: '8px 18px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ✓ 기안 승인
                  </button>
                  <button
                    onClick={() => setShowRejectInput(true)}
                    style={{ padding: '8px 18px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ✕ 기안 반려
                  </button>
                </>
              )}
              <button
                onClick={() => setSelectedDoc(null)}
                style={{ padding: '8px 18px', background: '#e2e8f0', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
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
