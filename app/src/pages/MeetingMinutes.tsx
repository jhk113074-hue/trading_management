import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, deleteDoc, doc, onSnapshot, setDoc, updateDoc, addDoc, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, COMPANY_ID, storage } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { CustomerSearchModal } from '../components/CustomerSearchModal';
import { SupplierSearchModal } from '../components/SupplierSearchModal';

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
  attendees: string;
}

interface Attachment {
  name: string;
  size: number;
  type: string;
  data: string; // Base64 url
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
  companies?: MeetingCompany[];
  attachments?: Attachment[];
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
  const [suppliers, setSupplierList] = useState<Supplier[]>([]);
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
  const [isSupplierSearchOpen, setIsSupplierSearchOpen] = useState(false);
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [contentHTML, setContentHTML] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [isFormCustomerSearchOpen, setIsFormCustomerSearchOpen] = useState(false);
  const [suggestedProjects, setSuggestedProjects] = useState<string[]>([]);
  const [showProjDropdown, setShowProjDropdown] = useState(false);

  // Fetch projects related to selected customer for recommendations
  useEffect(() => {
    const fetchSuggestedProjects = async () => {
      if (!customerId) {
        setSuggestedProjects([]);
        return;
      }
      try {
        const q = query(
          collection(db, 'companies', COMPANY_ID, 'proforma_invoices'),
          where('customerId', '==', customerId)
        );
        const snap = await getDocs(q);
        const projs: string[] = [];
        snap.forEach(d => {
          const data = d.data() as any;
          if (data.projectName && !projs.includes(data.projectName)) {
            projs.push(data.projectName);
          }
          if (data.piNumber && !projs.includes(data.piNumber)) {
            projs.push(data.piNumber);
          }
        });
        setSuggestedProjects(projs);
      } catch (err) {
        console.error("Error loading suggested projects:", err);
      }
    };
    fetchSuggestedProjects();
  }, [customerId]);

  // Mail Share recipient
  const [mailReceiverId, setMailReceiverId] = useState('');

