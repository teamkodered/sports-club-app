// Load every row of a query in batches of 1,000 (one request is capped at 1,000 rows by the
// database, so long lists -- e.g. 1,000+ students -- silently lost their last rows).
// buildQuery: () => a fresh supabase query (select + filters + an order for stable paging).
export async function fetchAll(buildQuery, size = 1000) {
  const out = []
  for (let from = 0; ; from += size) {
    const { data, error } = await buildQuery().range(from, from + size - 1)
    if (error) return { data: out.length ? out : null, error }
    out.push(...(data || []))
    if (!data || data.length < size) return { data: out, error: null }
  }
}
