import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { FilterBar } from './FilterBar';

export function AppLayout() {
  const location = useLocation();
  // Global View page uses external data (no BG/Geo/quarter filtering) → hide FilterBar
  const hideFilterBar = location.pathname === '/global';

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />
      {!hideFilterBar && <FilterBar />}
      <main className="flex-1 overflow-auto p-6 bg-lenovo-light-gray">
        <Outlet />
      </main>
    </div>
  );
}
