'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

type Trend = 'up' | 'down' | 'neutral';
type Sentiment = 'good' | 'bad' | 'warn' | 'neutral';

interface TrendBadgeProps {
  value: number;
  unit?: '%' | 'pp';
  /* For turnover, "up" is bad. Pass invertSentiment=true to flip. */
  invertSentiment?: boolean;
  className?: string;
}

export function TrendBadge({ value, unit = '%', invertSentiment = true, className }: TrendBadgeProps) {
  const trend: Trend = value > 0.05 ? 'up' : value < -0.05 ? 'down' : 'neutral';
  const sentiment: Sentiment =
    trend === 'neutral'
      ? 'neutral'
      : invertSentiment
      ? trend === 'up' ? 'bad' : 'good'
      : trend === 'up' ? 'good' : 'bad';

  const colors: Record<Sentiment, string> = {
    good: 'bg-[var(--color-good-muted)] text-[var(--color-good-text)]',
    bad: 'bg-[var(--color-bad-muted)] text-[var(--color-bad-text)]',
    warn: 'bg-[var(--color-warn-muted)] text-[var(--color-warn-text)]',
    neutral: 'bg-[var(--color-neutral-muted)] text-[var(--color-neutral-text)]',
  };

  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const sign = value > 0 ? '+' : '';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[var(--radius-badge)] px-2 py-0.5 text-xs font-medium',
        colors[sentiment],
        className
      )}
    >
      <Icon size={11} />
      {sign}{value.toFixed(1)}{unit}
    </span>
  );
}

interface StatusBadgeProps {
  status: 'good' | 'bad' | 'warn' | 'neutral';
  label: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const colors: Record<string, string> = {
    good: 'bg-[var(--color-good-muted)] text-[var(--color-good-text)]',
    bad: 'bg-[var(--color-bad-muted)] text-[var(--color-bad-text)]',
    warn: 'bg-[var(--color-warn-muted)] text-[var(--color-warn-text)]',
    neutral: 'bg-[var(--color-neutral-muted)] text-[var(--color-neutral-text)]',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-badge)] px-2.5 py-1 text-xs font-medium',
        colors[status],
        className
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: 'currentColor' }}
      />
      {label}
    </span>
  );
}
