# 07. Build a Complete AI Character Dataset From Just 3 Photos

> **Русское название**: Создание полного датасета AI-персонажа всего из 3 фотографий  
> **Категория**: `Dataset Engineering & Claude Workflows`  
> **Стек инструментов**: `Claude 3.5 Sonnet` • `Flux.1` • `Midjourney` • `ComfyUI` • `Face Consistency Workflow`

---

## 📌 Метаданные видео

| Параметр | Значение |
|---|---|
| **Название на YouTube** | Build a Complete AI Character Dataset From Just 3 Photos |
| **Ссылка на видео** | [youtube.com/watch?v=nWlLlnjWC6k](https://www.youtube.com/watch?v=nWlLlnjWC6k) |
| **Video ID** | `nWlLlnjWC6k` |
| **Автор / Канал** | **Json ** |
| **Длительность** | **7:57** (476 секунд) |
| **Дата публикации** | 20260614 |
| **Объем транскрипции** | 1674 слов / 8705 символов |

---

## 💡 Аналитический обзор и ключевые инсайты (Executive Summary)

Пошаговый метод генерации высококачественного датасета из 30+ согласованных фотографий одной и той же AI-девушки на основе всего 3 исходных изображений с помощью диалога с Claude и мощных генераторов изображений.

### 🔑 Главные тезисы и выводы:
- Декомпозиция лица в Claude: подробное биометрическое описание (разрез глаз, форма бровей, носогубные складки, пропорции губ, овал лица).
- Создание постоянного 'Master Prompt' (мастер-промпта), фиксирующего внешность персонажа в любых декорациях.
- Генерация матрицы вариаций: смена одежды (casual, gym, evening dress), локаций (coffee shop, beach, city street, bedroom) и эмоций.
- Отбор и валидация изображений на консистентность перед обучением модели.
- Полный процесс создания персонажа занимает менее 10 минут.

### 🛠 Архитектура пайплайна (Step-by-Step Workflow):
```text
1. Загрузка 3 референсных фото персонажа в Claude.
2. Запрос к Claude на составление детального описания внешности (Feature Extraction & Master Prompt).
3. Генерация сетки из 30-50 промптов для различных сцен и ракурсов.
4. Пакетная генерация изображений в Flux / Midjourney / ComfyUI.
5. Face-Swap / Inpainting коррекция для гарантированного совпадения черт лица.
6. Сборка готовой папки датасета.
```

---

## 📝 Оригинальное описание с YouTube

<details>
<summary><b>Развернуть описание ролика от автора</b></summary>

```text
In this video, I show you how to build a complete AI influencer with Claude. Using two skills I built for Claude, I create a full Instagram feed of a consistent AI creator and a complete character dataset, just by chatting with Claude. Same AI influencer in every single image.

----------------------------------------------

Join Skool (Julia + Ashley + the advanced skills):
https://www.skool.com/matrix-lab-6660/about

FREE skills, workflows + all my prompts:
Discord: https://discord.gg/uhfVpmwktQ

----------------------------------------------

What you'll learn:
- How to build a consistent AI influencer with Claude (no ComfyUI, no GPU, no LoRA)
- How to generate a full Instagram feed of your character from one single prompt
- How to build a complete character dataset (face, emotions, 360°) from just 3 photos
- How the anchor system keeps the exact same face in every single image

----------------------------------------------

Chapters / Timestamps
00:00 Build a complete AI influencer with Claude
00:25 The two skills (Instagram + dataset)
00:55 A full Instagram feed from one prompt
02:30 What it really costs (WaveSpeed vs Kie.ai)
03:05 Setup: installing both skills (every click)
05:10 A complete character dataset from just 3 photos
06:35 Julia + Ashley & the money part (Skool)
07:15 Customizing the skills with Claude

#aiinfluencer #claude #aimodel #aigeneration
```

</details>

---

## ⏱ Полная стенограмма с таймкодами (Full Timestamped Transcript)

**[00:00]** I built this AI influencer was Claude, and girls like her are making people tousends every month Every single one of these photos is the same girl, all made with one prompt. And I did the whole thing just by chatting with claude in everything I used to build here in under five minutes.
**[00:15]** You will get it in this video, complete for free The whole thing runs on two skills I built for Claude. And the best part? You can use them with basically any AI agent you want One creator Instagram content just by chatting with Claude, and the other one builds the entire database on automode But before I show you how to set it all up, let me just show you what these skills actually do.
**[00:36]** First we create Julias Instagram content. And I only need one simple prompt for that I basically tell Claude only give me ten Instagram posts of my character.
**[00:46]** It has to look like a real Instagram feed post, not a photo shoot. Use nanobanana pro 4K resolution and a 3 to 4 aspect ratio.
**[00:54]** Show me your plan and your total price first and don't start before I say go By the way, all the prompts are used in this video are my discord.
**[01:01]** Everything for free. But more on at the end of this video And from here Claude takes over and do everything on auto mode Claude shows in the plan we can generate ten posts for under three bucks, and from here he does everything by himself.
**[01:13]** So I just type. Go Now comes the part I really like while the batch is running. Claude takes every finished image and compares the face against my face anchor.
**[01:22]** And if one of them drifts off and looks different, like the face, for example, he just regenerates the picture automatically. until I have exactly the ten posts I orderd And at the very end, the skill runs one last pass over all the images, and the pass makes every picture look like it came straight from a phone camera.
**[01:38]** Now look at this. This is the result Claude gives me after he generates all the ten pictures. I tested it with over 30 pictures of her and the face broke exactly zero times. It's the same goal in every single post. And Julia herself remember her face. Because at the end of this video, I tell you how you can get her.
**[01:56]** Okay. You've just seen what these skills can do. Now let me show you how to set them up yoursel You only do this once and I will show you every single click so nobody gets lost After you download the skills, you have two zip files.
**[02:08]** Just unzip them, double click and you get two normal folders. I will also provide the normal folder so everyone can do this One is the Instagram engine skill and the other one is the data set builder skill Now we bring them to claude.
**[02:20]** Open your file window and go to your home folder. That's the one with your username on The folder we need is called dot claude and it's hidden on Mac.
**[02:27]** Inside the dot claude a folder called skills. If it's not, they are just create it Right click new folder and name it skills.
**[02:33]** Now drag both skills folders in there Then restart the claude app and claude knows that both skills exist Next we need the API key.
**[02:40]** The images are made by an image model and that runs through wavespeed This gives Claude the ability to generate images. Go to the official wavespeed side and create a free account.
**[02:49]** Go to API keys. Create one and copy it The link for this is also in the describtion in each skill folder there's a file called dot .env It basically means environment and all save stuff is stored there.
**[03:00]** Open it past your secret API key and click save or Command S to save the API key list in this file You never paste it into any AI or public chat to stay save Then put about $10 on the account and you just saw it. The whole feed was only about three bucks.
**[03:15]** $10 covers everything we build today easily. And the now important part you characters pictures. The best face photo goes into the face folder That's the most important file in the whole system, because every single generation starts from it
**[03:27]** To create a consistent AI influencer, body shots go into the body folder, if you have no idea what goes where, there's an unsorted folder for everything in claude looks at every picture and sourts them by itself The consistent identity never comes from the prompt
**[03:43]** It comes from these anchor folders, so make sure to provide the best pictures you have in these folders. And the last step before we can run it, you open the claude app and click on the code symbol on the right top corner.
**[03:54]** That's the mode where claude can actually work on your computer, because the normal chat can't do that Then it asks you for a folder and you can just pick the skills for you. the one inside the dot claude So claude works directly with both skills.
**[04:07]** and that's the whole setup. You just do this once and from now on it's just chatting with claude All right. Now you set everything up correctly. But now comes the part for everyone who's really serious about this business.
**[04:19]** Because Instagram posts are nice, but the real money sits one level deeper Maybe you want to make a move in videos all you want to train your own LoRa on so she stays consistent forever.
**[04:30]** And maybe you want to go uncensored with open source models like flux, z-image-turbo, and so Because no image API will let you do that in a good way For all that you need one thing a complete data set for your character.
**[04:45]** that's exactly what the second skill builds. And to show you it works with any character. I built a completely fresh one This is Lisa. And these three photos are everything I have from here So I put the three pictures of her into the anchor's folder.
**[04:59]** The best face photo goes into the face folder and the other two into the body and the styles folder. You know already how it works.
**[05:05]** Then I go back to the same chat we don't need a new session. we can do all this in the same chat I just tell Claude.
**[05:12]** I have a new character named Lisa. Only three pictures of her are in the anchors folder Build me the complete dataset Face portrais the emotion grid and a full 360 view Use Nano Banana Pro
**[05:23]** 4K resolution and a 3 to 4 aspect ratio. Show me the plan and the cost first. And watch what happens.
**[05:30]** Claude switches to the data set skill completely on its own and shows me the plan So I just type go again And now Claude built the whole dataset by himself.
**[05:38]** He generates the face pictures, then the emotion grid with different expressions, and then the full 360 rotation of her after a few minutes later, the whole thing is done Now look at this data set. It's the same girl from every single angle.
**[05:52]** that's exactly the part. We build this whole data set in a few minutes with claude with only one prompt.
**[05:58]** And you can do this with any character you have. build a data set with one prompt in a few minutes. So from three photos to a complete character data set if you watch my last two videos,
**[06:09]** you know what I always say The data set is the asset. Because from here you can train a loRa on any model you do whatever you want with her And remember those photos from the very beginning of the video.
**[06:21]** That's all built with this exact system. So Claude creats her Claude keeps her consistent and claude makes all of her content.
**[06:29]** But here's the thing. I didn't tell you Julia, the girl you just watched the beginning of this video. You get here in my skool her complete character data set ready to use, and you can do whatever you want with her
**[06:41]** And off top of that you also get Ashley, the girl I built in my last two videos. So you don't even have to build your own influencer.
**[06:48]** You can literally start posting today. and my skool is also where all my premium stuff lives like the advanced workflows from my last two videos.
**[06:57]** You know, the ones I can show here on YouTube and everything. I build new drops in their first.
**[07:02]** The link for that is in the description. And before we come to the end, I have to show you one more thing about the two skills you get to day Because they are not some locked app a skill is basically just a folder with instructions
**[07:13]** and claude can read them which means claude can also rewrite them let's say you want a complete different style of photos.
**[07:20]** You don't code anything. You literally tell claude only change the skill. So it does this and that.
**[07:26]** And claude rebuilds its own tool So you're not downloading a product here. You're downloading the foundation. And with claude you can change it, improve it and build whatever you want on top of it And like I promised, both skills are completely for free in my Discord
**[07:40]** in my last two videos, I build all of this the pro way with comfyUI and a trained LoRa. And today Claude did the whole thing on its own So if this video helped you leave a like and subscribe
**[07:50]** write me in the comments. What video should I do next to help you make more money So see you in the next video. Bye!

---

## 📄 Непрерывный текст транскрипции (Verbatim Full Text)

I built this AI influencer was Claude, and girls like her are making people tousends every month Every single one of these photos is the same girl, all made with one prompt. And I did the whole thing just by chatting with claude in everything I used to build here in under five minutes. You will get it in this video, complete for free The whole thing runs on two skills I built for Claude. And the best part? You can use them with basically any AI agent you want One creator Instagram content just by chatting with Claude, and the other one builds the entire database on automode But before I show you how to set it all up, let me just show you what these skills actually do. First we create Julias Instagram content. And I only need one simple prompt for that I basically tell Claude only give me ten Instagram posts of my character. It has to look like a real Instagram feed post, not a photo shoot. Use nanobanana pro 4K resolution and a 3 to 4 aspect ratio. Show me your plan and your total price first and don't start before I say go By the way, all the prompts are used in this video are my discord. Everything for free. But more on at the end of this video And from here Claude takes over and do everything on auto mode Claude shows in the plan we can generate ten posts for under three bucks, and from here he does everything by himself. So I just type. Go Now comes the part I really like while the batch is running. Claude takes every finished image and compares the face against my face anchor. And if one of them drifts off and looks different, like the face, for example, he just regenerates the picture automatically. until I have exactly the ten posts I orderd And at the very end, the skill runs one last pass over all the images, and the pass makes every picture look like it came straight from a phone camera. Now look at this. This is the result Claude gives me after he generates all the ten pictures. I tested it with over 30 pictures of her and the face broke exactly zero times. It's the same goal in every single post. And Julia herself remember her face. Because at the end of this video, I tell you how you can get her. Okay. You've just seen what these skills can do. Now let me show you how to set them up yoursel You only do this once and I will show you every single click so nobody gets lost After you download the skills, you have two zip files. Just unzip them, double click and you get two normal folders. I will also provide the normal folder so everyone can do this One is the Instagram engine skill and the other one is the data set builder skill Now we bring them to claude. Open your file window and go to your home folder. That's the one with your username on The folder we need is called dot claude and it's hidden on Mac. Inside the dot claude a folder called skills. If it's not, they are just create it Right click new folder and name it skills. Now drag both skills folders in there Then restart the claude app and claude knows that both skills exist Next we need the API key. The images are made by an image model and that runs through wavespeed This gives Claude the ability to generate images. Go to the official wavespeed side and create a free account. Go to API keys. Create one and copy it The link for this is also in the describtion in each skill folder there's a file called dot .env It basically means environment and all save stuff is stored there. Open it past your secret API key and click save or Command S to save the API key list in this file You never paste it into any AI or public chat to stay save Then put about $10 on the account and you just saw it. The whole feed was only about three bucks. $10 covers everything we build today easily. And the now important part you characters pictures. The best face photo goes into the face folder That's the most important file in the whole system, because every single generation starts from it To create a consistent AI influencer, body shots go into the body folder, if you have no idea what goes where, there's an unsorted folder for everything in claude looks at every picture and sourts them by itself The consistent identity never comes from the prompt It comes from these anchor folders, so make sure to provide the best pictures you have in these folders. And the last step before we can run it, you open the claude app and click on the code symbol on the right top corner. That's the mode where claude can actually work on your computer, because the normal chat can't do that Then it asks you for a folder and you can just pick the skills for you. the one inside the dot claude So claude works directly with both skills. and that's the whole setup. You just do this once and from now on it's just chatting with claude All right. Now you set everything up correctly. But now comes the part for everyone who's really serious about this business. Because Instagram posts are nice, but the real money sits one level deeper Maybe you want to make a move in videos all you want to train your own LoRa on so she stays consistent forever. And maybe you want to go uncensored with open source models like flux, z-image-turbo, and so Because no image API will let you do that in a good way For all that you need one thing a complete data set for your character. that's exactly what the second skill builds. And to show you it works with any character. I built a completely fresh one This is Lisa. And these three photos are everything I have from here So I put the three pictures of her into the anchor's folder. The best face photo goes into the face folder and the other two into the body and the styles folder. You know already how it works. Then I go back to the same chat we don't need a new session. we can do all this in the same chat I just tell Claude. I have a new character named Lisa. Only three pictures of her are in the anchors folder Build me the complete dataset Face portrais the emotion grid and a full 360 view Use Nano Banana Pro 4K resolution and a 3 to 4 aspect ratio. Show me the plan and the cost first. And watch what happens. Claude switches to the data set skill completely on its own and shows me the plan So I just type go again And now Claude built the whole dataset by himself. He generates the face pictures, then the emotion grid with different expressions, and then the full 360 rotation of her after a few minutes later, the whole thing is done Now look at this data set. It's the same girl from every single angle. that's exactly the part. We build this whole data set in a few minutes with claude with only one prompt. And you can do this with any character you have. build a data set with one prompt in a few minutes. So from three photos to a complete character data set if you watch my last two videos, you know what I always say The data set is the asset. Because from here you can train a loRa on any model you do whatever you want with her And remember those photos from the very beginning of the video. That's all built with this exact system. So Claude creats her Claude keeps her consistent and claude makes all of her content. But here's the thing. I didn't tell you Julia, the girl you just watched the beginning of this video. You get here in my skool her complete character data set ready to use, and you can do whatever you want with her And off top of that you also get Ashley, the girl I built in my last two videos. So you don't even have to build your own influencer. You can literally start posting today. and my skool is also where all my premium stuff lives like the advanced workflows from my last two videos. You know, the ones I can show here on YouTube and everything. I build new drops in their first. The link for that is in the description. And before we come to the end, I have to show you one more thing about the two skills you get to day Because they are not some locked app a skill is basically just a folder with instructions and claude can read them which means claude can also rewrite them let's say you want a complete different style of photos. You don't code anything. You literally tell claude only change the skill. So it does this and that. And claude rebuilds its own tool So you're not downloading a product here. You're downloading the foundation. And with claude you can change it, improve it and build whatever you want on top of it And like I promised, both skills are completely for free in my Discord in my last two videos, I build all of this the pro way with comfyUI and a trained LoRa. And today Claude did the whole thing on its own So if this video helped you leave a like and subscribe write me in the comments. What video should I do next to help you make more money So see you in the next video. Bye!
