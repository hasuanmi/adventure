import { cn } from '../../lib/utils';

export interface EmptyProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  className?: string;
}

export function Empty({ icon, title, description, className }: EmptyProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      {icon ? <div className="text-3xl">{icon}</div> : null}
      <p className="font-bold text-ink">{title}</p>
      {description ? <p className="text-sm text-inkSoft">{description}</p> : null}
    </div>
  );
}
