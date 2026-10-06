import { useEffect, useState } from 'react';
import { filesApi } from '../lib/api/files';

/**
 * 一次取回多张已上传图片的 blob URL（鉴权接口，`<img>` 带不了 Bearer）。
 * 返回 ``{ [questionId]: objectURL }``；失败/为空的项不出现（界面自行降级）。
 */
export function useAuthedImages(entries: { id: string; key: string | null | undefined }[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const signature = entries.map((e) => `${e.id}:${e.key ?? ''}`).join('|');

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    const targets = entries.filter((e) => e.key);
    if (targets.length === 0) {
      setUrls({});
      return;
    }
    void Promise.all(
      targets.map(async (entry) => {
        try {
          const url = await filesApi.objectUrl(entry.key as string);
          created.push(url);
          return [entry.id, url] as const;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) {
        created.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      const next: Record<string, string> = {};
      for (const result of results) if (result) next[result[0]] = result[1];
      setUrls(next);
    });
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
    // signature 覆盖 id/key 变化，避免把 entries 数组当依赖导致反复请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return urls;
}
