import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from '@/contexts/ThemeContext'; // Добавьте этот импорт

export const metadata: Metadata = {
  title: "QuizBattle",
  description: "Командная realtime-викторина с WebSocket-синхронизацией",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="antialiased">
        <ThemeProvider> {/* Оберните children в ThemeProvider */}
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
