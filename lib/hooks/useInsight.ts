'use client';

import { useState, useEffect, useRef } from 'react';
import type { Periodo, Diretoria, InsightPreGerado } from '@/lib/types';
import insightsData from '@/lib/data/insights.json';

const LOADING_DELAY_MS = 4000;

const insights = insightsData as Record<string, InsightPreGerado>;

export function useInsight(periodo: Periodo, diretoria: Diretoria) {
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<InsightPreGerado | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    setInsight(null);

    timerRef.current = setTimeout(() => {
      const key = `${periodo}:${diretoria}`;
      setInsight(insights[key] ?? null);
      setLoading(false);
    }, LOADING_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [periodo, diretoria]);

  return { insight, loading };
}
