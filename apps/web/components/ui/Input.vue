<template>
  <div class="w-full">
    <label v-if="label" :for="id" class="label">{{ label }}</label>
    <div class="relative">
      <Icon
        v-if="leadingIcon"
        :name="leadingIcon"
        size="sm"
        class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none"
      />
      <input
        :id="id"
        :type="type"
        :placeholder="placeholder"
        :value="modelValue"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :aria-invalid="error ? 'true' : 'false'"
        :aria-describedby="error ? `${id}-error` : undefined"
        :class="inputClass"
        @input="handleInput"
        @blur="$emit('blur', $event)"
        @focus="$emit('focus', $event)"
      />
      <Icon
        v-if="trailingIcon"
        :name="trailingIcon"
        size="sm"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none"
      />
    </div>
    <p v-if="error" :id="`${id}-error`" class="mt-1.5 text-sm text-error-500" role="alert">
      {{ error }}
    </p>
    <p v-if="hint && !error" class="mt-1.5 text-sm text-surface-500">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';

interface Props {
  modelValue: string;
  id?: string;
  label?: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  required?: boolean;
  error?: string;
  hint?: string;
  leadingIcon?: string;
  trailingIcon?: string;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  readonly: false,
  required: false,
  class: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  blur: [event: FocusEvent];
  focus: [event: FocusEvent];
}>();

const id = props.id || `input-${Math.random().toString(36).slice(2, 9)}`;

const paddingClasses: Record<string, string> = {
  both: 'pl-10 pr-10 py-2.5',
  leading: 'pl-10 pr-4 py-2.5',
  trailing: 'pl-4 pr-10 py-2.5',
  none: 'pl-4 pr-4 py-2.5',
};

const inputClass = computed(() => {
  const base = 'w-full rounded-lg border bg-white text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200 disabled:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-60 readonly:bg-surface-50';
  
  let paddingKey = 'none';
  if (props.leadingIcon && props.trailingIcon) paddingKey = 'both';
  else if (props.leadingIcon) paddingKey = 'leading';
  else if (props.trailingIcon) paddingKey = 'trailing';
  
  const errorClass = props.error ? 'border-error-500 focus:ring-error-500' : 'border-surface-300';
  
  return `${base} ${paddingClasses[paddingKey]} ${errorClass} ${props.class}`;
});

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
}
</script>