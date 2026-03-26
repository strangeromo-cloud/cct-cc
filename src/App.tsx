import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { FilterProvider } from '@/context/FilterContext';
import { ChatProvider } from '@/context/ChatContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { ChatPanel } from '@/components/ai-chat/ChatPanel';
import { OpeningPage } from '@/pages/opening/OpeningPage';
import { SecondaryPage } from '@/pages/secondary/SecondaryPage';
import { TertiaryPage } from '@/pages/tertiary/TertiaryPage';

function App() {
  return (
    <LanguageProvider>
    <FilterProvider>
      <ChatProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<OpeningPage />} />
              <Route path="operating" element={<SecondaryPage />} />
              <Route path="bg-breakdown" element={<TertiaryPage />} />
            </Route>
          </Routes>
          <ChatPanel />
        </BrowserRouter>
      </ChatProvider>
    </FilterProvider>
    </LanguageProvider>
  );
}

export default App;
