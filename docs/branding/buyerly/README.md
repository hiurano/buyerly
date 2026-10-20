# Buyerly Brand Assets — Official Vector Set

Официальный набор векторных и растровых ассетов логотипа платформы **Buyerly**.

---

### 📁 Доступные файлы

| Файл | Формат / Размер | Назначение |
| :--- | :--- | :--- |
| **[`logo.svg`](logo.svg)** | Вектор SVG (512×512) | Основной монохромный логотип (`#222326`, цвет знака Linear) на прозрачном фоне |
| **[`logo-black.svg`](logo-black.svg)** | Вектор SVG (512×512) | Чёрный монохромный вектор (`#222326`) для светлой темы и документов |
| **[`logo-white.svg`](logo-white.svg)** | Вектор SVG (512×512) | Белый монохромный вектор (`#FFFFFF`) для тёмных фонов |
| **[`favicon.svg`](favicon.svg)** | Вектор SVG | Фавикон, единственный в ссылках страниц: знак без плитки, `#222326` в светлой теме, белый в тёмной (`prefers-color-scheme`) |
| **[`favicon.ico`](favicon.ico)** | ICO 16, 32, 48 | Отвечает на запрос `/favicon.ico` (страницы его не подключают): знак `#222326` на прозрачном фоне |
| **[`favicon-32x32.png`](favicon-32x32.png)** | PNG 32×32 | Тот же знак на прозрачном фоне в PNG |
| **[`apple-touch-icon.png`](apple-touch-icon.png)** | PNG 180×180 | Иконка при сохранении сайта на экран iPhone/Android: белый знак на `#222326` (iOS заливает прозрачный фон чёрным, поэтому плитка) |
| **[`og-image.png`](og-image.png)** | PNG 1200×630 | Превью карточки при отправке ссылки в Telegram/WhatsApp/Twitter |
| **[`logo.png`](logo.png)** | PNG High-Res | Растровый экспорт в высоком разрешении |

Растровые иконки (`favicon.ico`, `favicon-32x32.png`, `favicon.png`, `apple-touch-icon.png`, а также `frontend/public/buyerly-logo.png`) собирает `python3 scripts/build_icons.py` из того же контура, что и `favicon.svg`.
