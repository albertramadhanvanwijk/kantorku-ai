<template>
  <MainLayout>
    <template #default>
      <div class="space-y-6 animate-fade-in">
        <!-- Page Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-surface-900">AI Employees</h1>
            <p class="text-surface-500 mt-1">Manage and monitor all AI agents across departments</p>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="primary">
              <Icon name="Plus" size="sm" />
              Add Agent
            </Button>
          </div>
        </div>

        <!-- Department Filter -->
        <div class="flex flex-wrap gap-2">
          <Button
            v-for="dept in departments"
            :key="dept.id"
            :variant="selectedDepartment === dept.id ? 'primary' : 'outline'"
            size="sm"
            @click="selectedDepartment = dept.id"
            :class="`border-${dept.color}-200 text-${dept.color}-700 hover:bg-${dept.color}-50`"
          >
            <Icon :name="dept.icon" size="xs" />
            {{ dept.label }}
          </Button>
        </div>

        <!-- Agents Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card
            v-for="agent in filteredAgents"
            :key="agent.id"
            :hover="true"
            class="p-4"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3">
                <div :class="['w-12 h-12 rounded-xl flex items-center justify-center', `bg-${agent.departmentColor}-100`]">
                  <Icon :name="agent.icon" size="md" :class="`text-${agent.departmentColor}-600`" />
                </div>
                <div>
                  <h4 class="font-medium text-surface-900">{{ agent.name }}</h4>
                  <p class="text-sm text-surface-500">{{ agent.role }}</p>
                </div>
              </div>
              <Badge :variant="statusVariant(agent.status)" :dot="true" size="sm">
                {{ statusLabel(agent.status) }}
              </Badge>
            </div>
            
            <div v-if="agent.currentTask" class="mt-3 p-3 bg-surface-50 rounded-lg">
              <p class="text-xs text-surface-500 mb-1">Current Task</p>
              <p class="text-sm text-surface-900">{{ agent.currentTask }}</p>
              <div class="mt-2 h-1.5 bg-surface-200 rounded-full overflow-hidden">
                <div class="h-full bg-brand-500 transition-all duration-500" :style="{ width: `${agent.progress}%` }" />
              </div>
              <p class="text-xs text-surface-500 mt-1 text-right">{{ agent.progress }}% complete</p>
            </div>
            
            <div class="flex items-center justify-between mt-4 pt-3 border-t border-surface-100">
              <Badge :variant="agent.departmentColor as any" size="sm">
                {{ departmentLabel(agent.department) }}
              </Badge>
              <div class="flex gap-1">
                <Button variant="ghost" size="sm" @click="viewAgent(agent)">
                  <Icon name="Eye" size="xs" />
                </Button>
                <Button variant="ghost" size="sm" @click="configureAgent(agent)">
                  <Icon name="Settings" size="xs" />
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <!-- Empty State -->
        <div v-if="filteredAgents.length === 0" class="text-center py-12">
          <Icon name="Filter" size="xl" class="text-surface-300 mx-auto mb-2" />
          <p class="text-sm text-surface-500">No agents in this department</p>
        </div>

        <!-- Agent Capabilities & Cost (Placeholder) -->
        <Card variant="outlined" class="border-surface-200">
          <h3 class="font-semibold text-surface-900 mb-4">Agent Capabilities & Cost Monitoring (Phase 2+)</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div class="p-3 bg-surface-50 rounded-lg">
              <p class="font-medium text-surface-700 mb-2">Model Routing</p>
              <p class="text-surface-500">9Router integration with cost-aware routing policies</p>
            </div>
            <div class="p-3 bg-surface-50 rounded-lg">
              <p class="font-medium text-surface-700 mb-2">Usage Tracking</p>
              <p class="text-surface-500">Per-agent token usage, latency, and cost metrics</p>
            </div>
            <div class="p-3 bg-surface-50 rounded-lg">
              <p class="font-medium text-surface-700 mb-2">Guardrails</p>
              <p class="text-surface-500">Financial safety, output validation, fallback models</p>
            </div>
          </div>
        </Card>
      </div>
    </template>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { departments } from '../../components/layout/navigation';
import MainLayout from '../../components/layout/MainLayout.vue';
import Card from '../../components/ui/Card.vue';
import Badge from '../../components/ui/Badge.vue';
import Button from '../../components/ui/Button.vue';
import Icon from '../../components/ui/Icon.vue';

interface Agent {
  id: string;
  name: string;
  role: string;
  department: string;
  departmentColor: string;
  icon: string;
  status: 'active' | 'busy' | 'idle' | 'offline' | 'error';
  currentTask?: string;
  progress?: number;
}

