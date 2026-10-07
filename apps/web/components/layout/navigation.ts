export interface NavItem {
  label: string;
  icon: string;
  path: string;
  badge?: string;
  children?: NavItem[];
}

export interface Department {
  id: string;
  label: string;
  icon: string;
  description: string;
  path: string;
  color: string;
  status: 'active' | 'idle' | 'busy' | 'offline';
  agentCount: number;
}

export const mainNavigation: NavItem[] = [
  {
    label: 'HQ',
    icon: 'LayoutDashboard',
    path: '/hq',
  },
  {
    label: 'Research',
    icon: 'Search',
    path: '/research',
  },
  {
    label: 'Trading Intelligence',
    icon: 'Brain',
    path: '/trading-intelligence',
  },
  {
    label: 'Content Studio',
    icon: 'FileText',
    path: '/content-studio',
  },
  {
    label: 'Creative Studio',
    icon: 'Palette',
    path: '/creative-studio',
  },
  {
    label: 'QA & Compliance',
    icon: 'ShieldCheck',
    path: '/qa-compliance',
  },
  {
    label: 'Analytics & Growth',
    icon: 'BarChart3',
    path: '/analytics-growth',
  },
  {
    label: 'Knowledge',
    icon: 'Library',
    path: '/knowledge',
  },
  {
    label: 'Tasks',
    icon: 'ClipboardList',
    path: '/tasks',
  },
  {
    label: 'AI Employees',
    icon: 'Users',
    path: '/ai-employees',
  },
  {
    label: 'Source Room',
    icon: 'Archive',
    path: '/source-room',
  },
  {
    label: 'Settings',
    icon: 'Settings',
    path: '/settings',
  },
];

export const departments: Department[] = [
  {
    id: 'hq',
    label: 'HQ / AI COO',
    icon: 'LayoutDashboard',
    description: 'Orchestrates work, manages workflows, and coordinates all departments',
    path: '/hq',
    color: 'brand',
    status: 'active',
    agentCount: 3,
  },
  {
    id: 'research',
    label: 'Research Office',
    icon: 'Search',
    description: 'Web/news/market research, source verification, and fact-finding',
    path: '/research',
    color: 'blue',
    status: 'idle',
    agentCount: 2,
  },
  {
    id: 'trading-intelligence',
    label: 'Trading Intelligence',
    icon: 'Brain',
    description: 'Trading journal, multi-chart analysis, market outlook, trading DNA',
    path: '/trading-intelligence',
    color: 'emerald',
    status: 'idle',
    agentCount: 3,
  },
  {
    id: 'content-studio',
    label: 'Content Studio',
    icon: 'FileText',
    description: 'Ideas, strategy, scripts, hooks, captions, content pipeline',
    path: '/content-studio',
    color: 'violet',
    status: 'idle',
    agentCount: 4,
  },
  {
    id: 'creative-studio',
    label: 'Creative Studio',
    icon: 'Palette',
    description: 'Carousel generation, template engine, brand assets, CTA/promotion',
    path: '/creative-studio',
    color: 'pink',
    status: 'idle',
    agentCount: 3,
  },
  {
    id: 'qa-compliance',
    label: 'QA & Compliance',
    icon: 'ShieldCheck',
    description: 'Factual checks, financial-safety checks, visual QA, risk guardrails',
    path: '/qa-compliance',
    color: 'orange',
    status: 'idle',
    agentCount: 2,
  },
  {
    id: 'analytics-growth',
    label: 'Analytics & Growth',
    icon: 'BarChart3',
    description: 'TikTok CSV import, analytics, content intelligence, experimentation',
    path: '/analytics-growth',
    color: 'cyan',
    status: 'idle',
    agentCount: 3,
  },
  {
    id: 'knowledge',
    label: 'Knowledge Center',
    icon: 'Library',
    description: 'Personal profile, trading DNA, brand voice, historical content',
    path: '/knowledge',
    color: 'indigo',
    status: 'idle',
    agentCount: 2,
  },
  {
    id: 'tasks',
    label: 'Task Center',
    icon: 'ClipboardList',
    description: 'Jobs, status, approvals, retries, history, workflow management',
    path: '/tasks',
    color: 'rose',
    status: 'idle',
    agentCount: 1,
  },
];

export const statusColors = {
  active: 'bg-success-500',
  idle: 'bg-surface-400',
  busy: 'bg-warning-500',
  offline: 'bg-surface-300',
};

export const statusLabels = {
  active: 'Active',
  idle: 'Idle',
  busy: 'Busy',
  offline: 'Offline',
};