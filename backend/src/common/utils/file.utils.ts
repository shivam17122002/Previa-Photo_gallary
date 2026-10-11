import * as path from 'path';

export function getFileCategory(mimeType: string, filename: string): 'image' | 'video' | 'audio' | 'document' | 'other' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (
    mimeType === 'application/pdf' ||
    mimeType.includes('document') ||
    mimeType.includes('word') ||
    mimeType.includes('text') ||
    mimeType.includes('presentation') ||
    mimeType.includes('sheet')
  ) {
    return 'document';
  }

  const ext = path.extname(filename).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.tiff'].includes(ext)) {
    return 'image';
  }
  if (['.mp4', '.webm', '.mkv', '.mov', '.avi', '.wmv', '.m4v'].includes(ext)) {
    return 'video';
  }
  if (['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'].includes(ext)) {
    return 'audio';
  }
  if (['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf', '.xlsx', '.csv', '.pptx'].includes(ext)) {
    return 'document';
  }

  return 'other';
}

export function sanitizeFilename(filename: string): string {
  // Remove null bytes, path traversal sequences
  return filename
    .replace(/\0/g, '')
    .replace(/(\.\.[\/\\])+/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim();
}

export function formatBytes(bytes: bigint | number, decimals = 2): string {
  const b = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (b === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
