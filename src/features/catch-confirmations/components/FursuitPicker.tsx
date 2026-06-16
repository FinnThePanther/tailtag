import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppAvatar } from '../../../components/ui/AppAvatar';
import { TailTagInput } from '../../../components/ui/TailTagInput';
import { colors } from '../../../theme';
import type { FursuitPickerItem } from '../api';
import { styles } from './FursuitPicker.styles';

type FursuitPickerProps = {
  items: FursuitPickerItem[];
  selectedId: string | null;
  selectedIds?: string[];
  selectionMode?: 'single' | 'multiple';
  selectionLimit?: number;
  onSelect: (item: FursuitPickerItem) => void;
  isLoading?: boolean;
  disabled?: boolean;
};

export function FursuitPicker({
  items,
  selectedId,
  selectedIds = [],
  selectionMode = 'single',
  selectionLimit,
  onSelect,
  isLoading = false,
  disabled = false,
}: FursuitPickerProps) {
  const [search, setSearch] = useState('');
  const selectedIdSet = new Set(
    selectionMode === 'multiple' ? selectedIds : selectedId ? [selectedId] : [],
  );
  const hasReachedSelectionLimit =
    selectionMode === 'multiple' &&
    typeof selectionLimit === 'number' &&
    selectedIdSet.size >= selectionLimit;

  const filtered = search.trim()
    ? items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
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
        <Ionicons
          name="paw-outline"
          size={32}
          color="rgba(148,163,184,0.4)"
        />
        <Text style={styles.emptyTitle}>No fursuits found</Text>
        <Text style={styles.emptySubtitle}>
          No other fursuits are listed for your playable conventions yet. Ask the fursuiter to make
          sure they are Ready to catch and that this specific suit is listed for the same event.
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
        autoCorrect={false}
        style={styles.searchInput}
        editable={!disabled}
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
              isSelected={selectedIdSet.has(item.id)}
              onPress={() => onSelect(item)}
              disabled={disabled || (hasReachedSelectionLimit && !selectedIdSet.has(item.id))}
              selectionMode={selectionMode}
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
  disabled?: boolean;
  selectionMode?: 'single' | 'multiple';
};

function FursuitPickerRow({
  item,
  isSelected,
  onPress,
  disabled = false,
  selectionMode = 'single',
}: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.row, isSelected && styles.rowSelected, disabled && styles.rowDisabled]}
      accessibilityRole={selectionMode === 'multiple' ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: isSelected, disabled }}
      accessibilityLabel={`${item.name}${item.species ? `, ${item.species}` : ''}`}
    >
      <AppAvatar
        url={item.avatarUrl}
        size="sm"
        fallback="fursuit"
        style={styles.avatarFlexShrink}
      />
      <View style={styles.rowText}>
        <Text
          style={styles.rowName}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        {item.species ? (
          <Text
            style={styles.rowSpecies}
            numberOfLines={1}
          >
            {item.species}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name={
          selectionMode === 'multiple'
            ? isSelected
              ? 'checkbox'
              : 'square-outline'
            : isSelected
              ? 'checkmark-circle'
              : 'ellipse-outline'
        }
        size={22}
        color={isSelected ? colors.primary : colors.textFaint}
      />
    </Pressable>
  );
}
