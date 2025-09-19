import { put, del } from '@vercel/blob';

interface UploadImageOptions {
  userId: string;
  worldId: string;
  pageId: string;
  imageData: string; // base64 data URL or base64 string
}

export async function uploadImageToBlob({
  userId,
  worldId,
  pageId,
  imageData
}: UploadImageOptions): Promise<string> {
  try {
    // Extract base64 data if it's a data URL
    const base64Data = imageData.startsWith('data:')
      ? imageData.split(',')[1]
      : imageData;

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Create a structured path for the image
    const timestamp = Date.now();
    const pathname = `wiki-images/${userId}/${worldId}/${pageId}-${timestamp}.png`;

    // Upload to Vercel Blob
    const blob = await put(pathname, buffer, {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: false
    });

    return blob.url;
  } catch (error) {
    console.error('Failed to upload image to blob storage:', error);
    throw new Error('Failed to upload image to storage');
  }
}

export async function deleteImageFromBlob(url: string): Promise<void> {
  try {
    await del(url);
  } catch (error) {
    console.error('Failed to delete image from blob storage:', error);
    // Non-critical error, don't throw
  }
}

export function isExternalImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

export function isDataUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith('data:');
}