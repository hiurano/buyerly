# 08. Create an Ultra Realistic AI Influencer From Scratch (LoRa + FREE Workflow)

> **Русское название**: Создание ультрареалистичного AI-инфлюенсера с нуля (LoRA + Бесплатный пайплайн)  
> **Категория**: `End-to-End Influencer Creation & LoRA`  
> **Стек инструментов**: `Flux.1 Dev` • `AI-Toolkit` • `ComfyUI` • `RunPod` • `LoRA Fine-tuning`

---

## 📌 Метаданные видео

| Параметр | Значение |
|---|---|
| **Название на YouTube** | Create an Ultra Realistic AI Influencer From Scratch (LoRa + FREE Workflow) |
| **Ссылка на видео** | [youtube.com/watch?v=xgVLleA0yZM](https://www.youtube.com/watch?v=xgVLleA0yZM) |
| **Video ID** | `xgVLleA0yZM` |
| **Автор / Канал** | **Json ** |
| **Длительность** | **6:04** (363 секунд) |
| **Дата публикации** | 20260608 |
| **Объем транскрипции** | 1360 слов / 6987 символов |

---

## 💡 Аналитический обзор и ключевые инсайты (Executive Summary)

Полный практический курс по созданию стабильного AI-инфлюенсера с нуля: от генерации уникального синтетического лица до обучения собственной LoRA и запуска генераций в ComfyUI. Решение проблемы «разных лиц на каждой картинке».

### 🔑 Главные тезисы и выводы:
- Почему просто промптов недостаточно: необходимость обучения LoRA для коммерческого качества и стабильности.
- Создание синтетического уникального лица (Seed Generation), не существующего в реальном мире.
- Генерация обучающего набора и очистка от визуального мусора.
- Обучение LoRA: пошаговая конфигурация конфига AI-Toolkit (Learning Rate 1e-4, Rank 16, Batch Size 1, Resolution 1024).
- Инференс в ComfyUI: сборка рабочего графа для мгновенной генерации фотосессий.

### 🛠 Архитектура пайплайна (Step-by-Step Workflow):
```text
1. Разработка концепта персонажа и генерация 5-10 базовых мастер-кадров.
2. Расширение датасета до 25-35 разноплановых снимков.
3. Написание текстовых кэпшенов с уникальным триггером (например, `ohwx woman`).
4. Запуск обучения LoRA в AI-Toolkit (локально или на RunPod / Google Colab).
5. Тестирование чекпоинтов LoRA (эпохи 500, 1000, 1500, 2000) на оверфиттинг.
6. Запуск продакшн-генераций в ComfyUI с LoRA Loader.
```

---

## 📝 Оригинальное описание с YouTube

<details>
<summary><b>Развернуть описание ролика от автора</b></summary>

```text
In this video, I show you how to train a hyper realistic character LoRA on Z-Image Turbo and turn a dataset into one consistent AI influencer. We train the LoRA with AI Toolkit on RunPod, load it into my free ComfyUI workflow on a one click template, and push the realism with style LoRAs, same AI influencer in every single image.

----------------------------------------------

Join Skool (Ashley + premium workflows):
https://www.skool.com/matrix-lab-6660/about

FREE skills, workflows + all my prompts:
Discord: https://discord.gg/uhfVpmwktQ

Train your LoRA (RunPod):
https://runpod.io?ref=upkpysv6

----------------------------------------------

What you'll learn:
- How to build a LoRA dataset that doesn't look like AI (studio + amateur mix)
- How to train a Z-Image Turbo LoRA with AI Toolkit on RunPod
- Why 3000 steps and a unique trigger word matter for Turbo models
- How to pick the right checkpoint instead of trusting the last one
- How to push the realism with style LoRAs and my free ComfyUI workflow

----------------------------------------------

Chapters / Timestamps
00:00 Create an ultra realistic AI influencer with a LoRA
00:28 Why the dataset decides your LoRA quality
01:05 Dataset mix: studio + amateur images
01:45 RunPod setup & AI Toolkit template
02:25 Uploading the dataset to AI Toolkit
02:50 LoRA training settings (Z-Image Turbo, trigger word, 3000 steps)
03:50 Start training + check the samples
04:15 Picking the best checkpoints
04:40 One-click RunPod template (everything preinstalled)
05:25 Uploading the character LoRA via Jupyter
05:50 First generation with the character LoRA
06:20 More realism with style LoRAs (Realistic Snapshot)
06:55 Premium master workflow: skin + hand detailer & upscaler
07:30 Ashley free + workflows (Skool)

#aiinfluencer #lora #aimodel #comfyui #aigeneration
```

</details>

---

## ⏱ Полная стенограмма с таймкодами (Full Timestamped Transcript)

**[00:00]** If you're trying to build a consistent AI influencer and every single image looks like a completely different girl, this is exactly the video you need. I'm going to show you the exact workflow I use to train one stable character that stays the same by training a hyper realistic LoRa.
**[00:14]** And if you watch till the end of the video, I will show you how to get the whole exact workflow I use complete for free.
**[00:20]** The workflow is simple. We don't start with training, we start with the data set. Most people want to jump straight into training, but a LoRa is only as good as the data set under it for Ashley, I'm using 34 images of the same character from different angles and poses,
**[00:35]** so the model only learns one identity and nothing else. And here's the part where most people go wrong. They just train on a raw data set.
**[00:43]** I mix it up. Some are clean for the sharp detail, and some are blurry phone style shots for the hyper realistic look.
**[00:49]** The more types of images you feed in, the more flexibility the LoRa gets. If you want to go fully Pro mode, you train a separate LoRa for separate jobs, for example one for selfies, one for NSFW, and so on for one solid all round character.
**[01:03]** This mix is enough. Once the data set is ready, we take it straight into RunPod and start the training.
**[01:09]** And if you want to see how I build Ashley from scratch, the face and the base images, then go watch my last video. You can also find data set prompts for free in my discord channel.
**[01:18]** For the training we jump over to RunPod. And to be honest, this is the easiest part ever. You just rent a GPU, let it run for about an hour and a half and you're out for under five bucks.
**[01:27]** We spin up our new pod and grab the RTX 5090. Don't overthink the GPU here. This one is more than enough for what we are doing.
**[01:35]** Then we swap the template search AI toolkit and take the verified one. Give the volume disk 150 gigs. So we've got room for the checkpoints and click Deploy on Demand.
**[01:44]** Give it a minute to boot. Then over in the connect tab, the access pops up and we open the HTTP service link that drops us straight inside the AI toolkit.
**[01:53]** And the password is, by the way, just literally only password. Inside we go to the Data set tab, create a new data set and name it. Then we drag in all 34 images and let it upload.
**[02:04]** Now our data set is in and we set up the training. After that we create a new job and name our LoRa. For the trigger word.
**[02:10]** We use one unique word, something the model doesn't already know, so it ties only to our LoRa. Newer models don't really need a trigger word anymore, but I still like to keep one in.
**[02:19]** Then we set the model architecture to the Z-Image-turbo, and also set the max step input to 30 to speed up the training a bit. And by the way, let me know in the comments what kind of lower training videos you want to see.
**[02:31]** And when we done this, we keep the steps at 3000 for efficient Z-Image-turbo Lora. That part matters because you don't want to over train or overfit a turbo model. Make also sure the right data set is selected and tell it to save the checkpoints along the way so we can pick the best one later instead of just trusting the last turn.
**[02:49]** Also off in the resolution section 512 and 768, because we only want the best quality, and that's the reason why we keep only 1080. Then turn on, skip the first sample and keep the last three prompts.
**[03:01]** After we set it everything up, we hit create job, press play and it's on it. It download a few files, gives you an estimate and runs for about an hour and a half.
**[03:10]** Once the training is done, we go through the checkpoints. I don't know the last 3 to 5 LoRa's to have a good selection where I can pick the best LoRa out of it.
**[03:18]** Now we need to generate our AI influencer with our new LoRa. I build it a free public RunPod template for exactly this. You just need to select your GPU you want to use taking 4090 or 5090.
**[03:30]** Click on Change Template and browse the template with the name MATRIX - Z Image Turbo template. Then you select the template and in the storage configuration select also Volume Disk.
**[03:39]** I've also posted a RunPod template link in my discord with my free master comfyui workflow. After you've done this easy steps, you hit deploy and everything is already on the pod.
**[03:48]** You just have to wait a few minutes after you click deployed because the template is booting and pulling the docker image on the pot is already the z image to model the Vaes and the encoders and the decoders and so on.
**[03:59]** You don't have to download anything anymore. The only thing that's not on there is your character, LoRa. To add your LoRa its really easy.
**[04:06]** Just open the Jupyter notebook on the port 8888 and navigate to LoRa's. After you in the LoRas folder, just drag and drop your LoRa in the jupyter notebook and click Upload Inside comfyui we open the free master workflow and select our LoRa in the power loader.
**[04:19]** Right a simple prompt with your trigger word and hit run. Look at the result. I think it's okay, but it can be done much better.
**[04:25]** The LoRa is doing exactly what we trained for and to be fair, this image is already good, but we can push the realism way more. Here's the thing on the RunPod template I already added a few LoRa's for you.
**[04:36]** Nothing to download. They are also already on the pod. The two I use the most is the realistic snapshot. LoRa and the nice girls ultra real LoRa, big credits to the creators.
**[04:44]** They are both insane. For this one we go with the realistic snapshot because for me it's the best realism.
**[04:49]** LoRa for Z image turbo right now. So we set it up with our character LoRa and click generate. Again, look at the different same girl.
**[04:56]** But now it looks way better in my opinion. And if you think that looks good, there's one more level to step up. This is my premium master workflow.
**[05:03]** It runs the full pipeline in basically one click with a skin and hand detailer built in, plus an upscale at the end. And honestly, this is about the best you can get out of Z Image Turbo right now, or at least very close to it.
**[05:15]** So don't forget the Z image Turbo is an open source model running on your own pod or your own machine, so what you create with the model is up to you, and you can create literally everything with it.
**[05:24]** And when I say everything, I mean everything, if you know what I mean. And if you actually serious about building an AI influencer, you can come over to my skool community.
**[05:32]** That's where you get the premium master workflow and way more. And on top of that, you get Ashley completely included in the community. The full data set of Ashley ready to use, and you can do whatever you want with her.
**[05:43]** So you've basically got an ready to use creator and you could start fanvue today and that's it. That's the whole workflow. All links for that are in the description.
**[05:50]** So there's really nothing stopping you from building your own AI influencer today. If this will you help you leave a like and subscribe and drop a comment with what you'd like to see next so I can help you exactly with that.
**[06:01]** So see you in the next video. Bye.

---

## 📄 Непрерывный текст транскрипции (Verbatim Full Text)

If you're trying to build a consistent AI influencer and every single image looks like a completely different girl, this is exactly the video you need. I'm going to show you the exact workflow I use to train one stable character that stays the same by training a hyper realistic LoRa. And if you watch till the end of the video, I will show you how to get the whole exact workflow I use complete for free. The workflow is simple. We don't start with training, we start with the data set. Most people want to jump straight into training, but a LoRa is only as good as the data set under it for Ashley, I'm using 34 images of the same character from different angles and poses, so the model only learns one identity and nothing else. And here's the part where most people go wrong. They just train on a raw data set. I mix it up. Some are clean for the sharp detail, and some are blurry phone style shots for the hyper realistic look. The more types of images you feed in, the more flexibility the LoRa gets. If you want to go fully Pro mode, you train a separate LoRa for separate jobs, for example one for selfies, one for NSFW, and so on for one solid all round character. This mix is enough. Once the data set is ready, we take it straight into RunPod and start the training. And if you want to see how I build Ashley from scratch, the face and the base images, then go watch my last video. You can also find data set prompts for free in my discord channel. For the training we jump over to RunPod. And to be honest, this is the easiest part ever. You just rent a GPU, let it run for about an hour and a half and you're out for under five bucks. We spin up our new pod and grab the RTX 5090. Don't overthink the GPU here. This one is more than enough for what we are doing. Then we swap the template search AI toolkit and take the verified one. Give the volume disk 150 gigs. So we've got room for the checkpoints and click Deploy on Demand. Give it a minute to boot. Then over in the connect tab, the access pops up and we open the HTTP service link that drops us straight inside the AI toolkit. And the password is, by the way, just literally only password. Inside we go to the Data set tab, create a new data set and name it. Then we drag in all 34 images and let it upload. Now our data set is in and we set up the training. After that we create a new job and name our LoRa. For the trigger word. We use one unique word, something the model doesn't already know, so it ties only to our LoRa. Newer models don't really need a trigger word anymore, but I still like to keep one in. Then we set the model architecture to the Z-Image-turbo, and also set the max step input to 30 to speed up the training a bit. And by the way, let me know in the comments what kind of lower training videos you want to see. And when we done this, we keep the steps at 3000 for efficient Z-Image-turbo Lora. That part matters because you don't want to over train or overfit a turbo model. Make also sure the right data set is selected and tell it to save the checkpoints along the way so we can pick the best one later instead of just trusting the last turn. Also off in the resolution section 512 and 768, because we only want the best quality, and that's the reason why we keep only 1080. Then turn on, skip the first sample and keep the last three prompts. After we set it everything up, we hit create job, press play and it's on it. It download a few files, gives you an estimate and runs for about an hour and a half. Once the training is done, we go through the checkpoints. I don't know the last 3 to 5 LoRa's to have a good selection where I can pick the best LoRa out of it. Now we need to generate our AI influencer with our new LoRa. I build it a free public RunPod template for exactly this. You just need to select your GPU you want to use taking 4090 or 5090. Click on Change Template and browse the template with the name MATRIX - Z Image Turbo template. Then you select the template and in the storage configuration select also Volume Disk. I've also posted a RunPod template link in my discord with my free master comfyui workflow. After you've done this easy steps, you hit deploy and everything is already on the pod. You just have to wait a few minutes after you click deployed because the template is booting and pulling the docker image on the pot is already the z image to model the Vaes and the encoders and the decoders and so on. You don't have to download anything anymore. The only thing that's not on there is your character, LoRa. To add your LoRa its really easy. Just open the Jupyter notebook on the port 8888 and navigate to LoRa's. After you in the LoRas folder, just drag and drop your LoRa in the jupyter notebook and click Upload Inside comfyui we open the free master workflow and select our LoRa in the power loader. Right a simple prompt with your trigger word and hit run. Look at the result. I think it's okay, but it can be done much better. The LoRa is doing exactly what we trained for and to be fair, this image is already good, but we can push the realism way more. Here's the thing on the RunPod template I already added a few LoRa's for you. Nothing to download. They are also already on the pod. The two I use the most is the realistic snapshot. LoRa and the nice girls ultra real LoRa, big credits to the creators. They are both insane. For this one we go with the realistic snapshot because for me it's the best realism. LoRa for Z image turbo right now. So we set it up with our character LoRa and click generate. Again, look at the different same girl. But now it looks way better in my opinion. And if you think that looks good, there's one more level to step up. This is my premium master workflow. It runs the full pipeline in basically one click with a skin and hand detailer built in, plus an upscale at the end. And honestly, this is about the best you can get out of Z Image Turbo right now, or at least very close to it. So don't forget the Z image Turbo is an open source model running on your own pod or your own machine, so what you create with the model is up to you, and you can create literally everything with it. And when I say everything, I mean everything, if you know what I mean. And if you actually serious about building an AI influencer, you can come over to my skool community. That's where you get the premium master workflow and way more. And on top of that, you get Ashley completely included in the community. The full data set of Ashley ready to use, and you can do whatever you want with her. So you've basically got an ready to use creator and you could start fanvue today and that's it. That's the whole workflow. All links for that are in the description. So there's really nothing stopping you from building your own AI influencer today. If this will you help you leave a like and subscribe and drop a comment with what you'd like to see next so I can help you exactly with that. So see you in the next video. Bye.
