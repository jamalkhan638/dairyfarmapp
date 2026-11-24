import React from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { api } from '../lib/api';
import { localPhoto } from '../lib/photos';
import { colors } from '../lib/theme';

/** Shows the phone's own copy if there is one, otherwise downloads it from the server. */
export function AnimalPhoto({ photoId, tag, size = 64 }: { photoId: string | null; tag: string; size?: number }) {
  const box = { width: size, height: size, borderRadius: size / 6, backgroundColor: colors.primaryLight, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const };
  if (!photoId) {
    return (
      <View style={box}>
        <Text style={{ fontSize: size / 3, color: colors.primaryDark, fontWeight: '800' }}>{tag.slice(0, 4)}</Text>
      </View>
    );
  }
  const f = localPhoto(photoId);
  const source = f.exists ? { uri: f.uri } : api.fileSource(photoId);
  return (
    <View style={box}>
      <Image source={source} style={{ width: size, height: size }} contentFit="cover" cachePolicy="disk" recyclingKey={photoId} />
    </View>
  );
}
