<template>
  <MainLayout>
    <template #default>
      <div class="space-y-6 animate-fade-in">
        <!-- Page Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-surface-900">Source Room</h1>
            <p class="text-surface-500 mt-1">Upload, organize, and manage creator materials</p>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="primary" @click="navigateToUpload">
              <Icon name="Upload" size="sm" />
              Upload Material
            </Button>
            <Button variant="secondary" @click="createNewPack">
              <Icon name="Plus" size="sm" />
              New Pack
            </Button>
          </div>
        </div>

        <!-- Stats Row -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card variant="outlined" class="p-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Icon name="Image" size="md" class="text-emerald-600" />
              </div>
              <div>
                <p class="text-2xl font-bold text-surface-900">{{ totalMaterials }}</p>
                <p class="text-sm text-surface-500">Total Materials</p>
              </div>
            </div>
          </Card>
          <Card variant="outlined" class="p-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                <Icon name="FolderOpen" size="md" class="text-brand-600" />
              </div>
              <div>
                <p class="text-2xl font-bold text-surface-900">{{ totalPacks }}</p>
                <p class="text-sm text-surface-500">Source Packs</p>
              </div>
            </div>
          </Card>
          <Card variant="outlined" class="p-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Icon name="Camera" size="md" class="text-blue-600" />
              </div>
              <div>
                <p class="text-2xl font-bold text-surface-900">{{ chartsCount }}</p>
                <p class="text-sm text-surface-500">Charts</p>
              </div>
            </div>
          </Card>
          <Card variant="outlined" class="p-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                <Icon name="FileText" size="md" class="text-violet-600" />
              </div>
              <div>
                <p class="text-2xl font-bold text-surface-900">{{ notesCount }}</p>
                <p class="text-sm text-surface-500">Notes & Docs</p>
              </div>
            </div>
          </Card>
        </div>

        <!-- Tabs -->
        <div class="card">
          <div class="border-b border-surface-200">
            <nav class="flex gap-1 p-1" role="tablist">
              <button
                role="tab"
                :aria-selected="activeTab === 'materials'"
                @click="activeTab = 'materials'"
                :class="[
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  activeTab === 'materials' ? 'bg-brand-50 text-brand-700' : 'text-surface-600 hover:bg-surface-100',
                ]"
              >
                <Icon name="Grid" size="sm" class="inline mr-1.5" />
                Materials
                <span class="ml-2 px-2 py-0.5 text-[10px] font-medium rounded-full bg-surface-100 text-surface-600">
                  {{ materialsTotal }}
                </span>
              </button>
              <button
                role="tab"
                :aria-selected="activeTab === 'packs'"
                @click="activeTab = 'packs'"
                :class="[
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  activeTab === 'packs' ? 'bg-brand-50 text-brand-700' : 'text-surface-600 hover:bg-surface-100',
                ]"
              >
                <Icon name="FolderOpen" size="sm" class="inline mr-1.5" />
                Packs
                <span class="ml-2 px-2 py-0.5 text-[10px] font-medium rounded-full bg-surface-100 text-surface-600">
                  {{ packsTotal }}
                </span>
              </button>
            </nav>
          </div>

          <!-- Materials Tab -->
          <div v-if="activeTab === 'materials'" class="p-4">
            <!-- Filter Bar -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div class="flex items-center gap-2 flex-wrap">
                <label for="type-filter" class="text-sm text-surface-600">Filter by type:</label>
                <select
                  id="type-filter"
                  v-model="materialTypeFilter"
                  @change="fetchMaterials"
                  class="input w-auto py-1.5 pl-3 pr-8 text-sm"
                >
                  <option value="">All Types</option>
                  <option value="chart">Chart</option>
                  <option value="trade_screenshot">Trade Screenshot</option>
                  <option value="text_note">Text Note</option>
                  <option value="news">News</option>
                  <option value="promo_asset">Promo Asset</option>
                  <option value="logo">Logo</option>
                  <option value="document">Document</option>
                </select>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="search"
                  v-model="searchQuery"
                  @input="debouncedSearch"
                  placeholder="Search materials..."
                  class="input w-64 py-1.5 pl-9"
                  :leading-icon="'Search'"
                />
                <Button variant="ghost" size="sm" @click="refreshMaterials">
                  <Icon name="RefreshCw" size="sm" />
                </Button>
              </div>
            </div>

            <!-- Materials Grid -->
            <div v-if="materialsLoading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div v-for="i in 8" :key="i" class="animate-pulse">
                <Card>
                  <div class="aspect-square bg-surface-100 rounded-t-xl" />
                  <div class="p-4 space-y-3">
                    <div class="h-4 bg-surface-200 rounded w-3/4" />
                    <div class="h-3 bg-surface-200 rounded w-1/2" />
                    <div class="h-3 bg-surface-200 rounded w-1/3" />
                  </div>
                </Card>
              </div>
            </div>

            <div v-else-if="materials.length === 0" class="text-center py-12">
              <Icon name="Inbox" size="xl" class="text-surface-300 mx-auto mb-3" />
              <p class="text-surface-500 mb-4">No materials yet</p>
              <Button variant="primary" @click="navigateToUpload">
                <Icon name="Upload" size="sm" />
                Upload Your First Material
              </Button>
            </div>

            <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <MaterialCard
                v-for="material in materials"
                :key="material.id"
                :material="material"
                @click="openMaterialDetail"
                @extract="handleExtract"
                @add-to-pack="handleAddToPack"
                @delete="handleDeleteMaterial"
              />
            </div>

            <!-- Pagination -->
            <div v-if="materialsTotal > materialsPageSize" class="mt-6 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                :disabled="materialsPage === 1"
                @click="materialsPage--; fetchMaterials()"
              >
                <Icon name="ChevronLeft" size="sm" />
              </Button>
              <span class="px-3 text-sm text-surface-600">
                Page {{ materialsPage }} of {{ Math.ceil(materialsTotal / materialsPageSize) }}
              </span>
              <Button
                variant="outline"
                size="sm"
                :disabled="materialsPage * materialsPageSize >= materialsTotal"
                @click="materialsPage++; fetchMaterials()"
              >
                <Icon name="ChevronRight" size="sm" />
              </Button>
            </div>
          </div>

          <!-- Packs Tab -->
          <div v-else class="p-4">
            <div v-if="packsLoading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div v-for="i in 6" :key="i" class="animate-pulse">
                <Card>
                  <div class="p-5 space-y-3">
                    <div class="h-4 bg-surface-200 rounded w-1/2" />
                    <div class="h-3 bg-surface-200 rounded w-1/3" />
                    <div class="h-3 bg-surface-200 rounded w-1/4" />
                  </div>
                </Card>
              </div>
            </div>

            <div v-else-if="packs.length === 0" class="text-center py-12">
              <Icon name="FolderOpen" size="xl" class="text-surface-300 mx-auto mb-3" />
              <p class="text-surface-500 mb-4">No source packs yet</p>
              <Button variant="primary" @click="createNewPack">
                <Icon name="Plus" size="sm" />
                Create Your First Pack
              </Button>
            </div>

            <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <SourcePackCard
                v-for="pack in packs"
                :key="pack.id"
                :pack="pack"
                @click="openPackDetail"
                @open="openPackDetail"
                @add-materials="handleAddMaterialsToPack"
                @delete="handleDeletePack"
              />
            </div>

            <!-- Pagination -->
            <div v-if="packsTotal > packsPageSize" class="mt-6 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                :disabled="packsPage === 1"
                @click="packsPage--; fetchPacks()"
              >
                <Icon name="ChevronLeft" size="sm" />
              </Button>
              <span class="px-3 text-sm text-surface-600">
                Page {{ packsPage }} of {{ Math.ceil(packsTotal / packsPageSize) }}
              </span>
              <Button
                variant="outline"
                size="sm"
                :disabled="packsPage * packsPageSize >= packsTotal"
                @click="packsPage++; fetchPacks()"
              >
                <Icon name="ChevronRight" size="sm" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </MainLayout>
