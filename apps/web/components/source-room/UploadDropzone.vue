<template>
  <div
    :class="[
      'relative border-2 border-dashed rounded-xl transition-all duration-200',
      isDragging ? 'border-brand-500 bg-brand-50' : 'border-surface-300 hover:border-brand-400',
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    ].join(' ')"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
    role="button"
    tabindex="0"
    aria-label="File upload dropzone"
  >
    <input
      :ref="setFileInputEl"
      type="file"
      :multiple="multiple"
      :accept="accept"
      class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      @change="onFileSelect"
      @click.stop
      :disabled="disabled"
      aria-hidden="true"
    />

    <div class="flex flex-col items-center justify-center p-8 text-center">
      <div class="w-16 h-16 rounded-full bg-surface-100 flex items-center justify-center mb-4" :class="isDragging ? 'bg-brand-100' : ''">
        <Icon :name="isDragging ? 'CheckCircle2' : 'Upload'" size="xl" :class="isDragging ? 'text-brand-600' : 'text-surface-500'" />
      </div>

      <p v-if="!isDragging" class="text-surface-600 mb-1">
        <span class="font-medium text-surface-900">Drag & drop</span> files here, or click to browse
      </p>
      <p v-else class="text-brand-600 font-medium mb-1">Drop files to upload</p>

      <p v-if="accept" class="text-sm text-surface-500 mb-4">
        Accepted: {{ formatAccept(accept) }}
      </p>
      <p v-if="maxSizeMb" class="text-sm text-surface-500 mb-4">
        Max size: {{ maxSizeMb }} MB
      </p>

      <div v-if="selectedFiles.length > 0" class="w-full max-w-md mt-4 space-y-2 text-left">
        <div class="text-sm font-medium text-surface-700">Selected files ({{ selectedFiles.length }})</div>
        <div class="max-h-48 overflow-y-auto space-y-1.5">
          <div
            v-for="(file, index) in selectedFiles"
            :key="`${file.name}-${index}-${file.size}`"
            class="flex items-center gap-3 p-2 bg-white rounded-lg border border-surface-200"
          >
            <Icon :name="getFileIcon(file)" size="md" :class="getFileIconColor(file)" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-surface-900 truncate">{{ file.name }}</p>
              <p class="text-xs text-surface-500">{{ formatFileSize(file.size) }}</p>
            </div>
            <Badge :variant="getFileValidationVariant(file)" size="sm">
              {{ getFileValidationLabel(file) }}
            </Badge>
            <button
              type="button"
              @click.stop="removeFile(index)"
              class="btn-ghost p-1 text-surface-400 hover:text-error-500"
              aria-label="Remove file"
            >
              <Icon name="X" size="sm" />
            </button>
          </div>
        </div>
      </div>

      <slot name="progress" :files="selectedFiles" />
    </div>
  </div>
</template>

/// <reference types="@vue/runtime-dom" />
/// <reference lib="dom" />

<script setup lang="ts">
import { ref, computed, type ComponentPublicInstance } from 'vue';
import Icon from '../ui/Icon.vue';
import Badge from '../ui/Badge.vue';

interface Props {
  accept?: string;
  maxSizeMb?: number;
  multiple?: boolean;
  disabled?: boolean;
}

interface Emits {
  'files-selected': [files: File[]];
  'file-error': [file: File, error: string];
}

const props = withDefaults(defineProps<Props>(), {
  accept: 'image/*,.pdf,.txt,.md,.json',
  maxSizeMb: 25,
  multiple: true,
  disabled: false,
});

const emit = defineEmits<Emits>();

const isDragging = ref(false);
const selectedFiles = ref<File[]>([]);

const fileInputEl = ref<HTMLInputElement | null>(null);

function setFileInputEl(el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLInputElement || el === null) {
    fileInputEl.value = el;
  }
}

function handleClick() {
  if (!props.disabled && fileInputEl.value) {
    fileInputEl.value.click();
  }
}

function onDragEnter(e: DragEvent) {
  if (props.disabled) return;
  if (e.dataTransfer?.types.includes('Files')) {
    isDragging.value = true;
  }
}

function onDragOver(e: DragEvent) {
  if (props.disabled) return;
  e.preventDefault();
  if (e.dataTransfer?.types.includes('Files')) {
    e.dataTransfer.dropEffect = 'copy';
    isDragging.value = true;
  }
}

function onDragLeave(e: DragEvent) {
  if (props.disabled) return;
  if (!e.currentTarget || !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
    isDragging.value = false;
  }
}

function onDrop(e: DragEvent) {
  if (props.disabled) return;
  isDragging.value = false;
  const files = Array.from(e.dataTransfer?.files ?? []);
  processFiles(files);
}

function onFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files) {
    processFiles(Array.from(target.files));
  }
  target.value = '';
}

function processFiles(files: File[]) {
  const validFiles: File[] = [];
  for (const file of files) {
    const validation = validateFile(file);
    if (validation.valid) {
      validFiles.push(file);
    } else {
      emit('file-error', file, validation.error);
    }
  }
  if (validFiles.length > 0) {
    selectedFiles.value = [...selectedFiles.value, ...validFiles];
    emit('files-selected', validFiles);
  }
}

function validateFile(file: File): { valid: boolean; error: string } {
  if (props.maxSizeMb && file.size > props.maxSizeMb * 1024 * 1024) {
    return { valid: false, error: `File exceeds ${props.maxSizeMb} MB limit` };
  }

  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  const allowedExts = ['.png', '.jpg', '.jpeg', '.webp', '.pdf', '.txt', '.md', '.json'];
  if (!allowedExts.includes(ext)) {
    return { valid: false, error: `File type ${ext} not allowed` };
  }

  if (props.accept) {
    const acceptTypes = props.accept.split(',').map(t => t.trim());
    const mimeMatch = acceptTypes.some(acceptType => {
      if (acceptType.startsWith('.')) return acceptType === ext;
      if (acceptType.endsWith('/*')) return file.type.startsWith(acceptType.slice(0, -1));
      return file.type === acceptType;
    });
    if (!mimeMatch && file.type) {
      const extMatch = acceptTypes.some(t => t.startsWith('.') && t === ext);
      if (!extMatch) {
        return { valid: false, error: `MIME type ${file.type} not allowed` };
      }
    }
  }

  return { valid: true, error: '' };
}

function removeFile(index: number) {
  selectedFiles.value.splice(index, 1);
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

function getFileValidationVariant(file: File): 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand' {
  return 'success';
}

function getFileValidationLabel(file: File): string {
  return 'Ready';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAccept(accept: string): string {
  return accept
    .split(',')
    .map(t => t.trim())
    .map(t => (t.startsWith('.') ? t : t.replace('/*', '')))
    .join(', ');
}

defineExpose({
  selectedFiles,
  clearFiles: () => { selectedFiles.value = []; },
});
</script>