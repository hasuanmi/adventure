// 像素字体入口：导入 CSS（Vite 会去重），并导出类名常量。
// 任何要用中文像素字的 bit 组件 import 这个模块即可。
import '../../styles/pixel-font.css';

/** 字体族类名（见 styles/pixel-font.css）。字号请用 text-[12px] / text-[24px] / text-[36px] */
export const PIXEL_FONT = 'font-pixel';

// font-normal 是必须的：这套字体只有 400 字重，font-bold 会触发伪粗体把点阵糊掉
/** 常用组合：12px（设计下限，用于标签/按钮/Tab/标题） */
export const PIXEL_12 = 'font-pixel text-[12px] font-normal leading-5';

/** 常用组合：24px（2 倍整数缩放，用于 HUD 主标题——观感最好） */
export const PIXEL_24 = 'font-pixel text-[24px] font-normal leading-8';
