'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Bell, Check, ChevronDown, ChevronRight, Clock3, Cloud, FileAudio, FileImage, FileText, FileVideo, Folder, HardDrive, LayoutGrid, List, LogOut, Menu, MoreHorizontal, Plus, Search, Settings2, Shield, Star, Trash2, Upload, X } from 'lucide-react';
import { api, getCurrentUser, json } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/utils';
import type { DashboardStats, FileItem, FolderItem, NotificationItem, User } from '@/types';

type View = 'home' | 'my files' | 'recent' | 'starred' | 'trash' | 'admin' | 'settings';
const navItems: { name: View; icon: typeof HardDrive }[] = [
  { name: 'home', icon: LayoutGrid }, { name: 'my files', icon: HardDrive }, { name: 'recent', icon: Clock3 }, { name: 'starred', icon: Star }, { name: 'trash', icon: Trash2 },
];
const initialStats: DashboardStats = { storage: { quota: '5368709120', used: '0', breakdown: { images: { bytes: '0', count: 0 }, videos: { bytes: '0', count: 0 }, audio: { bytes: '0', count: 0 }, documents: { bytes: '0', count: 0 }, other: { bytes: '0', count: 0 } } }, counts: { files: 0, folders: 0 }, recentFiles: [], favoriteFiles: [] };
const categoryIcon = (category: FileItem['category']) => category === 'image' ? FileImage : category === 'video' ? FileVideo : category === 'audio' ? FileAudio : FileText;

