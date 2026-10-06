import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ERROR_REASON } from '@huahua/shared-types';
import { Response } from 'express';

/** Nest 默认 400 体（class-validator）形状 */
interface DefaultBadRequestBody {
  message?: unknown;
}

/**
 * 全局异常过滤器：把响应体统一为契约 `{ error, reason, fields? }`
 * （docs/client-architecture.md §「错误体」、packages/shared-types/src/error.ts）。
 *
 * 背景：Nest 默认对 ValidationPipe 的失败返回 `{statusCode,message[],error}`，
 * 其中既没有 `reason` 也没有字段映射，客户端只能显示 "Bad Request"（无法告知用户哪一项不合法）。
 *
 * 行为：
 *  - 业务代码显式抛出的契约体（含 `error` 字段，如 `{error,reason}` / `{error,reason,fields}`）→ 原样输出
 *  - class-validator 的 `message: string[]` → `{error:'bad_request', reason:'validation_failed', fields:{字段: 原文}}`
 *  - 其余 → `{error:'error', reason:<message>}`
 *  - 未预期异常 → 500 `{error:'internal_error', reason:'internal_error'}` 并记录日志（不泄露堆栈）
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // 注意顺序：Nest 对 ValidationPipe 失败返回的默认体同样带 `error: 'Bad Request'` 字段，
      // 若先判"含 error 即透传"就永远不会归一化 —— 必须先识别 message 数组这一特征。
      if (
        payload !== null &&
        typeof payload === 'object' &&
        Array.isArray((payload as DefaultBadRequestBody).message)
      ) {
        const messages = ((payload as DefaultBadRequestBody).message as unknown[]).map((m) => String(m));
        res.status(status).json({
          error: status === HttpStatus.BAD_REQUEST ? 'bad_request' : 'error',
          reason: ERROR_REASON.VALIDATION_FAILED,
          fields: this.toFields(messages),
        });
        return;
      }

      // 已是契约体（含 error 字段）→ 原样输出；未知路由的 404 也走这里
      if (payload !== null && typeof payload === 'object' && 'error' in payload) {
        res.status(status).json(payload);
        return;
      }

      const reason =
        typeof payload === 'string'
          ? payload
          : typeof (payload as DefaultBadRequestBody | null)?.message === 'string'
            ? String((payload as DefaultBadRequestBody).message)
            : exception.message;
      res.status(status).json({ error: 'error', reason });
      return;
    }

    const message = exception instanceof Error ? exception.message : String(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;
    this.logger.error(`未处理异常: ${message}`, stack);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'internal_error',
      reason: ERROR_REASON.INTERNAL,
    });
  }

  /** 从 class-validator 文案中提取字段名（文案首词即属性名），同字段多条用 ; 连接 */
  private toFields(messages: string[]): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const message of messages) {
      const index = message.indexOf(' ');
      const field = index > 0 ? message.slice(0, index) : '_';
      fields[field] = fields[field] ? `${fields[field]}; ${message}` : message;
    }
    return fields;
  }
}
