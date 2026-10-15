import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

const KEY = 'hostelhub-theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')
function stored() { try { return localStorage.getItem(KEY) } catch { return null } }
export function currentTheme() { return document.documentElement.dataset.theme || (media().matches ? 'dark' : 'light') }

// Calls back whenever the effective theme changes, from the toggle or the operating system.
export function onThemeChange(callback) {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const query = media()
  query.addEventListener('change', callback)
  return () => { observer.disconnect(); query.removeEventListener('change', callback) }
}
export function useTheme() {
  const [theme, setTheme] = useState(currentTheme)
  useEffect(() => onThemeChange(() => setTheme(currentTheme())), [])
  return theme
}
// Reads a set of CSS custom properties and re-reads them when the theme changes.
export function useCssVars(names) {
  const theme = useTheme()
  const [values, setValues] = useState(() => readVars(names))
  useEffect(() => { setValues(readVars(names)) }, [theme]) // eslint-disable-line react-hooks/exhaustive-deps
  return values
}
export function readVars(names) {
  const style = getComputedStyle(document.documentElement)
  return Object.fromEntries(Object.entries(names).map(([key, name]) => [key, style.getPropertyValue(name).trim()]))
}

export function ThemeToggle({ className = '' }) {
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  function toggle() {
    document.documentElement.dataset.theme = next
    try { localStorage.setItem(KEY, next) } catch { /* private mode: the choice lasts for this page only */ }
  }
  useEffect(() => { const saved = stored(); if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved }, [])
  return <button type="button" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} className={`grid h-11 w-11 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:text-ink ${className}`}>{theme === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}</button>
}
