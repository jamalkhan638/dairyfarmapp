import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';

const MAX_SIDE = 1280;

function photosDir() {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Where a photo with this attachment id is kept on the phone. */
export function localPhoto(attachmentId: string): File {
  return new File(photosDir(), `${attachmentId}.jpg`);
}

/**
 * Let the user take or choose a photo, then shrink it to a small JPEG so it
 * uploads quickly on mobile data. Returns a temporary file uri, or null if cancelled.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<{ uri: string; size: number } | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [4, 3] };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  let ctx = ImageManipulator.manipulate(asset.uri);
  const big = Math.max(asset.width ?? 0, asset.height ?? 0);
  if (big > MAX_SIDE) {
    ctx = (asset.width ?? 0) >= (asset.height ?? 0) ? ctx.resize({ width: MAX_SIDE }) : ctx.resize({ height: MAX_SIDE });
  }
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  const f = new File(saved.uri);
  return { uri: saved.uri, size: f.size ?? 0 };
}

/** Copy a picked photo into permanent storage under its attachment id. */
export function keepPhoto(tempUri: string, attachmentId: string): File {
  const dest = localPhoto(attachmentId);
  if (dest.exists) dest.delete();
  new File(tempUri).copySync(dest);
  return dest;
}
