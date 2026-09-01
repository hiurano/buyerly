#!/usr/bin/env python3
"""
build_video_transcripts.py
Generates comprehensive Markdown files for all 9 AI influencer & UGC video tutorials.
"""

import json
import os

RAW_DATA_PATH = "/tmp/videos_raw.json"
OUTPUT_DIR = "docs/transcriptions"

os.makedirs(OUTPUT_DIR, exist_ok=True)

with open(RAW_DATA_PATH, "r", encoding="utf-8") as f:
    videos = json.load(f)

def format_time(seconds):
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins:02d}:{secs:02d}"

EXTRA_METADATA = {
    "U8l5w_sCkhg": {
        "ru_title": "ComfyUI + Claude = Бесконечные AI UGC видео (Бесплатный пайплайн)",
        "category": "Video Generation / UGC Automation",
        "summary": "Автоматизированный пайплайн в ComfyUI на базе мультимодального анализа Claude (VLM). Система покадрово разбирает референсное вирусное UGC-видео, формирует точные покадровые промпты и генерирует новое видео с AI-инфлюенсером с сохранением оригинальной динамики, таймингов и движений.",
        "key_points": [
            "Автоматический реверс-инжиниринг вирусных видео с помощью Claude VLM нод в ComfyUI.",
            "Генерация покадровых промптов (motion, lighting, camera angle, subject actions).",
            "Использование генеративных видеомоделей (Hunyuan Video / Wan2.1 / LTX) для создания видеоряда.",
            "Сохранение консистентности лица персонажа и мимики без ручной покадровой отрисовки.",
            "Пайплайн полностью бесплатен/локален при использовании открытых нод ComfyUI."
        ],
        "workflow_steps": [
            "1. Загрузка референсного вирусного UGC-видео в ComfyUI Video Loader.",
            "2. Покадровый анализ сцены через Claude Vision API / VLM ноду (Hook, Action, Environment).",
            "3. Генерация структурированных промптов для каждого сегмента видео с подстановкой триггера инфлюенсера.",
            "4. Рендеринг видео в видеогенераторе (Hunyuan / Wan / LTX) с заданным сидом и motion bucket.",
            "5. FaceSwap / ReActor / PulID проход для фиксации идентичности персонажа на видео.",
            "6. Финальная сборка и цветокоррекция."
        ],
        "tech_stack": ["ComfyUI", "Claude API (VLM)", "Hunyuan Video / Wan 2.1", "ReActor / FaceID", "FFmpeg"]
    },
    "sYoYrw_NMGY": {
        "ru_title": "Тест модели LTX 2.5 для AI-инфлюенсеров: Быстро, но достаточно ли качественно?",
        "category": "Video Generation / Model Benchmark",
        "summary": "Детальный стресс-тест и бенчмарк открытой видеомодели LTX 2.5 (от Lightricks) на Hugging Face для создания контента с AI-инфлюенсерами. Оценка скорости генерации на потребительских GPU, реализма кожи, сохранения черт лица, артефактов движения и сравнение с конкурентами.",
        "key_points": [
            "LTX 2.5 обладает сверхвысокой скоростью генерации и оптимизирована для быстрого инференса.",
            "Специфика промптинга для LTX 2.5: важно указывать векторы движения камеры (camera panning, zoom, orbit) и динамику освещения.",
            "Оценка качества: отличная работа с крупными планами и освещением, но возможны деформации конечностей при быстрых движениях.",
            "Идеальные юзкейсы: короткие 3-5 секундные UGC-реплики, разговорные рилсы, портретные видео для сторис.",
            "Бесплатный шаблон промптов и настроек параметров генерации."
        ],
        "workflow_steps": [
            "1. Выбор базового портрета или стартового кадра инфлюенсера.",
            "2. Формирование промпта по специализированному LTX-шаблону (Camera Movement + Action + Environment + Lighting).",
            "3. Настройка параметров LTX 2.5 (Steps, Guidance scale, Frame count, FPS).",
            "4. Инференс через ComfyUI ноды или Hugging Face Space.",
            "5. Постобработка: апскейл (Topaz Video AI / RealESRGAN) и интерполяция кадров (RIFE)."
        ],
        "tech_stack": ["LTX 2.5 Video", "Hugging Face", "ComfyUI", "RIFE Interpolation", "Topaz Video AI"]
    },
    "x9ETAqkAysg": {
        "ru_title": "Character Board для 100% консистентности AI-инфлюенсера",
        "category": "Character Consistency & Prompting",
        "summary": "Использование классического инструмента анимационных студий — Character Sheet / Model Turnaround Board — для решения проблемы «угадывания» внешности AI-модели нейросетью. Создание единого мультиракурсного листа персонажа для полной фиксации лица и тела во всех будущих генерациях.",
        "key_points": [
            "Почему нейросети «ломают» лицо: модель не знает, как выглядит персонаж сбоку, сзади или при улыбке без опорного листа.",
            "Создание Character Turnaround Sheet с 6-8 ракурсами (Front, 3/4 Left, Profile, 3/4 Right, Expressions, Full Body).",
            "Единый сид и фиксированная геометрия лица на одном холсте.",
            "Использование Character Board как глобального референса в IP-Adapter, ControlNet и LoRA.",
            "Устранение 99% галлюцинаций внешности при любых позах и ракурсах камеры."
        ],
        "workflow_steps": [
            "1. Генерация сетки ракурсов (Turnaround Grid) в Flux / SDXL с жестким промптом описания черт лица.",
            "2. Инпейнтинг и выравнивание пропорций, чтобы все ракурсы идеально совпадали.",
            "3. Формирование итогового PNG-листа Character Board высокого разрешения.",
            "4. Подключение листа в ComfyUI через IP-Adapter Plus Face / Attention Injection.",
            "5. Генерация любых новых сцен с указанием ракурса относительно character sheet."
        ],
        "tech_stack": ["Flux.1 / SDXL", "ComfyUI", "IP-Adapter Plus", "Inpainting / ControlNet", "Character Sheet Grid"]
    },
    "rbBNEVyQyyk": {
        "ru_title": "Единственное видео по датасетам для AI-инфлюенсеров: От 5 фото до полного обучающего набора",
        "category": "Dataset Engineering & LoRA Training",
        "summary": "Полное руководство по созданию профессионального обучающего датасета для тренировки LoRA. Превращение 4-5 исходных фотографий в структурированный набор из 30-50+ изображений с идеальным балансом ракурсов, эмоций, одежды, освещения и правильным автокэпшенингом.",
        "key_points": [
            "Формула идеального датасета: 30% крупные планы (портреты), 40% поясные планы (medium shot), 30% полный рост (full body).",
            "Вариативность: разные типы освещения (golden hour, studio, indoor flash, cloudy day) и фонов для предотвращения переобучения (overfitting).",
            "Очистка и кадрирование: разрешения (1024x1024, 768x1024, 1024x1536) и удаление артефактов кожи/глаз.",
            "Стратегия кэпшенинга (Captions): использование JoyCaption / Florence-2 / Claude для разделения триггер-слова и описания окружения.",
            "Подготовка структуры папок для Kohya_ss / AI-Toolkit / RunPod."
        ],
        "workflow_steps": [
            "1. Отбор 3-5 эталонных изображений персонажа.",
            "2. Синтетическое размножение датасета через Face-Swap + Inpainting (генерация новых локаций и поз).",
            "3. Фильтрация и отбраковка неудачных генераций (руки, глаза, асимметрия).",
            "4. Кроппинг и нормализация размеров под мульти-аспектные бакеты (Aspect Ratio Bucketing).",
            "5. Автоматическая генерация текстовых описаний (.txt) через VLM с удалением описания неизменных черт лица.",
            "6. Экспорт готового датасета для LoRA обучения."
        ],
        "tech_stack": ["JoyCaption / Florence-2", "AI-Toolkit", "Kohya_ss", "ComfyUI", "Flux / SDXL LoRA"]
    },
    "7Hfn8g-httk": {
        "ru_title": "Krea 2 делает AI-инфлюенсеров слишком реалистичными (LoRA + Пайплайн)",
        "category": "Photorealism & LoRA Workflow",
        "summary": "Пайплайн достижения бескомпромиссного фотореализма с помощью Krea 2 и обучения кастомных LoRA. Методы генерации текстуры кожи (поры, мелкие неровности, естественный микрорельеф), симуляция несовершенств мобильной камеры и борьба с «пластиковым» эффектом нейросетей.",
        "key_points": [
            "Krea 2 и открытые архитектуры для гиперреалистичной генерации людей.",
            "Настройка параметров LoRA: правильный выбор Rank/Dim (16/32) и Alpha для сохранения микротекстур.",
            "Промптинг для эффекта мобильного фото: 'iPhone 15 flash selfie', 'slight motion blur', 'grain', 'casual candid shot'.",
            "Техника многоступенчатого апскейла и диффузного денойзинга в Krea / ComfyUI.",
            "100% консистентность персонажа при изменении окружения и ракурса."
        ],
        "workflow_steps": [
            "1. Сборка ультра-четкого датасета без искусственного разглаживания кожи.",
            "2. Обучение LoRA модели на базе Flux / SDXL с акцентом на сохранение естественных деталей.",
            "3. Построение промпта с деконструкцией «UGC-эстетики» (UGC raw candid aesthetic).",
            "4. Генерация базового кадра в Krea 2 / ComfyUI с силой LoRA 0.8 - 0.9.",
            "5. Финальный проход рендеринга деталей и добавление пленочного зерна."
        ],
        "tech_stack": ["Krea 2", "Flux.1 Dev LoRA", "ComfyUI", "AI-Toolkit", "Photo Realism Prompts"]
    },
    "Es-Kpx9mnMo": {
        "ru_title": "Копирование вирусных AI Reels за секунды с помощью Claude Workflow",
        "category": "Reels Automation / Viral Growth",
        "summary": "Автоматизированная система в Claude для мгновенного разбора любого вирусного видео (Instagram Reels, TikTok) и пересоздания его с собственной AI-моделью менее чем за 10 минут с использованием Seedance / Kling / Flux.",
        "key_points": [
            "Использование Claude Projects и специализированных промпт-скиллов для деконструкции вирусных механик.",
            "Разбор видео на 3 компонента: Hook (первые 2 секунды), Body (динамика и сюжет), CTA (призыв к действию).",
            "Генерация точных промптов для генераторов видео Seedance / Kling / Hunyuan.",
            "Пайплайн сборки вирусного ролика: от сценария и озвучки (ElevenLabs) до синхронизации движения губ и саунд-дизайна.",
            "Масштабирование контент-завода: создание до 10-20 уникальных рилсов в день."
        ],
        "workflow_steps": [
            "1. Подача ссылки или скриншотов вирусного рилса в Claude Project.",
            "2. Claude анализирует темп, хук, ракурсы и генерирует покадровый сценарий с промптами.",
            "3. Генерация ключевых кадров инфлюенсера в Flux / ComfyUI.",
            "4. Анимация кадров в Seedance / Kling / LTX Video.",
            "5. Клонирование голоса и генерация аудио в ElevenLabs.",
            "6. Lip-Sync (LivePortrait / Hedra) и добавление субтитров (CapCut / Auto-subs)."
        ],
        "tech_stack": ["Claude 3.5 Sonnet", "Seedance / Kling AI", "ElevenLabs", "Flux.1", "LivePortrait", "CapCut"]
    },
    "nWlLlnjWC6k": {
        "ru_title": "Создание полного датасета AI-персонажа всего из 3 фотографий",
        "category": "Dataset Engineering & Claude Workflows",
        "summary": "Пошаговый метод генерации высококачественного датасета из 30+ согласованных фотографий одной и той же AI-девушки на основе всего 3 исходных изображений с помощью диалога с Claude и мощных генераторов изображений.",
        "key_points": [
            "Декомпозиция лица в Claude: подробное биометрическое описание (разрез глаз, форма бровей, носогубные складки, пропорции губ, овал лица).",
            "Создание постоянного 'Master Prompt' (мастер-промпта), фиксирующего внешность персонажа в любых декорациях.",
            "Генерация матрицы вариаций: смена одежды (casual, gym, evening dress), локаций (coffee shop, beach, city street, bedroom) и эмоций.",
            "Отбор и валидация изображений на консистентность перед обучением модели.",
            "Полный процесс создания персонажа занимает менее 10 минут."
        ],
        "workflow_steps": [
            "1. Загрузка 3 референсных фото персонажа в Claude.",
            "2. Запрос к Claude на составление детального описания внешности (Feature Extraction & Master Prompt).",
            "3. Генерация сетки из 30-50 промптов для различных сцен и ракурсов.",
            "4. Пакетная генерация изображений в Flux / Midjourney / ComfyUI.",
            "5. Face-Swap / Inpainting коррекция для гарантированного совпадения черт лица.",
            "6. Сборка готовой папки датасета."
        ],
        "tech_stack": ["Claude 3.5 Sonnet", "Flux.1", "Midjourney", "ComfyUI", "Face Consistency Workflow"]
    },
    "xgVLleA0yZM": {
        "ru_title": "Создание ультрареалистичного AI-инфлюенсера с нуля (LoRA + Бесплатный пайплайн)",
        "category": "End-to-End Influencer Creation & LoRA",
        "summary": "Полный практический курс по созданию стабильного AI-инфлюенсера с нуля: от генерации уникального синтетического лица до обучения собственной LoRA и запуска генераций в ComfyUI. Решение проблемы «разных лиц на каждой картинке».",
        "key_points": [
            "Почему просто промптов недостаточно: необходимость обучения LoRA для коммерческого качества и стабильности.",
            "Создание синтетического уникального лица (Seed Generation), не существующего в реальном мире.",
            "Генерация обучающего набора и очистка от визуального мусора.",
            "Обучение LoRA: пошаговая конфигурация конфига AI-Toolkit (Learning Rate 1e-4, Rank 16, Batch Size 1, Resolution 1024).",
            "Инференс в ComfyUI: сборка рабочего графа для мгновенной генерации фотосессий."
        ],
        "workflow_steps": [
            "1. Разработка концепта персонажа и генерация 5-10 базовых мастер-кадров.",
            "2. Расширение датасета до 25-35 разноплановых снимков.",
            "3. Написание текстовых кэпшенов с уникальным триггером (например, `ohwx woman`).",
            "4. Запуск обучения LoRA в AI-Toolkit (локально или на RunPod / Google Colab).",
            "5. Тестирование чекпоинтов LoRA (эпохи 500, 1000, 1500, 2000) на оверфиттинг.",
            "6. Запуск продакшн-генераций в ComfyUI с LoRA Loader."
        ],
        "tech_stack": ["Flux.1 Dev", "AI-Toolkit", "ComfyUI", "RunPod", "LoRA Fine-tuning"]
    },
    "_mN1AAzcBT4": {
        "ru_title": "Как создать AI-инфлюенсера с нуля без обучения LoRA",
        "category": "Zero-Training / Instant FaceID Workflow",
        "summary": "Быстрый метод создания уникального синтетического лица AI-инфлюенсера без необходимости обучать LoRA и арендовать GPU-сервера. Использование референсов из Pinterest, смешивания лиц (Face Blending) и технологий InstantID / IP-Adapter Face в ComfyUI.",
        "key_points": [
            "Создание синтетического лица путем комбинирования нескольких референсов из Pinterest (Face Merging/Morphing).",
            "Работа в ComfyUI с нодами InstantID, IP-Adapter FaceID Plus и ReActor.",
            "Как добиться реализма без LoRA: правильная настройка весов векторов лица (Face Embedding Weight) и KSampler Denoise.",
            "Face Detailer и Inpainting для прорисовки глаз, ресниц и текстуры кожи в высоком разрешении.",
            "Быстрый старт: от идеи до первого готового сета фотографий за 15 минут."
        ],
        "workflow_steps": [
            "1. Поиск 3-4 референсных эстетических портретов на Pinterest.",
            "2. Смешивание лиц в ComfyUI для получения уникального синтетического лица (Synthetic Face Embedding).",
            "3. Подача эмбеддинга в InstantID / IP-Adapter Face.",
            "4. Генерация новых фотосессий в любых позах с помощью текстовых промптов.",
            "5. Проход Face Detailer (Impact Pack / Ultralytics YOLO Face) для восстановления максимальной четкости лица.",
            "6. Экспорт готового контента."
        ],
        "tech_stack": ["ComfyUI", "InstantID", "IP-Adapter FaceID", "Face Detailer / YOLO Face", "ReActor"]
    }
}

