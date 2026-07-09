import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTasks } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { TaskModal } from '../components/TaskModal';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db, storage } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import type { Task, User } from '../types';

const getHoliday = (dateStr: string) => {
  const holidays: Record<string, { name: string; country: 'KR' | 'AE' }> = {
    // 2026 Korean Holidays
    '2026-01-01': { name: '신정', country: 'KR' },
    '2026-02-16': { name: '설날', country: 'KR' },
    '2026-02-17': { name: '설날', country: 'KR' },
    '2026-02-18': { name: '설날', country: 'KR' },
    '2026-03-01': { name: '삼일절', country: 'KR' },
    '2026-03-02': { name: '대체공휴일', country: 'KR' },
    '2026-05-05': { name: '어린이날', country: 'KR' },
    '2026-05-24': { name: '부처님오신날', country: 'KR' },
    '2026-05-25': { name: '대체공휴일', country: 'KR' },
    '2026-06-03': { name: '지방선거일', country: 'KR' },
    '2026-06-06': { name: '현충일', country: 'KR' },
    '2026-07-17': { name: '제헌절', country: 'KR' },
    '2026-08-15': { name: '광복절', country: 'KR' },
    '2026-08-17': { name: '대체공휴일', country: 'KR' },
    '2026-09-24': { name: '추석', country: 'KR' },
    '2026-09-25': { name: '추석', country: 'KR' },
    '2026-09-26': { name: '추석', country: 'KR' },
    '2026-10-03': { name: '개천절', country: 'KR' },
    '2026-10-05': { name: '대체공휴일', country: 'KR' },
    '2026-10-09': { name: '한글날', country: 'KR' },
    '2026-12-25': { name: '성탄절', country: 'KR' },
    
    // 2026 UAE Holidays
    '2026-03-19': { name: 'Eid Al Fitr', country: 'AE' },
    '2026-03-20': { name: 'Eid Al Fitr', country: 'AE' },
    '2026-03-21': { name: 'Eid Al Fitr', country: 'AE' },
    '2026-03-22': { name: 'Eid Al Fitr', country: 'AE' },
    '2026-05-26': { name: 'Arafat Day', country: 'AE' },
    '2026-05-27': { name: 'Eid Al Adha', country: 'AE' },
    '2026-05-28': { name: 'Eid Al Adha', country: 'AE' },
    '2026-05-29': { name: 'Eid Al Adha', country: 'AE' },
    '2026-06-15': { name: 'Islamic New Year', country: 'AE' },
    '2026-08-25': { name: 'Prophet Birthday', country: 'AE' },
    '2026-12-02': { name: 'National Day', country: 'AE' },
    '2026-12-03': { name: 'National Day', country: 'AE' },
  };

  if (dateStr === '2026-01-01') {
    return { name: '신정 / New Year', country: 'KR' };
  }

  return holidays[dateStr] || null;
};

const DEFAULT_CLOCKS = [
  { code: 'kr', label: '한국', zone: 'Asia/Seoul' },
  { code: 'cn', label: '중국', zone: 'Asia/Shanghai' },
  { code: 'my', label: '말레이시아', zone: 'Asia/Kuala_Lumpur' },
  { code: 'in', label: '인도', zone: 'Asia/Kolkata' },
  { code: 'ae', label: 'UAE', zone: 'Asia/Dubai' },
  { code: 'kw', label: '쿠웨이트', zone: 'Asia/Kuwait' },
  { code: 'sa', label: '사우디', zone: 'Asia/Riyadh' },
  { code: 'tr', label: '터키', zone: 'Europe/Istanbul' },
  { code: 'au', label: '호주', zone: 'Asia/Sydney' },
];

const COMMON_TIMEZONES = [
  { value: 'Asia/Seoul', label: '한국/서울 (UTC+9)' },
  { value: 'Asia/Tokyo', label: '일본/도쿄 (UTC+9)' },
  { value: 'Asia/Shanghai', label: '중국/베이징 (UTC+8)' },
  { value: 'Asia/Kuala_Lumpur', label: '말레이시아/쿠알라룸푸르 (UTC+8)' },
  { value: 'Asia/Singapore', label: '싱가포르 (UTC+8)' },
  { value: 'Asia/Taipei', label: '대만/타이베이 (UTC+8)' },
  { value: 'Asia/Kolkata', label: '인도/뉴델리 (UTC+5:30)' },
  { value: 'Asia/Dubai', label: 'UAE/두바이 (UTC+4)' },
  { value: 'Asia/Kuwait', label: '쿠웨이트 (UTC+3)' },
  { value: 'Asia/Riyadh', label: '사우디/리야드 (UTC+3)' },
  { value: 'Europe/Istanbul', label: '터키/이스탄불 (UTC+3)' },
  { value: 'Asia/Ho_Chi_Minh', label: '베트남/호치민 (UTC+7)' },
  { value: 'Asia/Bangkok', label: '태국/방콕 (UTC+7)' },
  { value: 'Asia/Jakarta', label: '인도네시아/자카르타 (UTC+7)' },
  { value: 'Asia/Sydney', label: '호주/시드니 (UTC+10)' },
  { value: 'Europe/London', label: '영국/런던 (UTC+0)' },
  { value: 'America/New_York', label: '미국/뉴욕 (UTC-5)' },
  { value: 'America/Los_Angeles', label: '미국/LA (UTC-8)' },
];

const PRESET_COUNTRIES = [
  { label: '한국 (Korea)', code: 'kr', zone: 'Asia/Seoul' },
  { label: '중국 (China)', code: 'cn', zone: 'Asia/Shanghai' },
  { label: '말레이시아 (Malaysia)', code: 'my', zone: 'Asia/Kuala_Lumpur' },
  { label: '인도 (India)', code: 'in', zone: 'Asia/Kolkata' },
  { label: 'UAE (두바이)', code: 'ae', zone: 'Asia/Dubai' },
  { label: '쿠웨이트 (Kuwait)', code: 'kw', zone: 'Asia/Kuwait' },
  { label: '사우디 (Saudi Arabia)', code: 'sa', zone: 'Asia/Riyadh' },
  { label: '터키 (Turkey)', code: 'tr', zone: 'Europe/Istanbul' },
  { label: '호주 (Sydney)', code: 'au', zone: 'Asia/Sydney' },
  { label: '일본 (Japan)', code: 'jp', zone: 'Asia/Tokyo' },
  { label: '베트남 (Vietnam)', code: 'vn', zone: 'Asia/Ho_Chi_Minh' },
  { label: '대만 (Taiwan)', code: 'tw', zone: 'Asia/Taipei' },
  { label: '홍콩 (Hong Kong)', code: 'hk', zone: 'Asia/Hong_Kong' },
  { label: '싱가포르 (Singapore)', code: 'sg', zone: 'Asia/Singapore' },
  { label: '태국 (Thailand)', code: 'th', zone: 'Asia/Bangkok' },
  { label: '인도네시아 (Indonesia)', code: 'id', zone: 'Asia/Jakarta' },
  { label: '필리핀 (Philippines)', code: 'ph', zone: 'Asia/Manila' },
  { label: '영국 (UK)', code: 'gb', zone: 'Europe/London' },
  { label: '독일 (Germany)', code: 'de', zone: 'Europe/Berlin' },
  { label: '네덜란드 (Netherlands)', code: 'nl', zone: 'Europe/Amsterdam' },
  { label: '미국 동부 (US East)', code: 'us', zone: 'America/New_York' },
  { label: '미국 서부 (US West)', code: 'us', zone: 'America/Los_Angeles' },
  { label: '캐나다 (Canada)', code: 'ca', zone: 'America/Toronto' },
  { label: '브라질 (Brazil)', code: 'br', zone: 'America/Sao_Paulo' },
];

