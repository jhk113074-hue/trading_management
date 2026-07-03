import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  startDate: string;
  endDate: string;
  leaveType: 'FULL' | 'AM_HALF' | 'PM_HALF';
  totalDays: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  approvedBy?: string;
  rejectReason?: string;
}

export const LeaveManagement: React.FC = () => {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [leaveType, setLeaveType] = useState<'FULL' | 'AM_HALF' | 'PM_HALF'>('FULL');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Admin reject modal
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchLeaveData = async () => {
    setLoading(true);
    try {
      // 1. Fetch all users
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersList: any[] = [];
      usersSnap.forEach(d => {
        usersList.push({ id: d.id, ...d.data() });
      });
      setUsers(usersList);

      // 2. Fetch leave requests
      const reqsSnap = await getDocs(collection(db, 'leave_requests'));
      const reqsList: LeaveRequest[] = [];
      reqsSnap.forEach(d => {
        reqsList.push({ id: d.id, ...d.data() } as LeaveRequest);
      });
      
      // Sort by createdAt desc
      reqsList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setRequests(reqsList);

      if (userProfile) {
        setMyRequests(reqsList.filter(r => r.userId === userProfile.id));
      }
    } catch (e) {
      console.error("Failed to load leave data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaveData();
  }, [userProfile]);

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>데이터를 불러오는 중...</div>;
  }

  // Calculate annual leave accruals based on Korean Labor Standards Act (근로기준법 제60조)
  const calculateLeave = (joinDateStr: string | undefined, userId: string) => {
    if (!joinDateStr) return { total: 0, used: 0, remaining: 0, tenureMonths: 0, tenureYears: 0 };
    
    const joinDate = new Date(joinDateStr);
    const today = new Date();
    
    // Calculate difference in months
    let tenureMonths = (today.getFullYear() - joinDate.getFullYear()) * 12 + (today.getMonth() - joinDate.getMonth());
    if (today.getDate() < joinDate.getDate()) {
      tenureMonths -= 1;
    }
    if (tenureMonths < 0) tenureMonths = 0;

    const tenureYears = Math.floor(tenureMonths / 12);
    
    let totalAccrued = 0;

    if (tenureYears < 1) {
      // Rule 1: Under 1 year of service -> 1 day per month of continuous service (max 11)
      totalAccrued = tenureMonths;
    } else {
      // Rule 2: 1 year or more of service -> 15 days base + 1 day per every 2 continuous years (max 25)
      const additionalDays = Math.floor((tenureYears - 1) / 2);
      totalAccrued = Math.min(25, 15 + additionalDays);
    }

    // Calculate used leave (approved leave requests)
    const approvedRequests = requests.filter(r => r.userId === userId && r.status === 'APPROVED');
    const used = approvedRequests.reduce((sum, r) => sum + r.totalDays, 0);
    const remaining = totalAccrued - used;

    return {
      total: totalAccrued,
      used,
      remaining,
      tenureMonths,
      tenureYears
    };
  };

  // Helper to calculate total request days
  const calculateRequestedDays = () => {
    if (leaveType === 'AM_HALF' || leaveType === 'PM_HALF') return 0.5;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    if (end < start) return 0;
    
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    const totalDays = calculateRequestedDays();
    if (totalDays <= 0) {
      alert("올바르지 않은 기간 설정입니다.");
      return;
    }

    const myAccrual = calculateLeave(userProfile.joinDate || userProfile.createdAt?.split('T')[0], userProfile.id);
    if (totalDays > myAccrual.remaining) {
      if (!window.confirm(`잔여 연차(${myAccrual.remaining}일)보다 신청 연차(${totalDays}일)가 많습니다. 계속 신청하시겠습니까?`)) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'leave_requests'), {
        userId: userProfile.id,
        userName: userProfile.name,
        startDate,
        endDate: leaveType === 'FULL' ? endDate : startDate,
        leaveType,
        totalDays,
        reason,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      });

      setReason('');
      fetchLeaveData();
      alert("휴가 신청서가 정상적으로 제출되었습니다.");
    } catch (err) {
      console.error(err);
      alert("휴가 신청에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (reqId: string) => {
    if (!userProfile || userProfile.role !== '관리자') return;
    if (!window.confirm("이 휴가 신청을 승인하시겠습니까?")) return;

    try {
      await updateDoc(doc(db, 'leave_requests', reqId), {
        status: 'APPROVED',
        approvedBy: userProfile.name
      });
      fetchLeaveData();
    } catch (e) {
      console.error(e);
      alert("처리에 실패했습니다.");
    }
  };

  const handleReject = async () => {
    if (!showRejectModal || !userProfile || userProfile.role !== '관리자') return;
    try {
      await updateDoc(doc(db, 'leave_requests', showRejectModal), {
        status: 'REJECTED',
        rejectReason,
        approvedBy: userProfile.name
      });
      setShowRejectModal(null);
      setRejectReason('');
      fetchLeaveData();
    } catch (e) {
      console.error(e);
      alert("반려 처리에 실패했습니다.");
    }
  };

  const myJoinDate = userProfile?.joinDate || userProfile?.createdAt?.split('T')[0] || '';
  const myAccruals = calculateLeave(myJoinDate, userProfile?.id || '');

  return (
    <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 850, color: 'var(--primary-color)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📅 연월차 관리</span>
            <span style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>근로기준법 제60조 기준</span>
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>대한민국 근로기준법에 의거한 직원 유급휴가 자동 산정 및 신청 결재 시스템입니다.</p>
        </div>
      </div>

      {/* 2-Column Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', alignItems: 'stretch' }}>
        
        {/* Left Column: Accrual Card & Application Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Accrual Card */}
            <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>{userProfile?.name} 님의 휴가 정보</div>
              <div style={{ fontSize: '0.72rem', color: '#38bdf8', marginTop: '2px', fontWeight: 600 }}>
                입사일: {myJoinDate} ({myAccruals.tenureYears > 0 ? `${myAccruals.tenureYears}년 ` : ''}{myAccruals.tenureMonths % 12}개월 근무)
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '18px', textAlign: 'center' }}>
                <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>총 발생</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', marginTop: '4px' }}>{myAccruals.total}<span style={{ fontSize: '12px' }}>일</span></div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>사용 연차</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f43f5e', marginTop: '4px' }}>{myAccruals.used}<span style={{ fontSize: '12px' }}>일</span></div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>잔여 연차</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>{myAccruals.remaining}<span style={{ fontSize: '12px' }}>일</span></div>
                </div>
              </div>
            </div>

            {/* Leave Request Form */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 14px 0', color: '#1e293b' }}>✈ 휴가 신청서 작성</h3>
              <form onSubmit={handleRequestSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>휴가 구분</label>
                  <select
                    value={leaveType}
                    onChange={e => setLeaveType(e.target.value as any)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', backgroundColor: 'white' }}
                  >
                    <option value="FULL">종일 휴가 (1.0일)</option>
                    <option value="AM_HALF">오전 반차 (0.5일 - 09:00~13:00)</option>
                    <option value="PM_HALF">오후 반차 (0.5일 - 14:00~18:00)</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: leaveType === 'FULL' ? '1fr 1fr' : '1fr', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{leaveType === 'FULL' ? '시작일' : '휴가 희망일'}</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                    />
                  </div>
                  {leaveType === 'FULL' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>종료일</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                      />
                    </div>
                  )}
                </div>

                <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#475569', fontWeight: 700 }}>총 차감일수:</span>
                  <strong style={{ color: '#3b82f6', fontSize: '14px' }}>{calculateRequestedDays()} 일</strong>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>사유 및 비고</label>
                  <input
                    type="text"
                    required
                    placeholder="예: 개인 사정, 병가, 건강검진 등"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '10px 0', fontWeight: 800, marginTop: '4px' }}
                >
                  {isSubmitting ? '신청 중...' : '휴가 신청 제출'}
                </button>
              </form>
            </div>
          </div>

        {/* Right Column: User Leave History or Admin Management Dashboard */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Admin Management Dashboard */}
          {userProfile?.role === '관리자' && (
            <>
              {/* Employee Summary list */}
              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 14px 0', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>👥 전 직원 연차 대장</span>
                </h3>
                
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left', fontWeight: 'bold' }}>
                        <th style={{ padding: '10px 12px' }}>성명</th>
                        <th style={{ padding: '10px 12px' }}>부서 / 직위</th>
                        <th style={{ padding: '10px 12px' }}>입사일</th>
                        <th style={{ padding: '10px 12px' }}>근속년수</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>총 발생연차</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>사용 연차</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>잔여 연차</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.slice().sort((a, b) => {
                        const getRank = (pos: string = '') => {
                          if (pos.includes('대표')) return 1;
                          if (pos.includes('차장')) return 2;
                          if (pos.includes('사원')) return 3;
                          return 99;
                        };
                        return getRank(a.position) - getRank(b.position);
                      }).map(u => {
                        const joinDate = u.joinDate || u.createdAt?.split('T')[0] || '';
                        const accruals = calculateLeave(joinDate, u.id);
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#0f172a' }}>{u.name}</td>
                            <td style={{ padding: '10px 12px', color: '#64748b' }}>{u.department || '-'} / {u.position || '-'}</td>
                            <td style={{ padding: '10px 12px', color: '#64748b' }}>{joinDate}</td>
                            <td style={{ padding: '10px 12px', color: '#0f172a', fontWeight: 600 }}>
                              {accruals.tenureYears > 0 ? `${accruals.tenureYears}년 ` : ''}{accruals.tenureMonths % 12}개월
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold' }}>{accruals.total}일</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>{accruals.used}일</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', color: '#10b981', fontWeight: 900 }}>{accruals.remaining}일</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pending Approvals */}
              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 14px 0', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⏳ 결재 대기 중인 휴가 신청 ({requests.filter(r => r.status === 'PENDING').length}건)</span>
                </h3>
                
                {requests.filter(r => r.status === 'PENDING').length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', border: '1px dashed #cbd5e1', borderRadius: '8px', fontSize: '12.5px' }}>
                    결재 대기 중인 휴가 신청서가 없습니다.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {requests.filter(r => r.status === 'PENDING').map(r => (
                      <div key={r.id} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '13.5px', color: '#1e293b' }}>{r.userName}</strong>
                            <span style={{ fontSize: '10.5px', background: '#eff6ff', color: '#2563eb', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                              {r.leaveType === 'FULL' ? '종일' : r.leaveType === 'AM_HALF' ? '오전반차' : '오후반차'} ({r.totalDays}일)
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                            기간: 📅 {r.startDate} ~ {r.endDate}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                            사유: "{r.reason}"
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => handleApprove(r.id)}
                            style={{ padding: '6px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            승인
                          </button>
                          <button
                            onClick={() => setShowRejectModal(r.id)}
                            style={{ padding: '6px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            반려
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* User Request History */}
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', flex: 1 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 14px 0', color: '#1e293b' }}>
              {userProfile?.role === '관리자' ? '📋 전사 휴가 신청/결재 내역' : '📋 나의 휴가 신청 내역'}
            </h3>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left', fontWeight: 'bold' }}>
                    {userProfile?.role === '관리자' && <th style={{ padding: '10px 12px' }}>신청자</th>}
                    <th style={{ padding: '10px 12px' }}>구분</th>
                    <th style={{ padding: '10px 12px' }}>기간</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>사용 일수</th>
                    <th style={{ padding: '10px 12px' }}>사유</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>결재 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {(userProfile?.role === '관리자' ? requests : myRequests).length === 0 ? (
                    <tr>
                      <td colSpan={userProfile?.role === '관리자' ? 6 : 5} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                        신청 내역이 존재하지 않습니다.
                      </td>
                    </tr>
                  ) : (userProfile?.role === '관리자' ? requests : myRequests).map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {userProfile?.role === '관리자' && <td style={{ padding: '10px 12px', fontWeight: 700 }}>{r.userName}</td>}
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: '10.5px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          {r.leaveType === 'FULL' ? '종일' : r.leaveType === 'AM_HALF' ? '오전반차' : '오후반차'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>{r.startDate} ~ {r.endDate}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold' }}>{r.totalDays} 일</td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>
                        {r.reason}
                        {r.rejectReason && (
                          <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '2px', fontWeight: 'bold' }}>
                            ↳ 반려 사유: {r.rejectReason}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '20px',
                          background: r.status === 'APPROVED' ? '#d1fae5' : r.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                          color: r.status === 'APPROVED' ? '#065f46' : r.status === 'REJECTED' ? '#991b1b' : '#92400e'
                        }}>
                          {r.status === 'APPROVED' ? '승인완료' : r.status === 'REJECTED' ? '반려됨' : '결재대기'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>

      {/* Reject Reason input modal */}
      {showRejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '360px', padding: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 12px 0', color: '#1e293b' }}>❌ 휴가 신청 반려 사유</h3>
            <textarea
              rows={3}
              placeholder="반려 사유를 작성하세요 (예: 업무 과다로 인한 일정 조정 필요 등)"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectReason('');
                }}
                style={{ padding: '6px 14px', background: '#e2e8f0', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                취소
              </button>
              <button
                onClick={handleReject}
                style={{ padding: '6px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                반려 완료
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
