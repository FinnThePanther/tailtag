import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

export const loadUriAsUint8Array = async (uri: string): Promise<Uint8Array> => {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });

  const arrayBuffer = decode(base64);
  return new Uint8Array(arrayBuffer);
};
