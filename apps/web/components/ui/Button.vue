<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="buttonClass"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="animate-spin">
      <Icon name="Loader2" size="sm" />
    </span>
    <slot v-else />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';

interface Props {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
  class: '',
});

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

const buttonClass = computed(() => {
  const base = 'inline-flex items-center justify-center gap-2 font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantClasses = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500 px-4 py-2 rounded-lg',
    secondary: 'bg-surface-100 text-surface-700 hover:bg-surface-200 focus:ring-surface-400 border border-surface-200 px-4 py-2 rounded-lg',
    ghost: 'bg-transparent text-surface-600 hover:bg-surface-100 focus:ring-surface-400 px-4 py-2 rounded-lg',
    danger: 'bg-error-500 text-white hover:bg-red-600 focus:ring-error-500 px-4 py-2 rounded-lg',
    outline: 'border border-surface-300 bg-white text-surface-700 hover:bg-surface-50 focus:ring-brand-500 px-4 py-2 rounded-lg',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    lg: 'px-6 py-3 text-base gap-2',
    md: 'px-4 py-2 gap-2',
  };

  return `${base} ${variantClasses[props.variant]} ${sizeClasses[props.size]} ${props.class}`;
});
</script>