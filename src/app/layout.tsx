import type { Metadata } from "next";
import { Jua, Montserrat_Alternates } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from '@/contexts/ThemeContext'; // Добавьте этот импорт

// Подключаем шрифты
const jua = Jua({
  variable: "--font-jua",
  subsets: ["latin"],
  weight: "400",
});

const montserratAlternates = Montserrat_Alternates({
  variable: "--font-montserrat-alternates",
  subsets: ["latin", "cyrillic"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "QuizBattle",
  description: "Командная realtime-викторина с WebSocket-синхронизацией",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${montserratAlternates.variable} ${jua.variable} antialiased`}>
        <ThemeProvider> {/* Оберните children в ThemeProvider */}
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
