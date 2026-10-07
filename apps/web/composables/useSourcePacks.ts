import type { Classification, MaterialType } from './useMaterials';

export interface SourcePack {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
}

export interface SourcePackWithItems extends SourcePack {
  items: SourcePackItem[];
}

export interface SourcePackItem {
  id: string;
  sourcePackId: string;
  materialId: string;
  sortOrder: number;
  notes: string | null;
  createdAt: string;
  material?: {
    id: string;
    type: MaterialType;
    title: string;
    classification: Classification;
    createdAt: string;
    fileAsset?: {
      id: string;
      key: string;
      url?: string;
      mimeType: string;
      sizeBytes: number;
    };
  };
}

export interface CreateSourcePackOptions {
  name: string;
  description?: string;
  materialIds?: string[];
}

export interface AddItemsOptions {
  materialIds: string[];
  sortOrder?: number;
}

export interface ReorderItem {
  materialId: string;
  sortOrder: number;
}

export function useSourcePacks() {
  const packs = ref<SourcePack[]>([]);
  const currentPack = ref<SourcePackWithItems | null>(null);
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

  async function list(params: { page?: number; pageSize?: number } = {}): Promise<{ rows: SourcePack[]; total: number; page: number; pageSize: number }> {
    loading.value = true;
    error.value = null;
    try {
      const query = new URLSearchParams();
      if (params.page) query.set('page', String(params.page));
      if (params.pageSize) query.set('pageSize', String(params.pageSize));

      const response = await $fetch<{ success: boolean; data: { rows: SourcePack[]; total: number; page: number; pageSize: number } }>(
        `${apiBase}/api/source-packs?${query.toString()}`,
        { credentials: 'include' }
      );
      packs.value = response.data.rows;
      return response.data;
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Failed to fetch source packs';
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function create(options: CreateSourcePackOptions): Promise<SourcePackWithItems> {
    loading.value = true;
    error.value = null;
    try {
      const response = await $fetch<{ success: boolean; data: SourcePackWithItems }>(
        `${apiBase}/api/source-packs`,
        {
          method: 'POST',
          body: options,
          credentials: 'include',
        }
      );
      packs.value.unshift(response.data);
      return response.data;
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Failed to create source pack';
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getById(id: string): Promise<SourcePackWithItems> {
    loading.value = true;
    error.value = null;
    try {
      const response = await $fetch<{ success: boolean; data: SourcePackWithItems }>(
        `${apiBase}/api/source-packs/${id}`,
        { credentials: 'include' }
      );
      currentPack.value = response.data;
      return response.data;
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Failed to fetch source pack';
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function update(id: string, patch: { name?: string; description?: string }): Promise<SourcePack> {
    loading.value = true;
    error.value = null;
    try {
      const response = await $fetch<{ success: boolean; data: SourcePack }>(
        `${apiBase}/api/source-packs/${id}`,
        {
          method: 'PATCH',
          body: patch,
          credentials: 'include',
        }
      );
      const idx = packs.value.findIndex(p => p.id === id);
      if (idx >= 0) packs.value[idx] = response.data;
      if (currentPack.value?.id === id) {
        currentPack.value = { ...currentPack.value, ...response.data };
      }
      return response.data;
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Failed to update source pack';
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
      await $fetch(`${apiBase}/api/source-packs/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      packs.value = packs.value.filter(p => p.id !== id);
      if (currentPack.value?.id === id) currentPack.value = null;
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Failed to delete source pack';
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function addItems(packId: string, options: AddItemsOptions): Promise<SourcePackWithItems> {
    loading.value = true;
    error.value = null;
    try {
      const response = await $fetch<{ success: boolean; data: SourcePackWithItems }>(
        `${apiBase}/api/source-packs/${packId}/items`,
        {
          method: 'POST',
          body: options,
          credentials: 'include',
        }
      );
      if (currentPack.value?.id === packId) {
        currentPack.value = response.data;
      }
      return response.data;
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Failed to add items to pack';
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function removeItem(packId: string, materialId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await $fetch(`${apiBase}/api/source-packs/${packId}/items/${materialId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (currentPack.value?.id === packId) {
        currentPack.value = {
          ...currentPack.value,
          items: currentPack.value.items.filter(i => i.materialId !== materialId),
        };
      }
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Failed to remove item from pack';
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function reorder(packId: string, order: ReorderItem[]): Promise<SourcePackWithItems> {
    loading.value = true;
    error.value = null;
    try {
      const response = await $fetch<{ success: boolean; data: SourcePackWithItems }>(
        `${apiBase}/api/source-packs/${packId}/items/reorder`,
        {
          method: 'PATCH',
          body: { order },
          credentials: 'include',
        }
      );
      if (currentPack.value?.id === packId) {
        currentPack.value = response.data;
      }
      return response.data;
    } catch (err: unknown) {
      const apiErr = err as ApiErrorResponse;
      const msg = apiErr?.data?.error?.message || apiErr?.message || 'Failed to reorder items';
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    packs,
    currentPack,
    loading,
    error,
    list,
    create,
    getById,
    update,
    remove,
    addItems,
    removeItem,
    reorder,
  };
}