import React, { useState } from 'react';
import { seedDatabase } from '../utils/seedData';
import { db, auth } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

export const SeedData: React.FC = () => {
  const [status, setStatus] = useState('');

  const handleSeed = async () => {
    setStatus('Seeding...');
    try {
      await seedDatabase();
      setStatus('Seed complete! You can now navigate to Dashboard.');
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
  };

  const handlePromote = async () => {
    const user = auth.currentUser;
    if (!user) {
      setStatus('먼저 로그인을 해주세요. (로그인 후 다시 이 페이지로 오세요)');
      return;
    }
    setStatus('권한 변경 중...');
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        role: '대표이사',
        roleCode: 'ADMIN'
      });
      setStatus('성공! 이제 관리자 권한(ADMIN)이 부여되었습니다. 새로고침 후 하단 메뉴를 확인하세요.');
    } catch (err: any) {
      setStatus(`에러 발생: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: 40, maxWidth: '600px', fontFamily: 'sans-serif' }}>
      <h2 style={{ marginBottom: '20px' }}>시스템 초기화 및 권한 설정</h2>
      
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h3>1. 데이터 초기화</h3>
        <button onClick={handleSeed} style={{ padding: '10px 20px', cursor: 'pointer' }}>초기 샘플 데이터 생성</button>
      </div>

      <div style={{ padding: '15px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h3>2. 내 계정을 관리자로 승격</h3>
        <p>현재 로그인된 계정을 최고 관리자로 만듭니다.</p>
        <button onClick={handlePromote} style={{ padding: '10px 20px', cursor: 'pointer', backgroundColor: '#4CAF50', color: 'white', border: 'none' }}>나를 관리자로 만들기</button>
      </div>

      {status && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e7f3ff', borderRadius: '8px' }}>
          {status}
        </div>
      )}
      
      <div style={{ marginTop: '20px' }}>
        <a href="/">홈으로 돌아가기</a>
      </div>
    </div>
  );
};