const allAgents: Agent[] = [
  { id: '1', name: 'AI COO', role: 'Orchestrator & Workflow Manager', department: 'hq', departmentColor: 'brand', icon: 'LayoutDashboard', status: 'active', currentTask: 'Coordinating content pipeline', progress: 65 },
  { id: '2', name: 'Research Lead', role: 'Web & Market Research', department: 'research', departmentColor: 'blue', icon: 'Search', status: 'idle' },
  { id: '3', name: 'News Verifier', role: 'Source Verification & Fact Check', department: 'research', departmentColor: 'blue', icon: 'ShieldCheck', status: 'idle' },
  { id: '4', name: 'Trading Analyst', role: 'Multi-Chart Technical Analysis', department: 'trading-intelligence', departmentColor: 'emerald', icon: 'BarChart3', status: 'busy', currentTask: 'Analyzing ES H4 structure', progress: 40 },
  { id: '5', name: 'Journal Agent', role: 'Trade Journal Processing', department: 'trading-intelligence', departmentColor: 'emerald', icon: 'BookOpen', status: 'idle' },
  { id: '6', name: 'Outlook Agent', role: 'Market Outlook Generation', department: 'trading-intelligence', departmentColor: 'emerald', icon: 'TrendingUp', status: 'idle' },
  { id: '7', name: 'Content Strategist', role: 'Content Strategy & Ideation', department: 'content-studio', departmentColor: 'violet', icon: 'Lightbulb', status: 'active', currentTask: 'Generating hooks for Q4 content', progress: 30 },
  { id: '8', name: 'Hook Specialist', role: 'Hook & Angle Generation', department: 'content-studio', departmentColor: 'violet', icon: 'Target', status: 'idle' },
  { id: '9', name: 'Copywriter', role: 'Script & Caption Writing', department: 'content-studio', departmentColor: 'violet', icon: 'PenTool', status: 'idle' },
  { id: '10', name: 'Creative Director', role: 'Carousel Design & Layout', department: 'creative-studio', departmentColor: 'pink', icon: 'Palette', status: 'busy', currentTask: 'Rendering 5 slides', progress: 75 },
  { id: '11', name: 'Template Engineer', role: 'Template System Maintenance', department: 'creative-studio', departmentColor: 'pink', icon: 'Layout', status: 'idle' },
  { id: '12', name: 'Brand Guardian', role: 'Brand & Promotion Compliance', department: 'creative-studio', departmentColor: 'pink', icon: 'Shield', status: 'idle' },
  { id: '13', name: 'Fact Checker', role: 'Financial Safety & Accuracy', department: 'qa-compliance', departmentColor: 'orange', icon: 'CheckCircle2', status: 'active', currentTask: 'Verifying trade claims', progress: 50 },
  { id: '14', name: 'Visual QA', role: 'Visual Quality Assurance', department: 'qa-compliance', departmentColor: 'orange', icon: 'Eye', status: 'idle' },
  { id: '15', name: 'Analytics Agent', role: 'TikTok Analytics Processing', department: 'analytics-growth', departmentColor: 'cyan', icon: 'BarChart3', status: 'idle' },
  { id: '16', name: 'Growth Analyst', role: 'Content Performance Intelligence', department: 'analytics-growth', departmentColor: 'cyan', icon: 'TrendingUp', status: 'idle' },
  { id: '17', name: 'Experiment Agent', role: 'A/B Testing & Experiments', department: 'analytics-growth', departmentColor: 'cyan', icon: 'FlaskConical', status: 'idle' },
  { id: '18', name: 'Knowledge Curator', role: 'Trading DNA & Brand Voice', department: 'knowledge', departmentColor: 'indigo', icon: 'Brain', status: 'active', currentTask: 'Updating risk philosophy', progress: 20 },
  { id: '19', name: 'Memory Agent', role: 'Historical Content Retrieval', department: 'knowledge', departmentColor: 'indigo', icon: 'Archive', status: 'idle' },
  { id: '20', name: 'Task Manager', role: 'Workflow & Job Coordination', department: 'tasks', departmentColor: 'rose', icon: 'ClipboardList', status: 'active', currentTask: 'Managing 5 active workflows', progress: 80 },
  { id: '21', name: 'Cost Monitor', role: '9Router Usage & Budget Tracking', department: 'hq', departmentColor: 'brand', icon: 'DollarSign', status: 'idle' },
];

const selectedDepartment = ref('all');

const filteredAgents = computed(() => {
  if (selectedDepartment.value === 'all') return allAgents;
  return allAgents.filter(a => a.department === selectedDepartment.value);
});

function statusVariant(status: Agent['status']): 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand' {
  switch (status) {
    case 'active': return 'success';
    case 'busy': return 'warning';
    case 'idle': return 'neutral';
    case 'offline': return 'neutral';
    case 'error': return 'error';
    default: return 'neutral';
  }
}

function statusLabel(status: Agent['status']): string {
  switch (status) {
    case 'active': return 'Active';
    case 'busy': return 'Busy';
    case 'idle': return 'Idle';
    case 'offline': return 'Offline';
    case 'error': return 'Error';
    default: return 'Unknown';
  }
}

function departmentLabel(deptId: string): string {
  const dept = departments.find(d => d.id === deptId);
  return dept?.label || deptId;
}

function viewAgent(agent: Agent) {
  console.log('View agent:', agent.name);
}

function configureAgent(agent: Agent) {
  console.log('Configure agent:', agent.name);
}
</script>