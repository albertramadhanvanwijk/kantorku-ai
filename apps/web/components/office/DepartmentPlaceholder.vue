<template>
  <div class="space-y-6 animate-fade-in">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div class="flex items-center gap-4">
        <div :class="['w-14 h-14 rounded-xl flex items-center justify-center', `bg-${color}-100`]">
          <Icon :name="icon" size="xl" :class="`text-${color}-600`" />
        </div>
        <div>
          <h1 class="text-2xl font-bold text-surface-900">{{ title }}</h1>
          <p class="text-surface-500 mt-1">{{ description }}</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Badge :variant="color as any" size="sm" :dot="true">
          {{ statusLabel }}
        </Badge>
        <Button variant="primary">
          <Icon name="Plus" size="sm" />
          New Task
        </Button>
      </div>
    </div>

    <!-- Department Agents -->
    <Card>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-surface-900">AI Employees</h3>
          <Badge variant="neutral" size="sm">{{ agents.length }} agents</Badge>
        </div>
      </template>
      <div class="space-y-3">
        <template v-for="agent in agents" :key="agent.name">
          <div class="flex items-center justify-between p-3 rounded-lg hover:bg-surface-50 transition-colors">
            <div class="flex items-center gap-3">
              <div :class="['w-10 h-10 rounded-full flex items-center justify-center', `bg-${color}-100`]">
                <Icon :name="agentIcon(agent.role)" size="sm" :class="`text-${color}-600`" />
              </div>
              <div>
                <p class="font-medium text-sm text-surface-900">{{ agent.name }}</p>
                <p class="text-[11px] text-surface-500">{{ agent.role }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <Badge :variant="statusVariant(agent.status)" size="sm" :dot="true">
                {{ statusLabel(agent.status) }}
              </Badge>
              <Button variant="ghost" size="sm">
                <Icon name="Settings" size="xs" />
              </Button>
            </div>
          </div>
        </template>
      </div>
    </Card>

    <!-- Features Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card v-for="feature in features" :key="feature.title" :hover="true" class="text-center p-6">
        <div :class="['w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3', `bg-${color}-100`]">
          <Icon :name="feature.icon" size="lg" :class="`text-${color}-600`" />
        </div>
        <h4 class="font-medium text-surface-900">{{ feature.title }}</h4>
        <p class="text-sm text-surface-500 mt-1">{{ feature.description }}</p>
      </Card>
    </div>

    <!-- Activity Feed -->
    <Card>
      <template #header>
        <h3 class="font-semibold text-surface-900">Recent Activity</h3>
      </template>
      <div class="space-y-3 text-center py-8">
        <Icon name="Inbox" size="xl" class="text-surface-300 mx-auto mb-2" />
        <p class="text-sm text-surface-500">No activity yet. This department will show activity when agents are running.</p>
        <Button variant="outline" class="mt-3" @click="$emit('run-agent')">
          <Icon name="Play" size="xs" />
          Run Agent
        </Button>
      </div>
    </Card>

    <!-- Coming Soon Notice -->
    <Card variant="outlined" class="border-brand-200 bg-brand-50">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
          <Icon name="Construction" size="md" class="text-brand-600" />
        </div>
        <div>
          <h4 class="font-medium text-brand-900">Under Development</h4>
          <p class="text-sm text-brand-700 mt-0.5">
            This department workspace will be fully implemented in Phase 2+ with agent runtime, 
            workflow orchestration, and specialized tools.
          </p>
        </div>
      </div>
    </Card>
  </div>
</template>

<script setup lang="ts">
import Card from '../ui/Card.vue';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';

interface Feature {
  icon: string;
  title: string;
  description: string;
}

interface Agent {
  name: string;
  role: string;
  status: 'active' | 'busy' | 'idle' | 'offline' | 'error';
  currentTask?: string | null;
}

interface Props {
  title: string;
  description: string;
  icon: string;
  color: string;
  features: Feature[];
  agents: Agent[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'run-agent': [];
}>();

function statusVariant(status: Agent['status']): 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand' {
  switch (status) {
    case 'active': return 'success';
    case 'busy': return 'warning';
    case 'idle': return 'neutral';
    case 'offline': return 'neutral';
    case 'error': return 'error';
    default: return 'neutral';
  }
}

function statusLabel(status: Agent['status']): string {
  switch (status) {
    case 'active': return 'Active';
    case 'busy': return 'Busy';
    case 'idle': return 'Idle';
    case 'offline': return 'Offline';
    case 'error': return 'Error';
    default: return 'Unknown';
  }
}

function agentIcon(role: string): string {
  const icons: Record<string, string> = {
    'Web & Market Research': 'Globe',
    'Source Verification & Fact Check': 'ShieldCheck',
    'Multi-Chart Technical Analysis': 'BarChart3',
    'Trade Journal Processing': 'BookOpen',
    'Market Outlook Generation': 'TrendingUp',
    'Content Strategy & Ideation': 'Lightbulb',
    'Hook & Angle Generation': 'Target',
    'Script & Caption Writing': 'PenTool',
    'Carousel Design & Layout': 'Palette',
    'Template System Maintenance': 'Layout',
    'Brand & Promotion Compliance': 'Shield',
    'Financial Safety & Accuracy': 'CheckCircle2',
    'Visual Quality Assurance': 'Eye',
    'TikTok Analytics Processing': 'BarChart3',
    'Content Performance Intelligence': 'TrendingUp',
    'A/B Testing & Experiments': 'FlaskConical',
    'Trading DNA & Brand Voice': 'Brain',
    'Historical Content Retrieval': 'Archive',
    'Workflow & Job Coordination': 'ClipboardList',
    'Orchestrator & Workflow Manager': 'LayoutDashboard',
    '9Router Usage & Budget Tracking': 'DollarSign',
  };
  return icons[role] || 'Bot';
}
</script>