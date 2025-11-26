import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/theme';
import type { NfcTagStatus } from '../types';

type TagStatusBadgeProps = {
  status: NfcTagStatus;
};

const statusConfig: Record<
  NfcTagStatus,
  { label: string; bgColor: string; textColor: string }
> = {
  active: {
    label: 'Active',
    bgColor: 'rgba(34,197,94,0.2)',
    textColor: '#22c55e',
  },
  pending_link: {
    label: 'Pending',
    bgColor: 'rgba(251,191,36,0.2)',
    textColor: colors.amber,
  },
  lost: {
    label: 'Lost',
    bgColor: 'rgba(239,68,68,0.2)',
    textColor: colors.destructive,
  },
  revoked: {
    label: 'Revoked',
    bgColor: 'rgba(148,163,184,0.2)',
    textColor: 'rgba(148,163,184,0.9)',
  },
};

export function TagStatusBadge({ status }: TagStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.bgColor }]}>
      <Text style={[styles.text, { color: config.textColor }]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radius.md,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
