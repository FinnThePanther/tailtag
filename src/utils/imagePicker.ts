import * as ImagePicker from 'expo-image-picker';

const FURSUIT_PHOTO_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.85,
};

export const launchFursuitPhotoPickerAsync = () =>
  ImagePicker.launchImageLibraryAsync(FURSUIT_PHOTO_PICKER_OPTIONS);
