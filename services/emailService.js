// ✅ /server/services/emailService.js
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendResetEmail(to, resetLink) {

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


  try {
    const data = await resend.emails.send(emailPayload)

    if (!data?.id && !data?.messageId) {
      // Email may not have been fully accepted by Resend
    }

    return data
  } catch (error) {
    console.error('Email send failed:', error.message)
    throw new Error('Could not send email')
  }
}
