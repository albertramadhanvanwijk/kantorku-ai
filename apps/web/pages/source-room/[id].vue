<template>
  <MainLayout>
    <template #default>
      <div class="space-y-6 animate-fade-in" v-if="pack">
        <!-- Page Header -->
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div class="flex items-start gap-4">
            <div class="w-14 h-14 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
              <Icon name="FolderOpen" size="xl" class="text-brand-600" />
            </div>
            <div>
              <div class="flex items-center gap-3">
                <h1 class="text-2xl font-bold text-surface-900">{{ pack.name }}</h1>
                <Badge :variant="pack.items.length > 0 ? 'success' : 'neutral'" size="sm">
                  {{ pack.items.length }} item{{ pack.items.length !== 1 ? 's' : '' }}
                </Badge>
              </div>
              <p v-if="pack.description" class="text-surface-500 mt-1">{{ pack.description }}</p>
              <p class="text-sm text-surface-500 mt-1">Created {{ formatDate(pack.createdAt) }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" @click="openAddMaterialsModal">
              <Icon name="Plus" size="sm" />
              Add Materials
            </Button>
            <Button variant="ghost" @click="goBack">
              <Icon name="ArrowLeft" size="sm" />
              Back
            </Button>
            <Button variant="danger" @click="confirmDeletePack">
              <Icon name="Trash2" size="sm" />
              Delete Pack
            </Button>
          </div>
        </div>

        <!-- Pack Description Editor -->
        <Card variant="outlined" class="p-4">
          <label class="label">Description</label>
          <textarea
            v-model="editDescription"
            @blur="saveDescription"
            rows="2"
            class="input resize-none"
            placeholder="Add a description for this pack..."
          />
        </Card>

        <!-- Materials Grid -->
        <div class="card">
          <div class="p-4 border-b border-surface-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 class="font-semibold text-surface-900">Materials in Pack</h3>
            <div class="flex items-center gap-2">
              <label class="flex items-center gap-2 text-sm text-surface-600">
                <input
                  type="checkbox"
                  v-model="showReorderMode"
                  class="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                Reorder Mode
              </label>
            </div>
          </div>

          <div v-if="packLoading" class="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div v-for="i in 4" :key="i" class="animate-pulse">
              <Card>
                <div class="aspect-square bg-surface-100 rounded-t-xl" />
                <div class="p-4 space-y-3">
                  <div class="h-4 bg-surface-200 rounded w-3/4" />
                  <div class="h-3 bg-surface-200 rounded w-1/2" />
                </div>
              </Card>
            </div>
          </div>

          <div v-else-if="pack.items.length === 0" class="p-12 text-center">
            <Icon name="Inbox" size="xl" class="text-surface-300 mx-auto mb-3" />
            <p class="text-surface-500 mb-4">This pack is empty</p>
            <Button variant="primary" @click="openAddMaterialsModal">
              <Icon name="Plus" size="sm" />
              Add Materials
            </Button>
          </div>

          <div v-else class="p-4">
            <!-- Reorder Mode: List View -->
            <div v-if="showReorderMode" class="space-y-2 max-h-96 overflow-y-auto">
              <div
                v-for="(item, index) in pack.items"
                :key="item.materialId"
                class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg border border-surface-200"
                :class="draggingId === item.materialId ? 'opacity-50' : ''"
                draggable="true"
                @dragstart="onDragStart(item.materialId, index)"
                @dragover.prevent="onDragOver(index)"
                @dragleave="onDragLeave"
                @drop.prevent="onDrop(index)"
                @dragend="onDragEnd"
              >
                <Icon name="GripVertical" size="md" class="text-surface-400 cursor-grab" />
                <div class="w-12 h-12 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0">
                  <Icon v-if="item.material?.fileAsset?.mimeType?.startsWith('image/')" :name="getTypeIcon(item.material!.type)" size="md" :class="getTypeIconColor(item.material!.type)" />
                  <Icon v-else :name="getTypeIcon(item.material!.type)" size="md" :class="getTypeIconColor(item.material!.type)" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-sm text-surface-900 truncate">{{ item.material?.title }}</p>
                  <p class="text-xs text-surface-500">{{ formatType(item.material?.type ?? 'document') }}</p>
                </div>
                <span class="text-sm font-medium text-surface-600 w-8 text-center">{{ index + 1 }}</span>
                <Button variant="ghost" size="sm" class="text-error-500" @click.stop="removeItemFromPack(item.materialId)">
                  <Icon name="X" size="sm" />
                </Button>
              </div>
            </div>

            <!-- Normal Mode: Grid View -->
            <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <MaterialCard
                v-for="item in pack.items"
                :key="item.materialId"
                :material="item.material as any"
                :show-actions="true"
                @click="openMaterialDetail(item.material)"
                @extract="handleExtract"
                @add-to-pack="handleAddToOtherPack"
                @delete="handleRemoveFromPack"
              />
            </div>
          </div>
        </div>
      </div>

      <div v-else class="flex items-center justify-center min-h-[400px]">
        <div class="animate-pulse space-y-4 w-3/4 max-w-2xl">
          <div class="h-8 bg-surface-200 rounded w-1/3" />
          <div class="h-6 bg-surface-200 rounded w-1/4" />
          <div class="h-64 bg-surface-100 rounded-xl" />
        </div>
      </div>

      <!-- Add Materials Modal -->
      <Teleport to="body">
        <div v-if="showAddMaterialsModal" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="closeAddMaterialsModal">
          <div class="fixed inset-0 bg-black/50" />
          <div class="relative bg-white rounded-xl shadow-strong max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div class="flex items-center justify-between p-4 border-b border-surface-200">
              <h3 class="font-semibold text-surface-900">Add Materials to Pack</h3>
              <button @click="closeAddMaterialsModal" class="btn-ghost p-2 rounded-lg" aria-label="Close">
                <Icon name="X" size="md" />
              </button>
            </div>
            <div class="p-4 border-b border-surface-200">
              <input
                type="search"
                v-model="addMaterialsSearch"
                placeholder="Search materials..."
                class="input"
                leading-icon="Search"
              />
            </div>
            <div class="flex-1 overflow-y-auto p-4" v-if="!addMaterialsLoading">
              <div v-if="availableMaterials.length === 0" class="text-center py-8 text-surface-500">
                <Icon name="Inbox" size="xl" class="mx-auto mb-2 text-surface-300" />
                <p>No available materials to add</p>
              </div>
              <div v-else class="space-y-2">
                <label
                  v-for="material in availableMaterials"
                  :key="material.id"
                  class="flex items-center gap-3 p-3 hover:bg-surface-50 rounded-lg cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :value="material.id"
                    v-model="selectedMaterialIds"
                    class="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div class="w-10 h-10 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0">
                    <Icon :name="getTypeIcon(material.type)" size="md" :class="getTypeIconColor(material.type)" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-sm text-surface-900 truncate">{{ material.title }}</p>
                    <p class="text-xs text-surface-500">{{ formatType(material.type) }} · {{ formatDate(material.createdAt) }}</p>
                  </div>
                  <Badge :variant="getTypeBadgeVariant(material.type)" size="sm">
                    {{ formatType(material.type) }}
                  </Badge>
                </label>
              </div>
            </div>
            <div v-else class="flex-1 flex items-center justify-center">
              <div class="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
            </div>
            <div class="p-4 border-t border-surface-200 flex justify-end gap-2">
              <Button variant="secondary" @click="closeAddMaterialsModal">Cancel</Button>
              <Button variant="primary" :loading="addingMaterials" @click="addSelectedMaterials">
                <Icon name="Plus" size="sm" />
                Add {{ selectedMaterialIds.length }} Material{{ selectedMaterialIds.length !== 1 ? 's' : '' }}
              </Button>
            </div>
          </div>
        </div>
      </Teleport>
    </template>
  </MainLayout>
</template>

/// <reference types="@vue/runtime-dom" />
/// <reference lib="dom" />

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import MainLayout from '~/components/layout/MainLayout.vue';
import Card from '~/components/ui/Card.vue';
import Button from '~/components/ui/Button.vue';
import Badge from '~/components/ui/Badge.vue';
import Icon from '~/components/ui/Icon.vue';
import Input from '~/components/ui/Input.vue';
import MaterialCard from '~/components/source-room/MaterialCard.vue';
import { useMaterials } from '~/composables/useMaterials';
import { useSourcePacks } from '~/composables/useSourcePacks';
import type { SourcePackWithItems } from '~/composables/useSourcePacks';

const router = useRouter();
const route = useRoute();

const {
  packs,
  loading: packsLoading,
  getById: fetchPack,
  update: updatePack,
  remove: deletePack,
  addItems,
  removeItem,
  reorder,
} = useSourcePacks();

const packId = computed(() => route.params.id as string);
const pack = ref<SourcePackWithItems | null>(null);
const packLoading = ref(true);
const editDescription = ref('');

const { extract: extractMaterial, list: fetchAllMaterials } = useMaterials();

const showReorderMode = ref(false);
const draggingId = ref<string | null>(null);
const dragOverIndex = ref<number | null>(null);

const showAddMaterialsModal = ref(false);
const addMaterialsSearch = ref('');
const addMaterialsLoading = ref(false);
const availableMaterials = ref<any[]>([]);
const selectedMaterialIds = ref<string[]>([]);
const addingMaterials = ref(false);

async function loadPack() {
  packLoading.value = true;
  try {
    const data = await fetchPack(packId.value);
    pack.value = data;
    editDescription.value = data.description || '';
  } catch (err) {
    console.error('Failed to load pack:', err);
    router.push('/source-room');
  } finally {
    packLoading.value = false;
  }
}

async function loadAvailableMaterials() {
  addMaterialsLoading.value = true;
  try {
    // Fetch all materials not in this pack
    const res = await fetchAllMaterials({ page: 1, pageSize: 200 });
    const packMaterialIds = new Set(pack.value?.items?.map((i: any) => i.materialId) || []);
    availableMaterials.value = res.rows.filter(m => !packMaterialIds.has(m.id));
  } catch (err) {
    console.error('Failed to load available materials:', err);
  } finally {
    addMaterialsLoading.value = false;
  }
}

async function saveDescription() {
  if (!pack.value) return;
  try {
    await updatePack(pack.value.id, { description: editDescription.value });
    pack.value.description = editDescription.value;
  } catch (err) {
    console.error('Failed to save description:', err);
  }
}

async function confirmDeletePack() {
  if (!pack.value) return;
  if (!window.confirm(`Delete pack "${pack.value.name}"? Materials will not be deleted.`)) return;
  try {
    await deletePack(pack.value.id);
    router.push('/source-room');
  } catch (err) {
    console.error('Failed to delete pack:', err);
  }
}

function openAddMaterialsModal() {
  showAddMaterialsModal.value = true;
  selectedMaterialIds.value = [];
  loadAvailableMaterials();
}

function closeAddMaterialsModal() {
  showAddMaterialsModal.value = false;
  selectedMaterialIds.value = [];
  addMaterialsSearch.value = '';
}

async function addSelectedMaterials() {
  if (!pack.value || selectedMaterialIds.value.length === 0) return;
  addingMaterials.value = true;
  try {
    await addItems(pack.value.id, { materialIds: selectedMaterialIds.value });
    await loadPack();
    closeAddMaterialsModal();
  } catch (err) {
    console.error('Failed to add materials:', err);
  } finally {
    addingMaterials.value = false;
  }
}

async function removeItemFromPack(materialId: string) {
  if (!pack.value) return;
  if (!window.confirm('Remove this material from the pack?')) return;
  try {
    await removeItem(pack.value.id, materialId);
    await loadPack();
  } catch (err) {
    console.error('Failed to remove item:', err);
  }
}

async function handleReorder(newOrder: Array<{ materialId: string; sortOrder: number }>) {
  if (!pack.value) return;
  try {
    await reorder(pack.value.id, newOrder);
    await loadPack();
  } catch (err) {
    console.error('Failed to reorder:', err);
  }
}

// Drag and drop reorder handlers
function onDragStart(materialId: string, index: number) {
  draggingId.value = materialId;
  dragOverIndex.value = index;
}

function onDragOver(index: number) {
  if (draggingId.value) {
    dragOverIndex.value = index;
  }
}

function onDragLeave() {
  dragOverIndex.value = null;
}

function onDrop(targetIndex: number) {
  if (!pack.value || draggingId.value === null || dragOverIndex.value === null) return;
  
  const fromIndex = dragOverIndex.value;
  if (fromIndex === targetIndex) return;

  const items = [...pack.value.items];
  const [movedItem] = items.splice(fromIndex, 1);
  items.splice(targetIndex, 0, movedItem);

  const newOrder = items.map((item, idx) => ({
    materialId: item.materialId,
    sortOrder: idx,
  }));

  handleReorder(newOrder);
}

function onDragEnd() {
  draggingId.value = null;
  dragOverIndex.value = null;
}

async function handleExtract(material: any) {
  try {
    await extractMaterial(material.id, { type: 'chart' });
    await loadPack();
  } catch (err) {
    console.error('Extract failed:', err);
  }
}

function handleAddToOtherPack(material: any) {
  // Could open a modal to select another pack
  console.log('Add to other pack:', material);
}

async function handleRemoveFromPack(material: any) {
  if (!pack.value) return;
  if (!window.confirm(`Remove "${material.title}" from this pack?`)) return;
  try {
    await removeItem(pack.value.id, material.id);
    await loadPack();
  } catch (err) {
    console.error('Failed to remove from pack:', err);
  }
}

function openMaterialDetail(material: any) {
  console.log('Open material:', material.id);
}

function goBack() {
  router.push('/source-room');
}

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

const filteredAvailableMaterials = computed(() => {
  if (!addMaterialsSearch.value) return availableMaterials.value;
  const query = addMaterialsSearch.value.toLowerCase();
  return availableMaterials.value.filter(m =>
    m.title.toLowerCase().includes(query) ||
    m.type.toLowerCase().includes(query)
  );
});

watch(() => route.params.id, () => {
  loadPack();
});

onMounted(() => {
  loadPack();
});
</script>