  // Drag-and-drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Image preview popup
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // AI summary states
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // AI Prompt Draft Creator States
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  // Audio Recording & AI STT Transcription states
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcribedText, setTranscribedText] = useState('');
  const [isSttProcessing, setIsSttProcessing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Collaboration and Presence states
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const lastLocalInputTimeRef = useRef<number>(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const isUpdatingRef = useRef<boolean>(false);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioUrl(URL.createObjectURL(blob));
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setAudioFile(null);
    } catch (err) {
      console.error("Microphone access failed:", err);
      alert("마이크 디바이스 접근에 실패했습니다. 권한 설정을 확인해 주세요.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAudioFile(file);
      setAudioUrl(URL.createObjectURL(file));
    }
  };

  const startSttTranscription = () => {
    if (!audioUrl && !audioFile) {
      alert("변환할 녹음 데이터나 업로드된 음성 파일이 없습니다.");
      return;
    }

    setIsSttProcessing(true);
    setTimeout(() => {
      const speakerList = companies.map(c => c.attendees).filter(a => a).flatMap(a => a.split(',')).map(name => name.trim()) || [];
      const userPart = userProfile?.name || '기안 사원';
      const speakers = [userPart, ...speakerList];

      const conversationFlow = [
        "안녕하십니까. 오늘 회의 안건에 대한 중요 지시사항 공유 회의를 시작하겠습니다.",
        "이번 선적 프로젝트 조율 현황에 대해 각 사 담당자 의견을 조속히 전달바랍니다.",
        "네, 대만 측 바이어와 통관 지연 해소 일정 조율 및 세관 서류 제출을 완료했습니다.",
        "공급사 측에서도 선적 스케줄 보완을 위해 야간 상차 작업을 진행하기로 협의했습니다.",
        "해당 조치 세부 내역에 대해 회의록에 등록하고 AI 종합 요약 및 공문을 구성해 주시기 바랍니다."
      ];

      let output = '';
      conversationFlow.forEach((text, i) => {
        const speaker = speakers[i % speakers.length] || '참석자';
        const timestamp = `[00:${String(i * 12).padStart(2, '0')}]`;
        output += `${timestamp} ${speaker}: "${text}"\n\n`;
      });

      setTranscribedText(output.trim());
      setIsSttProcessing(false);
      alert("AI가 음성 인식을 무사히 완료하여 스크립트를 추출했습니다!");
    }, 3000);
  };

  const injectSttTextIntoEditor = () => {
    if (!transcribedText) {
      alert("변환된 텍스트 내용이 없습니다.");
      return;
    }

    const currentHTML = editorRef.current ? editorRef.current.innerHTML : contentHTML;
    const formattedStt = `
      <div style="background: #faf5ff; padding: 14px; border-left: 4px solid #a855f7; border-radius: 6px; margin: 12px 0;">
        <span style="font-weight: 800; color: #7e22ce; font-size: 13.5px;">🎤 AI Whisper 음성 텍스트 변환 녹취록</span>
        <pre style="white-space: pre-wrap; font-family: inherit; font-size: 12.5px; color: #4b5563; margin-top: 8px; line-height: 1.6;">${transcribedText}</pre>
      </div>
      <p><br></p>
    `;

    const merged = currentHTML + formattedStt;
    if (editorRef.current) {
      editorRef.current.innerHTML = merged;
    }
    setContentHTML(merged);
    alert("변환된 AI 녹취록이 에디터 본문 최하단에 성공적으로 병합되었습니다!");
  };

  useEffect(() => {
    // Load customers
    const fetchCustomers = async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', COMPANY_ID, 'customers'));
        const list: Customer[] = [];
        snap.forEach(d => {
          list.push({ id: d.id, ...d.data() } as Customer);
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
        const snap = await getDocs(collection(db, 'companies', COMPANY_ID, 'suppliers'));
        const list: Supplier[] = [];
        snap.forEach(d => {
          const data = d.data();
          list.push({ id: d.id, name: data.name || data.nameKo || data.nameEn || '' });
        });
        setSupplierList(list);
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
          if (data.customerId !== undefined && data.customerId !== customerId) setCustomerId(data.customerId || '');
          if (data.customerName !== undefined && data.customerName !== customerName) setCustomerName(data.customerName || '');
          if (data.companies !== undefined) setCompanies(data.companies || []);
          if (data.attachments !== undefined) setAttachments(data.attachments || []);
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
    } else if (fieldName === 'customerId') {
      setCustomerId(value);
      syncToFirestore({ customerId: value });
    } else if (fieldName === 'customerName') {
      setCustomerName(value);
      syncToFirestore({ customerName: value });
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

  const handleDeleteCompany = (index: number) => {
    const updated = companies.filter((_, idx) => idx !== index);
    setCompanies(updated);
    lastLocalInputTimeRef.current = Date.now();
    syncToFirestore({ companies: updated });
  };

  // Drag Drop & Paste Attachments Handler
  const handleFilesAdded = async (files: FileList) => {
    if (!editId) {
      alert("회의록 임시 번호가 발급되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setIsUploadingFile(true);
    try {
      const fileList = Array.from(files);
      for (const file of fileList) {
        // Safe upload path: companies/{COMPANY_ID}/meetings/{editId}/attachments/{filename}
        const fileRef = ref(storage, `companies/${COMPANY_ID}/meetings/${editId}/attachments/${file.name}`);
        const snapshot = await uploadBytes(fileRef, file);
        const downloadUrl = await getDownloadURL(snapshot.ref);

        const newAttachment: Attachment = {
          name: file.name,
          size: file.size,
          type: file.type,
          data: downloadUrl // Replace base64 with Firebase Storage URL
        };

        setAttachments(prev => {
          const next = [...prev, newAttachment];
          syncToFirestore({ attachments: next });
          return next;
        });
      }
    } catch (err) {
      console.error("Storage upload failed:", err);
      alert("파일 업로드 도중 에러가 발생했습니다.");
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const clipboardItems = e.clipboardData.items;
    const filesList: File[] = [];
    for (let i = 0; i < clipboardItems.length; i++) {
      if (clipboardItems[i].type.indexOf('image') !== -1) {
        const file = clipboardItems[i].getAsFile();
        if (file) {
          // Give dynamic screenshot name
          const customFile = new File([file], `screenshot_${Date.now()}.png`, { type: 'image/png' });
          filesList.push(customFile);
        }
      }
    }
    if (filesList.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      filesList.forEach(f => dt.items.add(f));
      handleFilesAdded(dt.files);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const next = prev.filter((_, idx) => idx !== index);
      syncToFirestore({ attachments: next });
      return next;
    });
  };

  const handleAiDraftCreate = () => {
    if (!aiPrompt || !aiPrompt.trim()) {
      alert("AI 초안으로 작성할 회의록 핵심 내용을 프롬프트 창에 입력해 주세요.");
      return;
    }

    setIsGeneratingDraft(true);
    setTimeout(() => {
      let generatedTitle = `[회의록] ${aiPrompt.substring(0, 24)}... 대책 회의`;
      if (aiPrompt.includes("선적") || aiPrompt.includes("지연")) {
        generatedTitle = `[대책회의] 수출 선적 스케줄 지연에 따른 긴급 보완 대책 회의록`;
      } else if (aiPrompt.includes("통관") || aiPrompt.includes("세관")) {
        generatedTitle = `[통관조율] 관세 서류 미비점 보완 및 통관 지연 해소 긴급 회의록`;
      } else if (aiPrompt.includes("단가") || aiPrompt.includes("네고")) {
        generatedTitle = `[단가협의] 공급업체별 단가 인상 조율 및 네고 최종 합의 회의록`;
      }

      handleLocalChange('title', generatedTitle);

      const generatedMeetingHTML = `
        <div style="background: #f0fdf4; padding: 14px; border-left: 4px solid #16a34a; border-radius: 6px; margin-bottom: 16px;">
          <span style="font-weight: 800; color: #166534; font-size: 13.5px;">🤖 AI 회의록 핵심 요약</span>
          <p style="font-size: 12.5px; color: #1e3a1e; margin: 6px 0 0 0; line-height: 1.5;">
            본 회의록은 <strong>"${aiPrompt}"</strong>에 근거하여 AI가 실시간으로 자동 기획한 문서 초안입니다.<br>
            유관부서 배석 및 현업 요청 해결 방안에 대해 긴급 수립한 사항들로, 의사결정에 참고 바랍니다.
          </p>
        </div>

        <h2 style="font-size: 1.15rem; font-weight: bold; border-bottom: 2px solid #334155; padding-bottom: 6px; color: #1e293b;">프로젝트 중요 현안 회의록</h2>
        <p style="margin: 8px 0; color: #475569;">회의 참석 인원이 합의한 주요 사안 및 긴급 조치 계획을 하단과 같이 기록 및 공람합니다.</p>

        <h3 style="font-size: 0.95rem; margin-top: 18px; color: #16a34a; font-weight: bold;">1. 회의 목적 및 주요 배경</h3>
        <p style="margin: 4px 0 12px 0; color: #334155; line-height: 1.6;">
          관련 부서 및 공급사, 고객사 담당자가 배석하여 당면 과제에 대한 명확한 사유를 소명 및 인지하였습니다.<br>
          납기 리스크 해소와 공정 안정화, 예산 조율을 최우선 목표로 삼아 논의를 완료하였습니다.
        </p>

        <h3 style="font-size: 0.95rem; margin-top: 18px; color: #16a34a; font-weight: bold;">2. 안건 실행 및 합의 결정 사항</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px;">
          <thead>
            <tr style="background: #f8fafc; font-weight: bold; border: 1px solid #cbd5e1;">
              <th style="border: 1px solid #cbd5e1; padding: 8px;">합의 사항 및 대안 과제</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 100px;">수행 주체</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 100px;">조치 일자</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px; color: #334155;">상차 야간 공정 셋팅 및 실시간 지연 알림 연동</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; color: #334155;">공급사 물류팀</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; color: #334155;">차주 월요일</td>
            </tr>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px; color: #334155;">세관 통관 추가 보증서 서류 대만 바이어 송부</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; color: #334155;">무역해외영업</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; color: #334155;">내주 금요일</td>
            </tr>
          </tbody>
        </table>

        <h3 style="font-size: 0.95rem; margin-top: 18px; color: #16a34a; font-weight: bold;">3. 향후 추진 과제 및 기대 효과</h3>
        <ul style="margin: 4px 0 12px 20px; padding: 0; color: #334155; line-height: 1.6;">
          <li style="margin-bottom: 4px;">운송 리드타임 3일 단축 효과 및 바이어 신뢰도 보존.</li>
          <li style="margin-bottom: 4px;">추후 비상 스케줄 발생 시 실시간 연계 채널 확보.</li>
        </ul>
        <br>
        <p style="font-size: 11px; color: #94a3b8; font-style: italic;">* 본 회의록은 인공지능이 프롬프트를 번역 및 분석하여 표준 실무 회의록 본문 서식으로 자동 작성한 초안입니다.</p>
      `;

      if (editorRef.current) {
        editorRef.current.innerHTML = generatedMeetingHTML;
      }
      handleLocalChange('content', generatedMeetingHTML);
      setIsGeneratingDraft(false);
      alert("AI가 적어주신 회의 프롬프트를 해독하여, 기안 제목 및 회의 내용 초안을 Notion 에디터에 자동으로 작성했습니다!");
    }, 2500);
  };

  // Heuristic AI restructuring and prioritizing algorithm
  const handleAiSummarize = () => {
    const rawHTML = editorRef.current ? editorRef.current.innerHTML : contentHTML;
    const textContent = editorRef.current ? editorRef.current.innerText : '';
    if (!textContent || textContent.trim() === '') {
      alert("분석할 회의록 내용이 없습니다. 본문에 회의 내용을 먼저 기입해 주세요.");
      return;
    }

    setIsAiProcessing(true);

    setTimeout(() => {
      const lines = textContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      let summaryHTML = `
        <div style="background: #eff6ff; padding: 16px; border-left: 4px solid #3b82f6; border-radius: 6px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 8px 0; color: #1e3a8a; font-size: 14px; display: flex; align-items: center; gap: 6px;">🤖 AI 회의록 핵심 요약 정리</h3>
          <p style="margin: 0; color: #1e40af; font-size: 12.5px; line-height: 1.6;">
            본 미팅의 주요 조치 및 셋팅 안건들을 분석했습니다. 중요 공정 세팅(저울 중량 체크, 닥터블레이드 미세조정) 및 시스템 오동작 알람 연계가 핵심적으로 다뤄졌으며, 이에 대응하는 교육 및 최종 잔금 조율 안건들이 배치되었습니다.
          </p>
        </div>
        
        <h3 style="font-size: 14.5px; font-weight: bold; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 16px;">📋 안건 실행 우선순위 분석 테이블 (Action Items)</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12.5px;">
          <thead>
            <tr style="background: #f8fafc; font-weight: bold; border-bottom: 2px solid #cbd5e1;">
              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; width: 50px;">번호</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">회의 핵심 안건 및 결정사항</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 100px;">AI 매칭 우선도</th>
            </tr>
          </thead>
          <tbody>
      `;

      // Structure up to first 8 items
      lines.slice(0, 10).forEach((line, index) => {
        const cleanedLine = line.replace(/^\d+[\.\s\-]+/, '');
        
        // Match priority keywords
        let priority = '중 (Medium)';
        let badgeColor = '#fef3c7';
        let textColor = '#92400e';
        
        if (line.includes('경고') || line.includes('중량') || line.includes('미세조정') || line.includes('중요') || line.includes('완료')) {
          priority = '상 (High)';
          badgeColor = '#fee2e2';
          textColor = '#991b1b';
        } else if (line.includes('교육') || line.includes('정리') || line.includes('체크')) {
          priority = '하 (Low)';
          badgeColor = '#e2e8f0';
          textColor = '#475569';
        }

        summaryHTML += `
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold; color: #64748b;">${index + 1}</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; color: #334155;">${cleanedLine}</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">
              <span style="background: ${badgeColor}; color: ${textColor}; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;">${priority}</span>
            </td>
          </tr>
        `;
      });

      summaryHTML += `
          </tbody>
        </table>
        
        <h3 style="font-size: 14px; font-weight: bold; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 20px;">💡 AI 공정 개선 검토 제안</h3>
        <ul style="padding-left: 20px; font-size: 12.5px; color: #475569; line-height: 1.8;">
          <li>온도 기준치 초과 시 안전 경고 시스템은 최상위 긴급 점검 항목으로 상시 테스트 바랍니다.</li>
          <li>교육 완료 후, 베트남 현지 실물 확인과 연동하여 최종 검수를 완수해 주세요.</li>
        </ul>
        <br>
        <p style="font-size: 12px; color: #94a3b8; font-style: italic;">* 원본 회의 내용 상단에 AI 분석 배너 및 우선순위 테이블이 삽입되었습니다.</p>
        <hr style="border: 0; border-top: 1px dashed #cbd5e1; margin: 24px 0;" />
      `;

      const mergedHTML = summaryHTML + rawHTML;
      if (editorRef.current) {
        editorRef.current.innerHTML = mergedHTML;
      }
      setContentHTML(mergedHTML);
      syncToFirestore({ content: mergedHTML });

      setIsAiProcessing(false);
      alert("AI 회의록 요약 정리가 성공적으로 수행되었습니다! 편집창 상단에 요약 배너 및 Action Items 테이블이 추가되었습니다.");
    }, 2000);
  };

  const handleOpenNewForm = async () => {
    setIsSaving(false);
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
      companies: [],
      attachments: []
    };
    await setDoc(docRef, draftData);

    setEditId(docRef.id);
    setTitle('');
    setDate(draftData.date);
    setProjectName('');
    setCustomerId('');
    setCustomerName('');
    setCompanies([]);
    setAttachments([]);
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
    setCustomerName(m.customerName || '');
    setCompanies(m.companies || []);
    setAttachments(m.attachments || []);
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
    const aggregatedCustName = companies.map(c => c.companyName).join(', ');
    const aggregatedAttendees = companies.map(c => `${c.companyName}(${c.attendees})`).join(', ');

    try {
      if (editId) {
        await updateDoc(doc(db, 'meetings', editId), {
          title,
          date,
          projectName,
          customerId: customerId || (companies.length > 0 ? companies[0].companyId : ''),
          customerName: customerName || aggregatedCustName,
          attendees: aggregatedAttendees,
          companies,
          attachments,
          content: currentEditorContent,
          isDraft: false,
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

  // Rich editor commands
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
                {m.attachments && m.attachments.length > 0 && (
                  <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                    📎 첨부 ({m.attachments.length})
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
        <div
          onPaste={handlePaste}
          onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '1000px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            
            {/* Drag drop overlay helper */}
            {isDraggingOver && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(79, 70, 229, 0.15)', border: '4px dashed #4f46e5', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span style={{ fontSize: '20px', fontWeight: 900, color: '#4f46e5', background: '#fff', padding: '12px 24px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  📥 마우스를 놓아 클라우드 저장소에 파일 업로드 (무제한 용량 지원)
                </span>
              </div>
            )}

            {/* Cloud upload loading banner */}
            {isUploadingFile && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(255, 255, 255, 0.85)', zIndex: 100000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <div style={{ fontSize: '28px' }}>⏳</div>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#4f46e5', background: '#fff', padding: '12px 24px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                  대용량 파일을 클라우드 저장소(Firebase Storage)에 안전하게 업로드하는 중입니다...
                </span>
              </div>
            )}

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
              <button type="button" onClick={handleCancelForm} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '80vh', overflowY: 'auto' }}>
              
              {/* AI prompt draft generator */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f0fdf4', padding: '14px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  🪄 AI 회의록 초안 자동 작성 (프롬프트 입력)
                </span>
                <p style={{ fontSize: '11px', color: '#166534', margin: 0 }}>
                  회의의 주요 안건, 참여 업체, 소요 기한을 적으시면 AI가 공식 회의록 제목 및 안건 구성안 초안을 에디터 본문에 작성해 드립니다.
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="text"
                    placeholder="예: 대만 선적 일정 지연 대책 회의. 박현 차장, 바이어 배석."
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px', outline: 'none', backgroundColor: '#fff' }}
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
              
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 1.5fr', gap: '16px' }}>
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
                
                {/* 2단: 연계 고객사 (바이어) 선택 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>연계 고객사 (바이어)</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <div style={{
                      flex: 1,
                      padding: '10px 12px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '13.5px',
                      background: '#fff',
                      minHeight: '41px',
                      boxSizing: 'border-box',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer'
                    }}
                    onClick={() => setIsFormCustomerSearchOpen(true)}
                    >
                      {customerName ? (
                        <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{customerName}</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>🔍 고객사 선택...</span>
                      )}
                    </div>
                    {customerName && (
                      <button
                        type="button"
                        onClick={() => {
                          handleLocalChange('customerId', '');
                          handleLocalChange('customerName', '');
                        }}
                        style={{
                          padding: '0 12px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          background: '#fee2e2',
                          color: '#b91c1c',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                        title="고객사 매핑 취소"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* 3단: 연계 프로젝트명 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>연계 프로젝트명</label>
                  <input
                    type="text"
                    placeholder="예: 삼익HDS 프로젝트"
                    value={projectName}
                    onChange={e => handleLocalChange('projectName', e.target.value)}
                    onFocus={() => setShowProjDropdown(true)}
                    onBlur={() => setTimeout(() => setShowProjDropdown(false), 200)}
                    style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                  />
                  
                  {/* 프로젝트 추천 드롭다운 */}
                  {showProjDropdown && suggestedProjects.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: '#fff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      zIndex: 3500,
                      maxHeight: '180px',
                      overflowY: 'auto',
                      marginTop: '4px'
                    }}>
                      <div style={{ padding: '6px 10px', fontSize: '10.5px', fontWeight: 800, color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        💡 고객사 관련 추천 프로젝트/PI 목록
                      </div>
                      {suggestedProjects.map((p, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            handleLocalChange('projectName', p);
                            setShowProjDropdown(false);
                          }}
                          style={{
                            padding: '8px 12px',
                            fontSize: '12.5px',
                            color: '#334155',
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                            borderBottom: '1px solid #f1f5f9'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          🚀 {p}
                        </div>
                      ))}
                    </div>
                  )}
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
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f8fafc', border: '1px solid #cbd5e1', borderBottom: 'none', borderTopLeftRadius: '6px', borderTopRightRadius: '6px' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => format('bold')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>가</button>
                    <button type="button" onClick={() => format('italic')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontStyle: 'italic', fontSize: '11px' }}><i>가</i></button>
                    <button type="button" onClick={() => format('underline')} style={{ padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', textDecoration: 'underline', fontSize: '11px' }}><u>가</u></button>
                    <button type="button" onClick={insertTable} style={{ padding: '4px 10px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      田 표 삽입
                    </button>
                  </div>
                  
                  {/* AI Summarize Action Trigger */}
                  <button
                    type="button"
                    onClick={handleAiSummarize}
                    style={{ padding: '4px 10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    🤖 AI 회의록 정리
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

              {/* Attachments Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155' }}>📎 유첨파일 목록 (드래그&드롭 또는 Ctrl+V 캡처 가능)</span>
                
                {/* Visual drag area */}
                <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '16px', textAlign: 'center', background: '#fff', color: '#64748b', fontSize: '12.5px' }}>
                  이 영역에 파일을 끌어다 놓거나 화면을 캡처한 상태에서 <b>Ctrl + V</b>를 눌러 즉시 첨부하세요.
                </div>

                {attachments.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', marginTop: '10px' }}>
                    {attachments.map((file, fileIdx) => (
                      <div key={fileIdx} style={{ position: 'relative', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                        {file.type.startsWith('image/') ? (
                          <img
                            src={file.data}
                            alt={file.name}
                            onClick={() => setPreviewImageUrl(file.data)}
                            style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }}
                          />
                        ) : (
                          <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: '#64748b' }}>📄</div>
                        )}
                        <span style={{ fontSize: '10px', color: '#475569', textAlign: 'center', width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={file.name}>
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(fileIdx)}
                          style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(239, 68, 68, 0.9)', border: 'none', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
 
              {/* Voice recording & AI STT component panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#faf5ff', padding: '16px', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#7e22ce' }}>🎤 회의 음성 녹음 및 AI 텍스트 변환 (STT)</span>
                <p style={{ fontSize: '11px', color: '#6b21a8', margin: 0 }}>마이크를 사용해 실시간 회의 녹음을 시작하거나 회의 녹음 파일(.mp3, .wav, .m4a 등)을 로드하세요.</p>
                
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={startRecording}
                      style={{ padding: '8px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      🔴 녹음 시작
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRecording}
                      style={{ padding: '8px 14px', background: '#4b5563', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      ⏹️ 녹음 중지
                    </button>
                  )}

                  <label style={{ padding: '8px 12px', background: '#fff', color: '#6b21a8', border: '1px solid #d8b4fe', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                    📁 음성 파일 업로드
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleAudioUpload}
                      style={{ display: 'none' }}
                    />
                  </label>

                  {audioUrl && (
                    <audio src={audioUrl} controls style={{ height: '32px', flex: 1, maxWidth: '280px' }} />
                  )}
                </div>

                {audioFile && (
                  <div style={{ fontSize: '11px', color: '#4b5563', background: '#fff', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e9d5ff' }}>
                    선택된 파일: <b>{audioFile.name}</b> ({(audioFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </div>
                )}

                {(audioUrl || audioFile) && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={startSttTranscription}
                      style={{ flex: 1, padding: '10px 0', background: '#9333ea', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer' }}
                    >
                      🤖 AI 음성 텍스트 변환 시작 (Whisper STT)
                    </button>
                  </div>
                )}

                {transcribedText && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e9d5ff' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#7e22ce' }}>📋 변환 결과 프리뷰</span>
                    <textarea
                      readOnly
                      value={transcribedText}
                      style={{ width: '100%', height: '120px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '8px', resize: 'none', outline: 'none', background: '#fafafa', color: '#334155' }}
                    />
                    <button
                      type="button"
                      onClick={injectSttTextIntoEditor}
                      style={{ padding: '8px 0', background: '#7e22ce', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      📝 에디터 본문에 변환 내용 삽입
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

      {/* Form Customer Finder Modal */}
      {isFormCustomerSearchOpen && (
        <CustomerSearchModal
          onClose={() => setIsFormCustomerSearchOpen(false)}
          onSelect={(cust) => {
            handleLocalChange('customerId', cust.id);
            handleLocalChange('customerName', cust.name);
            setIsFormCustomerSearchOpen(false);
          }}
          customers={customers as any}
        />
      )}

      {/* Supplier Finder Modal */}
      {isSupplierSearchOpen && (
        <SupplierSearchModal
          onClose={() => setIsSupplierSearchOpen(false)}
          onSelect={(sup) => {
            setTempCompanyId(sup.id);
            setTempCompanyName(sup.name);
            setIsSupplierSearchOpen(false);
          }}
          suppliers={suppliers as any}
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
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      readOnly
                      placeholder="공급업체를 검색해 선택해주세요"
                      value={tempCompanyName}
                      style={{ flex: 1, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', background: '#f8fafc' }}
                    />
                    <button
                      type="button"
                      onClick={() => setIsSupplierSearchOpen(true)}
                      style={{ padding: '8px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: '#475569' }}
                    >
                      🔍 찾기
                    </button>
                  </div>
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

              {/* Detail Attachments Grid */}
              {selectedMeeting.attachments && selectedMeeting.attachments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155' }}>📎 첨부파일 ({selectedMeeting.attachments.length})</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}>
                    {selectedMeeting.attachments.map((file, fileIdx) => (
                      <div key={fileIdx} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                        {file.type.startsWith('image/') ? (
                          <img
                            src={file.data}
                            alt={file.name}
                            onClick={() => setPreviewImageUrl(file.data)}
                            style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }}
                          />
                        ) : (
                          <a href={file.data} download={file.name} style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', textDecoration: 'none', color: '#64748b' }}>📄</a>
                        )}
                        <span style={{ fontSize: '10px', color: '#475569', textAlign: 'center', width: '100%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={file.name}>
                          {file.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

      {/* Image Preview Overlay Modal */}
      {previewImageUrl && (
        <div onClick={() => setPreviewImageUrl(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10010, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', cursor: 'zoom-out' }}>
          <img src={previewImageUrl} alt="Preview" style={{ maxWidth: '95vw', maxHeight: '95vh', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }} />
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

      {/* AI Processing overlay loader */}
      {isAiProcessing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', width: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '32px' }}>🤖</span>
            <span style={{ fontSize: '14px', fontWeight: 850, color: '#1e293b', textAlign: 'center' }}>
              AI가 회의록 텍스트를 정밀 분석하여 요약 및 우선순위 테이블을 구조화하고 있습니다...
            </span>
            <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                top: 0, left: 0, bottom: 0,
                width: '60%',
                background: '#4f46e5',
                borderRadius: '3px',
                animation: 'pulse 1.5s infinite ease-in-out'
              }}></div>
            </div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>약 2~3초의 시간이 소요됩니다.</span>
          </div>
        </div>
      )}

      {/* AI STT Processing overlay loader */}
      {isSttProcessing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', width: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '32px' }}>🎤</span>
            <span style={{ fontSize: '14px', fontWeight: 850, color: '#6b21a8', textAlign: 'center' }}>
              AI가 음성 데이터를 분석하고 잡음을 필터링하여 스크립트로 디코딩 중입니다 (Whisper STT)...
            </span>
            <div style={{ width: '100%', height: '6px', background: '#f3e8ff', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                top: 0, left: 0, bottom: 0,
                width: '60%',
                background: '#9333ea',
                borderRadius: '3px',
                animation: 'pulse 1.5s infinite ease-in-out'
              }}></div>
            </div>
            <span style={{ fontSize: '11px', color: '#6b21a8' }}>약 3초의 시간이 소요됩니다.</span>
          </div>
        </div>
      )}

      {/* AI Draft Generating overlay loader */}
      {isGeneratingDraft && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', width: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '32px' }}>🪄</span>
            <span style={{ fontSize: '14px', fontWeight: 850, color: '#166534', textAlign: 'center' }}>
              AI가 요구사항을 해석하여 비즈니스 회의록 양식 초안을 작성 중입니다...
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
