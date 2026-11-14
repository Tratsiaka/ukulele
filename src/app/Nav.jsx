import { Gauge, GraduationCap, Grid3x3, Music, Settings, Sun } from 'lucide-preact';
import { Link, navigate, route } from './router.js';
import { Logo } from './Logo.jsx';

/** Пять вкладок: на телефоне — снизу, на десктопе — боковая рейка. */
export const TABS = Object.freeze([
  { id: 'today', path: '/today', label: 'Сегодня', icon: Sun },
  { id: 'learn', path: '/learn', label: 'Учёба', icon: GraduationCap },
  { id: 'songs', path: '/songs', label: 'Песни', icon: Music },
  { id: 'chords', path: '/chords', label: 'Аккорды', icon: Grid3x3 },
  { id: 'tools', path: '/tools', label: 'Тюнер', icon: Gauge },
]);

function smoothTop() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
}

/**
 * Навигация по вкладкам. Повторное нажатие на активную вкладку — наверх или к корню вкладки.
 * @param {{active: string|null}} props
 */
export function Nav({ active }) {
  const onTab = (tab) => (e) => {
    if (tab.id !== active) return; // обычный переход делает Link
    e.preventDefault();
    if (route.value.path === tab.path) smoothTop();
    else navigate(tab.path);
  };
  return (
    <nav class="nav" aria-label="Разделы">
      <Link class="nav-brand" href="/today" aria-label="Уке — на главную">
        <Logo />
      </Link>
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const on = tab.id === active;
        return (
          <Link key={tab.id} class="nav-item" href={tab.path} aria-current={on ? 'page' : undefined} onClick={onTab(tab)}>
            <span class="nav-pill">
              <Icon size={22} strokeWidth={on ? 2.4 : 2} aria-hidden="true" />
            </span>
            <span class="nav-label">{tab.label}</span>
          </Link>
        );
      })}
      <div class="nav-extra">
        <Link class="nav-item" href="/settings">
          <span class="nav-pill">
            <Settings size={22} aria-hidden="true" />
          </span>
          <span class="nav-label">Настройки</span>
        </Link>
      </div>
    </nav>
  );
}
