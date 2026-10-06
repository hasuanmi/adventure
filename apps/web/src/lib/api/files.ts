import { IMAGE_COMPRESS_MAX_BYTES, IMAGE_COMPRESS_MAX_EDGE, StoredFileDto } from '@huahua/shared-types';
import { getAccessToken } from '../../store/auth';
import { API_BASE, request } from './client';

/** 上传文件（本项目新增接口；上游是 base64 直存 DB） */
export const filesApi = {
  upload: async (file: File, scope = 'wrong-question'): Promise<StoredFileDto> => {
    const form = new FormData();
    form.append('file', file);
    return request<StoredFileDto>(`/files?scope=${encodeURIComponent(scope)}`, {
      method: 'POST',
      body: form,
    });
  },
  /** 带鉴权取回图片 → objectURL（<img> 无法带 Bearer，故走 blob） */
  objectUrl: async (key: string): Promise<string> => {
    const res = await fetch(`${API_BASE}/files?key=${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
    });
    if (!res.ok) throw new Error('图片加载失败');
    return URL.createObjectURL(await res.blob());
  },
};

/**
 * 前端压缩（对齐上游 upload-zone：最长边 1920、质量 0.8、目标 ≤1MB）。
 * 失败时回退原文件（不阻断上传）。
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_COMPRESS_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    for (const quality of [0.8, 0.6, 0.4]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && (blob.size <= IMAGE_COMPRESS_MAX_BYTES || quality === 0.4)) {
        return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
      }
    }
    return file;
  } catch {
    return file;
  }
}
