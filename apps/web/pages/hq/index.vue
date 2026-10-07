<template>
  <MainLayout>
    <template #default>
      <div class="space-y-6 animate-fade-in">
        <!-- Page Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-surface-900">HQ / Command Center</h1>
            <p class="text-surface-500 mt-1">Overview of all departments, tasks, and AI activity</p>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="success" size="sm" :dot="true" class="mr-2">
              All Systems Operational
            </Badge>
            <Button variant="secondary" @click="refreshData">
              <Icon name="RefreshCw" size="sm" />
              Refresh
            </Button>
            <Button variant="primary" @click="openNewTask">
              <Icon name="Plus" size="sm" />
              New Task
            </Button>
          </div>
        </div>

        <!-- Key Metrics Row -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Active Workflows"
            :value="metrics.activeWorkflows"
            description="Workflows currently in progress"
            variant="brand"
            status="Running"
            :change="metrics.workflowChange"
            :sparkline="metrics.workflowSparkline"
          />
          <MetricCard
            title="Pending Approvals"
            :value="metrics.pendingApprovals"
            description="Items awaiting your review"
            variant="warning"
            status="Attention"
            :change="metrics.approvalChange"
            :sparkline="metrics.approvalSparkline"
          />
          <MetricCard
            title="Content Projects"
            :value="metrics.contentProjects"
            description="Projects in pipeline this week"
            variant="brand"
            status="Active"
            :change="metrics.contentChange"
            :sparkline="metrics.contentSparkline"
          />
          <MetricCard
            title="AI Agents Active"
            :value="metrics.activeAgents"
            :description="`${metrics.totalAgents} total agents`"
            variant="success"
            status="Online"
            :change="metrics.agentChange"
            :sparkline="metrics.agentSparkline"
          />
        </div>

        <!-- Main Content Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <!-- Left Column: Office View + Market Overview -->
          <div class="lg:col-span-7 space-y-6">
            <!-- 2.5D Office Visualization -->
            <Card class="p-0 overflow-hidden">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold text-surface-900">Office Mode — 2.5D Visualization</h3>
                  <div class="flex items-center gap-2">
                    <label class="flex items-center gap-2 text-sm text-surface-600">
                      <input type="checkbox" v-model="officeCompact" class="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                      Compact
                    </label>
                    <Badge variant="brand" size="sm">{{ departments.length }} Departments</Badge>
                  </div>
                </div>
              </template>
              <OfficeView
                :is-compact="officeCompact"
                @department-select="handleDepartmentSelect"
                class="h-[450px] lg:h-[500px]"
              />
            </Card>

            <!-- Market Overview -->
            <MarketOverview
              title="Market Overview"
              @timeframe-change="handleTimeframeChange"
            />
          </div>

          <!-- Right Column: Activity Feed + Pending Approvals + Pipeline -->
          <div class="lg:col-span-5 space-y-6">
            <!-- AI Activity Feed -->
            <ActivityFeed
              title="AI Activity Feed"
              :activities="recentActivity"
              empty-icon="Bot"
              empty-message="No AI activity yet"
              @view-all="viewAllActivity"
              @clear="clearActivity"
            />

            <!-- Pending Approvals -->
            <PendingApprovals
              title="Pending Approvals"
              :items="pendingApprovals"
              empty-icon="ClipboardCheck"
              empty-message="All caught up!"
              @approve="handleApprove"
              @request-changes="handleRequestChanges"
            />

            <!-- Content Pipeline -->
            <ContentPipeline
              title="Content Pipeline"
              :projects="pipelineProjects"
              @new-project="openNewProject"
              @stage-change="handleStageChange"
            />

            <!-- AI Employee Status -->
            <AIEmployeeStatus
              title="AI Employee Status"
              :agents="aiAgents"
              @view-all="viewAllAgents"
              @view-agent="viewAgent"
              @configure-agent="configureAgent"
            />
          </div>
        </div>
      </div>
    </template>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { departments, statusLabels } from '~/components/layout/navigation';
import MainLayout from '~/components/layout/MainLayout.vue';
import MetricCard from '~/components/ui/MetricCard.vue';
import OfficeView from '~/components/office/OfficeView.vue';
import MarketOverview from '~/components/ui/MarketOverview.vue';
import ActivityFeed from '~/components/ui/ActivityFeed.vue';
import PendingApprovals from '~/components/ui/PendingApprovals.vue';
import ContentPipeline from '~/components/ui/ContentPipeline.vue';
import AIEmployeeStatus from '~/components/ui/AIEmployeeStatus.vue';
import Button from '~/components/ui/Button.vue';
import Badge from '~/components/ui/Badge.vue';
import Icon from '~/components/ui/Icon.vue';

