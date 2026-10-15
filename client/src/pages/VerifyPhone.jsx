import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Button, ErrorNotice, Field, Notice, Page } from '../components/ui'

export default function VerifyPhone() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [phone, setPhone] = useState(user.phone || '')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [channel, setChannel] = useState('')
  const [wait, setWait] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!wait) return
    const timer = setTimeout(() => setWait(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])
  async function send(event) {
    event?.preventDefault(); setBusy(true); setError('')
    try { const { data } = await api('/auth/phone/send', { method: 'POST', body: { phone } }); setSentTo(data.phone); setChannel(data.channel); setWait(data.resendAfterSeconds); setCode('') }
    catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  async function verify(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { const { data } = await api('/auth/phone/verify', { method: 'POST', body: { code } }); setUser(data); navigate('/dashboard', { replace: true }) }
    catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  if (user.phoneVerified && !sentTo) return <Page eyebrow="Account security" title="Mobile number verified." description={`Your number ${user.phone} is verified.`} />
  return <Page eyebrow="Account security" title="Verify your mobile number." description="We send a one-time code to your number on WhatsApp. Owners must verify their number before a listing can be submitted for review.">
    <div className="panel max-w-xl">
      {!sentTo ? <form onSubmit={send} className="grid gap-4"><Field label="Mobile number"><input className="input" type="tel" inputMode="tel" autoComplete="tel" required maxLength={30} placeholder="0300 1234567" value={phone} onChange={event => setPhone(event.target.value)} /></Field><Button disabled={busy}>{busy ? 'Sending…' : 'Send code'}</Button></form>
        : <form onSubmit={verify} className="grid gap-4"><Notice>We sent a code to {sentTo} {channel === 'whatsapp' ? 'on WhatsApp' : 'by SMS'}.</Notice><Field label="6-digit code"><input className="input font-mono tracking-[.3em]" inputMode="numeric" autoComplete="one-time-code" required pattern="\d{4,10}" maxLength={10} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} autoFocus /></Field>
          <Button disabled={busy}>{busy ? 'Checking…' : 'Verify'}</Button>
          <div className="flex flex-wrap gap-4 text-sm"><button type="button" className="text-accent-ink disabled:text-faint" disabled={busy || wait > 0} onClick={() => send()}>{wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}</button><button type="button" className="text-muted" onClick={() => { setSentTo(''); setError('') }}>Use a different number</button></div></form>}
      <ErrorNotice>{error}</ErrorNotice>
    </div>
  </Page>
}
