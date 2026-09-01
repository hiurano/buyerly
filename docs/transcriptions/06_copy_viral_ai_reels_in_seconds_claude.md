# 06. Copy Viral AI Reels in Seconds with This Claude Workflow

> **Русское название**: Копирование вирусных AI Reels за секунды с помощью Claude Workflow  
> **Категория**: `Reels Automation / Viral Growth`  
> **Стек инструментов**: `Claude 3.5 Sonnet` • `Seedance / Kling AI` • `ElevenLabs` • `Flux.1` • `LivePortrait` • `CapCut`

---

## 📌 Метаданные видео

| Параметр | Значение |
|---|---|
| **Название на YouTube** | Copy Viral AI Reels in Seconds with This Claude Workflow |
| **Ссылка на видео** | [youtube.com/watch?v=Es-Kpx9mnMo](https://www.youtube.com/watch?v=Es-Kpx9mnMo) |
| **Video ID** | `Es-Kpx9mnMo` |
| **Автор / Канал** | **Json ** |
| **Длительность** | **6:59** (419 секунд) |
| **Дата публикации** | 20260703 |
| **Объем транскрипции** | 1263 слов / 6611 символов |

---

## 💡 Аналитический обзор и ключевые инсайты (Executive Summary)

Автоматизированная система в Claude для мгновенного разбора любого вирусного видео (Instagram Reels, TikTok) и пересоздания его с собственной AI-моделью менее чем за 10 минут с использованием Seedance / Kling / Flux.

### 🔑 Главные тезисы и выводы:
- Использование Claude Projects и специализированных промпт-скиллов для деконструкции вирусных механик.
- Разбор видео на 3 компонента: Hook (первые 2 секунды), Body (динамика и сюжет), CTA (призыв к действию).
- Генерация точных промптов для генераторов видео Seedance / Kling / Hunyuan.
- Пайплайн сборки вирусного ролика: от сценария и озвучки (ElevenLabs) до синхронизации движения губ и саунд-дизайна.
- Масштабирование контент-завода: создание до 10-20 уникальных рилсов в день.

### 🛠 Архитектура пайплайна (Step-by-Step Workflow):
```text
1. Подача ссылки или скриншотов вирусного рилса в Claude Project.
2. Claude анализирует темп, хук, ракурсы и генерирует покадровый сценарий с промптами.
3. Генерация ключевых кадров инфлюенсера в Flux / ComfyUI.
4. Анимация кадров в Seedance / Kling / LTX Video.
5. Клонирование голоса и генерация аудио в ElevenLabs.
6. Lip-Sync (LivePortrait / Hedra) и добавление субтитров (CapCut / Auto-subs).
```

---

## 📝 Оригинальное описание с YouTube

<details>
<summary><b>Развернуть описание ролика от автора</b></summary>

```text
In this video, I show you how to clone any viral AI reel with Claude and Seedance, using your own consistent AI model. With two free skills I built for Claude Code, Claude watches a viral reel frame by frame, writes a per second Seedance prompt, and rebuilds the exact same format with my model Julia. Same girl, every single reel, for about $3.

----------------------------------------------

Join Skool:
https://www.skool.com/matrix-lab-6660/about

FREE skills, workflows + all my prompts:
Discord: https://discord.gg/uhfVpmwktQ

Generate your reels (Seedance on WaveSpeed):
https://wavespeed.ai/?ref=matrix

----------------------------------------------

What you'll learn:
- How Claude "watches" any viral reel (every single frame + word-timed transcript)
- How the seedance-prompter writes a per-second prompt — every second timed, every voice tagged
- How to keep the exact same face in every reel (identity from reference images only)
- The WaveSpeed settings that actually matter (reference mode, native audio, 9:16)
- The cost trick: generate at 720p for ~$3 and upscale with Topaz instead of paying for 4K

----------------------------------------------

Chapters / Timestamps
00:00 Clone viral AI reels with Claude
00:56 Intro: the two skills (reel-intake + seedance-prompter)
01:22 Claude analyzes the viral reel (every frame)
03:09 The per-second Seedance prompt
03:51 WaveSpeed settings + generation (720p)
04:37 The result + how to steer the prompt
05:43 Topaz upscale + the cost breakdown
06:25 Skool + free skills

 #claude #seedance #aiinfluencer #aimodel
```

</details>

---

## ⏱ Полная стенограмма с таймкодами (Full Timestamped Transcript)

**[00:00]** There's a wave of AI OFM reels going viral right now and almost all of them are made with Seedance. So I built a system in Claude that takes any reel that's already going viral and rebuilds it with your own model in less than 10 minutes.
**[00:28]** And I'm giving you the whole thing every Claude skill every prompt complete for free in this video. All I ask in return is that you drop a like and write a nice comment what video I should do next to help you make more money.
**[00:39]** The part nobody in this space actually shows you is how to build a model that's truly yours and I'm not gatekeeping a single step here. I've never seen anyone break the whole system down this deep and definitely not for free.
**[00:51]** So stay till the end because every step matters and if you miss one the whole thing falls apart. So let's get straight into it.
**[00:58]** For this I'm using Julia. I built her back to back in my last video and her full data set is already done ready to go.
**[01:05]** So today isn't about building a model, today is about taking a model you already have and turning her into a viral reel. It all runs inside Claude and you need no coding skills and nothing to install.
**[01:15]** And if you don't have a model like Julia yet, stick around I will show you exactly where to get her and create a model like her at the end. Ok, this is the reel we are building today.
**[01:40]** It has this GoPro fish eye look. This exact format is going crazy right now on social media and I think it's funny too. And here's the thing, I'm not going to study the video, Claude is going to do it.
**[01:52]** I've got two skills sitting in Claude Code. The reel intake skill and the Seedance prompter skill. And before you ask you don't have to build any of this yourself.
**[02:01]** Both skills are free and you can find them in my discord below. Honestly they can do way more than what I'm about to show you. They can run this whole thing on autopilot but I'm doing it manually today because I want you to see every single step.
**[02:13]** Then I give Claude the video file or the path. Claude takes the reel apart and extract every single frame. He makes the full transcript with the timing of every single word.
**[02:24]** And then the best part. He checks the lips frame by frame to figure out who's actually talking. Her on camera and the guy holding the camera.
**[02:31]** Most people would get that wrong and the remake of this video would sound completely broken. And you can make it with one girl, two girls and so on. Claude will always figure out who is talking right now.
**[02:43]** After that everything lands in one file. The hook, every beat with its exact second. This file is the DNA of the reel.
**[02:51]** This format minus the person. Because we never copy the person we take the format and put our model in it. Now the reel needs our face and you know for this we are using Julia.
**[03:01]** These are her character sheets. One face sheet, one full body 360 and one portrait picture. The prompts for that are also my discord.
**[03:09]** Now only one more prompt to Claude. Rebuild this reel with my model Julia, same look, same pacing and so on. And the second skill writes a full Seedance prompt.
**[03:18]** Every second is timed, second 0 to second 15. The pauses are also written down. Because here is the secret.
**[03:25]** Fewer words means slower, more human speech. Just cut the words a bit, keep the pauses and she sounds more realistic. And you notice already two things in the prompt.
**[03:35]** One, her face is described nowhere, not one word. Identity comes from the reference images. Second, the prompt describes the lens.
**[03:43]** The fish eye, the dark rounded corners, the lens is half the look. What you don't name, the model usually doesn't apply in the video. Now I take this prompt to WaveSpeed.
**[03:53]** Just paste the whole prompt package into the prompt field. Usually I let Claude or my other AI agents do the whole thing on auto mode. If you want full automation, just take a look in my Skool — link is in the description.
**[04:05]** Now upload Julia's reference images. Just make sure the face anchor is the first image. I select no start image and no reference videos for this one.
**[04:14]** You can use a reference audio to keep a consistent voice, but for this example I do it without a reference audio. Then select aspect ratio 9 to 16 or what kind of aspect ratio you want to generate.
**[04:25]** And also the resolution should be 720p, not 1080p and not 4k, because that's on purpose. The video will cost around about 3$ with 720p, after that we will upscale it to save a ton of money.
**[04:37]** Okay, this is the result and honestly this looks really good in my opinion. Just take a look. Okay, yeah, it's a cool video, but now one thing you need to understand, because this is the part that makes the system really yours.
**[05:04]** The reel says exactly what's written in the prompt package, nothing more and nothing less. In my case Julia did her own spin in this video. That's what was in my package and that's what I want her to say because of the YouTube terms of service.
**[05:18]** If you want the original wording or the original dialogue, just tell Claude something like this. Keep the dialogue word for word from the original video.
**[05:26]** Or if you want her to say something completely different from your niche or from your own script or in your language, same thing, just say it to Claude. I think you already get the point.
**[05:36]** If you want to change something or if you want to keep something exactly the same, just tell it Claude and Claude will change the script. Now remember what I said earlier.
**[05:46]** We generate it at 720p and then upscale it to save a ton of money. I drop the clip into Topaz AI, set the output to 1080 by 1920 for the full Instagram resolution and then click on export.
**[05:59]** That's it. It takes a minute and here's why this matters. A 15 second clip at 720p cost about $3.
**[06:05]** The same clip at 4k with Seedance costs about $15 every single time you click on generate and after Instagram compresses your video anyway, you literally cannot tell the difference between a native 4k video and a 720 clip upscaled with Topaz.
**[06:19]** And at volume and scale, that's the difference between burning 50 bucks a day or even more. But now real talk for a second. These skills clone the reel, but the reel is just a copy.
**[06:30]** The model is the real asset. Same girl every single time. That's what people actually pay for.
**[06:35]** How I build Julia from zero and how she actually makes money, that's inside Matrix Lab. My Skool community. First link in the description for that.
**[06:44]** And like I promised, no gate keeping. Both skills, all the prompts, everything you saw today is for free in my discord. And if this helped you, just drop a like and comment what I should break down next.
**[06:55]** That's literally how I picked the next video. So see you in the next video, bye.

---

## 📄 Непрерывный текст транскрипции (Verbatim Full Text)

There's a wave of AI OFM reels going viral right now and almost all of them are made with Seedance. So I built a system in Claude that takes any reel that's already going viral and rebuilds it with your own model in less than 10 minutes. And I'm giving you the whole thing every Claude skill every prompt complete for free in this video. All I ask in return is that you drop a like and write a nice comment what video I should do next to help you make more money. The part nobody in this space actually shows you is how to build a model that's truly yours and I'm not gatekeeping a single step here. I've never seen anyone break the whole system down this deep and definitely not for free. So stay till the end because every step matters and if you miss one the whole thing falls apart. So let's get straight into it. For this I'm using Julia. I built her back to back in my last video and her full data set is already done ready to go. So today isn't about building a model, today is about taking a model you already have and turning her into a viral reel. It all runs inside Claude and you need no coding skills and nothing to install. And if you don't have a model like Julia yet, stick around I will show you exactly where to get her and create a model like her at the end. Ok, this is the reel we are building today. It has this GoPro fish eye look. This exact format is going crazy right now on social media and I think it's funny too. And here's the thing, I'm not going to study the video, Claude is going to do it. I've got two skills sitting in Claude Code. The reel intake skill and the Seedance prompter skill. And before you ask you don't have to build any of this yourself. Both skills are free and you can find them in my discord below. Honestly they can do way more than what I'm about to show you. They can run this whole thing on autopilot but I'm doing it manually today because I want you to see every single step. Then I give Claude the video file or the path. Claude takes the reel apart and extract every single frame. He makes the full transcript with the timing of every single word. And then the best part. He checks the lips frame by frame to figure out who's actually talking. Her on camera and the guy holding the camera. Most people would get that wrong and the remake of this video would sound completely broken. And you can make it with one girl, two girls and so on. Claude will always figure out who is talking right now. After that everything lands in one file. The hook, every beat with its exact second. This file is the DNA of the reel. This format minus the person. Because we never copy the person we take the format and put our model in it. Now the reel needs our face and you know for this we are using Julia. These are her character sheets. One face sheet, one full body 360 and one portrait picture. The prompts for that are also my discord. Now only one more prompt to Claude. Rebuild this reel with my model Julia, same look, same pacing and so on. And the second skill writes a full Seedance prompt. Every second is timed, second 0 to second 15. The pauses are also written down. Because here is the secret. Fewer words means slower, more human speech. Just cut the words a bit, keep the pauses and she sounds more realistic. And you notice already two things in the prompt. One, her face is described nowhere, not one word. Identity comes from the reference images. Second, the prompt describes the lens. The fish eye, the dark rounded corners, the lens is half the look. What you don't name, the model usually doesn't apply in the video. Now I take this prompt to WaveSpeed. Just paste the whole prompt package into the prompt field. Usually I let Claude or my other AI agents do the whole thing on auto mode. If you want full automation, just take a look in my Skool — link is in the description. Now upload Julia's reference images. Just make sure the face anchor is the first image. I select no start image and no reference videos for this one. You can use a reference audio to keep a consistent voice, but for this example I do it without a reference audio. Then select aspect ratio 9 to 16 or what kind of aspect ratio you want to generate. And also the resolution should be 720p, not 1080p and not 4k, because that's on purpose. The video will cost around about 3$ with 720p, after that we will upscale it to save a ton of money. Okay, this is the result and honestly this looks really good in my opinion. Just take a look. Okay, yeah, it's a cool video, but now one thing you need to understand, because this is the part that makes the system really yours. The reel says exactly what's written in the prompt package, nothing more and nothing less. In my case Julia did her own spin in this video. That's what was in my package and that's what I want her to say because of the YouTube terms of service. If you want the original wording or the original dialogue, just tell Claude something like this. Keep the dialogue word for word from the original video. Or if you want her to say something completely different from your niche or from your own script or in your language, same thing, just say it to Claude. I think you already get the point. If you want to change something or if you want to keep something exactly the same, just tell it Claude and Claude will change the script. Now remember what I said earlier. We generate it at 720p and then upscale it to save a ton of money. I drop the clip into Topaz AI, set the output to 1080 by 1920 for the full Instagram resolution and then click on export. That's it. It takes a minute and here's why this matters. A 15 second clip at 720p cost about $3. The same clip at 4k with Seedance costs about $15 every single time you click on generate and after Instagram compresses your video anyway, you literally cannot tell the difference between a native 4k video and a 720 clip upscaled with Topaz. And at volume and scale, that's the difference between burning 50 bucks a day or even more. But now real talk for a second. These skills clone the reel, but the reel is just a copy. The model is the real asset. Same girl every single time. That's what people actually pay for. How I build Julia from zero and how she actually makes money, that's inside Matrix Lab. My Skool community. First link in the description for that. And like I promised, no gate keeping. Both skills, all the prompts, everything you saw today is for free in my discord. And if this helped you, just drop a like and comment what I should break down next. That's literally how I picked the next video. So see you in the next video, bye.