interface MetricData {
  activeWorkflows: number;
  workflowChange: number;
  workflowSparkline: number[];
  pendingApprovals: number;
  approvalChange: number;
  approvalSparkline: number[];
  contentProjects: number;
  contentChange: number;
  contentSparkline: number[];
  activeAgents: number;
  totalAgents: number;
  agentChange: number;
  agentSparkline: number[];
}

const metrics = ref<MetricData>({
  activeWorkflows: 5,
  workflowChange: 12,
  workflowSparkline: [3, 4, 5, 4, 6, 5, 5],
  pendingApprovals: 3,
  approvalChange: -25,
  approvalSparkline: [5, 4, 3, 4, 3, 2, 3],
  contentProjects: 12,
  contentChange: 8,
  contentSparkline: [8, 9, 10, 11, 12, 11, 12],
  activeAgents: 7,
  totalAgents: 21,
  agentChange: 0,
  agentSparkline: [5, 6, 6, 7, 7, 7, 7],
});

const officeCompact = ref(false);

const recentActivity = ref([
  { id: '1', type: 'agent' as const, message: 'Research Agent completed web search for "S&P 500 technical analysis"', timestamp: new Date(Date.now() - 5 * 60 * 1000), badge: { variant: 'success' as const, label: 'Completed' } },
  { id: '2', type: 'workflow' as const, message: 'Content generation workflow started for "Trading Journal: Risk Management"', timestamp: new Date(Date.now() - 15 * 60 * 1000), badge: { variant: 'info' as const, label: 'In Progress' } },
  { id: '3', type: 'approval' as const, message: 'Script approval requested: "Market Outlook: Q4 2024"', timestamp: new Date(Date.now() - 30 * 60 * 1000), badge: { variant: 'warning' as const, label: 'Pending' } },
  { id: '4', type: 'content' as const, message: 'Creative Director generated 5 carousel slides for "Propfirm Education"', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), badge: { variant: 'success' as const, label: 'Completed' } },
  { id: '5', type: 'analytics' as const, message: 'Analytics import completed: 1,247 TikTok posts processed', timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), badge: { variant: 'info' as const, label: 'Completed' } },
  { id: '6', type: 'error' as const, message: 'Trading Analyst failed: Chart image upload timeout', timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000), badge: { variant: 'error' as const, label: 'Failed' } },
  { id: '7', type: 'agent' as const, message: 'Knowledge Agent updated Trading DNA with new risk philosophy entry', timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), badge: { variant: 'success' as const, label: 'Completed' } },
]);

const pendingApprovals = ref([
  { id: '1', type: 'script' as const, title: 'Market Outlook: Daily Analysis', description: 'Review trading thesis and key levels before publication', priority: 'high' as const, assignee: 'Founder', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
  { id: '2', type: 'design' as const, title: 'Carousel: Risk Management Rules', description: 'Visual QA needed for 5-slide educational carousel', priority: 'medium' as const, assignee: 'Editor', createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000) },
  { id: '3', type: 'content' as const, title: 'Campaign: Propfirm Challenge', description: 'Approve promotional CTA and landing page link', priority: 'medium' as const, assignee: 'Founder', createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000) },
]);

const pipelineProjects = ref([
  { id: '1', title: 'Trading Journal: My Worst Trade', category: 'Trading Journal', status: 'In Review', statusVariant: 'warning' as const, assignee: 'Editor', assigneeInitials: 'ED', updatedAt: '2h ago', stage: 'review' },
  { id: '2', title: 'S&P 500 Structure Analysis', category: 'Trading Education', status: 'Drafting', statusVariant: 'info' as const, assignee: 'Analyst', assigneeInitials: 'AN', updatedAt: '4h ago', stage: 'drafting' },
  { id: '3', title: 'Propfirm Evaluation Guide', category: 'Propfirm Education', status: 'Approved', statusVariant: 'success' as const, assignee: 'Founder', assigneeInitials: 'FO', updatedAt: '1d ago', stage: 'approved' },
  { id: '4', title: 'Daily Market Outlook Template', category: 'Market Outlook', status: 'Design', statusVariant: 'brand' as const, assignee: 'Designer', assigneeInitials: 'DE', updatedAt: '3h ago', stage: 'design' },
  { id: '5', title: 'Fed Rate Decision Impact', category: 'Global News', status: 'Research', statusVariant: 'info' as const, assignee: 'Researcher', assigneeInitials: 'RE', updatedAt: '1h ago', stage: 'research' },
  { id: '6', title: 'Psychology: FOMO Management', category: 'Trading Education', status: 'Idea', statusVariant: 'neutral' as const, assignee: 'Strategist', assigneeInitials: 'ST', updatedAt: '6h ago', stage: 'idea' },
]);