export default function DrivePage() {
  const router = useRouter(); const inputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null); const [view, setView] = useState<View>('home'); const [folderId, setFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState(''); const [folders, setFolders] = useState<FolderItem[]>([]); const [files, setFiles] = useState<FileItem[]>([]); const [stats, setStats] = useState(initialStats);
  const [query, setQuery] = useState(''); const [layout, setLayout] = useState<'grid' | 'list'>('grid'); const [selected, setSelected] = useState<FileItem | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]); const [toast, setToast] = useState(''); const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false); const [folderDialog, setFolderDialog] = useState(false); const [adminUsers, setAdminUsers] = useState<any[]>([]); const [adminStats, setAdminStats] = useState<any>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const notice = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3200); };

  const load = useCallback(async () => {
    try {
      const me = await getCurrentUser(); setUser(me);
      const [dashboard, folderRows, fileRows, notificationRows] = await Promise.all([
        api<DashboardStats>('/files/dashboard'),
        api<FolderItem[]>(`/folders${view === 'trash' ? '/trash' : `?parentId=${folderId || ''}`}`),
        api<FileItem[]>(`/files?${new URLSearchParams({ ...(view === 'trash' ? { isTrash: 'true' } : view === 'starred' ? { isFavorite: 'true' } : view === 'recent' ? { all: 'true' } : folderId ? { folderId } : {}), ...(query ? { search: query } : {}) })}`),
        api<NotificationItem[]>('/notifications'),
      ]);
      setStats(dashboard); setFolders(folderRows); setFiles(view === 'home' && !query ? dashboard.recentFiles : view === 'recent' ? [...fileRows].sort((a,b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 40) : fileRows); setNotifications(notificationRows);
    } catch { router.replace('/login'); }
  }, [folderId, query, router, view]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timer);
  }, [toast]);

  async function act(path: string, method: string, body?: unknown, success?: string) {
    try { await api(path, json(method, body)); await load(); if (success) notice(success); }
    catch (error) { notice(error instanceof Error ? error.message : 'Something went wrong.'); }
  }
  async function createFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await act('/folders', 'POST', { name: data.get('name'), parentId: folderId || undefined }, 'Folder created'); setFolderDialog(false);
  }
  async function uploadFiles(chosen: FileList | null) {
    if (!chosen?.length) return; const queue = Array.from(chosen); setBusy(true);
    for (const file of queue) {
      setUploading((items) => [...items, file.name]);
      try {
        if (file.size <= 100 * 1024 * 1024) {
          const form = new FormData(); form.append('file', file); if (folderId) form.append('folderId', folderId);
          await api('/files/upload', { method: 'POST', body: form });
        } else {
          const chunkSize = 10 * 1024 * 1024; const totalParts = Math.ceil(file.size / chunkSize);
          const session = await api<{ sessionId: string }>('/files/chunk/init', json('POST', { fileName: file.name, fileSize: file.size, mimeType: file.type || 'application/octet-stream', totalParts, folderId: folderId || undefined }));
          const parts: { partNumber: number; etag: string }[] = [];
          for (let i = 0; i < totalParts; i++) {
            const form = new FormData(); form.append('chunk', file.slice(i * chunkSize, Math.min(file.size, (i + 1) * chunkSize))); form.append('sessionId', session.sessionId); form.append('partNumber', String(i + 1));
            parts.push(await api<{ partNumber: number; etag: string }>(`/files/chunk/upload-part`, { method: 'POST', body: form }));
          }
          await api('/files/chunk/complete', json('POST', { sessionId: session.sessionId, parts }));
        }
        notice(`${file.name} uploaded`);
      } catch (error) { notice(error instanceof Error ? error.message : `Upload failed: ${file.name}`); }
      finally { setUploading((items) => items.filter((item) => item !== file.name)); }
    }
    setBusy(false); if (inputRef.current) inputRef.current.value = ''; await load();
  }
  async function openFolder(folder: FolderItem) { setFolderId(folder.id); setFolderName(folder.name); setView('my files'); setQuery(''); }
  async function refreshAdmin() {
    try { const [rows, totals] = await Promise.all([api<any[]>('/admin/users'), api<any>('/admin/stats')]); setAdminUsers(rows); setAdminStats(totals); }
    catch (error) { notice(error instanceof Error ? error.message : 'Admin data unavailable'); }
  }
  function changeView(name: View) { setView(name); setFolderId(null); setFolderName(''); setQuery(''); setMobileNav(false); if (name === 'admin') refreshAdmin(); }
  async function logout() { try { await api('/auth/logout', { method: 'POST' }); } finally { router.push('/login'); } }
  const unread = notifications.filter((n) => !n.isRead).length;
  const usedPercent = Math.min(100, Math.round(Number(stats.storage.used) / Math.max(Number(stats.storage.quota), 1) * 100));
  const greeting = user?.fullName?.trim().split(/\s+/)[0] || 'there';
  const heading = view === 'home' ? 'Your space' : view === 'my files' ? (folderName || 'My files') : view === 'recent' ? 'Recent' : view === 'starred' ? 'Starred' : view === 'trash' ? 'Trash' : view === 'admin' ? 'People' : 'Settings';
  const emptyCopy = query ? 'Try a different search term.' : view === 'trash' ? 'Deleted items will show up here.' : view === 'starred' ? 'Star files to keep them close.' : 'Drop something here to get started.';

  const visibleFiles = useMemo(() => files.filter((file) => view === 'trash' ? true : file.scanStatus !== 'INFECTED'), [files, view]);

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <button className="brand sidebar-brand" onClick={() => changeView('home')}><span className="brand-mark"><Cloud size={20}/></span>previa<span className="brand-dot">.</span></button>
      <button className="button primary upload-button" onClick={() => inputRef.current?.click()}><Plus size={17}/> Upload files</button>
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => uploadFiles(e.target.files)}/>
      <nav className="main-nav">{navItems.map(({ name, icon: Icon }) => <button key={name} className={`nav-item ${view === name ? 'active' : ''}`} onClick={() => changeView(name)}><Icon size={18}/><span>{name === 'home' ? 'Overview' : name === 'my files' ? 'My files' : name[0].toUpperCase() + name.slice(1)}</span>{name === 'trash' && <span className="nav-count">{folders.length + (view === 'trash' ? files.length : 0) || ''}</span>}</button>)}</nav>
      {user?.role === 'ADMIN' && <><div className="nav-label">WORKSPACE</div><button className={`nav-item ${view === 'admin' ? 'active' : ''}`} onClick={() => changeView('admin')}><Shield size={18}/><span>People</span></button></>}
      <div className="sidebar-spacer"/>
      <div className="storage-card"><div className="storage-title"><HardDrive size={16}/><span>Storage</span></div><div className="storage-meter"><i style={{ width: `${usedPercent}%` }}/></div><p><b>{formatBytes(stats.storage.used)}</b> of {formatBytes(stats.storage.quota)} used</p><small>{stats.counts.files} files · {stats.counts.folders} folders</small></div>
      <button className="profile-button" onClick={() => changeView('settings')}><span className="avatar">{greeting.charAt(0).toUpperCase()}</span><span className="profile-copy"><b>{user?.fullName || 'Loading…'}</b><small>{user?.email}</small></span><MoreHorizontal size={17}/></button>
    </aside>
    {mobileNav && <button className="scrim" aria-label="Close menu" onClick={() => setMobileNav(false)}/>}
    <main className="main-area">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={19}/></button><div className="search-box"><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your files"/><kbd>⌘ K</kbd></div><div className="top-actions"><button className="icon-button" aria-label="Notifications" onClick={() => setMenuOpen(!menuOpen)}><Bell size={19}/>{unread > 0 && <i className="notification-dot"/>}</button><span className="top-divider"/><button className="top-avatar" onClick={() => changeView('settings')}>{greeting.charAt(0).toUpperCase()}</button></div>
        {menuOpen && <div className="notification-panel"><div className="panel-heading"><b>Notifications</b>{unread > 0 && <button onClick={() => act('/notifications/read-all', 'POST', undefined, 'All caught up')}>Mark all read</button>}</div>{notifications.length ? notifications.slice(0, 6).map((n) => <button className={`notification-item ${n.isRead ? '' : 'unread'}`} key={n.id} onClick={() => act(`/notifications/${n.id}/read`, 'PATCH')}><span className="notification-icon"><Activity size={15}/></span><span><b>{n.title}</b><small>{n.message}</small></span></button>) : <p className="muted notification-empty">Nothing new. You’re all caught up.</p>}</div>}</header>
      <section className="content-area">
        {view === 'home' && <div className="welcome-row"><div><span className="eyebrow">YOUR PRIVATE CLOUD</span><h1>Good to see you, {greeting} <span className="wave">✳</span></h1><p className="muted">Everything you care about, all in one place.</p></div><div className="today-chip"><span className="today-dot"/>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</div></div>}
        {view !== 'home' && <div className="page-title-row"><div><span className="eyebrow">{view === 'admin' ? 'ADMINISTRATION' : 'YOUR LIBRARY'}</span><h1>{heading}</h1>{view === 'my files' && folderId && <button className="back-link" onClick={() => { setFolderId(null); setFolderName(''); }}>← All files</button>}</div><div className="title-actions">{view === 'my files' && <button className="button secondary" onClick={() => setFolderDialog(true)}><Folder size={16}/> New folder</button>}{view !== 'trash' && view !== 'admin' && view !== 'settings' && <button className="button primary" onClick={() => inputRef.current?.click()}><Upload size={16}/> Upload</button>}</div></div>}

        {view === 'home' && <><div className="stats-row"><article className="stat-card storage-stat"><div className="stat-top"><span>Storage used</span><HardDrive size={17}/></div><div className="storage-amount">{formatBytes(stats.storage.used)} <span>/ {formatBytes(stats.storage.quota)}</span></div><div className="big-meter"><i style={{ width: `${usedPercent}%` }}/></div><small>{usedPercent}% of your space used</small></article><article className="stat-card"><div className="stat-top"><span>Files</span><FileText size={17}/></div><strong>{stats.counts.files}</strong><small>across your private space</small></article><article className="stat-card"><div className="stat-top"><span>Folders</span><Folder size={17}/></div><strong>{stats.counts.folders}</strong><small>keeping everything in order</small></article></div><div className="quick-upload" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); uploadFiles(e.dataTransfer.files); }}><span className="quick-upload-icon"><Upload size={20}/></span><div><b>Bring your files in</b><p>Drag and drop here, or <button onClick={() => inputRef.current?.click()}>browse your device</button></p></div><span className="upload-hint">Up to 100 MB per file</span></div></>}

        {view === 'admin' ? <section className="admin-view"><div className="admin-metrics">{[['Total people', adminStats?.users?.total ?? '—'], ['Waiting for review', adminStats?.users?.pending ?? '—'], ['Approved', adminStats?.users?.approved ?? '—']].map(([label, value]) => <div className="mini-stat" key={label}><small>{label}</small><b>{value}</b></div>)}</div><div className="section-heading"><div><h2>Account requests</h2><p>Review access to your workspace.</p></div><button className="button secondary" onClick={refreshAdmin}><Activity size={15}/> Refresh</button></div><div className="table-wrap"><table><thead><tr><th>Person</th><th>Status</th><th>Joined</th><th>Usage</th><th>Access</th></tr></thead><tbody>{adminUsers.map((person) => <tr key={person.id}><td><div className="table-person"><span className="avatar small">{person.fullName?.[0] || '?'}</span><span><b>{person.fullName}</b><small>{person.email}</small></span></div></td><td><span className={`status-pill ${person.status.toLowerCase()}`}>{person.status}</span></td><td>{formatDate(person.createdAt)}</td><td>{formatBytes(person.usedStorage)}</td><td>{person.status === 'PENDING' ? <div className="row-actions"><button className="button approve" onClick={() => act(`/admin/users/${person.id}/approve`, 'POST', undefined, 'Account approved')}>Approve</button><button className="button reject" onClick={() => act(`/admin/users/${person.id}/reject`, 'POST', undefined, 'Request declined')}>Decline</button></div> : <span className="muted">{person.role === 'ADMIN' ? 'Administrator' : 'Member'}</span>}</td></tr>)}</tbody></table>{!adminUsers.length && <div className="table-empty">No accounts to display.</div>}</div></section> : view === 'settings' ? <section className="settings-card"><h2>Your profile</h2><form className="stack" onSubmit={async (e) => { e.preventDefault(); const data = new FormData(e.currentTarget); await act('/auth/profile', 'PATCH', { fullName: data.get('fullName') }, 'Profile updated'); }}><label>Full name<input name="fullName" defaultValue={user?.fullName}/></label><label>Email address<input value={user?.email || ''} disabled/></label><label>Account type<input value={user?.role === 'ADMIN' ? 'Administrator' : 'Personal account'} disabled/></label><button className="button primary">Save changes</button></form><button className="button secondary logout-button" onClick={logout}><LogOut size={16}/> Sign out</button></section> : <>

        {(view === 'home' || view === 'my files') && <div className="section-heading folder-heading"><div><h2>{view === 'home' ? 'Your folders' : 'Folders'}</h2><p>{folders.length ? 'A little room for everything.' : 'Create a folder to keep things tidy.'}</p></div>{view === 'home' && <button className="text-button" onClick={() => changeView('my files')}>Browse all <ChevronRight size={15}/></button>}{view === 'my files' && <button className="button secondary" onClick={() => setFolderDialog(true)}><Plus size={16}/> New folder</button>}</div>}
        {(view === 'home' || view === 'my files' || view === 'trash') && folders.length > 0 && <div className="folder-grid">{folders.map((folder) => <article className="folder-card" key={folder.id}><button className="folder-open" onClick={() => view === 'trash' ? undefined : openFolder(folder)}><span className="folder-icon"><Folder size={21} fill="currentColor"/></span><span className="folder-meta"><b>{folder.name}</b><small>{folder.fileCount ?? 0} files</small></span><ChevronRight size={16} className="folder-arrow"/></button>{view === 'trash' && <div className="folder-trash-actions"><button onClick={() => act(`/folders/${folder.id}/restore`, 'POST', undefined, 'Folder restored')}><Activity size={14}/> Restore</button><button onClick={() => act(`/folders/${folder.id}/permanent`, 'DELETE', undefined, 'Folder deleted')}><Trash2 size={14}/> Delete forever</button></div>}</article>)}</div>}
        {(view === 'home' || view === 'my files' || view === 'recent' || view === 'starred' || view === 'trash') && <div className="section-heading files-heading"><div><h2>{view === 'home' ? 'Recent files' : view === 'trash' ? 'Deleted files' : 'Files'} <span className="count-badge">{visibleFiles.length}</span></h2><p>{view === 'home' ? 'Pick up where you left off.' : view === 'trash' ? 'Restore an item or remove it permanently.' : 'Your files, just how you left them.'}</p></div><div className="view-toggle"><button aria-label="Grid view" className={layout === 'grid' ? 'selected' : ''} onClick={() => setLayout('grid')}><LayoutGrid size={16}/></button><button aria-label="List view" className={layout === 'list' ? 'selected' : ''} onClick={() => setLayout('list')}><List size={17}/></button></div></div>}
        {visibleFiles.length > 0 && <div className={layout === 'grid' ? 'file-grid' : 'file-list'}>{visibleFiles.map((file) => { const Icon = categoryIcon(file.category); return <article className="file-card" key={file.id}><button className="file-open" onClick={() => view === 'trash' ? undefined : setSelected(file)}><span className={`file-art ${file.category}`}><Icon size={22}/><small>{file.name.split('.').pop()?.slice(0, 4).toUpperCase()}</small></span><span className="file-meta"><b title={file.name}>{file.name}</b><small>{formatBytes(file.size)} <i/> {formatDate(file.createdAt)}</small></span></button><div className="file-actions">{view === 'trash' ? <><button title="Restore" onClick={() => act(`/files/${file.id}/restore`, 'POST', undefined, 'File restored')}><Activity size={15}/></button><button title="Delete forever" onClick={() => act(`/files/${file.id}/permanent`, 'DELETE', undefined, 'File deleted forever')}><Trash2 size={15}/></button></> : <><button className={file.isFavorite ? 'fav-on' : ''} title={file.isFavorite ? 'Remove from starred' : 'Add to starred'} onClick={() => act(`/files/${file.id}/favorite`, 'POST')}><Star size={15} fill={file.isFavorite ? 'currentColor' : 'none'}/></button><button title="Move to trash" onClick={() => act(`/files/${file.id}`, 'DELETE', undefined, 'Moved to trash')}><Trash2 size={15}/></button></>}</div></article>; })}</div>}
        {visibleFiles.length === 0 && folders.length === 0 && <div className="empty-state"><span className="empty-icon">{view === 'trash' ? <Trash2 size={23}/> : view === 'starred' ? <Star size={23}/> : <Cloud size={24}/>}</span><h3>{query ? 'No matches found' : view === 'trash' ? 'Your trash is empty' : view === 'starred' ? 'No starred files yet' : 'A little space to begin'}</h3><p>{emptyCopy}</p>{view === 'trash' && <button className="button secondary" onClick={() => act('/files/trash/empty', 'DELETE', undefined, 'Trash emptied')}>Empty trash</button>}{view === 'home' && <button className="button primary" onClick={() => inputRef.current?.click()}><Upload size={16}/> Upload your first file</button>}</div>}
        {view === 'trash' && (visibleFiles.length > 0 || folders.length > 0) && <div className="trash-footer"><span>Items stay here until you remove them.</span><button className="text-button danger-text" onClick={() => act('/files/trash/empty', 'DELETE', undefined, 'Trash emptied')}>Empty trash</button></div>}
        </>}
        {uploading.length > 0 && <div className="upload-status"><span className="spinner"/><span><b>Uploading {uploading.length} {uploading.length === 1 ? 'file' : 'files'}</b><small>{uploading[0]}{uploading.length > 1 ? ` and ${uploading.length - 1} more` : ''}</small></span><span className="upload-status-end">{busy ? 'In progress' : 'Done'}</span></div>}
      </section>
    </main>
    {folderDialog && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setFolderDialog(false)}><form className="dialog" onSubmit={createFolder}><button type="button" className="dialog-close" onClick={() => setFolderDialog(false)} aria-label="Close"><X size={18}/></button><span className="auth-icon"><Folder size={20}/></span><h2>Make a folder</h2><p className="muted">A place to keep related things together.</p><label>Folder name<input name="name" placeholder="e.g. Project notes" autoFocus required maxLength={120}/></label><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setFolderDialog(false)}>Cancel</button><button className="button primary">Create folder</button></div></form></div>}
    {selected && <Preview file={selected} onClose={() => setSelected(null)} onDownload={() => window.open(`/api/v1/files/${selected.id}/download`, '_blank')} />}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}

