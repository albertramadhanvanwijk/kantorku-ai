<template>
  <Card
    :hover="true"
    :class="['flex flex-col h-full', selected ? 'ring-2 ring-brand-500' : ''].join(' ')"
    @click="$emit('click', material)"
  >
    <div class="relative aspect-square overflow-hidden bg-surface-50 rounded-t-xl">
      <!-- Thumbnail / Icon -->
      <div class="absolute inset-0 flex items-center justify-center">
        <template v-if="isImage && fileAsset?.url">
          <img
            :src="fileAsset.url"
            :alt="material.title"
            class="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            loading="lazy"
          />
        </template>
        <template v-else>
          <Icon :name="getTypeIcon(material.type)" size="xl" :class="getTypeIconColor(material.type)" />
        </template>
      </div>

      <!-- Type Badge -->
      <div class="absolute top-2 left-2">
        <Badge :variant="getTypeBadgeVariant(material.type)" size="sm">
          {{ formatType(material.type) }}
        </Badge>
      </div>

      <!-- Classification Confidence -->
      <div v-if="material.classification?.aiVerified" class="absolute top-2 right-2">
        <Badge
          :variant="getConfidenceVariant(material.classification.confidence)"
          size="sm"
          class="backdrop-blur-sm bg-white/90"
        >
          <Icon name="Brain" size="xs" class="mr-1" />
          {{ Math.round((material.classification.confidence ?? 0) * 100) }}%
        </Badge>
      </div>

      <!-- User Declared Badge (when no AI verification yet) -->
      <div v-else-if="material.classification?.userDeclared && !material.classification?.aiVerified" class="absolute top-2 right-2">
        <Badge variant="neutral" size="sm" class="backdrop-blur-sm bg-white/90">
          <Icon name="User" size="xs" class="mr-1" />
          Declared
        </Badge>
      </div>

      <!-- Selection Checkbox -->
      <div v-if="showCheckbox" class="absolute top-2 right-2 z-10">
        <input
          type="checkbox"
          :checked="selected"
          @click.stop="$emit('toggle-select', material.id)"
          class="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
        />
      </div>

      <!-- Actions Menu -->
      <div v-if="showActions" class="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          @click.stop="$emit('extract', material)"
          class="btn-ghost p-1.5 rounded-lg bg-white/90 backdrop-blur-sm"
          title="Extract data"
        >
          <Icon name="Search" size="sm" />
        </button>
        <button
          @click.stop="$emit('add-to-pack', material)"
          class="btn-ghost p-1.5 rounded-lg bg-white/90 backdrop-blur-sm"
          title="Add to pack"
        >
          <Icon name="Plus" size="sm" />
        </button>
        <button
          @click.stop="$emit('delete', material)"
          class="btn-ghost p-1.5 rounded-lg bg-white/90 backdrop-blur-sm text-error-500 hover:bg-red-50"
          title="Delete"
        >
          <Icon name="Trash2" size="sm" />
        </button>
      </div>
    </div>

    <div class="p-4 flex-1 flex flex-col min-h-0">
      <h3 class="font-medium text-surface-900 truncate mb-1">{{ material.title }}</h3>

      <div class="flex items-center gap-2 text-xs text-surface-500 mb-2">
        <span>{{ formatDate(material.createdAt) }}</span>
        <span class="w-px h-3 bg-surface-200" v-if="fileAsset" />
        <span v-if="fileAsset">{{ formatFileSize(fileAsset.sizeBytes) }}</span>
      </div>

      <!-- Classification info -->
      <div v-if="material.classification" class="mb-2 space-y-1 text-xs">
        <div v-if="material.classification.userDeclared" class="flex items-center gap-1 text-surface-600">
          <Icon name="User" size="xs" />
          <span>Declared: {{ formatType(material.classification.userDeclared) }}</span>
        </div>
        <div v-if="material.classification.aiVerified" class="flex items-center gap-1">
          <Icon name="Brain" size="xs" :class="getConfidenceColor(material.classification.confidence)" />
          <span :class="getConfidenceColor(material.classification.confidence)">
            AI: {{ formatType(material.classification.aiVerified) }}
          </span>
        </div>
        <div v-if="material.classification.reasoning" class="text-surface-500 line-clamp-1">
          {{ material.classification.reasoning }}
        </div>
      </div>

      <!-- Metadata hints -->
      <div v-if="material.metadata?.extraction" class="mt-auto pt-2 border-t border-surface-100">
        <div class="flex items-center gap-1.5 text-xs text-surface-500">
          <Icon name="CheckCircle2" size="xs" class="text-success-500" />
          <span>Extracted</span>
        </div>
        <div v-if="material.metadata.extraction.instrument" class="text-xs text-surface-600 mt-1">
          {{ material.metadata.extraction.instrument }}
        </div>
      </div>
    </div>
  </Card>
