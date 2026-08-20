import { useState, useEffect, useCallback } from 'react'

interface UsePaginatedOptions {
  url: string
  pageSize?: number
  params?: Record<string, string>
}

interface PaginatedResult<T> {
  data: T[]
  loading: boolean
  error: string | null
  page: number
  totalPages: number
  totalCount: number
  hasMore: boolean
  goToPage: (p: number) => void
  nextPage: () => void
  prevPage: () => void
  reload: () => void
}

export function usePaginated<T>({ url, pageSize = 25, params = {} }: UsePaginatedOptions): PaginatedResult<T> {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paramKey = JSON.stringify(params)

  const fetchData = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ page: String(p), pageSize: String(pageSize), ...params })
      const res = await fetch(`${url}?${qs}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || 'Failed to load data')
      }
      const json = await res.json()
      setData(json.data ?? json)
      setTotalCount(json.total ?? json.length ?? 0)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, pageSize, paramKey])

  useEffect(() => { fetchData(page) }, [page, fetchData])

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return {
    data,
    loading,
    error,
    page,
    totalPages,
    totalCount,
    hasMore: page < totalPages,
    goToPage: (p: number) => setPage(Math.max(1, Math.min(p, totalPages || 1))),
    nextPage: () => setPage(p => Math.min(p + 1, totalPages || 1)),
    prevPage: () => setPage(p => Math.max(p - 1, 1)),
    reload: () => fetchData(page),
  }
}
