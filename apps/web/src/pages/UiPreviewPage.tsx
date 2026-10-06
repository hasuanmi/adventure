import { Panel, PanelHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { PixelBar } from '../components/ui/pixel-bar';
import { BitCard } from '../components/ui-preview/bit-card';
import { BitButton } from '../components/ui-preview/bit-button';
import { BitLevelBadge, BitProgress } from '../components/ui-preview/bit-progress';

/**
 * /ui-preview —— Pixel UI Preview（**纯原型，不接入任何业务逻辑 / API / 状态**）
 *
 * 目的：验证 8bitcn 的三项核心技法（缺角像素框 / 12 块按钮描边 / 20 格分段进度）
 * 能否融进「花花 Pixel RPG」暖色视觉体系 —— 而不是验证 8bitcn 组件能不能直接装。
 *
 * 做法：每个组件都**左右对照**
 *   左 = 现状（直接复用 components/ui 里真实在用的 Panel / Button / PixelBar）
 *   右 = 技法移植版（components/ui-preview/bit-*，Tailwind v3 重写，零新依赖）
 *
 * 硬约束（本次刻意遵守）：
 *   · 不迁移 Tailwind v4（不用 @theme / @variant / oklch / `p-0!` 尾部 important）
 *   · 不安装任何新依赖（不装 @radix-ui/react-progress、不装 radix-ui 伞包）
 *   · 不引入 Google Fonts 外链（Press Start 2P 无中文字形，且国内不可达）
 *   · 不修改 components/ui/ 下任何现有文件
 */

/** 每个组件对照区的说明条 */
function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[11px] leading-relaxed text-inkSoft">{children}</p>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-8 border-b-2 border-ink pb-1.5 text-base font-extrabold tracking-widest text-ink">
      {children}
    </h2>
  );
}

function ColLabel({ tone, children }: { tone: 'now' | 'bit'; children: React.ReactNode }) {
  return (
    <p
      className={
        'mb-2 inline-block border-2 border-ink px-2 py-0.5 text-[11px] font-extrabold tracking-widest ' +
        (tone === 'now' ? 'bg-panelLight text-ink' : 'bg-accent text-white')
      }
    >
      {children}
    </p>
  );
}

