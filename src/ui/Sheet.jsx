import { createPortal } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { X } from 'lucide-preact';
import { IconButton } from './IconButton.jsx';
import { cx } from './icon.js';

const CLOSE_MS = 200;
const DRAG_START_PX = 6;
const DRAG_CLOSE_PX = 80;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

// Открытые шторки (для вложенных: Escape закрывает верхнюю) и блокировка прокрутки страницы
const stack = [];

function lockScroll() {
  if (stack.length === 1) document.documentElement.classList.add('is-locked');
}

function unlockScroll() {
  if (stack.length === 0) document.documentElement.classList.remove('is-locked');
}

function onKeyDown(e) {
  if (e.key === 'Escape' && stack.length) {
    e.stopPropagation();
    stack[stack.length - 1].current?.();
  }
}

/**
 * Нижняя шторка (на десктопе — диалог по центру). Закрывается по фону, крестику, Escape и свайпу вниз.
 * @param {{open: boolean, onClose: () => void, title?: string, children?: any}} props
 */
export function Sheet({ open, onClose, title, children }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const closeRef = useRef(onClose);
  const drag = useRef(/** @type {{y: number, dy: number, id: number, on: boolean}|null} */ (null));
  const titleId = useId();
  closeRef.current = onClose;

  // Монтирование и анимация закрытия
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, CLOSE_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Пока открыта: блок прокрутки, Escape, фокус внутрь и обратно
  useEffect(() => {
    if (!open) return undefined;
    const entry = closeRef;
    stack.push(entry);
    lockScroll();
    if (stack.length === 1) document.addEventListener('keydown', onKeyDown);
    const prev = /** @type {HTMLElement|null} */ (document.activeElement);
    const raf = requestAnimationFrame(() => sheetRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(raf);
      stack.splice(stack.indexOf(entry), 1);
      unlockScroll();
      if (stack.length === 0) document.removeEventListener('keydown', onKeyDown);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!mounted || typeof document === 'undefined') return null;

  const close = () => closeRef.current?.();

  // Tab не уходит из шторки
  const trapFocus = (e) => {
    if (e.key !== 'Tab' || !sheetRef.current) return;
    const items = [...sheetRef.current.querySelectorAll(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Свайп вниз за ручку или шапку
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    drag.current = { y: e.clientY, dy: 0, id: e.pointerId, on: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el || e.pointerId !== d.id) return;
    d.dy = Math.max(0, e.clientY - d.y);
    if (!d.on && d.dy > DRAG_START_PX) {
      d.on = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      el.style.animation = 'none';
      el.style.transition = 'none';
    }
    if (d.on) el.style.transform = `translateY(${d.dy}px)`;
  };
  const onPointerEnd = () => {
    const d = drag.current;
    const el = sheetRef.current;
    drag.current = null;
    if (!d || !d.on || !el) return;
    el.style.transition = '';
    if (d.dy > DRAG_CLOSE_PX) {
      el.style.animation = '';
      close();
    } else {
      el.style.transition = 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      el.style.transform = '';
    }
  };

  return createPortal(
    <div class={cx('sheet-layer', closing && 'is-closing')}>
      <div class="sheet-backdrop" onClick={close} />
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Окно'}
        tabIndex={-1}
        ref={sheetRef}
        onKeyDown={trapFocus}
      >
        <div
          class="sheet-drag"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div class="sheet-grab" aria-hidden="true">
            <div class="sheet-handle" />
          </div>
          <div class="sheet-head">
            <h2 class="sheet-title" id={titleId}>
              {title}
            </h2>
            <IconButton icon={X} label="Закрыть" onClick={close} />
          </div>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
