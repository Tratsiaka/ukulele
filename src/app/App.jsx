import { useEffect, useErrorBoundary } from 'preact/hooks';
import { signal, useSignalEffect } from '@preact/signals';
import { Bug, RotateCw } from 'lucide-preact';
import { ready, settings, progress } from '../state.js';
import { navigate, route } from './router.js';
import { applyTheme } from './theme.js';
import { Nav } from './Nav.jsx';
import { BootError, Splash } from './Splash.jsx';
import { ToastHost } from '../ui/Toast.jsx';
import { Page } from '../ui/Page.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Button } from '../ui/Button.jsx';
import Today from '../screens/Today.jsx';
import Practice from '../screens/Practice.jsx';
import Learn from '../screens/Learn.jsx';
import Lesson from '../screens/Lesson.jsx';
import Songs from '../screens/Songs.jsx';
import SongImport from '../screens/SongImport.jsx';
import SongView from '../screens/SongView.jsx';
import SongTrainer from '../screens/SongTrainer.jsx';
import Chords from '../screens/Chords.jsx';
import Tools from '../screens/Tools.jsx';
import Settings from '../screens/Settings.jsx';
import Onboarding from '../screens/Onboarding.jsx';

/** Имя экрана из routes.js → компонент. */
const SCREENS = {
  Today,
  Practice,
  Learn,
  Lesson,
  Songs,
  SongImport,
  SongView,
  SongTrainer,
  Chords,
  Tools,
  Settings,
  Onboarding,
};

/** Ошибка запуска (initState не смог открыть данные) — main.jsx кладёт её сюда. */
export const bootError = signal(/** @type {unknown} */ (null));

/** Если экран упал, остальное приложение продолжает работать. */
function ScreenBoundary({ children }) {
  const [error, reset] = useErrorBoundary((err) => console.error('[uke] экран упал', err));
  if (!error) return children;
  return (
    <Page title="Что-то сломалось">
      <EmptyState
        icon={Bug}
        title="Экран не открылся"
        text="Это ошибка в приложении, не твоя. Попробуй ещё раз или вернись на «Сегодня»."
        action={
          <div class="row row-wrap center">
            <Button variant="primary" icon={RotateCw} onClick={reset}>
              Ещё раз
            </Button>
            <Button variant="ghost" onClick={() => (reset(), navigate('/today'))}>
              На «Сегодня»
            </Button>
          </div>
        }
      />
    </Page>
  );
}

/** html.is-scrolled, когда страница прокручена (шапке нужна подложка). */
function useScrolledFlag() {
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      document.documentElement.classList.toggle('is-scrolled', window.scrollY > 4);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
}

/**
 * Корень приложения: заставка до загрузки данных, затем вкладки (или полноэкранный экран) и сообщения.
 */
export function App() {
  useScrolledFlag();

  // Тема из настроек — только после загрузки, иначе затрём тему из прошлого запуска
  useSignalEffect(() => {
    if (ready.value) applyTheme(settings.value?.theme ?? 'auto');
  });

  // Первый запуск: сначала знакомство
  useSignalEffect(() => {
    if (!ready.value || progress.value?.onboarded) return;
    if (route.value.path !== '/onboarding') queueMicrotask(() => navigate('/onboarding', { replace: true }));
  });

  if (bootError.value) return <BootError error={bootError.value} />;
  if (!ready.value) return <Splash />;

  const r = route.value;
  const Screen = SCREENS[r.screen] ?? Today;
  // Тот же экран с другим id (песня, урок) — новый экземпляр; смена аккорда или инструмента — нет
  const screenKey = `${r.screen}:${r.params.id ?? ''}`;
  return (
    <div class={r.full ? 'app app--full' : 'app app--tabs'}>
      {!r.full && <Nav active={r.tab} />}
      <main class="app-main" id="main">
        <ScreenBoundary key={screenKey}>
          <Screen params={r.params} query={r.query} />
        </ScreenBoundary>
      </main>
      <ToastHost />
    </div>
  );
}
