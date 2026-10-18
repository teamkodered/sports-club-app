import { useEffect, useState } from 'react'

// A short quote for each section (changes every few seconds) + why that section matters.
const Q = {
  mentality: {
    why: 'A calm, focused mind makes better decisions under pressure -- and recovers faster after a tough round.',
    quotes: [
      ['Champions aren\u2019t made in gyms. Champions are made from something they have deep inside them.', 'Muhammad Ali'],
      ['Be water, my friend.', 'Bruce Lee'],
      ['Everybody has a plan until they get punched in the mouth.', 'Mike Tyson'],
      ['The fight is won or lost far away from witnesses.', 'Muhammad Ali'],
      ['Calm mind, sharp eyes, fast hands.', null],
    ],
  },
  tactical: {
    why: 'Knowing when and why to attack wins more rounds than throwing more shots.',
    quotes: [
      ['Smart fighting wins fights.', null],
      ['Victorious warriors win first and then go to war.', 'Sun Tzu'],
      ['Float like a butterfly, sting like a bee.', 'Muhammad Ali'],
      ['In the midst of chaos, there is also opportunity.', 'Sun Tzu'],
      ['Make them miss, make them pay.', null],
    ],
  },
  technical: {
    why: 'Clean technique is faster, safer and harder to read -- and it holds up when you\u2019re tired.',
    quotes: [
      ['I fear not the man who has practised 10,000 kicks once, but the man who has practised one kick 10,000 times.', 'Bruce Lee'],
      ['Practice doesn\u2019t make perfect. Perfect practice makes perfect.', null],
      ['Simplicity is the key to brilliance.', 'Bruce Lee'],
      ['Sharp basics beat fancy moves.', null],
    ],
  },
  physical: {
    why: 'Fitness lets your skills last all the rounds -- strength, speed and engine win the late exchanges.',
    quotes: [
      ['I hated every minute of training, but I said: don\u2019t quit. Suffer now and live the rest of your life as a champion.', 'Muhammad Ali'],
      ['Hard work beats talent when talent doesn\u2019t work hard.', null],
      ['The engine wins the last round.', null],
      ['Train hard, fight easy.', null],
    ],
  },
  foundation: {
    why: 'Sleep, food, water and rest are where the training actually turns into progress.',
    quotes: [
      ['You can\u2019t out-train a bad night\u2019s sleep.', null],
      ['Strong roots, strong fighter.', null],
      ['Recovery is part of the training.', null],
      ['Look after the basics and the basics look after you.', null],
    ],
  },
}

export default function SectionQuote({ section, colour }) {
  const d = Q[section]
  const [i, setI] = useState(() => Math.floor(Math.random() * (d?.quotes.length || 1)))
  useEffect(() => { if (!d) return; const t = setInterval(() => setI(x => (x + 1) % d.quotes.length), 9000); return () => clearInterval(t) }, [d])
  if (!d) return null
  const [text, who] = d.quotes[i % d.quotes.length]
  return (
    <div className="neon-section-quote" style={{ textAlign: 'center', padding: '0 14px', pointerEvents: 'none' }}>
      <div style={{ fontStyle: 'italic', fontSize: 13, lineHeight: 1.4, color: 'var(--text)', transition: 'opacity 0.4s' }}>“{text}”{who && <span style={{ fontStyle: 'normal', fontSize: 11, color: colour || 'var(--text-tertiary)' }}> — {who}</span>}</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{d.why}</div>
    </div>
  )
}
