<template>
  <component
    :is="iconComponent"
    :class="[size, colorClass]"
    :stroke-width="strokeWidth"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import type { Component, FunctionalComponent } from 'vue';
import * as LucideIcons from 'lucide-vue-next';

interface Props {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  strokeWidth?: number;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  strokeWidth: 2,
  class: '',
});

const sizeClasses = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
};

const iconComponent = computed<Component | FunctionalComponent>(() => {
  const icon = LucideIcons[props.name as keyof typeof LucideIcons];
  if (!icon) {
    console.warn(`Icon "${props.name}" not found in lucide-vue-next`);
    return LucideIcons.HelpCircle;
  }
  return icon as Component | FunctionalComponent;
});

const size = computed(() => sizeClasses[props.size] || sizeClasses.md);

const colorClass = computed(() => {
  if (props.color) {
    return `text-${props.color}`;
  }
  return 'text-current';
});
</script>