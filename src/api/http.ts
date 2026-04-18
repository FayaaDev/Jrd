type HeaderProvider = () => Record<string, string> | Promise<Record<string, string>>
let headerProvider: HeaderProvider | null = null
let credentialsMode: RequestCredentials = 'include'

export function configureHttp(opts: { headerProvider?: HeaderProvider; credentials?: RequestCredentials }) {
  if (opts.headerProvider !== undefined) headerProvider = opts.headerProvider
  if (opts.credentials !== undefined) credentialsMode = opts.credentials
}

export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const extra = headerProvider ? await headerProvider() : {}
  return fetch(input, {
    ...init,
    credentials: credentialsMode,
    headers: { ...extra, ...(init.headers ?? {}) },
  })
}
