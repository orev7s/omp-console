/**
 * A small Markdown parser for transcript text. It covers the subset the agent
 * actually emits: headings, bold, italic, inline code, fenced code blocks,
 * unordered and ordered lists, and links. It is intentionally not a full
 * CommonMark implementation and takes no dependency.
 */

export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; value: string; url: string };

export type MarkdownBlock =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; language: string | null; code: string }
  | { type: 'list'; ordered: boolean; items: string[] };

const FENCE = /^\s*```\s*([\w+#.-]*)\s*$/;
const FENCE_END = /^\s*```\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const UNORDERED = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

// Order matters: bold before italic so `**` wins over `*`.
const INLINE =
  /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|`[^`\n]+`|\[[^\]]+\]\([^)\s]+\))/g;

function isBlockStart(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    UNORDERED.test(line) ||
    ORDERED.test(line)
  );
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const language = fence[1] ? fence[1] : null;
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_END.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: 'code', language, code: code.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    const unordered = UNORDERED.exec(line);
    const ordered = unordered ? null : ORDERED.exec(line);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: string[] = [];
      while (i < lines.length) {
        const match = orderedList ? ORDERED.exec(lines[i]) : UNORDERED.exec(lines[i]);
        if (!match) break;
        items.push(match[1]);
        i += 1;
      }
      blocks.push({ type: 'list', ordered: orderedList, items });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', lines: paragraph });
    } else {
      i += 1;
    }
  }

  return blocks;
}

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const parts = text.split(INLINE);

  for (const part of parts) {
    if (part === '') continue;

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      tokens.push({ type: 'bold', value: part.slice(2, -2) });
      continue;
    }
    if (part.startsWith('__') && part.endsWith('__') && part.length > 4) {
      tokens.push({ type: 'bold', value: part.slice(2, -2) });
      continue;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      tokens.push({ type: 'code', value: part.slice(1, -1) });
      continue;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      tokens.push({ type: 'italic', value: part.slice(1, -1) });
      continue;
    }

    const link = LINK.exec(part);
    if (link) {
      tokens.push({ type: 'link', value: link[1], url: link[2] });
      continue;
    }

    tokens.push({ type: 'text', value: part });
  }

  return tokens;
}
