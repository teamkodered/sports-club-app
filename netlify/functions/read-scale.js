// Netlify function: read the weight off a photo of the gym scales' display (AI image reader).
// POST { image: <base64 jpeg> }  ->  { kg: 72.4 } or { kg: null }
// Needs ANTHROPIC_API_KEY in Netlify's environment variables (optional ANTHROPIC_MODEL).
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
  const json = (code, body) => ({ statusCode: code, body: JSON.stringify(body) })
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return json(500, { error: 'Scanning isn\'t set up yet (no API key) -- type the weight for now.' })
  let image
  try { image = JSON.parse(event.body || '{}').image } catch { return json(400, { error: 'Bad request' }) }
  if (!image || image.length > 6_000_000) return json(400, { error: 'No photo, or the photo is too big.' })
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        max_tokens: 20,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: 'This is a photo of a weighing scale display. Reply with ONLY the weight shown, as a number in kilograms (e.g. 72.4). If it shows pounds or stone, convert to kilograms. If you cannot clearly read a weight, reply NONE.' },
        ] }],
      }),
    })
    const out = await r.json()
    if (!r.ok) return json(502, { error: out?.error?.message || 'The scanner had a problem -- try again or type it.' })
    const text = (out.content || []).map(c => c.text || '').join(' ').trim()
    const m = text.match(/\d+(?:[.,]\d+)?/)
    const kg = m ? parseFloat(m[0].replace(',', '.')) : null
    return json(200, { kg: kg && kg > 15 && kg < 250 ? Math.round(kg * 10) / 10 : null })
  } catch (e) {
    return json(500, { error: 'Could not read the photo: ' + (e.message || e) })
  }
}
