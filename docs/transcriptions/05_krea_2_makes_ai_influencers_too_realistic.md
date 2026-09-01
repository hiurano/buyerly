# 05. Krea 2 Makes AI Influencers TOO Realistic (LoRa + Workflow)

> **Русское название**: Krea 2 делает AI-инфлюенсеров слишком реалистичными (LoRA + Пайплайн)  
> **Категория**: `Photorealism & LoRA Workflow`  
> **Стек инструментов**: `Krea 2` • `Flux.1 Dev LoRA` • `ComfyUI` • `AI-Toolkit` • `Photo Realism Prompts`

---

## 📌 Метаданные видео

| Параметр | Значение |
|---|---|
| **Название на YouTube** | Krea 2 Makes AI Influencers TOO Realistic (LoRa + Workflow) |
| **Ссылка на видео** | [youtube.com/watch?v=7Hfn8g-httk](https://www.youtube.com/watch?v=7Hfn8g-httk) |
| **Video ID** | `7Hfn8g-httk` |
| **Автор / Канал** | **Json ** |
| **Длительность** | **7:33** (452 секунд) |
| **Дата публикации** | 20260716 |
| **Объем транскрипции** | 1511 слов / 7922 символов |

---

## 💡 Аналитический обзор и ключевые инсайты (Executive Summary)

Пайплайн достижения бескомпромиссного фотореализма с помощью Krea 2 и обучения кастомных LoRA. Методы генерации текстуры кожи (поры, мелкие неровности, естественный микрорельеф), симуляция несовершенств мобильной камеры и борьба с «пластиковым» эффектом нейросетей.

### 🔑 Главные тезисы и выводы:
- Krea 2 и открытые архитектуры для гиперреалистичной генерации людей.
- Настройка параметров LoRA: правильный выбор Rank/Dim (16/32) и Alpha для сохранения микротекстур.
- Промптинг для эффекта мобильного фото: 'iPhone 15 flash selfie', 'slight motion blur', 'grain', 'casual candid shot'.
- Техника многоступенчатого апскейла и диффузного денойзинга в Krea / ComfyUI.
- 100% консистентность персонажа при изменении окружения и ракурса.

### 🛠 Архитектура пайплайна (Step-by-Step Workflow):
```text
1. Сборка ультра-четкого датасета без искусственного разглаживания кожи.
2. Обучение LoRA модели на базе Flux / SDXL с акцентом на сохранение естественных деталей.
3. Построение промпта с деконструкцией «UGC-эстетики» (UGC raw candid aesthetic).
4. Генерация базового кадра в Krea 2 / ComfyUI с силой LoRA 0.8 - 0.9.
5. Финальный проход рендеринга деталей и добавление пленочного зерна.
```

---

## 📝 Оригинальное описание с YouTube

<details>
<summary><b>Развернуть описание ролика от автора</b></summary>

```text
Krea 2 makes AI influencers so realistic that nobody can tell the difference anymore. In this video, I show you the exact workflow I use to train a hyperrealistic character LoRA on Krea 2: we train with AI Toolkit on RunPod, test every checkpoint with my LoRA tester in ComfyUI, and push the realism until nobody can tell she's AI. Same AI influencer, every single image — and because Krea 2 is open source, there are no filters and no rules.

----------------------------------------------

Join Skool (full dataset system, LoRA tester + premium workflows):
https://www.skool.com/matrix-lab-6660/about

FREE skills, workflows + all my prompts:
Discord: https://discord.gg/uhfVpmwktQ

Train your LoRA (RunPod):
https://runpod.io?ref=upkpysv6

----------------------------------------------

What you'll learn:
- How to build a Krea 2 LoRA dataset that doesn't look like AI (26–34 images, studio + phone mix)
- How to train a character LoRA with AI Toolkit on RunPod for $3–5
- Why you train on Krea 2 RAW and never on Turbo (and generate on Turbo later)
- Why the last checkpoint is not automatically the best — and how the LoRA tester grid finds the real winner
- How to push realism with the premium canvas: skin polish, SeedVR2 upscale, ControlNet poses
- Why open source means no filters and no rules — your influencer runs on your machine

----------------------------------------------

Chapters / Timestamps
00:00 Krea 2 AI influencers: too realistic?
00:36 The dataset decides everything (Lina, 34 images)
01:33 The plan: train, test, push realism
01:47 RunPod setup (GPU + AI Toolkit template)
02:36 Uploading the dataset
02:53 LoRA training settings (Krea 2 RAW, trigger word, 3,000 steps)
03:57 Start training
04:12 Testing the 12 checkpoints
04:40 The LoRA tester grid (find the real winner)
05:24 Generating Lina (free master workflow)
05:55 The premium canvas: skin polish, SeedVR2, ControlNet
06:54 Open source = no filters + how to get everything

#aiinfluencer #krea2 #lora #comfyui
```

</details>

---

## ⏱ Полная стенограмма с таймкодами (Full Timestamped Transcript)

**[00:00]** Create tool makes AI influencer so realistic that nobody can tell the difference anymore. And in this video, I show you the exact workflow I used to train one hyperrealistic AI influencer
**[00:11]** with Create tool that stays the same in every single image. And because Create tool is open source, there are no filters and no rules. And you can create with it whatever you want. And when I
**[00:21]** say whatever, I really mean whatever. And if you watch till the end of this video, I show you how to get the whole exact workflow I use complete for free.
**[00:29]** Okay, let's get straight to the point. And this time we don't waste any time because the data set is already ready.
**[00:35]** But real quick, because this part decides everything. A Laura is only as good as the data set under it. If you give garbage in, of course you get garbage out. So this is the data set we
**[00:46]** are working with today. And this is Lena, our AI influencer for this video. And we use 34 images of her, all in full resolution. Clean studio shots mixed up with blurry phone style shots. And
**[00:57]** here's the thing with Create tool, you don't need hundreds of images. 26 to 34 good images is the sweet spot when we train a character Laura. But every single image has to be on point. Same
**[01:08]** face, different angles, different expressions, and different lighting. Because the Laura learns exactly what you feed in. And the data set decides how real your AI influencer looks later.
**[01:18]** And as you see, our data set is on point. And if you want to know how to build the perfect AI data set, the full system with all prompts, caption files, and how we create Lena from scratch is
**[01:29]** inside our school community. Link for this is in the description. So here's the plan. First, we train our Laura with the AI toolkit on RunPod. Then we test the checkpoints with our Laura tester in
**[01:40]** ComfyUI. And at the end, we push it to a level where nobody can tell she's AI anymore. So time to train our Laura. For the training, we jump straight over to RunPod. And to be honest, this is the
**[01:51]** easy part. You rent a GPU by hour, and the whole training costs you maybe three to five bucks. For Create 2, you can grab an RTX 6000 Pro or RTX 5090. We go with the RTX 6000 Pro in this video.
**[02:05]** That is more than enough. Then we swap the template and take the official Ostris AI Toolkit template. That's the tool to train our Laura for us. And here it is very important. In the storage
**[02:15]** settings, we take the volume disk and not a network volume. We give it 150 gigs so we have room for all our checkpoints. And then we click deploy on demand at the bottom. Just give it a few
**[02:25]** minutes to boot. Then in the connect tab, we open the HTTP service link. And that drops us straight inside the AI Toolkit. And the password is by the way only password. Inside, we go to the data
**[02:37]** set tab, create a new data set, and name it Lena or whatever your creator is called. Then we drag and drop all 34 images together with the caption files and let it upload. Now our data set is
**[02:48]** in and we can set up our training. After that, we create a new job and name our Laura. For the trigger word, use one unique word. Something the model doesn't already know so it ties only to our
**[02:59]** Laura. For Lena, we take Lena written with an one instead of an I. And now comes the most important settings in this whole video. We set the model architecture to Create 2 and here you
**[03:09]** take raw, never turbo. Training on turbo ruins the quality so double check this one is in. We train on raw and later we generate on the turbo model. For the steps, we go with 3000 and the optimizer
**[03:21]** stays on Adam with the default learning rate. So quick tip, if you train on a 5090, set the batch size to one so it doesn't run out of memory. And everything else we keep also on default.
**[03:32]** Make sure the right data set is selected and set it up to save checkpoints along the way every 250 steps. And here comes a part where a lot people mess up. You have to set the max save is to something
**[03:44]** higher like 100. Otherwise, the toolkit deletes your old checkpoints while it trains. And at the end, we want all 12 of them, so we can pick the best one instead of just trusting the last. Then
**[03:56]** we hit create job, press play, and it's on. It downloads a few files, and then the training runs completely on its own.
**[04:03]** And heads up, a creative lower training usually takes a bit longer than on other models. So, we just let it cook and come back when it's done. Now the training is done, and we have now 12 checkpoints of
**[04:13]** our Lena LoRA. And this is where most people go wrong. They just grab the last one and hope the best. But the last checkpoint is not automatically the best one. Sometimes the LoRA is already
**[04:24]** overtrained at 3,000 steps, and the sweet spot sits somewhere around 2,000 to 3,000 steps. So, we download the last four checkpoints, and we test them properly. For the testing, we jump into
**[04:35]** ComfyUI on our RunPod template. I show you the exact setup in a minute. And here comes one of my favorite tools, our LoRA tester. And by the way, our LoRA tester is also waiting for you in our
**[04:46]** school community. The LoRA tester takes all your checkpoints and generates the same image with every single of them side by side in one grid. Same prompt, same seed, only the checkpoint changes.
**[04:57]** So, instead of guessing, we just look at the grid and see exactly which checkpoints keeps Lena's face the most stable. That's how you find the real winner in 2 minutes. In our case, LoRA
**[05:07]** number four wins, the one with the full 3,000 steps. So, this time the last checkpoint really was the best one. But you only know that when you test it.
**[05:16]** Lena looks exactly like Lena in every single test image. So, we take this one, and this is our LoRA for now. So, our LoRA is ready. Now comes the fun part.
**[05:26]** We generate Lena. Inside ComfyUI, we first upload our new Lena LoRA, and then we open our free master workflow. And it's super simple. We select our LoRA in the power loader, write a simple prompt
**[05:39]** with our trigger word Lena, and hit run. And look at that. That's Lena. First try, and she's already looking insane.
**[05:45]** And by the way, you get this workflow completely for free in our Discord. But, honestly, we can push this way more.
**[05:52]** And, this is where it gets really interesting, our premium workflow. One canvas, three workflows built in, and just toggle on the one you need. On top, we have the premium master, same idea as
**[06:04]** the free one, but with a light skin polish pass and a seed we are two upscaler at the end. So, we take the exact same prompt as before and let it run. Now, look at the difference. Same
**[06:15]** girl, same prompt, but the skin, the details, the sharpness, this is a completely different level. In the middle, we have the control net workflow. You give it any reference
**[06:24]** pose, and your influencer copies it exactly. I won't run it now, but it's sitting right there ready to go. And, at the bottom, our creator added workflow.
**[06:33]** I already loaded our example image in here. So, let's just change the hair color for demonstration with one simple prompt. Same influencer, same face, but now with a different hair color. And,
**[06:44]** only with one prompt. That's it. And, the best part, I keep extending this canvas over time. New workflows just drop in, and everyone inside gets them automatically. And, one more thing
**[06:54]** before we wrap this up. Crea 2 is open source, and it runs on your own machine. So, what you create with your influencer is completely up to you. And, if you actually serious about building an AI
**[07:05]** influencer, come over to our school community. That's where the whole premium stack lives, the premium studio workflow, the Laura tester, and the full data set system. And, like I promised at
**[07:15]** the start, you get the whole workflow for free. The free master workflow is waiting in our Discord. And, all links for that are in the description. If this video helped you, leave a like and
**[07:25]** subscribe. And, write in the comments what I should do next to help you make more money. So, see you in the next video. Bye.

---

## 📄 Непрерывный текст транскрипции (Verbatim Full Text)

Create tool makes AI influencer so realistic that nobody can tell the difference anymore. And in this video, I show you the exact workflow I used to train one hyperrealistic AI influencer with Create tool that stays the same in every single image. And because Create tool is open source, there are no filters and no rules. And you can create with it whatever you want. And when I say whatever, I really mean whatever. And if you watch till the end of this video, I show you how to get the whole exact workflow I use complete for free. Okay, let's get straight to the point. And this time we don't waste any time because the data set is already ready. But real quick, because this part decides everything. A Laura is only as good as the data set under it. If you give garbage in, of course you get garbage out. So this is the data set we are working with today. And this is Lena, our AI influencer for this video. And we use 34 images of her, all in full resolution. Clean studio shots mixed up with blurry phone style shots. And here's the thing with Create tool, you don't need hundreds of images. 26 to 34 good images is the sweet spot when we train a character Laura. But every single image has to be on point. Same face, different angles, different expressions, and different lighting. Because the Laura learns exactly what you feed in. And the data set decides how real your AI influencer looks later. And as you see, our data set is on point. And if you want to know how to build the perfect AI data set, the full system with all prompts, caption files, and how we create Lena from scratch is inside our school community. Link for this is in the description. So here's the plan. First, we train our Laura with the AI toolkit on RunPod. Then we test the checkpoints with our Laura tester in ComfyUI. And at the end, we push it to a level where nobody can tell she's AI anymore. So time to train our Laura. For the training, we jump straight over to RunPod. And to be honest, this is the easy part. You rent a GPU by hour, and the whole training costs you maybe three to five bucks. For Create 2, you can grab an RTX 6000 Pro or RTX 5090. We go with the RTX 6000 Pro in this video. That is more than enough. Then we swap the template and take the official Ostris AI Toolkit template. That's the tool to train our Laura for us. And here it is very important. In the storage settings, we take the volume disk and not a network volume. We give it 150 gigs so we have room for all our checkpoints. And then we click deploy on demand at the bottom. Just give it a few minutes to boot. Then in the connect tab, we open the HTTP service link. And that drops us straight inside the AI Toolkit. And the password is by the way only password. Inside, we go to the data set tab, create a new data set, and name it Lena or whatever your creator is called. Then we drag and drop all 34 images together with the caption files and let it upload. Now our data set is in and we can set up our training. After that, we create a new job and name our Laura. For the trigger word, use one unique word. Something the model doesn't already know so it ties only to our Laura. For Lena, we take Lena written with an one instead of an I. And now comes the most important settings in this whole video. We set the model architecture to Create 2 and here you take raw, never turbo. Training on turbo ruins the quality so double check this one is in. We train on raw and later we generate on the turbo model. For the steps, we go with 3000 and the optimizer stays on Adam with the default learning rate. So quick tip, if you train on a 5090, set the batch size to one so it doesn't run out of memory. And everything else we keep also on default. Make sure the right data set is selected and set it up to save checkpoints along the way every 250 steps. And here comes a part where a lot people mess up. You have to set the max save is to something higher like 100. Otherwise, the toolkit deletes your old checkpoints while it trains. And at the end, we want all 12 of them, so we can pick the best one instead of just trusting the last. Then we hit create job, press play, and it's on. It downloads a few files, and then the training runs completely on its own. And heads up, a creative lower training usually takes a bit longer than on other models. So, we just let it cook and come back when it's done. Now the training is done, and we have now 12 checkpoints of our Lena LoRA. And this is where most people go wrong. They just grab the last one and hope the best. But the last checkpoint is not automatically the best one. Sometimes the LoRA is already overtrained at 3,000 steps, and the sweet spot sits somewhere around 2,000 to 3,000 steps. So, we download the last four checkpoints, and we test them properly. For the testing, we jump into ComfyUI on our RunPod template. I show you the exact setup in a minute. And here comes one of my favorite tools, our LoRA tester. And by the way, our LoRA tester is also waiting for you in our school community. The LoRA tester takes all your checkpoints and generates the same image with every single of them side by side in one grid. Same prompt, same seed, only the checkpoint changes. So, instead of guessing, we just look at the grid and see exactly which checkpoints keeps Lena's face the most stable. That's how you find the real winner in 2 minutes. In our case, LoRA number four wins, the one with the full 3,000 steps. So, this time the last checkpoint really was the best one. But you only know that when you test it. Lena looks exactly like Lena in every single test image. So, we take this one, and this is our LoRA for now. So, our LoRA is ready. Now comes the fun part. We generate Lena. Inside ComfyUI, we first upload our new Lena LoRA, and then we open our free master workflow. And it's super simple. We select our LoRA in the power loader, write a simple prompt with our trigger word Lena, and hit run. And look at that. That's Lena. First try, and she's already looking insane. And by the way, you get this workflow completely for free in our Discord. But, honestly, we can push this way more. And, this is where it gets really interesting, our premium workflow. One canvas, three workflows built in, and just toggle on the one you need. On top, we have the premium master, same idea as the free one, but with a light skin polish pass and a seed we are two upscaler at the end. So, we take the exact same prompt as before and let it run. Now, look at the difference. Same girl, same prompt, but the skin, the details, the sharpness, this is a completely different level. In the middle, we have the control net workflow. You give it any reference pose, and your influencer copies it exactly. I won't run it now, but it's sitting right there ready to go. And, at the bottom, our creator added workflow. I already loaded our example image in here. So, let's just change the hair color for demonstration with one simple prompt. Same influencer, same face, but now with a different hair color. And, only with one prompt. That's it. And, the best part, I keep extending this canvas over time. New workflows just drop in, and everyone inside gets them automatically. And, one more thing before we wrap this up. Crea 2 is open source, and it runs on your own machine. So, what you create with your influencer is completely up to you. And, if you actually serious about building an AI influencer, come over to our school community. That's where the whole premium stack lives, the premium studio workflow, the Laura tester, and the full data set system. And, like I promised at the start, you get the whole workflow for free. The free master workflow is waiting in our Discord. And, all links for that are in the description. If this video helped you, leave a like and subscribe. And, write in the comments what I should do next to help you make more money. So, see you in the next video. Bye.
