// 通用契约（P0）

/** 健康检查响应 */
export interface HealthResponse {
  status: 'ok';
  version: string;
  uptime: number;
  db: 'up' | 'down';
}

/** 环境标识（客户端用于日志/调试） */
export type AppEnv = 'development' | 'production';
