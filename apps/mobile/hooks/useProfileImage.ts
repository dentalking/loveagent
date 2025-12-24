import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { decode } from 'base64-arraybuffer';

const BUCKET_NAME = 'profiles';

export function useProfileImage(userId: string | undefined) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Request permission and pick image from library
  async function pickImage(): Promise<string | null> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      setError('사진 접근 권한이 필요합니다.');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    return result.assets[0].base64 || null;
  }

  // Take photo with camera
  async function takePhoto(): Promise<string | null> {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== 'granted') {
      setError('카메라 접근 권한이 필요합니다.');
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    return result.assets[0].base64 || null;
  }

  // Upload image to Supabase Storage
  async function uploadImage(base64: string): Promise<string | null> {
    if (!userId) {
      setError('로그인이 필요합니다.');
      return null;
    }

    setUploading(true);
    setError(null);

    try {
      const fileName = `${userId}/profile_${Date.now()}.jpg`;
      const contentType = 'image/jpeg';

      // Delete existing profile image first
      const { data: existingFiles } = await supabase.storage
        .from(BUCKET_NAME)
        .list(userId);

      if (existingFiles && existingFiles.length > 0) {
        const filesToDelete = existingFiles.map((file) => `${userId}/${file.name}`);
        await supabase.storage.from(BUCKET_NAME).remove(filesToDelete);
      }

      // Upload new image
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, decode(base64), {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;

      // Update user profile with new image URL
      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_image_url: publicUrl })
        .eq('id', userId);

      if (updateError) {
        throw updateError;
      }

      return publicUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.';
      setError(message);
      return null;
    } finally {
      setUploading(false);
    }
  }

  // Pick from library and upload
  async function pickAndUpload(): Promise<string | null> {
    const base64 = await pickImage();
    if (!base64) return null;
    return uploadImage(base64);
  }

  // Take photo and upload
  async function takeAndUpload(): Promise<string | null> {
    const base64 = await takePhoto();
    if (!base64) return null;
    return uploadImage(base64);
  }

  // Delete profile image
  async function deleteImage(): Promise<boolean> {
    if (!userId) return false;

    setUploading(true);
    setError(null);

    try {
      // Delete from storage
      const { data: existingFiles } = await supabase.storage
        .from(BUCKET_NAME)
        .list(userId);

      if (existingFiles && existingFiles.length > 0) {
        const filesToDelete = existingFiles.map((file) => `${userId}/${file.name}`);
        await supabase.storage.from(BUCKET_NAME).remove(filesToDelete);
      }

      // Update user profile
      await supabase
        .from('users')
        .update({ profile_image_url: null })
        .eq('id', userId);

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '이미지 삭제에 실패했습니다.';
      setError(message);
      return false;
    } finally {
      setUploading(false);
    }
  }

  return {
    uploading,
    error,
    pickAndUpload,
    takeAndUpload,
    deleteImage,
  };
}
