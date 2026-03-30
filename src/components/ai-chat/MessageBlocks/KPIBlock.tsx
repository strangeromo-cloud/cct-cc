import type { KPICardData } from '@/types/ai-types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPIBlockProps {
  cards: KPICardData[];
}

export function KPIBlock({ cards }: KPIBlockProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className={`rounded-lg p-2.5 border transition-shadow hover:shadow-sm ${
            card.status === 'danger' ? 'border-red-200 bg-red-50/80' :
            card.status === 'warning' ? 'border-amber-200 bg-amber-50/80' :
            'border-border/30 bg-white'
          }`}
        >
          <p className="text-[10px] text-muted-foreground font-medium tracking-wide leading-tight">{card.label}</p>
          <p className="text-base font-bold mt-1 leading-none">{card.value}</p>
          {card.change && (
            <div className={`flex items-center gap-1 mt-1.5 text-[10px] font-medium ${
              card.changeDirection === 'up' ? 'text-emerald-600' :
              card.changeDirection === 'down' ? 'text-red-500' :
              'text-muted-foreground'
            }`}>
              {card.changeDirection === 'up' && <TrendingUp className="h-3 w-3" />}
              {card.changeDirection === 'down' && <TrendingDown className="h-3 w-3" />}
              {card.changeDirection === 'flat' && <Minus className="h-3 w-3" />}
              <span>{card.change}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
