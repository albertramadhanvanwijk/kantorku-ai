<template>
  <Card class="h-full">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-surface-900">{{ title }}</h3>
        <div class="flex items-center gap-2">
          <Badge variant="brand" size="sm">{{ totalProjects }} projects</Badge>
          <Button variant="ghost" size="sm" @click="$emit('new-project')">
            <Icon name="Plus" size="xs" />
            New
          </Button>
        </div>
      </div>
    </template>
    
    <!-- Pipeline Kanban -->
    <div class="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
      <template v-for="stage in stages" :key="stage.key">
        <div class="flex-shrink-0 w-64 lg:w-72">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full" :style="{ backgroundColor: stageColor(stage.key) }" />
              <h4 class="font-medium text-sm text-surface-700">{{ stage.label }}</h4>
            </div>
            <Badge variant="neutral" size="sm">{{ stageItems(stage.key).length }}</Badge>
          </div>
          <div class="space-y-2 min-h-[200px] rounded-lg bg-surface-50/50 p-2" 
               @dragover.prevent 
               @drop="handleDrop($event, stage.key)">
            <template v-if="stageItems(stage.key).length === 0">
              <div class="text-center py-8 text-surface-400">
                <Icon name="PlusCircle" size="lg" class="mx-auto mb-1 opacity-50" />
                <p class="text-xs">Drop here</p>
              </div>
            </template>
            <div 
              v-for="project in stageItems(stage.key)" 
              :key="project.id"
              class="p-3 bg-white rounded-lg border border-surface-200 shadow-sm cursor-move hover:shadow-md transition-shadow"
              draggable="true"
              @dragstart="handleDragStart($event, project)"
              @dragend="handleDragEnd"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <h5 class="font-medium text-sm text-surface-900 truncate">{{ project.title }}</h5>
                  <p class="text-[11px] text-surface-500 truncate mt-0.5">{{ project.category }}</p>
                </div>
                <Badge :variant="project.statusVariant" size="sm" :dot="true">
                  {{ project.status }}
                </Badge>
              </div>
              <div class="flex items-center gap-2 mt-2 pt-2 border-t border-surface-100">
                <div class="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                  <span class="text-[10px] font-medium text-brand-700">{{ project.assigneeInitials }}</span>
                </div>
                <span class="text-[11px] text-surface-500 flex-1 truncate">{{ project.updatedAt }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
    
    <!-- Empty State (when no stages) -->
    <div v-if="stages.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
      <Icon name="Kanban" size="xl" class="text-surface-300 mb-3" />
      <p class="text-sm text-surface-500">No pipeline stages configured</p>
      <Button variant="primary" size="sm" class="mt-3" @click="$emit('configure')">
        Configure Pipeline
      </Button>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Card from '../ui/Card.vue';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';

interface PipelineProject {
  id: string;
  title: string;
  category: string;
  status: string;
  statusVariant: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand';
  assignee: string;
  assigneeInitials: string;
  updatedAt: string;
  stage: string;
}

interface PipelineStage {
  key: string;
  label: string;
  color: string;
}

interface Props {
  title: string;
  projects: PipelineProject[];
  stages?: PipelineStage[];
}

const props = withDefaults(defineProps<Props>(), {
  stages: () => [
    { key: 'idea', label: 'Idea', color: '#9ca3af' },
    { key: 'research', label: 'Research', color: '#3b82f6' },
    { key: 'drafting', label: 'Drafting', color: '#8b5cf6' },
    { key: 'review', label: 'Review', color: '#f59e0b' },
    { key: 'approved', label: 'Approved', color: '#22c55e' },
    { key: 'design', label: 'Design', color: '#ec4899' },
    { key: 'ready', label: 'Ready to Upload', color: '#0ea5e9' },
  ],
});

const emit = defineEmits<{
  'new-project': [];
  configure: [];
  'stage-change': [project: PipelineProject, newStage: string];
}>();

const totalProjects = computed(() => props.projects.length);

const stages = computed(() => props.stages || [
  { key: 'idea', label: 'Idea', color: '#9ca3af' },
  { key: 'research', label: 'Research', color: '#3b82f6' },
  { key: 'drafting', label: 'Drafting', color: '#8b5cf6' },
  { key: 'review', label: 'Review', color: '#f59e0b' },
  { key: 'approved', label: 'Approved', color: '#22c55e' },
  { key: 'design', label: 'Design', color: '#ec4899' },
  { key: 'ready', label: 'Ready to Upload', color: '#0ea5e9' },
]);

function stageColor(key: string): string {
  const stage = stages.value.find(s => s.key === key);
  return stage?.color || '#9ca3af';
}

function stageItems(stageKey: string): PipelineProject[] {
  return props.projects.filter(p => p.stage === stageKey);
}

let draggedProject: PipelineProject | null = null;

function handleDragStart(event: DragEvent, project: PipelineProject) {
  draggedProject = project;
  event.dataTransfer?.setData('text/plain', project.id);
  event.dataTransfer!.effectAllowed = 'move';
  (event.target as HTMLElement | null)?.classList.add('opacity-50');
}

function handleDragEnd(event: DragEvent) {
  (event.target as HTMLElement | null)?.classList.remove('opacity-50');
  draggedProject = null;
}

function handleDrop(event: DragEvent, stageKey: string) {
  event.preventDefault();
  if (draggedProject && draggedProject.stage !== stageKey) {
    emit('stage-change', draggedProject, stageKey);
  }
  draggedProject = null;
}
</script>