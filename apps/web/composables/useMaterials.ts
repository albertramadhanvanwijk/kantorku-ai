export type MaterialType = 'chart' | 'trade_screenshot' | 'text_note' | 'news' | 'promo_asset' | 'logo' | 'document';

export interface FileAsset {
  id: string;
  key: string;
  url?: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storageDriver: string;
  bucket: string | null;
  uploadedBy: string;
  createdAt: string;
}

export interface Classification {
  userDeclared: MaterialType | null;
  aiVerified: MaterialType | null;
  confidence: number | null;
  reasoning: string | null;
  verifiedAt: string | null;
}

export interface Provenance {
  uploadedAt: string;
  userId: string;
}

export interface CreatorMaterial {
  id: string;
  type: MaterialType;
  title: string;
  fileAssetId: string;
  metadata: Record<string, unknown> | null;
  classification: Classification;
  provenance: Provenance;
  createdAt: string;
  updatedAt: string;
  fileAsset?: FileAsset;
}

export interface UploadMeta {
  title?: string;
  type?: MaterialType;
  sourcePackId?: string;
  newSourcePackName?: string;
}

export interface MaterialsListParams {
  page?: number;
  pageSize?: number;
  type?: MaterialType;
  sourcePackId?: string;
}

export interface MaterialsListResponse {
  rows: CreatorMaterial[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ExtractOptions {
  type?: 'chart' | 'text' | 'trade';
}

export function useMaterials() {
  const materials = ref<CreatorMaterial[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const apiBase = useRuntimeConfig().public.apiBase;

  interface ApiErrorResponse {
    data?: {
      error?: {
        message: string;
      };
    };
    message?: string;
  }

  async function list(params: MaterialsListParams = {}): Promise<MaterialsListResponse> {
    loading.value = true;
    error.value = null;
    try {
      const query = new URLSearchParams();
      if (params.page) query.set('page', String(params.page));
      if (params.pageSize) query.set('pageSize', String(params.pageSize));
      if (params.type) query.set('type', params.type);
      if (params.sourcePackId) query.set('sourcePackId', params.sourcePackId);

      const response = await $fetch<{ success: boolean; data: MaterialsListResponse }>(
        `${apiBase}/api/materials?${query.toString()}`,
        { credentials: 'include' }
      );
      materials.value = response.data.rows;
      return response.data;
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Failed to fetch materials';
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function upload(file: File, meta: UploadMeta): Promise<CreatorMaterial> {
    loading.value = true;
    error.value = null;
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (meta.title) formData.append('title', meta.title);
      if (meta.type) formData.append('type', meta.type);
      if (meta.sourcePackId) formData.append('sourcePackId', meta.sourcePackId);
      if (meta.newSourcePackName) formData.append('newSourcePackName', meta.newSourcePackName);

      const response = await $fetch<{ success: boolean; data: { material: CreatorMaterial; fileAsset: FileAsset } }>(
        `${apiBase}/api/materials/upload`,
        {
          method: 'POST',
          body: formData,
          credentials: 'include',
        }
      );
      // Add to local list
      materials.value.unshift(response.data.material);
      return response.data.material;
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Upload failed';
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getById(id: string): Promise<CreatorMaterial> {
    loading.value = true;
    error.value = null;
    try {
      const response = await $fetch<{ success: boolean; data: CreatorMaterial }>(
        `${apiBase}/api/materials/${id}`,
        { credentials: 'include' }
      );
      return response.data;
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Failed to fetch material';
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function extract(id: string, options: ExtractOptions = {}): Promise<CreatorMaterial> {
    loading.value = true;
    error.value = null;
    try {
      const response = await $fetch<{ success: boolean; data: CreatorMaterial }>(
        `${apiBase}/api/materials/${id}/extract`,
        {
          method: 'POST',
          body: options,
          credentials: 'include',
        }
      );
      // Update local cache
      const idx = materials.value.findIndex(m => m.id === id);
      if (idx >= 0) materials.value[idx] = response.data;
      return response.data;
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Extraction failed';
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function classify(id: string): Promise<CreatorMaterial> {
    loading.value = true;
    error.value = null;
    try {
      const response = await $fetch<{ success: boolean; data: CreatorMaterial }>(
        `${apiBase}/api/materials/${id}/classify`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );
      const idx = materials.value.findIndex(m => m.id === id);
      if (idx >= 0) materials.value[idx] = response.data;
      return response.data;
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Classification failed';
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function update(id: string, patch: { title?: string; type?: MaterialType; metadata?: Record<string, unknown> }): Promise<CreatorMaterial> {
    loading.value = true;
    error.value = null;
    try {
      const response = await $fetch<{ success: boolean; data: CreatorMaterial }>(
        `${apiBase}/api/materials/${id}`,
        {
          method: 'PATCH',
          body: patch,
          credentials: 'include',
        }
      );
      const idx = materials.value.findIndex(m => m.id === id);
      if (idx >= 0) materials.value[idx] = response.data;
      return response.data;
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Update failed';
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function remove(id: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await $fetch(`${apiBase}/api/materials/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      materials.value = materials.value.filter(m => m.id !== id);
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Delete failed';
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    materials,
    loading,
    error,
    list,
    upload,
    getById,
    extract,
    classify,
    update,
    remove,
  };
}