<template>
  <div class="office-container" ref="containerRef">
    <!-- Office Map Background -->
    <div class="office-map-wrapper" @click="logClickPosition">
      <img
        ref="mapRef"
        src="/kantorku-office-assets/office-map.svg"
        alt="KantorKu-AI Office Map"
        class="office-map"
        @load="onMapLoad"
      />

      <!-- Debug: Hit Area Overlays (visible when debug mode) -->
      <template v-if="debugMode" v-for="dept in departments" :key="dept.id">
        <div
          v-if="dept.hitArea"
          class="dept-hit-area debug-hit-area"
          :style="dept.hitAreaStyle"
          :title="`${dept.label}: ${dept.hitArea.x},${dept.hitArea.y} ${dept.hitArea.width}x${dept.hitArea.height}`"
        >
          <span class="debug-label">{{ dept.label }}</span>
        </div>
      </template>

      <!-- Department Hit Areas (invisible clickable zones over the map) -->
      <template v-for="dept in departments" :key="dept.id">
        <div
          v-if="dept.hitArea"
          class="dept-hit-area"
          :class="{
            'dept-selected': selectedDept?.id === dept.id,
            'dept-hover': hoverDept === dept.id,
          }"
          :style="dept.hitAreaStyle"
          @click="selectDepartment(dept)"
          @mouseenter="hoverDept = dept.id"
          @mouseleave="hoverDept = null"
          :title="dept.label"
          role="button"
          tabindex="0"
          @keydown.enter="selectDepartment(dept)"
          @keydown.space.prevent="selectDepartment(dept)"
        >
          <!-- Agent Sprites in Room -->
          <div v-if="!isCompact" class="room-agents" :style="dept.agentsContainerStyle">
            <template v-for="(agent, index) in dept.agents" :key="agent.id">
              <img
                v-if="Number(index) < 4"
                :src="`/kantorku-office-assets/${agent.avatar}`"
                :alt="agent.name"
                class="agent-sprite"
                :style="agentPosition(Number(index), dept.agents.length)"
                :title="`${agent.name} (${agent.code})`"
              />
            </template>
            <div
              v-if="dept.agents.length > 4"
              class="agent-sprite agent-more"
              :style="agentPosition(4, dept.agents.length)"
            >
              +{{ dept.agents.length - 4 }}
            </div>
          </div>

          <!-- Status Indicator on Room -->
          <div v-if="!isCompact" class="room-status-indicator" :style="dept.statusIndicatorStyle">
            <img
              :src="`/kantorku-office-assets/status/status-${dept.status}.svg`"
              :alt="statusLabels[dept.status]"
              class="status-icon"
            />
          </div>
        </div>
      </template>
    </div>

    <!-- Selected Department Detail Panel -->
    <div
      v-if="selectedDept && !isCompact"
      class="office-detail-panel animate-slide-up"
      :style="detailPanelStyle"
    >
      <div class="p-4">
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center gap-3">
            <img
              :src="`/kantorku-office-assets/${selectedDept.icon}`"
              :alt="selectedDept.label"
              class="w-10 h-10"
            />
            <div>
              <h3 class="font-semibold text-surface-900">{{ selectedDept.label }}</h3>
              <p class="text-sm text-surface-500">{{ selectedDept.description }}</p>
            </div>
          </div>
          <button
            @click="selectedDept = null"
            class="btn-ghost p-1.5 rounded-lg"
            aria-label="Close detail panel"
          >
            <Icon name="X" size="sm" />
          </button>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="p-3 bg-surface-50 rounded-lg">
            <p class="text-surface-500">Agents</p>
            <p class="font-semibold text-surface-900">{{ selectedDept.agents.length }}</p>
          </div>
          <div class="p-3 bg-surface-50 rounded-lg">
            <p class="text-surface-500">Status</p>
            <Badge
              :variant="statusToBadgeVariant(selectedDept.status)"
              :dot="true"
            >
              {{ statusLabels[selectedDept.status] }}
            </Badge>
          </div>
        </div>
        <button
          class="btn-primary w-full mt-3 text-sm"
          @click="navigateToDepartment(selectedDept)"
        >
          Open Department
        </button>
      </div>
    </div>

    <!-- Compact Mode Legend -->
    <div v-if="isCompact" class="office-legend animate-fade-in">
      <div class="p-3">
        <p class="text-xs font-medium text-surface-600 mb-2 uppercase tracking-wide">Departments</p>
        <div class="space-y-2 max-h-[200px] overflow-y-auto">
          <template v-for="dept in departments" :key="dept.id">
            <button
              @click="selectDepartment(dept)"
              class="w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors hover:bg-surface-100"
              :class="selectedDept?.id === dept.id ? 'bg-brand-50' : ''"
            >
              <img
                :src="`/kantorku-office-assets/${dept.icon}`"
                :alt="dept.label"
                class="w-6 h-6"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-surface-900 truncate">{{ dept.label }}</p>
                <p class="text-[10px] text-surface-500 truncate">{{ dept.description }}</p>
              </div>
              <Badge :variant="statusToBadgeVariant(dept.status)" size="sm" :dot="true" />
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, toRef, nextTick } from 'vue';
import { departments as navDepartments, statusLabels } from '../layout/navigation';
import Icon from '../ui/Icon.vue';
import Badge from '../ui/Badge.vue';

