const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function main() {
  const ordersRef = db.collection('companies').doc(COMPANY_ID).collection('orders');
  const docSnap = await ordersRef.doc('YS-2026-UNK-01').get();
  const data = docSnap.data();
  const historyLogs = data.history_logs || data.historyLogs || data.changeHistory || [];

  const matched = [];
  const excludedInTimeframe = [];

  historyLogs.forEach((log, index) => {
    const logTimeStr = log.timestamp || log.date || log.createdAt || '';
    const user = log.user || log.userName || log.userEmail || log.author || '';
    const desc = (log.description || log.content || log.action || log.details || '').trim();

    const isUserMatch = user.includes('jhkim1130@ysacc.co.kr');
    
    // 타임스탬프 파싱 (ISO 문자열 및 Date 객체 처리)
    const dateObj = new Date(logTimeStr);
    const logTime = dateObj.getTime();

    // KST 시간 기준으로 시/분 추출
    const kstDate = new Date(logTime + 9 * 3600 * 1000);
    const datePart = kstDate.toISOString().substring(0, 10); // '2026-07-31'
    const hour = kstDate.getUTCHours();
    const min = kstDate.getUTCMinutes();
    const timeInMinutes = hour * 60 + min;

    // 2026-07-31 KST 18:55 ~ 20:21 사이 (18*60+55 = 1135분, 20*60+21 = 1221분)
    const isStrictTimeWindow = datePart === '2026-07-31' && timeInMinutes >= 1135 && timeInMinutes <= 1221;
    // 2026-07-31 테스트 전체 시간대 (20:30 ~ 22:25 KST 포함)
    const isJuly31TestWindow = datePart === '2026-07-31';

    const lines = desc.split('\n').map(l => l.trim()).filter(Boolean);
    const isOnlyStageChange = lines.length > 0 && lines.every(l => l.startsWith('진행단계 변경'));

    if (isUserMatch && isJuly31TestWindow && isOnlyStageChange) {
      const kstStr = kstDate.toISOString().replace('T', ' ').replace('Z', ' KST');
      matched.push({ index, logTimeStr, kstStr, desc, user, isStrictTimeWindow });
    } else if (isJuly31TestWindow) {
      const kstStr = kstDate.toISOString().replace('T', ' ').replace('Z', ' KST');
      excludedInTimeframe.push({ index, logTimeStr, kstStr, desc, user, reason: !isUserMatch ? '수행자 불일치' : '발주서 발행 등 타 액션' });
    }
  });

  console.log(`=== 1단계: 조건 만족 삭제 대상 목록 (총 ${matched.length}건) ===\n`);
  matched.forEach((m, i) => {
    const cleanDesc = m.desc.replace(/\n/g, ' / ');
    const tag = m.isStrictTimeWindow ? '[정확히 18:55~20:21]' : '[7/31 테스트시간대]';
    console.log(`[${i + 1}] logIndex: ${m.index} | 타임스탬프: ${m.logTimeStr} (${m.kstStr}) ${tag} | 변경 내용: ${cleanDesc} | 수행자: ${m.user}`);
  });

  if (excludedInTimeframe.length > 0) {
    console.log(`\n=== 7/31 일자 내 보존/제외 항목 (총 ${excludedInTimeframe.length}건) ===\n`);
    excludedInTimeframe.forEach((e, i) => {
      const cleanDesc = e.desc.replace(/\n/g, ' / ');
      console.log(`[보존-${i + 1}] logIndex: ${e.index} | 타임스탬프: ${e.logTimeStr} (${e.kstStr}) | 사유: ${e.reason} | 변경 내용: ${cleanDesc} | 수행자: ${e.user}`);
    });
  }

  process.exit(0);
}

main().catch(console.error);
