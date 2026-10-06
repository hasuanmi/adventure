import { useEffect, useState } from 'react';
import { filesApi } from '../lib/api/files';

/**
 * 取回已上传图片的 blob URL（存储接口需要鉴权，`<img>` 带不了 Bearer）。
 * key 为空或取回失败时返回 null（界面自行降级）。
 */
export function useAuthedImage(key: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!key) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    void filesApi
      .objectUrl(key)
      .then((objectUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        created = objectUrl;
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [key]);

  return url;
}
