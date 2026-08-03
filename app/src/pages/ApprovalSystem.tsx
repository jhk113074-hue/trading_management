import React, { useState, useEffect, useRef } from 'react';
import { subscribeCustomCurrencies, handleCurrencySelection, DEFAULT_CURRENCIES } from '../utils/currency';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { User } from '../types';
import { isOperationalUser } from '../utils/userUtils';

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
  currency?: string; // e.g. USD, KRW, MYR
  requesterId: string;
  requesterName: string;
  approverId: string;
  approverName: string;
  isUrgent?: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectReason?: string;
  createdAt: string;
  approvedBy?: string;
  attachments?: Attachment[];
  comments?: ApprovalComment[];
}

export const ApprovalSystem: React.FC = () => {
  const [customCurrencies, setCustomCurrencies] = useState<string[]>([]);
  useEffect(() => {
    return subscribeCustomCurrencies(setCustomCurrencies);
  }, []);
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
  const [currency, setCurrency] = useState('USD');
  const [selectedApproverId, setSelectedApproverId] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modaless Window states
  const [draftWindowPosition, setDraftWindowPosition] = useState({ x: 120, y: 50 });
  const [isDraftWindowMinimized, setIsDraftWindowMinimized] = useState(false);

  // View Document Modal
  const [selectedDoc, setSelectedDoc] = useState<ApprovalDoc | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  
  // Comment State inside View Modal
  const [newComment, setNewComment] = useState('');

  // Drag and Drop & Clipboard states
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Floating Slash Command Menu state
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // AI Prompt Draft Creator States
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);

  // Drag move handler for modaless window
  const handleHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 폼 요소나 버튼, 닫기 버튼 등을 클릭한 경우에는 드래그하지 않음
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
    e.preventDefault();
    const startX = e.clientX - draftWindowPosition.x;
    const startY = e.clientY - draftWindowPosition.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setDraftWindowPosition({
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

    const draftBody = editorRef.current ? editorRef.current.innerHTML : contentHTML;
    if (!draftBody || draftBody.trim() === '<br>' || draftBody.trim() === '') {
      alert("기안 내용을 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'approvals'), {
        title: isUrgent ? `[🚨 긴급] ${title}` : title,
        docType,
        content: draftBody,
        amount: docType === 'EXPENSE' ? Number(amount) : null,
        currency: docType === 'EXPENSE' ? currency : null,
        requesterId: userProfile.id,
        requesterName: userProfile.name,
        approverId: selectedApproverId,
        approverName: targetApprover.name,
        isUrgent,
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
        title: `[알림${isUrgent ? ' - 🚨 긴급' : ''}] 결재 기안서가 상신되었습니다: ${title}`,
        content: `${userProfile.name}님이 ${isUrgent ? '🚨 긴급 ' : ''}결재 기안서 "${title}"를 상신했습니다.\n\n구분: ${docType === 'EXPENSE' ? `지출결의서 (${currency})` : '일반기안서'}\n\n전자결재 메뉴에서 결재해 주시기 바랍니다.`,
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

  // Clipboard Paste Handler (Ctrl+V for Capture/Screenshots)
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
  };

  // One-click corporate document templates
  const applyTemplate = (templateType: 'expense' | 'draft') => {
    let templateHTML = '';
    if (templateType === 'expense') {
      templateHTML = `
        <h2 style="font-size: 1.15rem; font-weight: bold; border-bottom: 2px solid #334155; padding-bottom: 6px; color: var(--text-primary);">지출결의 상세 보고</h2>
        <p style="margin: 8px 0; color: var(--text-secondary);">아래와 같이 지출결의 내역을 품의하오니 승인하여 주시기 바랍니다.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
          <thead>
            <tr style="background: #f1f5f9; font-weight: bold; border: 1px solid var(--border-default); color: #334155;">
              <th style="border: 1px solid var(--border-default); padding: 8px; text-align: left;">구분 (품목)</th>
              <th style="border: 1px solid var(--border-default); padding: 8px; text-align: center; width: 60px;">수량</th>
              <th style="border: 1px solid var(--border-default); padding: 8px; text-align: right; width: 120px;">단가</th>
              <th style="border: 1px solid var(--border-default); padding: 8px; text-align: right; width: 120px;">공급가액</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid var(--border-default); padding: 8px; color: #334155;">예: 해외 바이어 초청 식대</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: center; color: #334155;">1</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: right; color: #334155;">120.00</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: right; color: #334155;">120.00</td>
            </tr>
            <tr>
              <td style="border: 1px solid var(--border-default); padding: 8px; color: #334155;">예: 샘플 제작 배송비</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: center; color: #334155;">1</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: right; color: #334155;">85.00</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: right; color: #334155;">85.00</td>
            </tr>
          </tbody>
        </table>
        
        <div style="background: #f8fafc; padding: 12px; border-left: 4px solid var(--focus-ring); border-radius: 4px; font-weight: bold; color: var(--text-primary);">
          ※ 총 합계: USD 205.00
        </div>
        <p><br></p>
      `;
    } else {
      templateHTML = `
        <h2 style="font-size: 1.15rem; font-weight: bold; border-bottom: 2px solid #334155; padding-bottom: 6px; color: var(--text-primary);">업무 기안 협조 품의</h2>
        <p style="margin: 8px 0; color: var(--text-secondary);">의안사항에 대하여 아래와 같이 기안하오니 재가하여 주시기 바랍니다.</p>
        
        <h3 style="font-size: 0.95rem; margin-top: 16px; color: var(--focus-ring); font-weight: bold;">1. 기안 배경 및 목적</h3>
        <p style="margin: 4px 0 12px 0; color: #334155;">여기에 기안 배경을 상세히 기술하세요.</p>
        
        <h3 style="font-size: 0.95rem; margin-top: 16px; color: var(--focus-ring); font-weight: bold;">2. 주요 실행 과제</h3>
        <ul style="margin: 4px 0 12px 20px; padding: 0; color: #334155;">
          <li style="margin-bottom: 4px;">주요 세부 실행 내용을 항목별로 작성하세요.</li>
          <li style="margin-bottom: 4px;">협조 부서 및 일정 계획을 포함하세요.</li>
        </ul>
        
        <h3 style="font-size: 0.95rem; margin-top: 16px; color: var(--focus-ring); font-weight: bold;">3. 기대 효과</h3>
        <blockquote style="border-left: 4px solid var(--border-default); padding-left: 12px; color: var(--text-secondary); font-style: italic; margin: 8px 0;">
          "업무 효율성 증대 및 무역 프로세스 단축 기대"
        </blockquote>
        <p><br></p>
      `;
    }

    if (editorRef.current) {
      editorRef.current.innerHTML = templateHTML;
      setContentHTML(templateHTML);
    }
  };
  const handleAiSummarize = () => {
    const rawHTML = editorRef.current ? editorRef.current.innerHTML : contentHTML;
    const textContent = editorRef.current ? editorRef.current.innerText : '';
    if (!textContent || textContent.trim() === '') {
      alert("분석할 기안서 내용이 없습니다. 내용을 먼저 입력해 주세요.");
      return;
    }

    setIsAiProcessing(true);
    setTimeout(() => {
      const lines = textContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      let summaryHTML = `
        <div style="background: #f0fdf4; padding: 12px; border-left: 4px solid #16a34a; border-radius: 4px; margin-bottom: 12px; font-size: 13px;">
          <strong>🤖 AI 결재 기안 요약</strong><br>
          본 결재 건에 대한 기안 주요 요지입니다. 신속한 결재 검토를 건의드립니다.
        </div>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12.5px;">
          <thead>
            <tr style="background: #f8fafc; font-weight: bold; border-bottom: 2px solid var(--border-default);">
              <th style="border: 1px solid var(--border-default); padding: 6px; width: 50px;">번호</th>
              <th style="border: 1px solid var(--border-default); padding: 6px;">핵심 기안 항목 및 세부 사항</th>
              <th style="border: 1px solid var(--border-default); padding: 6px; text-align: center; width: 80px;">AI 분석</th>
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
              <span style="background: #d1fae5; color: #065f46; padding: 2px 4px; border-radius: 4px; font-size: 10px; font-weight: bold;">이상없음</span>
            </td>
          </tr>
        `;
      });

      summaryHTML += `
          </tbody>
        </table>
        <br>
        <p style="font-size: 11px; color: var(--text-muted); font-style: italic;">* 원본 작성 내용 상단에 AI 요약 및 품목 정리표가 성공적으로 추가되었습니다.</p>
        <hr style="border: 0; border-top: 1px dashed var(--border-default); margin: 16px 0;" />
      `;

      const merged = summaryHTML + rawHTML;
      if (editorRef.current) {
        editorRef.current.innerHTML = merged;
      }
      setContentHTML(merged);
      setIsAiProcessing(false);
      alert("AI가 결재 기안서 본문 분석을 완료하여 상단에 요약 배너 및 자동 구조화 표를 삽입했습니다!");
    }, 2000);
  };
  const handleAiDraftCreate = () => {
    if (!aiPrompt || !aiPrompt.trim()) {
      alert("AI 초안으로 작성할 기안 핵심 내용을 프롬프트 창에 입력해 주세요.");
      return;
    }

    setIsGeneratingDraft(true);
    setTimeout(() => {
      let generatedTitle = `[품의] ${aiPrompt.substring(0, 24)}... 관련 품의의 건`;
      if (aiPrompt.includes("노트북") || aiPrompt.includes("PC")) {
        generatedTitle = `[업무환경개선] 신규 고성능 개발 및 업무용 노트북 교체 품의서`;
      } else if (aiPrompt.includes("서버") || aiPrompt.includes("개발서버")) {
        generatedTitle = `[IT지원실] 인프라 확충에 따른 신규 고성능 개발 서버 장비 도입 건`;
      } else if (aiPrompt.includes("출장") || aiPrompt.includes("해외")) {
        generatedTitle = `[해외영업부] 해외 바이어 발굴 및 현지 시장 조사를 위한 출장 요청 품의서`;
      }

      setTitle(generatedTitle);

      const generatedDraftHTML = `
        <div style="background: #f0fdf4; padding: 14px; border-left: 4px solid #16a34a; border-radius: 6px; margin-bottom: 16px;">
          <span style="font-weight: 800; color: #166534; font-size: 13.5px;">🤖 AI 결재 기안 핵심 요약</span>
          <p style="font-size: 12.5px; color: #1e3a1e; margin: 6px 0 0 0; line-height: 1.5;">
            본 결재 건은 <strong>"${aiPrompt}"</strong> 요청에 따라 AI가 자동 작성한 기안서 초안입니다.<br>
            사내 주요 업무 효율 극대화를 위한 장비 및 인프라 확보의 건으로, 조속한 재가를 건의드립니다.
          </p>
        </div>

        <h2 style="font-size: 1.15rem; font-weight: bold; border-bottom: 2px solid #334155; padding-bottom: 6px; color: var(--text-primary);">업무 기안 품의서</h2>
        <p style="margin: 8px 0; color: var(--text-secondary);">사내 업무 경쟁력 확보 및 현업 요청 해결을 위해 아래와 같이 기안하오니 검토 후 최종 재가하여 주시기 바랍니다.</p>

        <h3 style="font-size: 0.95rem; margin-top: 18px; color: #16a34a; font-weight: bold;">1. 기안 목적 및 도입 배경</h3>
        <p style="margin: 4px 0 12px 0; color: #334155; line-height: 1.6;">
          기존 운영 중인 장비의 감가상각 및 노후화, 또는 비즈니스 스케일업에 따른 용량 부족 등으로 인해 업무 프로세스상 병목 현상이 발생하고 있습니다.<br>
          이에 신규 필요 자원에 대한 도입을 시급히 완료하여 업무 연속성을 확보하고자 합니다.
        </p>

        <h3 style="font-size: 0.95rem; margin-top: 18px; color: #16a34a; font-weight: bold;">2. 청구 내역 및 세부 품목 단가</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px;">
          <thead>
            <tr style="background: #f8fafc; font-weight: bold; border: 1px solid var(--border-default);">
              <th style="border: 1px solid var(--border-default); padding: 8px;">도입 대상 세부 품목</th>
              <th style="border: 1px solid var(--border-default); padding: 8px; text-align: center; width: 60px;">수량</th>
              <th style="border: 1px solid var(--border-default); padding: 8px; text-align: right; width: 120px;">단가 (USD)</th>
              <th style="border: 1px solid var(--border-default); padding: 8px; text-align: right; width: 120px;">합계 금액</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid var(--border-default); padding: 8px; color: #334155;">요청 도입 고성능 장비 (A타입 사양)</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: center; color: #334155;">3</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: right; color: #334155;">5,000.00</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: right; color: #334155;">15,000.00</td>
            </tr>
            <tr>
              <td style="border: 1px solid var(--border-default); padding: 8px; color: #334155;">기본 셋업 공임 및 라이선스 비용</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: center; color: #334155;">1</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: right; color: #334155;">0.00 (지원)</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: right; color: #334155;">무상 제공</td>
            </tr>
          </tbody>
        </table>
        <div style="background: #f8fafc; padding: 12px; border-left: 4px solid #16a34a; border-radius: 4px; font-weight: bold; color: #111827; font-size: 13px;">
          ※ 예상 소요 예산 총액: USD 15,000.00 (일만 오천 달러 정)
        </div>

        <h3 style="font-size: 0.95rem; margin-top: 18px; color: #16a34a; font-weight: bold;">3. 도입 기대 효과</h3>
        <ul style="margin: 4px 0 12px 20px; padding: 0; color: #334155; line-height: 1.6;">
          <li style="margin-bottom: 4px;">장비 로딩 속도 단축으로 인한 기획/개발 생산성 약 35% 이상 향상 기대.</li>
          <li style="margin-bottom: 4px;">최신 OS 보안 업데이트 지원을 통한 기업 정보 보안 유출 사고 선제 차단.</li>
        </ul>
        <br>
        <p style="font-size: 11px; color: var(--text-muted); font-style: italic;">* 위 초안은 프롬프트에 기재해주신 핵심 요구사항을 분석하여 공식 비즈니스 서식으로 요약 작성되었습니다.</p>
      `;

      if (editorRef.current) {
        editorRef.current.innerHTML = generatedDraftHTML;
      }
      setContentHTML(generatedDraftHTML);
      setIsGeneratingDraft(false);
      alert("AI가 작성하신 핵심 프롬프트를 해석하여, 정식 공문서 양식 및 예산 테이블, 그리고 요약 배너까지 결합한 전체 기안서 초안을 작성했습니다!");
    }, 2500);
  };

  // Keyboard Slash menu & Markdown parsing handler
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === '/') {
      setShowSlashMenu(true);
    } else if (e.key === 'Escape') {
      setShowSlashMenu(false);
    } else if (e.key === ' ' && editorRef.current) {
      // Spacebar triggers Markdown shortcut parsing
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      const text = range.startContainer.textContent || '';
      
      // Parse markdown shortcuts
      if (text.startsWith('#')) {
        e.preventDefault();
        range.startContainer.textContent = text.replace(/^#\s*/, '');
        format('formatBlock'); // transform to Heading
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
        // replace content
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
    
    // Remove the trailing '/' trigger
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

  const formatCurrency = (amount: number, curr?: string) => {
    const symbol = curr === 'KRW' ? '₩' : curr === 'MYR' ? 'RM ' : '$';
    return `${symbol}${amount.toLocaleString()}`;
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>데이터를 불러오는 중...</div>;
  }

  const pendingDocs = documents.filter(d => d.approverId === userProfile?.id && d.status === 'PENDING');
  const submittedDocs = documents.filter(d => d.requesterId === userProfile?.id);
  const archiveDocs = documents.filter(d => d.status !== 'PENDING' && (d.requesterId === userProfile?.id || d.approverId === userProfile?.id || userProfile?.role === '관리자'));
  const activeList = activeTab === 'pending' ? pendingDocs : activeTab === 'submitted' ? submittedDocs : archiveDocs;
  const potentialApprovers = users.filter(u => u.id !== userProfile?.id && (u.role === '관리자' || u.role === '매니저') && isOperationalUser(u));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 850, color: '#1e293b', margin: 0 }}>✍️ 전자결재 시스템</h2>
          <p style={{ fontSize: '14.5px', color: '#64748b', margin: '6px 0 0 0' }}>온라인 기안 상신, 결재선 지정, 실시간 품의서 결재 및 반려 보관 시스템입니다.</p>
        </div>
        <button 
          onClick={() => { setAttachments([]); setShowDraftModal(true); }}
          style={{
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '0 16px',
            height: '36px',
            fontSize: '14.5px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.2s',
            display: 'flex',
            alignItems: 'center',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
          onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
        >
          📝 새 결재 기안서 작성
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', gap: '8px' }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            color: activeTab === 'pending' ? '#3b82f6' : '#64748b',
            borderBottom: activeTab === 'pending' ? '2.5px solid #3b82f6' : 'none'
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
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            color: activeTab === 'submitted' ? '#3b82f6' : '#64748b',
            borderBottom: activeTab === 'submitted' ? '2.5px solid #3b82f6' : 'none'
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
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            color: activeTab === 'archive' ? '#3b82f6' : '#64748b',
            borderBottom: activeTab === 'archive' ? '2.5px solid #3b82f6' : 'none'
          }}
        >
          📁 결재 완료 보관함 ({archiveDocs.length})
        </button>
      </div>

      {/* List Container */}
      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '16px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #cbd5e1', color: '#475569', textAlign: 'left', fontWeight: 'bold' }}>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: '750', letterSpacing: '0.02em', textTransform: 'uppercase' }}>문서 종류</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: '750', letterSpacing: '0.02em', textTransform: 'uppercase' }}>기안 제목</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: '750', letterSpacing: '0.02em', textTransform: 'uppercase' }}>기안자</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: '750', letterSpacing: '0.02em', textTransform: 'uppercase' }}>결재선 (결재권자)</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: '750', letterSpacing: '0.02em', textTransform: 'uppercase' }}>기안일시</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: '750', letterSpacing: '0.02em', textTransform: 'uppercase' }}>결재 상태</th>
              </tr>
            </thead>
            <tbody>
              {activeList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14.5px' }}>
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
                        fontSize: '13px',
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
                      {doc.title} {doc.docType === 'EXPENSE' && `(${formatCurrency(doc.amount || 0, doc.currency)})`}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{doc.requesterName}</td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>👤 {doc.approverName}</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13.5px' }}>{new Date(doc.createdAt).toLocaleString()}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '13.5px',
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

      {/* New Draft Creation Modal (Modaless Sub Window) */}
      {showDraftModal && (
        <div onPaste={handlePaste} style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none', display: 'block' }}>
          <div style={{ 
            position: 'absolute', 
            left: `${draftWindowPosition.x}px`, 
            top: `${draftWindowPosition.y}px`, 
            background: '#fff', 
            borderRadius: '8px', 
            width: '680px', 
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)', 
            overflow: 'hidden', 
            display: 'flex', 
            flexDirection: 'column',
            pointerEvents: 'auto',
            border: '1px solid #cbd5e1'
          }}>
            <div 
              onMouseDown={handleHeaderMouseDown}
              style={{ 
                padding: '12px 20px', 
                background: '#ffffff', 
                color: '#1e293b', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                borderBottom: '1px solid #cbd5e1',
                cursor: 'move',
                userSelect: 'none'
              }}
            >
              <span style={{ fontSize: '15px', fontWeight: 800 }}>📝 새 결재 문서 기안 상신 (드래그하여 이동 가능)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button 
                  type="button"
                  onClick={() => setIsDraftWindowMinimized(!isDraftWindowMinimized)} 
                  style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', fontWeight: 'bold' }}
                  title={isDraftWindowMinimized ? "창 펼치기" : "창 최소화"}
                >
                  {isDraftWindowMinimized ? '🗖' : '➖'}
                </button>
                <button 
                  type="button"
                  onClick={() => setShowDraftModal(false)} 
                  style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}
                >
                  ✕
                </button>
              </div>
            </div>
            
            {!isDraftWindowMinimized && (
              <form onSubmit={handleCreateDraft} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>결재 양식 및 템플릿 로드</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setDocType('DRAFT');
                      applyTemplate('draft');
                    }}
                    style={{
                      flex: 1,
                      padding: '0',
                      height: '34px',
                      borderRadius: '4px',
                      border: docType === 'DRAFT' ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                      background: docType === 'DRAFT' ? '#eff6ff' : '#fff',
                      color: docType === 'DRAFT' ? '#3b82f6' : '#475569',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '12.5px',
                      boxSizing: 'border-box'
                    }}
                  >
                    일반 기안서 (템플릿 적용)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDocType('EXPENSE');
                      applyTemplate('expense');
                    }}
                    style={{
                      flex: 1,
                      padding: '0',
                      height: '34px',
                      borderRadius: '4px',
                      border: docType === 'EXPENSE' ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                      background: docType === 'EXPENSE' ? '#eff6ff' : '#fff',
                      color: docType === 'EXPENSE' ? '#3b82f6' : '#475569',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '12.5px',
                      boxSizing: 'border-box'
                    }}
                  >
                    지출 결의서 (템플릿 적용)
                  </button>
                </div>
              </div>

              {/* AI prompt draft generator */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f0fdf4', padding: '14px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  🪄 AI 기안 자동 작성 (프롬프트 입력)
                </span>
                <p style={{ fontSize: '12px', color: '#166534', margin: 0 }}>
                  작성하고 싶은 품목, 수량, 예산, 용도를 한 줄로 적으시면 AI가 정식 결재문서 초안을 통째로 구성해 드립니다.
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="text"
                    placeholder="예: 개발서버 3대 신규 교체 구매 요청. 소요 예산 15000달러."
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', backgroundColor: '#fff', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={handleAiDraftCreate}
                    style={{ padding: '0 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#15803d'}
                    onMouseLeave={e => e.currentTarget.style.background = '#16a34a'}
                  >
                    초안 생성
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                  기안 제목 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: [설계부] 서버 구매 품의서 건"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', backgroundColor: '#fff', color: '#1e293b', boxSizing: 'border-box' }}
                />
              </div>

              {docType === 'EXPENSE' && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      결의 금액 <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="number"
                      required
                      placeholder="금액을 입력하세요"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', backgroundColor: '#fff', color: '#1e293b', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '120px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>통화 선택</label>
                    <select
                      value={currency}
                      onChange={e => handleCurrencySelection(e.target.value, currency, customCurrencies, setCurrency)}
                      style={{ padding: '4px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', backgroundColor: '#fff', color: '#1e293b', cursor: 'pointer', boxSizing: 'border-box' }}
                    >
                      {[...DEFAULT_CURRENCIES, ...customCurrencies].map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="ADD_NEW_CURRENCY" style={{ color: '#2563eb', fontWeight: 'bold' }}>+ 추가등록</option>
                    </select>
                  </div>
                </div>
              )}

              {/* HTML Editor Component with Paste, KeyDown, Input events */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                  기안 내용 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f8fafc', border: '1px solid #cbd5e1', borderBottom: 'none', borderTopLeftRadius: '6px', borderTopRightRadius: '6px' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => format('bold')} style={{ padding: '4px 10px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', color: '#475569' }}>가</button>
                    <button type="button" onClick={() => format('italic')} style={{ padding: '4px 10px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontStyle: 'italic', fontSize: '12px', color: '#475569' }}>가</button>
                    <button type="button" onClick={() => format('underline')} style={{ padding: '4px 10px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', textDecoration: 'underline', fontSize: '12px', color: '#475569' }}>가</button>
                    <button type="button" onClick={insertTable} style={{ padding: '4px 10px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', color: '#475569' }}>
                      田 표 삽입
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleAiSummarize}
                    style={{ padding: '5px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'background 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
                    onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
                  >
                    🤖 AI 결재 요약 정리
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
                    fontSize: '13px',
                    lineHeight: 1.7,
                    color: '#1e293b'
                  }}
                />

                {/* Floating Slash Quick Command Menu */}
                {showSlashMenu && (
                  <div style={{
                    position: 'absolute',
                    top: '280px',
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
                    <button type="button" onClick={() => handleSelectSlashCommand('table')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12.5px', cursor: 'pointer', display: 'flex', gap: '8px', color: 'var(--text-primary)' }}>
                      <span>田</span> <b>표 삽입</b>
                    </button>
                    <button type="button" onClick={() => handleSelectSlashCommand('callout')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12.5px', cursor: 'pointer', display: 'flex', gap: '8px', color: 'var(--text-primary)' }}>
                      <span>💡</span> <b>콜아웃 상자</b>
                    </button>
                    <button type="button" onClick={() => handleSelectSlashCommand('divider')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12.5px', cursor: 'pointer', display: 'flex', gap: '8px', color: 'var(--text-primary)' }}>
                      <span>➖</span> <b>구분선</b>
                    </button>
                    <button type="button" onClick={() => handleSelectSlashCommand('quote')} style={{ padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: '12.5px', cursor: 'pointer', display: 'flex', gap: '8px', color: 'var(--text-primary)' }}>
                      <span>✍️</span> <b>인용구 블록</b>
                    </button>
                  </div>
                )}
              </div>

              {/* Drag & Drop Attachments Section */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  background: isDraggingFile ? '#eff6ff' : '#f8fafc',
                  border: isDraggingFile ? '1.5px dashed #3b82f6' : '1px dashed #cbd5e1',
                  padding: '24px 16px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  transition: 'all 0.15s'
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#64748b' }}>
                  📂 이곳에 파일이나 캡처 이미지(Ctrl+V)를 드래그 앤 드롭하여 첨부하세요.
                </span>
                
                <label style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#3b82f6',
                  color: '#fff',
                  borderRadius: '4px',
                  padding: '0 16px',
                  height: '34px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  boxSizing: 'border-box'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
                onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
                >
                  파일 선택하기
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
                
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>화면 캡처를 에디터 안에 붙여넣기(Ctrl+V) 하여 첨부할 수도 있습니다. (개당 최대 500KB)</div>
                {attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px', justifyContent: 'center' }}>
                    {attachments.map((file, idx) => (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 10px', position: 'relative' }}>
                        {file.type.startsWith('image/') ? (
                          <img
                            src={file.data}
                            alt={file.name}
                            onClick={() => setPreviewImageUrl(file.data)}
                            style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover', cursor: 'pointer' }}
                          />
                        ) : (
                          <div style={{ width: '40px', height: '40px', borderRadius: '4px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold', color: '#475569' }}>
                            FILE
                          </div>
                        )}
                        <span style={{ fontSize: '10.5px', maxWidth: '80px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: '#475569', fontWeight: 600 }} title={file.name}>{file.name}</span>
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    결재선 지정 (최종 결재권자) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 750, color: isUrgent ? '#dc2626' : '#64748b' }}>
                    <input
                      type="checkbox"
                      checked={isUrgent}
                      onChange={e => setIsUrgent(e.target.checked)}
                      style={{ accentColor: '#dc2626', width: '15px', height: '15px', cursor: 'pointer' }}
                    />
                    <span>🚨 긴급 결재 상신</span>
                  </label>
                </div>
                <select
                  required
                  value={selectedApproverId}
                  onChange={e => setSelectedApproverId(e.target.value)}
                  style={{ padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', backgroundColor: 'white', color: '#1e293b', cursor: 'pointer', boxSizing: 'border-box', width: '100%' }}
                >
                  <option value="">결재권자를 선택해 주세요</option>
                  {potentialApprovers.map(approver => (
                    <option key={approver.id} value={approver.id}>
                      {approver.name} ({approver.department || '인사'} / {approver.position || '관리자'})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px', height: '40px' }}>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ flex: 1, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s', height: '100%', boxSizing: 'border-box' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
                >
                  {isSubmitting ? '기안서 전송 중...' : '기안 상신'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDraftModal(false)}
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

      {/* Document View Details Modal */}
      {selectedDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '680px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', background: 'var(--text-primary)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>등록번호: {selectedDoc.id.substring(0, 8).toUpperCase()}</span>
                </div>
                
                <table style={{ border: '1px solid var(--border-default)', borderCollapse: 'collapse', textAlign: 'center', fontSize: '11px' }}>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid var(--border-default)', padding: '4px 8px', background: '#f8fafc', color: 'var(--text-secondary)', fontWeight: 'bold' }}>기안자</td>
                      <td style={{ border: '1px solid var(--border-default)', padding: '4px 8px', background: '#f8fafc', color: 'var(--text-secondary)', fontWeight: 'bold' }}>결재권자</td>
                    </tr>
                    <tr style={{ height: '48px' }}>
                      <td style={{ border: '1px solid var(--border-default)', padding: '8px 12px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 800, color: '#334155' }}>{selectedDoc.requesterName}</div>
                        <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>상신</div>
                      </td>
                      <td style={{ border: '1px solid var(--border-default)', padding: '8px 12px', verticalAlign: 'middle', minWidth: '70px' }}>
                        {selectedDoc.status === 'APPROVED' ? (
                          <>
                            <div style={{ fontWeight: 900, color: '#059669', fontSize: '12px' }}>✓ 승인</div>
                            <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{selectedDoc.approvedBy}</div>
                          </>
                        ) : selectedDoc.status === 'REJECTED' ? (
                          <>
                            <div style={{ fontWeight: 900, color: '#dc2626', fontSize: '12px' }}>✕ 반려</div>
                            <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{selectedDoc.approvedBy}</div>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div><strong>상신 일시:</strong> {new Date(selectedDoc.createdAt).toLocaleString()}</div>
                <div><strong>결재 권한:</strong> {selectedDoc.approverName}</div>
                {selectedDoc.docType === 'EXPENSE' && (
                  <div style={{ gridColumn: '1 / span 2', color: '#b45309', fontWeight: 'bold', fontSize: '13.5px', marginTop: '4px' }}>
                    지출 결의 총액: {formatCurrency(selectedDoc.amount || 0, selectedDoc.currency)}
                  </div>
                )}
              </div>

              {/* Content Box */}
              <div
                dangerouslySetInnerHTML={{ __html: selectedDoc.content }}
                style={{
                  border: '1px solid var(--border-default)',
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

              {/* View/Preview Attachments */}
              {selectedDoc.attachments && selectedDoc.attachments.length > 0 && (
                <div style={{ borderTop: '1px dashed var(--border-default)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '8px' }}>📎 기안 증빙 첨부파일 ({selectedDoc.attachments.length}개)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    {selectedDoc.attachments.map((file, idx) => (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px' }}>
                        {file.type.startsWith('image/') ? (
                          <img
                            src={file.data}
                            alt={file.name}
                            onClick={() => setPreviewImageUrl(file.data)}
                            style={{ width: '60px', height: '60px', borderRadius: '4px', objectFit: 'cover', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                          />
                        ) : (
                          <div style={{ width: '60px', height: '60px', borderRadius: '4px', background: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                            FILE
                          </div>
                        )}
                        <a
                          href={file.data}
                          download={file.name}
                          style={{ fontSize: '11px', color: 'var(--text-link)', fontWeight: 700, textDecoration: 'none', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title="다운로드"
                        >
                          📥 {file.name}
                        </a>
                      </div>
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

              {/* Comments Section */}
              <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#334155', margin: 0 }}>💬 결재 의견 / 댓글 ({selectedDoc.comments?.length || 0}개)</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                  {(!selectedDoc.comments || selectedDoc.comments.length === 0) ? (
                    <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', background: '#f8fafc', borderRadius: '6px', textAlign: 'center' }}>
                      등록된 의견이 없습니다.
                    </div>
                  ) : (
                    selectedDoc.comments.map((comm, idx) => (
                      <div key={idx} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <strong style={{ color: 'var(--text-secondary)' }}>{comm.senderName}</strong>
                          <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{new Date(comm.createdAt).toLocaleString()}</span>
                        </div>
                        <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{comm.content}</div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="text"
                    placeholder="결재 관련 의견 또는 보완 필요 사유 등을 입력하세요..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddComment();
                    }}
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '12.5px', outline: 'none' }}
                  />
                  <button
                    onClick={handleAddComment}
                    style={{ padding: '8px 14px', background: 'var(--text-secondary)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    의견 등록
                  </button>
                </div>
              </div>

              {/* Reject Input */}
              {showRejectInput && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#fffbeb', border: '1px dashed #ca8a04', padding: '12px', borderRadius: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#854d0e' }}>반려 사유 작성 ★</label>
                  <input
                    type="text"
                    required
                    placeholder="예: 예산 검토 필요 또는 품목 재선정 바람"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
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
                      style={{ padding: '5px 12px', background: 'var(--border-color)', border: 'none', borderRadius: '4px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
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
                style={{ padding: '8px 18px', background: 'var(--border-color)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                닫기
              </button>
            </div>

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

      {/* AI Processing overlay loader */}
      {isAiProcessing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', width: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '32px' }}>🤖</span>
            <span style={{ fontSize: '14px', fontWeight: 850, color: 'var(--text-primary)', textAlign: 'center' }}>
              AI가 기안 내용을 정밀 분석하여 의사결정 요약문 및 표를 생성하고 있습니다...
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
              AI가 요구사항을 해석하여 비즈니스 공문 기안문 초안을 작성 중입니다...
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
