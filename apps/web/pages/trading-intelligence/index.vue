<template>
  <MainLayout>
    <template #default>
      <DepartmentPlaceholder
        title="Trading Intelligence"
        description="Trading journal, multi-chart analysis, market outlook, trading DNA"
        icon="Brain"
        color="emerald"
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
  { icon: 'BookOpen', title: 'Trading Journal', description: 'Process and analyze trade journal entries' },
  { icon: 'BarChart3', title: 'Multi-Chart Analysis', description: 'Analyze multiple timeframes and instruments' },
  { icon: 'TrendingUp', title: 'Market Outlook', description: 'Generate daily/weekly market outlooks' },
  { icon: 'Brain', title: 'Trading DNA', description: 'Build and maintain your trading framework' },
];

const departmentAgents = [
  { name: 'Trading Analyst', role: 'Multi-Chart Technical Analysis', status: 'idle' as const, currentTask: null },
  { name: 'Journal Agent', role: 'Trade Journal Processing', status: 'idle' as const, currentTask: null },
  { name: 'Outlook Agent', role: 'Market Outlook Generation', status: 'idle' as const, currentTask: null },
];
</script>