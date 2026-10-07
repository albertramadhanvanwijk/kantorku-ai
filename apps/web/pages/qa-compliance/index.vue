<template>
  <MainLayout>
    <template #default>
      <DepartmentPlaceholder
        title="QA & Compliance"
        description="Factual checks, financial-safety checks, visual QA, risk guardrails"
        icon="ShieldCheck"
        color="orange"
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
  { icon: 'CheckCircle2', title: 'Fact Checking', description: 'Verify claims and data accuracy' },
  { icon: 'ShieldAlert', title: 'Financial Safety', description: 'Flag risky financial language' },
  { icon: 'Eye', title: 'Visual QA', description: 'Review carousel designs and layouts' },
  { icon: 'FileCheck', title: 'Approval Workflow', description: 'Manage dual human approval gates' },
];

const departmentAgents = [
  { name: 'Fact Checker', role: 'Financial Safety & Accuracy', status: 'idle' as const, currentTask: null },
  { name: 'Visual QA', role: 'Visual Quality Assurance', status: 'idle' as const, currentTask: null },
];
</script>