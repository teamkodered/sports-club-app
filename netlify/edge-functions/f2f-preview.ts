// Link previews (WhatsApp, iMessage, Facebook…) read the page's <meta> tags without running the
// app, so every link shows the site-wide KR Centre card. Athlete-app invite links carry ?app=f2f --
// for those, swap the preview to the Fit II Fight name + logo. Everything else is left as it is.
import type { Context } from 'https://edge.netlify.com'

export default async (request: Request, context: Context) => {
  const url = new URL(request.url)
  const res = await context.next()
  if (url.searchParams.get('app') !== 'f2f') return res
  const type = res.headers.get('content-type') || ''
  if (!type.includes('text/html')) return res
  let html = await res.text()
  const swap = (prop: string, value: string) => {
    html = html.replace(new RegExp(`(<meta\\s+(?:property|name)="${prop}"\\s+content=")[^"]*(")`), `$1${value}$2`)
  }
  swap('og:title', 'Fit II Fight')
  swap('og:description', 'Your Fit II Fight athlete app -- tap to set up your login')
  swap('og:image', 'https://klasschamp.netlify.app/og-f2f.png')
  swap('og:url', url.toString())
  swap('twitter:image', 'https://klasschamp.netlify.app/og-f2f.png')
  html = html.replace(/<title>[^<]*<\/title>/, '<title>Fit II Fight</title>')
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  return new Response(html, { status: res.status, headers })
}
