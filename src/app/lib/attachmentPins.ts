export interface PinnedAttachmentMeta {
  attachmentId: string;
  taskId?: string;
  taskTitle?: string;
  fileName: string;
  fileUrl?: string;
  fileSize?: number;
  sizeLabel?: string;
  caption: string;
  pinnedBy?: string;
  pinnedAt: string;
}

const STORAGE_PREFIX = "stas_pinned_attachments_";
const PINNED_EVENT_NAME = "stas:pinned-attachments-updated";

export function getPinnedStorageKey(projectId?: string | null): string {
  const safeId = String(projectId || "default").trim();
  return `${STORAGE_PREFIX}${safeId}`;
}

export function getPinnedAttachments(projectId?: string | null): Record<string, PinnedAttachmentMeta> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(getPinnedStorageKey(projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function savePinnedAttachment(
  projectId: string | null | undefined,
  meta: PinnedAttachmentMeta
): Record<string, PinnedAttachmentMeta> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  const current = getPinnedAttachments(projectId);
  const updated: Record<string, PinnedAttachmentMeta> = {
    ...current,
    [meta.attachmentId]: {
      ...meta,
      pinnedAt: meta.pinnedAt || new Date().toISOString()
    }
  };

  try {
    window.localStorage.setItem(getPinnedStorageKey(projectId), JSON.stringify(updated));
    window.dispatchEvent(
      new CustomEvent(PINNED_EVENT_NAME, {
        detail: { projectId: String(projectId || "default"), updated }
      })
    );
  } catch {
    // Graceful fallback
  }

  return updated;
}

export function removePinnedAttachment(
  projectId: string | null | undefined,
  attachmentId: string
): Record<string, PinnedAttachmentMeta> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  const current = getPinnedAttachments(projectId);
  const updated = { ...current };
  delete updated[attachmentId];

  try {
    window.localStorage.setItem(getPinnedStorageKey(projectId), JSON.stringify(updated));
    window.dispatchEvent(
      new CustomEvent(PINNED_EVENT_NAME, {
        detail: { projectId: String(projectId || "default"), updated }
      })
    );
  } catch {
    // Graceful fallback
  }

  return updated;
}

export function subscribePinnedAttachments(
  projectId: string | null | undefined,
  callback: (pinned: Record<string, PinnedAttachmentMeta>) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleUpdate = (e: Event) => {
    const customEvent = e as CustomEvent<{ projectId?: string }>;
    const targetProject = String(projectId || "default");
    if (!customEvent.detail?.projectId || customEvent.detail.projectId === targetProject) {
      callback(getPinnedAttachments(projectId));
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === getPinnedStorageKey(projectId)) {
      callback(getPinnedAttachments(projectId));
    }
  };

  window.addEventListener(PINNED_EVENT_NAME, handleUpdate);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(PINNED_EVENT_NAME, handleUpdate);
    window.removeEventListener("storage", handleStorage);
  };
}
