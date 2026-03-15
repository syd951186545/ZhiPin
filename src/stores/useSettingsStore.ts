import {create} from 'zustand'
import {persist} from 'zustand/middleware'
import type {PlatformConfigLocal, PlatformKey, PlatformProfile} from '@/types/openclaw'
import {OPENCLAW_DEFAULT_AGENT_ID, PLATFORMS} from '@/lib/constants'

// ============================================================
// Settings Store — persisted to localStorage
// ============================================================

interface SettingsState {
  // Connection
  gatewayUrl: string
  authToken: string
  agentId: string
  proxyMode: boolean

  // Platform accounts
  platformProfiles: PlatformProfile[]

  // Platform configs
  platformConfigs: Record<string, PlatformConfigLocal>

  // Proxy & Security
  proxyList: string
  delayEnabled: boolean
  mouseSimulation: boolean
  headless: boolean

  // AI
  aiModel: string
  aiTemperature: number
  aiSystemPrompt: string

  // Notifications
  wecomUrl: string
  notifEmail: string
  auditLogging: boolean
  retentionDays: number

  // ---- Actions ----
  updateConnection: (updates: { gatewayUrl?: string; authToken?: string; agentId?: string; proxyMode?: boolean }) => void
  addProfile: (profile: PlatformProfile) => void
  updateProfile: (id: string, updates: Partial<PlatformProfile>) => void
  removeProfile: (id: string) => void
  getProfilesByPlatform: (platform: PlatformKey) => PlatformProfile[]
  getActiveProfile: (platform: PlatformKey) => PlatformProfile | undefined
  updatePlatformConfig: (platform: string, config: Partial<PlatformConfigLocal>) => void
  updateProxy: (updates: { proxyList?: string; delayEnabled?: boolean; mouseSimulation?: boolean; headless?: boolean }) => void
  updateAI: (updates: { aiModel?: string; aiTemperature?: number; aiSystemPrompt?: string }) => void
  updateNotifications: (updates: { wecomUrl?: string; notifEmail?: string; auditLogging?: boolean; retentionDays?: number }) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // ---- Default Values ----
      gatewayUrl: import.meta.env.VITE_OPENCLAW_URL || import.meta.env.VITE_OPENCLAW_WS_URL || 'http://192.168.3.215:18789',
      authToken: '',
      agentId: OPENCLAW_DEFAULT_AGENT_ID,
      proxyMode: false,

      platformProfiles: [],

      platformConfigs: {},

      proxyList: '',
      delayEnabled: true,
      mouseSimulation: true,
      headless: false,

      aiModel: 'MiniMax-abab6.5-chat',
      aiTemperature: 0.7,
      aiSystemPrompt: '',

      wecomUrl: '',
      notifEmail: '',
      auditLogging: true,
      retentionDays: 90,

      // ---- Actions ----
      updateConnection: (updates) =>
        set((state) => ({ ...state, ...updates })),

      addProfile: (profile) =>
        set((state) => ({
          platformProfiles: [...state.platformProfiles, profile],
        })),

      updateProfile: (id, updates) =>
        set((state) => ({
          platformProfiles: state.platformProfiles.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),

      removeProfile: (id) =>
        set((state) => ({
          platformProfiles: state.platformProfiles.filter((p) => p.id !== id),
        })),

      getProfilesByPlatform: (platform) => {
        return get().platformProfiles.filter((p) => p.platform === platform)
      },

      getActiveProfile: (platform) => {
        return get().platformProfiles.find(
          (p) => p.platform === platform && p.status === 'active'
        )
      },

      updatePlatformConfig: (platform, config) =>
        set((state) => {
          const defaultUrl = PLATFORMS[platform as keyof typeof PLATFORMS]?.loginUrl || ''
          const baseConfig: PlatformConfigLocal = {
            nickname: '',
            boundProfileId: '',
            customUrl: defaultUrl,
          }
          return {
            platformConfigs: {
              ...state.platformConfigs,
              [platform]: {
                ...(state.platformConfigs[platform] || baseConfig),
                ...config,
                customUrl: (config.customUrl ?? state.platformConfigs[platform]?.customUrl ?? defaultUrl),
              },
            },
          }
        }),

      updateProxy: (updates) =>
        set((state) => ({ ...state, ...updates })),

      updateAI: (updates) =>
        set((state) => ({ ...state, ...updates })),

      updateNotifications: (updates) =>
        set((state) => ({ ...state, ...updates })),
    }),
    {
      name: 'zhipinyun_settings',
      version: 1,
    }
  )
)
