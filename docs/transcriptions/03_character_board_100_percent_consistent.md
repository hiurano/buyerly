# 03. This Character Board Makes Your AI Influencer 100% Consistent (FREE WORKFLOW)

> **Русское название**: Character Board для 100% консистентности AI-инфлюенсера  
> **Категория**: `Character Consistency & Prompting`  
> **Стек инструментов**: `Flux.1 / SDXL` • `ComfyUI` • `IP-Adapter Plus` • `Inpainting / ControlNet` • `Character Sheet Grid`

---

## 📌 Метаданные видео

| Параметр | Значение |
|---|---|
| **Название на YouTube** | This Character Board Makes Your AI Influencer 100% Consistent (FREE WORKFLOW) |
| **Ссылка на видео** | [youtube.com/watch?v=x9ETAqkAysg](https://www.youtube.com/watch?v=x9ETAqkAysg) |
| **Video ID** | `x9ETAqkAysg` |
| **Автор / Канал** | **Json ** |
| **Длительность** | **4:42** (282 секунд) |
| **Дата публикации** | 20260810 |
| **Объем транскрипции** | 978 слов / 5242 символов |

---

## 💡 Аналитический обзор и ключевые инсайты (Executive Summary)

Использование классического инструмента анимационных студий — Character Sheet / Model Turnaround Board — для решения проблемы «угадывания» внешности AI-модели нейросетью. Создание единого мультиракурсного листа персонажа для полной фиксации лица и тела во всех будущих генерациях.

### 🔑 Главные тезисы и выводы:
- Почему нейросети «ломают» лицо: модель не знает, как выглядит персонаж сбоку, сзади или при улыбке без опорного листа.
- Создание Character Turnaround Sheet с 6-8 ракурсами (Front, 3/4 Left, Profile, 3/4 Right, Expressions, Full Body).
- Единый сид и фиксированная геометрия лица на одном холсте.
- Использование Character Board как глобального референса в IP-Adapter, ControlNet и LoRA.
- Устранение 99% галлюцинаций внешности при любых позах и ракурсах камеры.

### 🛠 Архитектура пайплайна (Step-by-Step Workflow):
```text
1. Генерация сетки ракурсов (Turnaround Grid) в Flux / SDXL с жестким промптом описания черт лица.
2. Инпейнтинг и выравнивание пропорций, чтобы все ракурсы идеально совпадали.
3. Формирование итогового PNG-листа Character Board высокого разрешения.
4. Подключение листа в ComfyUI через IP-Adapter Plus Face / Attention Injection.
5. Генерация любых новых сцен с указанием ракурса относительно character sheet.
```

---

## 📝 Оригинальное описание с YouTube

<details>
<summary><b>Развернуть описание ролика от автора</b></summary>

```text
Master AI influencer consistency by using character sheets. Learn how to keep your AI creations looking the same across every video scene. Maintaining a consistent look for your AI influencer is often the biggest hurdle in content creation. This video demonstrates a proven workflow similar to professional animation studios, where you utilize character sheets to anchor your model's appearance. By organizing a structured folder of reference images, you can guide AI tools to produce reliable results that hold up across various poses and environments.

----------------------------------------------

Join Skool (the complete dataset system + premium workflows):
https://www.skool.com/matrix-lab-6660/about

FREE skills, workflows + all my prompts:
Discord: https://discord.gg/uhfVpmwktQ

Generate your sheets (WaveSpeed):
https://wavespeed.ai/?ref=matrix

----------------------------------------------

What you'll learn:
- How a character board keeps your AI influencer consistent in every scene you prompt
- Why animation studios solved character consistency decades ago with one single document
- How to build all four character sheets with one single prompt in Claude
- How to sort your reference images into the four anchor folders
- When to re-roll a sheet and how one sentence fixes exactly one defect
- How the same system builds product turnarounds for AI UGC content

----------------------------------------------

Subscribe for weekly AI video creation breakdowns, and comment below if you want to see a tutorial on a specific AI generation tool next.

----------------------------------------------

Chapters / Timestamps
00:00 Why your AI influencer looks different in every generation
00:32 The character board: 29 views from 4 generations
01:37 Setup: the free Claude skill + your WaveSpeed key
02:08 Your images: four anchor folders
03:07 One prompt, four sheets
03:51 Where the full dataset system lives
04:14 Get the free skill + build your board

#aiinfluencer #charactersheet #aimodel #claude #aiconsistency
```

</details>

---

## ⏱ Полная стенограмма с таймкодами (Full Timestamped Transcript)

**[00:00]** Every AI influencer video you generate is a guessing game, because the model has to guess how your influencer looks from the side, from behind or when she smiles. And animation studios fixed this exact problem decades ago with one single document, the character sheet, and almost nobody in their AI space is using it.
**[00:17]** And the creators who figured it out, they just attach one board, and the model keeps their character consistent in every scene they prompt. And in this video I show you the exact system we use to build ours.
**[00:28]** And you get the full cloth skill with every single prompt complete for free at the end of this video. Okay, let's get straight into it.
**[00:34]** This is Lina, our AI influencer, and this right here is the character board I built just for this video. Four sheets, one for her face, one for her expressions, and two for her body.
**[00:44]** And all together that has 29 views of the same influencer out of just 4 generations. And every time we prompt it into a new scene or a new video, this board goes in as reference. So the model never has to guess again, because it has already seen here from every side.
**[00:59]** And it does not matter if you run AI influencer or an AI UGC creator, the board works exactly the same. And the system behind it is one skill, and it runs with every AI agent, Claude, Codex or whatever you use.
**[01:11]** You copy a few pictures of your character into a folder, you write one single prompt and you get the whole board back all four sheets. The only thing you need is a handful of clean reference pictures like these studio shots of your AI influencer.
**[01:24]** And if you don't have those yet, how we built that dataset is our last video. And everything you see today, the skill, the templates, the prompts, all of this is complete free.
**[01:34]** So the only thing I ask from you is a like and a nice comment. So let me show you the whole setup because it's honestly just three clicks. You open the Claude Desktop app, you go on code and you open the folder of the skill.
**[01:45]** The same folder you get for free at the end of this video. And the only thing this skill needs from you is a WaveSpeed API key. Because WaveSpeed is where the sheets get generated and you pay per image there, just a few cents.
**[01:57]** So you create your key on their site, you open the .env file inside the skill folder and you paste your key in there one time. And that is the whole technical setup.
**[02:06]** You never touch it again. And now comes the only real work you have. And that is putting your images into the right folders.
**[02:13]** Inside the skill, there is an anchors folder with one folder for the face, one for the expressions and two for the body exactly like the sheets on the board. And if you build the dataset like we do, it already has the same structure.
**[02:26]** So you just copy face to face, expressions to expressions and body to body. And every folder has a small note inside that tells you exactly what belongs there. And by the way, this whole dataset structure with every prompt behind it that comes straight out of our Skool community, but more on that in a minute.
**[02:43]** But back to your images, just make sure your face folder has a clean front shot and at least one angle and that everything in your body folder wears the same outfit because the sheet keeps the wardrobe identical across every view.
**[02:56]** And honestly, that is it. The skill looks at every single image anyway before it generates and kicks out everything it cannot use and tells you why.
**[03:04]** You can also turn this off, by the way, to save some tokens. And now the whole build is one single prompt. You get my finished prompt together with the skill.
**[03:12]** You paste it in and you hit enter. And this prompt tells Claude to build the complete board in one go, all four sheets. And watch what happens before anything costs money.
**[03:22]** Claude looks at every single image first, then it tells you exactly what the whole board will cost, four generations, one per sheet, and it waits for your go. And from here, it runs on its own.
**[03:33]** It uploads the references, build every sheet prompt from the templates word for word. And a few minutes later, all four sheets land in the sheets folder. And this is the result.
**[03:43]** Her face turnaround, her expressions, her full body and her upper body straight out of four generations. And every single view is the same influencer.
**[03:51]** And real quick, because this part decides everything, our board can only organize an identity. The dataset is what creates her and the complete dataset system, how we created Lina from scratch with every single prompt plus the premium workflows that all lives inside our Skool community.
**[04:07]** And if this free board already helps you imagine what the full system does from our Skool, the link for our Skool community is in the description below. So that is the system one folder, one prompt, four sheets, and your influencer stays consistent in every single generation.
**[04:21]** And as promised, you get to complete skill for free every template, every prompt, everything you saw today. The download is in the description and pinned in our discord.
**[04:30]** And when you build your first board, drop it in there because I actually look at that. And if this video helped you leave a like and subscribe and write me in the comments what I should build next.
**[04:39]** So see you in the next video. Bye. Bye.

---

## 📄 Непрерывный текст транскрипции (Verbatim Full Text)

Every AI influencer video you generate is a guessing game, because the model has to guess how your influencer looks from the side, from behind or when she smiles. And animation studios fixed this exact problem decades ago with one single document, the character sheet, and almost nobody in their AI space is using it. And the creators who figured it out, they just attach one board, and the model keeps their character consistent in every scene they prompt. And in this video I show you the exact system we use to build ours. And you get the full cloth skill with every single prompt complete for free at the end of this video. Okay, let's get straight into it. This is Lina, our AI influencer, and this right here is the character board I built just for this video. Four sheets, one for her face, one for her expressions, and two for her body. And all together that has 29 views of the same influencer out of just 4 generations. And every time we prompt it into a new scene or a new video, this board goes in as reference. So the model never has to guess again, because it has already seen here from every side. And it does not matter if you run AI influencer or an AI UGC creator, the board works exactly the same. And the system behind it is one skill, and it runs with every AI agent, Claude, Codex or whatever you use. You copy a few pictures of your character into a folder, you write one single prompt and you get the whole board back all four sheets. The only thing you need is a handful of clean reference pictures like these studio shots of your AI influencer. And if you don't have those yet, how we built that dataset is our last video. And everything you see today, the skill, the templates, the prompts, all of this is complete free. So the only thing I ask from you is a like and a nice comment. So let me show you the whole setup because it's honestly just three clicks. You open the Claude Desktop app, you go on code and you open the folder of the skill. The same folder you get for free at the end of this video. And the only thing this skill needs from you is a WaveSpeed API key. Because WaveSpeed is where the sheets get generated and you pay per image there, just a few cents. So you create your key on their site, you open the .env file inside the skill folder and you paste your key in there one time. And that is the whole technical setup. You never touch it again. And now comes the only real work you have. And that is putting your images into the right folders. Inside the skill, there is an anchors folder with one folder for the face, one for the expressions and two for the body exactly like the sheets on the board. And if you build the dataset like we do, it already has the same structure. So you just copy face to face, expressions to expressions and body to body. And every folder has a small note inside that tells you exactly what belongs there. And by the way, this whole dataset structure with every prompt behind it that comes straight out of our Skool community, but more on that in a minute. But back to your images, just make sure your face folder has a clean front shot and at least one angle and that everything in your body folder wears the same outfit because the sheet keeps the wardrobe identical across every view. And honestly, that is it. The skill looks at every single image anyway before it generates and kicks out everything it cannot use and tells you why. You can also turn this off, by the way, to save some tokens. And now the whole build is one single prompt. You get my finished prompt together with the skill. You paste it in and you hit enter. And this prompt tells Claude to build the complete board in one go, all four sheets. And watch what happens before anything costs money. Claude looks at every single image first, then it tells you exactly what the whole board will cost, four generations, one per sheet, and it waits for your go. And from here, it runs on its own. It uploads the references, build every sheet prompt from the templates word for word. And a few minutes later, all four sheets land in the sheets folder. And this is the result. Her face turnaround, her expressions, her full body and her upper body straight out of four generations. And every single view is the same influencer. And real quick, because this part decides everything, our board can only organize an identity. The dataset is what creates her and the complete dataset system, how we created Lina from scratch with every single prompt plus the premium workflows that all lives inside our Skool community. And if this free board already helps you imagine what the full system does from our Skool, the link for our Skool community is in the description below. So that is the system one folder, one prompt, four sheets, and your influencer stays consistent in every single generation. And as promised, you get to complete skill for free every template, every prompt, everything you saw today. The download is in the description and pinned in our discord. And when you build your first board, drop it in there because I actually look at that. And if this video helped you leave a like and subscribe and write me in the comments what I should build next. So see you in the next video. Bye. Bye.
