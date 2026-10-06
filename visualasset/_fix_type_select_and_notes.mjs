// 1) 任务类型下拉：5 项平铺、去掉空选项与分组表头，默认日常任务
// 2) 删除两处注释：学习中心括号注释、AI 识别页的"模型：…密钥…"行
import { readFileSync, writeFileSync } from 'node:fs';

const sheet = new URL('../apps/web/src/components/task-create/task-create-sheet.tsx', import.meta.url);
let s = readFileSync(sheet, 'utf8');
const oldBlock = s.match(/<div>\s*<Label>任务类型<\/Label>[\s\S]*?<\/Select>\s*<\/div>/);
if (!oldBlock) {
  console.log('!! 未匹配到任务类型下拉块');
} else {
  const replacement = `<div>
              <Label>任务类型</Label>
              <Select
                value={form.watch('rewardProfile') || 'TYPE_DAILY'}
                onValueChange={(v) => form.setValue('rewardProfile', v)}
              >
                <SelectTrigger>
                  <span className="flex items-center gap-2">
                    <img
                      src={rewardProfileIconUrl(form.watch('rewardProfile') || 'TYPE_DAILY')}
                      alt=""
                      aria-hidden
                      className="h-5 w-5 [image-rendering:pixelated]"
                    />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      <span className="flex items-center gap-2">
                        <img
                          src={rewardProfileIconUrl(p.code)}
                          alt=""
                          aria-hidden
                          className="h-4 w-4 [image-rendering:pixelated]"
                        />
                        {p.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>`;
  s = s.replace(oldBlock[0], replacement);
  writeFileSync(sheet, s);
  console.log('✓ 任务类型下拉改为 5 项平铺、默认 TYPE_DAILY、删除空选项');
}

const learning = new URL('../apps/web/src/pages/LearningPage.tsx', import.meta.url);
let l = readFileSync(learning, 'utf8');
const before = l;
l = l.replace('拍照或输入题目 → 识别题干 · 解析 · 存进错题本（与「上传新题」同一功能）', '拍照或输入题目 → 识别题干 · 解析 · 存进错题本');
l = l.replace('拍照/输入题目 → 识别 · 解析 · 存进错题本（与「上传新题」同一功能）', '拍照/输入题目 → 识别 · 解析 · 存进错题本');
if (l !== before) { writeFileSync(learning, l); console.log('✓ 删除学习中心括号注释'); } else { console.log('!! 学习中心注释未匹配'); }

const upload = new URL('../apps/web/src/pages/WrongQuestionUploadPage.tsx', import.meta.url);
let u = readFileSync(upload, 'utf8');
const beforeU = u;
// 删掉整段「模型：…密钥…」
u = u.replace(/\s*<p className="mt-3 text-\[11px\] text-inkSoft">\s*模型：[\s\S]*?<\/p>/, '');
u = u.replace('识别后可以确认并存入错题本 —— 与「错题本 → 上传新题」是同一个功能', '');
if (u !== beforeU) { writeFileSync(upload, u); console.log('✓ 删除 AI 识别页"模型：…密钥…"注释'); } else { console.log('!! 上传页注释未匹配'); }
