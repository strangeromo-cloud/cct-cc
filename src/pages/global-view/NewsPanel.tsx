import { useEffect, useState } from 'react';
import { fetchGlobalNews, type NewsItem } from '@/api/global-client';
import { useLanguage } from '@/hooks/useLanguage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink, Newspaper, Loader2 } from 'lucide-react';

const tagLabels = {
  en: {
    company: 'Lenovo',
    macro: 'Macro',
    supply_chain: 'Supply Chain',
    competitor: 'Competitor',
    all: 'All',
  },
  zh: {
    company: '联想',
    macro: '宏观',
    supply_chain: '供应链',
    competitor: '竞争',
    all: '全部',
  },
};

const tagColor: Record<string, string> = {
  company: 'bg-red-50 text-lenovo-red border-red-200',
  macro: 'bg-blue-50 text-lenovo-blue border-blue-200',
  supply_chain: 'bg-orange-50 text-lenovo-orange border-orange-200',
  competitor: 'bg-purple-50 text-purple-600 border-purple-200',
};

export function NewsPanel() {
  const { language } = useLanguage();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | NewsItem['tag']>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchGlobalNews(30)
      .then((res) => {
        if (cancelled) return;
        if (res.error) setError(res.error);
        setItems(res.items || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = filter === 'all' ? items : items.filter((n) => n.tag === filter);

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = Date.now();
      const diffMs = now - d.getTime();
      const diffH = Math.floor(diffMs / 3600000);
      if (diffH < 1) return language === 'zh' ? '刚刚' : 'just now';
      if (diffH < 24) return language === 'zh' ? `${diffH}小时前` : `${diffH}h ago`;
      const diffD = Math.floor(diffH / 24);
      return language === 'zh' ? `${diffD}天前` : `${diffD}d ago`;
    } catch {
      return '';
    }
  };

  const title = language === 'zh' ? '最新动态' : 'Latest News';
  const tags = tagLabels[language];

  return (
    <Card className="shadow-sm sticky top-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <Newspaper className="h-4 w-4 text-lenovo-red" />
          {title}
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        {/* Filter chips */}
        <div className="flex flex-wrap gap-1 mb-3">
          {(['all', 'company', 'macro', 'supply_chain', 'competitor'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                filter === t
                  ? 'bg-lenovo-red text-white border-lenovo-red'
                  : 'bg-white text-muted-foreground border-border hover:border-lenovo-red/50'
              }`}
            >
              {tags[t]}
            </button>
          ))}
        </div>

        {error && !items.length && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {language === 'zh' ? '加载失败' : 'Failed to load'}: {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {language === 'zh' ? '暂无数据' : 'No news'}
          </div>
        )}

        <div className="space-y-2 max-h-[72vh] overflow-y-auto pr-1">
          {filtered.map((item, i) => (
            <a
              key={i}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md border border-border hover:border-lenovo-red/40 hover:shadow-sm transition-all p-2.5 group"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-medium text-muted-foreground truncate">
                  {item.source} · {formatTime(item.publishedAt)}
                </span>
                <ExternalLink className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
              </div>
              <h4 className="text-xs font-semibold leading-snug line-clamp-2 text-foreground mb-1 group-hover:text-lenovo-red transition-colors">
                {item.title}
              </h4>
              <div className="flex gap-1 mt-1">
                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${tagColor[item.tag] ?? tagColor.company}`}>
                  {tags[item.tag]}
                </span>
              </div>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