for idx, v in enumerate(videos, 1):
    vid = v['id']
    title = v['title']
    duration_str = v.get('duration_str') or format_time(v.get('duration_sec', 0))
    channel = v.get('channel', 'Json')
    desc = v.get('description', '').strip()
    snippets = v.get('snippets', [])
    filename = v['filename']
    filepath = os.path.join(OUTPUT_DIR, filename)
    
    extra = EXTRA_METADATA.get(vid, {})
    ru_title = extra.get('ru_title', title)
    category = extra.get('category', 'AI Workflows')
    summary = extra.get('summary', '')
    key_points = extra.get('key_points', [])
    workflow_steps = extra.get('workflow_steps', [])
    tech_stack = extra.get('tech_stack', [])
    
    # 1. Build grouped timestamped blocks
    timestamped_blocks = []
    current_block_time = None
    current_block_texts = []
    
    for s in snippets:
        t_start = s['start']
        t_formatted = format_time(t_start)
        
        if current_block_time is None:
            current_block_time = t_formatted
            
        current_block_texts.append(s['text'].strip())
        
        # Group every 4-6 snippets or when a sentence naturally concludes
        if len(current_block_texts) >= 5 or (len(current_block_texts) >= 3 and any(s['text'].strip().endswith(p) for p in ['.', '!', '?'])):
            block_text = ' '.join(current_block_texts)
            timestamped_blocks.append(f"**[{current_block_time}]** {block_text}")
            current_block_time = None
            current_block_texts = []
            
    if current_block_texts:
        block_text = ' '.join(current_block_texts)
        timestamped_blocks.append(f"**[{current_block_time}]** {block_text}")
        
    # 2. Build full verbatim text
    full_verbatim_text = ' '.join([s['text'].strip() for s in snippets])
    
    # Format Key Takeaways & Workflow
    key_points_md = "\n".join([f"- {kp}" for kp in key_points])
    workflow_steps_md = "\n".join([f"{ws}" for ws in workflow_steps])
    tech_stack_md = " • ".join([f"`{t}`" for t in tech_stack])
    
    md_content = f"""# {idx:02d}. {title}

> **Русское название**: {ru_title}  
> **Категория**: `{category}`  
> **Стек инструментов**: {tech_stack_md}

---

## 📌 Метаданные видео

| Параметр | Значение |
|---|---|
| **Название на YouTube** | {title} |
| **Ссылка на видео** | [youtube.com/watch?v={vid}](https://www.youtube.com/watch?v={vid}) |
| **Video ID** | `{vid}` |
| **Автор / Канал** | **{channel}** |
| **Длительность** | **{duration_str}** ({v.get("duration_sec", 0)} секунд) |
| **Дата публикации** | {v.get("upload_date", "N/A")} |
| **Объем транскрипции** | {len(full_verbatim_text.split())} слов / {len(full_verbatim_text)} символов |

---

## 💡 Аналитический обзор и ключевые инсайты (Executive Summary)

{summary}

### 🔑 Главные тезисы и выводы:
{key_points_md}

### 🛠 Архитектура пайплайна (Step-by-Step Workflow):
```text
{workflow_steps_md}
```

---

## 📝 Оригинальное описание с YouTube

<details>
<summary><b>Развернуть описание ролика от автора</b></summary>

```text
{desc}
```

</details>

---

## ⏱ Полная стенограмма с таймкодами (Full Timestamped Transcript)

{chr(10).join(timestamped_blocks)}

---

## 📄 Непрерывный текст транскрипции (Verbatim Full Text)

{full_verbatim_text}
"""

    with open(filepath, "w", encoding="utf-8") as out_f:
        out_f.write(md_content)
    print(f"Generated: {filepath} ({len(md_content)} bytes)")

