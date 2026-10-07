<template>
  <MainLayout>
    <template #default>
      <DepartmentPlaceholder
        title="Research Office"
        description="Web research, source verification, market intelligence"
        icon="Search"
        color="blue"
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
  { icon: 'Globe', title: 'Web Research', description: 'Automated web search and content extraction' },
  { icon: 'ShieldCheck', title: 'Source Verification', description: 'Cross-reference and validate sources' },
  { icon: 'TrendingUp', title: 'Market Intelligence', description: 'Monitor market news and sentiment' },
  { icon: 'FileText', title: 'Report Generation', description: 'Compile research into structured reports' },
];

const departmentAgents = [
  { name: 'Research Lead', role: 'Web & Market Research', status: 'idle' as const, currentTask: null },
  { name: 'News Verifier', role: 'Source Verification & Fact Check', status: 'idle' as const, currentTask: null },
];
</script>