<template>
  <MainLayout>
    <template #default>
      <DepartmentPlaceholder
        title="Knowledge Center"
        description="Personal profile, trading DNA, brand voice, historical content"
        icon="Library"
        color="indigo"
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
  { icon: 'User', title: 'Trading DNA', description: 'Your trading framework and philosophy' },
  { icon: 'PenTool', title: 'Brand Voice', description: 'Writing style and tone guidelines' },
  { icon: 'History', title: 'Content Memory', description: 'Historical content and anti-repetition' },
  { icon: 'Search', title: 'Semantic Search', description: 'Find relevant knowledge instantly' },
];

const departmentAgents = [
  { name: 'Knowledge Curator', role: 'Trading DNA & Brand Voice', status: 'idle' as const, currentTask: null },
  { name: 'Memory Agent', role: 'Historical Content Retrieval', status: 'idle' as const, currentTask: null },
];
</script>