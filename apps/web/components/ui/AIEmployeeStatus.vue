<template>
  <Card class="h-full">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-surface-900">{{ title }}</h3>
        <div class="flex items-center gap-2">
          <Badge variant="brand" size="sm">{{ totalAgents }} agents</Badge>
          <Button variant="ghost" size="sm" @click="$emit('view-all')">
            <Icon name="Users" size="xs" />
            All
          </Button>
        </div>
      </div>
    </template>
    
    <div class="space-y-3 max-h-[400px] overflow-y-auto scrollbar-thin">
      <template v-if="agents.length === 0">
        <div class="flex flex-col items-center justify-center py-8 text-center">
          <Icon name="Bot" size="xl" class="text-surface-300 mb-2" />
          <p class="text-sm text-surface-500">No AI employees configured</p>
          <Button variant="primary" size="sm" class="mt-3" @click="$emit('add-agent')">
            Add First Agent
          </Button>
        </div>
      </template>
      
      <template v-else>
        <div v-for="agent in agents" :key="agent.id" class="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-50 transition-colors">
          <div class="relative flex-shrink-0">
            <div class="w-10 h-10 rounded-full flex items-center justify-center" :class="agentColor(agent.department)">
              <Icon :name="agent.icon" size="sm" class="text-white" />
            </div>
            <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white" :class="statusColor(agent.status)" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <h4 class="font-medium text-sm text-surface-900 truncate">{{ agent.name }}</h4>
              <Badge :variant="statusVariant(agent.status)" size="sm" :dot="true">
                {{ statusLabel(agent.status) }}
              </Badge>
            </div>
            <p class="text-[11px] text-surface-500 truncate">{{ agent.role }}</p>
            <div class="flex items-center gap-2 mt-1.5">
              <span class="text-[10px] text-surface-400">{{ agent.currentTask || 'Idle' }}</span>
              <div v-if="agent.currentTask" class="flex-1 h-1.5 bg-surface-200 rounded-full overflow-hidden">
                <div class="h-full bg-brand-500" :style="{ width: `${agent.progress}%` }" />
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" @click="$emit('view-agent', agent)">
              <Icon name="Eye" size="xs" />
            </Button>
            <Button variant="ghost" size="sm" @click="$emit('configure-agent', agent)">
              <Icon name="Settings" size="xs" />
            </Button>
          </div>
        </div>
      </template>
    </div>
    
    <template #footer>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4 text-sm text-surface-500">
          <span class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-success-500" />
            {{ activeCount }} Active
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-warning-500" />
            {{ busyCount }} Busy
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-surface-400" />
            {{ idleCount }} Idle
          </span>
        </div>
        <Button variant="ghost" size="sm" @click="$emit('manage')">
          Manage
          <Icon name="ChevronRight" size="xs" />
        </Button>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import Card from '../ui/Card.vue';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';

interface AIAgent {
  id: string;
  name: string;
  role: string;
  department: string;
  icon: string;
  status: 'active' | 'busy' | 'idle' | 'offline' | 'error';
  currentTask?: string;
  progress?: number;
}

interface Props {
  title: string;
  agents: AIAgent[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'view-all': [];
  'add-agent': [];
  'view-agent': [agent: AIAgent];
  'configure-agent': [agent: AIAgent];
  manage: [];
}>();

const totalAgents = computed(() => props.agents.length);
const activeCount = computed(() => props.agents.filter(a => a.status === 'active').length);
const busyCount = computed(() => props.agents.filter(a => a.status === 'busy').length);
const idleCount = computed(() => props.agents.filter(a => a.status === 'idle').length);

function agentColor(department: string): string {
  const colors: Record<string, string> = {
    'hq': 'bg-brand-500',
    'research': 'bg-blue-500',
    'trading-intelligence': 'bg-emerald-500',
    'content-studio': 'bg-violet-500',
    'creative-studio': 'bg-pink-500',
    'qa-compliance': 'bg-orange-500',
    'analytics-growth': 'bg-cyan-500',
    'knowledge': 'bg-indigo-500',
    'tasks': 'bg-rose-500',
  };
  return colors[department] || 'bg-brand-500';
}

function statusColor(status: AIAgent['status']): string {
  switch (status) {
    case 'active': return 'bg-success-500';
    case 'busy': return 'bg-warning-500';
    case 'idle': return 'bg-surface-400';
    case 'offline': return 'bg-surface-300';
    case 'error': return 'bg-error-500';
    default: return 'bg-surface-400';
  }
}

function statusVariant(status: AIAgent['status']): 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand' {
  switch (status) {
    case 'active': return 'success';
    case 'busy': return 'warning';
    case 'idle': return 'neutral';
    case 'offline': return 'neutral';
    case 'error': return 'error';
    default: return 'neutral';
  }
}

function statusLabel(status: AIAgent['status']): string {
  switch (status) {
    case 'active': return 'Active';
    case 'busy': return 'Busy';
    case 'idle': return 'Idle';
    case 'offline': return 'Offline';
    case 'error': return 'Error';
    default: return 'Unknown';
  }
}
</script>