import { MASTERY_LABELS, type WrongQuestionDto } from '@huahua/shared-types';
import { subjectMeta } from './constants';

/**
 * 极简 PDF 导出（**不依赖任何第三方库，也不依赖系统打印对话框**）。
 *
 * 背景：用户反馈"文件导出失败" —— ``window.print()`` 在 WebView/宿主里常常不可用，
 * 因此这里直接生成 PDF 文件下载：把每道题按打印版式画到 canvas（中文走系统字体），
 * 再按 A4 分页、以 JPEG 页图封装成 PDF（图像页 → 无字体嵌入问题）。
 */

const A4_W = 794; // 96dpi 下的 A4 宽
const A4_H = 1123;
const MARGIN = 40;
const CONTENT_W = A4_W - MARGIN * 2;

export interface PdfExportOptions {
  items: WrongQuestionDto[];
  /** 题目图片的 objectURL（可能还没加载完） */
  imageUrls: Record<string, string | undefined>;
  show: { questionText: boolean; answer: boolean; analysis: boolean; tags: boolean };
  /** 30–100 */
  imageScale: number;
  fileName: string;
}

interface TextBlock {
  text: string;
  bold?: boolean;
  size?: number;
  color?: string;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const ch of paragraph) {
      const next = line + ch;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

/** 把一题画到当前页；放不下则新起一页。返回更新后的画布/y 位置 */
function drawQuestion(
  ctx: CanvasRenderingContext2D,
  y: number,
  index: number,
  item: WrongQuestionDto,
  image: HTMLImageElement | null,
  options: PdfExportOptions,
): number {
  ctx.fillStyle = '#000';
  ctx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
  const header = `题目 ${index + 1}`;
  ctx.fillText(header, MARGIN, y + 18);
  let x = MARGIN + ctx.measureText(header).width + 16;
  ctx.font = '14px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
  for (const meta of [
    item.subject ? subjectMeta(item.subject).label : '',
    item.gradeSemester ?? '',
    item.source ?? '',
    MASTERY_LABELS[item.masteryLevel as 0 | 1 | 2] ?? '',
  ].filter(Boolean)) {
    ctx.fillText(meta, x, y + 16);
    x += ctx.measureText(meta).width + 14;
  }
  ctx.fillText(new Date(item.createdAt).toLocaleDateString('zh-CN'), A4_W - MARGIN - 70, y + 16);
  y += 30;

  if (image) {
    const width = (CONTENT_W * options.imageScale) / 100;
    const height = (image.height / image.width) * width;
    ctx.drawImage(image, MARGIN, y, width, height);
    y += height + 14;
  }

  const blocks: TextBlock[] = [];
  if (options.show.questionText && item.questionText) blocks.push({ text: item.questionText });
  if (options.show.answer && item.answerText) blocks.push({ text: `答案：${item.answerText}`, bold: true });
  if (options.show.analysis && item.analysis) blocks.push({ text: `解析：${item.analysis}`, bold: true });
  if (options.show.tags && item.tags.length > 0) {
    blocks.push({ text: `知识点：${item.tags.map((t) => t.name).join('、')}`, size: 13 });
  }

  for (const block of blocks) {
    ctx.font = `${block.bold ? 'bold ' : ''}${block.size ?? 15}px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`;
    ctx.fillStyle = block.color ?? '#000';
    for (const line of wrapLines(ctx, block.text, CONTENT_W)) {
      if (y + 22 > A4_H - MARGIN) break;
      ctx.fillText(line, MARGIN, y + 16);
      y += 22;
    }
    y += 6;
  }

  // 答案/解析都不显示时给作答留白（与上游 shouldReserveAnswerSpace 一致）
  if (!options.show.answer && !options.show.analysis) y += 90;
  return y + 12;
}

/** 把若干 canvas 页封装为 PDF 字节流（每页一张 JPEG 图） */
function buildPdf(pages: HTMLCanvasElement[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (data: Uint8Array | string): void => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const startObject = (): void => {
    offsets.push(length);
  };

  push('%PDF-1.4\n');

  const pageCount = pages.length;
  const pageObjIds: number[] = [];
  // 1: catalog, 2: pages, 3..: 每页 page/content/image
  let nextId = 3;
  for (let i = 0; i < pageCount; i += 1) pageObjIds.push(nextId + i * 3);

  startObject();
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObject();
  const kids = pageObjIds.map((id) => `${id} 0 R`).join(' ');
  push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`);

  for (let i = 0; i < pageCount; i += 1) {
    const canvas = pages[i];
    const pageId = pageObjIds[i];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const jpeg = atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
    const bytes = new Uint8Array(jpeg.length);
    for (let b = 0; b < jpeg.length; b += 1) bytes[b] = jpeg.charCodeAt(b);

    startObject();
    push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${canvas.width} ${canvas.height}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );

    const content = `q ${canvas.width} 0 0 ${canvas.height} 0 0 cm /Im0 Do Q`;
    startObject();
    push(`${contentId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

    startObject();
    push(
      `${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,
    );
    push(bytes);
    push('\nendstream\nendobj\n');
  }

  const xrefOffset = length;
  let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}

/** 生成并下载 PDF；返回页数 */
export async function exportQuestionsToPdf(options: PdfExportOptions): Promise<number> {
  const pages: HTMLCanvasElement[] = [];
  let canvas = document.createElement('canvas');
  canvas.width = A4_W;
  canvas.height = A4_H;
  let ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unsupported');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, A4_W, A4_H);
  ctx.textBaseline = 'alphabetic';

  // 标题
  ctx.fillStyle = '#000';
  ctx.font = 'bold 22px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
  ctx.fillText(`错题本 · ${new Date().toLocaleDateString('zh-CN')}`, MARGIN, MARGIN + 20);
  ctx.font = '13px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
  ctx.fillText(`共 ${options.items.length} 题 · 由花花时间导出`, MARGIN, MARGIN + 42);
  let y = MARGIN + 70;

  for (let i = 0; i < options.items.length; i += 1) {
    const item = options.items[i];
    let image: HTMLImageElement | null = null;
    const url = options.imageUrls[item.id];
    if (url) {
      try {
        image = await loadImage(url);
      } catch {
        image = null;
      }
    }
    // 预估本题高度，放不下就翻页（近似：图高 + 文本行数 × 22）
    const approxText = [item.questionText, item.answerText, item.analysis].join('').length;
    const approxHeight = (image ? (A4_H * 0.4 * options.imageScale) / 100 : 0) + Math.ceil(approxText / 30) * 22 + 80;
    if (y + Math.min(approxHeight, 200) > A4_H - MARGIN && y > MARGIN + 100) {
      pages.push(canvas);
      canvas = document.createElement('canvas');
      canvas.width = A4_W;
      canvas.height = A4_H;
      ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, A4_W, A4_H);
      y = MARGIN;
    }
    y = drawQuestion(ctx, y, i, item, image, options);
  }
  pages.push(canvas);

  const bytes = buildPdf(pages);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = options.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  return pages.length;
}
