'use client';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface Project {
  id: string;
  name: string;
  address: string;
  status: string;
  contract_amount: number;
  start_date: string;
  end_date: string;
  project_number: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  link?: string;
}

interface DashStats {
  activeProjects: number;
  openBids: number;
  pendingPayApps: number;
  totalContractValue: number;
  monthlyRevenue: number;
  openRFIs: number;
  openCOs: number;
  overdueItems: number;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  company_id: string;
}

interface AppState {
  // User
  user: User | null;
  setUser: (user: User | null) => void;

  // Projects
  projects: Project[];
  projectsLoading: boolean;
  setProjects: (projects: Project[]) => void;
  setProjectsLoading: (v: boolean) => void;
  upsertProject: (project: Project) => void;

  // Dashboard stats
  dashStats: DashStats | null;
  dashStatsLoading: boolean;
  setDashStats: (stats: DashStats) => void;
  setDashStatsLoading: (v: boolean) => void;

  // Notifications
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (notifs: Notification[]) => void;
  addNotification: (notif: Notification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;

  // Global UI
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;

  // Offline queue badge
  queueCount: number;
  setQueueCount: (n: number) => void;
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set) => ({
    // User
    user: null,
    setUser: (user) => set({ user }),

    // Projects
    projects: [],
    projectsLoading: true,
    setProjects: (projects) => set({ projects }),
    setProjectsLoading: (projectsLoading) => set({ projectsLoading }),
    upsertProject: (project) =>
      set((s) => {
        const idx = s.projects.findIndex((p) => p.id === project.id);
        if (idx === -1) return { projects: [project, ...s.projects] };
        const updated = [...s.projects];
        updated[idx] = { ...updated[idx], ...project };
        return { projects: updated };
      }),

    // Dashboard stats
    dashStats: null,
    dashStatsLoading: true,
    setDashStats: (dashStats) => set({ dashStats, dashStatsLoading: false }),
    setDashStatsLoading: (dashStatsLoading) => set({ dashStatsLoading }),

    // Notifications
    notifications: [],
    unreadCount: 0,
    setNotifications: (notifications) =>
      set({ notifications, unreadCount: notifications.filter((n) => !n.read).length }),
    addNotification: (notif) =>
      set((s) => ({
        notifications: [notif, ...s.notifications],
        unreadCount: s.unreadCount + (notif.read ? 0 : 1),
      })),
    markRead: (id) =>
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: Math.max(0, s.unreadCount - 1),
      })),
    markAllRead: () =>
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      })),

    // Global UI
    sidebarOpen: false,
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

    // Offline queue badge
    queueCount: 0,
    setQueueCount: (queueCount) => set({ queueCount }),
  }))
);
