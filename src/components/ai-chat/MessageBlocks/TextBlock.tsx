export function TextBlock({ content }: { content: string }) {
  return (
    <p className="whitespace-pre-wrap leading-relaxed text-sm">{content}</p>
  );
}
