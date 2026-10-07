<template>
  <Card
    :hover="true"
    :class="['flex flex-col h-full', selected ? 'ring-2 ring-brand-500' : ''].join(' ')"
    @click="$emit('click', pack)"
  >
    <div class="flex flex-col h-full">
      <div class="p-5 flex-1 flex flex-col">
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
              <Icon name="FolderOpen" size="lg" class="text-brand-600" />
            </div>
            <div class="min-w-0">
              <h3 class="font-semibold text-surface-900 truncate">{{ pack.name }}</h3>
              <p v-if="pack.description" class="text-sm text-surface-500 truncate mt-0.5">{{ pack.description }}</p>
            </div>
          </div>
          <div v-if="showCheckbox" class="flex-shrink-0">
            <input
              type="checkbox"
              :checked="selected"
              @click.stop="$emit('toggle-select', pack.id)"
              class="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
            />
          </div>
        </div>

        <div class="flex-1 flex flex-col justify-between min-h-0">
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-sm text-surface-600">
              <Icon name="FileText" size="sm" />
              <span>{{ pack.itemCount ?? 0 }} material{{ (pack.itemCount ?? 0) !== 1 ? 's' : '' }}</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-surface-600">
              <Icon name="Calendar" size="sm" />
              <span>{{ formatDate(pack.createdAt) }}</span>
            </div>
          </div>

          <!-- Preview of materials in pack -->
          <div v-if="pack.items && pack.items.length > 0" class="mt-4 pt-3 border-t border-surface-100">
            <p class="text-xs text-surface-500 mb-2">Recent materials</p>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="(item, idx) in pack.items.slice(0, 4)"
                :key="item.materialId"
                class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-surface-100 text-surface-600"
              >
                <Icon :name="getTypeIcon(item.material?.type || 'document')" size="xs" />
                {{ item.material?.title?.slice(0, 15) }}...
              </span>
              <span v-if="pack.items.length > 4" class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-brand-100 text-brand-600">
                +{{ pack.items.length - 4 }} more
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showActions" class="p-4 pt-0 border-t border-surface-100 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          class="flex-1"
          @click.stop="$emit('open', pack)"
        >
          <Icon name="FolderOpen" size="sm" />
          Open
        </Button>
        <Button
          variant="secondary"
          size="sm"
          @click.stop="$emit('add-materials', pack)"
        >
          <Icon name="Plus" size="sm" />
          Add
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="text-error-500 hover:bg-red-50"
          @click.stop="$emit('delete', pack)"
        >
          <Icon name="Trash2" size="sm" />
        </Button>
      </div>
    </div>
  </Card>
</template>

/// <reference types="@vue/runtime-dom" />
/// <reference lib="dom" />

<script setup lang="ts">
import Card from '../ui/Card.vue';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';

interface SourcePack {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  items?: Array<{
    materialId: string;
    material?: {
      id: string;
      type: string;
      title: string;
    };
  }>;
}

interface Props {
  pack: SourcePack;
  showCheckbox?: boolean;
  showActions?: boolean;
  selected?: boolean;
}

interface Emits {
  click: [pack: SourcePack];
  'toggle-select': [packId: string];
  open: [pack: SourcePack];
  'add-materials': [pack: SourcePack];
  delete: [pack: SourcePack];
}

const props = withDefaults(defineProps<Props>(), {
  showCheckbox: false,
  showActions: true,
  selected: false,
});

const emit = defineEmits<Emits>();

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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
</script>