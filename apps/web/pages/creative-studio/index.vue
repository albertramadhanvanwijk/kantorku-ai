<template>
  <MainLayout>
    <template #default>
      <DepartmentPlaceholder
        title="Creative Studio"
        description="Carousel generation, template engine, brand assets, CTA/promotion"
        icon="Palette"
        color="pink"
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
  { icon: 'Layout', title: 'Template Engine', description: 'Category-specific carousel templates' },
  { icon: 'Palette', title: 'Visual Design', description: 'Slide-by-slide carousel creation' },
  { icon: 'Image', title: 'Brand Assets', description: 'Logos, colors, typography, watermarks' },
  { icon: 'MousePointer2', title: 'CTA System', description: 'Multi-CTA and promotion management' },
];

const departmentAgents = [
  { name: 'Creative Director', role: 'Carousel Design & Layout', status: 'idle' as const, currentTask: null },
  { name: 'Template Engineer', role: 'Template System Maintenance', status: 'idle' as const, currentTask: null },
  { name: 'Brand Guardian', role: 'Brand & Promotion Compliance', status: 'idle' as const, currentTask: null },
];
</script>