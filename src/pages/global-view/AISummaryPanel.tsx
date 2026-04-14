import { useEffect, useState } from 'react';
import { streamGlobalSummary, type GlobalSummary, type MacroData, type SupplyChainData, type CompetitiveData } from '@/api/global-client';
import { useLanguage } from '@/hooks/useLanguage';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Info, AlertCircle, TrendingUp, Sparkles, Loader2 } from 'lucide-react';

interface Props {
  macro: MacroData | null;
  supplyChain: SupplyChainData | null;
  competitive: CompetitiveData | null;
  ready: boolean;
}

const levelIcon = {
  alert: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const levelColor = {
  alert: 'text-lenovo-red bg-red-50 border-red-200',
  warning: 'text-lenovo-orange bg-orange-50 border-orange-200',
  info: 'text-lenovo-blue bg-blue-50 border-blue-200',
};

const priorityColor = {
  high: 'text-lenovo-red',
  medium: 'text-lenovo-orange',
  low: 'text-lenovo-blue',
};

export function AISummaryPanel({ macro, supplyChain, competitive, ready }: Props) {
  const { language } = useLanguage();
  const [summary, setSummary] = useState<GlobalSummary | null>(null);
  const [thinking, setThinking] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !macro || !supplyChain || !competitive) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSummary(null);
    setThinking(language === 'zh' ? '准备分析数据...' : 'Preparing analysis...');

    (async () => {
      try {
        const stream = streamGlobalSummary({ macro, supplyChain, competitive });
        for await (const event of stream) {
          if (cancelled) return;
          if (event.type === 'thinking' && event.content) {
            setThinking(event.content);
          } else if (event.type === 'complete' && event.summary) {
            setSummary(event.summary);
            setLoading(false);
          } else if (event.type === 'error') {
            setError(event.content || 'Unknown error');
            setLoading(false);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [ready, macro, supplyChain, competitive, language]);

  const title = language === 'zh' ? 'AI 外部环境分析总结' : 'AI Global View Summary';
  const snapshotLabel = language === 'zh' ? '现状摘要' : 'Current Snapshot';
  const risksLabel = language === 'zh' ? '风险预警' : 'Risk Alerts';
  const actionsLabel = language === 'zh' ? 'CFO 建议' : 'CFO Actions';

  return (
    <Card className="shadow-sm border-l-4 border-l-lenovo-red">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-lenovo-red" />
          <h3 className="text-sm font-semibold">{title}</h3>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        {loading && !summary && (
          <div className="text-xs text-muted-foreground italic">{thinking}</div>
        )}

        {error && (
          <div className="text-xs text-lenovo-red bg-red-50 border border-red-200 rounded-md p-2">
            {language === 'zh' ? 'AI 分析失败：' : 'Summary failed: '}{error}
          </div>
        )}

        {summary && (
          <div className="space-y-3">
            {/* Snapshot */}
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-foreground" />
                <span className="text-xs font-semibold text-foreground">{snapshotLabel}</span>
              </div>
              <p className="text-sm leading-relaxed text-foreground pl-5">{summary.snapshot}</p>
            </div>

            {/* Risks */}
            {summary.risks && summary.risks.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-lenovo-orange" />
                  <span className="text-xs font-semibold text-foreground">{risksLabel}</span>
                </div>
                <div className="space-y-1.5 pl-5">
                  {summary.risks.map((r, i) => {
                    const Icon = levelIcon[r.level] ?? Info;
                    return (
                      <div key={i} className={`flex gap-2 items-start rounded-md border px-2 py-1.5 ${levelColor[r.level] ?? levelColor.info}`}>
                        <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <div className="text-xs">
                          <span className="font-semibold">{r.title}：</span>
                          <span>{r.detail}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            {summary.actions && summary.actions.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-lenovo-red" />
                  <span className="text-xs font-semibold text-foreground">{actionsLabel}</span>
                </div>
                <ol className="space-y-1 pl-5 list-decimal list-inside">
                  {summary.actions.map((a, i) => (
                    <li key={i} className="text-xs leading-relaxed">
                      <span className={`font-semibold ${priorityColor[a.priority] ?? priorityColor.low}`}>{a.title}</span>
                      <span className="text-foreground"> — {a.detail}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