</template>

/// <reference types="@vue/runtime-dom" />
/// <reference lib="dom" />

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import MainLayout from '~/components/layout/MainLayout.vue';
import Card from '~/components/ui/Card.vue';
import Button from '~/components/ui/Button.vue';
import Badge from '~/components/ui/Badge.vue';
import Icon from '~/components/ui/Icon.vue';
import MaterialCard from '~/components/source-room/MaterialCard.vue';
import SourcePackCard from '~/components/source-room/SourcePackCard.vue';
import { useMaterials } from '~/composables/useMaterials';
import { useSourcePacks } from '~/composables/useSourcePacks';

type MaterialType = 'chart' | 'trade_screenshot' | 'text_note' | 'news' | 'promo_asset' | 'logo' | 'document';

const router = useRouter();

const {
  materials,
  loading: materialsLoading,
  error: materialsError,
  list: fetchMaterialsList,
  remove: deleteMaterial,
} = useMaterials();

const {
  packs,
  loading: packsLoading,
  error: packsError,
  list: fetchPacksList,
  create: createPack,
  remove: deletePack,
} = useSourcePacks();

const activeTab = ref<'materials' | 'packs'>('materials');

const materialsPage = ref(1);
const materialsPageSize = 20;
const materialsTotal = ref(0);
const materialTypeFilter = ref<MaterialType | ''>('');
const searchQuery = ref('');

