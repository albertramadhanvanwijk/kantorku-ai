<template>
  <div :class="cardClass">
    <div v-if="hasHeader" class="px-5 py-4 border-b border-surface-200">
      <slot name="header" />
    </div>
    <div :class="paddingClass">
      <slot />
    </div>
    <div v-if="hasFooter" class="px-5 py-4 border-t border-surface-200 bg-surface-50 rounded-b-xl">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue';

interface Props {
  variant?: 'default' | 'outlined' | 'elevated' | 'ghost';
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  hover: false,
  padding: 'md',
  class: '',
});

const slots = useSlots();

const hasHeader = computed(() => !!slots.header);
const hasFooter = computed(() => !!slots.footer);

const cardClass = computed(() => {
  const base = 'bg-white rounded-xl border transition-all duration-200';
  
  const variantClasses = {
    default: 'border border-surface-200 shadow-soft',
    outlined: 'border-2 border-surface-200 shadow-none',
    elevated: 'border border-surface-200 shadow-medium',
    ghost: 'border-none shadow-none bg-transparent',
  };

  const hoverClasses = {
    default: 'hover:shadow-medium hover:border-surface-300',
    outlined: 'hover:shadow-medium hover:border-surface-300',
    elevated: 'hover:shadow-strong',
    ghost: 'hover:bg-surface-50',
  };

  return `${base} ${variantClasses[props.variant]} ${props.hover ? hoverClasses[props.variant] : ''} ${props.class}`;
});

const paddingClass = computed(() => {
  switch (props.padding) {
    case 'none': return 'p-0';
    case 'sm': return 'p-3';
    case 'lg': return 'p-6';
    default: return 'p-5';
  }
});
</script>