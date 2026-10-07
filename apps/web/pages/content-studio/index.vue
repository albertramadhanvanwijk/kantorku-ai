<template>
  <MainLayout>
    <template #default>
      <DepartmentPlaceholder
        title="Content Studio"
        description="Ideas, strategy, scripts, hooks, captions, content pipeline"
        icon="FileText"
        color="violet"
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
  { icon: 'Lightbulb', title: 'Content Strategy', description: 'Plan content calendar and campaigns' },
  { icon: 'Target', title: 'Hook Generation', description: 'Create compelling hooks and angles' },
  { icon: 'PenTool', title: 'Script Writing', description: 'Write scripts, captions, and copy' },
  { icon: 'GitBranch', title: 'Pipeline Management', description: 'Track content from idea to publication' },
];

const departmentAgents = [
  { name: 'Content Strategist', role: 'Content Strategy & Ideation', status: 'idle' as const, currentTask: null },
  { name: 'Hook Specialist', role: 'Hook & Angle Generation', status: 'idle' as const, currentTask: null },
  { name: 'Copywriter', role: 'Script & Caption Writing', status: 'idle' as const, currentTask: null },
];
</script>