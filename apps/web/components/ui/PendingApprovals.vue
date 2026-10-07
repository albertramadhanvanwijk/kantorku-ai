<template>
  <Card class="h-full">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-surface-900">{{ title }}</h3>
        <Badge variant="warning" size="sm" :dot="true">{{ count }} pending</Badge>
      </div>
    </template>
    
    <div class="space-y-3 max-h-[400px] overflow-y-auto scrollbar-thin">
      <template v-if="items.length === 0">
        <div class="flex flex-col items-center justify-center py-8 text-center">
          <Icon :name="emptyIcon" size="xl" class="text-surface-300 mb-2" />
          <p class="text-sm text-surface-500">{{ emptyMessage }}</p>
        </div>
      </template>
      
      <template v-else>
        <div v-for="item in items" :key="item.id" class="flex items-start gap-3 p-3 rounded-lg hover:bg-surface-50 transition-colors">
          <div class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" :class="itemColor(item.type)">
            <Icon :name="itemIcon(item.type)" size="sm" class="text-white" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <h4 class="font-medium text-surface-900 truncate">{{ item.title }}</h4>
              <Badge :variant="item.priority === 'high' ? 'error' : item.priority === 'medium' ? 'warning' : 'info'" size="sm">
                {{ item.priority }}
              </Badge>
            </div>
            <p class="text-sm text-surface-500 mt-0.5">{{ item.description }}</p>
            <div class="flex items-center gap-2 mt-2">
              <span class="text-[11px] text-surface-400">{{ formatTime(item.createdAt) }}</span>
              <span class="text-[11px] text-surface-400">•</span>
              <span class="text-[11px] text-surface-500">{{ item.assignee }}</span>
            </div>
          </div>
          <div class="flex gap-1.5">
            <Button variant="ghost" size="sm" @click="$emit('approve', item)">
              <Icon name="Check" size="xs" />
              Approve
            </Button>
            <Button variant="ghost" size="sm" @click="$emit('request-changes', item)">
              <Icon name="MessageSquare" size="xs" />
              Changes
            </Button>
          </div>
        </div>
      </template>
    </div>
  </Card>
</template>

<script setup lang="ts">
import Card from '../ui/Card.vue';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';

interface ApprovalItem {
  id: string;
  type: 'script' | 'design' | 'content' | 'campaign' | 'analytics';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  assignee: string;
  createdAt: Date | string;
}

interface Props {
  title: string;
  items: ApprovalItem[];
  emptyIcon?: string;
  emptyMessage?: string;
}

const props = withDefaults(defineProps<Props>(), {
  emptyIcon: 'ClipboardCheck',
  emptyMessage: 'No pending approvals',
});

const emit = defineEmits<{
  approve: [item: ApprovalItem];
  'request-changes': [item: ApprovalItem];
}>();

const count = computed(() => props.items.length);

function itemColor(type: ApprovalItem['type']): string {
  switch (type) {
    case 'script': return 'bg-brand-100 text-brand-600';
    case 'design': return 'bg-pink-100 text-pink-600';
    case 'content': return 'bg-violet-100 text-violet-600';
    case 'campaign': return 'bg-amber-100 text-amber-600';
    case 'analytics': return 'bg-cyan-100 text-cyan-600';
    default: return 'bg-brand-100 text-brand-600';
  }
}

function itemIcon(type: ApprovalItem['type']): string {
  switch (type) {
    case 'script': return 'FileText';
    case 'design': return 'Palette';
    case 'content': return 'Layout';
    case 'campaign': return 'Target';
    case 'analytics': return 'BarChart3';
    default: return 'FileText';
  }
}

function formatTime(timestamp: Date | string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
</script>