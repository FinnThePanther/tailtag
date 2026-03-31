import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppAvatar } from '../../../components/ui/AppAvatar';
import { TailTagInput } from '../../../components/ui/TailTagInput';
import { colors, radius, spacing } from '../../../theme';
import type { FursuitPickerItem } from '../api';

type FursuitPickerProps = {
  items: FursuitPickerItem[];
  selectedId: string | null;
  onSelect: (item: FursuitPickerItem) => void;
  isLoading?: boolean;
};

export function FursuitPicker({
  items,
  selectedId,
  onSelect,
  isLoading = false,
}: FursuitPickerProps) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? items.filter((item) =>
        item.name.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Loading fursuits…</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="paw-outline" size={32} color="rgba(148,163,184,0.4)" />
        <Text style={styles.emptyTitle}>No fursuits found</Text>
        <Text style={styles.emptySubtitle}>
          No fursuits are registered at your conventions yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TailTagInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name…"
        style={styles.searchInput}
      />
      {filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptySubtitle}>No results for "{search}"</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <FursuitPickerRow
              item={item}
              isSelected={item.id === selectedId}
              onPress={() => onSelect(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          scrollEnabled={false}
        />
      )}
    </View>
  );
}

type RowProps = {
  item: FursuitPickerItem;
  isSelected: boolean;
  onPress: () => void;
};

function FursuitPickerRow({ item, isSelected, onPress }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, isSelected && styles.rowSelected]}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={`${item.name}${item.species ? `, ${item.species}` : ''}`}
    >
      <AppAvatar url={item.avatarUrl} size="sm" fallback="fursuit" style={styles.avatarFlexShrink} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        {item.species ? (
          <Text style={styles.rowSpecies} numberOfLines={1}>
            {item.species}
          </Text>
        ) : null}
      </View>
      {isSelected && (
        <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  searchInput: {
    marginBottom: spacing.xs,
  },
  center: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  loadingText: {
    color: 'rgba(148,163,184,0.7)',
    fontSize: 14,
  },
  emptyTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: 'rgba(148,163,184,0.7)',
    fontSize: 13,
    textAlign: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(148,163,184,0.1)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  rowSelected: {
    backgroundColor: 'rgba(99,102,241,0.12)',
  },
  avatarFlexShrink: {
    flexShrink: 0,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  rowSpecies: {
    color: 'rgba(148,163,184,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
});
