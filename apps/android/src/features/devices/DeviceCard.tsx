import React, { useState } from 'react';
import { View } from 'react-native';
import type { DeviceSummary } from '@omp-console/protocol';
import {
  Banner,
  Button,
  Card,
  Chip,
  Text,
  TextField,
} from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { deviceMeta } from './deviceDisplay';

interface DeviceCardProps {
  device: DeviceSummary;
  busy: boolean;
  onRename(name: string): Promise<boolean>;
  onRevoke(): Promise<boolean>;
  onRotate(): Promise<boolean>;
}

/**
 * One paired device with its own inline rename and revoke confirmation. Rotate
 * is only offered for the current device, because the new token has to be
 * stored on the phone that is rotating it.
 */
export function DeviceCard({
  device,
  busy,
  onRename,
  onRevoke,
  onRotate,
}: DeviceCardProps): React.JSX.Element {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(device.name);
  const [confirming, setConfirming] = useState(false);

  const revoked = device.revokedAt !== null;

  const status = device.current ? (
    <Chip label="This device" tone="signal" />
  ) : revoked ? (
    <Chip label="Revoked" tone="danger" />
  ) : null;

  const save = async (): Promise<void> => {
    const ok = await onRename(draft);
    if (ok) setEditing(false);
  };

  return (
    <Card testID={`device-${device.id}`} style={{ gap: theme.space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space[3] }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {device.name}
          </Text>
          <Text variant="caption" color={theme.color.text.secondary}>
            {deviceMeta(device.scopes, device.lastSeenAt, device.tokenExpiresAt)}
          </Text>
        </View>
        {status}
      </View>

      {editing ? (
        <View style={{ gap: theme.space[2] }}>
          <TextField
            label="Device name"
            value={draft}
            onChangeText={setDraft}
            inputTestID={`device-name-${device.id}`}
            maxLength={64}
            autoFocus
          />
          <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
            <Button
              testID={`device-save-${device.id}`}
              label="Save"
              size="sm"
              fullWidth={false}
              loading={busy}
              onPress={() => void save()}
            />
            <Button
              label="Cancel"
              size="sm"
              variant="ghost"
              fullWidth={false}
              onPress={() => {
                setEditing(false);
                setDraft(device.name);
              }}
            />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {!revoked ? (
            <Button
              testID={`device-rename-${device.id}`}
              label="Rename"
              size="sm"
              variant="secondary"
              fullWidth={false}
              onPress={() => {
                setDraft(device.name);
                setEditing(true);
              }}
            />
          ) : null}
          {device.current && !revoked ? (
            <Button
              testID={`device-rotate-${device.id}`}
              label="Rotate token"
              size="sm"
              variant="secondary"
              fullWidth={false}
              loading={busy}
              onPress={() => void onRotate()}
            />
          ) : null}
          {!device.current && !revoked ? (
            <Button
              testID={`device-revoke-${device.id}`}
              label="Revoke"
              size="sm"
              variant="destructive"
              fullWidth={false}
              onPress={() => setConfirming(true)}
            />
          ) : null}
        </View>
      )}

      {confirming ? (
        <Banner
          testID={`device-confirm-${device.id}`}
          tone="danger"
          title="Revoke this device?"
          message="It signs out immediately and cannot reconnect until it is paired again."
          action={
            <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
              <Button
                testID={`device-revoke-now-${device.id}`}
                label="Revoke now"
                size="sm"
                variant="destructive"
                fullWidth={false}
                loading={busy}
                onPress={() => {
                  void onRevoke().then(() => setConfirming(false));
                }}
              />
              <Button
                label="Cancel"
                size="sm"
                variant="ghost"
                fullWidth={false}
                onPress={() => setConfirming(false)}
              />
            </View>
          }
        />
      ) : null}
    </Card>
  );
}