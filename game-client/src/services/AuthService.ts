import { ApiClient } from './ApiClient'

function getDeviceId(): string {
  const raw = `${navigator.userAgent}-${screen.width}x${screen.height}-${navigator.language}`
  // Simple hash
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return 'dev_' + Math.abs(hash).toString(36)
}

export interface AuthResponse {
  // Success case (known device or after verification)
  accessToken?: string
  user?: UserProfile
  // Pending verification case
  pendingVerification?: boolean
  userId?: string
}

/** @deprecated Use AuthResponse instead */
export type LoginResult = AuthResponse

export interface UserProfile {
  id: string
  username: string
  email: string
  level: number
  xp: number
  gold: number
  dg: number
  rankPoints: number
  wins: number
  losses: number
}

export class AuthService {
  constructor(private api: ApiClient) {}

  async register(username: string, email: string, password: string): Promise<AuthResponse> {
    const result = await this.api.post<AuthResponse>('/api/auth/register', { username, email, password })
    return result  // Don't set token yet — need verification
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    const deviceId = getDeviceId()
    const result = await this.api.post<AuthResponse>('/api/auth/login', { username, password, deviceId })
    if (result.accessToken) {
      this.api.setToken(result.accessToken)
    }
    return result
  }

  async verifyCode(userId: string, code: string): Promise<AuthResponse> {
    const deviceId = getDeviceId()
    const result = await this.api.post<AuthResponse>('/api/auth/verify', { userId, code, deviceId })
    if (result.accessToken) {
      this.api.setToken(result.accessToken)
    }
    return result
  }

  async resendCode(userId: string): Promise<void> {
    await this.api.post('/api/auth/resend', { userId })
  }

  logout(): void {
    this.api.clearToken()
  }

  async getProfile(): Promise<UserProfile> {
    return this.api.get<UserProfile>('/api/users/me')
  }
}
