import * as DialogPrimitive from '@radix-ui/react-dialog';
import { forwardRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

// 像素 Sheet / Dialog（Radix Dialog 底座；移动端底部全屏、桌面居中弹窗）
// 参考 TaskLabs TaskSidePanel（Sheet 二合一）形态；视觉 = 旧 Demo 像素。
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;

export const SheetContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }
>(({ className, children, hideClose, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/60" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto border-2 border-b-0 border-ink bg-panel p-4 shadow-pixel focus:outline-none',
        'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[85vh] md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:border-b-2',
        className,
      )}
      {...props}
    >
      {!hideClose && (
        <DialogPrimitive.Close asChild>
          <button
            type="button"
            aria-label="关闭"
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center border-2 border-ink bg-panelLight text-ink shadow-pixel transition active:translate-y-0.5"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogPrimitive.Close>
      )}
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';

export const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mb-4 border-b-2 border-ink pb-3', className)} {...props} />
);

export const SheetTitle = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-extrabold tracking-widest text-ink', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

export const SheetDescription = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-xs text-inkSoft', className)} {...props} />
));
SheetDescription.displayName = 'SheetDescription';
