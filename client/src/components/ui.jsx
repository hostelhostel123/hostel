import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { api } from '../services/api'

export function useResource(path) {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState({ result: null, error: '', loading: true, path })
  useEffect(() => {
    const controller = new AbortController()
    if (!path) { setState({ result: null, error: '', loading: false, path }); return }
    setState({ result: null, error: '', loading: true, path })
    api(path, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setState({ result, error: '', loading: false, path })
    }).catch(error => { if (!controller.signal.aborted) setState({ result: null, error: error.message, loading: false, path }) })
    return () => controller.abort()
  }, [path, version])
  const current = state.path === path ? state : { result: null, error: '', loading: true }
  return { ...current, reload: () => setVersion(value => value + 1) }
}
export function Page({ eyebrow, title, description, children, action }) {
  return <main className="mx-auto max-w-[1240px] px-5 pb-20 pt-10 lg:px-8 lg:pt-14"><div className="rise mb-10 flex flex-wrap items-end justify-between gap-5"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 className="page-title mt-3">{title}</h1>{description && <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted">{description}</p>}</div>{action}</div>{children}</main>
}
export function ErrorNotice({ children, retry }) { return children ? <div role="alert" className="fade my-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{children}{retry && <button className="ml-3 font-medium underline underline-offset-2" onClick={retry}>Try again</button>}</div> : null }
export function Notice({ children }) { return children ? <p role="status" className="fade my-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{children}</p> : null }
export function Loading() {
  return <div aria-busy="true" aria-live="polite" className="grid gap-4 py-6 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(item => <div key={item} className="h-40 animate-pulse rounded-2xl bg-line/60 motion-reduce:animate-none" />)}<span className="sr-only">Loading…</span></div>
}
export function Empty({ children }) { return <p className="rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center text-sm text-muted">{children}</p> }
export function Button({ secondary = false, className = '', ...props }) { return <button {...props} className={`btn ${secondary ? 'btn-secondary' : 'btn-primary'} ${className}`} /> }
export function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label> }
export function Pagination({ pagination, onChange }) {
  if (!pagination || pagination.total <= pagination.limit) return null
  return <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-4"><Button secondary disabled={pagination.page <= 1} onClick={() => onChange(pagination.page - 1)}>Previous</Button><span className="font-mono text-xs text-muted">Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}</span><Button secondary disabled={pagination.page * pagination.limit >= pagination.total} onClick={() => onChange(pagination.page + 1)}>Next</Button></nav>
}
const tones = { APPROVED: 'bg-accent-soft text-accent-strong', PENDING: 'bg-amber-50 text-amber-900', REJECTED: 'bg-rose-50 text-rose-900', SUSPENDED: 'bg-rose-50 text-rose-900' }
export function Status({ value }) { return <span className={`rounded-full px-3 py-1 font-mono text-[11px] font-medium tracking-wide ${tones[value] || 'bg-ground text-ink-soft'}`}>{value}</span> }
export function Deferred({ title }) { return <Page title={title} eyebrow="Coming later"><Empty>This feature is not available yet.</Empty></Page> }
export function Cover({ hostel, className = 'h-52 w-full' }) {
  const image = hostel.images?.find(item => item.publicId === hostel.coverImage) || hostel.images?.[0]
  return image ? <img src={image.url} alt={hostel.name} loading="lazy" className={`${className} rounded-xl object-cover`} /> : <div className={`${className} grid place-items-center rounded-xl bg-ground text-xs text-faint`}><span className="flex items-center gap-2"><ImageOff size={14} aria-hidden="true" />No photos yet</span></div>
}