const aiAgents = ref([
  { id: '1', name: 'AI COO', role: 'Orchestrator & Workflow Manager', department: 'hq', icon: 'LayoutDashboard', status: 'active' as const, currentTask: 'Coordinating content pipeline', progress: 65 },
  { id: '2', name: 'Research Lead', role: 'Web & Market Research', department: 'research', icon: 'Search', status: 'idle' as const },
  { id: '3', name: 'News Verifier', role: 'Source Verification & Fact Check', department: 'research', icon: 'ShieldCheck', status: 'idle' as const },
  { id: '4', name: 'Trading Analyst', role: 'Multi-Chart Technical Analysis', department: 'trading-intelligence', icon: 'BarChart3', status: 'busy' as const, currentTask: 'Analyzing ES H4 structure', progress: 40 },
  { id: '5', name: 'Journal Agent', role: 'Trade Journal Processing', department: 'trading-intelligence', icon: 'BookOpen', status: 'idle' as const },
  { id: '6', name: 'Outlook Agent', role: 'Market Outlook Generation', department: 'trading-intelligence', icon: 'TrendingUp', status: 'idle' as const },
  { id: '7', name: 'Content Strategist', role: 'Content Strategy & Ideation', department: 'content-studio', icon: 'Lightbulb', status: 'active' as const, currentTask: 'Generating hooks for Q4 content', progress: 30 },
  { id: '8', name: 'Hook Specialist', role: 'Hook & Angle Generation', department: 'content-studio', icon: 'Target', status: 'idle' as const },
  { id: '9', name: 'Copywriter', role: 'Script & Caption Writing', department: 'content-studio', icon: 'PenTool', status: 'idle' as const },
  { id: '10', name: 'Creative Director', role: 'Carousel Design & Layout', department: 'creative-studio', icon: 'Palette', status: 'busy' as const, currentTask: 'Rendering 5 slides', progress: 75 },
  { id: '11', name: 'Template Engineer', role: 'Template System Maintenance', department: 'creative-studio', icon: 'Layout', status: 'idle' as const },
  { id: '12', name: 'Brand Guardian', role: 'Brand & Promotion Compliance', department: 'creative-studio', icon: 'Shield', status: 'idle' as const },
  { id: '13', name: 'Fact Checker', role: 'Financial Safety & Accuracy', department: 'qa-compliance', icon: 'CheckCircle2', status: 'active' as const, currentTask: 'Verifying trade claims', progress: 50 },
  { id: '14', name: 'Visual QA', role: 'Visual Quality Assurance', department: 'qa-compliance', icon: 'Eye', status: 'idle' as const },
  { id: '15', name: 'Analytics Agent', role: 'TikTok Analytics Processing', department: 'analytics-growth', icon: 'BarChart3', status: 'idle' as const },
  { id: '16', name: 'Growth Analyst', role: 'Content Performance Intelligence', department: 'analytics-growth', icon: 'TrendingUp', status: 'idle' as const },
  { id: '17', name: 'Experiment Agent', role: 'A/B Testing & Experiments', department: 'analytics-growth', icon: 'FlaskConical', status: 'idle' as const },
  { id: '18', name: 'Knowledge Curator', role: 'Trading DNA & Brand Voice', department: 'knowledge', icon: 'Brain', status: 'active' as const, currentTask: 'Updating risk philosophy', progress: 20 },
  { id: '19', name: 'Memory Agent', role: 'Historical Content Retrieval', department: 'knowledge', icon: 'Archive', status: 'idle' as const },
  { id: '20', name: 'Task Manager', role: 'Workflow & Job Coordination', department: 'tasks', icon: 'ClipboardList', status: 'active' as const, currentTask: 'Managing 5 active workflows', progress: 80 },
  { id: '21', name: 'Cost Monitor', role: '9Router Usage & Budget Tracking', department: 'hq', icon: 'DollarSign', status: 'idle' as const },
]);

function refreshData() {
  // TODO: Implement refresh
  console.log('Refreshing data...');
}

function openNewTask() {
  // TODO: Navigate to new task creation
  console.log('Opening new task...');
}

function handleDepartmentSelect(dept: typeof departments[0]) {
  console.log('Department selected:', dept.label);
  // Could navigate to department page
}

function handleTimeframeChange(timeframe: string) {
  console.log('Timeframe changed:', timeframe);
}

function viewAllActivity() {
  console.log('View all activity');
}

function clearActivity() {
  recentActivity.value = [];
}

function handleApprove(item: any) {
  console.log('Approving:', item);
  pendingApprovals.value = pendingApprovals.value.filter(a => a.id !== item.id);
}

function handleRequestChanges(item: any) {
  console.log('Requesting changes for:', item);
}

function openNewProject() {
  console.log('Opening new project...');
}

function handleStageChange(project: any, newStage: string) {
  console.log('Stage change:', project.title, '->', newStage);
  const p = pipelineProjects.value.find(p => p.id === project.id);
  if (p) p.stage = newStage;
}

function viewAllAgents() {
  console.log('View all agents');
}

function viewAgent(agent: any) {
  console.log('View agent:', agent.name);
}

function configureAgent(agent: any) {
  console.log('Configure agent:', agent.name);
}
</script>