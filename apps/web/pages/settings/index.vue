<template>
  <MainLayout>
    <template #default>
      <div class="space-y-6 animate-fade-in max-w-4xl">
        <!-- Page Header -->
        <div>
          <h1 class="text-2xl font-bold text-surface-900">Settings</h1>
          <p class="text-surface-500 mt-1">Configure your AI Office preferences</p>
        </div>

        <!-- Settings Tabs -->
        <div class="flex flex-wrap gap-1 bg-surface-100 p-1 rounded-lg" role="tablist">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="[
              'px-4 py-2 rounded-md text-sm font-medium transition-all duration-200',
              activeTab === tab.id
                ? 'bg-white text-surface-900 shadow-sm'
                : 'text-surface-600 hover:text-surface-900',
            ]"
            @click="activeTab = tab.id"
            role="tab"
            :aria-selected="activeTab === tab.id"
          >
            <Icon :name="tab.icon" size="sm" class="mr-1.5" />
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab Panels -->
        <Card v-show="activeTab === 'general'">
          <h3 class="font-semibold text-surface-900 mb-4">General Settings</h3>
          <div class="space-y-6">
            <div>
              <Label for="timezone">Timezone</Label>
              <select id="timezone" v-model="settings.timezone" class="input mt-1">
                <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
              </select>
            </div>
            <div>
              <Label for="dateFormat">Date Format</Label>
              <select id="dateFormat" v-model="settings.dateFormat" class="input mt-1">
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
            <div>
              <Label for="theme">Theme</Label>
              <select id="theme" v-model="settings.theme" class="input mt-1">
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div class="flex items-center justify-between p-3 rounded-lg bg-surface-50">
              <div>
                <p class="font-medium text-surface-900">Compact Sidebar</p>
                <p class="text-sm text-surface-500">Auto-collapse sidebar on hover</p>
              </div>
              <input type="checkbox" v-model="settings.compactSidebar" class="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
            </div>
          </div>
        </Card>

        <Card v-show="activeTab === 'brand'">
          <h3 class="font-semibold text-surface-900 mb-4">Brand Configuration</h3>
          <div class="space-y-6">
            <div>
              <Label>Main Logo</Label>
              <div class="mt-2 flex items-center gap-4">
                <div class="w-16 h-16 rounded-lg bg-surface-100 border border-surface-200 flex items-center justify-center">
                  <Icon name="Image" size="lg" class="text-surface-400" />
                </div>
                <Button variant="outline" @click="uploadLogo">
                  <Icon name="Upload" size="sm" />
                  Upload Logo
                </Button>
              </div>
              <p class="text-sm text-surface-500 mt-1">PNG/SVG, max 512x512px</p>
            </div>
            <div>
              <Label>Brand Colors</Label>
              <div class="mt-2 flex flex-wrap gap-3">
                <div v-for="color in brandColors" :key="color.name" class="flex items-center gap-2">
                  <input type="color" :value="color.value" @input="updateColor(color, $event)" class="w-8 h-8 rounded border border-surface-200 cursor-pointer" />
                  <span class="text-sm font-medium text-surface-700">{{ color.name }}</span>
                </div>
              </div>
            </div>
            <div>
              <Label>Typography</Label>
              <div class="mt-2 grid grid-cols-2 gap-4">
                <div>
                  <Label for="headingFont">Heading Font</Label>
                  <select id="headingFont" v-model="settings.headingFont" class="input mt-1">
                    <option value="Inter">Inter</option>
                    <option value="Poppins">Poppins</option>
                    <option value="Space Grotesk">Space Grotesk</option>
                  </select>
                </div>
                <div>
                  <Label for="bodyFont">Body Font</Label>
                  <select id="bodyFont" v-model="settings.bodyFont" class="input mt-1">
                    <option value="Inter">Inter</option>
                    <option value="DM Sans">DM Sans</option>
                    <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card v-show="activeTab === 'integrations'">
          <h3 class="font-semibold text-surface-900 mb-4">Integrations</h3>
          <div class="space-y-6">
            <div v-for="integration in integrations" :key="integration.name" class="flex items-center justify-between p-4 rounded-lg bg-surface-50 border border-surface-200">
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="integration.color">
                  <Icon :name="integration.icon" size="md" class="text-white" />
                </div>
                <div>
                  <p class="font-medium text-surface-900">{{ integration.name }}</p>
                  <p class="text-sm text-surface-500">{{ integration.description }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <Badge :variant="integration.status === 'connected' ? 'success' : 'neutral'" size="sm" :dot="true">
                  {{ integration.status === 'connected' ? 'Connected' : 'Not Connected' }}
                </Badge>
                <Button variant="ghost" size="sm" @click="configureIntegration(integration)">
                  <Icon :name="integration.status === 'connected' ? 'Settings' : 'Plug'" size="xs" />
                  {{ integration.status === 'connected' ? 'Configure' : 'Connect' }}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card v-show="activeTab === 'ai'">
          <h3 class="font-semibold text-surface-900 mb-4">AI & 9Router Settings</h3>
          <div class="space-y-6">
            <div class="p-4 rounded-lg bg-amber-50 border border-amber-200">
              <div class="flex items-start gap-3">
                <Icon name="AlertTriangle" size="md" class="text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p class="font-medium text-amber-900">9Router API Key Required</p>
                  <p class="text-sm text-amber-700 mt-1">Configure your 9Router API key in environment variables to enable AI agents.</p>
                </div>
              </div>
            </div>
            <div>
              <Label>Default Model</Label>
              <select v-model="aiSettings.defaultModel" class="input mt-1">
                <option value="auto">Auto (Cost-aware routing)</option>
                <option value="gpt-4o">GPT-4o (Strongest)</option>
                <option value="gpt-4o-mini">GPT-4o Mini (Balanced)</option>
                <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
              </select>
              <p class="text-sm text-surface-500 mt-1">Model selection is policy-driven based on task complexity</p>
            </div>
            <div>
              <Label>Cost Budget (Monthly USD)</Label>
              <input v-model="aiSettings.monthlyBudget" type="number" placeholder="100" class="input mt-1" />
              <p class="text-sm text-surface-500 mt-1">Set a monthly budget guardrail for 9Router usage</p>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <Label>Auto-fallback on failure</Label>
                <input type="checkbox" v-model="aiSettings.autoFallback" class="mt-2 rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
              </div>
              <div>
                <Label>Log model metadata</Label>
                <input type="checkbox" v-model="aiSettings.logMetadata" class="mt-2 rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
              </div>
            </div>
            <div>
              <Label>Routing Policy</Label>
              <div class="mt-2 space-y-2">
                <div v-for="policy in aiSettings.routingPolicies" :key="policy.task" class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg">
                  <span class="font-medium text-sm text-surface-700 w-40">{{ policy.task }}</span>
                  <select v-model="policy.model" class="input flex-1">
                    <option value="low-cost">Low-cost model</option>
                    <option value="mid-cost">Mid-cost model</option>
                    <option value="strongest">Strongest model</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card v-show="activeTab === 'notifications'">
          <h3 class="font-semibold text-surface-900 mb-4">Notifications</h3>
          <div class="space-y-4">
            <div v-for="notif in notificationSettings" :key="notif.key" class="flex items-center justify-between p-3 rounded-lg bg-surface-50">
              <div>
                <p class="font-medium text-surface-900">{{ notif.label }}</p>
                <p class="text-sm text-surface-500">{{ notif.description }}</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" v-model="notif.enabled" class="sr-only peer" />
                <div class="w-11 h-6 bg-surface-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-surface-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            </div>
          </div>
        </Card>

        <Card v-show="activeTab === 'account'">
          <h3 class="font-semibold text-surface-900 mb-4">Account</h3>
          <div class="space-y-6">
            <div class="flex items-center gap-4 p-4 rounded-lg bg-surface-50">
              <div class="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center">
                <span class="text-xl font-bold text-brand-700">{{ userInitials }}</span>
              </div>
              <div>
                <h4 class="font-medium text-surface-900">{{ userName }}</h4>
                <p class="text-sm text-surface-500">{{ userEmail }}</p>
                <p class="text-sm text-surface-500">{{ userRole }}</p>
              </div>
            </div>
            <div class="border-t border-surface-200 pt-4">
              <Button variant="secondary">
                <Icon name="User" size="sm" />
                Edit Profile
              </Button>
              <Button variant="outline" class="ml-2">
                <Icon name="Key" size="sm" />
                Change Password
              </Button>
            </div>
            <hr class="my-4 border-surface-200" />
            <div class="flex items-center justify-between p-4 rounded-lg bg-red-50 border border-red-200">
              <div>
                <p class="font-medium text-red-900">Danger Zone</p>
                <p class="text-sm text-red-700 mt-0.5">Delete your account and all data permanently</p>
              </div>
              <Button variant="danger" @click="confirmDeleteAccount">
                <Icon name="Trash2" size="sm" />
                Delete Account
              </Button>
            </div>
          </div>
        </Card>

        <!-- Save Button -->
        <div class="flex justify-end">
          <Button variant="primary" @click="saveSettings">
            <Icon name="Save" size="sm" />
            Save Changes
          </Button>
        </div>
      </div>
    </template>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import MainLayout from '~/components/layout/MainLayout.vue';
import Card from '~/components/ui/Card.vue';
import Button from '~/components/ui/Button.vue';
import Badge from '~/components/ui/Badge.vue';
import Input from '~/components/ui/Input.vue';
import Icon from '~/components/ui/Icon.vue';

const tabs = [
  { id: 'general', label: 'General', icon: 'Settings' },
  { id: 'brand', label: 'Brand', icon: 'Palette' },
  { id: 'integrations', label: 'Integrations', icon: 'Plug2' },
  { id: 'ai', label: 'AI & 9Router', icon: 'Bot' },
  { id: 'notifications', label: 'Notifications', icon: 'Bell' },
  { id: 'account', label: 'Account', icon: 'User' },
];

const activeTab = ref('general');

const settings = reactive({
  timezone: 'Asia/Jakarta',
  dateFormat: 'DD/MM/YYYY',
  theme: 'system',
  compactSidebar: false,
  headingFont: 'Inter',
  bodyFont: 'Inter',
});

const brandColors = reactive([
  { name: 'Primary', value: '#0ea5e9' },
  { name: 'Secondary', value: '#64748b' },
  { name: 'Accent', value: '#ec4899' },
  { name: 'Success', value: '#22c55e' },
  { name: 'Warning', value: '#f59e0b' },
  { name: 'Error', value: '#ef4444' },
]);

const integrations = [
  { name: '9Router', description: 'AI Model Gateway', icon: 'Bot', color: 'bg-brand-500', status: 'pending' },
  { name: 'TikTok Studio', description: 'Analytics CSV Import', icon: 'Upload', color: 'bg-pink-500', status: 'pending' },
  { name: 'GitHub', description: 'Code & Documentation Sync', icon: 'Github', color: 'bg-surface-900', status: 'pending' },
  { name: 'Notion', description: 'Knowledge Base Sync', icon: 'BookOpen', color: 'bg-surface-900', status: 'pending' },
  { name: 'Slack', description: 'Team Notifications', icon: 'MessageSquare', color: 'bg-purple-500', status: 'pending' },
  { name: 'Email (SMTP)', description: 'Transactional Emails', icon: 'Mail', color: 'bg-blue-500', status: 'pending' },
];

const aiSettings = reactive({
  defaultModel: 'auto',
  monthlyBudget: 100,
  autoFallback: true,
  logMetadata: true,
  routingPolicies: [
    { task: 'Classification', model: 'low-cost' },
    { task: 'Summarization', model: 'low-cost' },
    { task: 'Research Synthesis', model: 'mid-cost' },
    { task: 'Trading Reasoning', model: 'strongest' },
    { task: 'Final Review', model: 'strongest' },
    { task: 'Creative Writing', model: 'mid-cost' },
  ],
});

const notificationSettings = reactive([
  { key: 'approval', label: 'Approval Requests', description: 'When content needs your review', enabled: true },
  { key: 'workflow_complete', label: 'Workflow Complete', description: 'When a workflow finishes', enabled: true },
  { key: 'workflow_error', label: 'Workflow Errors', description: 'When a workflow fails', enabled: true },
  { key: 'agent_idle', label: 'Agent Idle', description: 'When agents are waiting for input', enabled: false },
  { key: 'daily_summary', label: 'Daily Summary', description: 'End-of-day activity summary', enabled: true },
  { key: 'weekly_report', label: 'Weekly Report', description: 'Weekly performance overview', enabled: true },
]);

const userName = 'Founder';
const userEmail = 'founder@kantorku.ai';
const userRole = 'Head Trader & Editor-in-Chief';
const userInitials = 'FO';

function uploadLogo() {
  console.log('Upload logo clicked');
}

function updateColor(color: { name: string; value: string }, event: Event) {
  const target = event.target as HTMLInputElement;
  color.value = target.value;
}

function configureIntegration(integration: any) {
  console.log('Configure integration:', integration.name);
}

function saveSettings() {
  console.log('Saving settings:', { settings, brandColors, aiSettings, notificationSettings });
  // TODO: Implement save to backend
}

function confirmDeleteAccount() {
  if (window.confirm('Are you sure you want to delete your account? This cannot be undone.')) {
    console.log('Delete account confirmed');
    // TODO: Implement account deletion
  }
}
</script>