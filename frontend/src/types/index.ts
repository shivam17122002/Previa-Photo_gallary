export type Role = 'USER' | 'ADMIN';
export type UserStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type ScanStatus = 'PENDING' | 'CLEAN' | 'INFECTED' | 'SKIPPED';
export type NotificationType =
  | 'UPLOAD_SUCCESS'
  | 'UPLOAD_FAILED'
  | 'MALWARE_DETECTED'
  | 'SECURITY_ALERT'
  | 'ADMIN_APPROVAL'
  | 'SYSTEM';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: UserStatus;
  avatarUrl?: string;
  storageQuota: string;
  usedStorage: string;
  createdAt?: string;
}

export interface FileItem {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: string;
  folderId?: string | null;
  folder?: { id: string; name: string } | null;
  isFavorite: boolean;
  isTrash: boolean;
  trashedAt?: string | null;
  scanStatus: ScanStatus;
  scanResult?: string | null;
  category: 'image' | 'video' | 'audio' | 'document' | 'other';
  createdAt: string;
  updatedAt: string;
}

export interface FolderItem {
  id: string;
  name: string;
  parentId?: string | null;
  fileCount?: number;
  folderCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export interface StorageBreakdownCategory {
  bytes: string;
  count: number;
}

export interface DashboardStats {
  storage: {
    quota: string;
    used: string;
    breakdown: {
      images: StorageBreakdownCategory;
      videos: StorageBreakdownCategory;
      audio: StorageBreakdownCategory;
      documents: StorageBreakdownCategory;
      other: StorageBreakdownCategory;
    };
  };
  counts: {
    files: number;
    folders: number;
  };
  recentFiles: FileItem[];
  favoriteFiles: FileItem[];
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
}

export interface UploadProgressItem {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'paused';
  error?: string;
  folderId?: string;
  sessionId?: string;
}
