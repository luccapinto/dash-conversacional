'use client';

import { cn } from '@/lib/utils';
import { TrendBadge, StatusBadge } from './Badge';

interface BigStatProps {
  label: string;
  value: string;
  /** Semantic status vs. target */
  status?: 'good' | 'bad' | 'warn' | 'neutral';
  statusLabel?: string;
  /** MoM change in percentage points */
  momChange?: number;
  /** YoY change in percentage points */
  yoyChange?: number;
  className?: string;
}

export function BigStat({
  label,
  value,
  status,
  statusLabel,
  momChange,
  yoyChange,
  className,
}: BigStatProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
        {label}
      </p>
      <div className="flex items-end gap-3">
        <span className="text-4xl font-bold tabular-nums text-[var(--color-text-primary)] leading-none">
          {value}
        </span>
        {status && statusLabel && (
          <StatusBadge status={status} label={statusLabel} />
        )}
      </div>
      {(momChange !== undefined || yoyChange !== undefined) && (
        <div className="flex items-center gap-2 flex-wrap">
          {momChange !== undefined && (
            <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
              vs. mês ant.
              <TrendBadge value={momChange} unit="pp" />
            </span>
          )}
          {yoyChange !== undefined && (
            <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
              vs. ano ant.
              <TrendBadge value={yoyChange} unit="pp" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
