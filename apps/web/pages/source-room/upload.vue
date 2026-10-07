<template>
  <MainLayout>
    <template #default>
      <div class="max-w-3xl mx-auto space-y-6 animate-fade-in">
        <!-- Page Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-surface-900">Upload Material</h1>
            <p class="text-surface-500 mt-1">Add new creator materials to your Source Room</p>
          </div>
          <Button variant="ghost" @click="goBack">
            <Icon name="ArrowLeft" size="sm" />
            Back to Source Room
          </Button>
        </div>

        <Card>
          <form @submit.prevent="handleSubmit" class="space-y-6">
            <!-- Upload Dropzone -->
            <div>
              <label class="label">Files</label>
              <UploadDropzone
                ref="dropzoneRef"
                :accept="acceptTypes"
                :max-size-mb="25"
                :multiple="true"
                @files-selected="onFilesSelected"
                @file-error="onFileError"
              />
              <p v-if="fileErrors.length > 0" class="mt-2 text-sm text-error-500">
                {{ fileErrors.length }} file(s) rejected: {{ fileErrors.map(e => e.error).join(', ') }}
              </p>
            </div>

            <!-- File Details Form (shown when files selected) -->
            <div v-if="selectedFiles.length > 0" class="space-y-4 border-t border-surface-200 pt-6">
              <h3 class="font-medium text-surface-900">File Details</h3>

              <div v-for="(file, index) in selectedFiles" :key="`file-${index}-${file.name}-${file.size}`" class="space-y-4 p-4 bg-surface-50 rounded-lg">
                <div class="flex items-center gap-3">
                  <Icon :name="getFileIcon(file)" size="lg" :class="getFileIconColor(file)" />
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-surface-900 truncate">{{ file.name }}</p>
                    <p class="text-sm text-surface-500">{{ formatFileSize(file.size) }}</p>
                  </div>
                  <Badge variant="success" size="sm">Ready</Badge>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-surface-200">
                  <div>
                    <Input
                      v-model="fileTitles[index]"
                      :id="`title-${index}`"
                      label="Title"
                      placeholder="Auto-filled from filename"
                      class="w-full"
                    />
                  </div>
                  <div>
                    <label :for="`type-${index}`" class="label">Type</label>
                    <select
                      :id="`type-${index}`"
                      v-model="fileTypes[index]"
                      class="input"
                    >
                      <option value="">Auto-detect</option>
                      <option value="chart">Chart</option>
                      <option value="trade_screenshot">Trade Screenshot</option>
                      <option value="text_note">Text Note</option>
                      <option value="news">News</option>
                      <option value="promo_asset">Promo Asset</option>
                      <option value="logo">Logo</option>
                      <option value="document">Document</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Pack Assignment -->
              <div class="space-y-3">
                <label class="label">Add to Source Pack (optional)</label>
                <div class="flex flex-col sm:flex-row gap-3">
                  <select
                    v-model="existingPackId"
                    class="input flex-1"
                    @change="newPackName = ''"
                  >
                    <option value="">-- Select existing pack --</option>
                    <option v-for="pack in availablePacks" :key="pack.id" :value="pack.id">
                      {{ pack.name }} ({{ pack.itemCount ?? 0 }} items)
                    </option>
                  </select>
                  <Input
                    v-model="newPackName"
                    placeholder="Or create new pack name..."
                    class="flex-1"
                    @input="existingPackId = ''"
                  />
                </div>
              </div>
            </div>

            <!-- Submit Actions -->
            <div v-if="selectedFiles.length > 0" class="flex flex-col sm:flex-row sm:justify-end gap-3 pt-4 border-t border-surface-200">
              <Button variant="secondary" @click="clearFiles">
                <Icon name="X" size="sm" />
                Clear All
              </Button>
              <Button
                variant="primary"
                type="submit"
                :loading="uploading"
                :disabled="uploading || selectedFiles.length === 0"
              >
                <Icon name="Upload" size="sm" />
                Upload {{ selectedFiles.length }} File{{ selectedFiles.length !== 1 ? 's' : '' }}
              </Button>
            </div>

            <div v-else class="text-center py-8 text-surface-500">
              <Icon name="Upload" size="xl" class="mx-auto mb-3 text-surface-300" />
              <p>Drag & drop files above or click to browse</p>
            </div>
          </form>
        </Card>

        <!-- Upload Progress / Results -->
        <Card v-if="uploadResults.length > 0" variant="outlined">
          <template #header>
            <h3 class="font-semibold text-surface-900">Upload Results</h3>
          </template>
          <div class="space-y-3">
            <div
              v-for="(result, index) in uploadResults"
              :key="index"
              class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg"
            >
              <div
                :class="[
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                  result.success ? 'bg-green-100' : 'bg-red-100',
                ]"
              >
                <Icon
                  :name="result.success ? 'Check' : 'X'"
                  size="sm"
                  :class="result.success ? 'text-green-600' : 'text-red-600'"
                />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-medium text-sm text-surface-900 truncate">{{ result.fileName }}</p>
                <p class="text-xs text-surface-500">{{ result.message }}</p>
              </div>
              <Button
                v-if="result.success && result.material"
                variant="ghost"
                size="sm"
                @click="navigateToPack(result.material)"
              >
                View
              </Button>
            </div>
            <div class="flex justify-end pt-2">
              <Button variant="secondary" @click="clearResults">
                Clear Results
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </template>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import MainLayout from '~/components/layout/MainLayout.vue';
import UploadDropzone from '~/components/source-room/UploadDropzone.vue';
import Card from '~/components/ui/Card.vue';
import Button from '~/components/ui/Button.vue';
import Input from '~/components/ui/Input.vue';
import Icon from '~/components/ui/Icon.vue';
import { useMaterials } from '~/composables/useMaterials';
import { useSourcePacks } from '~/composables/useSourcePacks';
import type { CreatorMaterial, MaterialType } from '~/composables/useMaterials';

