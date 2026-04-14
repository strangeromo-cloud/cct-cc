import { NavLink } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Header() {
  const { language, t, toggleLanguage } = useLanguage();

  const navItems = [
    { to: '/', label: t.navQuarterOverview },
    { to: '/operating', label: t.navOperatingNumbers },
    { to: '/bg-breakdown', label: t.navBGBreakdown },
    { to: '/global', label: t.navGlobalView },
  ];

  return (
    <header className="bg-lenovo-dark text-white h-14 flex items-center px-6 shrink-0">
      <div className="flex items-center gap-3 mr-8">
        <div className="w-1 h-6 bg-lenovo-red rounded-full" />
        <h1 className="text-base font-semibold tracking-tight">{t.appTitle}</h1>
      </div>

      <nav className="flex items-center gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `px-3 py-1.5 text-sm rounded-md transition-colors ${
                isActive
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLanguage}
          className="text-white/70 hover:text-white hover:bg-white/10 gap-1.5"
        >
          <Globe className="h-4 w-4" />
          {language === 'en' ? '中文' : 'EN'}
        </Button>
      </div>
    </header>
  );
}