const WorldClocks: React.FC = () => {
  const COMPANY_ID = "YSACC";
  const [time, setTime] = useState(new Date());
  const [clocks, setClocks] = useState<any[]>(DEFAULT_CLOCKS);
  const [showSettings, setShowSettings] = useState(false);

  // New country form states
  const [newLabel, setNewLabel] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newZone, setNewZone] = useState('Asia/Seoul');

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const docRef = doc(db, "companies", COMPANY_ID, "settings", "world_clocks");
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists() && Array.isArray(snap.data().list)) {
        setClocks(snap.data().list);
      } else {
        // Init Firestore with default list
        setDoc(docRef, { list: DEFAULT_CLOCKS });
      }
    });
    return () => unsub();
  }, []);

  const formatTime = (timeZone: string) => {
    try {
      return time.toLocaleTimeString('ko-KR', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return '';
    }
  };

  const handleAddCountry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim() || !newCode.trim()) {
      alert("국가명과 국가코드를 모두 입력해 주세요.");
      return;
    }

    const cleanCode = newCode.trim().toLowerCase();
    const cleanLabel = newLabel.trim();

    const updated = [...clocks, { code: cleanCode, label: cleanLabel, zone: newZone }];
    
    try {
      const docRef = doc(db, "companies", COMPANY_ID, "settings", "world_clocks");
      await setDoc(docRef, { list: updated });
      setNewLabel('');
      setNewCode('');
      alert(`${cleanLabel} 국가 시각이 성공적으로 추가되었습니다!`);
    } catch (err) {
      console.error(err);
      alert("국가 추가 실패");
    }
  };

  const handleRemoveCountry = async (index: number) => {
    const countryName = clocks[index]?.label;
    if (!window.confirm(`${countryName} 시각을 세계 시각 표시 목록에서 삭제하시겠습니까?`)) return;

    const updated = clocks.filter((_, i) => i !== index);
    try {
      const docRef = doc(db, "companies", COMPANY_ID, "settings", "world_clocks");
      await setDoc(docRef, { list: updated });
    } catch (err) {
      console.error(err);
      alert("국가 삭제 실패");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '6px 12px', borderRadius: '8px', border: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflowX: 'auto', width: '100%', justifyContent: 'center', position: 'relative' }}>
        <span style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-secondary)', marginRight: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          🌐 세계 시각:
        </span>
        {clocks.map((c, idx) => (
          <React.Fragment key={c.zone + '_' + idx}>
            {idx > 0 && <span style={{ color: 'var(--border-color)', fontSize: '10px' }}>|</span>}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#334155' }}>
              <img 
                src={`https://flagcdn.com/w20/${c.code}.png`}
                srcSet={`https://flagcdn.com/w40/${c.code}.png 2x`}
                width="15" 
                height="11" 
                alt={c.label} 
                style={{ borderRadius: '1.5px', border: '1px solid var(--border-default)', objectFit: 'cover', display: 'inline-block' }} 
              />
              <span style={{ color: 'var(--text-secondary)', fontSize: '9.5px', fontWeight: 600 }}>{c.label}</span>
              <span style={{ color: '#0f172a', fontFamily: 'monospace', fontSize: '11px' }}>{formatTime(c.zone)}</span>
            </div>
          </React.Fragment>
        ))}
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '2px', marginLeft: '8px', color: 'var(--text-secondary)' }}
          title="세계 시각 국가 추가/관리"
        >
          ⚙️
        </button>
      </div>

      {/* Inline Settings Panel */}
      {showSettings && (
        <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)' }}>⚙️ 세계 시각 표시 국가 관리</span>
            <button type="button" onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', fontSize: '12px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕ 닫기</button>
          </div>

          {/* Current Countries List with delete actions */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
            {clocks.map((c, idx) => (
              <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', background: '#f1f5f9', color: '#334155', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-default)' }}>
                <img src={`https://flagcdn.com/w20/${c.code}.png`} width="12" height="9" alt={c.label} style={{ objectFit: 'cover' }} />
                <span>{c.label}</span>
                <button type="button" onClick={() => handleRemoveCountry(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '10px', color: '#ef4444', fontWeight: 'bold' }}>✕</button>
              </span>
            ))}
          </div>

          {/* Add Form */}
          <form onSubmit={handleAddCountry} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr auto', gap: '8px', alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', gridColumn: '1 / span 4', marginBottom: '4px' }}>
              <label style={{ fontSize: '11.5px', color: '#3b82f6', fontWeight: 800 }}>🌐 빠른 국가/지역 프리셋 선택</label>
              <select 
                onChange={e => {
                  const val = e.target.value;
                  if (val) {
                    const preset = PRESET_COUNTRIES[parseInt(val)];
                    if (preset) {
                      setNewLabel(preset.label.split(' (')[0]);
                      setNewCode(preset.code);
                      setNewZone(preset.zone);
                    }
                  }
                }}
                style={{ padding: '6px 8px', border: '1px solid #3b82f6', borderRadius: '4px', fontSize: '12.5px', outline: 'none', backgroundColor: '#fff', color: '#1e3a8a', fontWeight: 700, cursor: 'pointer' }}
              >
                <option value="">-- 주요 국가/도시 목록에서 선택 --</option>
                {PRESET_COUNTRIES.map((p, idx) => (
                  <option key={idx} value={idx}>{p.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>국가 한글명</label>
              <input 
                type="text" 
                placeholder="예: 일본" 
                value={newLabel} 
                onChange={e => setNewLabel(e.target.value)} 
                style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>국가코드 (ISO 2자리)</label>
              <input 
                type="text" 
                placeholder="예: jp" 
                value={newCode} 
                onChange={e => setNewCode(e.target.value)} 
                style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>표준 시간대</label>
              <select 
                value={newZone} 
                onChange={e => setNewZone(e.target.value)} 
                style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', backgroundColor: '#fff' }}
              >
                {COMMON_TIMEZONES.map(z => (
                  <option key={z.value} value={z.value}>{z.label}</option>
                ))}
              </select>
            </div>
            <button type="submit" style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', height: '31px' }}>
              ＋ 국가 추가
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

const toLocalDateStr = (val?: string | Date): string => {
  if (!val) return '';
  if (typeof val === 'string') {
    if (val.length === 10 && val.includes('-') && !val.includes('T')) {
      return val;
    }
  }
  try {
    const d = typeof val === 'string' ? new Date(val) : val;
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return '';
  }
};

export const Dashboard: React.FC = () => {
  const location = useLocation();
  const { tasks, addTask, updateTask, loading } = useTasks();
  const [users, setUsers] = useState<User[]>([]);
  const { userProfile, currentUser } = useAuth();

  // TEMPORARY: Clean up duplicate auto-tasks for UNG-05
  useEffect(() => {
    const cleanUpDuplicates = async () => {
      try {
        const hasCleaned = localStorage.getItem('has_cleaned_duplicates_ung_05_v1');
        if (hasCleaned) return;

        const { query, collection, where, getDocs, deleteDoc, doc } = await import('firebase/firestore');
        const { db } = await import('../firebase');

        const q = query(
          collection(db, 'tasks'),
          where('title', '==', `[자동] 견적서 작성: United Neama Group Gem Trad & Con... (PI: PI-YS-2026-UNG-05)`)
        );
        const snap = await getDocs(q);
        if (snap.size > 1) {
          const sortedDocs = snap.docs.sort((a, b) => {
            const dateA = new Date(a.data().createdAt || 0).getTime();
            const dateB = new Date(b.data().createdAt || 0).getTime();
            return dateA - dateB;
          });
          for (let i = 1; i < sortedDocs.length; i++) {
            await deleteDoc(doc(db, 'tasks', sortedDocs[i].id));
          }
          console.log(`Successfully purged ${sortedDocs.length - 1} duplicate tasks`);
        }
        localStorage.setItem('has_cleaned_duplicates_ung_05_v1', 'true');
      } catch (err) {
        console.error("Purge duplicates error:", err);
      }
    };
    cleanUpDuplicates();
  }, []);


  const isCommentNew = (lastCommentAt?: string): boolean => {
    if (!lastCommentAt) return false;
    try {
      const diff = Date.now() - new Date(lastCommentAt).getTime();
      return diff > 0 && diff < 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  };

  // ── Trading Data States ──
  const [pis, setPis] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [tradingLoading, setTradingLoading] = useState(true);
  
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData: User[] = [];
      snapshot.forEach(doc => {
        usersData.push({ id: doc.id, ...doc.data() } as User);
      });
      usersData.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dbTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return da - dbTime;
      });
      setUsers(usersData);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // ── Trading Real-time Subscriptions ──
  useEffect(() => {
    if (!currentUser) return;
    const COMPANY_ID = "YSACC";

    const unsubPIs = onSnapshot(collection(doc(db, "companies", COMPANY_ID), "proforma_invoices"), (snapshot) => {
      const piData: any[] = [];
      snapshot.forEach(doc => {
        piData.push({ id: doc.id, ...doc.data() });
      });
      piData.sort((a, b) => ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setPis(piData);
      setTradingLoading(false);
    }, (err) => {
      console.error("PI subscription error:", err);
      setTradingLoading(false);
    });

    const unsubOrders = onSnapshot(collection(doc(db, "companies", COMPANY_ID), "orders"), (snapshot) => {
      const orderData: any[] = [];
      snapshot.forEach(doc => {
        orderData.push({ id: doc.id, ...doc.data() });
      });
      setOrders(orderData);
    }, (err) => {
      console.error("Orders subscription error:", err);
    });

    return () => {
      unsubPIs();
      unsubOrders();
    };
  }, [currentUser]);

  // ── Calendar States & Subscription ──
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth()); // 0 ~ 11
  const [selectedDateForEvent, setSelectedDateForEvent] = useState<string | null>(null);
  const [selectedEventForView, setSelectedEventForView] = useState<any | null>(null);
  const [activeDateEventsList, setActiveDateEventsList] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [eventForm, setEventForm] = useState({
    title: '',
    type: '개인일정' as '개인일정' | '미팅' | '출장' | '기타',
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '18:00',
    isPublic: true,
    participants: '',
    description: '',
    attachments: [] as Array<{ name: string; url: string; size: number; path: string }>
  });

  const [previewFile, setPreviewFile] = useState<{ name: string; url: string } | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    const COMPANY_ID = "YSACC";

    const unsubEvents = onSnapshot(collection(doc(db, "companies", COMPANY_ID), "calendar_events"), (snapshot) => {
      const events: any[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isPublic || data.creatorId === currentUser.uid) {
          events.push({ id: docSnap.id, ...data });
        }
      });
      setCalendarEvents(events);
    }, (err) => {
      console.error("Calendar events subscription error:", err);
    });

    return () => unsubEvents();
  }, [currentUser]);

  const handlePrevMonth = () => {
    setCurrentMonth(prev => {
      if (prev === 0) {
        setCurrentYear(y => y - 1);
        return 11;
      }
      return prev - 1;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => {
      if (prev === 11) {
        setCurrentYear(y => y + 1);
        return 0;
      }
      return prev + 1;
    });
  };

  const handleGoToToday = () => {
    const today = new Date();
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  const getEventBadgeColor = (type: string) => {
    switch (type) {
      case '개인일정': return { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' };
      case '미팅': return { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' };
      case '출장': return { bg: '#faf5ff', text: '#5b21b6', border: '#e9d5ff' };
      default: return { bg: '#fff7ed', text: '#9a3412', border: '#fed7aa' };
    }
  };

  const renderCalendarDays = () => {
    const startDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const dayCells: React.ReactNode[] = [];

    // 1. Previous month padding days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevDay = daysInPrevMonth - i;
      const targetYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const targetMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(prevDay).padStart(2, '0')}`;
      dayCells.push(renderDayCell(prevDay, dateStr, false));
    }

    // 2. Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      dayCells.push(renderDayCell(day, dateStr, true));
    }

    // 3. Next month padding days
    const totalCellsSoFar = dayCells.length;
    const remainingCells = (totalCellsSoFar % 7 === 0) ? 0 : 7 - (totalCellsSoFar % 7);
    for (let i = 1; i <= remainingCells; i++) {
      const targetYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const targetMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      dayCells.push(renderDayCell(i, dateStr, false));
    }

    return dayCells;
  };

  const renderDayCell = (dayNum: number, dateStr: string, isCurrentMonth: boolean) => {
    const isToday = new Date().toISOString().split('T')[0] === dateStr;
    const dayOfWeek = new Date(dateStr).getDay();
    const holiday = getHoliday(dateStr);
    const isKrHoliday = holiday?.country === 'KR';

    const dayEvents = calendarEvents.filter(e => {
      const start = e.startDate;
      const end = e.endDate || start;
      return dateStr >= start && dateStr <= end;
    });

    return (
      <div
        key={dateStr}
        onClick={() => {
          setActiveDateEventsList(dateStr);
        }}
        style={{
          minHeight: '33px',
          background: dateStr === activeDateEventsList ? '#f0fdf4' : (isCurrentMonth ? '#fff' : '#f8fafc'),
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          padding: '2px 4px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          transition: 'all 0.1s',
          boxShadow: dateStr === activeDateEventsList ? 'inset 0 0 0 2px #10b981' : (isToday ? 'inset 0 0 0 1.5px #3b82f6' : 'none')
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '1px' }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 800,
            color: isToday ? '#fff' : (!isCurrentMonth ? 'var(--border-default)' : (dayOfWeek === 0 || isKrHoliday) ? '#ef4444' : dayOfWeek === 6 ? '#3b82f6' : 'var(--text-secondary)'),
            background: isToday ? '#3b82f6' : 'transparent',
            borderRadius: isToday ? '50%' : 'none',
            width: isToday ? '18px' : 'auto',
            height: isToday ? '18px' : 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {dayNum}
          </span>
          {holiday && (
            <span
              className="holiday-badge"
              style={{ color: holiday.country === 'KR' ? '#ef4444' : 'var(--focus-ring)' }}
              title={holiday.name}
            >
              {holiday.country === 'KR' ? `🇰🇷 ${holiday.name}` : `🇦🇪 ${holiday.name}`}
            </span>
          )}
        </div>

        {/* Dot indicators */}
        <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', flexWrap: 'wrap', width: '100%', minHeight: '6px', marginBottom: '2px' }}>
          {dayEvents.slice(0, 4).map(e => {
            const colors = getEventBadgeColor(e.type);
            return (
              <span
                key={e.id}
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: colors.text,
                  display: 'inline-block'
                }}
                title={`${e.title} (${e.creatorName})`}
              />
            );
          })}
          {dayEvents.length > 4 && (
            <span style={{ fontSize: '7px', fontWeight: 900, color: 'var(--text-secondary)', lineHeight: 1 }}>+</span>
          )}
        </div>
      </div>
    );
  };

  const [uploadingEventFile, setUploadingEventFile] = useState(false);
  const [dragOverEventUpload, setDragOverEventUpload] = useState(false);

  const handleEventFileUpload = async (file: File) => {
    setUploadingEventFile(true);
    try {
      const uniqueFileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `tasks/event_files/${uniqueFileName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', 
          null,
          (error) => {
            console.error(error);
            reject(error);
          },
          () => resolve()
        );
      });

      const downloadUrl = await getDownloadURL(storageRef);
      const newAttachment = {
        name: file.name,
        url: downloadUrl,
        size: file.size,
        path: `tasks/event_files/${uniqueFileName}`
      };

      setEventForm(prev => ({
        ...prev,
        attachments: [...(prev.attachments || []), newAttachment]
      }));
    } catch (err) {
      console.error(err);
      alert('파일 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploadingEventFile(false);
    }
  };

  const handleEventFilesUpload = async (files: FileList | File[]) => {
    for (let i = 0; i < files.length; i++) {
      await handleEventFileUpload(files[i]);
    }
  };

  const handleEventDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverEventUpload(true);
  };

  const handleEventDragLeave = () => {
    setDragOverEventUpload(false);
  };

  const handleEventDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverEventUpload(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleEventFilesUpload(e.dataTransfer.files);
    }
  };

  const handleEventPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          const screenshotFile = new File([file], `screenshot_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.png`, { type: file.type });
          await handleEventFileUpload(screenshotFile);
        }
      }
    }
  };

  const handleEventDeleteAttachment = async (idx: number) => {
    const att = eventForm.attachments[idx];
    if (confirm(`'${att.name}' 파일을 삭제하시겠습니까?`)) {
      try {
        if (att.path) {
          const fileRef = ref(storage, att.path);
          await deleteObject(fileRef).catch(console.warn);
        }
      } catch (err) {
        console.warn(err);
      }
      setEventForm(prev => ({
        ...prev,
        attachments: (prev.attachments || []).filter((_, i) => i !== idx)
      }));
    }
  };

  const handleSaveEvent = async () => {
    if (!eventForm.title.trim()) {
      alert('일정 제목을 입력해주세요.');
      return;
    }
    if (!currentUser || !userProfile) return;

    const COMPANY_ID = "YSACC";
    const eventPayload = {
      title: eventForm.title,
      type: eventForm.type,
      startDate: eventForm.startDate,
      startTime: eventForm.startTime,
      endDate: eventForm.endDate,
      endTime: eventForm.endTime,
      isPublic: eventForm.isPublic,
      participants: eventForm.participants,
      description: eventForm.description,
      attachments: eventForm.attachments || [],
      creatorId: currentUser.uid,
      creatorName: userProfile.name || currentUser.displayName || '이름없음',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (selectedEventForView) {
        const docRef = doc(db, 'companies', COMPANY_ID, 'calendar_events', selectedEventForView.id);
        await setDoc(docRef, {
          ...eventPayload,
          creatorId: selectedEventForView.creatorId,
          creatorName: selectedEventForView.creatorName
        }, { merge: true });
        alert('✅ 일정이 수정되었습니다.');
      } else {
        await addDoc(collection(doc(db, 'companies', COMPANY_ID), 'calendar_events'), eventPayload);
        alert('✅ 일정이 등록되었습니다.');
      }
      setSelectedDateForEvent(null);
      setSelectedEventForView(null);
    } catch (e: any) {
      console.error(e);
      alert('일정 저장 중 오류가 발생했습니다: ' + e.message);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEventForView) return;
    if (!window.confirm('이 일정을 정말 삭제하시겠습니까?')) return;
    const COMPANY_ID = "YSACC";
    try {
      await deleteDoc(doc(db, 'companies', COMPANY_ID, 'calendar_events', selectedEventForView.id));
      alert('🗑️ 일정이 삭제되었습니다.');
      setSelectedEventForView(null);
      setSelectedDateForEvent(null);
    } catch (e: any) {
      console.error(e);
      alert('일정 삭제 중 오류가 발생했습니다: ' + e.message);
    }
  };

  // ── 일간, 주간 및 기간 검색 기준 ──────────────────────────────────────────────
  const [dateMode, setDateMode] = useState<'daily' | 'weekly' | 'range'>('weekly');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [weekOffset, setWeekOffset] = useState(0);

  const getWeekRange = (offset: number) => {
    const now = new Date();
    const day = now.getDay(); // 0=일, 1=월 ...
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  };

  const formatWeekLabel = (offset: number) => {
    const { start, end } = getWeekRange(offset);
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    if (offset === 0) return `이번 주 (${fmt(start)}~${fmt(end)})`;
    if (offset === -1) return `지난 주 (${fmt(start)}~${fmt(end)})`;
    if (offset === 1) return `다음 주 (${fmt(start)}~${fmt(end)})`;
    return `${offset > 0 ? '+' : ''}${offset}주 (${fmt(start)}~${fmt(end)})`;
  };

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const setRangePreset = (preset: 'today' | 'week' | 'month' | 'all') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'week') {
      const day = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setStartDate(monday.toISOString().split('T')[0]);
      setEndDate(sunday.toISOString().split('T')[0]);
    } else if (preset === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(lastDay.toISOString().split('T')[0]);
    } else if (preset === 'all') {
      setStartDate('2020-01-01');
      setEndDate('2030-12-31');
    }
  };

  const [filter, setFilter] = useState('내 업무');
  const [quadrantFilter, setQuadrantFilter] = useState('ALL');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverBasketId, setDragOverBasketId] = useState<string | null>(null);
  const [delegatedQuickTitle, setDelegatedQuickTitle] = useState('');

  const unassignedTasks = useMemo(() => {
    return tasks.filter(t => t.status === 'TODO' && (!t.assigneeId || !users.some(u => u.id === t.assigneeId)));
  }, [tasks, users]);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    setDraggingId(taskId);
  };
  const handleDragEnd = () => setDraggingId(null);
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).style.background = 'var(--primary-light, #eff6ff)';
  };
  const handleDragLeave = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.background = '';
  };

  const handleStatusDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    try {
      await updateTask({ ...tasks.find(t => t.id === taskId)!, status: newStatus as any });
      // 자동 날짜 기록 (IN_PROGRESS → startDate, DONE → dueDate/completedAt)
      const today = new Date().toISOString().split('T')[0];
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;
      const extraUpdates: Record<string, any> = { status: newStatus, updatedAt: new Date().toISOString() };
      if (newStatus === 'IN_PROGRESS' && !task.startDate) {
        extraUpdates.startDate = today;
        extraUpdates.completedAt = null;
      }
      if (newStatus === 'DONE') {
        extraUpdates.dueDate = today;
        extraUpdates.completedAt = new Date().toISOString();
      }
      await updateDoc(doc(db, 'tasks', taskId), extraUpdates);
    } catch (err) {
      console.error(err);
    }
    setDraggingId(null);
  };

  const handleAssigneeDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).style.background = 'rgba(190, 18, 60, 0.08)';
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary-color)';
  };

  const handleAssigneeDragLeave = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.background = '';
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)';
  };

  const handleAssigneeDrop = async (e: React.DragEvent, assigneeId: string) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).style.background = '';
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)';
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const targetUser = users.find(u => u.id === assigneeId);
    if (!targetUser) return;
    try {
      const { id, ...rest } = task;
      await updateDoc(doc(db, 'tasks', id), {
        ...rest,
        assigneeId: targetUser.id,
        assigneeName: targetUser.name,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to assign task:", err);
    }
    setDraggingId(null);
  };

  const handleUnassignedDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    try {
      const { id, ...rest } = task;
      await updateDoc(doc(db, 'tasks', id), {
        ...rest,
        assigneeId: '',
        assigneeName: '미배정',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to unassign task:", err);
    }
    setDraggingId(null);
  };

  const handleUnassignedQuickAdd = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && delegatedQuickTitle.trim()) {
      await addTask({
        title: delegatedQuickTitle,
        description: '',
        status: 'TODO',
        type: 'DAILY',
        scheduleType: 'SELF',
        importance: 'B',
        urgency: 5,
        quadrant: 'Q2',
        assigneeId: '',
        assigneeName: '미배정',
        createdAt: new Date().toISOString()
      } as any);
      setDelegatedQuickTitle('');
    }
  };




  const TaskChip: React.FC<{ task: Task }> = ({ task }) => {
    const quad = (task.quadrant || 'Q2').toUpperCase();
    const badgeStyles: Record<string, { color: string; bg: string; border: string }> = {
      Q1: { color: '#ef4444', bg: '#fef2f2', border: '1px solid rgba(239, 68, 68, 0.2)' },
      Q2: { color: '#3b82f6', bg: '#eff6ff', border: '1px solid rgba(59, 130, 246, 0.2)' },
      Q3: { color: '#f59e0b', bg: '#fffbeb', border: '1px solid rgba(245, 158, 11, 0.2)' },
      Q4: { color: 'var(--text-muted)', bg: '#f8fafc', border: '1px solid rgba(148, 163, 184, 0.2)' }
    };
    const badgeStyle = badgeStyles[quad] || badgeStyles.Q2;

    return (
      <div
        draggable
        onDragStart={e => handleDragStart(e, task.id)}
        onDragEnd={handleDragEnd}
        onClick={() => setEditingTask(task)}
        style={{
          background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px',
          padding: '10px 12px', marginBottom: '8px', cursor: 'grab',
          opacity: draggingId === task.id ? 0.4 : 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          transition: 'box-shadow 0.15s',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, flex: 1, lineHeight: 1.4 }}>{task.title}</span>
          <span style={{
            fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
            color: badgeStyle.color, background: badgeStyle.bg, border: badgeStyle.border, flexShrink: 0,
          }}>{quad}</span>
        </div>
        <div style={{ display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap' }}>
          {task.projectName && <span style={{ fontSize: '0.7rem', background: '#f1f5f9', borderRadius: '3px', padding: '1px 5px', color: 'var(--text-secondary)' }}>{task.projectName}</span>}
          {task.dueDate && <span style={{ fontSize: '0.7rem', color: task.dueDate < new Date().toISOString().split('T')[0] ? '#ef4444' : 'var(--text-secondary)' }}>📅 {task.dueDate}</span>}
          {(task.commentCount ?? 0) > 0 && (
            <span 
              className={isCommentNew(task.lastCommentAt) ? 'blink-badge' : ''}
              style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#d97706', padding: '1px 6px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: '800' }}
            >
              💬 {task.commentCount}
            </span>
          )}
        </div>
      </div>
    );
  };



  const filteredTasks = useMemo(() => {
    let base = tasks || [];
    const path = location.pathname;
    
    if (path === '/projects') base = base.filter(t => t.type === 'PROJECT');
    if (path === '/daily') base = base.filter(t => t.type === 'DAILY' || (t.type as any) === 'ROUTINE');
    if (path === '/delegated') base = base.filter(t => t.type === 'DELEGATED');
    if (path === '/periodic') base = base.filter(t => t.type === 'PERIODIC');
    
    if (path.startsWith('/team/')) {
      const teamId = path.split('/').pop();
      if (teamId !== 'all') {
        base = base.filter(t => t.assigneeId === teamId);
      }
    }

    // ── 날짜 및 기간 필터링 ──────────────────────────────────────────────
    base = base.filter(task => {
      const isDone = task.status === 'DONE';
      
      if (isDone) {
        const compDate = toLocalDateStr(task.completedAt || task.createdAt);
        if (!compDate) return false;

        if (dateMode === 'daily') {
          return compDate === selectedDate;
        } else if (dateMode === 'weekly') {
          const { start, end } = getWeekRange(weekOffset);
          const wStartStr = toLocalDateStr(start);
          const wEndStr = toLocalDateStr(end);
          return compDate >= wStartStr && compDate <= wEndStr;
        } else {
          return compDate >= startDate && compDate <= endDate;
        }
      } else {
        const tStart = task.startDate || toLocalDateStr(task.createdAt) || '';
        const tDue = task.dueDate || '9999-12-31';

        if (dateMode === 'daily') {
          return tStart <= selectedDate && tDue >= selectedDate;
        } else if (dateMode === 'weekly') {
          const { start, end } = getWeekRange(weekOffset);
          const wStartStr = toLocalDateStr(start);
          const wEndStr = toLocalDateStr(end);
          return tStart <= wEndStr && tDue >= wStartStr;
        } else {
          return tStart <= endDate && tDue >= startDate;
        }
      }
    });

    let result = base.filter(t => {
      if (filter === '전체') return true;
      if (filter === '내 업무') return t.assigneeId === userProfile?.id || t.assigneeName === userProfile?.name;
      
      const targetUser = users.find(u => u.id === filter);
      if (targetUser) {
        return t.assigneeId === targetUser.id || t.assigneeName === targetUser.name;
      }
      return true;
    });

    if (quadrantFilter !== 'ALL') {
      result = result.filter(t => t.quadrant === quadrantFilter);
    }

    const quadOrder: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
    result.sort((a, b) => {
      const qA = (a.quadrant || 'Q2').toUpperCase();
      const qB = (b.quadrant || 'Q2').toUpperCase();
      const orderA = quadOrder[qA] || 5;
      const orderB = quadOrder[qB] || 5;
      return orderA - orderB;
    });

    return result;
  }, [tasks, location.pathname, filter, quadrantFilter, userProfile, users, dateMode, selectedDate, startDate, endDate, weekOffset]);

  const activeUser = useMemo(() => {
    if (filter === '내 업무') return userProfile;
    if (filter === '전체') return null;
    return users.find(u => u.id === filter) || null;
  }, [filter, users, userProfile]);

  const activeUserStats = useMemo(() => {
    const uTasks = tasks.filter(t => {
      if (filter === '전체') return true;
      if (filter === '내 업무') return t.assigneeId === userProfile?.id || t.assigneeName === userProfile?.name;
      const targetUser = users.find(u => u.id === filter);
      if (targetUser) return t.assigneeId === targetUser.id || t.assigneeName === targetUser.name;
      return false;
    });

    return {
      todo: uTasks.filter(t => t.status === 'TODO').length,
      doing: uTasks.filter(t => t.status === 'IN_PROGRESS').length,
      done: uTasks.filter(t => t.status === 'DONE').length,
      holding: uTasks.filter(t => t.status === 'HOLDING').length,
      total: uTasks.length
    };
  }, [tasks, filter, users, userProfile]);



  const baskets = [
    {
      id: 'TODO',
      title: '업무대기 BASKET',
      headerBg: '#eff6ff',
      headerText: '#1e40af',
      headerBorder: 'rgba(30, 64, 175, 0.2)',
      countBg: '#1e40af',
      countText: '#ffffff',
      columnBg: '#f0f7ff'
    },
    {
      id: 'IN_PROGRESS',
      title: '업무중 BASKET',
      headerBg: '#f0fdf4',
      headerText: '#166534',
      headerBorder: 'rgba(22, 101, 52, 0.2)',
      countBg: '#166534',
      countText: '#ffffff',
      columnBg: '#f4fcf7'
    },
    {
      id: 'DONE',
      title: '완료 BASKET',
      headerBg: '#f1f5f9',
      headerText: '#334155',
      headerBorder: 'rgba(51, 65, 85, 0.2)',
      countBg: '#334155',
      countText: '#ffffff',
      columnBg: '#f8fafc'
    },
    {
      id: 'HOLDING',
      title: '보류 BASKET',
      headerBg: '#fffbeb',
      headerText: '#b45309',
      headerBorder: 'rgba(180, 83, 9, 0.2)',
      countBg: '#b45309',
      countText: '#ffffff',
      columnBg: '#fffdf4'
    }
  ];

  const handleQuickAdd = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && quickTaskTitle.trim()) {
      await addTask({
        title: quickTaskTitle,
        status: 'TODO',
        type: 'DAILY',
        scheduleType: 'SELF',
        importance: 'B',
        urgency: 5,
        quadrant: 'Q2',
        assigneeId: userProfile?.id || '',
        assigneeName: userProfile?.name || '관리자',
        startDate: selectedDate || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      } as any);
      setQuickTaskTitle('');
    }
  };

  // ── Trading Metrics Calculations ──
  const tradingKPIs = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // 1. 이번달 PI 건수 (piDate 기준)
    let piYsCount = 0;
    let piYsaccCount = 0;

    pis.forEach(p => {
      if ((p.piDate || "").startsWith(thisMonth)) {
        if (p.issuingCompany === 'YS') piYsCount++;
        else piYsaccCount++;
      }
    });

    // 2. 수주 금액 (발주일 poDate 기준) & 3. 매출 금액 (ETD 기준)
    let orderYsAmount = 0;
    let orderYsaccAmount = 0;
    let orderYsCount = 0;
    let orderYsaccCount = 0;

    let salesYsAmount = 0;
    let salesYsaccAmount = 0;
    let salesYsCount = 0;
    let salesYsaccCount = 0;

    let salesYsYearAmount = 0;
    let salesYsaccYearAmount = 0;
    let salesYsYearCount = 0;
    let salesYsaccYearCount = 0;

    let salesYsTotalAmount = 0;
    let salesYsaccTotalAmount = 0;
    let salesYsTotalCount = 0;
    let salesYsaccTotalCount = 0;

    const thisYear = String(now.getFullYear());

    orders.forEach(o => {
      const pi = pis.find(p => p.id === o.quotationId);
      const amount = pi?.totalUsd || o.totalAmount || 0;
      const isYs = o.issuingCompany === 'YS';

      if ((o.poDate || "").startsWith(thisMonth)) {
        if (isYs) {
          orderYsAmount += amount;
          orderYsCount++;
        } else {
          orderYsaccAmount += amount;
          orderYsaccCount++;
        }
      }

      const etd = (o.etd || "").trim();
      if (etd) {
        // 1. This Month
        if (etd.startsWith(thisMonth)) {
          if (isYs) {
            salesYsAmount += amount;
            salesYsCount++;
          } else {
            salesYsaccAmount += amount;
            salesYsaccCount++;
          }
        }
        // 2. This Year
        if (etd.startsWith(thisYear)) {
          if (isYs) {
            salesYsYearAmount += amount;
            salesYsYearCount++;
          } else {
            salesYsaccYearAmount += amount;
            salesYsaccYearCount++;
          }
        }
        // 3. Total Cumulative
        if (isYs) {
          salesYsTotalAmount += amount;
          salesYsTotalCount++;
        } else {
          salesYsaccTotalAmount += amount;
          salesYsaccTotalCount++;
        }
      }
    });

    return {
      piYsCount, piYsaccCount,
      orderYsAmount, orderYsaccAmount, orderYsCount, orderYsaccCount,
      salesYsAmount, salesYsaccAmount, salesYsCount, salesYsaccCount,
      salesYsYearAmount, salesYsaccYearAmount, salesYsYearCount, salesYsaccYearCount,
      salesYsTotalAmount, salesYsaccTotalAmount, salesYsTotalCount, salesYsaccTotalCount
    };
  }, [pis, orders]);

  if (loading) return <div className="content-area" style={{ alignItems: 'center', justifyContent: 'center' }}>데이터를 불러오는 중...</div>;

  return (
    <div style={{ padding: '4px 30px 10px 30px', height: 'calc(100vh - 95px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxSizing: 'border-box' }}>
      <style>{`
        .holiday-badge {
          display: inline-block;
          font-size: 7.5px !important;
          font-weight: 850 !important;
          line-height: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          transition: transform 0.12s ease-in-out, text-shadow 0.12s ease-in-out, background-color 0.12s, box-shadow 0.12s;
          cursor: help;
        }
        .holiday-badge:hover {
          transform: scale(1.6) !important;
          z-index: 100 !important;
          text-shadow: 0 1px 3px rgba(0,0,0,0.2);
          position: relative;
          background-color: #fff !important;
          padding: 2px 4px !important;
          border-radius: 4px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
          overflow: visible !important;
          text-overflow: clip !important;
          max-width: none !important;
        }
      `}</style>
      {tradingLoading ? (
        <div style={{ padding: '20px', background: '#fff', border: '1px solid var(--border-color)', borderRadius: '10px', marginBottom: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>무역 통계 데이터를 실시간 연결 중...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px', alignItems: 'stretch' }}>
            
            {/* ── 왼쪽 (50%): 달력 및 일정 목록 (좌우 배치) ── */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '10px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'grid', gridTemplateColumns: '260px 1fr', gap: '12px', alignItems: 'stretch', order: 2 }}>
              
              {/* 스케줄러 헤더 영역 (양쪽 컬럼 통합) */}
              <div style={{ gridColumn: '1 / span 2', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                <span style={{ fontSize: '17.5px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📅 YSACC 스케줄러
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <button
                    onClick={handlePrevMonth}
                    style={{ padding: '2px 6px', background: '#f1f5f9', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    ◀
                  </button>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', minWidth: '65px', textAlign: 'center' }}>
                    {currentYear}년 {currentMonth + 1}월
                  </span>
                  <button
                    onClick={handleNextMonth}
                    style={{ padding: '2px 6px', background: '#f1f5f9', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    ▶
                  </button>
                  <button
                    onClick={handleGoToToday}
                    style={{ padding: '2px 6px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    오늘
                  </button>
                </div>
              </div>

              {/* 제목 바로 밑에 배치되는 세계 시각 영역 (양쪽 컬럼 통합) */}
              <div style={{ gridColumn: '1 / span 2', marginTop: '-4px', marginBottom: '4px' }}>
                <WorldClocks />
              </div>

              {/* 달력 영역 (왼쪽 300px) */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>

                {/* 요일 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '2px', textAlign: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '6px' }}>
                  {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                    <span key={day} style={{ fontSize: '11px', fontWeight: 800, color: idx === 0 ? '#ef4444' : idx === 6 ? '#3b82f6' : 'var(--text-secondary)' }}>
                      {day}
                    </span>
                  ))}
                </div>

                {/* 그리드 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridAutoRows: 'minmax(28px, auto)', gap: '2px', flex: 1 }}>
                  {renderCalendarDays()}
                </div>
              </div>

              {/* 일정 목록 영역 - 좌우 분할 (오늘의 일정 / 이번달 전체 일정) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderLeft: '1px solid var(--border-default)', paddingLeft: '16px' }}>
                
                {/* 1. 오늘의 일정 */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                      📌 <span>오늘의 일정 ({
                        calendarEvents.filter(e => {
                          const todayStr = new Date().toISOString().split('T')[0];
                          const start = e.startDate;
                          const end = e.endDate || start;
                          return todayStr >= start && todayStr <= end;
                        }).length
                      }건)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const todayStr = new Date().toISOString().split('T')[0];
                        setSelectedDateForEvent(todayStr);
                        setEventForm({
                          title: '',
                          type: '개인일정',
                          startDate: todayStr,
                          startTime: '09:00',
                          endDate: todayStr,
                          endTime: '18:00',
                          isPublic: true,
                          participants: '',
                          description: '',
                          attachments: []
                        });
                      }}
                      style={{ padding: '3px 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10.5px', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}
                    >
                      ＋ 등록
                    </button>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', maxHeight: '175px', paddingRight: '4px' }}>
                    {calendarEvents.filter(e => {
                      const todayStr = new Date().toISOString().split('T')[0];
                      const start = e.startDate;
                      const end = e.endDate || start;
                      return todayStr >= start && todayStr <= end;
                    }).length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', padding: '30px 0', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border-color)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        오늘 등록된 일정이 없습니다.
                      </div>
                    ) : (
                      calendarEvents.filter(e => {
                        const todayStr = new Date().toISOString().split('T')[0];
                        const start = e.startDate;
                        const end = e.endDate || start;
                        return todayStr >= start && todayStr <= end;
                      })
                      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
                      .map(e => {
                        const colors = getEventBadgeColor(e.type);
                        return (
                          <div
                            key={e.id}
                            onClick={() => {
                              setSelectedEventForView(e);
                              setEventForm({
                                title: e.title,
                                type: e.type,
                                startDate: e.startDate,
                                startTime: e.startTime || '09:00',
                                endDate: e.endDate || e.startDate,
                                endTime: e.endTime || '18:00',
                                isPublic: e.isPublic !== undefined ? e.isPublic : true,
                                participants: e.participants || '',
                                description: e.description || '',
                                attachments: e.attachments || []
                              });
                            }}
                            style={{
                              padding: '5px 8px',
                              background: colors.bg,
                              color: colors.text,
                              border: `1px solid ${colors.border}`,
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              transition: 'all 0.1s'
                            }}
                            onMouseEnter={ev => { ev.currentTarget.style.transform = 'translateY(-1px)'; ev.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.03)'; }}
                            onMouseLeave={ev => { ev.currentTarget.style.transform = 'none'; ev.currentTarget.style.boxShadow = 'none'; }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: '#0f172a' }}>
                                {!e.isPublic && <span>🔒</span>}
                                <strong>{e.title}</strong>
                              </span>
                              <span style={{ fontSize: '9px', background: '#fff', padding: '1px 3px', borderRadius: '3px', border: `1px solid ${colors.border}`, color: 'var(--text-secondary)' }}>
                                {e.type}
                              </span>
                            </div>
                            <div style={{ fontSize: '9.5px', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '1px' }}>
                              <span>⏱ {e.startTime || '09:00'}~{e.endTime || '18:00'}</span>
                              <span>👤 {e.creatorName}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 2. 이번달 전체 일정 */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                      📋 <span>{currentMonth + 1}월 전체 일정 ({
                        calendarEvents.filter(e => {
                          const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
                          return e.startDate.startsWith(currentMonthStr) || (e.endDate && e.endDate.startsWith(currentMonthStr));
                        }).length
                      }건)</span>
                    </span>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', maxHeight: '175px', paddingRight: '4px' }}>
                    {calendarEvents.filter(e => {
                      const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
                      return e.startDate.startsWith(currentMonthStr) || (e.endDate && e.endDate.startsWith(currentMonthStr));
                    }).length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', padding: '30px 0', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border-color)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        이번 달에 등록된 일정이 없습니다.
                      </div>
                    ) : (
                      calendarEvents.filter(e => {
                        const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
                        return e.startDate.startsWith(currentMonthStr) || (e.endDate && e.endDate.startsWith(currentMonthStr));
                      })
                      .sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startTime || '').localeCompare(b.startTime || ''))
                      .map(e => {
                        const colors = getEventBadgeColor(e.type);
                        return (
                          <div
                            key={e.id}
                            onClick={() => {
                              setSelectedEventForView(e);
                              setEventForm({
                                title: e.title,
                                type: e.type,
                                startDate: e.startDate,
                                startTime: e.startTime || '09:00',
                                endDate: e.endDate || e.startDate,
                                endTime: e.endTime || '18:00',
                                isPublic: e.isPublic !== undefined ? e.isPublic : true,
                                participants: e.participants || '',
                                description: e.description || '',
                                attachments: e.attachments || []
                              });
                            }}
                            style={{
                              padding: '5px 8px',
                              background: colors.bg,
                              color: colors.text,
                              border: `1px solid ${colors.border}`,
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              transition: 'all 0.1s'
                            }}
                            onMouseEnter={ev => { ev.currentTarget.style.transform = 'translateY(-1px)'; ev.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.03)'; }}
                            onMouseLeave={ev => { ev.currentTarget.style.transform = 'none'; ev.currentTarget.style.boxShadow = 'none'; }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: '#0f172a' }}>
                                {!e.isPublic && <span>🔒</span>}
                                <strong>{e.title}</strong>
                              </span>
                              <span style={{ fontSize: '9px', background: '#fff', padding: '1px 3px', borderRadius: '3px', border: `1px solid ${colors.border}`, color: 'var(--text-secondary)' }}>
                                {e.type}
                              </span>
                            </div>
                            <div style={{ fontSize: '9.5px', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '1px' }}>
                              <span>📅 {e.startDate === e.endDate ? e.startDate.slice(5) : `${e.startDate.slice(5)}~${(e.endDate || '').slice(5)}`}</span>
                              <span>⏱ {e.startTime || '09:00'}~{e.endTime || '18:00'}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                
              </div>

            </div>

            {/* ── 오른쪽 (50%): 무역실시간매출및PI현황 ── */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '8px', order: 1 }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 2px 0' }}>
                <span>📊 무역 실시간 매출 및 PI 현황</span>
                <span style={{ fontSize: '0.85rem', background: 'var(--primary-color)', color: '#fff', padding: '1px 6px', borderRadius: '20px', fontWeight: 700 }}>통합 대시보드</span>
              </h2>

              {/* 1. 이번달 PI 건수 */}
              <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flex: 1 }}>
                <div style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }} />
                  이번달 PI 건수
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '16.5px', fontWeight: 700 }}>
                  <span>영성ACC: <span style={{ color: '#3b82f6', fontWeight: 900, fontSize: '20px' }}>{tradingKPIs.piYsCount}</span> 건</span>
                  <span style={{ color: 'var(--border-default)', fontWeight: 'normal' }}>|</span>
                  <span>(주)YSACC: <span style={{ color: '#3b82f6', fontWeight: 900, fontSize: '20px' }}>{tradingKPIs.piYsaccCount}</span> 건</span>
                </div>
              </div>

              {/* 2. 수주 금액 */}
              <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flex: 1 }}>
                <div style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                  수주 금액
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '16.5px', fontWeight: 700 }}>
                  <span>영성ACC: <span style={{ color: '#10b981', fontWeight: 900, fontSize: '19px' }}>${tradingKPIs.orderYsAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>({tradingKPIs.orderYsCount}건)</span></span>
                  <span style={{ color: 'var(--border-default)', fontWeight: 'normal' }}>|</span>
                  <span>(주)YSACC: <span style={{ color: '#10b981', fontWeight: 900, fontSize: '19px' }}>${tradingKPIs.orderYsaccAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>({tradingKPIs.orderYsaccCount}건)</span></span>
                </div>
              </div>

              {/* 3. 당월 매출 */}
              <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flex: 1 }}>
                <div style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#ea580c' }} />
                  당월 매출 (ETD 기준)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '16.5px', fontWeight: 700 }}>
                  <span>영성ACC: <span style={{ color: '#ea580c', fontWeight: 900, fontSize: '19px' }}>${tradingKPIs.salesYsAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>({tradingKPIs.salesYsCount}건)</span></span>
                  <span style={{ color: 'var(--border-default)', fontWeight: 'normal' }}>|</span>
                  <span>(주)YSACC: <span style={{ color: '#ea580c', fontWeight: 900, fontSize: '19px' }}>${tradingKPIs.salesYsaccAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>({tradingKPIs.salesYsaccCount}건)</span></span>
                </div>
              </div>

              {/* 4. 전체 누적 매출금액 */}
              <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flex: 1 }}>
                <div style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626' }} />
                  전체 누적 매출금액
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '16.5px', fontWeight: 700 }}>
                  <span>영성ACC: <span style={{ color: '#dc2626', fontWeight: 900, fontSize: '19px' }}>${tradingKPIs.salesYsTotalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>({tradingKPIs.salesYsTotalCount}건)</span></span>
                  <span style={{ color: 'var(--border-default)', fontWeight: 'normal' }}>|</span>
                  <span>(주)YSACC: <span style={{ color: '#dc2626', fontWeight: 900, fontSize: '19px' }}>${tradingKPIs.salesYsaccTotalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>({tradingKPIs.salesYsaccTotalCount}건)</span></span>
                </div>
              </div>
            </div>

          </div>
        </>
      )}

      {/* 일정 등록 모달 */}
      {selectedDateForEvent && (
        <div
          onClick={() => setSelectedDateForEvent(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '480px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ padding: '16px 20px', background: '#3b82f6', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 800 }}>📅 일정 등록 ({selectedDateForEvent})</span>
              <button
                onClick={() => setSelectedDateForEvent(null)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>일정 제목 ★</label>
                <input
                  type="text"
                  placeholder="일정 제목을 입력하세요"
                  value={eventForm.title}
                  onChange={e => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '13.5px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>일정 구분</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['개인일정', '미팅', '출장', '기타'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEventForm(prev => ({ ...prev, type: t as any }))}
                      style={{
                        flex: 1,
                        padding: '6px 0',
                        borderRadius: '6px',
                        border: eventForm.type === t ? '2px solid #3b82f6' : '1px solid var(--border-default)',
                        background: eventForm.type === t ? '#eff6ff' : '#fff',
                        color: eventForm.type === t ? '#1e40af' : 'var(--text-secondary)',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        cursor: 'pointer'
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>시작일</label>
                  <input
                    type="date"
                    value={eventForm.startDate}
                    onChange={e => setEventForm(prev => ({ ...prev, startDate: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>시작시간</label>
                  <input
                    type="time"
                    value={eventForm.startTime}
                    onChange={e => setEventForm(prev => ({ ...prev, startTime: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>종료일</label>
                  <input
                    type="date"
                    value={eventForm.endDate}
                    onChange={e => setEventForm(prev => ({ ...prev, endDate: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>종료시간</label>
                  <input
                    type="time"
                    value={eventForm.endTime}
                    onChange={e => setEventForm(prev => ({ ...prev, endTime: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={eventForm.isPublic}
                  onChange={e => setEventForm(prev => ({ ...prev, isPublic: e.target.checked }))}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="isPublic" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  📢 부서/회사 전체에 공유 (체크 시 모든 멤버에게 보임)
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>참석자/미팅 대상</label>
                <input
                  type="text"
                  placeholder="참석 멤버 또는 바이어 명"
                  value={eventForm.participants}
                  onChange={e => setEventForm(prev => ({ ...prev, participants: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>상세 내용/메모</label>
                <textarea
                  rows={3}
                  placeholder="상세한 일정을 기록하세요"
                  value={eventForm.description}
                  onChange={e => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '13.5px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              {/* 파일 첨부 영역 */}
              <div 
                onDragOver={handleEventDragOver}
                onDragLeave={handleEventDragLeave}
                onDrop={handleEventDrop}
                onPaste={handleEventPaste}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  border: dragOverEventUpload ? '2px dashed #3b82f6' : '1px dashed var(--border-default)',
                  borderRadius: '8px',
                  padding: '12px',
                  background: dragOverEventUpload ? '#eff6ff' : '#f8fafc',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>📎 파일 첨부 (드래그 & 드롭 및 Ctrl+V 화면 캡처 지원)</label>
                  <label 
                    style={{
                      fontSize: '11px',
                      background: 'var(--border-color)',
                      color: 'var(--text-secondary)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 650,
                      userSelect: 'none'
                    }}
                  >
                    파일 선택
                    <input 
                      type="file"
                      multiple
                      onChange={async (e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          await handleEventFilesUpload(e.target.files);
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
                
                {/* 첨부파일 리스트 */}
                {eventForm.attachments && eventForm.attachments.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                    {eventForm.attachments.map((file, fIdx) => {
                      const nameLower = file.name.toLowerCase();
                      const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(nameLower);
                      const isPdf = /\.pdf$/i.test(nameLower);
                      const isExcel = /\.(xls|xlsx)$/i.test(nameLower);

                      return (
                        <div 
                          key={fIdx} 
                          style={{ 
                            background: '#fff', 
                            border: '1px solid var(--border-default)', 
                            borderRadius: '8px', 
                            padding: '6px 10px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            fontSize: '12px', 
                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                            boxSizing: 'border-box'
                          }}
                        >
                          {/* Thumbnail / Icon */}
                          <div 
                            onClick={() => setPreviewFile({ name: file.name, url: file.url })}
                            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                            title="클릭하여 미리보기"
                          >
                            {isImg ? (
                              <img 
                                src={file.url} 
                                alt={file.name} 
                                style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-default)' }} 
                              />
                            ) : (
                              <span style={{ fontSize: '20px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: '4px', border: '1px solid var(--border-default)' }}>
                                {isPdf ? '📄' : isExcel ? '📊' : '📎'}
                              </span>
                            )}
                          </div>

                          {/* Name and size */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                            <span 
                              onClick={() => setPreviewFile({ name: file.name, url: file.url })}
                              style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                              title="클릭하여 미리보기"
                            >
                              {file.name}
                            </span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>({(file.size / 1024).toFixed(1)}KB)</span>
                          </div>

                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
                            <button 
                              type="button" 
                              onClick={() => setPreviewFile({ name: file.name, url: file.url })}
                              style={{ background: '#f1f5f9', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 6px', fontSize: '11px', fontWeight: 'bold' }}
                              title="미리보기"
                            >
                              🔍
                            </button>
                            <button 
                              type="button" 
                              onClick={() => handleEventDeleteAttachment(fIdx)} 
                              style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 6px', fontSize: '11px', fontWeight: 'bold' }}
                              title="삭제"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '11.5px', padding: '16px 0', pointerEvents: 'none' }}>
                    파일을 드래그해서 여기 놓거나, 캡처 화면을 클릭 후 붙여넣기(Ctrl+V) 하세요.
                  </div>
                )}
                {uploadingEventFile && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', color: '#2563eb', fontWeight: 700, marginTop: '4px' }}>
                    <span>⏳ 파일 업로드 중...</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setSelectedDateForEvent(null)}
                style={{ padding: '8px 16px', background: 'var(--border-color)', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 700 }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveEvent}
                style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 700 }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일정 상세 및 수정 모달 */}
      {selectedEventForView && (
        <div
          onClick={() => setSelectedEventForView(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '480px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ padding: '16px 20px', background: '#0f172a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 800 }}>📅 일정 상세 및 편집</span>
              <button
                onClick={() => setSelectedEventForView(null)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>등록자: <strong>{selectedEventForView.creatorName}</strong></span>
                <span>{selectedEventForView.isPublic ? '📢 회사 공유 일정' : '🔒 개인 일정'}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>일정 제목 ★</label>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={e => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '13.5px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>일정 구분</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['개인일정', '미팅', '출장', '기타'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEventForm(prev => ({ ...prev, type: t as any }))}
                      style={{
                        flex: 1,
                        padding: '6px 0',
                        borderRadius: '6px',
                        border: eventForm.type === t ? '2px solid #3b82f6' : '1px solid var(--border-default)',
                        background: eventForm.type === t ? '#eff6ff' : '#fff',
                        color: eventForm.type === t ? '#1e40af' : 'var(--text-secondary)',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        cursor: 'pointer'
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>시작일</label>
                  <input
                    type="date"
                    value={eventForm.startDate}
                    onChange={e => setEventForm(prev => ({ ...prev, startDate: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>시작시간</label>
                  <input
                    type="time"
                    value={eventForm.startTime}
                    onChange={e => setEventForm(prev => ({ ...prev, startTime: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>종료일</label>
                  <input
                    type="date"
                    value={eventForm.endDate}
                    onChange={e => setEventForm(prev => ({ ...prev, endDate: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>종료시간</label>
                  <input
                    type="time"
                    value={eventForm.endTime}
                    onChange={e => setEventForm(prev => ({ ...prev, endTime: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                <input
                  type="checkbox"
                  id="isPublicEdit"
                  checked={eventForm.isPublic}
                  onChange={e => setEventForm(prev => ({ ...prev, isPublic: e.target.checked }))}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="isPublicEdit" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  📢 부서/회사 전체에 공유 (체크 시 모든 멤버에게 보임)
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>참석자/미팅 대상</label>
                <input
                  type="text"
                  value={eventForm.participants}
                  onChange={e => setEventForm(prev => ({ ...prev, participants: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>상세 내용/메모</label>
                <textarea
                  rows={3}
                  value={eventForm.description}
                  onChange={e => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '13.5px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              {/* 파일 첨부 영역 */}
              <div 
                onDragOver={handleEventDragOver}
                onDragLeave={handleEventDragLeave}
                onDrop={handleEventDrop}
                onPaste={handleEventPaste}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  border: dragOverEventUpload ? '2px dashed #3b82f6' : '1px dashed var(--border-default)',
                  borderRadius: '8px',
                  padding: '12px',
                  background: dragOverEventUpload ? '#eff6ff' : '#f8fafc',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>📎 파일 첨부 (드래그 & 드롭 및 Ctrl+V 화면 캡처 지원)</label>
                  <label 
                    style={{
                      fontSize: '11px',
                      background: 'var(--border-color)',
                      color: 'var(--text-secondary)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 650,
                      userSelect: 'none'
                    }}
                  >
                    파일 선택
                    <input 
                      type="file"
                      multiple
                      onChange={async (e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          await handleEventFilesUpload(e.target.files);
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
                
                {/* 첨부파일 리스트 */}
                {eventForm.attachments && eventForm.attachments.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                    {eventForm.attachments.map((file, fIdx) => {
                      const nameLower = file.name.toLowerCase();
                      const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(nameLower);
                      const isPdf = /\.pdf$/i.test(nameLower);
                      const isExcel = /\.(xls|xlsx)$/i.test(nameLower);

                      return (
                        <div 
                          key={fIdx} 
                          style={{ 
                            background: '#fff', 
                            border: '1px solid var(--border-default)', 
                            borderRadius: '8px', 
                            padding: '6px 10px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            fontSize: '12px', 
                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                            boxSizing: 'border-box'
                          }}
                        >
                          {/* Thumbnail / Icon */}
                          <div 
                            onClick={() => setPreviewFile({ name: file.name, url: file.url })}
                            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                            title="클릭하여 미리보기"
                          >
                            {isImg ? (
                              <img 
                                src={file.url} 
                                alt={file.name} 
                                style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-default)' }} 
                              />
                            ) : (
                              <span style={{ fontSize: '20px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: '4px', border: '1px solid var(--border-default)' }}>
                                {isPdf ? '📄' : isExcel ? '📊' : '📎'}
                              </span>
                            )}
                          </div>

                          {/* Name and size */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                            <span 
                              onClick={() => setPreviewFile({ name: file.name, url: file.url })}
                              style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                              title="클릭하여 미리보기"
                            >
                              {file.name}
                            </span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>({(file.size / 1024).toFixed(1)}KB)</span>
                          </div>

                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
                            <button 
                              type="button" 
                              onClick={() => setPreviewFile({ name: file.name, url: file.url })}
                              style={{ background: '#f1f5f9', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 6px', fontSize: '11px', fontWeight: 'bold' }}
                              title="미리보기"
                            >
                              🔍
                            </button>
                            <button 
                              type="button" 
                              onClick={() => handleEventDeleteAttachment(fIdx)} 
                              style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 6px', fontSize: '11px', fontWeight: 'bold' }}
                              title="삭제"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '11.5px', padding: '16px 0', pointerEvents: 'none' }}>
                    파일을 드래그해서 여기 놓거나, 캡처 화면을 클릭 후 붙여넣기(Ctrl+V) 하세요.
                  </div>
                )}
                {uploadingEventFile && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', color: '#2563eb', fontWeight: 700, marginTop: '4px' }}>
                    <span>⏳ 파일 업로드 중...</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <div>
                {(selectedEventForView.creatorId === currentUser?.uid || userProfile?.role === 'admin') && (
                  <button
                    type="button"
                    onClick={handleDeleteEvent}
                    style={{ padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    일정 삭제
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedEventForView(null)}
                  style={{ padding: '8px 16px', background: 'var(--border-color)', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 700 }}
                >
                  닫기
                </button>
                {(selectedEventForView.creatorId === currentUser?.uid || userProfile?.role === 'admin') && (
                  <button
                    type="button"
                    onClick={handleSaveEvent}
                    style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    수정 완료
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '12px 0 10px 0' }} />

      {/* Date Navigation & Kanban Header */}
      <div className="top-section" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📋 오늘 해야 할 일을 바로 시작하는 화면</span>
            <span style={{ fontSize: '0.7rem', background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>실시간 칸반</span>
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>업무는 상태 바스켓, 프랭클린 중요도 기준으로 관리됩니다.</p>
        </div>

        {/* Date Mode Taps & Date Navigator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* ── 조회 모드 탭 ── */}
          <div style={{ display: 'flex', border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
            <button
              onClick={() => setDateMode('daily')}
              style={{
                padding: '6px 12px',
                border: 'none',
                background: dateMode === 'daily' ? '#3b82f6' : '#fff',
                color: dateMode === 'daily' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '12px',
                transition: 'all 0.15s'
              }}
            >
              일간
            </button>
            <button
              onClick={() => setDateMode('weekly')}
              style={{
                padding: '6px 12px',
                border: 'none',
                background: dateMode === 'weekly' ? '#3b82f6' : '#fff',
                color: dateMode === 'weekly' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '12px',
                transition: 'all 0.15s',
                borderLeft: '1px solid var(--border-default)'
              }}
            >
              주간
            </button>
            <button
              onClick={() => setDateMode('range')}
              style={{
                padding: '6px 12px',
                border: 'none',
                background: dateMode === 'range' ? '#3b82f6' : '#fff',
                color: dateMode === 'range' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '12px',
                transition: 'all 0.15s',
                borderLeft: '1px solid var(--border-default)'
              }}
            >
              기간 검색
            </button>
          </div>

          {/* ── 상세 날짜 선택 영역 ── */}
          {dateMode === 'daily' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
              <button onClick={handlePrevDay} style={{ padding: '6px 12px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151', borderRight: '1px solid var(--border-color)' }}>‹</button>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                style={{
                  padding: '4px 10px',
                  border: 'none',
                  outline: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  background: '#fff'
                }}
              />
              <button onClick={handleNextDay} style={{ padding: '6px 12px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151', borderLeft: '1px solid var(--border-color)' }}>›</button>
              {selectedDate !== new Date().toISOString().split('T')[0] && (
                <button
                  onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                  style={{
                    padding: '6px 12px',
                    border: 'none',
                    borderLeft: '1px solid var(--border-color)',
                    background: '#f0fdf4',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#16a34a'
                  }}
                >
                  오늘
                </button>
              )}
            </div>
          )}

          {dateMode === 'weekly' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
              <button onClick={() => setWeekOffset(w => w - 1)} style={{ padding: '6px 12px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151' }}>‹</button>
              <div style={{ padding: '6px 14px', background: weekOffset === 0 ? '#eff6ff' : '#f8fafc', color: weekOffset === 0 ? '#2563eb' : '#374151', fontWeight: 700, fontSize: '13px', borderLeft: '1px solid var(--border-default)', borderRight: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                📅 {formatWeekLabel(weekOffset)}
              </div>
              <button onClick={() => setWeekOffset(w => w + 1)} style={{ padding: '6px 12px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151' }}>›</button>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} style={{ padding: '6px 10px', border: 'none', borderLeft: '1px solid var(--border-default)', background: '#fff7ed', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#ea580c' }}>이번주</button>
              )}
            </div>
          )}

          {dateMode === 'range' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    border: 'none',
                    outline: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ padding: '0 8px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700, background: '#f8fafc', borderLeft: '1px solid var(--border-default)', borderRight: '1px solid var(--border-default)', height: '30px', display: 'flex', alignItems: 'center' }}>~</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    border: 'none',
                    outline: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => setRangePreset('today')} style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>오늘</button>
                <button onClick={() => setRangePreset('week')} style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>이번주</button>
                <button onClick={() => setRangePreset('month')} style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>이번달</button>
                <button onClick={() => setRangePreset('all')} style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>전체</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Kanban Container: Sidebar on left + Board on right */}
      <div className="kanban-main-layout" style={{ display: 'flex', gap: '20px', alignItems: 'stretch', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        
        {/* Left Side Panel (담당자별 배당 현황 & 미배당 업무) */}
        <div className="kanban-left-panel" style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px', borderRight: '1px solid var(--border-color)', paddingRight: '16px', overflowY: 'auto' }}>
          <div>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>담당자별 배당 현황</h3>
            <div style={{ fontSize: '0.78rem', background: '#fef9c3', border: '1px solid #fef08a', color: '#854d0e', padding: '6px 10px', borderRadius: '6px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <span>📂</span> 미배당 업무 <span style={{ color: '#ca8a04', fontWeight: 800 }}>{unassignedTasks.length}건</span>
            </div>
            
            {/* Assignee list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* 내 업무 */}
              <div
                onClick={() => setFilter('내 업무')}
                onDragOver={handleAssigneeDragOver}
                onDragLeave={handleAssigneeDragLeave}
                onDrop={e => userProfile && handleAssigneeDrop(e, userProfile.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: filter === '내 업무' ? 'rgba(190, 18, 60, 0.08)' : '#fff',
                  border: filter === '내 업무' ? '1px solid var(--primary-color)' : '1px solid var(--border-default)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg,var(--primary-color),var(--primary-hover))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {userProfile?.name?.charAt(0) || '나'}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {userProfile?.name} (본인)
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                      총 {tasks.filter(t => t.assigneeId === userProfile?.id || t.assigneeName === userProfile?.name).length}건
                    </div>
                  </div>
                </div>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
              </div>

              {/* Other assignees */}
              {users.filter(u => u.id !== userProfile?.id).map(u => {
                const isSelected = filter === u.id;
                const mTasks = tasks.filter(t => t.assigneeId === u.id || t.assigneeName === u.name);
                return (
                  <div
                    key={u.id}
                    onClick={() => setFilter(u.id)}
                    onDragOver={handleAssigneeDragOver}
                    onDragLeave={handleAssigneeDragLeave}
                    onDrop={e => handleAssigneeDrop(e, u.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: isSelected ? 'rgba(190, 18, 60, 0.08)' : '#fff',
                      border: isSelected ? '1px solid var(--primary-color)' : '1px solid var(--border-default)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--focus-ring), #0891b2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                        {u.name?.charAt(0)}
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {u.name} ({u.department || '담당자'})
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                          총 {mTasks.length}건
                        </div>
                      </div>
                    </div>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                  </div>
                );
              })}

              {/* 전체 보기 */}
              <div
                onClick={() => setFilter('전체')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: filter === '전체' ? 'rgba(190, 18, 60, 0.08)' : '#fff',
                  border: filter === '전체' ? '1px solid var(--primary-color)' : '1px solid var(--border-default)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: filter === '전체' ? 'var(--primary-color)' : 'var(--text-secondary)',
                  transition: 'all 0.2s'
                }}
              >
                전체 담당자 보기
              </div>
            </div>
            
            {/* 담당자 추가 */}
            <a href="/team-management" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', color: 'var(--text-secondary)', marginTop: '10px', fontWeight: 600 }}>
              ✉ 담당자 추가
            </a>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />

          {/* Unassigned Tasks Section */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '150px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>✉</span> 미배당 — 드래그하여 배정
            </div>
            
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleUnassignedDrop}
              style={{
                flex: 1,
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                background: '#fff',
                padding: '8px',
                overflowY: 'auto',
                minHeight: '100px',
                maxHeight: '280px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              {unassignedTasks.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border-color)', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '0.72rem', textAlign: 'center', padding: '10px' }}>
                  미배당 업무가 없습니다.<br/>여기에 카드를 놓아 배정을 취소할 수 있습니다.
                </div>
              ) : (
                unassignedTasks.map(t => <TaskChip key={t.id} task={t} />)
              )}
            </div>

            {/* Quick add unassigned task input */}
            <div style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px dashed var(--border-default)', borderRadius: '6px', padding: '6px 10px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>＋</span>
                <input
                  value={delegatedQuickTitle}
                  onChange={e => setDelegatedQuickTitle(e.target.value)}
                  onKeyDown={handleUnassignedQuickAdd}
                  placeholder="업무 직접 입력 후 Enter"
                  style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.75rem', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Main Area (Selected Assignee profile + Info banner + 4 Baskets) */}
        <div className="kanban-right-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0, width: '100%', overflow: 'hidden' }}>
          
          {/* Active Assignee Info Header & Filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid var(--border-default)', borderRadius: '10px', padding: '12px 16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg,var(--primary-color),var(--primary-hover))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 800, color: '#fff' }}>
                {activeUser?.name?.slice(0, 2) || '전체'}
              </div>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {activeUser ? activeUser.name : '전체 담당자'}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 500, marginLeft: '6px' }}>
                    {activeUser ? (activeUser.department || activeUser.role || '담당자') : '통합 업무 조회'}
                  </span>
                </h3>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  대기 <span style={{ color: '#3b82f6', fontWeight: 700 }}>{activeUserStats.todo}</span> · 진행 <span style={{ color: '#166534', fontWeight: 700 }}>{activeUserStats.doing}</span> · 완료 <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{activeUserStats.done}</span> · 보류 <span style={{ color: '#b45309', fontWeight: 700 }}>{activeUserStats.holding}</span> (총 {activeUserStats.total}건)
                </div>
              </div>
            </div>

            {/* Quadrant Filters */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => setQuadrantFilter('ALL')} style={{ padding: '4px 10px', border: '1px solid var(--border-default)', borderRadius: '20px', fontSize: '0.72rem', background: quadrantFilter === 'ALL' ? '#3b82f6' : 'white', color: quadrantFilter === 'ALL' ? 'white' : '#4b5563', cursor: 'pointer', fontWeight: 700 }}>전체</button>
              <button onClick={() => setQuadrantFilter('Q1')} style={{ padding: '4px 10px', border: '1px solid #fee2e2', borderRadius: '20px', fontSize: '0.72rem', background: quadrantFilter === 'Q1' ? '#ef4444' : 'white', color: quadrantFilter === 'Q1' ? 'white' : '#ef4444', cursor: 'pointer', fontWeight: 700 }}>Q1 긴급·중요</button>
              <button onClick={() => setQuadrantFilter('Q2')} style={{ padding: '4px 10px', border: '1px solid #dbeafe', borderRadius: '20px', fontSize: '0.72rem', background: quadrantFilter === 'Q2' ? '#3b82f6' : 'white', color: quadrantFilter === 'Q2' ? 'white' : '#2563eb', cursor: 'pointer', fontWeight: 700 }}>Q2 중요</button>
              <button onClick={() => setQuadrantFilter('Q3')} style={{ padding: '4px 10px', border: '1px solid #fef3c7', borderRadius: '20px', fontSize: '0.72rem', background: quadrantFilter === 'Q3' ? '#f59e0b' : 'white', color: quadrantFilter === 'Q3' ? 'white' : '#d97706', cursor: 'pointer', fontWeight: 700 }}>Q3</button>
              <button onClick={() => setQuadrantFilter('Q4')} style={{ padding: '4px 10px', border: '1px solid #f1f5f9', borderRadius: '20px', fontSize: '0.72rem', background: quadrantFilter === 'Q4' ? 'var(--text-muted)' : 'white', color: quadrantFilter === 'Q4' ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700 }}>Q4</button>
            </div>
          </div>

          {/* Unassigned Warning Info Bar */}
          {unassignedTasks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fffbeb', border: '1px solid #fef08a', color: '#854d0e', padding: '10px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600 }}>
              <span>✉</span>
              <span>처리 대기 중인 위임 업무가 <strong style={{ color: '#ca8a04' }}>{unassignedTasks.length}건</strong> 있습니다. 왼쪽 패널에서 담당자에게 드래그하여 배정하세요.</span>
            </div>
          )}

          {/* 4 Baskets Kanban Board */}
          <div className="board-container kanban-board-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', alignItems: 'stretch', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {baskets.map(basket => (
              <div
                key={basket.id}
                className="board-column"
                onDragOver={e => {
                  e.preventDefault();
                  setDragOverBasketId(basket.id);
                }}
                onDragLeave={() => setDragOverBasketId(null)}
                onDrop={e => {
                  handleStatusDrop(e, basket.id);
                  setDragOverBasketId(null);
                }}
                style={{
                  background: dragOverBasketId === basket.id ? 'var(--primary-light, #eff6ff)' : basket.columnBg,
                  border: `2px solid ${basket.countBg}40`,
                  borderRadius: '12px',
                  padding: '8px',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.15s',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                  overflow: 'hidden'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: basket.headerBg,
                  border: `1px solid ${basket.headerBorder}`
                }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: basket.headerText }}>
                    {basket.title}
                  </div>
                  <div style={{
                    background: basket.countBg,
                    color: basket.countText,
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 800
                  }}>
                    {filteredTasks.filter(t => {
                      const s = t.status?.toUpperCase();
                      if (basket.id === 'TODO') return s === 'TODO' || s === '대기';
                      if (basket.id === 'IN_PROGRESS') return s === 'IN_PROGRESS' || s === '진행중';
                      if (basket.id === 'DONE') return s === 'DONE' || s === '완료';
                      return s === 'HOLDING' || s === '보류';
                    }).length}
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minHeight: 0, overflow: 'hidden', marginTop: '4px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflowY: 'auto', paddingRight: '2px', minHeight: 0 }}>
                    {filteredTasks.filter(t => {
                      const s = t.status?.toUpperCase();
                      if (basket.id === 'TODO') return s === 'TODO' || s === '대기';
                      if (basket.id === 'IN_PROGRESS') return s === 'IN_PROGRESS' || s === '진행중';
                      if (basket.id === 'DONE') return s === 'DONE' || s === '완료';
                      return s === 'HOLDING' || s === '보류';
                    }).map(task => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={e => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setEditingTask(task)}
                        className="task-card"
                        style={{
                          background: '#fff',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          border: '1px solid var(--border-color)',
                          cursor: 'grab',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          opacity: draggingId === task.id ? 0.4 : 1
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                flex: 1,
                                lineHeight: '1.3'
                              }}>{task.title}</div>
                          {(() => {
                            const quad = (task.quadrant || 'Q2').toUpperCase();
                            const badgeStyles: Record<string, { color: string; bg: string; border: string }> = {
                              Q1: { color: '#ef4444', bg: '#fef2f2', border: '1px solid rgba(239, 68, 68, 0.2)' },
                              Q2: { color: '#3b82f6', bg: '#eff6ff', border: '1px solid rgba(59, 130, 246, 0.2)' },
                              Q3: { color: '#f59e0b', bg: '#fffbeb', border: '1px solid rgba(245, 158, 11, 0.2)' },
                              Q4: { color: 'var(--text-muted)', bg: '#f8fafc', border: '1px solid rgba(148, 163, 184, 0.2)' }
                            };
                            const badgeStyle = badgeStyles[quad] || badgeStyles.Q2;
                            return (
                              <div style={{
                                fontSize: '0.62rem',
                                fontWeight: 800,
                                padding: '1px 4px',
                                borderRadius: '3px',
                                color: badgeStyle.color,
                                background: badgeStyle.bg,
                                border: badgeStyle.border,
                                marginLeft: '6px',
                                flexShrink: 0
                              }}>{quad}</div>
                            );
                          })()}
                        </div>
                        
                        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.65rem', background: '#eff6ff', color: '#2563eb', padding: '0 4px', borderRadius: '3px', fontWeight: 600 }}>
                            {task.type === 'PROJECT' ? '프로젝트' : '일반'}
                          </span>
                          <span style={{ fontSize: '0.65rem', background: '#f0fdf4', color: '#16a34a', padding: '0 4px', borderRadius: '3px', fontWeight: 600 }}>
                            {task.scheduleType === 'SELF' ? '스스로 계획' : '일정기반'}
                          </span>
                          {filter === '전체' && (
                            <span style={{ fontSize: '0.65rem', background: '#f3e8ff', color: '#7c3aed', padding: '0 4px', borderRadius: '3px', fontWeight: 600 }}>
                              👤 {task.assigneeName || '미배정'}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <span>마감 {task.dueDate || '-'}</span>
                            {(task.commentCount ?? 0) > 0 && (
                              <span 
                                className={isCommentNew(task.lastCommentAt) ? 'blink-badge' : ''}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#d97706', background: '#fef3c7', padding: '0 4px', borderRadius: '8px', fontWeight: 700 }}
                              >
                                💬 {task.commentCount}
                              </span>
                            )}
                          </div>
                          <div style={{ color: 'var(--focus-ring)', fontWeight: 700 }}>{task.projectName || 'YSACC'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {basket.id === 'TODO' && filter !== '전체' && (
                    <input 
                      type="text" 
                      placeholder="+ 업무명 입력 후 Enter" 
                      value={quickTaskTitle}
                      onChange={(e) => setQuickTaskTitle(e.target.value)}
                      onKeyDown={handleQuickAdd}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px dashed var(--border-default)', background: 'transparent', fontSize: '0.72rem', outline: 'none' }} 
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editingTask && (
        <TaskModal
          initialTask={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={async (data) => {
            await updateTask({ ...editingTask, ...data } as Task);
            setEditingTask(null);
          }}
        />
      )}

      {/* 파일 미리보기 모달 */}
      {previewFile && (
        <div
          onClick={() => setPreviewFile(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            backdropFilter: 'blur(4px)'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '800px',
              maxHeight: '90vh',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div
              style={{
                padding: '14px 20px',
                background: 'var(--text-primary)',
                color: '#fff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: 800, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                🔍 파일 미리보기: {previewFile.name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <a
                  href={previewFile.url}
                  download={previewFile.name}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    cursor: 'pointer'
                  }}
                >
                  다운로드
                </a>
                <button
                  onClick={() => setPreviewFile(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '18px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    padding: '0 4px'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
            <div style={{ padding: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f1f5f9', overflowY: 'auto', flex: 1, minHeight: '300px' }}>
              {/\.(png|jpe?g|gif|webp|bmp)$/i.test(previewFile.name) ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
                />
              ) : /\.pdf$/i.test(previewFile.name) ? (
                <iframe
                  src={previewFile.url}
                  title={previewFile.name}
                  style={{ width: '100%', height: '70vh', border: 'none', borderRadius: '4px', background: '#fff' }}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>📁</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>미리보기를 지원하지 않는 파일 형식입니다.</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>파일을 다운로드하여 로컬 기기에서 확인해 주세요.</div>
                  <a
                    href={previewFile.url}
                    download={previewFile.name}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: '#10b981',
                      color: '#fff',
                      padding: '8px 20px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 700,
                      textDecoration: 'none',
                      display: 'inline-block'
                    }}
                  >
                    파일 직접 다운로드
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
