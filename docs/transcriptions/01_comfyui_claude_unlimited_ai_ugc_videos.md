# 01. ComfyUI + Claude = Unlimited AI UGC Videos (FREE Workflow)

> **Русское название**: ComfyUI + Claude = Бесконечные AI UGC видео (Бесплатный пайплайн)  
> **Категория**: `Video Generation / UGC Automation`  
> **Стек инструментов**: `ComfyUI` • `Claude API (VLM)` • `Hunyuan Video / Wan 2.1` • `ReActor / FaceID` • `FFmpeg`

---

## 📌 Метаданные видео

| Параметр | Значение |
|---|---|
| **Название на YouTube** | ComfyUI + Claude = Unlimited AI UGC Videos (FREE Workflow) |
| **Ссылка на видео** | [youtube.com/watch?v=U8l5w_sCkhg](https://www.youtube.com/watch?v=U8l5w_sCkhg) |
| **Video ID** | `U8l5w_sCkhg` |
| **Автор / Канал** | **Json ** |
| **Длительность** | **7:49** (468 секунд) |
| **Дата публикации** | 20260819 |
| **Объем транскрипции** | 1452 слов / 7853 символов |

---

## 💡 Аналитический обзор и ключевые инсайты (Executive Summary)

Автоматизированный пайплайн в ComfyUI на базе мультимодального анализа Claude (VLM). Система покадрово разбирает референсное вирусное UGC-видео, формирует точные покадровые промпты и генерирует новое видео с AI-инфлюенсером с сохранением оригинальной динамики, таймингов и движений.

### 🔑 Главные тезисы и выводы:
- Автоматический реверс-инжиниринг вирусных видео с помощью Claude VLM нод в ComfyUI.
- Генерация покадровых промптов (motion, lighting, camera angle, subject actions).
- Использование генеративных видеомоделей (Hunyuan Video / Wan2.1 / LTX) для создания видеоряда.
- Сохранение консистентности лица персонажа и мимики без ручной покадровой отрисовки.
- Пайплайн полностью бесплатен/локален при использовании открытых нод ComfyUI.

### 🛠 Архитектура пайплайна (Step-by-Step Workflow):
```text
1. Загрузка референсного вирусного UGC-видео в ComfyUI Video Loader.
2. Покадровый анализ сцены через Claude Vision API / VLM ноду (Hook, Action, Environment).
3. Генерация структурированных промптов для каждого сегмента видео с подстановкой триггера инфлюенсера.
4. Рендеринг видео в видеогенераторе (Hunyuan / Wan / LTX) с заданным сидом и motion bucket.
5. FaceSwap / ReActor / PulID проход для фиксации идентичности персонажа на видео.
6. Финальная сборка и цветокоррекция.
```

---

## 📝 Оригинальное описание с YouTube

<details>
<summary><b>Развернуть описание ролика от автора</b></summary>

```text
Learn how to use ComfyUI and AI video generation tools to create realistic influencer content. See the exact ComfyUI software workflow for high quality media. This ComfyUI tutorial demonstrates the practical steps for using AI software inside ComfyUI to produce professional grade visuals. If you want to build a digital presence, this ComfyUI breakdown covers the interfaces, the ComfyUI API nodes, and the workflow files required to generate realistic AI images and videos from scratch. You will see how to leverage ComfyUI to create consistent, high-fidelity media assets effectively, one ComfyUI workflow, from reference video to finished AI UGC clip.

----------------------------------------------

Join Skool (The full AI influencer system):
https://www.skool.com/matrix-lab-6660/about

FREE skills, workflows + all my prompts:
Discord: https://discord.gg/uhfVpmwktQ

Original reel (credits):
https://x.com/mightyking/status/2089299068514148655

----------------------------------------------

What you'll learn:
- How one ComfyUI workflow turns any viral reel into an AI UGC video with your own AI influencer
- Why two separate Gemini 3.5 Flash analyses stop the AI from inventing details
- How to top up ComfyUI API credits and pay per generation without a subscription
- How to tell the workflow exactly who gets replaced in a multi-person video
- Why identity comes from reference images and never from prompt text
- How Claude Opus 5 compiles a complete Seedance master prompt with zero manual prompt writing

----------------------------------------------

Chapters / Timestamps

00:00 AI UGC Video Made in ComfyUI (The Result)
00:31 How the Workflow Works
01:50 The Workflow Analyzes the Reference Video
02:55 ComfyUI API Credits
03:25 The Free Layer and the Skool Community
03:50 Choosing Who Gets Replaced
04:30 AI Influencer Reference Images
05:20 Opus 5 Writes the Seedance Master Prompt
06:55 The Final AI UGC Reel
07:29 Free Workflow + Outro

#comfyui #aiinfluencer #aiugc #seedance #aivideo #claude
```

</details>

---

## ⏱ Полная стенограмма с таймкодами (Full Timestamped Transcript)

**[00:30]** This complete AI UGC video was made inside ComfyUI, and the girls you just saw do not exist in real life. I gave one single workflow a viral video as reference, and it watched every frame by itself, wrote the whole prompt by itself,
**[00:43]** and generated everything you see here. And later in this video, we do the exact same thing with your own AI influencer. And the special thing is, the whole system runs on the official ComfyUI API nodes, so you need no extra platform and no subscription,
**[00:57]** and it is cheaper than almost most providers out there. And if you watch till the end of the video, I will show you how to get the whole exact workflow I use, complete for free.
**[01:05]** Okay, let's get straight into it. This is the workflow that made the video you just saw, and it runs completely inside ComfyUI.
**[01:12]** And here is the part most people get wrong: you never write the video prompt yourself. The workflow sampled 60 frames from the reference video, listened to the complete audio, and wrote this whole master prompt on its own, I typed exactly zero words of it.
**[01:25]** And because everything runs on the official ComfyUI API nodes, you load one workflow file, you top up your credits once, and the whole system works in one single graph.
**[01:35]** And it does not matter if you build influencer videos or product videos with it, the workflow only cares about your reference video and your input images. And that is exactly what we do in this video: we take the video you just saw and build it again with Lina, our AI influencer,
**[01:48]** so you can do the exact same thing with your own influencer. But real quick, before we start: you get this whole workflow at the end of the video, completely for free, and all I ask in return is a like, and a nice comment, that is the whole deal.
**[02:00]** Okay, first step, we drop our reference video into the workflow, and that is literally the only input the analysis needs, the video goes in with its original sound.
**[02:08]** And this preview here shows you the exact 60 frames that go into the analysis, so you always know what the AI is actually looking at. And now comes the part most people get wrong: they let one single AI watch the video and hope for the best. Our workflow runs two separate analyses instead,
**[02:24]** both with Gemini 3.5 Flash, because it is extremely cheap for exactly this job. One analysis only watches the visuals, and the other one only listens to the audio, and that is exactly why nothing gets invented here.
**[02:37]** And when the analysis is done, you get these two reports: they document every single second, and the workflow even checks if the video is one continuous take, or has real cuts.
**[02:46]** But to run all of this yourself, you need credits on your Comfy account, so let me show you real quick how you get them.
**[02:52]** So these API nodes run directly over your Comfy account, and you top up your credits one single time on the official ComfyUI website. There is no subscription behind it, you only pay for what you actually generate.
**[03:03]** Now, Seedance 2.5 is an expensive model, we all know that, but over the ComfyUI API nodes it is cheaper than on most other platforms.
**[03:11]** And one quick pro tip: if you use the API nodes for image models like GPT Image 2 or Nano Banana Pro, you pay almost half of what the other platforms charge, for the exact same model.
**[03:21]** And by the way, if you are serious about this whole game: everything I show here on YouTube is the free layer, but the complete Lina build, the premium workflows, and the people who already run this as a business, all of that lives in the Skool community.
**[03:34]** And real talk: the gap between the people watching this, and the people inside running this, gets bigger every single week.
**[03:40]** So now the workflow needs to know who gets replaced, and for that we have this target field right here, the control center of the whole workflow.
**[03:47]** In our video we want to replace exactly one person, so I describe her the way the workflow sees her: the woman in the purple dress, who runs ahead of the group.
**[03:55]** And to make it even more precise, I add one single screenshot of her from the video. If your video only has one person, you do not need this, but the moment there are more people in the frame, this screenshot makes the difference.
**[04:06]** Everything else stays protected, her three friends, the people in the background, and the whole location. And a target does not have to be a person by the way, you can replace a product in a video the exact same way.
**[04:17]** And did you notice what is completely missing here? Not one single word about how Lina looks, because identity never comes from text, it comes from the reference images, and that is exactly the next step.
**[04:27]** So this is Lina, and these three images are everything the workflow gets of her. You have ten slots for references, every slot has its own on and off switch, and we only need three of them.
**[04:37]** The first image is the face anchor, one clean shot of her face, straight into the camera, and this single image owns her identity.
**[04:44]** The second one is Lina complete, full body with the outfit, so the workflow knows her proportions and exactly what she is wearing.
**[04:52]** And the third one is the part most people forget: a character sheet of her from behind. In the reference video, the camera sees her from the back half of the time, and without this sheet, Seedance would have to guess her hair and the dress from behind, and we never let it guess anything.
**[05:06]** Just make sure all your references show the same character, because if they fight each other, your result falls apart. And now everything is ready for the part I really like: Opus takes all of this, and writes the master prompt.
**[05:17]** So Opus 5 gets the verified blueprint, our target mapping, and Lina's three references, and out of that it compiles one single master prompt.
**[05:25]** And inside the Opus node sits the real secret of this whole workflow: our system prompt. This thing is built to take any video apart and reconstruct it as a perfect master prompt, it does not matter if it is a UGC ad, a dance clip, or a product video.
**[05:40]** And this system prompt is exactly why the results are this good, and it is included in the free workflow. Opus never sees the original video, not even one single frame, Gemini describes what happens, Opus writes the prompt, and that is why the original woman
**[05:53]** cannot leak into our result. The prompt covers the recording format, the setting, every action with its exact timing, and the complete audio, and it never invents cuts or camera moves that the analysis did not prove.
**[06:05]** Then everything goes into the Seedance node, the master prompt, Lina's three references, and nothing else, we set 720p, thirty seconds, and hit generate.
**[06:14]** And real quick, because this is important: this is the very first generation. Everything from the reference is still there, the location, the friends and the camera moves.
**[06:22]** But the girl in the video is now Lina. And of course, because it is AI, the result is never one to one the same as the original, but it is really close, and it took me almost no time.
**[06:32]** And one thing for the advanced people here: if you are good with AI agents, you can rebuild this exact framework with your own local agents, the workflow is the blueprint, the logic stays exactly the same.
**[06:42]** So let the result speak for itself, here is the complete reel, from start to finish. And that is the whole system.
**[07:18]** One reference video in, one master prompt, and your own influencer in the leading role, all inside ComfyUI, in one single workflow.
**[07:25]** And if you want to go deeper: how Lina was built from zero, and how UGC influencer like her actually make money, that whole system lives in our Skool community, first link in the description. And like I promised at the start,
**[07:37]** you get the whole workflow for free, with the complete system prompt inside, it is waiting in our Discord, and all links are in the description.
**[07:44]** If this video helped you, leave a like and subscribe. So, see you in the next video. Bye.

---

## 📄 Непрерывный текст транскрипции (Verbatim Full Text)

This complete AI UGC video was made inside ComfyUI, and the girls you just saw do not exist in real life. I gave one single workflow a viral video as reference, and it watched every frame by itself, wrote the whole prompt by itself, and generated everything you see here. And later in this video, we do the exact same thing with your own AI influencer. And the special thing is, the whole system runs on the official ComfyUI API nodes, so you need no extra platform and no subscription, and it is cheaper than almost most providers out there. And if you watch till the end of the video, I will show you how to get the whole exact workflow I use, complete for free. Okay, let's get straight into it. This is the workflow that made the video you just saw, and it runs completely inside ComfyUI. And here is the part most people get wrong: you never write the video prompt yourself. The workflow sampled 60 frames from the reference video, listened to the complete audio, and wrote this whole master prompt on its own, I typed exactly zero words of it. And because everything runs on the official ComfyUI API nodes, you load one workflow file, you top up your credits once, and the whole system works in one single graph. And it does not matter if you build influencer videos or product videos with it, the workflow only cares about your reference video and your input images. And that is exactly what we do in this video: we take the video you just saw and build it again with Lina, our AI influencer, so you can do the exact same thing with your own influencer. But real quick, before we start: you get this whole workflow at the end of the video, completely for free, and all I ask in return is a like, and a nice comment, that is the whole deal. Okay, first step, we drop our reference video into the workflow, and that is literally the only input the analysis needs, the video goes in with its original sound. And this preview here shows you the exact 60 frames that go into the analysis, so you always know what the AI is actually looking at. And now comes the part most people get wrong: they let one single AI watch the video and hope for the best. Our workflow runs two separate analyses instead, both with Gemini 3.5 Flash, because it is extremely cheap for exactly this job. One analysis only watches the visuals, and the other one only listens to the audio, and that is exactly why nothing gets invented here. And when the analysis is done, you get these two reports: they document every single second, and the workflow even checks if the video is one continuous take, or has real cuts. But to run all of this yourself, you need credits on your Comfy account, so let me show you real quick how you get them. So these API nodes run directly over your Comfy account, and you top up your credits one single time on the official ComfyUI website. There is no subscription behind it, you only pay for what you actually generate. Now, Seedance 2.5 is an expensive model, we all know that, but over the ComfyUI API nodes it is cheaper than on most other platforms. And one quick pro tip: if you use the API nodes for image models like GPT Image 2 or Nano Banana Pro, you pay almost half of what the other platforms charge, for the exact same model. And by the way, if you are serious about this whole game: everything I show here on YouTube is the free layer, but the complete Lina build, the premium workflows, and the people who already run this as a business, all of that lives in the Skool community. And real talk: the gap between the people watching this, and the people inside running this, gets bigger every single week. So now the workflow needs to know who gets replaced, and for that we have this target field right here, the control center of the whole workflow. In our video we want to replace exactly one person, so I describe her the way the workflow sees her: the woman in the purple dress, who runs ahead of the group. And to make it even more precise, I add one single screenshot of her from the video. If your video only has one person, you do not need this, but the moment there are more people in the frame, this screenshot makes the difference. Everything else stays protected, her three friends, the people in the background, and the whole location. And a target does not have to be a person by the way, you can replace a product in a video the exact same way. And did you notice what is completely missing here? Not one single word about how Lina looks, because identity never comes from text, it comes from the reference images, and that is exactly the next step. So this is Lina, and these three images are everything the workflow gets of her. You have ten slots for references, every slot has its own on and off switch, and we only need three of them. The first image is the face anchor, one clean shot of her face, straight into the camera, and this single image owns her identity. The second one is Lina complete, full body with the outfit, so the workflow knows her proportions and exactly what she is wearing. And the third one is the part most people forget: a character sheet of her from behind. In the reference video, the camera sees her from the back half of the time, and without this sheet, Seedance would have to guess her hair and the dress from behind, and we never let it guess anything. Just make sure all your references show the same character, because if they fight each other, your result falls apart. And now everything is ready for the part I really like: Opus takes all of this, and writes the master prompt. So Opus 5 gets the verified blueprint, our target mapping, and Lina's three references, and out of that it compiles one single master prompt. And inside the Opus node sits the real secret of this whole workflow: our system prompt. This thing is built to take any video apart and reconstruct it as a perfect master prompt, it does not matter if it is a UGC ad, a dance clip, or a product video. And this system prompt is exactly why the results are this good, and it is included in the free workflow. Opus never sees the original video, not even one single frame, Gemini describes what happens, Opus writes the prompt, and that is why the original woman cannot leak into our result. The prompt covers the recording format, the setting, every action with its exact timing, and the complete audio, and it never invents cuts or camera moves that the analysis did not prove. Then everything goes into the Seedance node, the master prompt, Lina's three references, and nothing else, we set 720p, thirty seconds, and hit generate. And real quick, because this is important: this is the very first generation. Everything from the reference is still there, the location, the friends and the camera moves. But the girl in the video is now Lina. And of course, because it is AI, the result is never one to one the same as the original, but it is really close, and it took me almost no time. And one thing for the advanced people here: if you are good with AI agents, you can rebuild this exact framework with your own local agents, the workflow is the blueprint, the logic stays exactly the same. So let the result speak for itself, here is the complete reel, from start to finish. And that is the whole system. One reference video in, one master prompt, and your own influencer in the leading role, all inside ComfyUI, in one single workflow. And if you want to go deeper: how Lina was built from zero, and how UGC influencer like her actually make money, that whole system lives in our Skool community, first link in the description. And like I promised at the start, you get the whole workflow for free, with the complete system prompt inside, it is waiting in our Discord, and all links are in the description. If this video helped you, leave a like and subscribe. So, see you in the next video. Bye.
