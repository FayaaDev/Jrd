let apiBasePath = '/api'
let storageScope = '/'

export function configureApiBase(opts: { basePath?: string; storageScope?: string }) {
  if (opts.basePath !== undefined) apiBasePath = opts.basePath.replace(/\/+$/, '') || '/api'
  if (opts.storageScope !== undefined) storageScope = opts.storageScope.replace(/\/+$/, '') || '/'
}

export function apiPath(path: string) {
  if (!path.startsWith('/')) throw new Error(`API path must start with "/": ${path}`)
  return `${apiBasePath}${path}`
}

export function scopedStorageKey(key: string) {
  return storageScope === '/' ? key : `${key}:${storageScope}`
}