/// <reference types="@vue/runtime-dom" />
/// <reference lib="dom" />

const router = useRouter();
const route = useRoute();

const {
  upload,
  loading: uploading,
  error: uploadError,
} = useMaterials();

const {
  packs: availablePacks,
  list: fetchPacks,
  loading: packsLoading,
} = useSourcePacks();

const dropzoneRef = ref<InstanceType<typeof UploadDropzone> | null>(null);

const selectedFiles = ref<File[]>([]);
const fileTitles = ref<string[]>([]);
const fileTypes = ref<(MaterialType | '')[]>([]);
const fileErrors = ref<Array<{ file: File; error: string }>>([]);

const existingPackId = ref('');
const newPackName = ref('');

const uploadResults = ref<Array<{
  fileName: string;
  success: boolean;
  message: string;
  material?: CreatorMaterial;
}>>([]);

const acceptTypes = 'image/*,.pdf,.txt,.md,.json';

async function onFilesSelected(files: File[]) {
  selectedFiles.value = [...selectedFiles.value, ...files];
  fileTitles.value = [...fileTitles.value, ...files.map(f => f.name.replace(/\.[^/.]+$/, ''))];
  fileTypes.value = [...fileTypes.value, ...files.map(() => '' as MaterialType | '')];
  fileErrors.value = [];
}

function onFileError(file: File, error: string) {
  fileErrors.value.push({ file, error });
}

function getFileIcon(file: File): string {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return 'Image';
  if (ext === '.pdf') return 'FileText';
  if (['.txt', '.md'].includes(ext)) return 'FileText';
  if (ext === '.json') return 'FileJson';
  return 'File';
}

function getFileIconColor(file: File): string {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return 'text-emerald-600';
  if (ext === '.pdf') return 'text-red-600';
  if (['.txt', '.md'].includes(ext)) return 'text-blue-600';
  if (ext === '.json') return 'text-amber-600';
  return 'text-surface-500';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function handleSubmit() {
  if (selectedFiles.value.length === 0) return;

  const results = [];
  for (let i = 0; i < selectedFiles.value.length; i++) {
    const file = selectedFiles.value[i];
    const title = fileTitles.value[i] || file.name.replace(/\.[^/.]+$/, '');
    const type = fileTypes.value[i] || undefined;

    try {
      const material = await upload(file, {
        title,
        type,
        sourcePackId: existingPackId.value || undefined,
        newSourcePackName: newPackName.value || undefined,
      });
      results.push({
        fileName: file.name,
        success: true,
        message: 'Uploaded successfully',
        material,
      });
    } catch (err: unknown) {
      const apiErr = err as { data?: { error?: { message: string } }; message?: string };
      results.push({
        fileName: file.name,
        success: false,
        message: apiErr?.data?.error?.message || apiErr?.message || 'Upload failed',
      });
    }
  }

  uploadResults.value = [...uploadResults.value, ...results];
  clearFiles();
}

function clearFiles() {
  selectedFiles.value = [];
  fileTitles.value = [];
  fileTypes.value = [];
  fileErrors.value = [];
  dropzoneRef.value?.clearFiles?.();
}

function clearResults() {
  uploadResults.value = [];
}

function navigateToPack(material: CreatorMaterial) {
  // Navigate to pack if material was added to one, or just go back to index
  router.push('/source-room');
}

function goBack() {
  router.push('/source-room');
}

onMounted(() => {
  fetchPacks({ page: 1, pageSize: 100 });
});
</script>