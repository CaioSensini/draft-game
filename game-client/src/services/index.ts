import { ApiClient } from './ApiClient'
import { AuthService } from './AuthService'
import { GameService } from './GameService'

// Singleton instances
const api = new ApiClient()
export const authService = new AuthService(api)
export const gameService = new GameService(api)
export { api }
