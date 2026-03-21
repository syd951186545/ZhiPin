// Auto-generated Supabase types (manually defined for now)
// Run `supabase gen types typescript` to auto-generate when Supabase is configured

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          name: string
          slug: string
          plan: 'free' | 'pro' | 'enterprise'
          settings: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tenants']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['tenants']['Insert']>
      }
      profiles: {
        Row: {
          id: string
          tenant_id: string
          full_name: string
          avatar_url: string | null
          role: 'owner' | 'admin' | 'member' | 'viewer'
          phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      jobs: {
        Row: {
          id: string
          tenant_id: string
          created_by: string
          title: string
          department: string | null
          location: string | null
          employment_type: 'full-time' | 'part-time' | 'contract' | 'internship'
          salary_min: number | null
          salary_max: number | null
          salary_currency: string
          description: string | null
          requirements: string | null
          benefits: string | null
          status: 'draft' | 'active' | 'paused' | 'closed'
          tags: string[]
          published_platforms: PublishedPlatform[]
          applicant_count: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['jobs']['Row'], 'id' | 'applicant_count' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['jobs']['Insert']>
      }
      candidates: {
        Row: {
          id: string
          tenant_id: string
          job_id: string | null
          name: string
          email: string | null
          phone: string | null
          source: 'direct' | '58' | 'boss_zhipin' | 'linkedin' | 'openclaw_auto' | 'upload'
          stage: 'new' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected'
          ai_match_score: number | null
          ai_analysis: AiAnalysis | null
          notes: string | null
          tags: string[]
          metadata: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['candidates']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['candidates']['Insert']>
      }
      resumes: {
        Row: {
          id: string
          tenant_id: string
          candidate_id: string
          file_path: string
          file_name: string
          file_size: number | null
          mime_type: string | null
          parsed_content: ParsedResume | null
          raw_text: string | null
          parse_status: 'pending' | 'parsing' | 'completed' | 'failed'
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['resumes']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['resumes']['Insert']>
      }
      automation_tasks: {
        Row: {
          id: string
          tenant_id: string
          created_by: string
          job_id: string | null
          type: 'publish_job' | 'talent_explore' | 'resume_screen' | 'auto_publish' | 'auto_source' | 'auto_reply'
          name: string
          status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
          config: Record<string, unknown>
          platform: string | null
          progress: number
          result_summary: TaskResultSummary | null
          error_message: string | null
          execution_id: string | null
          full_output: string | null
          screenshot_urls: string[]
          started_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['automation_tasks']['Row'], 'id' | 'progress' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['automation_tasks']['Insert']>
      }
      task_logs: {
        Row: {
          id: number
          task_id: string
          tenant_id: string
          level: 'info' | 'success' | 'warning' | 'error'
          message: string
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['task_logs']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['task_logs']['Insert']>
      }
      platform_configs: {
        Row: {
          id: string
          tenant_id: string
          platform: '58' | 'boss_zhipin' | 'liepin' | 'zhilian' | '51job' | 'lagou'
          name: string
          account_name: string | null
          platform_url: string | null
          login_method: 'phone' | 'qr' | 'password' | null
          browser_session_key: string | null
          login_state: 'NOT_BOUND' | 'LOGGED_IN' | 'AWAIT_SMS' | 'AWAIT_QR' | 'AWAIT_PASSWORD_2FA' | 'FAILED' | null
          login_identifier_masked: string | null
          last_error: string | null
          last_bind_task_id: string | null
          last_unbind_task_id: string | null
          config: Record<string, unknown>
          is_connected: boolean
          status: 'active' | 'needsLogin' | 'verifying' | 'expired'
          last_verified: string | null
          last_login: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['platform_configs']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['platform_configs']['Insert']>
      }
      platform_binding_sessions: {
        Row: {
          id: string
          account_id: string
          tenant_id: string
          action: 'bind' | 'verify' | 'unbind'
          status: 'running' | 'awaiting_sms' | 'awaiting_qr' | 'awaiting_password_2fa' | 'completed' | 'failed' | 'expired' | 'cancelled'
          step_key: string | null
          openclaw_session_key: string
          latest_screenshot_url: string | null
          qr_screenshot_url: string | null
          awaiting_payload_schema: Record<string, unknown> | null
          retry_count: number
          error_message: string | null
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['platform_binding_sessions']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['platform_binding_sessions']['Insert']>
      }
      tenant_settings: {
        Row: {
          id: string
          tenant_id: string
          openclaw_gateway_url: string
          openclaw_auth_token: string | null
          proxy_mode: boolean
          ai_model: string
          ai_temperature: number
          ai_system_prompt: string | null
          notification_wecom_url: string | null
          notification_email: string | null
          audit_logging: boolean
          data_retention_days: number
          company_name: string
          company_address: string
          company_size: string
          company_overview: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tenant_settings']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['tenant_settings']['Insert']>
      }
      activity_logs: {
        Row: {
          id: number
          tenant_id: string
          user_id: string | null
          action: string
          resource_type: string | null
          resource_id: string | null
          details: Record<string, unknown> | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['activity_logs']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['activity_logs']['Insert']>
      }
    }
  }
}

// Domain types
export interface PublishedPlatform {
  platform: string
  external_id?: string
  url?: string
  published_at: string
}

export interface AiAnalysis {
  strengths: string[]
  weaknesses: string[]
  summary: string
  skill_match?: Record<string, boolean>
  recommendation?: string
}

export interface ParsedResume {
  name?: string
  email?: string
  phone?: string
  education?: { school: string; degree: string; major: string; year?: string }[]
  experience?: { company: string; title: string; duration: string; description?: string }[]
  skills?: string[]
  summary?: string
}

export interface TaskResultSummary {
  jobs_posted?: number
  resumes_screened?: number
  candidates_found?: number
  messages_sent?: number
  match_rate?: number
  workflow_id?: string
  job_title?: string
  platform?: string
  platforms?: string[]
  announcement?: string
  publish_result?: Record<string, unknown>
  candidate_preview?: Record<string, unknown>[]
  candidates_saved?: number
  screenshots_count?: number
  [key: string]: unknown
}

// Convenience type aliases
export type Job = Database['public']['Tables']['jobs']['Row']
export type JobInsert = Database['public']['Tables']['jobs']['Insert']
export type JobUpdate = Database['public']['Tables']['jobs']['Update']

export type Candidate = Database['public']['Tables']['candidates']['Row']
export type CandidateInsert = Database['public']['Tables']['candidates']['Insert']
export type CandidateUpdate = Database['public']['Tables']['candidates']['Update']

export type AutomationTask = Database['public']['Tables']['automation_tasks']['Row']
export type TaskLog = Database['public']['Tables']['task_logs']['Row']
export type Resume = Database['public']['Tables']['resumes']['Row']
export type PlatformConfig = Database['public']['Tables']['platform_configs']['Row']
export type PlatformBindingSessionRow = Database['public']['Tables']['platform_binding_sessions']['Row']
export type TenantSettings = Database['public']['Tables']['tenant_settings']['Row']
export type ActivityLog = Database['public']['Tables']['activity_logs']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Tenant = Database['public']['Tables']['tenants']['Row']