interface NavDepartment {
  id: string;
  label: string;
  icon: string;
  description: string;
  path: string;
  color: string;
  status: 'active' | 'idle' | 'busy' | 'offline';
  agentCount: number;
}

interface ManifestAgent {
  id: string;
  name: string;
  code: string;
  department: string;
  avatar: string;
  sprite: string;
}

interface EnhancedDepartment extends NavDepartment {
  manifestId: string;
  hitArea?: { x: number; y: number; width: number; height: number };
  icon: string;
  agents: ManifestAgent[];
  hitAreaStyle: Record<string, string>;
  agentsContainerStyle: Record<string, string>;
  statusIndicatorStyle: Record<string, string>;
}

interface Props {
  isCompact?: boolean;
  onDepartmentSelect?: (dept: NavDepartment) => void;
}

const props = withDefaults(defineProps<Props>(), {
  isCompact: false,
});

const emit = defineEmits<{
  departmentSelect: [dept: NavDepartment];
}>();

const containerRef = ref<HTMLElement | null>(null);
const mapRef = ref<HTMLImageElement | null>(null);
const selectedDept = ref<EnhancedDepartment | null>(null);
const hoverDept = ref<string | null>(null);
const mapLoaded = ref(false);
const mapNaturalSize = ref({ width: 0, height: 0 });

const isCompact = toRef(props, 'isCompact');

const debugMode = ref(false);

// Department hit areas mapped to the office-map.svg coordinates
// Calibrated for the isometric map (viewBox: 80 0 740 580, main group: translate(354,24) scale(0.8))
const departmentHitAreas: Record<string, { x: number; y: number; width: number; height: number }> = {
  hq: { x: 340, y: 180, width: 100, height: 90 },
  research: { x: 120, y: 80, width: 110, height: 100 },
  trading: { x: 560, y: 80, width: 110, height: 100 },
  content: { x: 80, y: 240, width: 120, height: 90 },
  creative: { x: 600, y: 240, width: 120, height: 90 },
  qa: { x: 130, y: 380, width: 110, height: 80 },
  analytics: { x: 560, y: 380, width: 110, height: 80 },
  knowledge: { x: 220, y: 480, width: 100, height: 70 },
  tasks: { x: 480, y: 480, width: 100, height: 70 },
};

// Agent positions within each room (relative percentages)
const agentRoomPositions = [
  { top: '20%', left: '20%' },
  { top: '20%', left: '65%' },
  { top: '65%', left: '20%' },
  { top: '65%', left: '65%' },
  { top: '50%', left: '50%' }, // for +N indicator
];

// Merge navigation departments with asset manifest data
const departments = computed((): EnhancedDepartment[] => {
  return navDepartments.map(navDept => {
    // Map navigation IDs to manifest IDs
    const manifestIdMap: Record<string, string> = {
      'hq': 'hq',
      'research': 'research',
      'trading-intelligence': 'trading',
      'content-studio': 'content',
      'creative-studio': 'creative',
      'qa-compliance': 'qa',
      'analytics-growth': 'analytics',
      'knowledge': 'knowledge',
      'tasks': 'tasks',
    };

    const manifestId = manifestIdMap[navDept.id] || navDept.id;
    const hitArea = departmentHitAreas[manifestId];

    // Get agents for this department from manifest
    const deptAgents = manifestDepartments.value[manifestId]?.agents || [];

    return {
      ...navDept,
      manifestId,
      hitArea,
      icon: `icons/${manifestId}.svg`,
      agents: deptAgents,
      hitAreaStyle: hitArea ? computeHitAreaStyle(hitArea) : {},
      agentsContainerStyle: hitArea ? computeAgentsContainerStyle(hitArea) : {},
      statusIndicatorStyle: hitArea ? computeStatusIndicatorStyle(hitArea) : {},
    };
  });
});

// Load manifest data
const manifestData = ref<any>(null);
const manifestDepartments = computed(() => {
  if (!manifestData.value) return {};
  const result: Record<string, any> = {};
  for (const dept of manifestData.value.departments) {
    result[dept.id] = dept;
  }
  return result;
});

async function loadManifest() {
  try {
    const res = await fetch('/kantorku-office-assets/manifest.json');
    manifestData.value = await res.json();
  } catch (e) {
    console.error('Failed to load office manifest:', e);
  }
}

function computeHitAreaStyle(area: { x: number; y: number; width: number; height: number }) {
  return {
    left: `${area.x}px`,
    top: `${area.y}px`,
    width: `${area.width}px`,
    height: `${area.height}px`,
  };
}

function computeAgentsContainerStyle(area: { x: number; y: number; width: number; height: number }) {
  return {
    left: `${area.x}px`,
    top: `${area.y}px`,
    width: `${area.width}px`,
    height: `${area.height}px`,
  };
}

