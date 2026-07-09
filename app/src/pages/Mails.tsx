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
  scheduledAt?: string; // Future scheduled send date ISO string
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
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // AI Prompt Draft Creator States
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  // Scheduling states
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

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

    const receiver = selectedReceiverId === userProfile.id
      ? userProfile
      : users.find(u => u.id === selectedReceiverId);
    if (!receiver) return;

    const mailBody = editorRef.current ? editorRef.current.innerHTML : contentHTML;
    if (!mailBody || mailBody.trim() === '<br>' || mailBody.trim() === '') {
      alert("쪽지 내용을 입력해 주세요.");
      return;
    }

    const scheduledIso = isScheduled && scheduledAt ? new Date(scheduledAt).toISOString() : '';

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
        createdAt: new Date().toISOString(),
        scheduledAt: scheduledIso || null
      });

      setTitle('');
      setContentHTML('');
      setAttachments([]);
      setIsScheduled(false);
      setScheduledAt('');
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
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const clipboardItems = e.clipboardData.items;
    for (let i = 0; i < clipboardItems.length; i++) {
      if (clipboardItems[i].type.indexOf('image') !== -1) {
        const file = clipboardItems[i].getAsFile();
        if (file) {
          if (file.size > 500 * 1024) {
            alert("500KB 이하의 캡처 이미지만 업로드 가능합니다.");
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            setAttachments(prev => [...prev, {
              name: `clipboard_capture_${Date.now()}.png`,
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
          <tr style="background: #f1f5f9; font-weight: bold; border: 1px solid var(--border-default);">
            <th style="border: 1px solid var(--border-default); padding: 8px;">구분</th>
            <th style="border: 1px solid var(--border-default); padding: 8px;">상세 내역</th>
            <th style="border: 1px solid var(--border-default); padding: 8px;">비고</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid var(--border-default); padding: 8px; height: 24px;"></td>
            <td style="border: 1px solid var(--border-default); padding: 8px;"></td>
            <td style="border: 1px solid var(--border-default); padding: 8px;"></td>
          </tr>
          <tr>
            <td style="border: 1px solid var(--border-default); padding: 8px; height: 24px;"></td>
            <td style="border: 1px solid var(--border-default); padding: 8px;"></td>
            <td style="border: 1px solid var(--border-default); padding: 8px;"></td>
          </tr>
        </tbody>
      </table>
    `;
    document.execCommand('insertHTML', false, tableHTML);
    if (editorRef.current) {
      setContentHTML(editorRef.current.innerHTML);
    }
  };

  const applyMailTemplate = (type: 'work' | 'notice') => {
    let templateHTML = '';
    if (type === 'work') {
      templateHTML = `
        <div style="background: #f8fafc; padding: 16px; border-left: 4px solid #3b82f6; border-radius: 4px; margin: 8px 0; color: var(--text-primary);">
          <h2 style="font-size: 1.15rem; font-weight: bold; margin: 0 0 8px 0; color: #3b82f6;">📁 업무 연락 및 협조 요청</h2>
          수신 부서원 및 제위께 아래 건에 대한 협조를 정중히 부탁드립니다.
        </div>
        
        <h3 style="font-size: 0.95rem; margin-top: 16px; font-weight: bold; color: var(--text-primary);">■ 상세 요청 내용</h3>
        <p style="margin: 4px 0 12px 0; color: var(--text-secondary);">요청 사유 및 기한을 정확히 적어주세요.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px;">
          <thead>
            <tr style="background: #f1f5f9; font-weight: bold; border: 1px solid var(--border-default);">
              <th style="border: 1px solid var(--border-default); padding: 8px; width: 100px;">요청 일시</th>
              <th style="border: 1px solid var(--border-default); padding: 8px;">세부 수행 업무</th>
              <th style="border: 1px solid var(--border-default); padding: 8px; width: 100px;">기한</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid var(--border-default); padding: 8px;">${new Date().toISOString().split('T')[0]}</td>
              <td style="border: 1px solid var(--border-default); padding: 8px;">업무 내용을 입력하세요.</td>
              <td style="border: 1px solid var(--border-default); padding: 8px;">오후 6시까지</td>
            </tr>
          </tbody>
        </table>
        <p><br></p>
      `;
    } else {
      templateHTML = `
        <div style="background: #f1f5f9; padding: 16px; border-left: 4px solid var(--focus-ring); border-radius: 4px; margin: 8px 0; color: var(--text-primary);">
          <h2 style="font-size: 1.15rem; font-weight: bold; margin: 0 0 8px 0; color: var(--focus-ring);">📢 사내 공지 사항</h2>
          임직원 여러분께 사내 주요 소식을 아래와 같이 공지합니다.
        </div>
        
        <h3 style="font-size: 0.95rem; margin-top: 16px; font-weight: bold; color: var(--text-primary);">■ 상세 내용</h3>
        <p style="margin: 4px 0 12px 0; color: var(--text-secondary);">여기에 공지할 본문 내용을 기재하세요.</p>
        
        <blockquote style="border-left: 4px solid var(--border-default); padding-left: 12px; color: var(--text-secondary); font-style: italic; margin: 12px 0;">
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
  const handleAiDraftCreate = () => {
    if (!aiPrompt || !aiPrompt.trim()) {
      alert("AI 초안으로 작성할 쪽지 핵심 내용을 프롬프트 창에 입력해 주세요.");
      return;
    }

    setIsGeneratingDraft(true);
    setTimeout(() => {
      let generatedTitle = `[업무협조] ${aiPrompt.substring(0, 24)}... 관련 안내`;
      if (aiPrompt.includes("검토") || aiPrompt.includes("피드백")) {
        generatedTitle = `[검토요청] 수출 선적 신고서 피드백 및 긴급 수정 검토 협조의 건`;
      } else if (aiPrompt.includes("회의") || aiPrompt.includes("공유")) {
        generatedTitle = `[회의공람] 주간 부서 회의 결과 회고록 전파 및 일정 공유의 건`;
      } else if (aiPrompt.includes("공지") || aiPrompt.includes("알림")) {
        generatedTitle = `[공지] 시스템 서버 긴급 유지보수 조치에 따른 작업 중단 알림`;
      }

      setTitle(generatedTitle);

      const generatedMailHTML = `
        <div style="background: #f0fdf4; padding: 14px; border-left: 4px solid #16a34a; border-radius: 6px; margin-bottom: 16px;">
          <span style="font-weight: 800; color: #166534; font-size: 13.5px;">🤖 AI 메일 초안 핵심 요약</span>
          <p style="font-size: 12.5px; color: #1e3a1e; margin: 6px 0 0 0; line-height: 1.5;">
            본 메일은 <strong>"${aiPrompt}"</strong>에 의거하여 AI 협업 봇이 자동 작성한 공식 본문 서한입니다.<br>
            요청 기한 준수 및 누락 없는 확인을 정중히 권해드립니다.
          </p>
        </div>

        <p>수신 제위,</p>
        <p>안녕하십니까, 금주 예정된 핵심 안건 조율 및 비즈니스 협조 요청에 대한 세부 사항을 다음과 같이 공유드립니다.</p>

        <h3 style="font-size: 0.95rem; margin-top: 18px; color: #16a34a; font-weight: bold;">■ 세부 협조 요청 및 처리 대상</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px;">
          <thead>
            <tr style="background: #f8fafc; font-weight: bold; border: 1px solid var(--border-default);">
              <th style="border: 1px solid var(--border-default); padding: 8px;">주요 협조 필요 업무</th>
              <th style="border: 1px solid var(--border-default); padding: 8px; text-align: center; width: 100px;">수행 주체</th>
              <th style="border: 1px solid var(--border-default); padding: 8px; text-align: center; width: 100px;">마감 기한</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid var(--border-default); padding: 8px; color: #334155;">업무 피드백 세부 내역 작성 및 양식 검토</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: center; color: #334155;">수신 담당자</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: center; color: #334155;">금일 18:00</td>
            </tr>
            <tr>
              <td style="border: 1px solid var(--border-default); padding: 8px; color: #334155;">세관 통관 추가 조치 보완 서류 송부 확인</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: center; color: #334155;">무역팀 담당</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: center; color: #334155;">내주 금요일</td>
            </tr>
          </tbody>
        </table>

        <blockquote style="border-left: 4px solid #16a34a; padding-left: 12px; color: #1e3a1e; font-style: italic; margin: 12px 0; background: #fafafa; padding: 8px;">
          "차질 없는 업무 전개를 위해 기한 내 회신을 요청드립니다."
        </blockquote>
        <br>
        <p style="font-size: 11px; color: var(--text-muted); font-style: italic;">* 위 초안은 프롬프트 요구조건에 부합하도록 격식 있는 비즈니스 문체로 정리되었습니다.</p>
      `;

      if (editorRef.current) {
        editorRef.current.innerHTML = generatedMailHTML;
      }
      setContentHTML(generatedMailHTML);
      setIsGeneratingDraft(false);
      alert("AI가 적어주신 메일 핵심 프롬프트를 번역하여, 제목 및 비즈니스 메일 본문을 자동으로 완성했습니다!");
    }, 2500);
  };

  const handleAiSummarize = () => {
    const rawHTML = editorRef.current ? editorRef.current.innerHTML : contentHTML;
    const textContent = editorRef.current ? editorRef.current.innerText : '';
    if (!textContent || textContent.trim() === '') {
      alert("분석할 쪽지 본문 내용이 없습니다. 내용을 먼저 적어주세요.");
      return;
    }

    setIsAiProcessing(true);
    setTimeout(() => {
      const lines = textContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      let summaryHTML = `
        <div style="background: #eff6ff; padding: 12px; border-left: 4px solid #3b82f6; border-radius: 4px; margin-bottom: 12px; font-size: 13px;">
          <strong>🤖 AI 메일 핵심 요약</strong><br>
          본 메일의 수신 부서 요청 및 전달 건에 대한 핵심 요약 정보입니다. 신속한 업무 조치를 요청드립니다.
        </div>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12.5px;">
          <thead>
            <tr style="background: #f8fafc; font-weight: bold; border-bottom: 2px solid var(--border-default);">
              <th style="border: 1px solid var(--border-default); padding: 6px; width: 50px;">번호</th>
              <th style="border: 1px solid var(--border-default); padding: 6px;">핵심 전달/요청 조치사항</th>
              <th style="border: 1px solid var(--border-default); padding: 6px; text-align: center; width: 80px;">AI 매칭</th>
            </tr>
          </thead>
          <tbody>
      `;

      lines.slice(0, 6).forEach((line, index) => {
        const cleaned = line.replace(/^\d+[\.\s\-]+/, '');
        summaryHTML += `
          <tr>
            <td style="border: 1px solid var(--border-default); padding: 6px; font-weight: bold; color: var(--text-secondary);">${index + 1}</td>
            <td style="border: 1px solid var(--border-default); padding: 6px; color: #334155;">${cleaned}</td>
            <td style="border: 1px solid var(--border-default); padding: 6px; text-align: center;">
              <span style="background: #fee2e2; color: #991b1b; padding: 2px 4px; border-radius: 4px; font-size: 10px; font-weight: bold;">확인요망</span>
            </td>
          </tr>
        `;
      });

      summaryHTML += `
          </tbody>
        </table>
        <br>
        <p style="font-size: 11px; color: var(--text-muted); font-style: italic;">* 원본 작성 내용 상단에 AI 요약 분석이 성공적으로 포함되었습니다.</p>
        <hr style="border: 0; border-top: 1px dashed var(--border-default); margin: 16px 0;" />
      `;

      const merged = summaryHTML + rawHTML;
      if (editorRef.current) {
        editorRef.current.innerHTML = merged;
      }
      setContentHTML(merged);
      setIsAiProcessing(false);
      alert("AI가 쪽지 본문 분석을 완료하여 상단에 요약 배너 및 확인 표를 삽입했습니다!");
    }, 2000);
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
        const calloutHTML = `<div style="background: #f1f5f9; padding: 10px 14px; border-left: 4px solid var(--border-default); border-radius: 4px; margin: 8px 0; font-style: italic; color: var(--text-secondary);">${range.startContainer.textContent}</div><p><br></p>`;
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
      const calloutHTML = `<div style="background: #f1f5f9; padding: 12px; border-left: 4px solid var(--focus-ring); border-radius: 4px; margin: 8px 0; color: #334155;">💡 <b>안내/공지:</b> 내용을 작성하세요...</div><p><br></p>`;
      document.execCommand('insertHTML', false, calloutHTML);
    } else if (command === 'divider') {
      const hrHTML = `<hr style="border: 0; border-top: 1px solid var(--border-default); margin: 16px 0;" /><p><br></p>`;
      document.execCommand('insertHTML', false, hrHTML);
    } else if (command === 'quote') {
      const quoteHTML = `<blockquote style="border-left: 4px solid var(--border-default); padding-left: 12px; color: var(--text-secondary); font-style: italic; margin: 10px 0 10px 12px;">"인용 내용을 작성하세요."</blockquote><p><br></p>`;
      document.execCommand('insertHTML', false, quoteHTML);
    }
    
    if (editorRef.current) {
      setContentHTML(editorRef.current.innerHTML);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>데이터를 불러오는 중...</div>;
  }

  const nowStr = new Date().toISOString();
  // Filter inbox: Hide future scheduled mails from recipients
  const inboxMails = mails.filter(m => m.receiverId === userProfile?.id && (!m.scheduledAt || m.scheduledAt <= nowStr));
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
            setIsScheduled(false);
            setScheduledAt('');
            setIsComposeModalOpen(true);
          }}
        >
          ✍️ 새 쪽지 보내기
        </button>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '8px' }}>
        <button
          onClick={() => { setActiveTab('inbox'); setSelectedMail(null); }}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            fontSize: '13.5px',
            fontWeight: 800,
            cursor: 'pointer',
            color: activeTab === 'inbox' ? 'var(--primary-color)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'inbox' ? '2.5px solid var(--primary-color)' : 'none'
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
            color: activeTab === 'sent' ? 'var(--primary-color)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'sent' ? '2.5px solid var(--primary-color)' : 'none'
          }}
        >
          📤 보낸 쪽지함 ({sentMails.length})
        </button>
      </div>

      {/* Mail List Area */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedMail ? '1.2fr 1.8fr' : '1fr', gap: '20px', minHeight: '400px' }}>
        
        {/* Mails Table Panel */}
        <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', height: 'fit-content' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700 }}>
                <th style={{ padding: '12px', width: '140px' }}>{activeTab === 'inbox' ? '보낸 사람' : '받는 사람'}</th>
                <th style={{ padding: '12px' }}>쪽지 제목</th>
                <th style={{ padding: '12px' }}>발송 일시</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {activeList.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    주고받은 쪽지가 존재하지 않습니다.
                  </td>
                </tr>
              ) : (
                activeList.map(mail => {
                  const isUnread = activeTab === 'inbox' && !mail.isRead;
                  const isFuture = mail.scheduledAt && mail.scheduledAt > nowStr;
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
                      <td style={{ padding: '12px', color: 'var(--text-primary)' }}>
                        {activeTab === 'inbox' ? (
                          mail.senderName === '시스템 알림' ? (
                            <span style={{ color: '#dc2626', fontWeight: 800 }}>🤖 {mail.senderName}</span>
                          ) : mail.senderName
                        ) : mail.receiverName}
                      </td>
                      <td style={{ padding: '12px', color: isUnread ? '#0f172a' : 'var(--text-secondary)' }}>
                        {mail.title}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
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
                            color: isUnread ? '#dc2626' : 'var(--text-secondary)'
                          }}>
                            {isUnread ? '안읽음' : '읽음'}
                          </span>
                        ) : (
                          isFuture ? (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '12px',
                              background: '#e0f2fe',
                              color: '#0369a1'
                            }}>
                              예약대기
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
                          )
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mail Content Reader View */}
        {selectedMail && (
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', height: 'fit-content' }}>
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(selectedMail.createdAt).toLocaleString()}</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '16px', fontWeight: 850, color: 'var(--text-primary)' }}>{selectedMail.title}</h3>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  <span><b>보낸이:</b> {selectedMail.senderName}</span>
                  <span style={{ marginLeft: '12px' }}><b>받는이:</b> {selectedMail.receiverName}</span>
                  {selectedMail.scheduledAt && (
                    <span style={{ marginLeft: '12px', color: '#0369a1', fontWeight: 'bold' }}>
                      ⏰ 예약발송 일시: {new Date(selectedMail.scheduledAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {activeTab === 'inbox' && (
                  <button
                    onClick={() => handleReplyMail(selectedMail)}
                    style={{ padding: '6px 12px', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    답장 쓰기
                  </button>
                )}
                <button
                  onClick={() => setSelectedMail(null)}
                  style={{ padding: '6px 12px', background: 'var(--border-color)', color: 'var(--text-secondary)', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >
                  닫기
                </button>
              </div>
            </div>

            {/* Note Body */}
            <div
              dangerouslySetInnerHTML={{ __html: selectedMail.content }}
              style={{
                fontSize: '13.5px',
                lineHeight: 1.7,
                color: '#334155',
                minHeight: '180px',
                padding: '12px',
                border: '1px solid #f1f5f9',
                borderRadius: '6px',
                background: '#fafafa'
              }}
            />

            {/* Attachments inside Read Panel */}
            {selectedMail.attachments && selectedMail.attachments.length > 0 && (
              <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>📎 첨부파일 ({selectedMail.attachments.length})</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {selectedMail.attachments.map((file, fIdx) => (
                    <div key={fIdx} style={{ border: '1px solid var(--border-default)', borderRadius: '6px', padding: '6px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', width: '100px' }}>
                      {file.type.startsWith('image/') ? (
                        <img
                          src={file.data}
                          alt={file.name}
                          onClick={() => setPreviewImageUrl(file.data)}
                          style={{ width: '100%', height: '60px', objectFit: 'cover', borderRadius: '4px', cursor: 'zoom-in' }}
                        />
                      ) : (
                        <a href={file.data} download={file.name} style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', textDecoration: 'none', color: 'var(--text-secondary)' }}>📄</a>
                      )}
                      <span style={{ fontSize: '9px', color: 'var(--text-secondary)', width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'center' }} title={file.name}>
                        {file.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compose Mail Popup Modal */}
      {isComposeModalOpen && (
        <div
          onPaste={handlePaste}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '700px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            
            {/* Drag drop overlay helper */}
            {isDraggingFile && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(42, 162, 177, 0.15)', border: '4px dashed var(--focus-ring)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span style={{ fontSize: '18px', fontWeight: 900, color: 'var(--focus-ring)', background: '#fff', padding: '12px 24px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  📥 파일을 여기에 놓아 첨부 (500KB 이하)
                </span>
              </div>
            )}

            <div style={{ padding: '16px 20px', background: 'var(--primary-color)', color: '#fff', fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📣 새 쪽지 보내기</span>
              <button onClick={() => setIsComposeModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSendMail} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '80vh', overflowY: 'auto' }}>
              
              {/* Template triggers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>쪽지 양식 템플릿 로드</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => applyMailTemplate('work')}
                    style={{ flex: 1, padding: '8px 0', borderRadius: '6px', border: '1px solid var(--border-default)', background: '#fff', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', fontSize: '12.5px' }}
                  >
                    업무 연락 양식 적용
                  </button>
                  <button
                    type="button"
                    onClick={() => applyMailTemplate('notice')}
                    style={{ flex: 1, padding: '8px 0', borderRadius: '6px', border: '1px solid var(--border-default)', background: '#fff', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', fontSize: '12.5px' }}
                  >
                    공지 사항 양식 적용
                  </button>
                </div>
              </div>

              {/* AI prompt draft generator */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f0fdf4', padding: '14px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Base 🪄 AI 쪽지 초안 자동 작성 (프롬프트 입력)
                </span>
                <p style={{ fontSize: '11px', color: '#166534', margin: 0 }}>
                  보낼 사람의 정보와 업무 조치 사항, 기한을 적으시면 AI가 정식 메일 양식 및 요청 과제 표를 생성해 드립니다.
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="text"
                    placeholder="예: 수출 신고서 피드백 오늘 오후 6시까지 검토 요청."
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '12.5px', outline: 'none', backgroundColor: '#fff' }}
                  />
                  <button
                    type="button"
                    onClick={handleAiDraftCreate}
                    style={{ padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12.2px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    🪄 초안 생성
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>받는 사람 ★</label>
                <select
                  required
                  value={selectedReceiverId}
                  onChange={e => setSelectedReceiverId(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', backgroundColor: 'white' }}
                >
                  <option value="">수신자를 선택해 주세요</option>
                  <option value={userProfile?.id}>📝 나에게 쓰기 (내게 메모 보내기)</option>
                  {addressableUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.department || '부서'} / {u.position || '직급'})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>제목 ★</label>
                <input
                  type="text"
                  required
                  placeholder="제목을 입력하세요"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                />
              </div>

              {/* Scheduled Send options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 'bold', color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isScheduled}
                    onChange={e => setIsScheduled(e.target.checked)}
                  />
                  ⏰ 예약 알림 전송 설정
                </label>
                {isScheduled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>발송 예약 일시</label>
                    <input
                      type="datetime-local"
                      required={isScheduled}
                      value={scheduledAt}
                      onChange={e => setScheduledAt(e.target.value)}
                      style={{ padding: '8px 12px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                    />
                  </div>
                )}
              </div>

              {/* Rich Text Editor */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>내용 ★</label>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f8fafc', border: '1px solid var(--border-default)', borderBottom: 'none', borderTopLeftRadius: '6px', borderTopRightRadius: '6px' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => format('bold')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid var(--border-default)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>가</button>
                    <button type="button" onClick={() => format('italic')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid var(--border-default)', borderRadius: '4px', cursor: 'pointer', fontStyle: 'italic', fontSize: '12px' }}><i>가</i></button>
                    <button type="button" onClick={() => format('underline')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid var(--border-default)', borderRadius: '4px', cursor: 'pointer', textDecoration: 'underline', fontSize: '12px' }}><u>가</u></button>
                    <button type="button" onClick={insertTable} style={{ padding: '4px 10px', background: '#fff', border: '1px solid var(--border-default)', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      田 표 삽입
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleAiSummarize}
                    style={{ padding: '4px 10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    🤖 AI 메일 요약 정리
                  </button>
                </div>

                <div
                  contentEditable
                  ref={editorRef}
                  onKeyDown={handleEditorKeyDown}
                  onInput={handleEditorInput}
                  style={{
                    minHeight: '200px',
                    border: '1px solid var(--border-default)',
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
                    top: '110px',
                    left: '12px',
                    background: '#fff',
                    border: '1px solid var(--border-default)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    borderRadius: '8px',
                    zIndex: 10000,
                    width: '180px',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '4px 0'
                  }}>
                    <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', borderBottom: '1px solid #f1f5f9' }}>블록 명령어 선택</div>
                    <button type="button" onClick={() => handleSelectSlashCommand('table')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12px', cursor: 'pointer', display: 'flex', gap: '8px', color: 'var(--text-primary)' }}>
                      <span>田</span> <b>표 삽입</b>
                    </button>
                    <button type="button" onClick={() => handleSelectSlashCommand('callout')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12px', cursor: 'pointer', display: 'flex', gap: '8px', color: 'var(--text-primary)' }}>
                      <span>💡</span> <b>안내/공지 상자</b>
                    </button>
                    <button type="button" onClick={() => handleSelectSlashCommand('divider')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12px', cursor: 'pointer', display: 'flex', gap: '8px', color: 'var(--text-primary)' }}>
                      <span>➖</span> <b>구분선</b>
                    </button>
                    <button type="button" onClick={() => handleSelectSlashCommand('quote')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12px', cursor: 'pointer', display: 'flex', gap: '8px', color: 'var(--text-primary)' }}>
                      <span>✍️</span> <b>인용구 블록</b>
                    </button>
                  </div>
                )}
              </div>

              {/* Attachments List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>📎 첨부파일 목록</span>
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  style={{ fontSize: '12px' }}
                />
                {attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                    {attachments.map((file, idx) => (
                      <div key={idx} style={{ position: 'relative', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '4px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', width: '80px' }}>
                        {file.type.startsWith('image/') ? (
                          <img src={file.data} alt={file.name} style={{ width: '100%', height: '50px', objectFit: 'cover', borderRadius: '2px' }} />
                        ) : (
                          <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: 'var(--text-secondary)' }}>📄</div>
                        )}
                        <span style={{ fontSize: '8px', color: 'var(--text-secondary)', width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'center' }}>
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(idx)}
                          style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', border: 'none', color: '#fff', borderRadius: '50%', width: '16px', height: '16px', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button
                  type="submit"
                  disabled={isSending}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px 0', fontWeight: 800 }}
                >
                  {isSending ? '보내는 중...' : '보내기'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsComposeModalOpen(false)}
                  style={{ flex: 1, padding: '12px 0', background: 'var(--border-default)', color: 'var(--text-primary)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                >
                  취소
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img src={previewImageUrl} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px' }} />
        </div>
      )}

      {/* AI Processing overlay loader */}
      {isAiProcessing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', width: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '32px' }}>🤖</span>
            <span style={{ fontSize: '14px', fontWeight: 850, color: 'var(--text-primary)', textAlign: 'center' }}>
              AI가 쪽지 본문을 정밀 분석하여 요약 및 액션 아이템 테이블을 생성 중입니다...
            </span>
            <div style={{ width: '100%', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                top: 0, left: 0, bottom: 0,
                width: '60%',
                background: 'var(--focus-ring)',
                borderRadius: '3px',
                animation: 'pulse 1.5s infinite ease-in-out'
              }}></div>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>약 2초의 시간이 소요됩니다.</span>
          </div>
        </div>
      )}

      {/* AI Draft Generating overlay loader */}
      {isGeneratingDraft && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', width: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '32px' }}>🪄</span>
            <span style={{ fontSize: '14px', fontWeight: 850, color: '#166534', textAlign: 'center' }}>
              AI가 요구사항을 해석하여 격식 있는 쪽지 초안을 작성 중입니다...
            </span>
            <div style={{ width: '100%', height: '6px', background: '#dcfce7', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                top: 0, left: 0, bottom: 0,
                width: '60%',
                background: '#16a34a',
                borderRadius: '3px',
                animation: 'pulse 1.5s infinite ease-in-out'
              }}></div>
            </div>
            <span style={{ fontSize: '11px', color: '#166534' }}>약 2.5초의 시간이 소요됩니다.</span>
          </div>
        </div>
      )}

    </div>
  );
};
