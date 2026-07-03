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

interface Mail {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  title: string;
  content: string; // HTML content
  isRead: boolean;
  createdAt: string;
  taskId?: string;
  attachments?: Attachment[];
}

export const Mails: React.FC = () => {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [mails, setMails] = useState<Mail[]>([]);
  const [activeTab, setActiveTab] = useState<'inbox' | 'sent'>('inbox');
  const [loading, setLoading] = useState(true);

  // Compose Form State (Inside Modal)
  const [isComposeModalOpen, setIsComposeModalOpen] = useState(false);
  const [selectedReceiverId, setSelectedReceiverId] = useState('');
  const [title, setTitle] = useState('');
  const [contentHTML, setContentHTML] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Mail Detail State
  const [selectedMail, setSelectedMail] = useState<Mail | null>(null);

  // Drag and Drop & Clipboard states
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Floating Slash Command Menu state
  const [showSlashMenu, setShowSlashMenu] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);

  const fetchMailsData = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersList: User[] = [];
      usersSnap.forEach(d => {
        usersList.push({ id: d.id, ...d.data() } as User);
      });
      setUsers(usersList);

      const mailsSnap = await getDocs(collection(db, 'mails'));
      const mailsList: Mail[] = [];
      mailsSnap.forEach(d => {
        mailsList.push({ id: d.id, ...d.data() } as Mail);
      });
      mailsList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setMails(mailsList);
    } catch (e) {
      console.error("Failed to load mail data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMailsData();
  }, []);

  const handleSendMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    if (!selectedReceiverId) {
      alert("받는 사람을 지정해 주세요.");
      return;
    }

    const receiver = users.find(u => u.id === selectedReceiverId);
    if (!receiver) return;

    const mailBody = editorRef.current ? editorRef.current.innerHTML : contentHTML;
    if (!mailBody || mailBody.trim() === '<br>' || mailBody.trim() === '') {
      alert("쪽지 내용을 입력해 주세요.");
      return;
    }

    setIsSending(true);
    try {
      await addDoc(collection(db, 'mails'), {
        senderId: userProfile.id,
        senderName: userProfile.name,
        receiverId: selectedReceiverId,
        receiverName: receiver.name,
        title,
        content: mailBody,
        isRead: false,
        attachments,
        createdAt: new Date().toISOString()
      });

      setTitle('');
      setContentHTML('');
      setAttachments([]);
      if (editorRef.current) editorRef.current.innerHTML = '';
      setSelectedReceiverId('');
      setIsComposeModalOpen(false);
      setActiveTab('sent');
      fetchMailsData();
      alert("쪽지가 발송되었습니다.");
    } catch (err) {
      console.error(err);
      alert("발송에 실패했습니다.");
    } finally {
      setIsSending(false);
    }
  };

  const processFiles = (files: FileList) => {
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
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== index));
  };

  // Drag & Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = () => {
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  // Clipboard Paste Handler (Ctrl+V screen captures)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          if (file.size > 500 * 1024) {
            alert("캡처 파일 크기가 너무 큽니다. 500KB 이하로 복사해 주세요.");
            continue;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            setAttachments(prev => [...prev, {
              name: `screenshot_${Date.now()}.png`,
              size: file.size,
              data: reader.result as string,
              type: file.type
            }]);
          };
          reader.readAsDataURL(file);
          e.preventDefault();
        }
      }
    }
  };

  const handleReadMail = async (mail: Mail) => {
    setSelectedMail(mail);
    if (!mail.isRead && mail.receiverId === userProfile?.id) {
      try {
        await updateDoc(doc(db, 'mails', mail.id), { isRead: true });
        setMails(prev => prev.map(m => m.id === mail.id ? { ...m, isRead: true } : m));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleReplyMail = (mail: Mail) => {
    const replyReceiverId = mail.senderId === 'SYSTEM' ? '' : mail.senderId;
    if (!replyReceiverId) {
      alert("시스템 알림메일에는 답장하실 수 없습니다.");
      return;
    }
    setSelectedReceiverId(replyReceiverId);
    setTitle(`RE: ${mail.title.replace(/^RE:\s*/i, '')}`);
    
    const replyIntro = `<br><br><p>----- Original Message -----</p><p><b>From:</b> ${mail.senderName}</p><p><b>Date:</b> ${new Date(mail.createdAt).toLocaleString()}</p><br>${mail.content}`;
    setContentHTML(replyIntro);
    
    setSelectedMail(null);
    setIsComposeModalOpen(true);
    
    // Set html after modal mounts and editorRef is resolved
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = replyIntro;
      }
    }, 100);
  };

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

  // Mail corporate templates
  const applyMailTemplate = (templateType: 'work' | 'notice') => {
    let templateHTML = '';
    if (templateType === 'work') {
      templateHTML = `
        <h2 style="font-size: 1.15rem; font-weight: bold; border-bottom: 2px solid #334155; padding-bottom: 6px; color: #1e293b;">업무 연락 협조 요청</h2>
        <p style="margin: 8px 0; color: #475569;">다음과 같이 업무 협조 및 자료 제출을 요청드리오니 검토 후 회신 바랍니다.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
          <tbody>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px; background: #f8fafc; font-weight: bold; width: 120px; color: #475569;">요청 사항</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px; color: #334155;">예: 상반기 무역 실적 세부 원장 및 증빙 제출</td>
            </tr>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px; background: #f8fafc; font-weight: bold; color: #475569;">제출 기한</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px; color: #dc2626; font-weight: bold;">2026년 7월 10일 (금) 18:00까지</td>
            </tr>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px; background: #f8fafc; font-weight: bold; color: #475569;">비고</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px; color: #334155;">지연 사유 발생 시 유선으로 사전 연락바랍니다.</td>
            </tr>
          </tbody>
        </table>
        <p><br></p>
      `;
    } else {
      templateHTML = `
        <div style="background: #f1f5f9; padding: 16px; border-left: 4px solid #4f46e5; border-radius: 4px; margin: 8px 0; color: #1e293b;">
          <h2 style="font-size: 1.15rem; font-weight: bold; margin: 0 0 8px 0; color: #4f46e5;">📢 사내 공지 사항</h2>
          임직원 여러분께 사내 주요 소식을 아래와 같이 공지합니다.
        </div>
        
        <h3 style="font-size: 0.95rem; margin-top: 16px; font-weight: bold; color: #1e293b;">■ 상세 내용</h3>
        <p style="margin: 4px 0 12px 0; color: #475569;">여기에 공지할 본문 내용을 기재하세요.</p>
        
        <blockquote style="border-left: 4px solid #cbd5e1; padding-left: 12px; color: #64748b; font-style: italic; margin: 12px 0;">
          "신속히 전파하여 주시기 바라며, 협조 감사드립니다."
        </blockquote>
        <p><br></p>
      `;
    }

    if (editorRef.current) {
      editorRef.current.innerHTML = templateHTML;
      setContentHTML(templateHTML);
    }
  };

  // Keyboard Slash menu & Markdown shortcuts parser
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
      const calloutHTML = `<div style="background: #f1f5f9; padding: 12px; border-left: 4px solid #4f46e5; border-radius: 4px; margin: 8px 0; color: #334155;">💡 <b>안내/공지:</b> 내용을 작성하세요...</div><p><br></p>`;
      document.execCommand('insertHTML', false, calloutHTML);
    } else if (command === 'divider') {
      const hrHTML = `<hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 16px 0;" /><p><br></p>`;
      document.execCommand('insertHTML', false, hrHTML);
    } else if (command === 'quote') {
      const quoteHTML = `<blockquote style="border-left: 4px solid #cbd5e1; padding-left: 12px; color: #64748b; font-style: italic; margin: 10px 0 10px 12px;">"인용 내용을 작성하세요."</blockquote><p><br></p>`;
      document.execCommand('insertHTML', false, quoteHTML);
    }
    
    if (editorRef.current) {
      setContentHTML(editorRef.current.innerHTML);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>데이터를 불러오는 중...</div>;
  }

  const inboxMails = mails.filter(m => m.receiverId === userProfile?.id);
  const sentMails = mails.filter(m => m.senderId === userProfile?.id);
  const activeList = activeTab === 'inbox' ? inboxMails : sentMails;
  const addressableUsers = users.filter(u => u.id !== userProfile?.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      
      {/* Header with Compose Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 850, color: 'var(--primary-color)', margin: 0 }}>✉️ 사내 메일 및 알림</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>동료 직원들과 쪽지를 주고받고, 시스템 업무 알림을 일괄 모니터링하는 소통 창구입니다.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setAttachments([]);
            setTitle('');
            setContentHTML('');
            setSelectedReceiverId('');
            setIsComposeModalOpen(true);
          }}
        >
          ✍️ 새 쪽지 보내기
        </button>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', gap: '8px' }}>
        <button
          onClick={() => { setActiveTab('inbox'); setSelectedMail(null); }}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            fontSize: '13.5px',
            fontWeight: 800,
            cursor: 'pointer',
            color: activeTab === 'inbox' ? '#4f46e5' : '#64748b',
            borderBottom: activeTab === 'inbox' ? '2.5px solid #4f46e5' : 'none'
          }}
        >
          📥 받은 쪽지함 ({inboxMails.filter(m => !m.isRead).length} 안읽음 / {inboxMails.length} 전체)
        </button>
        <button
          onClick={() => { setActiveTab('sent'); setSelectedMail(null); }}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            fontSize: '13.5px',
            fontWeight: 800,
            cursor: 'pointer',
            color: activeTab === 'sent' ? '#4f46e5' : '#64748b',
            borderBottom: activeTab === 'sent' ? '2.5px solid #4f46e5' : 'none'
          }}
        >
          📤 보낸 쪽지함 ({sentMails.length})
        </button>
      </div>

      {/* Main Mailbox List Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedMail ? '1fr 1fr' : '1fr', gap: '20px', alignItems: 'stretch' }}>
        
        {/* Mails Table List */}
        <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left', fontWeight: 'bold' }}>
                  <th style={{ padding: '12px' }}>{activeTab === 'inbox' ? '보낸 사람' : '받는 사람'}</th>
                  <th style={{ padding: '12px' }}>쪽지 제목</th>
                  <th style={{ padding: '12px' }}>발송 일시</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {activeList.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                      주고받은 쪽지가 존재하지 않습니다.
                    </td>
                  </tr>
                ) : (
                  activeList.map(mail => {
                    const isUnread = activeTab === 'inbox' && !mail.isRead;
                    return (
                      <tr
                        key={mail.id}
                        onClick={() => handleReadMail(mail)}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer',
                          backgroundColor: selectedMail?.id === mail.id ? '#f0f2ff' : isUnread ? '#f8fafc' : 'transparent',
                          fontWeight: isUnread ? 'bold' : 'normal'
                        }}
                        onMouseEnter={e => {
                          if (selectedMail?.id !== mail.id) {
                            e.currentTarget.style.backgroundColor = '#f8fafc';
                          }
                        }}
                        onMouseLeave={e => {
                          if (selectedMail?.id !== mail.id) {
                            e.currentTarget.style.backgroundColor = isUnread ? '#f8fafc' : 'transparent';
                          }
                        }}
                      >
                        <td style={{ padding: '12px', color: '#1e293b' }}>
                          {activeTab === 'inbox' ? (
                            mail.senderName === '시스템 알림' ? (
                              <span style={{ color: '#dc2626', fontWeight: 800 }}>🤖 {mail.senderName}</span>
                            ) : mail.senderName
                          ) : mail.receiverName}
                        </td>
                        <td style={{ padding: '12px', color: isUnread ? '#0f172a' : '#475569' }}>
                          {mail.title}
                        </td>
                        <td style={{ padding: '12px', color: '#94a3b8', fontSize: '12px' }}>
                          {new Date(mail.createdAt).toLocaleString()}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {activeTab === 'inbox' ? (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '12px',
                              background: isUnread ? '#fee2e2' : '#f1f5f9',
                              color: isUnread ? '#dc2626' : '#64748b'
                            }}>
                              {isUnread ? '안읽음' : '읽음'}
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '12px',
                              background: mail.isRead ? '#d1fae5' : '#fef3c7',
                              color: mail.isRead ? '#065f46' : '#d97706'
                            }}>
                              {mail.isRead ? '상대방읽음' : '읽지않음'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mail View Details Panel */}
        {selectedMail && (
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>
                {selectedMail.senderId === 'SYSTEM' ? '시스템 공지' : '사내 쪽지'}
              </span>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 850, color: '#0f172a', margin: '8px 0 10px 0' }}>{selectedMail.title}</h3>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748b' }}>
                <div>
                  <span><strong>발신:</strong> {selectedMail.senderName}</span>
                  <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
                  <span><strong>수신:</strong> {selectedMail.receiverName}</span>
                </div>
                <div>
                  {new Date(selectedMail.createdAt).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Message Body */}
            <div
              dangerouslySetInnerHTML={{ __html: selectedMail.content }}
              style={{
                flex: 1,
                minHeight: '180px',
                padding: '16px',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '13.5px',
                lineHeight: 1.6,
                color: '#334155',
                overflowX: 'auto'
              }}
            />

            {/* View/Preview Attachments */}
            {selectedMail.attachments && selectedMail.attachments.length > 0 && (
              <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '8px' }}>📎 첨부파일 ({selectedMail.attachments.length}개)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  {selectedMail.attachments.map((file, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px' }}>
                      {file.type.startsWith('image/') ? (
                        <img
                          src={file.data}
                          alt={file.name}
                          onClick={() => setPreviewImageUrl(file.data)}
                          style={{ width: '60px', height: '60px', borderRadius: '4px', objectFit: 'cover', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                        />
                      ) : (
                        <div style={{ width: '60px', height: '60px', borderRadius: '4px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold', color: '#475569' }}>
                          FILE
                        </div>
                      )}
                      <a
                        href={file.data}
                        download={file.name}
                        style={{ fontSize: '11px', color: '#4f46e5', fontWeight: 700, textDecoration: 'none', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title="다운로드"
                      >
                        📥 {file.name}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              {selectedMail.senderId !== 'SYSTEM' && selectedMail.senderId !== userProfile?.id && (
                <button
                  onClick={() => handleReplyMail(selectedMail)}
                  style={{ padding: '8px 16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  ↩ 답장 쓰기
                </button>
              )}
              <button
                onClick={() => setSelectedMail(null)}
                style={{ padding: '8px 16px', background: '#cbd5e1', color: '#1e293b', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                닫기
              </button>
            </div>

          </div>
        )}

      </div>

      {/* Compose Mail Pop-up Modal Window */}
      {isComposeModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '640px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', background: '#4f46e5', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 800 }}>✍️ 새 쪽지 보내기</span>
              <button onClick={() => setIsComposeModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            
            <form onSubmit={handleSendMail} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '80vh', overflowY: 'auto' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>쪽지 양식 템플릿 로드</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => applyMailTemplate('work')}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      color: '#475569',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '12.5px'
                    }}
                  >
                    업무 연락 양식 적용
                  </button>
                  <button
                    type="button"
                    onClick={() => applyMailTemplate('notice')}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      color: '#475569',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '12.5px'
                    }}
                  >
                    공지 사항 양식 적용
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>받는 사람 ★</label>
                <select
                  required
                  value={selectedReceiverId}
                  onChange={e => setSelectedReceiverId(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none', backgroundColor: 'white' }}
                >
                  <option value="">수신자를 선택해 주세요</option>
                  {addressableUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.department || '부서'} / {u.position || '직급'})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>제목 ★</label>
                <input
                  type="text"
                  required
                  placeholder="제목을 입력하세요"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                />
              </div>

              {/* Rich Text Editor */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>내용 ★</label>
                
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
                  onKeyDown={handleEditorKeyDown}
                  onInput={handleEditorInput}
                  onPaste={handlePaste}
                  style={{
                    minHeight: '220px',
                    border: '1px solid #cbd5e1',
                    borderBottomLeftRadius: '6px',
                    borderBottomRightRadius: '6px',
                    padding: '12px',
                    outline: 'none',
                    backgroundColor: '#fff',
                    overflowY: 'auto',
                    fontSize: '13.5px',
                    lineHeight: 1.7
                  }}
                />

                {/* Floating Slash Quick Command Menu */}
                {showSlashMenu && (
                  <div style={{
                    position: 'absolute',
                    top: '300px',
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
                    <button type="button" onClick={() => handleSelectSlashCommand('table')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12.5px', cursor: 'pointer', display: 'flex', gap: '8px', color: '#1e293b' }}>
                      <span>田</span> <b>표 삽입</b>
                    </button>
                    <button type="button" onClick={() => handleSelectSlashCommand('callout')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12.5px', cursor: 'pointer', display: 'flex', gap: '8px', color: '#1e293b' }}>
                      <span>💡</span> <b>콜아웃 상자</b>
                    </button>
                    <button type="button" onClick={() => handleSelectSlashCommand('divider')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12.5px', cursor: 'pointer', display: 'flex', gap: '8px', color: '#1e293b' }}>
                      <span>➖</span> <b>구분선</b>
                    </button>
                    <button type="button" onClick={() => handleSelectSlashCommand('quote')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12.5px', cursor: 'pointer', display: 'flex', gap: '8px', color: '#1e293b' }}>
                      <span>✍️</span> <b>인용구 블록</b>
                    </button>
                  </div>
                )}
              </div>

              {/* Drag & Drop File Upload */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  background: isDraggingFile ? '#eff6ff' : '#f8fafc',
                  border: isDraggingFile ? '2px dashed #3b82f6' : '1px dashed #cbd5e1',
                  padding: '16px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  transition: 'all 0.15s'
                }}
              >
                <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <span>📁 파일을 드래그하여 놓거나 클릭하여 선택</span>
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>에디터 내부로 이미지를 캡처 후 붙여넣기(Ctrl+V) 할 수 있습니다. (개당 최대 500KB)</div>
                {attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px', justifyContent: 'center' }}>
                    {attachments.map((file, idx) => (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', position: 'relative' }}>
                        {file.type.startsWith('image/') ? (
                          <img
                            src={file.data}
                            alt={file.name}
                            onClick={() => setPreviewImageUrl(file.data)}
                            style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover', cursor: 'pointer' }}
                          />
                        ) : (
                          <div style={{ width: '40px', height: '40px', borderRadius: '4px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold', color: '#64748b' }}>
                            FILE
                          </div>
                        )}
                        <span style={{ fontSize: '10px', maxWidth: '80px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={file.name}>{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(idx)}
                          style={{ position: 'absolute', top: '-4px', right: '-4px', border: 'none', background: '#ef4444', color: '#fff', borderRadius: '50%', width: '14px', height: '14px', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="submit"
                  disabled={isSending}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px 0', fontWeight: 800 }}
                >
                  {isSending ? '쪽지 보내는 중...' : '보내기'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsComposeModalOpen(false)}
                  style={{ flex: 1, padding: '12px 0', background: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                >
                  취소
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Image Preview Overlay Modal */}
      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
            padding: '20px'
          }}
        >
          <img
            src={previewImageUrl}
            alt="Preview"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
            }}
          />
        </div>
      )}

    </div>
  );
};
