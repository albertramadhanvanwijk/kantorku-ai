<template>
  <Card class="h-full">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-surface-900">{{ title }}</h3>
        <Button variant="ghost" size="sm" @click="$emit('view-all')">
          View all
          <Icon name="ChevronRight" size="xs" />
        </Button>
      </div>
    </template>
    
    <div class="space-y-3 max-h-[400px] overflow-y-auto scrollbar-thin">
      <template v-if="activities.length === 0">
        <div class="flex flex-col items-center justify-center py-8 text-center">
          <Icon :name="emptyIcon" size="xl" class="text-surface-300 mb-2" />
          <p class="text-sm text-surface-500">{{ emptyMessage }}</p>
          <Button v-if="emptyAction" variant="outline" size="sm" class="mt-2" @click="$emit('empty-action')">
            {{ emptyActionLabel }}
          </Button>
        </div>
      </template>
      
      <template v-else>
        <div v-for="activity in activities" :key="activity.id" class="flex gap-3 pb-3 last:pb-0 last:border-0 border-b border-surface-100">
          <div class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" :class="activityColor(activity.type)">
            <Icon :name="activityIcon(activity.type)" size="sm" class="text-white" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-surface-900">{{ activity.message }}</p>
            <p class="text-[11px] text-surface-500">{{ formatTime(activity.timestamp) }}</p>
          </div>
          <Badge v-if="activity.badge" :variant="activity.badge.variant" size="sm">
            {{ activity.badge.label }}
          </Badge>
        </div>
      </template>
    </div>
    
    <template #footer>
      <div class="flex items-center justify-between">
        <span class="text-sm text-surface-500">{{ activities.length }} activities</span>
        <Button variant="ghost" size="sm" @click="$emit('clear')">
          <Icon name="Trash2" size="xs" />
          Clear
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

interface Activity {
  id: string;
  type: 'agent' | 'workflow' | 'approval' | 'error' | 'info' | 'content' | 'analytics';
  message: string;
  timestamp: Date | string;
  badge?: { variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand'; label: string };
}

interface Props {
  title: string;
  activities: Activity[];
  emptyIcon?: string;
  emptyMessage?: string;
  emptyAction?: boolean;
  emptyActionLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  emptyIcon: 'Inbox',
  emptyMessage: 'No activity yet',
  emptyAction: false,
  emptyActionLabel: 'Get Started',
});

const emit = defineEmits<{
  'view-all': [];
  'empty-action': [];
  clear: [];
}>();

function activityColor(type: Activity['type']): string {
  switch (type) {
    case 'agent': return 'bg-brand-100 text-brand-600';
    case 'workflow': return 'bg-violet-100 text-violet-600';
    case 'approval': return 'bg-amber-100 text-amber-600';
    case 'error': return 'bg-red-100 text-red-600';
    case 'content': return 'bg-pink-100 text-pink-600';
    case 'analytics': return 'bg-cyan-100 text-cyan-600';
    case 'info':
    default: return 'bg-blue-100 text-blue-600';
  }
}

function activityIcon(type: Activity['type']): string {
  switch (type) {
    case 'agent': return 'Bot';
    case 'workflow': return 'GitBranch';
    case 'approval': return 'CheckCircle2';
    case 'error': return 'AlertTriangle';
    case 'content': return 'FileText';
    case 'analytics': return 'BarChart3';
    case 'info':
    default: return 'Info';
  }
}

function formatTime(timestamp: Date | string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
</script>