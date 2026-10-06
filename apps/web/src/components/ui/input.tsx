import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full border-2 border-ink bg-panelLight px-3 py-2 text-sm text-ink placeholder:text-inkSoft/70 focus:outline-none focus:ring-2 focus:ring-accent',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full border-2 border-ink bg-panelLight px-3 py-2 text-sm text-ink placeholder:text-inkSoft/70 focus:outline-none focus:ring-2 focus:ring-accent',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
