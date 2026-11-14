import React from 'react';
import { Collapsible, Text } from '../../../ui/components';
import { useTheme } from '../../../ui/theme';
import type { LiveTool } from '../../../state/sessionTypes';

const STATUS_WORD: Record<LiveTool['status'], string> = {
  running: 'Running',
  ok: 'Done',
  error: 'Failed',
};

function toolHeader(name: string | undefined): string {
  if (!name) return 'Tool';
  const leaf = name.split(/[.:/]/).filter(Boolean).pop() ?? name;
  const lower = leaf.toLowerCase();
  if (lower === 'bash' || lower === 'shell' || lower === 'sh') return `Ran ${lower}`;
  return `Tool ${leaf}`;
}

/**
 * One tool call, collapsed by default. The header is a plain phrase such as
 * Ran bash or Tool read; expanding shows the status word. No per-tool icons.
 */
export function ToolRow({ tool }: { tool: LiveTool }): React.JSX.Element {
  const theme = useTheme();
  const failed = tool.status === 'error';

  return (
    <Collapsible title={toolHeader(tool.name)} tone={failed ? 'danger' : 'neutral'}>
      <Text
        variant="bodySm"
        color={failed ? theme.color.status.danger : theme.color.text.secondary}>
        {STATUS_WORD[tool.status]}
      </Text>
    </Collapsible>
  );
}
