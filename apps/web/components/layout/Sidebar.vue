<template>
  <aside
    :class="[
      'fixed inset-y-0 left-0 z-40 bg-white border-r border-surface-200 transition-all duration-300 ease-out',
      'flex flex-col',
      isCollapsed ? 'w-16' : 'w-64',
      isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
    ]"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- Logo / Brand -->
    <div class="flex items-center justify-between h-16 px-4 border-b border-surface-200">
      <div class="flex items-center gap-3 min-w-0" v-show="!isCollapsed">
        <div class="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
          <Icon name="Building2" size="md" class="text-white" />
        </div>
        <div class="min-w-0">
          <h1 class="font-semibold text-surface-900 truncate">KantorKu-AI</h1>
          <p class="text-[10px] text-surface-500 truncate">Command Center</p>
        </div>
      </div>
      <div v-show="isCollapsed" class="flex items-center justify-center">
        <div class="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
          <Icon name="Building2" size="md" class="text-white" />
        </div>
      </div>
      <button
        v-show="!isCollapsed"
        @click="toggleCollapse"
        class="btn-ghost p-1.5 rounded-lg lg:hidden"
        aria-label="Collapse sidebar"
      >
        <Icon name="ChevronLeft" size="sm" />
      </button>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto p-3 space-y-1" role="navigation" aria-label="Main navigation">
      <template v-for="item in mainNavigation" :key="item.path">
        <RouterLink
          :to="item.path"
          :class="[
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
            'relative overflow-hidden',
            isActive(item.path)
              ? 'bg-brand-50 text-brand-700'
              : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900',
            isCollapsed ? 'justify-center px-2' : 'justify-start',
          ]"
          :title="isCollapsed ? item.label : undefined"
          :aria-current="isActive(item.path) ? 'page' : undefined"
        >
          <Icon :name="item.icon" size="md" class="flex-shrink-0" />
          <span v-show="!isCollapsed" class="truncate">{{ item.label }}</span>
          <span
            v-if="item.badge && !isCollapsed"
            class="ml-auto px-2 py-0.5 text-[10px] font-medium rounded-full bg-brand-100 text-brand-700"
          >
            {{ item.badge }}
          </span>
          <!-- Active indicator -->
          <div
            v-if="isActive(item.path) && !isCollapsed"
            class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-brand-600 rounded-r-full"
          />
        </RouterLink>
      </template>
    </nav>

    <!-- Collapsed toggle button (when collapsed) -->
    <button
      v-show="isCollapsed"
      @click="toggleCollapse"
      class="mx-2 mb-4 btn-ghost p-1.5 rounded-lg w-full justify-center"
      aria-label="Expand sidebar"
    >
      <Icon name="ChevronRight" size="sm" />
    </button>

    <!-- User / Status area (bottom) -->
    <div class="p-3 border-t border-surface-200" v-show="!isCollapsed">
      <div class="flex items-center gap-3 px-2 py-2 rounded-lg bg-surface-50">
        <div class="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
          <span class="text-sm font-medium text-brand-700">{{ userInitials }}</span>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-surface-900 truncate">{{ userName }}</p>
          <p class="text-[11px] text-surface-500 truncate">{{ userRole }}</p>
        </div>
      </div>
    </div>
  </aside>

  <!-- Mobile overlay -->
  <div
    v-if="isMobileOpen"
    class="fixed inset-0 z-30 bg-black/50 lg:hidden"
    @click="closeMobile"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, toRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { mainNavigation } from './navigation';
import Icon from '../ui/Icon.vue';

interface Props {
  isMobileOpen: boolean;
  userName?: string;
  userRole?: string;
}

const props = withDefaults(defineProps<Props>(), {
  isMobileOpen: false,
  userName: 'Founder',
  userRole: 'Head Trader & Editor-in-Chief',
});

const emit = defineEmits<{
  'update:isMobileOpen': [value: boolean];
  toggleCollapse: [];
}>();

const route = useRoute();
const router = useRouter();

const isCollapsed = ref(false);

const userInitials = computed(() => {
  const name = props.userName || 'User';
  return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
});

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + '/');
}

function handleMouseEnter() {
  if (isCollapsed.value) {
    emit('toggleCollapse');
  }
}

function handleMouseLeave() {
  // Keep expanded when user hovers, collapse handled by toggle
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
  emit('toggleCollapse');
}

function closeMobile() {
  emit('update:isMobileOpen', false);
}

// Watch for route changes to close mobile sidebar
watch(() => route.path, () => {
  if (isMobileOpen.value) {
    emit('update:isMobileOpen', false);
  }
});

const isMobileOpen = toRef(props, 'isMobileOpen');
</script>