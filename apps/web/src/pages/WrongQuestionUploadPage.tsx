import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Camera, Image as ImageIcon, Loader2, PenLine, Upload } from 'lucide-react';
import { Panel } from '../components/ui/card';
import { WrongQuestionNav } from '../components/wrong-question-nav';
import { WrongQuestionForm } from '../components/wrong-question-form';
import { aiApi, fileToDataUrl, mapAiFieldsToForm } from '../lib/api/ai';
import { compressImage, filesApi } from '../lib/api/files';

type InputMode = 'image' | 'text' | 'direct';

/** 上游三输入模式里的第二个（TextInputZone）；用户要求该项命名为「AI 识别」 */
const TABS: { key: InputMode; label: string; icon: typeof Upload }[] = [
  { key: 'image', label: '拍照上传', icon: Upload },
  { key: 'text', label: 'AI 识别', icon: PenLine },
  { key: 'direct', label: '直接录入', icon: PenLine },
];

interface CaptureProps {
  /** notebook = 错题本「上传新题」；ai = 学习「AI 识别」（**同一个识别流程，两个入口**） */
  variant?: 'notebook' | 'ai';
}

/**
 * 上传/识别（**同一个功能**，对照上游首页三个输入模式：UploadZone / TextInputZone / DirectTextEditor）
 *  · 入口 1：错题本 →「上传新题」（带四入口导航）
 *  · 入口 2：学习 →「AI 识别」（孩子直接搜题识题，同一套拍照/手输/识别）
 *  · 拍照上传 / AI 识别：识别完成后**就地展开确认表单**（同一个 WrongQuestionForm）
 *  · 直接录入：tab 下面**直接就是表单**（用户要求：不需要再点一次"开始手工录入"）
 * 另含上游的「屏幕截图」（getDisplayMedia；仅 https/localhost 可用）
 */
