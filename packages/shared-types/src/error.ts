// 统一错误契约（API → Web/Mobile）
// 服务端异常一律输出 ApiErrorBody；客户端 ApiError 解析后按 reason 分支处理。

export interface ApiErrorBody {
  error: string;
  reason?: string;
  fields?: Record<string, string>;
}

/** 与业务模块无关的通用 reason（服务端全局异常过滤器与客户端共用） */
export const ERROR_REASON = {
  /** 请求 DTO 校验失败；具体字段与原文见 `fields` */
  VALIDATION_FAILED: 'validation_failed',
  /** 未预期的服务端异常 */
  INTERNAL: 'internal_error',
} as const;
export type ErrorReason = (typeof ERROR_REASON)[keyof typeof ERROR_REASON];

/** 客户端异常（Web/Mobile 共用） */
export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.reason ?? body.error ?? `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  get reason(): string | undefined {
    return this.body.reason;
  }
}

/** 仅依赖 fetch 响应的结构性子集（避免共享包依赖 DOM/Node 类型） */
export interface ApiResponseLike {
  status: number;
  json(): Promise<unknown>;
}

/** 从任意 fetch 响应解析 ApiError；非 JSON 时兜底 */
export async function toApiError(response: ApiResponseLike): Promise<ApiError> {
  let body: ApiErrorBody = { error: 'unknown' };
  try {
    const parsed = (await response.json()) as ApiErrorBody;
    if (parsed && typeof parsed.error === 'string') body = parsed;
  } catch {
    body = { error: 'non_json_response' };
  }
  return new ApiError(response.status, body);
}
