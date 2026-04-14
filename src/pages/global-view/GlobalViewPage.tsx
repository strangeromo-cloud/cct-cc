import { useEffect, useState } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import {
  fetchMacroData,
  fetchSupplyChainData,
  fetchCompetitiveData,
  type MacroData,
  type SupplyChainData,
  type CompetitiveData,
} from '@/api/global-client';
import { AISummaryPanel } from './AISummaryPanel';
import { MacroSection } from './MacroSection';
import { SupplyChainSection } from './SupplyChainSection';
import { CompetitiveSection } from './CompetitiveSection';
import { NewsPanel } from './NewsPanel';

export function GlobalViewPage() {
  const { language } = useLanguage();
  const [macro, setMacro] = useState<MacroData | null>(null);
  const [supplyChain, setSupplyChain] = useState<SupplyChainData | null>(null);
  const [competitive, setCompetitive] = useState<CompetitiveData | null>(null);
  const [loadingMacro, setLoadingMacro] = useState(true);
  const [loadingSupply, setLoadingSupply] = useState(true);
  const [loadingComp, setLoadingComp] = useState(true);
  const [years] = useState(5);

  useEffect(() => {
    let cancelled = false;

    fetchMacroData(years)
      .then((d) => { if (!cancelled) setMacro(d); })
      .catch((e) => console.error('fetchMacroData failed', e))
      .finally(() => { if (!cancelled) setLoadingMacro(false); });

    fetchSupplyChainData(years)
      .then((d) => { if (!cancelled) setSupplyChain(d); })
      .catch((e) => console.error('fetchSupplyChainData failed', e))
      .finally(() => { if (!cancelled) setLoadingSupply(false); });

    fetchCompetitiveData()
      .then((d) => { if (!cancelled) setCompetitive(d); })
      .catch((e) => console.error('fetchCompetitiveData failed', e))
      .finally(() => { if (!cancelled) setLoadingComp(false); });

    return () => { cancelled = true; };
  }, [years]);

  const allLoaded = !loadingMacro && !loadingSupply && !loadingComp;
  const title = language === 'zh' ? '全球视图' : 'Global View';

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        {/* Left: AI summary on top + 3 chart sections */}
        <div className="space-y-4 min-w-0">
          <AISummaryPanel
            macro={macro}
            supplyChain={supplyChain}
            competitive={competitive}
            ready={allLoaded}
          />
          <MacroSection data={macro} loading={loadingMacro} />
          <SupplyChainSection data={supplyChain} loading={loadingSupply} />
          <CompetitiveSection data={competitive} loading={loadingComp} />
        </div>

        {/* Right: News panel */}
        <aside className="min-w-0">
          <NewsPanel />
        </aside>
      </div>
    </div>
  );
}
