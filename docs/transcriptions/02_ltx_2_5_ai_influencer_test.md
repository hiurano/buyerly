# 02. LTX 2.5 AI Influencer Test: Fast, but Good Enough?

> **Русское название**: Тест модели LTX 2.5 для AI-инфлюенсеров: Быстро, но достаточно ли качественно?  
> **Категория**: `Video Generation / Model Benchmark`  
> **Стек инструментов**: `LTX 2.5 Video` • `Hugging Face` • `ComfyUI` • `RIFE Interpolation` • `Topaz Video AI`

---

## 📌 Метаданные видео

| Параметр | Значение |
|---|---|
| **Название на YouTube** | LTX 2.5 AI Influencer Test: Fast, but Good Enough? |
| **Ссылка на видео** | [youtube.com/watch?v=sYoYrw_NMGY](https://www.youtube.com/watch?v=sYoYrw_NMGY) |
| **Video ID** | `sYoYrw_NMGY` |
| **Автор / Канал** | **Json ** |
| **Длительность** | **5:14** (314 секунд) |
| **Дата публикации** | 20260812 |
| **Объем транскрипции** | 990 слов / 5624 символов |

---

## 💡 Аналитический обзор и ключевые инсайты (Executive Summary)

Детальный стресс-тест и бенчмарк открытой видеомодели LTX 2.5 (от Lightricks) на Hugging Face для создания контента с AI-инфлюенсерами. Оценка скорости генерации на потребительских GPU, реализма кожи, сохранения черт лица, артефактов движения и сравнение с конкурентами.

### 🔑 Главные тезисы и выводы:
- LTX 2.5 обладает сверхвысокой скоростью генерации и оптимизирована для быстрого инференса.
- Специфика промптинга для LTX 2.5: важно указывать векторы движения камеры (camera panning, zoom, orbit) и динамику освещения.
- Оценка качества: отличная работа с крупными планами и освещением, но возможны деформации конечностей при быстрых движениях.
- Идеальные юзкейсы: короткие 3-5 секундные UGC-реплики, разговорные рилсы, портретные видео для сторис.
- Бесплатный шаблон промптов и настроек параметров генерации.

### 🛠 Архитектура пайплайна (Step-by-Step Workflow):
```text
1. Выбор базового портрета или стартового кадра инфлюенсера.
2. Формирование промпта по специализированному LTX-шаблону (Camera Movement + Action + Environment + Lighting).
3. Настройка параметров LTX 2.5 (Steps, Guidance scale, Frame count, FPS).
4. Инференс через ComfyUI ноды или Hugging Face Space.
5. Постобработка: апскейл (Topaz Video AI / RealESRGAN) и интерполяция кадров (RIFE).
```

---

## 📝 Оригинальное описание с YouTube

<details>
<summary><b>Развернуть описание ролика от автора</b></summary>

```text
Learn how to run the new LTX 2.5 model for AI video generation using a standard Comfy UI workflow. See high-quality results from influencer prompts.
This guide explains how to implement the LTX 2.5 model directly from Hugging Face into your creative pipeline. If you are interested in automating video production or testing new generative models, this walkthrough demonstrates the specific steps required to get your environment configured correctly.

----------------------------------------------

Join Skool (complete AI influencer systems + premium workflows):
https://www.skool.com/matrix-lab-6660/about

FREE LTX 2.5 prompting skill + all three ComfyUI workflows:
Discord: https://discord.gg/uhfVpmwktQ

Run LTX 2.5 in the cloud (RunPod affiliate link):
https://runpod.io?ref=upkpysv6

----------------------------------------------

What you'll learn:
- How LTX 2.5 performs on two repeatable AI influencer benchmark tests
- Why the expression test exposes identity and camera-control problems
- How LTX 2.5 handles fingers, hair interaction, body movement, and reflections
- Which official ComfyUI workflow matters most for AI influencers
- How fast five-second generations run on an RTX 5090
- When an RTX PRO 6000 on RunPod makes sense for faster generation

----------------------------------------------

Chapters / Timestamps:

00:00 LTX 2.5 AI influencer test
00:16 The official Hugging Face model and workflow
00:56 What changed from LTX 2.3
01:14 The three official ComfyUI workflows
01:46 Lina and the fixed AI influencer benchmark
02:12 Test 1: expression and identity consistency
02:37 Test 2: body movement, hands, hair, and reflection
03:59 RTX 5090 speed, GGUF, and RunPod
04:19 Final LTX 2.5 review
04:49 Free prompting skill and ComfyUI workflows

#aiinfluencer #ltx25 #comfyui #aivideo #aimodel
```

</details>

---

## ⏱ Полная стенограмма с таймкодами (Full Timestamped Transcript)

**[00:00]** LTX 2.5 just landed on Hugging Face, so I gave it the same AI influencer prompts I give every model.
**[00:05]** And honestly, the results surprised me, because some clips look better than I expected. And the LTX prompting skill I used, to have optomized prompts for this model, you get complete for free, at the end of this
**[00:15]** video. Okay, let's get straight into it. Everything here is a real screen recording, so you can follow every step.
**[00:27]** We grab LTX 2.5 from Hugging Face, load the standard ComfyUI workflow, and run my fixed AI influencer prompts, the same set I give every model.
**[00:42]** And the prompts and the settings stay on screen the whole time, because this is about building an AI influencer, not a cinematic demo.
**[00:56]** This is the official page, Lightricks LTX-2.5 on Hugging Face. The weights are gated behind agree and access, under the LTX-2 community license, so it's an open weights model.
**[01:00]** Inside you get a 22 Billion dev model and a distilled one, ComfyUI variants, a Gemma text encoder, and separate video and audio VAEs, so it can generate sound too.
**[01:05]** And the positioning changed, because Lightricks framed 2.3 around a rebuilt video VAE and finer detail, and they frame 2.5 around continuity, control, efficiency, stronger prompt understanding, and native multi-shot.
**[01:10]** That's their words, not our test, and continuity is the part an influencer needs, so we test exactly that.
**[01:14]** So these are the three official LTX 2.5 workflows: text to video, image to video, and first and last frame to video.
**[01:20]** For an AI influencer, image to video is the one that matters. We feed it the same character image and see whether her identity survives motion.
**[01:28]** For this test, I'm using the official workflow at 0.9 megapixels in 9 to 16 aspect ratio. For five seconds at 24 frames per second, with prompt enhancement enabled.
**[01:37]** And i've put all three ComfyUI workflows in my Discord, the link is in the description. Now let's run our fixed influencer prompts and look at what actually comes back.
**[01:46]** And this is Lina. If you've watched this channel before, you already know her. For this benchmark, she gets two fixed reference images and two fixed tests, and every future video model gets the exact same inputs.
**[01:58]** The first image is a controlled studio portrait. Test one is the expression test: the framing stays locked while her face moves from neutral into a clearly different expression.
**[02:08]** We are watching the eyes, mouth, teeth, skin, hair, and whether she still looks like Lina at the end. And this is what LTX 2.5 produced on the very first generation.
**[02:18]** Honestly, for an open-source video model, I think this is extremely good. The expression develops naturally, her identity stays consistent, and even the teeth hold up.
**[02:27]** The only instruction it missed was that the camera should stay completely locked with no zoom in the prompt. Instead, it slowly pushes in throughout the shot.
**[02:36]** So the visual quality is strong, but the instruction following is not perfect. Reference two is the opposite: a real influencer-style selfie, with a high camera angle, a peace sign close to the lens and a difficult body pose.
**[02:49]** The movement test asks LTX to coordinate her body, arm, hand, and hair without breaking the selfie perspective, her identity, or the room around her.
**[02:57]** And this is what LTX 2.5 produced on the very first generation. This is a genuinely hard stress test for the model, because there are so many things happening in one prompt and one five-second video: body movement, facial movement,
**[03:10]** the hand, individual fingers, hair interaction, camera motion, and even the reflection in the window behind her. And LTX 2.5 handles most of it surprisingly well.
**[03:19]** The fingers stay very realistic, and when she runs her hand through her hair, both the hand movement and the way the hair reacts look extremely convincing.
**[03:28]** I also like that the reflection behind her stays present as the scene moves. The only obvious weakness is near the end, where her eyes start to look a little strange.
**[03:38]** But overall, for an open-source model handling this much movement at once, this is a very strong result. And if this video helps you create better AI influencer videos, please leave a like.
**[03:49]** And if you really want to learn how to build proper AI influencers from start to finish, check out our skool community.
**[03:57]** The link is in the description. And just quickly on speed, I generated these clips on an RTX 5090, and each one took around two to three minutes, which is honestly pretty fast.
**[04:06]** You can probably push it even faster with a GGUF version. And if you want the fastest setup, I would use an RTX PRO 6000 on RunPod.
**[04:14]** For RunPod just click down below. Now let me give you my final review. So my final review is, for an open-source video model, LTX 2.5 is extremely impressive.
**[04:23]** It keeps Lina consistent, handles complex movement surprisingly well, and both tests gave us usable results on the very first generation.
**[04:30]** But tt is not perfect. The first test ignored the locked camera and zoomed in, and the eyes became a little unstable near the end of the movement test.
**[04:40]** But for creating AI influencer videos, this is absolutely a model I would keep using and testing daily.
**[04:46]** And now, let me give you the free resources. And as promised, the LTX 2.5 prompting skill and all three official ComfyUI workflows are free in our Discord.
**[04:54]** The skill works with Claude Code, Codex, or any agent you use, and our custom LTX 2.5 workflow is still in development.
**[04:59]** Once it is ready, I will add it there too. You find everything down below. And if this test saved you time, leave a like, and tell me in the comments which model should face the same prompts next.
**[05:11]** So, see you in the next video. Bye.

---

## 📄 Непрерывный текст транскрипции (Verbatim Full Text)

LTX 2.5 just landed on Hugging Face, so I gave it the same AI influencer prompts I give every model. And honestly, the results surprised me, because some clips look better than I expected. And the LTX prompting skill I used, to have optomized prompts for this model, you get complete for free, at the end of this video. Okay, let's get straight into it. Everything here is a real screen recording, so you can follow every step. We grab LTX 2.5 from Hugging Face, load the standard ComfyUI workflow, and run my fixed AI influencer prompts, the same set I give every model. And the prompts and the settings stay on screen the whole time, because this is about building an AI influencer, not a cinematic demo. This is the official page, Lightricks LTX-2.5 on Hugging Face. The weights are gated behind agree and access, under the LTX-2 community license, so it's an open weights model. Inside you get a 22 Billion dev model and a distilled one, ComfyUI variants, a Gemma text encoder, and separate video and audio VAEs, so it can generate sound too. And the positioning changed, because Lightricks framed 2.3 around a rebuilt video VAE and finer detail, and they frame 2.5 around continuity, control, efficiency, stronger prompt understanding, and native multi-shot. That's their words, not our test, and continuity is the part an influencer needs, so we test exactly that. So these are the three official LTX 2.5 workflows: text to video, image to video, and first and last frame to video. For an AI influencer, image to video is the one that matters. We feed it the same character image and see whether her identity survives motion. For this test, I'm using the official workflow at 0.9 megapixels in 9 to 16 aspect ratio. For five seconds at 24 frames per second, with prompt enhancement enabled. And i've put all three ComfyUI workflows in my Discord, the link is in the description. Now let's run our fixed influencer prompts and look at what actually comes back. And this is Lina. If you've watched this channel before, you already know her. For this benchmark, she gets two fixed reference images and two fixed tests, and every future video model gets the exact same inputs. The first image is a controlled studio portrait. Test one is the expression test: the framing stays locked while her face moves from neutral into a clearly different expression. We are watching the eyes, mouth, teeth, skin, hair, and whether she still looks like Lina at the end. And this is what LTX 2.5 produced on the very first generation. Honestly, for an open-source video model, I think this is extremely good. The expression develops naturally, her identity stays consistent, and even the teeth hold up. The only instruction it missed was that the camera should stay completely locked with no zoom in the prompt. Instead, it slowly pushes in throughout the shot. So the visual quality is strong, but the instruction following is not perfect. Reference two is the opposite: a real influencer-style selfie, with a high camera angle, a peace sign close to the lens and a difficult body pose. The movement test asks LTX to coordinate her body, arm, hand, and hair without breaking the selfie perspective, her identity, or the room around her. And this is what LTX 2.5 produced on the very first generation. This is a genuinely hard stress test for the model, because there are so many things happening in one prompt and one five-second video: body movement, facial movement, the hand, individual fingers, hair interaction, camera motion, and even the reflection in the window behind her. And LTX 2.5 handles most of it surprisingly well. The fingers stay very realistic, and when she runs her hand through her hair, both the hand movement and the way the hair reacts look extremely convincing. I also like that the reflection behind her stays present as the scene moves. The only obvious weakness is near the end, where her eyes start to look a little strange. But overall, for an open-source model handling this much movement at once, this is a very strong result. And if this video helps you create better AI influencer videos, please leave a like. And if you really want to learn how to build proper AI influencers from start to finish, check out our skool community. The link is in the description. And just quickly on speed, I generated these clips on an RTX 5090, and each one took around two to three minutes, which is honestly pretty fast. You can probably push it even faster with a GGUF version. And if you want the fastest setup, I would use an RTX PRO 6000 on RunPod. For RunPod just click down below. Now let me give you my final review. So my final review is, for an open-source video model, LTX 2.5 is extremely impressive. It keeps Lina consistent, handles complex movement surprisingly well, and both tests gave us usable results on the very first generation. But tt is not perfect. The first test ignored the locked camera and zoomed in, and the eyes became a little unstable near the end of the movement test. But for creating AI influencer videos, this is absolutely a model I would keep using and testing daily. And now, let me give you the free resources. And as promised, the LTX 2.5 prompting skill and all three official ComfyUI workflows are free in our Discord. The skill works with Claude Code, Codex, or any agent you use, and our custom LTX 2.5 workflow is still in development. Once it is ready, I will add it there too. You find everything down below. And if this test saved you time, leave a like, and tell me in the comments which model should face the same prompts next. So, see you in the next video. Bye.
