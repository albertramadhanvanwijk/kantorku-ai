<template>
  <span :class="badgeClass">
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'neutral',
  size: 'md',
  dot: false,
  class: '',
});

const badgeClass = computed(() => {
  const base = 'inline-flex items-center rounded-full font-medium';
  const dotClass = props.dot ? 'flex gap-1.5' : '';
  
  const variantClasses = {
    success: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    error: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
    brand: 'bg-brand-100 text-brand-800',
    neutral: 'bg-surface-100 text-surface-700',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    lg: 'px-3 py-1 text-sm',
    md: 'px-2.5 py-0.5 text-xs',
  };

  return `${base} ${dotClass} ${variantClasses[props.variant]} ${sizeClasses[props.size]} ${props.class}`;
});
</script>