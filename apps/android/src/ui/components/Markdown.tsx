import React, { useMemo } from 'react';
import {
  Linking,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme, type TypeVariant } from '../theme';
import { parseMarkdown, parseInline, type MarkdownBlock } from './markdownParse';
import { Text } from './Text';

function openLink(url: string): void {
  Linking.openURL(url).catch(() => {
    // A bad or unsupported link is not worth interrupting the transcript.
  });
}

/** Renders inline tokens inside a single Text so wrapping stays natural. */
function Inline({
  text,
  variant = 'bodySm',
}: {
  text: string;
  variant?: TypeVariant;
}): React.JSX.Element {
  const theme = useTheme();
  const tokens = useMemo(() => parseInline(text), [text]);

  return (
    <Text variant={variant}>
      {tokens.map((token, index) => {
        const key = `${token.type}-${index}`;
        if (token.type === 'bold') {
          return (
            <Text key={key} variant={variant === 'bodySm' ? 'bodySmStrong' : variant}>
              {token.value}
            </Text>
          );
        }
        if (token.type === 'italic') {
          return (
            <Text key={key} variant={variant} style={{ fontStyle: 'italic' }}>
              {token.value}
            </Text>
          );
        }
        if (token.type === 'code') {
          return (
            <Text key={key} variant="mono" color={theme.color.text.primary}>
              {token.value}
            </Text>
          );
        }
        if (token.type === 'link') {
          return (
            <Text
              key={key}
              variant={variant}
              color={theme.color.accentText}
              accessibilityRole="link"
              onPress={() => openLink(token.url)}>
              {token.value}
            </Text>
          );
        }
        return (
          <Text key={key} variant={variant}>
            {token.value}
          </Text>
        );
      })}
    </Text>
  );
}

function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string | null;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.color.bg.sunken,
        borderRadius: theme.radius.md,
        borderWidth: theme.border.hairline,
        borderColor: theme.color.border.hairline,
        paddingHorizontal: theme.space[3],
        paddingVertical: theme.space[2],
        gap: theme.space[1],
      }}>
      {language ? (
        <Text variant="monoLabel" color={theme.color.text.tertiary}>
          {language}
        </Text>
      ) : null}
      <Text variant="mono" color={theme.color.text.primary} selectable>
        {code}
      </Text>
    </View>
  );
}

function ListBlock({
  block,
}: {
  block: Extract<MarkdownBlock, { type: 'list' }>;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[1] }}>
      {block.items.map((item, index) => (
        <View key={index} style={{ flexDirection: 'row', gap: theme.space[2] }}>
          <Text
            variant="bodySm"
            color={theme.color.text.tertiary}
            style={{ minWidth: block.ordered ? 18 : 10 }}>
            {block.ordered ? `${index + 1}.` : '-'}
          </Text>
          <View style={{ flex: 1 }}>
            <Inline text={item} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Block({ block }: { block: MarkdownBlock }): React.JSX.Element {
  const theme = useTheme();

  if (block.type === 'code') {
    return <CodeBlock code={block.code} language={block.language} />;
  }
  if (block.type === 'heading') {
    return (
      <Inline
        text={block.text}
        variant={block.level <= 2 ? 'title3' : 'bodySmStrong'}
      />
    );
  }
  if (block.type === 'list') {
    return <ListBlock block={block} />;
  }
  return (
    <View style={{ gap: theme.space[1] }}>
      {block.lines.map((line, index) => (
        <Inline key={index} text={line} />
      ))}
    </View>
  );
}

interface MarkdownProps {
  text: string;
  style?: StyleProp<ViewStyle>;
}

/** Renders transcript Markdown with the brand type scale and surfaces. */
export function Markdown({ text, style }: MarkdownProps): React.JSX.Element {
  const theme = useTheme();
  const blocks = useMemo(() => parseMarkdown(text), [text]);

  return (
    <View style={[{ gap: theme.space[3], maxWidth: '100%' }, style]}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </View>
  );
}
