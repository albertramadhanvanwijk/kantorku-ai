<template>
  <Card :hover="true" class="h-full">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-surface-900">{{ title }}</h3>
        <Badge :variant="variant" size="sm" :dot="true">{{ status }}</Badge>
      </div>
    </template>
    
    <div class="space-y-4">
      <div class="flex items-baseline gap-2">
        <span class="text-3xl font-bold text-surface-900">{{ value }}</span>
        <span v-if="change" :class="['text-sm font-medium', change >= 0 ? 'text-success-500' : 'text-error-500']">
          {{ change >= 0 ? '+' : '' }}{{ change }}%
        </span>
      </div>
      
      <p class="text-sm text-surface-500">{{ description }}</p>
      
      <div v-if="sparkline && sparkline.length > 0" class="h-12" aria-hidden="true">
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" class="w-full h-full">
          <path
            :d="sparklinePath"
            fill="none"
            :stroke="sparklineColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
      
      <slot name="footer" />
    </div>
  </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Card from '../ui/Card.vue';
import Badge from '../ui/Badge.vue';

interface Props {
  title: string;
  value: string | number;
  description: string;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand';
  status?: string;
  change?: number;
  sparkline?: number[];
  sparklineColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'brand',
  status: 'Active',
  change: 0,
  sparklineColor: 'currentColor',
});

const sparklinePath = computed(() => {
  const sparkline = props.sparkline;
  if (!sparkline || sparkline.length < 2) return '';
  
  const max = Math.max(...sparkline);
  const min = Math.min(...sparkline);
  const range = max - min || 1;
  
  return sparkline.map((value, index) => {
    const x = (index / (sparkline.length - 1)) * 100;
    const y = 30 - ((value - min) / range) * 24;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
});

const sparklineColor = computed(() => {
  if (props.change !== undefined && props.change < 0) return '#ef4444';
  if (props.change !== undefined && props.change > 0) return '#22c55e';
  return '#0ea5e9';
});
</script>