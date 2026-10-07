<template>
  <Card class="h-full">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-surface-900">{{ title }}</h3>
        <div class="flex items-center gap-2">
          <Badge variant="info" size="sm" :dot="true">Live</Badge>
          <select v-model="timeframe" class="input py-1 px-2 text-xs bg-surface-50 border-surface-200" @change="$emit('timeframe-change', timeframe)">
            <option value="1h">1H</option>
            <option value="4h">4H</option>
            <option value="1d">1D</option>
            <option value="1w">1W</option>
          </select>
        </div>
      </div>
    </template>
    
    <div class="space-y-4">
      <!-- Key Indices -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <template v-for="index in marketIndices" :key="index.symbol">
          <div class="p-3 rounded-lg bg-surface-50 border border-surface-200 hover:border-surface-300 transition-colors">
            <div class="flex items-center justify-between">
              <span class="font-medium text-sm text-surface-900">{{ index.symbol }}</span>
              <Badge :variant="index.change >= 0 ? 'success' : 'error'" size="sm">
                {{ index.change >= 0 ? '+' : '' }}{{ index.change.toFixed(2) }}%
              </Badge>
            </div>
            <div class="mt-1">
              <p class="text-lg font-bold text-surface-900">{{ index.price }}</p>
              <p class="text-xs text-surface-500">{{ index.name }}</p>
            </div>
          </div>
        </template>
      </div>
      
      <!-- Market Breadth -->
      <div class="p-3 rounded-lg bg-surface-50 border border-surface-200">
        <h4 class="font-medium text-sm text-surface-700 mb-3">Market Breadth</h4>
        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <p class="text-2xl font-bold text-success-500">{{ breadth.advancing }}</p>
            <p class="text-xs text-surface-500">Advancing</p>
          </div>
          <div>
            <p class="text-2xl font-bold text-surface-500">{{ breadth.unchanged }}</p>
            <p class="text-xs text-surface-500">Unchanged</p>
          </div>
          <div>
            <p class="text-2xl font-bold text-error-500">{{ breadth.declining }}</p>
            <p class="text-xs text-surface-500">Declining</p>
          </div>
        </div>
        <div class="mt-3 h-2 bg-surface-200 rounded-full overflow-hidden">
          <div class="h-full bg-success-500 transition-all duration-500" :style="{ width: `${breadth.advancing / (breadth.advancing + breadth.unchanged + breadth.declining) * 100}%` }" />
        </div>
      </div>
      
      <!-- Sector Performance -->
      <div>
        <h4 class="font-medium text-sm text-surface-700 mb-3">Sector Performance</h4>
        <div class="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin">
          <template v-for="sector in sectorPerformance" :key="sector.name">
            <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 transition-colors">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" :style="{ backgroundColor: sectorColor(sector.change) }">
                <Icon :name="sectorIcon(sector.name)" size="sm" class="text-white" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-medium text-sm text-surface-900 truncate">{{ sector.name }}</p>
                <div class="h-1.5 bg-surface-200 rounded-full overflow-hidden mt-1">
                  <div class="h-full bg-brand-500 transition-all duration-500" :style="{ width: `${Math.max(0, Math.min(100, 50 + sector.change * 5))}%` }" />
                </div>
              </div>
              <span class="text-sm font-medium" :class="sector.change >= 0 ? 'text-success-500' : 'text-error-500'">
                {{ sector.change >= 0 ? '+' : '' }}{{ sector.change.toFixed(1) }}%
              </span>
            </div>
          </template>
        </div>
      </div>
      
      <!-- Key Levels -->
      <div class="p-3 rounded-lg bg-surface-50 border border-surface-200">
        <h4 class="font-medium text-sm text-surface-700 mb-3">Key Levels (ES)</h4>
        <div class="grid grid-cols-2 gap-3">
          <div v-for="level in keyLevels" :key="level.label" class="p-2 rounded bg-white border border-surface-200">
            <p class="text-[11px] text-surface-500 uppercase tracking-wide">{{ level.label }}</p>
            <p class="font-mono font-semibold text-surface-900">{{ level.value }}</p>
          </div>
        </div>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Card from '../ui/Card.vue';
import Badge from '../ui/Badge.vue';
import Icon from '../ui/Icon.vue';

interface Props {
  title: string;
  marketIndices?: Array<{ symbol: string; name: string; price: string; change: number }>;
  breadth?: { advancing: number; unchanged: number; declining: number };
  sectorPerformance?: Array<{ name: string; change: number }>;
  keyLevels?: Array<{ label: string; value: string }>;
}

const props = withDefaults(defineProps<Props>(), {
  marketIndices: () => [
    { symbol: 'ES', name: 'S&P 500 Futures', price: '4,587.25', change: 0.34 },
    { symbol: 'NQ', name: 'Nasdaq 100 Futures', price: '15,934.50', change: 0.52 },
    { symbol: 'YM', name: 'Dow Futures', price: '35,421.00', change: 0.18 },
    { symbol: 'RTY', name: 'Russell 2000 Futures', price: '1,892.30', change: -0.12 },
  ],
  breadth: () => ({ advancing: 312, unchanged: 45, declining: 187 }),
  sectorPerformance: () => [
    { name: 'Technology', change: 0.8 },
    { name: 'Healthcare', change: 0.3 },
    { name: 'Financials', change: -0.2 },
    { name: 'Consumer Discretionary', change: 0.5 },
    { name: 'Industrials', change: 0.1 },
    { name: 'Energy', change: -0.7 },
    { name: 'Utilities', change: 0.2 },
    { name: 'Real Estate', change: -0.3 },
    { name: 'Materials', change: -0.1 },
    { name: 'Consumer Staples', change: 0.1 },
  ],
  keyLevels: () => [
    { label: 'R2', value: '4,620' },
    { label: 'R1', value: '4,600' },
    { label: 'Pivot', value: '4,580' },
    { label: 'S1', value: '4,560' },
    { label: 'S2', value: '4,540' },
    { label: 'S3', value: '4,520' },
  ],
});

const emit = defineEmits<{
  'timeframe-change': [timeframe: string];
}>();

const timeframe = ref('1d');

function sectorColor(change: number): string {
  if (change > 0.5) return '#22c55e';
  if (change > 0) return '#4ade80';
  if (change < -0.5) return '#ef4444';
  if (change < 0) return '#f87171';
  return '#9ca3af';
}

function sectorIcon(name: string): string {
  const icons: Record<string, string> = {
    Technology: 'Cpu',
    Healthcare: 'HeartPulse',
    Financials: 'Landmark',
    'Consumer Discretionary': 'ShoppingBag',
    Industrials: 'Factory',
    Energy: 'Zap',
    Utilities: 'Plug',
    'Real Estate': 'Home',
    Materials: 'Package',
    'Consumer Staples': 'Package',
  };
  return icons[name] || 'BarChart3';
}
</script>