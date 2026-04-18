const apiBasePath = (import.meta.env.VITE_API_BASE_PATH ?? '/api').replace(/\/+$/, '')

export function apiPath(path: string) {
  if (!path.startsWith('/')) {
    throw new Error(`API path must start with "/": ${path}`)
  }

  return `${apiBasePath}${path}`
}

export function scopedStorageKey(key: string) {
  const baseUrl = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/'
  return baseUrl === '/' ? key : `${key}:${baseUrl}`
}