function Preview({ file, onClose, onDownload }: { file: FileItem; onClose: () => void; onDownload: () => void }) {
  const src = `/api/v1/files/${file.id}/stream`;
  return <div className="modal-backdrop preview-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="preview-dialog"><header className="preview-header"><div className="preview-title"><span className={`preview-file-icon ${file.category}`}>{file.category === 'image' ? <FileImage size={18}/> : file.category === 'video' ? <FileVideo size={18}/> : file.category === 'audio' ? <FileAudio size={18}/> : <FileText size={18}/>}</span><span><b>{file.name}</b><small>{formatBytes(file.size)} · {file.mimeType}</small></span></div><div className="preview-controls"><button className="button secondary" onClick={onDownload}>Download</button><button className="icon-button" onClick={onClose} aria-label="Close preview"><X size={19}/></button></div></header><div className="preview-stage">{file.category === 'image' ? <img src={src} alt={file.name}/> : file.category === 'video' ? <video src={src} controls autoPlay/> : file.category === 'audio' ? <div className="audio-preview"><span className="audio-cover"><FileAudio size={38}/></span><h2>{file.name}</h2><p>{formatBytes(file.size)}</p><audio src={src} controls autoPlay/></div> : file.mimeType === 'application/pdf' ? <iframe src={src} title={file.name}/> : file.mimeType.startsWith('text/') ? <iframe src={src} title={file.name}/> : <div className="unsupported-preview"><span className="file-art document"><FileText size={26}/></span><h3>Preview isn’t available for this file</h3><p>You can still download it and open it on your device.</p><button className="button primary" onClick={onDownload}>Download file</button></div>}</div></section></div>;
}
