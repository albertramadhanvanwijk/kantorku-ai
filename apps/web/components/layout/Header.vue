<template>
  <header class="sticky top-0 z-30 bg-white/80 backdrop-blur-sm border-b border-surface-200">
    <div class="flex items-center justify-between h-16 px-4 lg:px-6">
      <!-- Left: Mobile menu toggle + Page title -->
      <div class="flex items-center gap-4">
        <button
          @click="$emit('toggleMobileSidebar')"
          class="btn-ghost p-2 rounded-lg lg:hidden"
          aria-label="Toggle menu"
        >
          <Icon name="Menu" size="md" />
        </button>
        <button
          @click="$emit('toggleSidebarCollapse')"
          class="btn-ghost p-2 rounded-lg hidden lg:flex"
          aria-label="Toggle sidebar"
        >
          <Icon :name="isSidebarCollapsed ? 'ChevronRight' : 'ChevronLeft'" size="md" />
        </button>
        <div class="hidden sm:block">
          <h1 class="font-semibold text-surface-900">{{ pageTitle }}</h1>
          <p v-if="pageDescription" class="text-sm text-surface-500">{{ pageDescription }}</p>
        </div>
      </div>

      <!-- Center: Search / Command palette (future) -->
      <div class="flex-1 max-w-xl mx-4 hidden md:flex">
        <div class="relative w-full">
          <Icon name="Search" size="sm" class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="search"
            placeholder="Search or ask AI COO... (⌘K)"
            class="input pl-10 pr-4 py-2 bg-surface-50 border-surface-200 hover:border-surface-300 focus:bg-white"
            aria-label="Search or ask AI COO"
          />
          <kbd class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 rounded bg-surface-100 text-surface-500 font-mono hidden sm:inline-flex">
            ⌘K
          </kbd>
        </div>
      </div>

      <!-- Right: Notifications, User menu -->
      <div class="flex items-center gap-2">
        <!-- Notification bell -->
        <button class="btn-ghost p-2 rounded-lg relative" aria-label="Notifications">
          <Icon name="Bell" size="md" />
          <span class="absolute top-1 right-1 w-2 h-2 bg-error-500 rounded-full" />
        </button>

        <!-- User avatar dropdown -->
        <div class="relative">
          <button
            @click="toggleUserMenu"
            class="btn-ghost p-1.5 rounded-lg flex items-center gap-2"
            aria-label="User menu"
            :aria-expanded="userMenuOpen"
          >
            <div class="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
              <span class="text-sm font-medium text-brand-700">{{ userInitials }}</span>
            </div>
            <span class="hidden md:inline-flex flex-col items-end">
              <span class="text-sm font-medium text-surface-900">{{ userName }}</span>
              <span class="text-[11px] text-surface-500">{{ userRole }}</span>
            </span>
            <Icon name="ChevronDown" size="sm" class="hidden md:inline-block text-surface-400" />
          </button>

          <Teleport to="body">
            <div
              v-show="userMenuOpen"
              class="fixed right-4 top-20 z-50 w-56 origin-top-right animate-scale-in"
              @click.outside="closeUserMenu"
            >
              <div class="card shadow-strong border-surface-200 overflow-hidden">
                <div class="px-4 py-3 border-b border-surface-200">
                  <p class="font-medium text-surface-900">{{ userName }}</p>
                  <p class="text-sm text-surface-500">{{ userEmail }}</p>
                </div>
                <nav class="py-2">
                  <RouterLink
                    to="/settings"
                    class="flex items-center gap-3 px-4 py-2.5 text-sm text-surface-600 hover:bg-surface-50 hover:text-surface-900"
                  >
                    <Icon name="Settings" size="sm" />
                    Settings
                  </RouterLink>
                  <RouterLink
                    to="/settings"
                    class="flex items-center gap-3 px-4 py-2.5 text-sm text-surface-600 hover:bg-surface-50 hover:text-surface-900"
                  >
                    <Icon name="User" size="sm" />
                    Profile
                  </RouterLink>
                  <hr class="my-2 border-surface-200" />
                  <button
                    @click="handleLogout"
                    class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-error-500 hover:bg-red-50"
                  >
                    <Icon name="LogOut" size="sm" />
                    Sign out
                  </button>
                </nav>
              </div>
            </div>
          </Teleport>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '../ui/Icon.vue';

interface Props {
  isSidebarCollapsed: boolean;
  userName?: string;
  userRole?: string;
  userEmail?: string;
}

const props = withDefaults(defineProps<Props>(), {
  userName: 'Founder',
  userRole: 'Head Trader & Editor-in-Chief',
  userEmail: 'founder@kantorku.ai',
});

const emit = defineEmits<{
  toggleMobileSidebar: [];
  toggleSidebarCollapse: [];
}>();

const route = useRoute();
const userMenuOpen = ref(false);

const userInitials = computed(() => {
  return props.userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
});

const pageTitle = computed(() => {
  const titles: Record<string, string> = {
    '/hq': 'HQ / Command Center',
    '/research': 'Research Office',
    '/trading-intelligence': 'Trading Intelligence',
    '/content-studio': 'Content Studio',
    '/creative-studio': 'Creative Studio',
    '/qa-compliance': 'QA & Compliance',
    '/analytics-growth': 'Analytics & Growth',
    '/knowledge': 'Knowledge Center',
    '/tasks': 'Task Center',
    '/ai-employees': 'AI Employees',
    '/source-room': 'Source Room',
    '/settings': 'Settings',
  };
  // Check for dynamic routes
  for (const [path, title] of Object.entries(titles)) {
    if (route.path === path || route.path.startsWith(path + '/')) {
      return title;
    }
  }
  return 'KantorKu-AI';
});

const pageDescription = computed(() => {
  const descriptions: Record<string, string> = {
    '/hq': 'Overview of all departments, tasks, and AI activity',
    '/research': 'Web research, source verification, market intelligence',
    '/trading-intelligence': 'Trading journal, multi-chart analysis, market outlook',
    '/content-studio': 'Content pipeline, scripts, hooks, campaign management',
    '/creative-studio': 'Carousel templates, brand assets, visual design',
    '/qa-compliance': 'Fact-checking, risk review, visual QA, approvals',
    '/analytics-growth': 'TikTok analytics, content performance, experiments',
    '/knowledge': 'Trading DNA, brand voice, historical content memory',
    '/tasks': 'Workflow jobs, approvals, retries, execution history',
    '/ai-employees': 'Agent status, capabilities, cost monitoring',
    '/source-room': 'Upload, organize, and manage creator materials',
    '/settings': 'Account, integrations, brand, preferences',
  };
  // Check for dynamic routes
  for (const [path, desc] of Object.entries(descriptions)) {
    if (route.path === path || route.path.startsWith(path + '/')) {
      return desc;
    }
  }
  return '';
});

function toggleUserMenu() {
  userMenuOpen.value = !userMenuOpen.value;
}

function closeUserMenu() {
  userMenuOpen.value = false;
}

function handleLogout() {
  userMenuOpen.value = false;
  // TODO: Implement logout logic
  console.log('Logout clicked');
}
</script>