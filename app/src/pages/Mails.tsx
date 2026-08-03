import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { User } from '../types';
import { isOperationalUser } from '../utils/userUtils';
import { previewFile } from '../components/FilePreviewModal';

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
  isImportant?: boolean;
  ccUserIds?: string[];
  ccNames?: string[];
}

export const Mails: React.FC = () => {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [mails, setMails] = useState<Mail[]>([]);
  const [loading, setLoading] = useState(true);

  // 3-Pane Groupware Folder & Multi-Select States
  const [selectedFolder, setSelectedFolder] = useState<'all' | 'unread' | 'important' | 'sent' | 'system'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMailIds, setSelectedMailIds] = useState<string[]>([]);

  // Compose Form State (Inside Modal)
  const [isComposeModalOpen, setIsComposeModalOpen] = useState(false);
  const [selectedReceiverId, setSelectedReceiverId] = useState('');
  const [selectedCcUserIds, setSelectedCcUserIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [contentHTML, setContentHTML] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // AI Prompt Draft Creator States
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  // Scheduling & Importance states
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [isImportant, setIsImportant] = useState(false);

  // Task Auto Creation states
  const [createTaskOption, setCreateTaskOption] = useState(false);
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskType, setTaskType] = useState('DAILY');
  const [taskImportance, setTaskImportance] = useState('B');
  const [taskUrgency, setTaskUrgency] = useState(5);

  // Mail Detail State
  const [selectedMail, setSelectedMail] = useState<Mail | null>(null);

  // Drag and Drop & Clipboard states
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Floating Slash Command Menu state
  const [showSlashMenu, setShowSlashMenu] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);

  // Modaless states for Draggable Compose Window
  const [composeWindowPosition, setComposeWindowPosition] = useState({ x: 100, y: 100 });
  const [isComposeWindowMinimized, setIsComposeWindowMinimized] = useState(false);

  const handleComposeHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Buttons or inputs shouldn't trigger drag
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT') {
      return;
    }
    const startX = e.clientX - composeWindowPosition.x;
    const startY = e.clientY - composeWindowPosition.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setComposeWindowPosition({
        x: moveEvent.clientX - startX,
        y: moveEvent.clientY - startY
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleDeleteMail = async (mailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("이 쪽지를 정말로 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'mails', mailId));
      alert("쪽지가 삭제되었습니다.");
      if (selectedMail?.id === mailId) {
        setSelectedMail(null);
      }
      fetchMailsData();
    } catch (err) {
      console.error("Failed to delete mail:", err);
      alert("삭제에 실패했습니다.");
    }
  };

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

    const isAllUsers = selectedReceiverId === 'ALL_USERS';
    const targetReceivers = isAllUsers
      ? users.filter(u => u.id !== userProfile.id)
      : [selectedReceiverId === userProfile.id ? userProfile : users.find(u => u.id === selectedReceiverId)].filter(Boolean);

    if (targetReceivers.length === 0) {
      alert("수신 대상자가 존재하지 않습니다.");
      return;
    }

    const mailBody = editorRef.current ? editorRef.current.innerHTML : contentHTML;
    if (!mailBody || mailBody.trim() === '<br>' || mailBody.trim() === '') {
      alert("쪽지 내용을 입력해 주세요.");
      return;
    }

    const scheduledIso = isScheduled && scheduledAt ? new Date(scheduledAt).toISOString() : '';
    const finalTitle = isImportant ? `[⭐ 중요] ${title}` : title;

    const ccUsers = users.filter(u => selectedCcUserIds.includes(u.id));
    const ccUserIds = ccUsers.map(u => u.id);
    const ccNames = ccUsers.map(u => u.name);

    setIsSending(true);
    try {
      // Direct receivers + CC receivers combined for delivery list
      const allDeliveryReceivers = [
        ...targetReceivers,
        ...ccUsers.filter(cc => !targetReceivers.some(r => r?.id === cc.id))
      ];

      for (const receiver of allDeliveryReceivers) {
        if (!receiver) continue;
        let createdTaskId = '';

        if (createTaskOption && targetReceivers.some(r => r?.id === receiver.id)) {
          const plainTextBody = editorRef.current ? (editorRef.current.innerText || '') : '';
          const taskDoc = {
            title: `[쪽지 업무] ${finalTitle}`,
            description: `${plainTextBody}\n\n------------------------------------\n✉️ 발송 쪽지 연동 업무 (발신자: ${userProfile.name})`,
            status: 'PENDING',
            type: taskType || 'DAILY',
            scheduleType: 'SELF',
            importance: taskImportance || 'B',
            urgency: taskUrgency || 5,
            quadrant: taskImportance === 'A' ? (taskUrgency >= 4 ? 'Q1' : 'Q2') : (taskUrgency >= 4 ? 'Q3' : 'Q4'),
            assigneeId: receiver.id,
            assigneeName: receiver.name,
            createdBy: userProfile.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            dueDate: taskDueDate || null
          };
          const taskRef = await addDoc(collection(db, 'tasks'), taskDoc);
          createdTaskId = taskRef.id;
        }

        await addDoc(collection(db, 'mails'), {
          senderId: userProfile.id,
          senderName: userProfile.name,
          receiverId: receiver.id,
          receiverName: receiver.name,
          ccUserIds,
          ccNames,
          title: finalTitle,
          content: mailBody,
          isRead: false,
          isImportant,
          attachments,
          createdAt: new Date().toISOString(),
          scheduledAt: scheduledIso || null,
          taskId: createdTaskId || null,
          type: createTaskOption ? 'TASK_DELEGATED' : 'GENERAL'
        });
      }

      setTitle('');
      setContentHTML('');
      setAttachments([]);
      setSelectedCcUserIds([]);
      setIsScheduled(false);
      setScheduledAt('');
      setIsImportant(false);
      setCreateTaskOption(false);
      setTaskDueDate('');
      setTaskType('DAILY');
      setTaskImportance('B');
      setTaskUrgency(5);
      if (editorRef.current) editorRef.current.innerHTML = '';
      setSelectedReceiverId('');
      setIsComposeModalOpen(false);
      setSelectedFolder('sent');
      fetchMailsData();
      alert(createTaskOption ? "✅ 쪽지 발송 및 신규 업무 할당이 완료되었습니다." : "쪽지가 발송되었습니다.");
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

  const handleForwardMail = (mail: Mail) => {
    setSelectedReceiverId('');
    setTitle(`FW: ${mail.title.replace(/^(RE|FW):\s*/i, '')}`);
    const forwardIntro = `<br><br><p>----- Forwarded Message -----</p><p><b>From:</b> ${mail.senderName}</p><p><b>To:</b> ${mail.receiverName}</p><p><b>Date:</b> ${new Date(mail.createdAt).toLocaleString()}</p><br>${mail.content}`;
    setContentHTML(forwardIntro);
    setAttachments(mail.attachments || []);
    setIsComposeModalOpen(true);
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = forwardIntro;
      }
    }, 100);
  };

  const handleToggleImportant = async (mail: Mail) => {
    const updatedStatus = !mail.isImportant;
    try {
      await updateDoc(doc(db, 'mails', mail.id), { isImportant: updatedStatus });
      setMails(prev => prev.map(m => m.id === mail.id ? { ...m, isImportant: updatedStatus } : m));
      if (selectedMail?.id === mail.id) {
        setSelectedMail(prev => prev ? { ...prev, isImportant: updatedStatus } : null);
      }
    } catch (e) {
      console.error("Failed to update importance:", e);
    }
  };

  const handleToggleSelectMail = (mailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedMailIds(prev =>
      prev.includes(mailId) ? prev.filter(id => id !== mailId) : [...prev, mailId]
    );
  };

  const handleBulkMarkRead = async () => {
    if (selectedMailIds.length === 0) return;
    try {
      await Promise.all(
        selectedMailIds.map(id => updateDoc(doc(db, 'mails', id), { isRead: true }))
      );
      setMails(prev => prev.map(m => selectedMailIds.includes(m.id) ? { ...m, isRead: true } : m));
      if (selectedMail && selectedMailIds.includes(selectedMail.id)) {
        setSelectedMail(prev => prev ? { ...prev, isRead: true } : null);
      }
      setSelectedMailIds([]);
    } catch (e) {
      console.error("Bulk mark read error:", e);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedMailIds.length === 0) return;
    if (!window.confirm(`선택한 ${selectedMailIds.length}개의 메일을 삭제하시겠습니까?`)) return;
    try {
      await Promise.all(
        selectedMailIds.map(id => deleteDoc(doc(db, 'mails', id)))
      );
      alert(`${selectedMailIds.length}개의 메일이 삭제되었습니다.`);
      setMails(prev => prev.filter(m => !selectedMailIds.includes(m.id)));
      if (selectedMail && selectedMailIds.includes(selectedMail.id)) {
        setSelectedMail(null);
      }
      setSelectedMailIds([]);
    } catch (e) {
      console.error("Bulk delete error:", e);
    }
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
  // Filter inbox: Hide future scheduled mails from recipients (support both receiverId and recipientId)
  const inboxMails = mails.filter(m => (m.receiverId === userProfile?.id || (m as any).recipientId === userProfile?.id) && (!m.scheduledAt || m.scheduledAt <= nowStr));
  const sentMails = mails.filter(m => m.senderId === userProfile?.id);
  const unreadMails = inboxMails.filter(m => !m.isRead);
  const importantMails = mails.filter(m => m.isImportant && (m.receiverId === userProfile?.id || m.senderId === userProfile?.id));
  const systemMails = inboxMails.filter(m => m.senderName === '시스템 알림' || m.senderId === 'SYSTEM');

  let currentCategoryMails: Mail[] = [];
  if (selectedFolder === 'all') currentCategoryMails = inboxMails;
  else if (selectedFolder === 'unread') currentCategoryMails = unreadMails;
  else if (selectedFolder === 'important') currentCategoryMails = importantMails;
  else if (selectedFolder === 'sent') currentCategoryMails = sentMails;
  else if (selectedFolder === 'system') currentCategoryMails = systemMails;

  const filteredMails = currentCategoryMails.filter(m => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.title.toLowerCase().includes(q) ||
      m.senderName.toLowerCase().includes(q) ||
      m.receiverName.toLowerCase().includes(q)
    );
  });

  const isAllSelected = filteredMails.length > 0 && filteredMails.every(m => selectedMailIds.includes(m.id));
  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedMailIds([]);
    } else {
      setSelectedMailIds(filteredMails.map(m => m.id));
    }
  };

  const addressableUsers = users.filter(u => u.id !== userProfile?.id && isOperationalUser(u));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 850, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            ✉️ 사내 메일 및 업무 알림
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>동료 직원과의 업무 메일 및 시스템 자동 알림을 3-Pane 표준 그룹웨어 스타일로 편리하게 통합 관리합니다.</p>
        </div>
      </div>

      {/* Main 3-Pane Layout Container */}
      <div style={{ flex: 1, display: 'flex', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', overflow: 'hidden', minHeight: 0 }}>
        
        {/* 1. Left Sidebar Navigation (220px) */}
        <div style={{ width: '220px', minWidth: '220px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '16px 12px', gap: '12px', boxSizing: 'border-box' }}>
          
          {/* Compose Button */}
          <button
            onClick={() => {
              setAttachments([]);
              setTitle('');
              setContentHTML('');
              setSelectedReceiverId('');
              setIsScheduled(false);
              setScheduledAt('');
              setIsComposeModalOpen(true);
            }}
            style={{
              width: '100%',
              height: '40px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13.5px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)',
              transition: 'all 0.2s',
              flexShrink: 0
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
          >
            ✏️ 메일 쓰기
          </button>

          {/* Folder Tree List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, overflowY: 'auto' }}>
            <button
              onClick={() => { setSelectedFolder('all'); setSelectedMail(null); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: '6px', border: 'none',
                background: selectedFolder === 'all' ? '#e0f2fe' : 'transparent',
                color: selectedFolder === 'all' ? '#0369a1' : '#334155',
                fontWeight: selectedFolder === 'all' ? 800 : 600,
                fontSize: '13px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s'
              }}
            >
              <span>📥 전체 메일함</span>
              <span style={{ fontSize: '11px', background: selectedFolder === 'all' ? '#bae6fd' : '#e2e8f0', color: '#334155', padding: '1px 7px', borderRadius: '10px', fontWeight: 700 }}>
                {inboxMails.length}
              </span>
            </button>

            <button
              onClick={() => { setSelectedFolder('unread'); setSelectedMail(null); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: '6px', border: 'none',
                background: selectedFolder === 'unread' ? '#fef2f2' : 'transparent',
                color: selectedFolder === 'unread' ? '#dc2626' : '#334155',
                fontWeight: selectedFolder === 'unread' ? 800 : 600,
                fontSize: '13px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s'
              }}
            >
              <span>🔴 안읽은 메일함</span>
              <span style={{ fontSize: '11px', background: unreadMails.length > 0 ? '#ef4444' : '#e2e8f0', color: unreadMails.length > 0 ? '#fff' : '#334155', padding: '1px 7px', borderRadius: '10px', fontWeight: 700 }}>
                {unreadMails.length}
              </span>
            </button>

            <button
              onClick={() => { setSelectedFolder('important'); setSelectedMail(null); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: '6px', border: 'none',
                background: selectedFolder === 'important' ? '#fefce8' : 'transparent',
                color: selectedFolder === 'important' ? '#a16207' : '#334155',
                fontWeight: selectedFolder === 'important' ? 800 : 600,
                fontSize: '13px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s'
              }}
            >
              <span>⭐ 중요 메일함</span>
              <span style={{ fontSize: '11px', background: selectedFolder === 'important' ? '#fef08a' : '#e2e8f0', color: '#854d0e', padding: '1px 7px', borderRadius: '10px', fontWeight: 700 }}>
                {importantMails.length}
              </span>
            </button>

            <button
              onClick={() => { setSelectedFolder('sent'); setSelectedMail(null); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: '6px', border: 'none',
                background: selectedFolder === 'sent' ? '#f0fdf4' : 'transparent',
                color: selectedFolder === 'sent' ? '#15803d' : '#334155',
                fontWeight: selectedFolder === 'sent' ? 800 : 600,
                fontSize: '13px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s'
              }}
            >
              <span>📤 보낸 메일함</span>
              <span style={{ fontSize: '11px', background: selectedFolder === 'sent' ? '#dcfce7' : '#e2e8f0', color: '#166534', padding: '1px 7px', borderRadius: '10px', fontWeight: 700 }}>
                {sentMails.length}
              </span>
            </button>

            <button
              onClick={() => { setSelectedFolder('system'); setSelectedMail(null); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: '6px', border: 'none',
                background: selectedFolder === 'system' ? '#faf5ff' : 'transparent',
                color: selectedFolder === 'system' ? '#7e22ce' : '#334155',
                fontWeight: selectedFolder === 'system' ? 800 : 600,
                fontSize: '13px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s'
              }}
            >
              <span>🤖 업무/시스템 알림</span>
              <span style={{ fontSize: '11px', background: selectedFolder === 'system' ? '#f3e8ff' : '#e2e8f0', color: '#6b21a8', padding: '1px 7px', borderRadius: '10px', fontWeight: 700 }}>
                {systemMails.length}
              </span>
            </button>
          </div>

        </div>

        {/* 2. Middle Mail List Panel (380px ~ 420px) */}
        <div style={{ width: '380px', minWidth: '380px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#fff', boxSizing: 'border-box' }}>
          
          {/* Top Search & Toolbar */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
            <input
              type="text"
              placeholder="제목, 보낸이/받는이 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', height: '32px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px', outline: 'none', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
                <input type="checkbox" checked={isAllSelected} onChange={handleToggleSelectAll} style={{ cursor: 'pointer' }} />
                <span>전체선택 ({selectedMailIds.length})</span>
              </label>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleBulkMarkRead}
                  disabled={selectedMailIds.length === 0}
                  style={{
                    padding: '3px 8px', background: selectedMailIds.length > 0 ? '#f1f5f9' : '#fafafa',
                    border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', fontWeight: 600,
                    color: selectedMailIds.length > 0 ? '#334155' : '#cbd5e1', cursor: selectedMailIds.length > 0 ? 'pointer' : 'default'
                  }}
                >
                  읽음
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedMailIds.length === 0}
                  style={{
                    padding: '3px 8px', background: selectedMailIds.length > 0 ? '#fef2f2' : '#fafafa',
                    border: '1px solid #fca5a5', borderRadius: '4px', fontSize: '11.5px', fontWeight: 600,
                    color: selectedMailIds.length > 0 ? '#dc2626' : '#cbd5e1', cursor: selectedMailIds.length > 0 ? 'pointer' : 'default'
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          </div>

          {/* Mail Items Card List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredMails.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                등록된 메일이 없습니다.
              </div>
            ) : (
              filteredMails.map(mail => {
                const isUnread = !mail.isRead && mail.receiverId === userProfile?.id;
                const isSelected = selectedMail?.id === mail.id;
                const isChecked = selectedMailIds.includes(mail.id);

                return (
                  <div
                    key={mail.id}
                    onClick={() => handleReadMail(mail)}
                    style={{
                      padding: '12px 14px',
                      borderBottom: '1px solid #f1f5f9',
                      background: isSelected ? '#eff6ff' : isUnread ? '#f8fafc' : '#fff',
                      borderLeft: isSelected ? '4px solid #3b82f6' : isUnread ? '4px solid #ef4444' : '4px solid transparent',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start'
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isUnread ? '#f8fafc' : '#fff'; }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => handleToggleSelectMail(mail.id, e as any)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ marginTop: '3px', cursor: 'pointer' }}
                    />

                    {/* Avatar Icon */}
                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: mail.senderName === '시스템 알림' ? '#fef2f2' : '#eff6ff', color: mail.senderName === '시스템 알림' ? '#dc2626' : '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', flexShrink: 0, border: '1px solid #e2e8f0' }}>
                      {mail.senderName === '시스템 알림' ? '🤖' : mail.senderName.slice(0, 2)}
                    </div>

                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: isUnread ? 800 : 600, color: isUnread ? '#0f172a' : '#475569', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {selectedFolder === 'sent' ? `To: ${mail.receiverName}` : mail.senderName}
                        </span>
                        <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>
                          {new Date(mail.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', fontWeight: isUnread ? 800 : 500, color: isUnread ? '#1e293b' : '#334155', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {mail.isImportant && <span style={{ color: '#eab308' }}>⭐</span>}
                        <span>{mail.title}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>

        {/* 3. Right Mail Reading Detail Panel (Flex 1) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden', boxSizing: 'border-box' }}>
          {selectedMail ? (
            <>
              {/* Top Action Bar */}
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleReplyMail(selectedMail)}
                    style={{ padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    ↩️ 답장
                  </button>
                  <button
                    onClick={() => handleForwardMail(selectedMail)}
                    style={{ padding: '6px 14px', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    🔁 전달
                  </button>
                  <button
                    onClick={() => handleToggleImportant(selectedMail)}
                    style={{ padding: '6px 14px', background: '#fff', color: selectedMail.isImportant ? '#a16207' : '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    {selectedMail.isImportant ? '⭐ 중요 해제' : '⭐ 중요 표시'}
                  </button>
                </div>

                <button
                  onClick={(e) => handleDeleteMail(selectedMail.id, e)}
                  style={{ padding: '6px 12px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  🗑️ 삭제
                </button>
              </div>

              {/* Mail Title & Sender Info Header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#fff', flexShrink: 0 }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 14px 0', lineHeight: 1.4 }}>
                  {selectedMail.title}
                </h2>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: selectedMail.senderName === '시스템 알림' ? '#fef2f2' : '#eff6ff', color: selectedMail.senderName === '시스템 알림' ? '#dc2626' : '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '15px', border: '1px solid #cbd5e1', flexShrink: 0 }}>
                    {selectedMail.senderName === '시스템 알림' ? '🤖' : selectedMail.senderName.slice(0, 2)}
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                      {selectedMail.senderName}
                      <span style={{ fontSize: '12.5px', fontWeight: 500, color: '#64748b', marginLeft: '8px' }}>
                        ➔ 수신: <strong>{selectedMail.receiverName}</strong>
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <span>발송일시: {new Date(selectedMail.createdAt).toLocaleString('ko-KR')}</span>
                      {selectedMail.ccNames && selectedMail.ccNames.length > 0 && (
                        <span>참조: {selectedMail.ccNames.join(', ')}</span>
                      )}
                      {selectedMail.scheduledAt && (
                        <span style={{ color: '#0369a1', fontWeight: 700 }}>⏰ 예약발송: {new Date(selectedMail.scheduledAt).toLocaleString('ko-KR')}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Attachments Card Bar */}
              {selectedMail.attachments && selectedMail.attachments.length > 0 && (
                <div style={{ padding: '12px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                    📎 첨부파일 ({selectedMail.attachments.length}개)
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {selectedMail.attachments.map((file, fIdx) => (
                      <div key={fIdx} style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', width: '100px' }}>
                        {file.type.startsWith('image/') ? (
                          <img
                            src={file.data}
                            alt={file.name}
                            onClick={() => previewFile(file.data, file.name)}
                            style={{ width: '100%', height: '60px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => previewFile(file.data, file.name)}
                            style={{ width: '100%', height: '60px', border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', cursor: 'pointer' }}
                          >
                            📄
                          </button>
                        )}
                        <span
                          onClick={() => previewFile(file.data, file.name)}
                          style={{ fontSize: '10px', color: '#334155', width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'center', cursor: 'pointer', fontWeight: 600 }}
                          title={file.name}
                        >
                          {file.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mail Body HTML Reader */}
              <div style={{ flex: 1, padding: '24px', overflowY: 'auto', background: '#fff' }}>
                <div
                  dangerouslySetInnerHTML={{ __html: selectedMail.content }}
                  style={{ fontSize: '14.5px', lineHeight: 1.7, color: '#334155' }}
                />
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '12px' }}>
              <span style={{ fontSize: '48px' }}>📬</span>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>읽을 메일을 목록에서 선택해 주세요.</span>
            </div>
          )}
        </div>

      </div>

      {/* Compose Mail Popup Modal */}
      {isComposeModalOpen && (
        <div
          onPaste={handlePaste}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{ position: 'fixed', inset: 0, background: 'transparent', zIndex: 9999, pointerEvents: 'none' }}
        >
          <div 
            style={{ 
              background: '#fff', 
              borderRadius: '8px', 
              width: '100%', 
              maxWidth: '680px', 
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)', 
              overflow: 'hidden', 
              display: 'flex', 
              flexDirection: 'column', 
              position: 'absolute',
              left: `${composeWindowPosition.x}px`,
              top: `${composeWindowPosition.y}px`,
              pointerEvents: 'auto',
              border: '1px solid #cbd5e1'
            }}
          >
            
            {/* Drag drop overlay helper */}
            {isDraggingFile && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(42, 162, 177, 0.15)', border: '4px dashed #3b82f6', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span style={{ fontSize: '18px', fontWeight: 900, color: '#3b82f6', background: '#fff', padding: '12px 24px', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  📥 파일을 여기에 놓아 첨부 (500KB 이하)
                </span>
              </div>
            )}

            <div 
              onMouseDown={handleComposeHeaderMouseDown}
              style={{ padding: '14px 20px', background: '#1e293b', color: '#fff', fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'move', userSelect: 'none' }}
            >
              <span>📣 새 쪽지 보내기</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setIsComposeWindowMinimized(!isComposeWindowMinimized)} 
                  style={{ background: 'none', border: 'none', color: '#fff', fontSize: '16px', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center' }}
                >
                  {isComposeWindowMinimized ? '🔲' : '➖'}
                </button>
                <button type="button" onClick={() => setIsComposeModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
              </div>
            </div>

            {!isComposeWindowMinimized && (
            <form onSubmit={handleSendMail} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto' }}>
              
              {/* Template triggers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>쪽지 양식 템플릿 로드</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => applyMailTemplate('work')}
                    style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer', fontSize: '12px', height: '34px', boxSizing: 'border-box' }}
                  >
                    업무 연락 양식 적용
                  </button>
                  <button
                    type="button"
                    onClick={() => applyMailTemplate('notice')}
                    style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer', fontSize: '12px', height: '34px', boxSizing: 'border-box' }}
                  >
                    공지 사항 양식 적용
                  </button>
                </div>
              </div>

              {/* AI prompt draft generator */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f8fafc', padding: '14px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Base 🪄 AI 쪽지 초안 자동 작성 (프롬프트 입력)
                </span>
                <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
                  보낼 사람의 정보와 업무 조치 사항, 기한을 적으시면 AI가 정식 메일 양식 및 요청 과제 표를 생성해 드립니다.
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="text"
                    placeholder="예: 수출 신고서 피드백 오늘 오후 6시까지 검토 요청."
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    style={{ flex: 1, padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', backgroundColor: '#fff', height: '34px', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={handleAiDraftCreate}
                    style={{ padding: '0 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', height: '34px', display: 'flex', alignItems: 'center', boxSizing: 'border-box' }}
                  >
                    🪄 초안 생성
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>받는 사람 <span style={{ color: '#ef4444' }}>*</span></label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 750, color: isImportant ? '#eab308' : '#64748b' }}>
                    <input
                      type="checkbox"
                      checked={isImportant}
                      onChange={e => setIsImportant(e.target.checked)}
                      style={{ accentColor: '#eab308', width: '14px', height: '14px', cursor: 'pointer' }}
                    />
                    <span>⭐ 중요 쪽지 표시</span>
                  </label>
                </div>
                <select
                  required
                  value={selectedReceiverId}
                  onChange={e => setSelectedReceiverId(e.target.value)}
                  style={{ padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', backgroundColor: 'white', height: '34px', color: '#1e293b', boxSizing: 'border-box', cursor: 'pointer' }}
                >
                  <option value="">수신자를 선택해 주세요</option>
                  <option value="ALL_USERS">📢 [전체 직원] 전사 공지 발송</option>
                  <option value={userProfile?.id}>📝 나에게 쓰기 (내게 메모 보내기)</option>
                  {addressableUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.department || '부서'} / {u.position || '직급'})
                    </option>
                  ))}
                </select>
              </div>

              {/* 참조 (CC) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>참조 (CC)</label>
                <select
                  value=""
                  onChange={e => {
                    const id = e.target.value;
                    if (id && !selectedCcUserIds.includes(id)) {
                      setSelectedCcUserIds(prev => [...prev, id]);
                    }
                  }}
                  style={{ padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', backgroundColor: 'white', height: '34px', color: '#1e293b', boxSizing: 'border-box', cursor: 'pointer' }}
                >
                  <option value="">참조자를 선택하여 추가하세요</option>
                  {addressableUsers.filter(u => u.id !== selectedReceiverId && !selectedCcUserIds.includes(u.id)).map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.department || '부서'} / {u.position || '직급'})
                    </option>
                  ))}
                </select>
                {selectedCcUserIds.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {selectedCcUserIds.map(id => {
                      const u = users.find(usr => usr.id === id);
                      return (
                        <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                          👤 {u?.name || id} ({u?.position || '팀원'})
                          <button
                            type="button"
                            onClick={() => setSelectedCcUserIds(prev => prev.filter(cId => cId !== id))}
                            style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 800, cursor: 'pointer', padding: '0 2px', marginLeft: '2px' }}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>제목 <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  required
                  placeholder="제목을 입력하세요"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={{ padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', height: '34px', color: '#1e293b', boxSizing: 'border-box' }}
                />
              </div>

              {/* Scheduled Send options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f8fafc', padding: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold', color: '#1e293b', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isScheduled}
                    onChange={e => setIsScheduled(e.target.checked)}
                  />
                  ⏰ 예약 알림 전송 설정
                </label>
                {isScheduled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                    <label style={{ fontSize: '11px', color: '#475569', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>발송 예약 일시</label>
                    <input
                      type="datetime-local"
                      required={isScheduled}
                      value={scheduledAt}
                      onChange={e => setScheduledAt(e.target.value)}
                      style={{ padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', height: '34px', color: '#1e293b', boxSizing: 'border-box' }}
                    />
                  </div>
                )}
              </div>

              {/* Task Creation options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#eff6ff', padding: '12px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 'bold', color: '#1e40af', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={createTaskOption}
                    onChange={e => setCreateTaskOption(e.target.checked)}
                  />
                  📋 신규 업무 자동 생성 및 할당 (수신자에게 Task 연동 및 위임)
                </label>
                {createTaskOption && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #93c5fd' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '11px', color: '#1e3a8a', fontWeight: 750 }}>업무 마감일</label>
                        <input
                          type="date"
                          value={taskDueDate}
                          onChange={e => setTaskDueDate(e.target.value)}
                          style={{ padding: '0 8px', border: '1px solid #93c5fd', borderRadius: '4px', fontSize: '12.5px', height: '32px', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '11px', color: '#1e3a8a', fontWeight: 750 }}>업무 유형</label>
                        <select
                          value={taskType}
                          onChange={e => setTaskType(e.target.value)}
                          style={{ padding: '0 8px', border: '1px solid #93c5fd', borderRadius: '4px', fontSize: '12.5px', height: '32px', boxSizing: 'border-box' }}
                        >
                          <option value="DAILY">📝 일상 업무</option>
                          <option value="PURCHASE">🛒 발주/소싱</option>
                          <option value="LOGISTICS">🚢 선적/물류</option>
                          <option value="DOCS">📄 서류 관리</option>
                          <option value="SETTLEMENT">💰 정산/결제</option>
                          <option value="NOTICE">📢 공지/안내</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '11px', color: '#1e3a8a', fontWeight: 750 }}>중요도</label>
                        <select
                          value={taskImportance}
                          onChange={e => setTaskImportance(e.target.value)}
                          style={{ padding: '0 8px', border: '1px solid #93c5fd', borderRadius: '4px', fontSize: '12.5px', height: '32px', boxSizing: 'border-box' }}
                        >
                          <option value="A">🔴 A (매우 중요)</option>
                          <option value="B">🟡 B (보통 중요)</option>
                          <option value="C">🟢 C (일반)</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '11px', color: '#1e3a8a', fontWeight: 750 }}>긴급도 ({taskUrgency}단계)</label>
                        <input
                          type="range"
                          min="1"
                          max="5"
                          value={taskUrgency}
                          onChange={e => setTaskUrgency(Number(e.target.value))}
                          style={{ height: '32px' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Rich Text Editor */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>내용 <span style={{ color: '#ef4444' }}>*</span></label>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f8fafc', border: '1px solid #cbd5e1', borderBottom: 'none', borderTopLeftRadius: '4px', borderTopRightRadius: '4px' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => format('bold')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>가</button>
                    <button type="button" onClick={() => format('italic')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontStyle: 'italic', fontSize: '12px' }}><i>가</i></button>
                    <button type="button" onClick={() => format('underline')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', textDecoration: 'underline', fontSize: '12px' }}><u>가</u></button>
                    <button type="button" onClick={insertTable} style={{ padding: '4px 10px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                    border: '1px solid #cbd5e1',
                    borderBottomLeftRadius: '4px',
                    borderBottomRightRadius: '4px',
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
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>📎 첨부파일 목록</span>
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  style={{ fontSize: '12px', color: '#475569' }}
                />
                {attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                    {attachments.map((file, idx) => (
                      <div key={idx} style={{ position: 'relative', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', width: '80px' }}>
                        {file.type.startsWith('image/') ? (
                          <img src={file.data} alt={file.name} style={{ width: '100%', height: '50px', objectFit: 'cover', borderRadius: '2px' }} />
                        ) : (
                          <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: '#475569' }}>📄</div>
                        )}
                        <span style={{ fontSize: '8.5px', color: '#475569', width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'center' }}>
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

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px', height: '40px' }}>
                <button
                  type="submit"
                  disabled={isSending}
                  style={{ flex: 1, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s', height: '100%', boxSizing: 'border-box' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
                >
                  {isSending ? '보내는 중...' : '보내기'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsComposeModalOpen(false)}
                  style={{ flex: 1, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '12.5px', color: '#475569', height: '100%', boxSizing: 'border-box', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
                >
                  취소
                </button>
              </div>

            </form>
            )}
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