</template>

/// <reference types="@vue/runtime-dom" />
/// <reference lib="dom" />

<script setup lang="ts">
import { computed } from 'vue';
import Card from '../ui/Card.vue';
import Badge from '../ui/Badge.vue';
import Icon from '../ui/Icon.vue';

interface Material {
  id: string;
  type: string;
  title: string;
  fileAssetId: string;
  metadata: (Record<string, unknown> & {
    extraction?: {
      instrument?: string;
      timeframe?: string;
      indicators?: string[];
      priceLevels?: number[];
      chartType?: string;
      confidence?: number;
      extractedText?: string;
      language?: string;
      structure?: string;
      entities?: string[];
      trades?: Array<{
        instrument: string;
        direction: 'long' | 'short';
        entry?: number;
        exit?: number;
        sl?: number;
        tp?: number;
        timeframe?: string;
        result?: string;
        openedAt?: string;
        closedAt?: string;
        notes?: string;
      }>;
    };
  }) | null;
  classification: {
    userDeclared: string | null;
    aiVerified: string | null;
    confidence: number | null;
    reasoning: string | null;
    verifiedAt: string | null;
  };
  provenance: {
    uploadedAt: string;
    userId: string;
  };
  createdAt: string;
  updatedAt: string;
  fileAsset?: {
    id: string;
    key: string;
    url?: string;
    mimeType: string;
    sizeBytes: number;
  };
}

interface Props {
  material: Material;
  showCheckbox?: boolean;
  showActions?: boolean;
  selected?: boolean;
}

interface Emits {
  click: [material: Material];
  'toggle-select': [materialId: string];
  extract: [material: Material];
  'add-to-pack': [material: Material];
  delete: [material: Material];
}

const props = withDefaults(defineProps<Props>(), {
  showCheckbox: false,
  showActions: true,
  selected: false,
});

const emit = defineEmits<Emits>();

const isImage = computed(() => props.material.fileAsset?.mimeType?.startsWith('image/') ?? false);
const fileAsset = computed(() => props.material.fileAsset);

function getTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    chart: 'BarChart3',
    trade_screenshot: 'Camera',
    text_note: 'FileText',
    news: 'Newspaper',
    promo_asset: 'Megaphone',
    logo: 'Image',
    document: 'File',
  };
  return icons[type] ?? 'File';
}

function getTypeIconColor(type: string): string {
  const colors: Record<string, string> = {
    chart: 'text-emerald-500',
    trade_screenshot: 'text-blue-500',
    text_note: 'text-indigo-500',
    news: 'text-amber-500',
    promo_asset: 'text-pink-500',
    logo: 'text-violet-500',
    document: 'text-surface-500',
  };
  return colors[type] ?? 'text-surface-500';
}

function getTypeBadgeVariant(type: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand' {
  const variants: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand'> = {
    chart: 'success',
    trade_screenshot: 'info',
    text_note: 'neutral',
    news: 'warning',
    promo_asset: 'brand',
    logo: 'neutral',
    document: 'neutral',
  };
  return variants[type] ?? 'neutral';
}

function formatType(type: string): string {
  return type
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getConfidenceVariant(confidence: number | null): 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand' {
  if (confidence === null) return 'neutral';
  if (confidence >= 0.8) return 'success';
  if (confidence >= 0.5) return 'warning';
  return 'error';
}

function getConfidenceColor(confidence: number | null): string {
  if (confidence === null) return 'text-surface-500';
  if (confidence >= 0.8) return 'text-success-500';
  if (confidence >= 0.5) return 'text-warning-500';
  return 'text-error-500';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>