# Generate comprehensive README.md index
readme_content = """# 🎬 AI Influencer & UGC Video Workflows — База знаний и полные транскрибации

Комплексная библиотека подробных транскрибаций и архитектурных разборов серии обучающих видео от канала **Json** по созданию AI-инфлюенсеров, генерации вирусных UGC-видео, обучению LoRA моделей, формированию датасетов и автоматизации пайплайнов в ComfyUI, Claude, Krea и LTX.

---

## 📑 Навигация по видео и материалам

| # | Название видео | Категория | Длительность | Документ с транскрибацией | YouTube |
|---|---|---|---|---|---|
| **01** | **ComfyUI + Claude = Unlimited AI UGC Videos** | `UGC Video Automation` | `07:49` | [`01_comfyui_claude_unlimited_ai_ugc_videos.md`](01_comfyui_claude_unlimited_ai_ugc_videos.md) | [Смотреть](https://www.youtube.com/watch?v=U8l5w_sCkhg) |
| **02** | **LTX 2.5 AI Influencer Test: Fast, but Good Enough?** | `Model Benchmark / LTX` | `05:14` | [`02_ltx_2_5_ai_influencer_test.md`](02_ltx_2_5_ai_influencer_test.md) | [Смотреть](https://www.youtube.com/watch?v=sYoYrw_NMGY) |
| **03** | **This Character Board Makes Your AI Influencer 100% Consistent** | `Consistency / Character Board` | `04:42` | [`03_character_board_100_percent_consistent.md`](03_character_board_100_percent_consistent.md) | [Смотреть](https://www.youtube.com/watch?v=x9ETAqkAysg) |
| **04** | **The ONLY Dataset Video You Will Ever Need for AI Influencers** | `Dataset Engineering` | `08:53` | [`04_only_dataset_video_you_will_ever_need.md`](04_only_dataset_video_you_will_ever_need.md) | [Смотреть](https://www.youtube.com/watch?v=rbBNEVyQyyk) |
| **05** | **Krea 2 Makes AI Influencers TOO Realistic** | `LoRA / Photorealism` | `07:33` | [`05_krea_2_makes_ai_influencers_too_realistic.md`](05_krea_2_makes_ai_influencers_too_realistic.md) | [Смотреть](https://www.youtube.com/watch?v=7Hfn8g-httk) |
| **06** | **Copy Viral AI Reels in Seconds with This Claude Workflow** | `Reels Cloning / Claude` | `06:59` | [`06_copy_viral_ai_reels_in_seconds_claude.md`](06_copy_viral_ai_reels_in_seconds_claude.md) | [Смотреть](https://www.youtube.com/watch?v=Es-Kpx9mnMo) |
| **07** | **Build a Complete AI Character Dataset From Just 3 Photos** | `Dataset from 3 Photos` | `07:57` | [`07_build_complete_ai_character_dataset_3_photos.md`](07_build_complete_ai_character_dataset_3_photos.md) | [Смотреть](https://www.youtube.com/watch?v=nWlLlnjWC6k) |
| **08** | **Create an Ultra Realistic AI Influencer From Scratch** | `End-to-End LoRA Training` | `06:04` | [`08_create_ultra_realistic_ai_influencer_lora.md`](08_create_ultra_realistic_ai_influencer_lora.md) | [Смотреть](https://www.youtube.com/watch?v=xgVLleA0yZM) |
| **09** | **How to Create an AI Influencer from scratch Without Training a LoRA** | `InstantID / Non-LoRA` | `08:18` | [`09_ai_influencer_from_scratch_without_lora.md`](09_ai_influencer_from_scratch_without_lora.md) | [Смотреть](https://www.youtube.com/watch?v=_mN1AAzcBT4) |

---

## 🗺 Карта взаимосвязи технологий и процессов

```mermaid
graph TD
    subgraph "1. Создание персонажа и лица"
        N1[07: Генерация датасета из 3 фото] --> M1[Синтетическое лицо]
        N2[09: Смешивание лиц из Pinterest] --> M1
        N3[03: Character Turnaround Board] --> M1
    end

    subgraph "2. Обучение и фиксация внешности"
        M1 --> T1[04: Идеальный обучающий датасет]
        T1 --> L1[08: Обучение Flux LoRA с нуля]
        T1 --> L2[05: Фотореализм в Krea 2 + LoRA]
        M1 --> L3[09: InstantID & IP-Adapter без LoRA]
    end

    subgraph "3. Производство видео и вирусного контента"
        L1 & L2 & L3 --> V1[01: ComfyUI + Claude UGC Автопилот]
        L1 & L2 & L3 --> V2[06: Клонирование вирусных Reels через Claude]
        V1 & V2 --> R1[02: Рендеринг в LTX 2.5 / Kling / Wan2.1]
    end
```

---

## 🔍 Краткое содержание модулей

1. **[01. ComfyUI + Claude UGC Pipeline](01_comfyui_claude_unlimited_ai_ugc_videos.md)**: Автоматизированный разбор видео с помощью Claude VLM, создание промптов и генерация видеоряда с заменой персонажа в ComfyUI.
2. **[02. LTX 2.5 AI Influencer Benchmark](02_ltx_2_5_ai_influencer_test.md)**: Анализ новой модели LTX 2.5 для быстрой генерации видеоконтента с инфлюенсерами на локальных GPU.
3. **[03. Character Turnaround Board](03_character_board_100_percent_consistent.md)**: Использование анимационных модел-шитов (ракурсы, эмоции) для 100% консистентности лица и тела.
4. **[04. The Complete Dataset Blueprint](04_only_dataset_video_you_will_ever_need.md)**: Полная методология создания обучающего датасета (пропорции планов, вариативность света, JoyCaption/Florence кэпшенинг).
5. **[05. Krea 2 & Hyperrealistic LoRA](05_krea_2_makes_ai_influencers_too_realistic.md)**: Достижение реалистичной текстуры кожи, естественного шума мобильной камеры и борьба с «пластиковым» эффектом.
6. **[06. Reverse-Engineering Viral Reels](06_copy_viral_ai_reels_in_seconds_claude.md)**: Клонирование структуры, хуков и визуала трендовых рилсов за минуты с помощью кастомных Claude-скиллов.
7. **[07. 3-Photo Character Dataset](07_build_complete_ai_character_dataset_3_photos.md)**: Генерация полноценного фотосета персонажа из 3 базовых селфи через биометрический деконструкт в Claude.
8. **[08. Ultra-Realistic LoRA from Scratch](08_create_ultra_realistic_ai_influencer_lora.md)**: Пошаговый пайплайн обучения Flux/SDXL LoRA в AI-Toolkit и инференс в ComfyUI.
9. **[09. Zero-Training Influencer Workflow](09_ai_influencer_from_scratch_without_lora.md)**: Быстрый запуск инфлюенсера без обучения LoRA с использованием Pinterest референсов, InstantID и Face Detailer.
"""

with open(os.path.join(OUTPUT_DIR, "README.md"), "w", encoding="utf-8") as f:
    f.write(readme_content)

print(f"Generated: {os.path.join(OUTPUT_DIR, 'README.md')}")
