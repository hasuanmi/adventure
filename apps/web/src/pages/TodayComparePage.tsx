import { useState } from 'react';
import { AppLayout } from '../components/layout/app-layout';
import { BitButton } from '../components/ui-preview/bit-button';
import { TodayBitPage } from './TodayBitPage';
import { TodayPage } from './TodayPage';

/**
 * 首页 A/B 对比页（**只用于评审，不是正式页面**）
 *
 * 一键在「旧版（现状）」和「新版（8bitcn 技法）」之间切换。
 * 关键：这里**自己渲染 AppLayout**（而不是由路由包），
 * 所以切换时会连**顶部 HUD（头像/等级/XP）与底部功能栏**一起切 —— 整体对比才干净。
 *
 * `TodayPage.tsx` / `TodayBitPage.tsx` 均未因此改动，这里只是把两个组件挂在一起。
 */
export function TodayComparePage() {
  const [mode, setMode] = useState<'now' | 'bit'>('bit');

  return (
    <AppLayout variant={mode === 'bit' ? 'bit' : 'default'}>
      <div>
        {/* 切换条：sticky 在 main 的滚动容器内 */}
        <div className="sticky top-0 z-30 -mx-3 -mt-4 mb-4 border-b-2 border-ink bg-brandBg/95 px-3 py-2 backdrop-blur">
          <div className="-mx-1 flex items-center">
            <BitButton
              type="button"
              size="chip"
              variant={mode === 'now' ? 'ink' : 'ghost'}
              data-cmp-now
              onClick={() => setMode('now')}
            >
              旧版 · 现状
            </BitButton>
            <BitButton
              type="button"
              size="chip"
              variant={mode === 'bit' ? 'accent' : 'ghost'}
              data-cmp-bit
              onClick={() => setMode('bit')}
            >
              新版 · 8bitcn 技法
            </BitButton>
          </div>
          <p data-cmp-mode={mode} className="mt-1 text-[10px] leading-relaxed text-inkSoft">
            {mode === 'bit'
              ? '新版：缺角框 + 分段进度（一格 = 一个任务，星星标记）+ 缺角按钮 + 金色双线功能栏 + 中文像素字'
              : '旧版：Panel（闭合 2px 描边）+ PixelBar（连续条纹）+ Button（闭合描边 + 硬阴影）+ lucide 线性图标'}
          </p>
        </div>

        {mode === 'bit' ? <TodayBitPage /> : <TodayPage />}
      </div>
    </AppLayout>
  );
}
