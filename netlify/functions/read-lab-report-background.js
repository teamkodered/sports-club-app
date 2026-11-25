// Netlify BACKGROUND function (up to 15 min): read a testing report (PDF or photo) and store its results as data
// in lab_imports.result, for the coach to check before saving. The app polls the lab_imports row.
// POST { import_id, data: <base64>, media_type: 'application/pdf' | 'image/jpeg' | 'image/png' }
// Needs ANTHROPIC_API_KEY in Netlify's environment variables (optional ANTHROPIC_REPORT_MODEL).
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
  const json = (code, body) => ({ statusCode: code, body: JSON.stringify(body) })
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return json(500, { error: 'Report reading isn\'t set up yet (no API key).' })
  let data, media_type, import_id
  try { ({ data, media_type, import_id } = JSON.parse(event.body || '{}')) } catch { return json(400, { error: 'Bad request' }) }
  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const save = async patch => { if (!import_id || !sbUrl || !sbKey) return; await fetch(`${sbUrl}/rest/v1/lab_imports?id=eq.${import_id}`, { method: 'PATCH', headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(patch) }) }
  if (!data || data.length > 9_000_000) return json(400, { error: 'No file, or the file is too big (max about 6MB).' })
  const isPdf = media_type === 'application/pdf'
  const prompt = `This is an athlete's sports testing report. Extract EVERY result for THIS athlete as JSON only (no other text), in this shape:
{"athlete":{"name":"","age":null,"weight_kg":null,"height_cm":null,"sport":"","test_date":"YYYY-MM-DD or null","provider":"e.g. DIS"},
 "results":[{"test":"Countermovement Jump (CMJ)","metric":"Jump Height","value":31.3,"unit":"cm","side":null,"benchmarks":{"Performance Academy Average: Male":28.2}}]}
Rules: one entry per metric; for left/right values make separate entries with side "L" or "R"; include asymmetry % as its own metric with unit "%";
benchmarks = the comparison groups' values shown next to the athlete's on the same chart (omit if none); numbers as numbers; use the report's own test and metric names; if the date is only a month use the 1st of that month.`
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_REPORT_MODEL || 'claude-sonnet-5-5',
        max_tokens: 12000,
        messages: [{ role: 'user', content: [
          isPdf ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
                : { type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data } },
          { type: 'text', text: prompt },
        ] }],
      }),
    })
    const out = await r.json()
    if (!r.ok) { await save({ status: 'error', error: out?.error?.message || 'The reader had a problem -- try again.' }); return json(502, {}) }
    const text = (out.content || []).map(c => c.text || '').join('').replace(/```json|```/g, '').trim()
    const start = text.indexOf('{'), end = text.lastIndexOf('}')
    const parsed = JSON.parse(text.slice(start, end + 1))
    await save({ status: 'done', result: { athlete: parsed.athlete || {}, results: Array.isArray(parsed.results) ? parsed.results : [] } })
    return json(200, {})
  } catch (e) {
    await save({ status: 'error', error: 'Could not read the report: ' + (e.message || e) })
    return json(500, {})
  }
}
