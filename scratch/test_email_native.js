async function testEmail() {
  console.log('--- Testing Backend Health & Email Sending ---');
  
  // 1. Health check
  try {
    const healthRes = await fetch('https://ysacc-backend.onrender.com/api/health');
    console.log('Health check status:', healthRes.status);
    const healthData = await healthRes.json();
    console.log('Health data:', healthData);
  } catch (err) {
    console.log('Health check error:', err.message);
  }

  // 2. Test email send endpoint
  try {
    const emailRes = await fetch('https://ysacc-backend.onrender.com/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'jhkim1130@ysacc.co.kr',
        cc: ['alexpark@ysacc.co.kr', 'jhk010624@ysacc.co.kr'],
        subject: '[테스트] YSACC 서버 발주서 직발송 테스트',
        text: '이 메일은 서버 직발송 연동 테스트 메일입니다.'
      })
    });
    console.log('\nEmail Send API HTTP Status:', emailRes.status);
    const emailData = await emailRes.json();
    console.log('Email Send Response:', JSON.stringify(emailData, null, 2));
  } catch (err) {
    console.log('Email send test error:', err.message);
  }
}

testEmail();