export function WrongQuestionCapture({ variant = 'notebook' }: CaptureProps) {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<InputMode>('image');
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 识别成功后内嵌表单的预填（null = 还没识别） */
  const [recognized, setRecognized] = useState<{
    prefill: Record<string, unknown>;
    knowledgePoints: string[];
    imageKey: string | null;
  } | null>(null);

  const status = useQuery({ queryKey: ['ai', 'status'], queryFn: () => aiApi.status() });
  const aiReady = status.data?.configured ?? false;
  const saving = variant === 'ai' ? '/learning/wrong-questions' : '/learning/wrong-questions';

  const pickFile = async (picked: File): Promise<void> => {
    if (!picked.type.startsWith('image/')) {
      setError('只支持图片文件（JPG / PNG / WebP）');
      return;
    }
    setError(null);
    setRecognized(null);
    const compressed = await compressImage(picked);
    setFile(compressed);
    setPreviewUrl(URL.createObjectURL(compressed));
  };

  const runAnalyze = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      let imageKey: string | null = null;
      let imageBase64: string | null = null;
      if (mode === 'image') {
        if (!file) {
          setError('请先选择或拖入一张题目图片');
          return;
        }
        const uploaded = await filesApi.upload(file);
        imageKey = uploaded.key;
        imageBase64 = await fileToDataUrl(file);
      }
      const result = await aiApi.analyze(mode === 'image' ? { imageBase64 } : { text });
      const mapped = mapAiFieldsToForm(result.fields);
      const { knowledgePoints, ...prefill } = mapped;
      // 识别成功 → 就地展开确认表单（用户仍可逐字段修改后再保存）
      setRecognized({ prefill, knowledgePoints, imageKey });
      setMode('direct');
    } catch (err) {
      const message = err instanceof Error ? err.message : '识别失败';
      setError(
        message.includes('ai_not_configured')
          ? 'AI 未配置：请在 .env 填 AI_BASE_URL / AI_MODEL（其余功能不受影响）'
          : `识别失败：${message}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const captureScreen = async (): Promise<void> => {
    setError(null);
    const media = navigator.mediaDevices;
    if (!media?.getDisplayMedia) {
      setError('当前浏览器/环境不支持屏幕截图，请改用「浏览文件」上传');
      return;
    }
    try {
      const stream = await media.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 200));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      track.stop();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) await pickFile(new File([blob], 'screenshot.png', { type: 'image/png' }));
    } catch {
      setError('屏幕截图已取消或不被允许（Chrome 仅在 https/localhost 下支持）');
    }
  };

  return (
    <div className="space-y-3">
      {variant === 'notebook' ? (
        <WrongQuestionNav />
      ) : (
        <div className="flex items-center justify-between">
          <Link to="/learning" className="text-sm font-bold text-inkSoft hover:text-ink">
            ← 返回学习
          </Link>
          <h1 className="text-base font-extrabold tracking-widest">AI 识别</h1>
        </div>
      )}

      <Panel>
        {/* 三个输入模式（对照上游 inputMode） */}
        <div className="flex gap-1 border-b-2 border-ink/30 pb-2" data-upload-tabs>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                data-upload-tab={tab.key}
                onClick={() => {
                  setMode(tab.key);
                  setError(null);
                }}
                className={`flex items-center gap-1.5 border-2 border-ink px-3 py-1.5 text-xs font-extrabold shadow-pixel active:translate-y-0.5 ${
                  mode === tab.key ? 'bg-accent text-white' : 'bg-panel text-ink'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {!aiReady && mode !== 'direct' && (
          <p data-ai-hint className="mt-2 border-2 border-warning bg-warning/10 px-2 py-1.5 text-[11px] font-bold text-ink">
            AI 未配置或未连通：仍可「直接录入」手工建错题（图片会正常保存）。
          </p>
        )}

        {mode === 'image' && (
          <div className="mt-3">
            <div
              data-upload-zone
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) void pickFile(dropped);
              }}
              onClick={() => fileInput.current?.click()}
              className={`grid place-items-center border-2 border-dashed px-4 py-8 text-center ${
                dragging ? 'border-accent bg-accent/10' : 'border-ink/40 bg-panelLight'
              }`}
            >
              {previewUrl ? (
                <div className="space-y-2">
                  <img
                    src={previewUrl}
                    alt="待识别的题目"
                    data-upload-preview
                    className="mx-auto max-h-56 border-2 border-ink object-contain"
                  />
                  <p className="text-[11px] text-inkSoft">
                    {file?.name}（已压缩 {Math.round((file?.size ?? 0) / 1024)} KB）
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ink/5">
                    <ImageIcon className="h-7 w-7 text-inkSoft" />
                  </span>
                  <p className="text-sm font-extrabold text-ink">AI 智能解析</p>
                  <p className="text-xs text-inkSoft">拖拽图片到此处，或点击浏览</p>
                  <p className="text-[11px] text-inkSoft">支持 JPG、PNG（最大 5MB）</p>
                </div>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              data-upload-input
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) void pickFile(picked);
              }}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                data-run-analyze
                disabled={busy || !file || !aiReady}
                onClick={() => void runAnalyze()}
                className="inline-flex items-center gap-1.5 border-2 border-ink bg-accent px-4 py-2 text-xs font-extrabold text-white shadow-pixel active:translate-y-0.5 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {busy ? 'AI 识别中…' : '开始 AI 识别'}
              </button>
              <button
                type="button"
                data-screen-capture
                onClick={() => void captureScreen()}
                className="inline-flex items-center gap-1.5 border-2 border-ink bg-panel px-3 py-2 text-xs font-bold shadow-pixel active:translate-y-0.5"
              >
                <Camera className="h-3.5 w-3.5" /> 屏幕截图
              </button>
              {file && (
                <button
                  type="button"
                  data-skip-ai
                  onClick={() => {
                    setRecognized({ prefill: {}, knowledgePoints: [], imageKey: null });
                    setMode('direct');
                  }}
                  className="border-2 border-ink bg-panel px-3 py-2 text-xs font-bold shadow-pixel"
                >
                  跳过识别，直接手工录入
                </button>
              )}
            </div>
          </div>
        )}

        {mode === 'text' && (
          <div className="mt-3 space-y-2">
            <textarea
              rows={6}
              data-upload-text
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="把题目文字粘进来（例：小明把 3+4 算成了 8，请整理成错题）"
              className="w-full border-2 border-ink bg-panelLight px-2 py-2 text-sm"
            />
            <button
              type="button"
              data-run-analyze-text
              disabled={busy || !text.trim() || !aiReady}
              onClick={() => void runAnalyze()}
              className="inline-flex items-center gap-1.5 border-2 border-ink bg-accent px-4 py-2 text-xs font-extrabold text-white shadow-pixel active:translate-y-0.5 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {busy ? 'AI 识别中…' : '开始 AI 识别'}
            </button>
          </div>
        )}

        {error && (
          <p data-upload-error className="mt-2 text-xs font-bold text-danger">
            {error}
          </p>
        )}
        <p className="mt-3 text-[11px] text-inkSoft">
          模型：{status.data?.configured ? `${status.data.provider} · ${status.data.model}` : '未配置'} ·
          密钥只在服务端使用，永不下发浏览器
        </p>
      </Panel>

      {/* 直接录入 / 识别确认：**tab 下面直接就是需要填写的表单** */}
      {mode === 'direct' && (
        <div data-inline-form>
          {recognized ? (
            <p className="text-[11px] font-bold text-ok">
              ✓ AI 识别完成，下面是识别结果，请核对后保存（知识点可一键变标签）
            </p>
          ) : null}
          <WrongQuestionForm
            prefill={recognized?.prefill}
            knowledgePoints={recognized?.knowledgePoints}
            imageKey={recognized?.imageKey ?? null}
            onSaved={() => navigate(saving)}
          />
        </div>
      )}
    </div>
  );
}

/** 错题本入口：上传新题 */
export function WrongQuestionUploadPage() {
  return <WrongQuestionCapture variant="notebook" />;
}

/** 学习入口：AI 识别（孩子直接搜题识题；与上传新题共用同一套识别流程） */
export function AiRecognizePage() {
  return <WrongQuestionCapture variant="ai" />;
}
