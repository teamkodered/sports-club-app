import { createClient } from '@supabase/supabase-js'
import { isWriteAllowed, currentViewOnlyPage } from './access.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars not set. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.')
}

const client = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)

// View-only access: on a page the user may only view, table writes are refused
// here (with a clear message) instead of being sent. Reads and RPCs are untouched.
const WRITE_METHODS = ['insert', 'update', 'upsert', 'delete']
const origFrom = client.from.bind(client)
client.from = (table) => {
  const qb = origFrom(table)
  for (const m of WRITE_METHODS) {
    const orig = qb[m]?.bind(qb)
    if (!orig) continue
    qb[m] = (payload, ...rest) => {
      if (!isWriteAllowed(table, m === 'delete' ? null : payload)) {
        const err = { message: `View-only access: you can't make changes on this page (${currentViewOnlyPage()}).`, code: 'VIEW_ONLY' }
        const blocked = Promise.resolve({ data: null, error: err })
        // keep the chainable API (.eq, .select, .single ...) so callers don't crash
        const chain = new Proxy(blocked, {
          get(target, prop) {
            if (prop === 'then' || prop === 'catch' || prop === 'finally') return target[prop].bind(target)
            return () => chain
          },
        })
        return chain
      }
      return orig(payload, ...rest)
    }
  }
  return qb
}

export const supabase = client
