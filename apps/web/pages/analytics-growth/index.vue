<template>
  <MainLayout>
    <template #default>
      <DepartmentPlaceholder
        title="Analytics & Growth"
        description="TikTok CSV import, analytics, content intelligence, experimentation"
        icon="BarChart3"
        color="cyan"
        :features="features"
        :agents="departmentAgents"
      />
    </template>
  </MainLayout>
</template>

<script setup lang="ts">
import MainLayout from '../../components/layout/MainLayout.vue';
import DepartmentPlaceholder from '../../components/office/DepartmentPlaceholder.vue';

const features = [
  { icon: 'Upload', title: 'CSV Import', description: 'Import TikTok Studio exports' },
  { icon: 'BarChart3', title: 'Performance Dashboard', description: 'Content and account metrics' },
  { icon: 'Lightbulb', title: 'Content Intelligence', description: 'AI-powered performance insights' },
  { icon: 'FlaskConical', title: 'Experiments', description: 'A/B testing and optimization' },
];

const departmentAgents = [
  { name: 'Analytics Agent', role: 'TikTok Analytics Processing', status: 'idle' as const, currentTask: null },
  { name: 'Growth Analyst', role: 'Content Performance Intelligence', status: 'idle' as const, currentTask: null },
  { name: 'Experiment Agent', role: 'A/B Testing & Experiments', status: 'idle' as const, currentTask: null },
];
</script>