const packsPage = ref(1);
const packsPageSize = 20;
const packsTotal = ref(0);

const totalMaterials = computed(() => materialsTotal.value);
const totalPacks = computed(() => packsTotal.value);
const chartsCount = computed(() => materials.value.filter(m => m.type === 'chart').length);
const notesCount = computed(() => materials.value.filter(m => ['text_note', 'document', 'news'].includes(m.type)).length);

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    materialsPage.value = 1;
    fetchMaterials();
  }, 300);
}

async function fetchMaterials() {
  try {
    const res = await fetchMaterialsList({
      page: materialsPage.value,
      pageSize: materialsPageSize,
      type: materialTypeFilter.value || undefined,
    });
    materialsTotal.value = res.total;
  } catch (err) {
    console.error('Failed to fetch materials:', err);
  }
}

async function fetchPacks() {
  try {
    const res = await fetchPacksList({
      page: packsPage.value,
      pageSize: packsPageSize,
    });
    packsTotal.value = res.total;
  } catch (err) {
    console.error('Failed to fetch packs:', err);
  }
}

async function refreshMaterials() {
  materialsPage.value = 1;
  await fetchMaterials();
}

async function handleExtract(material: any) {
  try {
    const { extract } = useMaterials();
    await extract(material.id, { type: 'chart' });
    await fetchMaterials();
  } catch (err) {
    console.error('Extract failed:', err);
  }
}

async function handleAddToPack(material: any) {
  // Open modal to select pack - for now navigate to packs tab
  activeTab.value = 'packs';
  // Could emit event to parent to open modal
}

async function handleDeleteMaterial(material: any) {
  if (!window.confirm(`Delete "${material.title}"? This cannot be undone.`)) return;
  try {
    await deleteMaterial(material.id);
    await fetchMaterials();
  } catch (err) {
    console.error('Delete failed:', err);
  }
}

async function handleAddMaterialsToPack(pack: any) {
  router.push(`/source-room/${pack.id}`);
}

async function handleDeletePack(pack: any) {
  if (!window.confirm(`Delete pack "${pack.name}"? Materials will not be deleted.`)) return;
  try {
    await deletePack(pack.id);
    await fetchPacks();
  } catch (err) {
    console.error('Delete pack failed:', err);
  }
}

function navigateToUpload() {
  router.push('/source-room/upload');
}

function createNewPack() {
  // Open modal for pack creation
  const name = window.prompt('Enter pack name:');
  if (name?.trim()) {
    createPack({ name: name.trim() }).then(() => {
      fetchPacks();
      activeTab.value = 'packs';
    });
  }
}

function openMaterialDetail(material: any) {
  // Could open a detail modal or navigate
  console.log('Open material:', material.id);
}

function openPackDetail(pack: any) {
  router.push(`/source-room/${pack.id}`);
}

onMounted(() => {
  fetchMaterials();
  fetchPacks();
});

watch(activeTab, (newTab) => {
  if (newTab === 'materials' && materials.value.length === 0) fetchMaterials();
  if (newTab === 'packs' && packs.value.length === 0) fetchPacks();
});
</script>