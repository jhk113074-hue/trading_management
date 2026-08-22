/**
 * YSACC Trade Management System - Direct Email Service
 * Handles server-side direct email delivery via SendGrid REST API or Backend API endpoint.
 */

export interface SendEmailParams {
  to: string;
  cc?: string | string[];
  subject: string;
  text: string;
  html?: string;
  pdfUrl?: string;
}

export interface SendEmailResult {
  success: boolean;
  message: string;
  method: 'backend_api' | 'sendgrid_direct' | 'mailto_fallback';
}

/**
 * Sends PO email directly from server without opening local mail client if possible.
 */
export const sendPoEmailDirectly = async (params: SendEmailParams): Promise<SendEmailResult> => {
  const { to, cc, subject, text, html, pdfUrl } = params;
  
  const ccArray = Array.isArray(cc) 
    ? cc.filter(Boolean) 
    : (cc ? cc.split(',').map(s => s.trim()).filter(Boolean) : []);

  const brevoApiKey = import.meta.env.VITE_BREVO_API_KEY || localStorage.getItem('BREVO_API_KEY');
  const sendgridApiKey = import.meta.env.VITE_SENDGRID_API_KEY || localStorage.getItem('SENDGRID_API_KEY');
  const backendUrl = import.meta.env.VITE_API_URL || 'https://ysacc-backend.onrender.com';

  // 1. Try Brevo Direct REST API (Fastest & 300 free emails/day)
  if (brevoApiKey) {
    try {
      const brevoPayload = {
        sender: { name: 'jhkim1130@ysacc.co.kr', email: 'jhkim1130@ysacc.co.kr' },
        to: [{ email: to }],
        ...(ccArray.length > 0 ? { cc: ccArray.map(email => ({ email })) } : {}),
        subject: subject,
        textContent: text,
        htmlContent: html || `<div style="font-family: sans-serif; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${text.replace(/\n/g, '<br/>')}</div>`
      };

      const bRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'accept': 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify(brevoPayload)
      });

      if (bRes.status >= 200 && bRes.status < 300) {
        return {
          success: true,
          message: 'Brevo 이메일 API를 통해 발주서가 수신자 및 참조자에게 즉시 전송되었습니다.',
          method: 'backend_api'
        };
      }
    } catch (err) {
      console.warn('Brevo direct API call failed:', err);
    }
  }

  // 2. Try Backend Express API endpoint
  try {
    const response = await fetch(`${backendUrl}/api/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        cc: ccArray,
        subject,
        text,
        html: html || text.replace(/\n/g, '<br/>'),
        pdfUrl
      })
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.message || '서버를 통해 이메일이 즉시 발송되었습니다.',
        method: 'backend_api'
      };
    }
  } catch (err) {
    console.warn('Backend email API send failed or unreachable:', err);
  }

  // 2. Try SendGrid Direct REST API if API Key is available
  if (sendgridApiKey) {
    try {
      const sgPayload = {
        personalizations: [
          {
            to: [{ email: to }],
            ...(ccArray.length > 0 ? { cc: ccArray.map(email => ({ email })) } : {})
          }
        ],
        from: { email: 'admin@ysacc.co.kr', name: 'YSACC 무역관리' },
        subject: subject,
        content: [
          {
            type: 'text/plain',
            value: text
          },
          {
            type: 'text/html',
            value: html || `<div style="font-family: sans-serif; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${text.replace(/\n/g, '<br/>')}</div>`
          }
        ]
      };

      const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sgPayload)
      });

      if (sgRes.status >= 200 && sgRes.status < 300) {
        return {
          success: true,
          message: 'SendGrid API를 통해 이메일이 직접 발송되었습니다.',
          method: 'sendgrid_direct'
        };
      }
    } catch (err) {
      console.warn('SendGrid direct API call failed:', err);
    }
  }

  return {
    success: false,
    message: '서버 이메일 전송 API 연결을 확인해 주세요.',
    method: 'backend_api'
  };
};
