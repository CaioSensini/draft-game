export class ApiClient {
  private baseUrl: string
  private token: string | null = null

  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl
    this.token = localStorage.getItem('draft_token')
  }

  setToken(token: string) {
    this.token = token
    localStorage.setItem('draft_token', token)
  }

  clearToken() {
    this.token = null
    localStorage.removeItem('draft_token')
  }

  get isAuthenticated(): boolean {
    return this.token !== null
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message || `HTTP ${res.status}`)
    }
    return res.json()
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path)
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  }
}
