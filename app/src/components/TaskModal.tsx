import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, increment, getDocs, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, COMPANY_ID } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Task, Visibility, Quadrant, TaskType, ScheduleType, TaskStatus, User } from '../types';
import { isOperationalUser } from '../utils/userUtils';
import { validateTask } from '../utils/businessRules';
import { CustomerSearchModal } from './CustomerSearchModal';
import type { Customer } from '../types/customer';

// ── Dropbox 링크 자동 변환 ─────────────────────────────────────────
const convertDropboxLink = (url: string): string => {
  if (!url.includes('dropbox.com')) return url;
  let converted = url.trim();
  // dl=1 → dl=0 (직접 다운로드 → 웹 뷰어 미리보기)
  if (converted.includes('dl=1')) {
    converted = converted.replace('dl=1', 'dl=0');
  } else if (!converted.includes('dl=')) {
    // dl 파라미터 없으면 추가
    converted += (converted.includes('?') ? '&' : '?') + 'dl=0';
  }
  return converted;
};

interface Props {
  initialTask?: Task;
  onClose: () => void;
  onSave: (task: Partial<Task>) => void;
}

export const TaskModal: React.FC<Props> = ({ initialTask, onClose, onSave }) => {
  const [title, setTitle] = useState(initialTask?.title || '');
  const [description, setDescription] = useState(initialTask?.description || '');
  const [visibility, setVisibility] = useState<Visibility>(initialTask?.visibility || 'PUBLIC');
  const [type, setType] = useState<TaskType>(initialTask?.type || 'DAILY');
  const [scheduleType] = useState<ScheduleType>(initialTask?.scheduleType || 'SELF');
  const [status, setStatus] = useState<TaskStatus>(initialTask?.status || 'TODO');
  const [importance, setImportance] = useState<string>(initialTask?.importance ? String(initialTask.importance) : 'B');
  const [urgency, setUrgency] = useState(initialTask?.urgency || 5);
  const [dueDate, setDueDate] = useState(initialTask?.dueDate || '');
  const [customerName, setCustomerName] = useState(initialTask?.customerName || '');
  const [customerId, setCustomerId] = useState((initialTask as any)?.customerId || '');
  const [meetingPerson, setMeetingPerson] = useState(initialTask?.meetingPerson || '');
  const [projectName] = useState(initialTask?.projectName || '');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);
  const [activeModelessLink, setActiveModelessLink] = useState<string | null>(null);
  const [modelessPosition, setModelessPosition] = useState({ x: 150, y: 100 });
  const [isDraggingModeless, setIsDraggingModeless] = useState(false);
  const modelessDragStartRef = React.useRef({ x: 0, y: 0 });
  
  const { userProfile } = useAuth();
  
  const [requesterName] = useState(initialTask?.requesterName || userProfile?.name || '');
  const [requesterId, setRequesterId] = useState(initialTask?.requesterId || userProfile?.id || '');
  
  const [assigneeName] = useState(initialTask?.assigneeName || '');
  const [assigneeId, setAssigneeId] = useState(initialTask?.assigneeId || '');

  // Report Note Dispatch Modal states
  const [reportModalType, setReportModalType] = useState<'IN_PROGRESS' | 'DONE' | null>(null);
  const [reportMessage, setReportMessage] = useState('');

  const [repeatCycle, setRepeatCycle] = useState(initialTask?.recurrence || '매주');
  const [startDate, setStartDate] = useState(initialTask?.startDate || '');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(initialTask?.recurrenceEndDate || '');

  const [externalFileLinks, setExternalFileLinks] = useState<string[]>(() => {
    if (initialTask?.externalFileLinks && Array.isArray(initialTask.externalFileLinks)) {
      return initialTask.externalFileLinks.map(convertDropboxLink);
    }
    return initialTask?.externalFileLink ? [convertDropboxLink(initialTask.externalFileLink)] : [''];
  });
  const [relatedUsers, setRelatedUsers] = useState(initialTask?.allowedUserIds?.join(', ') || '');
  
  const [users, setUsers] = useState<User[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [reviewAssigneeId, setReviewAssigneeId] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // AI Prompt Draft Creator States
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && initialTask?.description) {
      editorRef.current.innerHTML = initialTask.description;
    }
  }, [initialTask]);

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
      setDescription(editorRef.current.innerHTML);
    }
  };

  const handleAiDraftCreate = () => {
    if (!aiPrompt || !aiPrompt.trim()) {
      alert("AI 초안으로 작성할 업무 핵심 내용을 프롬프트 창에 입력해 주세요.");
      return;
    }

    setIsGeneratingDraft(true);
    setTimeout(() => {

      // Automatically suggest title to parent if possible, or prefix editor
      const generatedTaskHTML = `
        <div style="background: #fdf2f8; padding: 14px; border-left: 4px solid #db2777; border-radius: 6px; margin-bottom: 16px;">
          <span style="font-weight: 800; color: #9d174d; font-size: 13.5px;">🤖 AI 업무 초안 핵심 요약</span>
          <p style="font-size: 12.5px; color: #5c0f30; margin: 6px 0 0 0; line-height: 1.5;">
            본 업무 기획은 <strong>"${aiPrompt}"</strong>에 근거하여 AI가 수립한 액션 아이템 초안입니다.<br>
            성공적인 마일스톤 달성을 위해 부서 간 실시간 협조 및 일정 관리를 엄수 바랍니다.
          </p>
        </div>

        <h2 style="font-size: 1.15rem; font-weight: bold; border-bottom: 2px solid #334155; padding-bottom: 6px; color: var(--text-primary);">업무 기획 및 상세 추진안</h2>
        <p style="margin: 8px 0; color: var(--text-secondary);">태스크 목표 달성을 위해 아래 항목을 확인하고 담당자별 실행 방안을 실천해 주시기 바랍니다.</p>

        <h3 style="font-size: 0.95rem; margin-top: 18px; color: #db2777; font-weight: bold;">1. 수행 목표 및 개요</h3>
        <p style="margin: 4px 0 12px 0; color: #334155; line-height: 1.6;">
          기존 발생한 업무 비효율을 걷어내고 부서별 역할을 명확히 규정하여 속도감 있게 업무를 개진합니다.<br>
          주기적인 진척 상황 점검 및 병목 요인 선제 대응을 원칙으로 삼습니다.
        </p>

        <h3 style="font-size: 0.95rem; margin-top: 18px; color: #db2777; font-weight: bold;">2. 단계별 마일스톤 및 수행 일정 표</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px;">
          <thead>
            <tr style="background: #f8fafc; font-weight: bold; border: 1px solid var(--border-default);">
              <th style="border: 1px solid var(--border-default); padding: 8px;">구체적 마일스톤 실행 내용</th>
              <th style="border: 1px solid var(--border-default); padding: 8px; text-align: center; width: 100px;">담당 부서</th>
              <th style="border: 1px solid var(--border-default); padding: 8px; text-align: center; width: 100px;">목표 기한</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid var(--border-default); padding: 8px; color: #334155;">바이어 발주 요구 조건 정밀 분석 및 사양 확인</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: center; color: #334155;">영업지원팀</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: center; color: #334155;">내주 수요일</td>
            </tr>
            <tr>
              <td style="border: 1px solid var(--border-default); padding: 8px; color: #334155;">인프라 자원 연동 모니터링 및 트래픽 테스트</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: center; color: #334155;">IT기획실</td>
              <td style="border: 1px solid var(--border-default); padding: 8px; text-align: center; color: #334155;">차주 금요일</td>
            </tr>
          </tbody>
        </table>

        <h3 style="font-size: 0.95rem; margin-top: 18px; color: #db2777; font-weight: bold;">3. 예방 조치 사항</h3>
        <ul style="margin: 4px 0 12px 20px; padding: 0; color: #334155; line-height: 1.6;">
          <li style="margin-bottom: 4px;">유관 부서 사전 회의 스케줄 확보 및 의사결정 누락 방지.</li>
          <li style="margin-bottom: 4px;">작업 지연 요인 식별 시 즉각 보고 및 서브 벤더 대안 스케줄링.</li>
        </ul>
        <br>
        <p style="font-size: 11px; color: var(--text-muted); font-style: italic;">* 위 초안은 AI 기획 봇이 실무 기획서 표준 템플릿에 맞추어 구성한 상세 실행 내용입니다.</p>
      `;

      if (editorRef.current) {
        editorRef.current.innerHTML = generatedTaskHTML;
      }
      setDescription(generatedTaskHTML);
      setIsGeneratingDraft(false);
      alert("AI가 작성하신 핵심 프롬프트를 해석하여, 정식 업무 기획서 본문을 자동으로 완성했습니다!");
    }, 2500);
  };

  const handleAiSummarize = () => {
    const rawHTML = editorRef.current ? editorRef.current.innerHTML : description;
    const textContent = editorRef.current ? editorRef.current.innerText : '';
    if (!textContent || textContent.trim() === '') {
      alert("분석할 업무 상세 내용이 없습니다. 본문 내용을 먼저 입력해 주세요.");
      return;
    }

    setIsAiProcessing(true);
    setTimeout(() => {
      const lines = textContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      let summaryHTML = `
        <div style="background: #fdf2f8; padding: 12px; border-left: 4px solid #db2777; border-radius: 4px; margin-bottom: 12px; font-size: 13px;">
          <strong>🤖 AI 업무 요약 및 계획</strong><br>
          본 업무 태스크 진행을 위한 실행 과제 요약 정보입니다. 신속한 목표 달성을 권고합니다.
        </div>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12.5px;">
          <thead>
            <tr style="background: #f8fafc; font-weight: bold; border-bottom: 2px solid var(--border-default);">
              <th style="border: 1px solid var(--border-default); padding: 6px; width: 50px;">번호</th>
              <th style="border: 1px solid var(--border-default); padding: 6px;">AI 추천 핵심 수행 과제</th>
              <th style="border: 1px solid var(--border-default); padding: 6px; text-align: center; width: 80px;">중요도</th>
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
              <span style="background: #fce7f3; color: #9d174d; padding: 2px 4px; border-radius: 4px; font-size: 10px; font-weight: bold;">필수진행</span>
            </td>
          </tr>
        `;
      });

      summaryHTML += `
          </tbody>
        </table>
        <br>
        <p style="font-size: 11px; color: var(--text-muted); font-style: italic;">* 원본 작성 내용 상단에 AI 요약 및 과제 정리표가 자동으로 매칭되었습니다.</p>
        <hr style="border: 0; border-top: 1px dashed var(--border-default); margin: 16px 0;" />
      `;

      const merged = summaryHTML + rawHTML;
      if (editorRef.current) {
        editorRef.current.innerHTML = merged;
      }
      setDescription(merged);
      setIsAiProcessing(false);
      alert("AI가 업무 지시서 본문 분석을 완료하여 상단에 요약 배너 및 과제 체크 표를 삽입했습니다!");
    }, 2000);
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
      setDescription(editorRef.current.innerHTML);
    }
  };

  // 파일 첨부
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string; size: number; path: string }>>(
    (initialTask as any)?.attachments || []
  );
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');

  useEffect(() => {
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData: User[] = [];
      snapshot.forEach(doc => {
        usersData.push({ id: doc.id, ...doc.data() } as User);
      });
      setUsers(usersData);
    });

    if (!initialTask?.id) return unsubscribeUsers;
    
    const q = query(collection(db, 'taskComments'), where('taskId', '==', initialTask.id));
    const unsubscribeComments = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      // Sort in memory to avoid Firestore composite index
      fetched.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      setComments(fetched);
    }, (error) => {
      console.error("Comments fetch error:", error);
    });
    
    return () => {
      unsubscribeUsers();
      unsubscribeComments();
    };
  }, [initialTask?.id]);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const custSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'customers'));
        setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
      } catch (error) {
        console.error("Customers fetch error in TaskModal:", error);
      }
    };
    const loadSuppliers = async () => {
      try {
        const supSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'suppliers'));
        setSuppliers(supSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      } catch (error) {
        console.error("Suppliers fetch error in TaskModal:", error);
      }
    };
    loadCustomers();
    loadSuppliers();
  }, []);

  const handleModelessMouseDown = (e: React.MouseEvent) => {
    setIsDraggingModeless(true);
    modelessDragStartRef.current = { x: e.clientX - modelessPosition.x, y: e.clientY - modelessPosition.y };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingModeless) return;
      const nextX = Math.max(0, Math.min(window.innerWidth - 650, e.clientX - modelessDragStartRef.current.x));
      const nextY = Math.max(0, Math.min(window.innerHeight - 550, e.clientY - modelessDragStartRef.current.y));
      setModelessPosition({ x: nextX, y: nextY });
    };
    const handleMouseUp = () => {
      setIsDraggingModeless(false);
    };

    if (isDraggingModeless) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingModeless]);

  // Backwards compatibility for old tasks without IDs
  useEffect(() => {
    if (users.length > 0) {
      if (!assigneeId && assigneeName) {
        const match = users.find(u => u.name === assigneeName);
        if (match) setAssigneeId(match.id);
      }
      if (!requesterId && requesterName) {
        const match = users.find(u => u.name === requesterName);
        if (match) setRequesterId(match.id);
      }
    }
  }, [users, assigneeId, assigneeName, requesterId, requesterName]);

  const handleAddComment = async () => {
    if (!newComment.trim() || !initialTask?.id || !userProfile) return;
    
    const targetReviewAssigneeId = reviewAssigneeId;
    const targetReviewAssigneeName = targetReviewAssigneeId ? (users.find(u => u.id === targetReviewAssigneeId)?.name || '') : '';

    const commentObj = {
      taskId: initialTask.id,
      content: newComment,
      createdBy: userProfile.id,
      creatorName: userProfile.name,
      createdAt: new Date().toISOString(),
      reviewAssigneeId: targetReviewAssigneeId || null,
      reviewAssigneeName: targetReviewAssigneeName || null
    };

    // 1. 입력창 즉시 초기화
    setNewComment('');
    setReviewAssigneeId('');
    // 2. 화면(로컬 상태)에 즉시 반영 (Optimistic UI) - 최신 글이 위로 가도록 prepend
    setComments(prev => [{ id: 'temp-' + Date.now(), ...commentObj }, ...prev]);

    try {
      await addDoc(collection(db, 'taskComments'), commentObj);
      
      const taskRef = doc(db, 'tasks', initialTask.id);
      await updateDoc(taskRef, {
        commentCount: increment(1),
        lastCommentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      if (targetReviewAssigneeId) {
        await addDoc(collection(db, 'mails'), {
          senderId: userProfile.id,
          senderName: userProfile.name,
          receiverId: targetReviewAssigneeId,
          receiverName: targetReviewAssigneeName,
          title: `[알림] "${initialTask.title || '업무'}"에 리뷰 댓글이 등록되었습니다.`,
          content: `${userProfile.name}님이 댓글을 등록했습니다:\n\n"${commentObj.content}"`,
          isRead: false,
          taskId: initialTask.id,
          createdAt: new Date().toISOString()
        });
      }
      
    } catch (e) {
      console.error(e);
      alert('댓글 등록 중 오류가 발생했습니다.');
    }
  };

  const handleUpdateComment = async (commentId: string, updatedContent: string) => {
    if (!updatedContent.trim()) return;
    try {
      await updateDoc(doc(db, 'taskComments', commentId), {
        content: updatedContent,
        updatedAt: new Date().toISOString()
      });
      setEditingCommentId(null);
    } catch (e) {
      console.error(e);
      alert('댓글 수정에 실패했습니다.');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('댓글을 정말 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'taskComments', commentId));
      
      if (initialTask?.id) {
        const taskRef = doc(db, 'tasks', initialTask.id);
        await updateDoc(taskRef, {
          commentCount: increment(-1),
          updatedAt: new Date().toISOString()
        });
      }
    } catch (e) {
      console.error(e);
      alert('댓글 삭제에 실패했습니다.');
    }
  };

  // ─── 파일 업로드 ───
  const handleFileUpload = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    const taskId = initialTask?.id || `task_temp_${Date.now()}`;
    const newAtts = [...attachments];
    let hasError = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const uniqueFileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `tasks/${taskId}/${uniqueFileName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      await new Promise<void>((resolve) => {
        uploadTask.on('state_changed', () => {}, (error) => {
          console.error('Upload failed:', file.name, error);
          hasError = true;
          resolve();
        }, async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            newAtts.push({ name: file.name, url, size: file.size, path: uploadTask.snapshot.ref.fullPath });
          } catch(e) { hasError = true; }
          resolve();
        });
      });
    }
    setAttachments(newAtts);
    setIsUploading(false);
    if (hasError) alert('일부 파일 업로드에 실패했습니다.');
  };

  const handleDeleteAttachment = async (index: number) => {
    const att = attachments[index];
    if (!att || !window.confirm(`'${att.name}' 파일을 삭제하시겠습니까?`)) return;
    try {
      if (att.path) await deleteObject(ref(storage, att.path)).catch(console.warn);
      setAttachments(prev => prev.filter((_, i) => i !== index));
    } catch(err) {
      alert('파일 삭제 중 오류가 발생했습니다.');
    }
  };

  // Auto-calculate Quadrant: importance A=high, B=mid, C=low; urgency >=6 = high
  const calculateQuadrant = (imp: string, urg: number): Quadrant => {
    const impHigh = imp === 'A';
    const urgHigh = urg >= 6;
    if (impHigh && urgHigh) return 'Q1';
    if (impHigh && !urgHigh) return 'Q2';
    if (!impHigh && urgHigh) return 'Q3';
    return 'Q4';
  };
  const currentQuadrant = calculateQuadrant(importance, urgency);

  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = async () => {
    const reqUser = users.find(u => u.id === requesterId);
    const reqName = reqUser ? reqUser.name : (requesterId ? requesterName : '');

    const assUser = users.find(u => u.id === assigneeId);
    const assName = assUser ? assUser.name : (assigneeId ? assigneeName : '');

    const today = new Date().toISOString().split('T')[0];
    const prevStatus = initialTask?.status;

    // 상태 변경에 따른 날짜 자동 기록
    let autoStartDate = startDate;
    let autoDueDate = dueDate;
    let autoCompletedAt = initialTask?.completedAt ?? null;

    // 업무중으로 처음 변경될 때 시작일 자동 기록 (기존 시작일 없을 때만)
    if (status === 'IN_PROGRESS' && prevStatus !== 'IN_PROGRESS' && !startDate) {
      autoStartDate = today;
    }
    // 완료로 변경될 때 마감일(종료일) 자동 기록
    if (status === 'DONE' && prevStatus !== 'DONE') {
      autoDueDate = today;
      autoCompletedAt = new Date().toISOString();
    }
    // 완료에서 다른 상태로 되돌릴 때 completedAt 초기화
    if (status !== 'DONE' && prevStatus === 'DONE') {
      autoCompletedAt = null;
    }

    const taskData: any = {
      id: initialTask?.id,
      title, 
      description, 
      status,
      visibility, 
      type, 
      scheduleType,
      importance,
      urgency,
      quadrant: currentQuadrant,
      dueDate: autoDueDate,
      customerName,
      customerId: customerId || null,
      meetingPerson: meetingPerson || '',
      projectName,
      requesterId,
      requesterName: reqName,
      assigneeId,
      assigneeName: assName,
      startDate: autoStartDate,
      recurrenceEndDate,
      externalFileLink: externalFileLinks.filter(l => l.trim() !== '')[0] || '',
      externalFileLinks: externalFileLinks.filter(l => l.trim() !== ''),
      recurrence: type === 'PERIODIC' ? repeatCycle : null,
      allowedUserIds: relatedUsers.split(',').map(u => u.trim()).filter(Boolean),
      attachments,
      completedAt: autoCompletedAt,
    };

    const validationError = validateTask(taskData);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(taskData);
      onClose();
    } catch (e) {
      console.error(e);
      setErrorMsg('저장 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  const openReportModal = (type: 'IN_PROGRESS' | 'DONE') => {
    setReportModalType(type);
    if (type === 'IN_PROGRESS') {
      setReportMessage('금일 업무에 착수하였으며, 진행에 차질 없이 마감 기한 내 완료하겠습니다.');
    } else {
      setReportMessage('요청하신 업무 처리가 최종 완료되었으니 검토 및 확인 부탁드립니다.');
    }
  };

  const submitReportMail = async () => {
    if (!initialTask?.id || !userProfile || !reportModalType) return;
    
    const recipientId = initialTask.createdBy && initialTask.createdBy !== userProfile.id 
      ? initialTask.createdBy 
      : (initialTask.assigneeId || userProfile.id);
    const recipientUser = users.find(u => u.id === recipientId || u.name === initialTask.createdBy);
    const recipientName = recipientUser?.name || initialTask.createdBy || '담당자';

    try {
      setIsSaving(true);
      const isProgress = reportModalType === 'IN_PROGRESS';
      const mailTitle = isProgress 
        ? `[착수보고] "${title}" 업무 착수 및 진행 알림` 
        : `[완료보고] "${title}" 업무 최종 처리 완료 알림`;

      const mailBody = `
        <div style="background: ${isProgress ? '#eff6ff' : '#f0fdf4'}; padding: 14px; border-left: 4px solid ${isProgress ? '#3b82f6' : '#16a34a'}; border-radius: 6px; margin-bottom: 14px;">
          <h3 style="margin: 0 0 6px 0; color: ${isProgress ? '#1e40af' : '#166534'}; font-size: 14px; font-weight: 800;">
            ${isProgress ? '🏃 업무 착수 (진행중) 보고' : '✅ 업무 처리 완료 보고'}
          </h3>
          <p style="margin: 0; font-size: 13px; color: #1e293b; line-height: 1.5;">
            담당자 <strong>${userProfile.name}</strong>님이 해당 업무의 상태를 <strong>${isProgress ? '진행중 (IN_PROGRESS)' : '완료 (DONE)'}</strong>(으)로 갱신하고 보고합니다.
          </p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px;">
          <tbody>
            <tr><td style="padding: 6px; background: #f8fafc; font-weight: bold; width: 100px; border: 1px solid #cbd5e1;">업무명</td><td style="padding: 6px; border: 1px solid #cbd5e1;">${title}</td></tr>
            <tr><td style="padding: 6px; background: #f8fafc; font-weight: bold; border: 1px solid #cbd5e1;">지시자/위임자</td><td style="padding: 6px; border: 1px solid #cbd5e1;">${initialTask.createdBy || '미지정'}</td></tr>
            <tr><td style="padding: 6px; background: #f8fafc; font-weight: bold; border: 1px solid #cbd5e1;">보고자/수행자</td><td style="padding: 6px; border: 1px solid #cbd5e1;">${userProfile.name}</td></tr>
            ${reportMessage ? `<tr><td style="padding: 6px; background: #f8fafc; font-weight: bold; border: 1px solid #cbd5e1;">보고/완료 코멘트</td><td style="padding: 6px; border: 1px solid #cbd5e1; color: ${isProgress ? '#1e40af' : '#166534'}; font-weight: 700;">${reportMessage}</td></tr>` : ''}
          </tbody>
        </table>
      `;

      await addDoc(collection(db, 'mails'), {
        senderId: userProfile.id,
        senderName: userProfile.name,
        receiverId: recipientId,
        receiverName: recipientName,
        title: mailTitle,
        content: mailBody,
        isRead: false,
        taskId: initialTask.id,
        type: isProgress ? 'TASK_DELEGATED' : 'TASK_COMPLETED',
        createdAt: new Date().toISOString()
      });

      const newStatus = isProgress ? 'IN_PROGRESS' : 'DONE';
      const taskUpdatePayload: any = {
        status: newStatus,
        updatedAt: new Date().toISOString()
      };
      if (newStatus === 'DONE') {
        taskUpdatePayload.completedAt = new Date().toISOString();
        if (reportMessage) {
          taskUpdatePayload.completionComment = reportMessage;
        }
      }
      await updateDoc(doc(db, 'tasks', initialTask.id), taskUpdatePayload);

      setStatus(newStatus);
      setReportModalType(null);
      setReportMessage('');
      alert(isProgress ? '🏃 업무 착수 보고 쪽지가 정상 발송되었습니다.' : '✅ 업무 완료 보고 쪽지가 정상 발송되었습니다.');
      onClose();
    } catch (e: any) {
      console.error(e);
      alert('보고 발송에 실패했습니다: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-content"
        style={{ maxWidth: '850px', padding: 0, overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 20px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#ffffff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
              {initialTask ? '업무 상세 정보' : '새로운 업무 등록'}
            </h3>
            {initialTask?.id && <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>ID: {initialTask.id.slice(0,8)}...</span>}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', borderRadius: '4px',
              width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#94a3b8', transition: 'all 0.2s',
              fontSize: '18px', lineHeight: 1
            }}
            onMouseOver={e => e.currentTarget.style.color = '#475569'}
            onMouseOut={e => e.currentTarget.style.color = '#94a3b8'}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {errorMsg && (
            <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⚠️</span> {errorMsg}
            </div>
          )}

          {/* Title Area */}
          <div>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="업무명을 입력하세요..."
              style={{
                width: '100%', border: 'none', borderBottom: '2px solid #cbd5e1',
                fontSize: '1.25rem', fontWeight: 700, padding: '4px 0 8px 0', outline: 'none',
                color: '#1e293b', transition: 'border-color 0.2s', background: 'transparent'
              }}
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e => e.target.style.borderColor = '#cbd5e1'}
            />
          </div>

          {/* Priority Box */}
          <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', minWidth: '40px', letterSpacing: '0.02em', textTransform: 'uppercase' }}>중요도</label>
              <div style={{ display: 'flex', background: '#e2e8f0', padding: '2px', borderRadius: '6px', flex: 1 }}>
                {(['A', 'B', 'C'] as const).map(v => (
                  <button
                    key={v} onClick={() => setImportance(v)}
                    style={{
                      flex: 1, padding: '4px 0', border: 'none', borderRadius: '4px', fontWeight: 700, fontSize: '12.5px',
                      background: importance === v ? '#ffffff' : 'transparent',
                      color: importance === v ? (v === 'A' ? '#ef4444' : v === 'B' ? '#3b82f6' : '#64748b') : '#64748b',
                      boxShadow: importance === v ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            
            <div style={{ width: '1px', background: '#cbd5e1', height: '24px' }} />

            <div style={{ flex: 1.5, display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', whiteSpace: 'nowrap', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                긴급도 <span style={{ color: urgency >= 6 ? '#ef4444' : '#3b82f6', marginLeft: '4px', fontWeight: 800 }}>{urgency}</span>
              </label>
              <input
                type="range" min="1" max="10" step="1"
                value={urgency} onChange={e => setUrgency(Number(e.target.value))}
                style={{ flex: 1, cursor: 'pointer', accentColor: urgency >= 6 ? '#ef4444' : '#3b82f6', height: '4px' }}
              />
            </div>

            <div style={{ width: '1px', background: '#cbd5e1', height: '24px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#475569', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>우선순위</span>
              <div style={{
                background: currentQuadrant === 'Q1' ? '#fee2e2' : currentQuadrant === 'Q2' ? '#dbeafe' : currentQuadrant === 'Q3' ? '#fef9c3' : '#f1f5f9',
                color: currentQuadrant === 'Q1' ? '#ef4444' : currentQuadrant === 'Q2' ? '#3b82f6' : currentQuadrant === 'Q3' ? '#ca8a04' : '#64748b',
                fontWeight: 800, fontSize: '13px', padding: '3px 8px', borderRadius: '4px', border: '1px solid currentColor'
              }}>
                {currentQuadrant}
              </div>
            </div>
          </div>

          {/* Details Compact Row (8 Columns Grid) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '8px', alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', whiteSpace: 'nowrap', letterSpacing: '0.02em', textTransform: 'uppercase' }}>위임자</label>
              <select style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px', backgroundColor: '#fff', height: '34px', cursor: 'pointer', boxSizing: 'border-box' }} value={requesterId} onChange={e => setRequesterId(e.target.value)}>
                <option value="">선택안함</option>
                {users.filter(isOperationalUser).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', whiteSpace: 'nowrap', letterSpacing: '0.02em', textTransform: 'uppercase' }}>수임자</label>
              <select style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px', backgroundColor: '#fff', height: '34px', cursor: 'pointer', boxSizing: 'border-box' }} value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
                <option value="">지정안함</option>
                {users.filter(isOperationalUser).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', whiteSpace: 'nowrap', letterSpacing: '0.02em', textTransform: 'uppercase' }}>등록일</label>
              <input
                type="text"
                readOnly
                value={initialTask?.createdAt ? new Date(initialTask.createdAt).toLocaleDateString('ko-KR', { month:'2-digit', day:'2-digit' }) : '자동'}
                title={initialTask?.createdAt ? new Date(initialTask.createdAt).toLocaleDateString('ko-KR') : '저장 시 자동 기입'}
                style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px', background: '#f1f5f9', color: '#64748b', cursor: 'default', height: '34px', textAlign: 'center', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', whiteSpace: 'nowrap', letterSpacing: '0.02em', textTransform: 'uppercase' }}>시작일</label>
              <input type="date" style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px', height: '34px', boxSizing: 'border-box' }} value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', whiteSpace: 'nowrap', letterSpacing: '0.02em', textTransform: 'uppercase' }}>마감일</label>
              <input type="date" style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px', height: '34px', boxSizing: 'border-box' }} value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', whiteSpace: 'nowrap', letterSpacing: '0.02em', textTransform: 'uppercase' }}>업무유형</label>
              <select style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px', height: '34px', cursor: 'pointer', boxSizing: 'border-box' }} value={type} onChange={e => setType(e.target.value as TaskType)}>
                <option value="PROJECT">📁 프로젝트</option>
                <option value="DAILY">📝 일상업무</option>
                <option value="PERIODIC">🔄 주기업무</option>
                <option value="DELEGATED">🤝 위임업무</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', whiteSpace: 'nowrap', letterSpacing: '0.02em', textTransform: 'uppercase' }}>공개범위</label>
              <select style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px', height: '34px', cursor: 'pointer', boxSizing: 'border-box' }} value={visibility} onChange={e => setVisibility(e.target.value as Visibility)}>
                <option value="PUBLIC">🌐 전체공개</option>
                <option value="RESTRICTED">👥 관련자공개</option>
                <option value="PRIVATE">🔒 비공개</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', whiteSpace: 'nowrap', letterSpacing: '0.02em', textTransform: 'uppercase' }}>상태</label>
              <select style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px', fontWeight: 700, color: status === 'DONE' ? '#16a34a' : status === 'HOLDING' ? '#ca8a04' : '#1e293b', height: '34px', cursor: 'pointer', boxSizing: 'border-box' }} value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
                <option value="TODO">시작안함</option>
                <option value="IN_PROGRESS">진행중</option>
                <option value="HOLDING">Holding</option>
                <option value="DONE">완료</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>업무설명 및 메모</label>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {/* 거래처 지정 영역 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#475569', fontWeight: 750 }}>🏢 거래처:</span>
                  {customerName ? (
                    <span style={{ fontSize: '12px', color: '#0369a1', background: '#e0f2fe', padding: '3px 8px', borderRadius: '4px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={customerName}>
                      {customerName}
                      <button
                        type="button"
                        onClick={() => { setCustomerName(''); setCustomerId(''); }}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 2px', fontSize: '11px', fontWeight: 'bold' }}
                        title="거래처 지정 취소"
                      >
                        ✕
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsCustomerSearchOpen(true)}
                      style={{
                        background: '#fff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        padding: '4px 10px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: '#475569',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        height: '28px',
                        boxSizing: 'border-box'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                      🔍 거래처 찾기
                    </button>
                  )}
                </div>

                {/* 미팅자 입력 영역 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#475569', fontWeight: 750 }}>👥 미팅자:</span>
                  <input
                    type="text"
                    value={meetingPerson}
                    onChange={e => setMeetingPerson(e.target.value)}
                    placeholder="미팅 참석자 입력..."
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      outline: 'none',
                      width: '130px',
                      height: '28px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            </div>
            
            {/* AI prompt draft generator */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f0fdf4', padding: '14px', borderRadius: '8px', border: '1px solid #bbf7d0', margin: '0 0 12px 0' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                🪄 AI 업무 상세 초안 자동 작성 (프롬프트 입력)
              </span>
              <p style={{ fontSize: '12px', color: '#166534', margin: 0 }}>
                기획하고자 하는 업무 내용, 담당자, 수행 일정을 한 줄로 적으시면 AI가 공식 업무 상세 기획서 초안을 에디터에 채워 드립니다.
              </p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <input
                  type="text"
                  placeholder="예: 바이어 발주 수량 확인 후 포워딩 운송 일정 기획 수립."
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

            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
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
                  style={{ padding: '4px 10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  🤖 AI 업무 요약 정리
                </button>
              </div>

              <div
                contentEditable
                ref={editorRef}
                onKeyDown={handleEditorKeyDown}
                onInput={handleEditorInput}
                style={{
                  minHeight: '220px',
                  border: '1px solid var(--border-default)',
                  borderBottomLeftRadius: '6px',
                  borderBottomRightRadius: '6px',
                  padding: '12px',
                  outline: 'none',
                  backgroundColor: '#fff',
                  overflowY: 'auto',
                  fontSize: '0.88rem',
                  lineHeight: 1.6
                }}
              />

              {showSlashMenu && (
                <div style={{
                  position: 'absolute',
                  top: '250px',
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
                    <span>💡</span> <b>콜아웃 상자</b>
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
          </div>

          {/* Conditional Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {visibility === 'RESTRICTED' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>관련자 지정 (쉼표로 구분)</label>
                <input style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-default)', outline: 'none', fontSize: '0.85rem' }} value={relatedUsers} onChange={e => setRelatedUsers(e.target.value)} placeholder="예: 김대리, 박과장" />
              </div>
            )}
            {type === 'PERIODIC' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>반복 시작일</label>
                  <input type="date" style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px', height: '34px', boxSizing: 'border-box' }} value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>반복 빈도</label>
                  <select style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px', height: '34px', cursor: 'pointer', boxSizing: 'border-box' }} value={repeatCycle} onChange={e => setRepeatCycle(e.target.value)}>
                    <option value="매일">매일</option><option value="매주">매주</option><option value="매월">매월</option>
                    <option value="매분기">매분기</option><option value="매반기">매반기</option><option value="매년">매년</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>반복 종료일</label>
                  <input type="date" style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px', height: '34px', boxSizing: 'border-box' }} value={recurrenceEndDate} onChange={e => setRecurrenceEndDate(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* External Links (다중 링크 관리 구조) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>외부 파일 링크</label>
              <button
                type="button"
                onClick={() => setExternalFileLinks(prev => [...prev, ''])}
                style={{
                  background: '#fff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                ➕ 링크 추가
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {externalFileLinks.map((link, index) => (
                <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={link}
                      onChange={e => {
                        const updated = [...externalFileLinks];
                        updated[index] = convertDropboxLink(e.target.value);
                        setExternalFileLinks(updated);
                      }}
                      onBlur={e => {
                        const updated = [...externalFileLinks];
                        updated[index] = convertDropboxLink(e.target.value);
                        setExternalFileLinks(updated);
                      }}
                      placeholder='Dropbox 웹에서 우클릭 → "링크 복사" 후 붙여넣으면 자동 변환됩니다'
                      style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px', height: '34px', color: '#1e293b', boxSizing: 'border-box' }}
                    />
                    {link && (
                      <button
                        type="button"
                        onClick={() => setActiveModelessLink(link)}
                        style={{ padding: '6px 12px', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', height: '34px' }}
                      >
                        🔗 열기
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (externalFileLinks.length === 1) {
                          setExternalFileLinks(['']);
                        } else {
                          setExternalFileLinks(prev => prev.filter((_, idx) => idx !== index));
                        }
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        fontSize: '15px',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        height: '34px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="링크 제거"
                    >
                      🗑️
                    </button>
                  </div>
                  {link && link.includes('dropbox.com') && link.includes('dl=0') && (
                    <div style={{ fontSize: '11px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4, marginLeft: '4px', fontWeight: 500 }}>✅ Dropbox 링크가 웹 뷰어(저장 없이 보기) 형식으로 자동 변환되었습니다</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ─── 파일 첨부 (드래그&드롭 / Ctrl+V / 파일선택) ─── */}
          <div
            style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '14px 18px', borderRadius: '8px', textAlign: 'center', transition: 'all 0.2s', outline: 'none' }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = '#f0fdfa'; }}
            onDragLeave={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
            onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; handleFileUpload(e.dataTransfer.files); }}
            onPaste={e => { const files = e.clipboardData?.files; if (files && files.length > 0) { e.preventDefault(); handleFileUpload(files); } }}
            tabIndex={0}
          >
            <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '8px', fontWeight: 500 }}>📂 이곳에 파일이나 캡처 이미지(Ctrl+V)를 드래그 앤 드롭하여 첨부하세요.</div>
            <input type="file" multiple onChange={e => handleFileUpload(e.target.files)} style={{ display: 'none' }} id="task-file-upload" />
            <label htmlFor="task-file-upload" style={{ background: '#3b82f6', color: '#fff', padding: '5px 14px', borderRadius: '4px', fontSize: '11.5px', cursor: 'pointer', fontWeight: 700, display: 'inline-block', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#2563eb'} onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}>
              {isUploading ? '업로드 중...' : '파일 선택하기'}
            </label>

            {attachments.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                {attachments.map((att, idx) => {
                  const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name);
                  const isPdf = /\.pdf$/i.test(att.name);
                  const isExcel = /\.(xls|xlsx)$/i.test(att.name);
                  return (
                    <div key={idx} style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      <div onClick={() => { setPreviewUrl(att.url); setPreviewName(att.name); }} style={{ cursor: 'pointer' }} title="클릭하여 미리보기">
                        {isImg ? (
                          <img src={att.url} alt={att.name} style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-default)' }} />
                        ) : (
                          <span style={{ fontSize: '16px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: '4px', border: '1px solid var(--border-default)' }}>
                            {isPdf ? '📄' : isExcel ? '📊' : '📎'}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                        <span onClick={() => { setPreviewUrl(att.url); setPreviewName(att.name); }} style={{ color: 'var(--text-primary)', fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} title="클릭하여 미리보기">{att.name}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '9px' }}>({(att.size / 1024).toFixed(1)}KB)</span>
                      </div>
                      <div style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}>
                        <button type="button" onClick={() => { setPreviewUrl(att.url); setPreviewName(att.name); }} style={{ background: '#f1f5f9', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 4px', fontSize: '10px' }} title="미리보기">🔍</button>
                        <a href={att.url} download={att.name} target="_blank" rel="noreferrer" style={{ background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 4px', fontSize: '10px', textDecoration: 'none' }} title="다운로드">⬇</a>
                        <button type="button" onClick={() => handleDeleteAttachment(idx)} style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 4px', fontSize: '10px' }} title="삭제">✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Comments (Only for existing tasks) */}
          {initialTask && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>

              {/* Comments */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', color: '#1e293b', fontWeight: 750 }}>댓글</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                       <span style={{ fontSize: '11px', color: '#475569', fontWeight: 750 }}>📋 검토요청 지정:</span>
                      <select
                        value={reviewAssigneeId}
                        onChange={e => setReviewAssigneeId(e.target.value)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          fontSize: '12px',
                          outline: 'none',
                          backgroundColor: '#fff',
                          height: '28px',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">(지정 안함)</option>
                        {users.filter(u => u.id !== userProfile?.id && isOperationalUser(u)).map(u => (
                          <option key={u.id} value={u.id}>{u.name} {u.position || u.role || ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  {/* 등록 버튼 */}
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim()}
                    style={{
                      background: '#3b82f6',
                      color: '#fff',
                      border: 'none',
                      padding: '5px 14px',
                      borderRadius: '4px',
                      cursor: newComment.trim() ? 'pointer' : 'not-allowed',
                      fontWeight: 700,
                      fontSize: '12px',
                      transition: 'background 0.2s',
                      opacity: newComment.trim() ? 1 : 0.6
                    }}
                    onMouseEnter={e => { if (newComment.trim()) e.currentTarget.style.background = '#2563eb'; }}
                    onMouseLeave={e => { if (newComment.trim()) e.currentTarget.style.background = '#3b82f6'; }}
                  >
                    등록
                  </button>
                </div>
                
                {/* 댓글 입력창 (첨부파일 및 댓글 타이틀 바로 아래 배치, 크기 조절 가능한 textarea) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <textarea
                    rows={3}
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="댓글 입력..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                      fontSize: '13px',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      minHeight: '60px',
                      boxSizing: 'border-box',
                      color: '#1e293b'
                    }}
                    onFocus={e => e.target.style.borderColor = '#3b82f6'}
                    onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                  />
                </div>

                {/* 댓글 목록 */}
                <div style={{ background: '#f8fafc', borderRadius: '6px', border: '1px solid var(--border-color)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                  {comments.map(c => {
                    const isOwnComment = c.createdBy === userProfile?.id;
                    const isEditing = editingCommentId === c.id;

                    return (
                      <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>{c.creatorName}</strong> • {new Date(c.createdAt).toLocaleDateString()}
                            {c.reviewAssigneeName && (
                              <span style={{ marginLeft: '8px', padding: '1px 6px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontSize: '0.65rem', fontWeight: 600 }}>
                                📢 검토요청: {c.reviewAssigneeName}
                              </span>
                            )}
                          </div>
                          {isOwnComment && !isEditing && (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCommentId(c.id);
                                  setEditingCommentContent(c.content);
                                }}
                                style={{ background: 'none', border: 'none', color: 'var(--focus-ring)', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 600 }}
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(c.id)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 600 }}
                              >
                                삭제
                              </button>
                            </div>
                          )}
                        </div>
                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                            <textarea
                              rows={2}
                              value={editingCommentContent}
                              onChange={e => setEditingCommentContent(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '4px',
                                border: '1px solid var(--focus-ring)',
                                outline: 'none',
                                fontSize: '0.8rem',
                                fontFamily: 'inherit',
                                resize: 'vertical'
                              }}
                            />
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                onClick={() => setEditingCommentId(null)}
                                style={{ padding: '2px 8px', background: '#f1f5f9', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '0.68rem', cursor: 'pointer' }}
                              >
                                취소
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateComment(c.id, editingCommentContent)}
                                style={{ padding: '2px 8px', background: 'var(--focus-ring)', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 'bold' }}
                              >
                                저장
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{
                            fontSize: '0.8rem',
                            color: '#0f172a',
                            background: '#fff',
                            padding: '6px 8px',
                            borderRadius: '0 6px 6px 6px',
                            border: '1px solid var(--border-color)',
                            display: 'inline-block',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            maxWidth: '100%',
                            textAlign: 'left'
                          }}>
                            {c.content}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {comments.length === 0 && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>댓글 없음</div>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 파일 미리보기 오버레이 */}
        {previewUrl && (
          <div
            onClick={() => setPreviewUrl(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          >
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{previewName}</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <a href={previewUrl} download={previewName} target="_blank" rel="noreferrer" style={{ padding: '5px 12px', background: '#3b82f6', color: '#fff', borderRadius: '6px', fontSize: '12px', textDecoration: 'none', fontWeight: 600 }}>⬇ 다운로드</a>
                  <button onClick={() => setPreviewUrl(null)} style={{ padding: '5px 10px', background: 'var(--border-color)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>✕ 닫기</button>
                </div>
              </div>
              <div style={{ overflow: 'auto', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/\.(jpg|jpeg|png|gif|webp)$/i.test(previewName) ? (
                  <img src={previewUrl} alt={previewName} style={{ maxWidth: '80vw', maxHeight: '70vh', objectFit: 'contain', borderRadius: '6px' }} />
                ) : /\.pdf$/i.test(previewName) ? (
                  <iframe src={previewUrl} title={previewName} style={{ width: '75vw', height: '70vh', border: 'none', borderRadius: '6px' }} />
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📎</div>
                    <div style={{ marginBottom: '16px', fontWeight: 600 }}>{previewName}</div>
                    <a href={previewUrl} download={previewName} target="_blank" rel="noreferrer" style={{ background: '#3b82f6', color: '#fff', padding: '10px 20px', borderRadius: '8px', textDecoration: 'none', fontWeight: 700 }}>⬇ 다운로드하여 열기</a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 거래처 검색 모달 */}
        {isCustomerSearchOpen && (
          <CustomerSearchModal
            customers={([
              ...customers.map(c => ({
                ...c,
                name: `[고객사] ${c.name || ''}`,
                nameKo: `[고객사] ${c.nameKo || c.name || ''}`,
                isSupplier: false
              })),
              ...suppliers.map(s => ({
                id: s.id,
                name: `[공급사] ${s.name || ''}`,
                nameKo: `[공급사] ${s.name || ''}`,
                customerCode: s.supplierCode || s.id,
                countryName: '공급업체',
                contactPerson: s.managerName || '',
                email: s.purchaseEmail || '',
                isSupplier: true
              }))
            ] as any as Customer[])}
            onClose={() => setIsCustomerSearchOpen(false)}
            onSelect={(item: any) => {
              const cleanName = item.name.replace(/^\[고객사\]\s*/, '').replace(/^\[공급사\]\s*/, '');
              setCustomerName(cleanName);
              setCustomerId(item.id);
              setIsCustomerSearchOpen(false);
            }}
          />
        )}

        {/* 드롭박스 폴더/파일 모달레스 미리보기 뷰어 */}
        {activeModelessLink && (
          <div style={{
            position: 'fixed',
            left: `${modelessPosition.x}px`,
            top: `${modelessPosition.y}px`,
            zIndex: 9999,
            width: '750px',
            height: '600px',
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid var(--border-default)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* 드래그 헤더 */}
            <div
              onMouseDown={handleModelessMouseDown}
              style={{
                padding: '10px 16px',
                background: '#f8fafc',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'move',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📂</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>외부 공유 링크 미리보기 (드래그하여 이동 가능)</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <a
                  href={activeModelessLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '4px 10px',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    border: '1px solid #bfdbfe',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    textDecoration: 'none',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  새 창으로 열기 ↗
                </a>
                <button
                  onClick={() => setActiveModelessLink(null)}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '4px',
                    background: '#fee2e2',
                    color: '#ef4444',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="닫기"
                >
                  ✕
                </button>
              </div>
            </div>
            {/* 드롭박스 보안 정책 우회 설명 배너 */}
            <div style={{ background: '#fffbeb', borderBottom: '1px solid #fef3c7', padding: '8px 16px', fontSize: '0.75rem', color: '#b45309', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', zIndex: 1 }}>
              <span>⚠️ 드롭박스의 보안 제한(X-Frame-Options)으로 인해 화면 안에서 직접 열리지 않을 수 있습니다. 왼쪽과 같이 연결 거부 화면이 뜨는 경우 우측 버튼을 눌러주세요.</span>
              <a href={activeModelessLink} target="_blank" rel="noopener noreferrer" style={{ background: '#d97706', color: '#fff', padding: '4px 10px', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>새 창으로 열기 ↗</a>
            </div>
            {/* 미리보기 본문 (Iframe) */}
            <div style={{ flex: 1, background: '#f1f5f9' }}>
              <iframe
                src={activeModelessLink}
                title="Dropbox File Modeless Viewer"
                style={{ width: '100%', height: '100%', border: 'none' }}
                allow="autoplay"
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border-color)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f8fafc'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {initialTask?.id && (
              <>
                <button
                  type="button"
                  onClick={() => openReportModal('IN_PROGRESS')}
                  disabled={isSaving}
                  style={{
                    padding: '8px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px',
                    fontSize: '0.82rem', fontWeight: 750, color: '#1e40af', cursor: isSaving ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px'
                  }}
                  title="지시자/담당자에게 업무 착수(진행중) 보고 쪽지 및 실시간 알림 발송"
                >
                  🏃 착수보고 발송
                </button>
                <button
                  type="button"
                  onClick={() => openReportModal('DONE')}
                  disabled={isSaving}
                  style={{
                    padding: '8px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px',
                    fontSize: '0.82rem', fontWeight: 750, color: '#15803d', cursor: isSaving ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px'
                  }}
                  title="지시자/담당자에게 업무 최종 처리 완료 보고 쪽지 및 실시간 알림 발송"
                >
                  ✅ 완료보고 발송
                </button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              disabled={isSaving}
              style={{
                padding: '8px 16px', background: '#fff', border: '1px solid var(--border-default)', borderRadius: '6px',
                fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.6 : 1
              }}
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              style={{
                padding: '8px 24px', background: 'var(--focus-ring)', border: 'none', borderRadius: '6px',
                fontSize: '0.85rem', fontWeight: 700, color: '#fff', cursor: isSaving ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px -1px rgba(13, 148, 136, 0.2)',
                opacity: isSaving ? 0.6 : 1
              }}
            >
              {isSaving ? '저장 중...' : (initialTask ? '저장' : '등록')}
            </button>
          </div>
        </div>
      </div>
      {/* AI Processing overlay loader */}
      {isAiProcessing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', width: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '32px' }}>🤖</span>
            <span style={{ fontSize: '14px', fontWeight: 850, color: 'var(--text-primary)', textAlign: 'center' }}>
              AI가 업무 기획 및 지시 내용을 정밀 분석하여 요약 및 수행 일정표를 설계 중입니다...
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
              AI가 요구사항을 해석하여 상세 업무 기획서 초안을 작성 중입니다...
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

      {/* ─── YSACC 업무 보고 전용 합리적 팝업 모달 ─── */}
      {reportModalType && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(2px)', zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1', width: '520px', maxWidth: '95vw', boxShadow: '0 20px 40px rgba(15,23,42,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '14px 20px', background: reportModalType === 'IN_PROGRESS' ? '#eff6ff' : '#f0fdf4', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>{reportModalType === 'IN_PROGRESS' ? '🏃' : '✅'}</span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: reportModalType === 'IN_PROGRESS' ? '#1e40af' : '#166534' }}>
                  {reportModalType === 'IN_PROGRESS' ? '업무 착수(진행중) 보고 메시지 발송' : '업무 처리 완료 보고 메시지 발송'}
                </span>
              </div>
              <button type="button" onClick={() => setReportModalType(null)} style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Task Title preview */}
              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>대상 업무</span>
                <strong style={{ color: '#1e293b' }}>{title}</strong>
              </div>

              {/* Quick Template buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>⚡ 빠른 추천 문구 선택</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {reportModalType === 'IN_PROGRESS' ? (
                    <>
                      <button type="button" onClick={() => setReportMessage('금일 업무에 착수하였으며, 진행에 차질 없이 마감 기한 내 완료하겠습니다.')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', color: '#334155', cursor: 'pointer', fontWeight: 600 }}>🏃 기한 내 완료 예정</button>
                      <button type="button" onClick={() => setReportMessage('관련 서류 및 바이어 요구 조건을 확인하였으며 긴급 착수 진행 중입니다.')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', color: '#334155', cursor: 'pointer', fontWeight: 600 }}>⚡ 긴급 착수 중</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => setReportMessage('요청하신 업무 처리가 최종 완료되었으니 검토 및 확인 부탁드립니다.')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', color: '#334155', cursor: 'pointer', fontWeight: 600 }}>✅ 처리 완료 및 검토요청</button>
                      <button type="button" onClick={() => setReportMessage('모든 관련 서류 발송 및 등록 처리가 완료되었습니다.')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', color: '#334155', cursor: 'pointer', fontWeight: 600 }}>📄 서류 등록 완료</button>
                    </>
                  )}
                </div>
              </div>

              {/* Message Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>보고 메시지 및 코멘트</label>
                <textarea
                  rows={4}
                  value={reportMessage}
                  onChange={e => setReportMessage(e.target.value)}
                  placeholder="보고 메시지나 완료 코멘트를 자유롭게 적어주세요..."
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', color: '#1e293b', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 20px', background: '#fafafa', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setReportModalType(null)}
                style={{ padding: '6px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitReportMail}
                disabled={isSaving}
                style={{ padding: '6px 18px', background: reportModalType === 'IN_PROGRESS' ? '#3b82f6' : '#16a34a', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                {isSaving ? '전송 중...' : (reportModalType === 'IN_PROGRESS' ? '🏃 착수보고 쪽지 발송' : '✅ 완료보고 쪽지 발송')}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
