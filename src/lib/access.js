// Per-person access. Each team member has a ROLE (member / leader / captain / admin)
// that gives sensible defaults, plus optional overrides saved on members.access
// (set in Settings -> Team):
//   access = {
//     pages:     { registers: 'edit', athletes: 'view', ... }   // 'none' | 'view' | 'edit'
//     registers: { types: ['kr', 'krba'] | null, classes: ['<class id>', ...] | null }  // null = all
//   }

export const PAGES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'registers', label: 'Registers' },
  { key: 'athletes',  label: 'Athlete profiles' },
  { key: 'students',  label: 'Students' },
  { key: 'league',    label: 'Houses' },
  { key: 'forms',     label: 'Forms' },
  { key: 'classes',   label: 'Classes' },
  { key: 'calendar',  label: 'Calendar' },
  { key: 'crm',       label: 'CRM' },
  { key: 'fixtures',  label: 'Fixtures' },
  { key: 'media',     label: 'Media' },
  { key: 'cctv',      label: 'CCTV' },
]

export const REGISTER_TYPE_OPTIONS = [
  { key: 'class', label: 'Class registers' }, { key: 'kr', label: 'KR (athletes)' }, { key: 'krba', label: 'KRBA (athletes)' },
  { key: 'pts', label: 'PTs' }, { key: 'leader', label: 'Leaders' }, { key: 'adhoc', label: 'Adhoc' },
]

export const ROLE_OPTIONS = [
  { key: 'member',  label: 'Member',  hint: 'Student access only' },
  { key: 'leader',  label: 'Leader',  hint: 'Registers only' },
  { key: 'captain', label: 'Coach',   hint: 'Everything except admin settings' },
  { key: 'admin',   label: 'Admin',   hint: 'Full access' },
]

export function roleDefault(role, page) {
  if (role === 'admin') return 'edit'
  if (role === 'captain' || role === 'coach') return 'edit'
  if (role === 'leader') return page === 'registers' ? 'edit' : 'none'
  return 'none'
}

export function pageAccessFor(profile, page) {
  const role = profile?.role || 'member'
  if (role === 'admin') return 'edit'
  const o = profile?.access?.pages?.[page]
  return o === 'none' || o === 'view' || o === 'edit' ? o : roleDefault(role, page)
}

export function registerAccessFor(profile) {
  const role = profile?.role || 'member'
  const r = role === 'admin' ? null : profile?.access?.registers
  return { types: r?.types?.length ? r.types : null, classes: r?.classes?.length ? r.classes : null }
}

// ---- View-only guard ----
// While a view-only page is open, block database writes from the app (the page
// still reads normally). Register actions (attendance, points) stay allowed, so
// someone with view-only athlete profiles can still take the athlete registers.
let viewOnlyPage = null
export function setViewOnlyPage(page) { viewOnlyPage = page }
export function currentViewOnlyPage() { return viewOnlyPage }

const ALWAYS_WRITABLE = new Set(['attendance', 'points_log', 'student_class_assignments'])
const STUDENT_FIELDS_WRITABLE = new Set(['class_champion_count'])

export function isWriteAllowed(table, payload) {
  if (!viewOnlyPage) return true
  if (ALWAYS_WRITABLE.has(table)) return true
  if (table === 'students' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return Object.keys(payload).every(k => STUDENT_FIELDS_WRITABLE.has(k))
  }
  return false
}
