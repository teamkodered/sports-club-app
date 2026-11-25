// Every hour: keep the media library index up to date with Dropbox (new / moved / deleted files
// in the included folders). Read-only. Does nothing until Dropbox is connected.
const { runSync, getAuth } = require('./dropbox-api.js')
exports.handler = async () => {
  try {
    if (!(await getAuth())?.refresh_token) return { statusCode: 200, body: 'not connected' }
    const r = await runSync(22000)
    console.log('dropbox-sync', JSON.stringify(r))
    return { statusCode: 200, body: JSON.stringify(r) }
  } catch (e) { console.error('dropbox-sync:', e.message); return { statusCode: 500, body: e.message } }
}
