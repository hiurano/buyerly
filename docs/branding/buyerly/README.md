# Buyerly Brand Assets — Official Vector Set

Официальный набор векторных и растровых ассетов логотипа платформы **Buyerly**.

---

### 📁 Доступные файлы

| Файл | Формат / Размер | Назначение |
| :--- | :--- | :--- |
| **[`logo.svg`](logo.svg)** | Вектор SVG (512×512) | Основной монохромный логотип (`#222326`, цвет знака Linear) на прозрачном фоне |
| **[`logo-black.svg`](logo-black.svg)** | Вектор SVG (512×512) | Чёрный монохромный вектор (`#222326`) для светлой темы и документов |
| **[`logo-white.svg`](logo-white.svg)** | Вектор SVG (512×512) | Белый монохромный вектор (`#FFFFFF`) для тёмных фонов |
| **[`favicon.svg`](favicon.svg)** | Вектор SVG | Фавикон: `#222326` в светлой теме, белый в тёмной (`prefers-color-scheme`) |
| **[`favicon.ico`](favicon.ico)** | ICO 16, 32, 48 | Фавикон для `/favicon.ico` и браузеров без SVG: белый знак на плитке `#222326`, как у Linear, читается в светлой и тёмной полосе вкладок |
| **[`favicon-32x32.png`](favicon-32x32.png)** | PNG 32×32 | Та же плитка в PNG для закладок и фоллбеков |
| **[`apple-touch-icon.png`](apple-touch-icon.png)** | PNG 180×180 | Иконка при сохранении сайта на экран iPhone/Android: белый знак на `#222326` |
| **[`og-image.png`](og-image.png)** | PNG 1200×630 | Превью карточки при отправке ссылки в Telegram/WhatsApp/Twitter |
| **[`logo.png`](logo.png)** | PNG High-Res | Растровый экспорт в высоком разрешении |

Растровые иконки (`favicon.ico`, `favicon-32x32.png`, `favicon.png`, `apple-touch-icon.png`, а также `frontend/public/buyerly-logo.png`) собирает `python3 scripts/build_icons.py` из того же контура, что и `favicon.svg`.
