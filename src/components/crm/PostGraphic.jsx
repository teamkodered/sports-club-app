import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BRANDS } from '../../lib/postIdeas.js'

// 🎨 Club-style post graphic: neon on dark, brand logo, headline, names.
// Square (1080×1080) for feed posts, Story (1080×1920). Download or share as PNG.
// Photos: from the device or a coach's moment (only moments with media consent are offered).

const loadImg = src => new Promise(resolve => {
  if (!src) return resolve(null)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null)
  img.src = src
})

function fitText(ctx, text, maxW, startPx, font) {
  let px = startPx
  ctx.font = font(px)
  while (ctx.measureText(text).width > maxW && px > 24) { px -= 4; ctx.font = font(px) }
  return px
}
function wrapLines(ctx, words, maxW) {
  const lines = []; let line = ''
  for (const w of words) {
    const t = line ? line + '  •  ' + w : w
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w } else line = t
  }
  if (line) lines.push(line)
  return lines
}

async function draw(canvas, o) {
  const W = 1080, H = o.size === 'story' ? 1920 : 1080
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  const brand = BRANDS[o.brand] || BRANDS.KR
  const col = brand.colour
  try { await Promise.all([document.fonts.load('italic 800 100px "Saira Condensed"'), document.fonts.load('700 40px "Rajdhani"'), document.fonts.load('700 30px "Orbitron"')]) } catch { /* fallback fonts */ }

  // background
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#07080C'); bg.addColorStop(1, '#151A26')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  const photo = await loadImg(o.photo)
  if (photo) {
    const s = Math.max(W / photo.width, H / photo.height)
    const pw = photo.width * s, ph = photo.height * s
    ctx.drawImage(photo, (W - pw) / 2, (H - ph) / 2, pw, ph)
    const shade = ctx.createLinearGradient(0, 0, 0, H)
    shade.addColorStop(0, 'rgba(5,6,10,0.55)'); shade.addColorStop(0.45, 'rgba(5,6,10,0.25)'); shade.addColorStop(1, 'rgba(5,6,10,0.92)')
    ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H)
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 2
    for (let x = -H; x < W; x += 46) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke() }
  }

  // neon frame
  ctx.save()
  ctx.shadowColor = col; ctx.shadowBlur = 36; ctx.strokeStyle = col; ctx.lineWidth = 8
  ctx.beginPath(); ctx.roundRect(36, 36, W - 72, H - 72, 28); ctx.stroke()
  ctx.restore()

  // logo
  const logo = await loadImg(brand.logo)
  const logoH = o.size === 'story' ? 220 : 170
  if (logo) { const lw = logo.width * (logoH / logo.height); ctx.drawImage(logo, (W - lw) / 2, o.size === 'story' ? 130 : 80, lw, logoH) }

  // text block sits low on a photo, centred otherwise
  const names = (o.names || '').split(/\n|,/).map(s => s.trim()).filter(Boolean)
  const nameFont = px => `700 ${px}px Rajdhani, sans-serif`
  ctx.font = nameFont(48)
  let nameLines = o.showNames ? wrapLines(ctx, names, W - 200) : []
  const maxLines = o.size === 'story' ? 9 : 5
  if (nameLines.length > maxLines) {
    const kept = nameLines.slice(0, maxLines - 1)
    const shown = kept.reduce((n, l) => n + l.split('  •  ').length, 0)
    nameLines = [...kept, `+ ${names.length - shown} more`]
  }
  const headline = (o.headline || '').toUpperCase()
  const hFont = px => `italic 800 ${px}px "Saira Condensed", "Arial Black", sans-serif`
  const hPx = fitText(ctx, headline, W - 160, o.size === 'story' ? 150 : 130, hFont)
  const blockH = hPx + 70 + nameLines.length * 62
  let y = photo ? H - 150 - blockH : (o.size === 'story' ? H / 2 - blockH / 2 + 80 : H / 2 - blockH / 2 + 70)

  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.save(); ctx.font = hFont(hPx); ctx.shadowColor = col; ctx.shadowBlur = 30; ctx.fillStyle = '#FFFFFF'
  ctx.fillText(headline, W / 2, y); ctx.restore()
  y += hPx + 8
  if (o.subline) {
    ctx.font = `600 44px Rajdhani, sans-serif`; ctx.fillStyle = col
    ctx.fillText(o.subline.toUpperCase(), W / 2, y); y += 62
  }
  ctx.font = nameFont(48); ctx.fillStyle = '#FFFFFF'
  nameLines.forEach(l => { ctx.fillText(l, W / 2, y); y += 62 })

  // footer
  ctx.font = '700 28px Orbitron, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText('TEAMKODERED.COM', W / 2, H - 100)
}

