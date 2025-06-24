// ✅ /server/services/emailService.js
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendResetEmail(to, resetLink) {
  console.log('📤 [sendResetEmail] Initiated')
  console.log('📧 To:', to)
  console.log('🔗 Reset Link:', resetLink)

  const emailPayload = {
    from: process.env.RESET_EMAIL_FROM, // ✅ Pulled from .env
    to,
    subject: 'Reset Your Password',
    html: `
      <p>You requested a password reset.</p>
      <p><a href="${resetLink}">Click here to reset your password</a></p>
      <p>This link expires in 15 minutes.</p>
    `,
  }

  console.log('📦 Email Payload:', emailPayload)
  console.time('⏱️ Email send time')

  try {
    const data = await resend.emails.send(emailPayload)

    console.timeEnd('⏱️ Email send time')
    console.log('✅ [sendResetEmail] Email sent successfully')
    console.log('📬 Resend Response Data:', data)

    if (!data?.id && !data?.messageId) {
      console.warn('⚠️ Email may not have been fully accepted by Resend')
    }

    return data
  } catch (error) {
    console.timeEnd('⏱️ Email send time')
    console.error('❌ [sendResetEmail] Email send failed')

    if (error?.response) {
      console.error('🧾 Resend Error Response:', error.response.data)
      console.error('🔢 Status:', error.response.status)
      console.error('📨 Headers:', error.response.headers)
    } else if (error?.request) {
      console.error('📭 No response received from Resend:', error.request)
    } else {
      console.error('⚠️ Error setting up the request:', error.message)
    }

    console.error('🪵 Full Error Object:', error)
    throw new Error('Could not send email')
  }
}
