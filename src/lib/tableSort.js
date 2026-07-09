// Shared sort hook for all tables
import { useState } from 'react'

export function useSort(defaultKey = '', defaultDir = 'asc') {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDir, setSortDir] = useState(defaultDir)

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function sortData(data, getVal) {
    return [...data].sort((a, b) => {
      const aVal = getVal(a, sortKey)
      const bVal = getVal(b, sortKey)
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1
      if (typeof aVal === 'number') return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })
  }

  return { sortKey, sortDir, toggleSort, sortData }
}

export function SortTh({ children, col, sortKey, sortDir, onSort, style = {} }) {
  const active = sortKey === col
  return (
    <th onClick={() => onSort(col)} style={{
      cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
      color: active ? 'var(--text)' : undefined, ...style
    }}>
      {children}
      <span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.4 }}>
        {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </th>
  )
}
