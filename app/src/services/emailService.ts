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

  const sendgridApiKey = import.meta.env.VITE_SENDGRID_API_KEY || localStorage.getItem('SENDGRID_API_KEY');
  const backendUrl = import.meta.env.VITE_API_URL || 'https://ysacc-backend.onrender.com';

  // 1. Try Backend Express API endpoint if reachable
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
    console.warn('Backend email API send failed or unreachable, trying SendGrid direct/fallback:', err);
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

  // 3. Fallback to Mailto client
  const mailtoUrl = `mailto:${to}?cc=${encodeURIComponent(ccArray.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  window.location.href = mailtoUrl;

  return {
    success: true,
    message: '메일 작성 창이 수신자 및 참조(CC)와 함께 열렸습니다.',
    method: 'mailto_fallback'
  };
};
