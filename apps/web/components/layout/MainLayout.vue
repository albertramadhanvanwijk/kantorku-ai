<template>
  <div class="min-h-screen bg-surface-50">
    <Sidebar
      :is-mobile-open="isMobileSidebarOpen"
      :user-name="userName"
      :user-role="userRole"
      @update:isMobileOpen="isMobileSidebarOpen = $event"
      @toggleCollapse="toggleSidebarCollapse"
    />

    <div
      :class="[
        'min-h-screen transition-all duration-300 ease-out',
        isSidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64',
      ]"
    >
      <Header
        :is-sidebar-collapsed="isSidebarCollapsed"
        :user-name="userName"
        :user-role="userRole"
        :user-email="userEmail"
        @toggleMobileSidebar="isMobileSidebarOpen = true"
        @toggleSidebarCollapse="toggleSidebarCollapse"
      />

      <main
        :class="[
          'pt-4 pb-8 transition-all duration-300',
          isSidebarCollapsed ? 'lg:pl-4 lg:pr-4' : 'lg:pl-6 lg:pr-6',
        ]"
        class="px-4 sm:px-6"
      >
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Sidebar from './Sidebar.vue';
import Header from './Header.vue';

const isSidebarCollapsed = ref(false);
const isMobileSidebarOpen = ref(false);

const userName = 'Founder';
const userRole = 'Head Trader & Editor-in-Chief';
const userEmail = 'founder@kantorku.ai';

function toggleSidebarCollapse() {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
}
</script>