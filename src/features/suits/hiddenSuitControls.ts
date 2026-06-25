import AsyncStorage from '@react-native-async-storage/async-storage';

const CONTROL_VERSION = 'v1';

const hiddenSuitsVisibleKey = (userId: string) =>
  `tailtag:suits:hidden-visible:${CONTROL_VERSION}:${userId}`;

const pendingHiddenSuitTipKey = (userId: string) =>
  `tailtag:suits:hidden-tip-pending:${CONTROL_VERSION}:${userId}`;

export async function getHiddenSuitsVisiblePreference(userId: string): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(hiddenSuitsVisibleKey(userId));
    return value !== 'false';
  } catch (error) {
    console.warn('Failed to read hidden suits visibility preference', error);
    return true;
  }
}

export async function setHiddenSuitsVisiblePreference(
  userId: string,
  visible: boolean,
): Promise<void> {
  try {
    await AsyncStorage.setItem(hiddenSuitsVisibleKey(userId), visible ? 'true' : 'false');
  } catch (error) {
    console.warn('Failed to save hidden suits visibility preference', error);
  }
}

export async function queueHiddenSuitAddedTip(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(pendingHiddenSuitTipKey(userId), 'true');
  } catch (error) {
    console.warn('Failed to queue hidden suit tip', error);
  }
}

export async function consumeHiddenSuitAddedTip(userId: string): Promise<boolean> {
  try {
    const key = pendingHiddenSuitTipKey(userId);
    const value = await AsyncStorage.getItem(key);
    if (value !== 'true') {
      return false;
    }

    await AsyncStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn('Failed to consume hidden suit tip', error);
    return false;
  }
}