function computeStatusIndicatorStyle(area: { x: number; y: number; width: number; height: number }) {
  return {
    left: `${area.x + area.width - 24}px`,
    top: `${area.y + 8}px`,
  };
}

function agentPosition(index: number, total: number) {
  const pos = agentRoomPositions[index] || agentRoomPositions[4];
  return {
    top: pos.top,
    left: pos.left,
    transform: 'translate(-50%, -50%)',
  };
}

function onMapLoad() {
  if (mapRef.value) {
    mapNaturalSize.value = {
      width: mapRef.value.naturalWidth,
      height: mapRef.value.naturalHeight,
    };
    mapLoaded.value = true;
    nextTick(() => {
      // Hit areas are in CSS pixels matching the displayed map size
    });
  }
}

function logClickPosition(event: MouseEvent) {
  if (!debugMode.value || !mapRef.value) return;
  const rect = mapRef.value.getBoundingClientRect();
  const x = Math.round(event.clientX - rect.left);
  const y = Math.round(event.clientY - rect.top);
  console.log(`Click at: x=${x}, y=${y} | Map size: ${rect.width}x${rect.height}`);
}

function selectDepartment(dept: EnhancedDepartment) {
  selectedDept.value = selectedDept.value?.id === dept.id ? null : dept;
  emit('departmentSelect', dept);
  props.onDepartmentSelect?.(dept);
}

function navigateToDepartment(dept: EnhancedDepartment) {
  emit('departmentSelect', dept);
}

function statusToBadgeVariant(status: 'active' | 'idle' | 'busy' | 'offline'): 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand' {
  switch (status) {
    case 'active': return 'success';
    case 'busy': return 'warning';
    case 'idle': return 'neutral';
    case 'offline': return 'neutral';
    default: return 'neutral';
  }
}

const detailPanelStyle = computed(() => {
  if (!selectedDept.value) return {};
  return {
    bottom: '1rem',
    left: '1rem',
    right: '1rem',
    maxWidth: '320px',
  };
});

onMounted(async () => {
  await loadManifest();
  
  // Debug mode toggle: Ctrl+Shift+D
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      debugMode.value = !debugMode.value;
      console.log(`Debug mode: ${debugMode.value ? 'ON' : 'OFF'}`);
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });
});
</script>

<style scoped>
.office-container {
  position: relative;
  width: 100%;
  min-height: 400px;
  background: var(--office-bg, #0B1020);
  border-radius: 12px;
  overflow: hidden;
}

.office-map-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.office-map {
  width: 100%;
  height: 100%;
  min-height: 400px;
  object-fit: cover;
  display: block;
}

.dept-hit-area {
  position: absolute;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 2;
}

.dept-hit-area:hover,
.dept-hit-area:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.4);
}

.dept-selected {
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.6), 0 0 20px rgba(14, 165, 233, 0.2);
}

.dept-hover {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
}

.room-agents {
  position: absolute;
  inset: 8px;
  pointer-events: none;
  z-index: 3;
}

.agent-sprite {
  position: absolute;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s ease;
  image-rendering: pixelated;
}

.agent-sprite:hover {
  transform: translate(-50%, -50%) scale(1.15);
  z-index: 10;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.agent-more {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(0, 0, 0, 0.4);
  border: 2px dashed rgba(255, 255, 255, 0.3);
}

.room-status-indicator {
  position: absolute;
  z-index: 4;
  pointer-events: none;
}

.status-icon {
  width: 20px;
  height: 20px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.office-detail-panel {
  position: absolute;
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.15), 0 8px 16px -8px rgba(0, 0, 0, 0.1);
  border: 1px solid #e5e5e5;
  z-index: 20;
  pointer-events: auto;
  max-width: 320px;
}

.office-legend {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  border: 1px solid #e5e5e5;
  min-width: 200px;
  max-width: 240px;
  z-index: 10;
}

@media (max-width: 768px) {
  .office-container {
    min-height: 300px;
  }

  .office-map {
    min-height: 300px;
  }

  .agent-sprite {
    width: 22px;
    height: 22px;
  }

  .office-detail-panel {
    left: 0.5rem;
    right: 0.5rem;
    bottom: 0.5rem;
    max-width: none;
  }

  .office-legend {
    left: 0.5rem;
    right: 0.5rem;
    bottom: 0.5rem;
    min-width: auto;
    max-width: none;
  }
}

/* Animations */
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-slide-up {
  animation: slideUp 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}

/* Focus visible for accessibility */
.dept-hit-area:focus-visible {
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.8);
}

/* Debug mode styles */
.debug-hit-area {
  background: rgba(14, 165, 233, 0.15) !important;
  border: 2px dashed rgba(14, 165, 233, 0.6) !important;
  box-shadow: none !important;
  z-index: 5;
}

.debug-label {
  position: absolute;
  top: -20px;
  left: 0;
  background: rgba(14, 165, 233, 0.9);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}
</style>