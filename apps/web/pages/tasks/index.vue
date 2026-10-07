<template>
  <MainLayout>
    <template #default>
      <DepartmentPlaceholder
        title="Task Center"
        description="Jobs, status, approvals, retries, history, workflow management"
        icon="ClipboardList"
        color="rose"
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
  { icon: 'ClipboardList', title: 'Job Queue', description: 'Monitor and manage workflow jobs' },
  { icon: 'RotateCcw', title: 'Retries & Recovery', description: 'Automatic and manual retry handling' },
  { icon: 'History', title: 'Execution History', description: 'Full audit trail of all tasks' },
  { icon: 'CheckCircle2', title: 'Approval Tracking', description: 'Track human approval status' },
];

const departmentAgents = [
  { name: 'Task Manager', role: 'Workflow & Job Coordination', status: 'idle' as const, currentTask: null },
];
</script>