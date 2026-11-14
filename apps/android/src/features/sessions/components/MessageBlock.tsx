import React from 'react';
import { View } from 'react-native';
import { Collapsible, Markdown, Spinner, Text } from '../../../ui/components';
import { useTheme } from '../../../ui/theme';
import { isAssistantRole, type LiveMessage } from '../../../state/sessionTypes';
import { ToolRow } from './ToolRow';

/** One transcript message: a thinking block, body Markdown, then tool rows. */
export function MessageBlock({ message }: { message: LiveMessage }): React.JSX.Element {
  const theme = useTheme();
  const assistant = isAssistantRole(message.role);
  const text = message.text ?? '';
  const thinking = message.thinking ?? '';
  const tools = message.tools ?? [];
  const streaming = Boolean(message.streaming);
  const empty = text === '' && thinking === '' && tools.length === 0;

  if (!assistant && message.role !== 'user') {
    // Tool results and other non-conversational frames render as a muted,
    // full-width block, not a user bubble. Mono because the body is usually
    // file contents or command output.
    return (
      <View
        style={{
          backgroundColor: theme.color.bg.sunken,
          borderRadius: theme.radius.md,
          borderWidth: theme.border.hairline,
          borderColor: theme.color.border.hairline,
          paddingHorizontal: theme.space[3],
          paddingVertical: theme.space[2],
        }}>
        <Text variant="mono" color={theme.color.text.secondary}>
          {text}
        </Text>
      </View>
    );
  }

  if (!assistant) {
    return (
      <View style={{ alignItems: 'flex-end' }}>
        <View
          style={{
            maxWidth: '88%',
            backgroundColor: theme.color.bg.sunken,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.space[3],
            paddingVertical: theme.space[2],
          }}>
          <Markdown text={text} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.space[3] }}>
      {thinking ? (
        <Collapsible title="Thought">
          <Text variant="bodySm" color={theme.color.text.secondary}>
            {thinking}
          </Text>
        </Collapsible>
      ) : null}

      {text ? <Markdown text={text} /> : null}

      {tools.map((tool, index) => (
        <ToolRow key={tool.id ?? `${tool.name}-${index}`} tool={tool} />
      ))}

      {streaming && empty ? <Spinner size="small" /> : null}
    </View>
  );
}