export function UiPreviewPage() {
  return (
    <div data-ui-preview className="min-h-[100dvh] bg-brandBg pb-16 text-ink">
      <div className="mx-auto w-full max-w-4xl px-3 pt-5">
        {/* ---------- 原型声明 ---------- */}
        <header className="border-2 border-ink bg-ink p-3 text-panelLight shadow-pixel">
          <h1 className="text-lg font-extrabold tracking-widest" style={{ textShadow: '2px 2px 0 #2c2015' }}>
            Pixel UI Preview
          </h1>
          <p className="mt-1 text-[11px] leading-relaxed text-panelLight/85">
            8bitcn 技法移植验证 · <span className="font-bold text-warning">原型页，不接业务 / 不进生产</span>
            <br />
            左＝现状（components/ui 真实组件）｜右＝8bitcn 技法移植（components/ui-preview/bit-*）
          </p>
        </header>

        {/* ================= 1. Card ================= */}
        <SectionTitle>① Card · 缺角像素框</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <ColLabel tone="now">现状 · Panel</ColLabel>
            <Panel>
              <PanelHeader>今日冒险</PanelHeader>
              <p className="text-sm">3/3 任务完成</p>
            </Panel>
            <Note>
              <code>border-2 border-ink + shadow-pixel</code>：闭合的 2px 直角描边 + 硬阴影。
              干净，但四条边在同一深度交汇，没有任何「像素块拼接」的信息。
            </Note>
          </div>
          <div>
            <ColLabel tone="bit">8bitcn 技法 · BitCard</ColLabel>
            <BitCard title="今日冒险" frame={6}>
              <p className="text-sm">3/3 任务完成</p>
            </BitCard>
            <Note>
              <code>border-y-[6px]</code> + 绝对定位 <code>-mx-1.5 border-x-[6px] border-inherit</code>：
              左右边框向外偏移一个框厚 → 交界处出现缺角，框体读起来像「上下两根横梁 + 左右两根立柱」拼的。
            </Note>
          </div>
        </div>

        {/* 标题带变体：验证「温暖」而不是「地牢」 */}
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <BitCard title="冒险日志" titleBar="accent" frame={4}>
            <p className="text-xs">橙色标题带（accent）</p>
          </BitCard>
          <BitCard title="成长记录" titleBar="ink" frame={4}>
            <p className="text-xs">深棕标题带（ink）</p>
          </BitCard>
          <BitCard title="奖励" titleBar="none" frame={4}>
            <p className="text-xs">无标题带</p>
          </BitCard>
        </div>
        <Note>
          关键验证点：把 8bitcn 的框体技法**套在花花的暖色 token 上**（panel/ink/accent），
          出来的是米黄底 + 深棕描边 + 橙色带 —— 不是它的深色地牢观感。
          <span className="font-bold"> 缺角技法本身是中性手段，不带色偏。</span>
        </Note>

        {/* ================= 2. Progress ================= */}
        <SectionTitle>② Progress · 20 格分段进度</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <ColLabel tone="now">现状 · PixelBar</ColLabel>
            <Panel>
              <PanelHeader>LV.12</PanelHeader>
              <PixelBar barColor="var(--xp)" percent={82} />
              <p className="mt-2 text-xs text-inkSoft">82%</p>
            </Panel>
            <Note>
              <code>repeating-linear-gradient</code> + <code>color-mix</code>：连续填充 + 条纹纹理。
              宽度是连续量，观感更像「海报进度条」而不是「游戏血条」。
            </Note>
          </div>
          <div>
            <ColLabel tone="bit">8bitcn 技法 · BitProgress</ColLabel>
            <Panel>
              <PanelHeader>LV.12</PanelHeader>
              <BitProgress value={82} tone="xp" bevel />
              <p className="mt-2 text-xs text-inkSoft">82%</p>
            </Panel>
            <Note>
              20 个等宽方块 + <code>mx-[1px]</code> 缝 → 天然得到 <code>████████░░</code>。
              外框同样是「上下 border-y-4 + 左右外移 -mx-1 border-x-4」的缺角技巧。
            </Note>
          </div>
        </div>

        {/* 三档 tone + segmented/smooth 对照 */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Panel>
            <PanelHeader>分段 · 三档配色</PanelHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <BitLevelBadge level={12} />
                <BitProgress value={82} tone="xp" bevel className="flex-1" label="经验值" />
                <span className="w-10 shrink-0 text-right text-xs font-bold">82%</span>
              </div>
              <div className="flex items-center gap-2">
                <BitProgress value={64} tone="accent" className="flex-1" label="专注度" />
                <span className="w-10 shrink-0 text-right text-xs font-bold">64%</span>
              </div>
              <div className="flex items-center gap-2">
                <BitProgress value={35} tone="ok" className="flex-1" label="完成度" />
                <span className="w-10 shrink-0 text-right text-xs font-bold">35%</span>
              </div>
            </div>
          </Panel>
          <Panel>
            <PanelHeader>segmented vs smooth</PanelHeader>
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-[11px] text-inkSoft">segmented（8bitcn 技法）</p>
                <BitProgress value={82} tone="xp" />
              </div>
              <div>
                <p className="mb-1 text-[11px] text-inkSoft">smooth（PixelBar 连续条纹，同组件内可切）</p>
                <BitProgress value={82} tone="xp" variant="smooth" />
              </div>
              <div>
                <p className="mb-1 text-[11px] text-inkSoft">segmented · 12 格（细粒度）</p>
                <BitProgress value={42} tone="accent" segments={12} />
              </div>
            </div>
            <Note>
              分段数可调，说明它是**参数**不是硬编码 —— 六维属性用 12 格、XP 用 20 格、周打卡用 7 格都行。
            </Note>
          </Panel>
        </div>

        {/* ================= 3. Button ================= */}
        <SectionTitle>③ Button · 12 块缺角描边</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <ColLabel tone="now">现状 · Button</ColLabel>
            <Panel>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="accent">+ 新建任务</Button>
                <Button variant="ok">领取成长卡</Button>
                <Button variant="ghost">取消</Button>
              </div>
            </Panel>
            <Note>
              <code>border-2 border-ink + shadow-pixel + active:translate-y-1</code>：闭合描边 + 硬阴影，
              按下时整体下沉。已经很像游戏按钮，这一点项目做得不错。
            </Note>
          </div>
          <div>
            <ColLabel tone="bit">8bitcn 技法 · BitButton</ColLabel>
            <Panel>
              <div className="flex flex-wrap items-center gap-3">
                <BitButton variant="accent">+ 新建任务</BitButton>
                <BitButton variant="ok">领取成长卡</BitButton>
                <BitButton variant="ghost">取消</BitButton>
              </div>
            </Panel>
            <Note>
              按钮自身 <code>border-none</code>，描边由 12 个绝对定位方块拼出（上下各 2 块留缝、四角、左右两条），
              另加 4 条 <code>bg-ink/20</code> 做 bevel。方块在按钮外侧，所以根节点有 <code>m-1.5</code> 防裁切。
            </Note>
          </div>
        </div>

        {/* ================= 4. 场景合成（用户指定内容） ================= */}
        <SectionTitle>④ 场景合成 · 五块连排</SectionTitle>
        <p className="mb-3 text-[11px] leading-relaxed text-inkSoft">
          按指定内容排一遍，看它们在**同一屏里是否像一套东西**（这才是「能否融入视觉体系」的真正判据）。
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {/* 现状 */}
          <div className="border-2 border-dashed border-ink/40 p-3">
            <ColLabel tone="now">现状</ColLabel>
            <div className="space-y-4 bg-brandBg">
              <Panel>
                <PanelHeader>今日冒险</PanelHeader>
                <p className="text-sm">3/3 任务完成</p>
              </Panel>
              <Panel>
                <PanelHeader>LV.12</PanelHeader>
                <PixelBar barColor="var(--xp)" percent={82} />
                <p className="mt-1.5 text-xs text-inkSoft">████████░░ 82%</p>
              </Panel>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="accent">+ 新建任务</Button>
                <Button variant="ok">领取成长卡</Button>
              </div>
              <Panel>
                <PanelHeader>错题本</PanelHeader>
                <p className="text-sm">今日新增 3 道</p>
              </Panel>
            </div>
          </div>

          {/* 8bitcn 技法 */}
          <div className="border-2 border-dashed border-accent/60 p-3">
            <ColLabel tone="bit">8bitcn 技法</ColLabel>
            <div className="space-y-4 bg-brandBg">
              <BitCard title="今日冒险" frame={6}>
                <p className="text-sm">3/3 任务完成</p>
              </BitCard>
              <BitCard title="LV.12" frame={6}>
                <div className="flex items-center gap-3">
                  <BitLevelBadge level={12} />
                  <BitProgress value={82} tone="xp" bevel className="flex-1" label="经验值" />
                  <span className="shrink-0 text-xs font-extrabold">82%</span>
                </div>
              </BitCard>
              <div className="flex flex-wrap items-center gap-2">
                <BitButton variant="accent">+ 新建任务</BitButton>
                <BitButton variant="ok">领取成长卡</BitButton>
              </div>
              <BitCard title="错题本" frame={6}>
                <p className="flex items-center gap-2 text-sm">
                  今日新增 3 道
                  <Badge variant="warning">今日</Badge>
                </p>
              </BitCard>
            </div>
          </div>
        </div>

        {/* ================= 5. 检查点 ================= */}
        <SectionTitle>⑤ 验收检查点</SectionTitle>
        <Panel>
          <ul className="list-inside list-disc space-y-1.5 text-xs leading-relaxed text-ink">
            <li>
              <span className="font-bold">暖色是否守住：</span>BitCard/BitButton/BitProgress 全部只用
              panel / panelLight / ink / inkSoft / accent / ok / xp，无一处深色地牢色（无紫、无荧光绿、无黑底）。
            </li>
            <li>
              <span className="font-bold">技法是否中性：</span>缺角框、方块描边、分段条都只是**几何手段**，
              换成暖色 token 后观感仍是「温暖儿童」，不是 Dunkel RPG。
            </li>
            <li>
              <span className="font-bold">中文是否仍不像素：</span>本页**没有**引入像素字体 ——
              这一屏里中文依然是系统黑体。这是 8bitcn 帮不上、必须你们自己解决的第一问题。
            </li>
            <li>
              <span className="font-bold">Tailwind 是否 v3 可跑：</span>三个组件均无 <code>@theme</code> /
              <code>@variant</code> / oklch / 尾部 <code>!</code> 语法，构建期无静默失效。
            </li>
            <li>
              <span className="font-bold">是否有新依赖：</span>零。Progress 未用 Radix，用原生
              <code>role=&quot;progressbar&quot;</code> 补可访问性。
            </li>
            <li>
              <span className="font-bold">DOM 成本：</span>BitProgress 20 格 = 20 个节点（+2 个框）；
              BitButton 最多 14 个装饰 span。要真机在低端平板上量一次。
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