export default function PostGraphic({ initial, moments = [], onClose }) {
  const [o, setO] = useState({ size: 'square', brand: 'KR', headline: '', subline: '', names: '', showNames: true, photo: null, ...initial })
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (ref.current) draw(ref.current, o) }, [o])
  const set = (k, v) => setO(p => ({ ...p, [k]: v }))

  function fromDevice(e) {
    const f = e.target.files?.[0]; if (!f) return
    const r = new FileReader(); r.onload = () => set('photo', r.result); r.readAsDataURL(f)
  }
  const fileName = () => `${(o.headline || 'post').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${o.size}.png`
  async function blob() { await draw(ref.current, o); return new Promise(res => ref.current.toBlob(res, 'image/png')) }
  async function download() {
    setBusy(true)
    try {
      const b = await blob()
      const url = URL.createObjectURL(b)
      const a = document.createElement('a'); a.href = url; a.download = fileName(); document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch { alert("Couldn't make the image -- if a photo is in it, try picking it again.") }
    setBusy(false)
  }
  async function share() {
    setBusy(true)
    try {
      const file = new File([await blob()], fileName(), { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] })
      else await download()
    } catch { /* share cancelled */ }
    setBusy(false)
  }

  const lab = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }
  const inp = { fontSize: 15, width: '100%', padding: '8px 10px' }
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', overflowY: 'auto', padding: 12 }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ maxWidth: 980, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800, fontStyle: 'italic', flex: 1 }}>🎨 Post graphic</div>
          <button className="btn btn-sm" onClick={onClose}>✕ Close</button>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', maxWidth: o.size === 'story' ? 300 : 460, margin: '0 auto' }}>
            <canvas ref={ref} style={{ width: '100%', height: 'auto', borderRadius: 10, display: 'block' }} />
          </div>
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['square', 'Square post'], ['story', 'Story']].map(([k, l]) => (
                <button key={k} className={`btn btn-sm${o.size === k ? ' btn-primary' : ''}`} onClick={() => set('size', k)}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(BRANDS).map(([k, b]) => (
                <button key={k} className="btn btn-sm" onClick={() => set('brand', k)}
                  style={{ borderColor: b.colour, color: o.brand === k ? '#000' : b.colour, background: o.brand === k ? b.colour : 'transparent', fontWeight: 700 }}>{b.label}</button>
              ))}
            </div>
            <div><label style={lab}>Headline</label><input style={inp} value={o.headline} onChange={e => set('headline', e.target.value)} /></div>
            <div><label style={lab}>Line underneath</label><input style={inp} value={o.subline} onChange={e => set('subline', e.target.value)} /></div>
            <div>
              <label style={{ ...lab, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={o.showNames} onChange={e => set('showNames', e.target.checked)} /> Names (one per line)
              </label>
              {o.showNames && <textarea rows={4} style={{ ...inp, resize: 'vertical' }} value={o.names} onChange={e => set('names', e.target.value)} />}
            </div>
            <div>
              <label style={lab}>Photo (optional)</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <label className="btn btn-sm" style={{ cursor: 'pointer' }}>📷 From this device<input type="file" accept="image/*" onChange={fromDevice} style={{ display: 'none' }} /></label>
                {o.photo && <button className="btn btn-sm" onClick={() => set('photo', null)}>No photo</button>}
              </div>
              {moments.length > 0 && (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8 }}>
                  {moments.map(m => (
                    <img key={m.id} src={m.url} alt="" onClick={() => set('photo', m.url)}
                      style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: o.photo === m.url ? '2px solid #EC4899' : '2px solid transparent' }} />
                  ))}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>Only use photos where everyone recognisable has media consent. Never CCTV.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn btn-primary" disabled={busy} onClick={download}>⬇ Download PNG</button>
              {navigator.share && <button className="btn" disabled={busy} onClick={share}>Share…</button>}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
