import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Questions you can manage (Settings -> Questions): rename / hide / reorder the preset ones and add new ones.
// settings.question_config = { custom: { <sec>: [{ key, label }] }, overrides: { <sec>: { <original label>: { label, hidden, order } } } }
// Sections: mentality, tactical, technique, physical, wellbeing.  Original names stay as the hidden key, so history keeps matching.
export const QUESTION_SECTIONS = [['mentality', 'Mentality'], ['tactical', 'Tactical'], ['technique', 'Technical'], ['physical', 'Physical'], ['wellbeing', 'Foundation']]
export const EMPTY_QCONFIG = { custom: {}, overrides: {} }
let cache = null, listeners = []
export async function loadQuestionConfig(force = false) {
  if (cache && !force) return cache
  const { data } = await supabase.from('settings').select('value').eq('key', 'question_config').maybeSingle()
  cache = { ...EMPTY_QCONFIG, ...(data?.value && typeof data.value === 'object' ? data.value : {}) }
  listeners.forEach(f => f(cache))
  return cache
}
export async function saveQuestionConfig(next) {
  const { error } = await supabase.from('settings').upsert({ key: 'question_config', value: next }, { onConflict: 'key' })
  if (!error) { cache = next; listeners.forEach(f => f(cache)) }
  return error
}
export function useQuestionConfig() {
  const [cfg, setCfg] = useState(cache || EMPTY_QCONFIG)
  useEffect(() => { listeners.push(setCfg); loadQuestionConfig().then(setCfg, () => {}); return () => { listeners = listeners.filter(f => f !== setCfg) } }, [])
  return cfg
}
export const qOverride = (cfg, sec, label) => cfg?.overrides?.[sec]?.[label] || null
export const qName = (cfg, sec, label) => qOverride(cfg, sec, label)?.label || label
export const qHidden = (cfg, sec, label) => !!qOverride(cfg, sec, label)?.hidden
export const qCustom = (cfg, sec) => (cfg?.custom?.[sec] || []).filter(q => !q.hidden)
export const slugQ = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'q'
// sort preset questions by their saved order (unordered ones keep their place)
export const qSort = (cfg, sec, labelOf) => (a, b) => (qOverride(cfg, sec, labelOf(a))?.order ?? 999) - (qOverride(cfg, sec, labelOf(b))?.order ?? 999)
