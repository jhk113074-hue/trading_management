// 1. 이메일에 보낼 데이터 준비
const piNumber = {{ query_get_pi.data[0].pi_number }};
const toEmail = {{ query_get_customer.data[0].email }};
const pdfAttachmentUrl = {{ generatePdfQuery.data.url }}; // 서버에서 생성된 PDF의 링크

// 2. 이메일 발송 액션 (또는 SendGrid, Mailchimp 등 외부 API 연동)
const emailResult = await {{ query_send_email.trigger({
  additionalScope: {
    to: toEmail,
    cc: 'sales@ysacc.co.kr, finance@ysacc.co.kr',
    subject: `Proforma Invoice ${piNumber} from YSACC`,
    htmlMessage: `
      <p>Dear ${ {{ query_get_customer.data[0].contact_person }} },</p>
      <p>Please find attached the Proforma Invoice <b>${piNumber}</b> for your review.</p>
      <p>You can download the PDF document directly using this link: <a href="${pdfAttachmentUrl}">Download PI</a></p>
      <p>If you have any questions, please feel free to contact us.</p>
      <br>
      <p>Best regards,</p>
      <p>YSACC Sales Team</p>
    `
  }
}) }};

if (emailResult.status === 'success') {
  {{ utils.showNotification({ title: '발송 완료', description: '고객에게 PI가 성공적으로 이메일 발송되었습니다.', type: 'success' }) }};
}
