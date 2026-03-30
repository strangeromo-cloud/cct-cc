/**
 * MessageBlock Renderer — Renders rich content blocks in chat
 */
import type { MessageBlock } from '@/types/ai-types';
import { TextBlock } from './TextBlock';
import { ChartBlock } from './ChartBlock';
import { KPIBlock } from './KPIBlock';
import { TableBlock } from './TableBlock';
import { InsightBadge } from './InsightBadge';
import { SourceTag } from './SourceTag';
import { ThinkingBlock } from './ThinkingBlock';

interface MessageBlockRendererProps {
  blocks: MessageBlock[];
}

export function MessageBlockRenderer({ blocks }: MessageBlockRendererProps) {
  return (
    <div className="space-y-2">
      {blocks.map((block, idx) => (
        <BlockSwitch key={idx} block={block} />
      ))}
    </div>
  );
}

function BlockSwitch({ block }: { block: MessageBlock }) {
  switch (block.type) {
    case 'text':
      return <TextBlock content={block.content} />;
    case 'chart':
      return <ChartBlock chartOption={block.chartOption} title={block.title} height={block.height} />;
    case 'kpi_card':
      return <KPIBlock cards={block.cards} />;
    case 'table':
      return <TableBlock headers={block.headers} rows={block.rows} title={block.title} />;
    case 'insight':
      return <InsightBadge level={block.level} text={block.text} />;
    case 'source_tag':
      return <SourceTag sources={block.sources} />;
    case 'thinking':
      return <ThinkingBlock steps={block.steps} complete={block.complete} />;
    default:
      return null;
  }
}
