/*
 * Outgoing email through Resend (https://resend.com). Set RESEND_API_KEY and EMAIL_FROM.
 * Without them, local servers print the email to the console instead of sending it.
 */
import type { IncomingMessage } from 'node:http'
import { HttpError } from './http.ts'

const isLocal = !process.env.VERCEL

export const mailConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM

/** Throws before any work is done if this server can't deliver email at all. */
export function requireMail() {
  if (!mailConfigured() && !isLocal) throw new HttpError(503, 'Password reset isn’t set up yet. Try again later.')
}

export async function sendMail(to: string, subject: string, text: string, html: string) {
  if (!mailConfigured()) {
    console.log(`[mail] Email isn't set up, so here it is instead.\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
  })
  if (!res.ok) throw new Error(`Resend returned ${res.status}: ${(await res.text()).slice(0, 300)}`)
}

/**
 * The address links in emails point to. Deployed servers never trust the request's
 * Origin header for this, or anyone could get reset links sent pointing at their own site.
 */
export function appUrl(req: IncomingMessage) {
  const configured = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  if (configured) return configured.replace(/\/+$/, '')
  if (isLocal) return (typeof req.headers.origin === 'string' && req.headers.origin) || 'http://localhost:5173'
  throw new HttpError(503, 'Password reset isn’t set up yet. Try again later.')
}
