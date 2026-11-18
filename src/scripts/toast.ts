/**
 * DANDY COSMETICS — TOAST NOTIFICATION CONTROLLER (PHASE 1)
 * Safe, accessible, non-intrusive toast system exposing window.DandyToast.
 */
import { createIconElement, type DandyIconName } from './icons';

export type DandyToastType = 'success' | 'error' | 'info';

export interface DandyToastOptions {
  message: string;
  type?: DandyToastType;
  duration?: number;
  actionLabel?: string;
  actionUrl?: string;
  dismissible?: boolean;
}

export interface NormalizedToastOptions {
  message: string;
  type: DandyToastType;
  duration: number;
  actionLabel?: string;
  actionUrl?: string;
  dismissible: boolean;
}

export const MAX_VISIBLE_TOASTS = 3;
export const DEFAULT_TOAST_DURATION = 4200;
export const DEFAULT_ERROR_DURATION = 6000;

export function sanitizeActionUrl(rawUrl?: string): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function normalizeToastOptions(
  input: string | DandyToastOptions
): NormalizedToastOptions | null {
  const opts: DandyToastOptions =
    typeof input === 'string' ? { message: input } : input;

  if (!opts || typeof opts.message !== 'string') return null;
  const message = opts.message.trim();
  if (!message) return null;

  const type: DandyToastType =
    opts.type === 'success' || opts.type === 'error' || opts.type === 'info'
      ? opts.type
      : 'info';

  const fallbackDuration =
    type === 'error' ? DEFAULT_ERROR_DURATION : DEFAULT_TOAST_DURATION;
  const duration =
    typeof opts.duration === 'number' && Number.isFinite(opts.duration) && opts.duration >= 0
      ? opts.duration
      : fallbackDuration;

  const actionUrl = sanitizeActionUrl(opts.actionUrl);
  const actionLabel =
    actionUrl && typeof opts.actionLabel === 'string' && opts.actionLabel.trim()
      ? opts.actionLabel.trim()
      : undefined;

  return {
    message,
    type,
    duration,
    actionLabel,
    actionUrl: actionLabel ? actionUrl : undefined,
    dismissible: opts.dismissible !== false,
  };
}

interface ToastRecord {
  id: string;
  el: HTMLElement;
  timerId: number | null;
  remainingMs: number;
  startedAt: number;
  duration: number;
}

export function createDandyToastController(doc: Document = document) {
  const activeRecords: ToastRecord[] = [];
  let seq = 0;

  function getHost(): HTMLElement | null {
    return doc.getElementById('dandy-toast-host');
  }

  function getLiveRegion(type: DandyToastType): HTMLElement | null {
    const id =
      type === 'error'
        ? 'dandy-toast-live-assertive'
        : 'dandy-toast-live-polite';
    return doc.getElementById(id);
  }

  function announce(message: string, type: DandyToastType): void {
    const region = getLiveRegion(type);
    if (!region) return;
    region.textContent = '';
    window.setTimeout(() => {
      region.textContent = message;
    }, 20);
  }

  function dismiss(id: string, immediate = false): void {
    const idx = activeRecords.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const record = activeRecords[idx];
    activeRecords.splice(idx, 1);

    if (record.timerId !== null) {
      window.clearTimeout(record.timerId);
      record.timerId = null;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (immediate || reducedMotion) {
      record.el.remove();
      return;
    }

    record.el.classList.add('is-leaving');
    window.setTimeout(() => {
      record.el.remove();
    }, 190);
  }

  function clear(): void {
    [...activeRecords].forEach((r) => dismiss(r.id));
  }

  function scheduleDismiss(record: ToastRecord): void {
    if (record.duration <= 0) return;
    if (record.timerId !== null) {
      window.clearTimeout(record.timerId);
    }
    record.startedAt = Date.now();
    record.timerId = window.setTimeout(() => {
      dismiss(record.id);
    }, record.remainingMs);
  }

  function pauseDismiss(record: ToastRecord): void {
    if (record.duration <= 0 || record.timerId === null) return;
    window.clearTimeout(record.timerId);
    record.timerId = null;
    const elapsed = Date.now() - record.startedAt;
    record.remainingMs = Math.max(800, record.remainingMs - elapsed);
  }

  function show(input: string | DandyToastOptions): string | null {
    const normalized = normalizeToastOptions(input);
    const host = getHost();
    if (!normalized || !host) return null;

    while (activeRecords.length >= MAX_VISIBLE_TOASTS) {
      const oldest = activeRecords[0];
      if (oldest) {
        dismiss(oldest.id, true);
      } else {
        break;
      }
    }

    seq += 1;
    const id = `dandy-toast-${seq}`;

    const toastEl = doc.createElement('div');
    toastEl.id = id;
    toastEl.className = `dandy-toast dandy-toast--${normalized.type}`;
    toastEl.setAttribute('role', normalized.type === 'error' ? 'alert' : 'status');
    toastEl.setAttribute('tabindex', '-1');

    const iconWrap = doc.createElement('span');
    iconWrap.className = 'dandy-toast__indicator';
    const iconName: DandyIconName =
      normalized.type === 'success'
        ? 'check-circle'
        : normalized.type === 'error'
          ? 'alert-circle'
          : 'info';
    iconWrap.appendChild(createIconElement(doc, iconName, { size: 16, strokeWidth: 2 }));
    toastEl.appendChild(iconWrap);

    const bodyEl = doc.createElement('div');
    bodyEl.className = 'dandy-toast__body';

    const msgEl = doc.createElement('span');
    msgEl.className = 'dandy-toast__message';
    msgEl.textContent = normalized.message;
    bodyEl.appendChild(msgEl);

    if (normalized.actionLabel && normalized.actionUrl) {
      const actionLink = doc.createElement('a');
      actionLink.className = 'dandy-toast__action';
      actionLink.href = normalized.actionUrl;
      actionLink.textContent = normalized.actionLabel;
      bodyEl.appendChild(actionLink);
    }

    toastEl.appendChild(bodyEl);

    if (normalized.dismissible) {
      const closeBtn = doc.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'dandy-toast__close';
      const isEnglishDoc = (doc.documentElement?.lang || '').toLowerCase().startsWith('en');
      closeBtn.setAttribute('aria-label', isEnglishDoc ? 'Close notification' : 'إغلاق الإشعار');
      closeBtn.appendChild(createIconElement(doc, 'x', { size: 15, strokeWidth: 2 }));
      closeBtn.addEventListener('click', () => dismiss(id));
      toastEl.appendChild(closeBtn);
    }

    const record: ToastRecord = {
      id,
      el: toastEl,
      timerId: null,
      remainingMs: normalized.duration,
      startedAt: Date.now(),
      duration: normalized.duration,
    };

    toastEl.addEventListener('mouseenter', () => pauseDismiss(record));
    toastEl.addEventListener('mouseleave', () => scheduleDismiss(record));
    toastEl.addEventListener('focusin', () => pauseDismiss(record));
    toastEl.addEventListener('focusout', () => scheduleDismiss(record));
    toastEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss(id);
      }
    });

    activeRecords.push(record);
    host.appendChild(toastEl);
    announce(normalized.message, normalized.type);
    scheduleDismiss(record);

    return id;
  }

  return { show, dismiss, clear };
}

declare global {
  interface Window {
    DandyToast?: ReturnType<typeof createDandyToastController>;
  }
}

export function initDandyToast(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!window.DandyToast) {
    window.DandyToast = createDandyToastController(document);
  }
}
