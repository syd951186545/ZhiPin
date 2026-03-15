import {create} from 'zustand'
import type {AutomationTask} from '@/types/database'

interface TaskProgress {
  taskId: string
  progress: number
  status: AutomationTask['status']
  message?: string
}

interface TaskStore {
  // State
  activeTasks: Map<string, AutomationTask>
  selectedTaskId: string | null

  // Actions
  addTask: (task: AutomationTask) => void
  updateTask: (id: string, updates: Partial<AutomationTask>) => void
  removeTask: (id: string) => void
  updateTaskProgress: (progress: TaskProgress) => void
  setSelectedTask: (id: string | null) => void
  clearCompleted: () => void
}

export const useTaskStore = create<TaskStore>((set) => ({
  activeTasks: new Map(),
  selectedTaskId: null,

  addTask: (task) =>
    set((state) => {
      const next = new Map(state.activeTasks)
      next.set(task.id, task)
      return { activeTasks: next }
    }),

  updateTask: (id, updates) =>
    set((state) => {
      const next = new Map(state.activeTasks)
      const existing = next.get(id)
      if (existing) {
        next.set(id, { ...existing, ...updates, updated_at: new Date().toISOString() })
      }
      return { activeTasks: next }
    }),

  removeTask: (id) =>
    set((state) => {
      const next = new Map(state.activeTasks)
      next.delete(id)
      return {
        activeTasks: next,
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
      }
    }),

  updateTaskProgress: ({ taskId, progress, status, message }) =>
    set((state) => {
      const next = new Map(state.activeTasks)
      const existing = next.get(taskId)
      if (existing) {
        next.set(taskId, {
          ...existing,
          progress,
          status,
          error_message: status === 'failed' ? (message ?? existing.error_message) : existing.error_message,
          completed_at:
            status === 'completed' || status === 'failed' || status === 'cancelled'
              ? new Date().toISOString()
              : existing.completed_at,
          updated_at: new Date().toISOString(),
        })
      }
      return { activeTasks: next }
    }),

  setSelectedTask: (id) => set({ selectedTaskId: id }),

  clearCompleted: () =>
    set((state) => {
      const next = new Map(state.activeTasks)
      for (const [id, task] of next) {
        if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
          next.delete(id)
        }
      }
      return {
        activeTasks: next,
        selectedTaskId:
          state.selectedTaskId && !next.has(state.selectedTaskId) ? null : state.selectedTaskId,
      }
    }),
}))
