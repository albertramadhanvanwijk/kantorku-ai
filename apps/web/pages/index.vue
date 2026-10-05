<template>
  <div class="min-h-screen flex items-center justify-center bg-surface-50">
    <div class="text-center">
      <div class="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center mx-auto mb-4">
        <Icon name="Building2" size="xl" class="text-brand-600" />
      </div>
      <h1 class="text-3xl font-bold text-surface-900 mb-2">KantorKu-AI</h1>
      <p class="text-surface-500 mb-6">Personal AI Office for trading creators</p>
      <Button variant="primary" size="lg" @click="goToHQ">
        <Icon name="ArrowRight" size="sm" />
        Enter Command Center
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { navigateTo } from 'nuxt/app';
import Button from '../components/ui/Button.vue';
import Icon from '../components/ui/Icon.vue';

function goToHQ() {
  navigateTo('/hq');
}
</script>