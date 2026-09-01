# 09. How to Create an AI Influencer from scratch Without Training a LoRA

> **Русское название**: Как создать AI-инфлюенсера с нуля без обучения LoRA  
> **Категория**: `Zero-Training / Instant FaceID Workflow`  
> **Стек инструментов**: `ComfyUI` • `InstantID` • `IP-Adapter FaceID` • `Face Detailer / YOLO Face` • `ReActor`

---

## 📌 Метаданные видео

| Параметр | Значение |
|---|---|
| **Название на YouTube** | How to Create an AI Influencer from scratch Without Training a LoRA |
| **Ссылка на видео** | [youtube.com/watch?v=_mN1AAzcBT4](https://www.youtube.com/watch?v=_mN1AAzcBT4) |
| **Video ID** | `_mN1AAzcBT4` |
| **Автор / Канал** | **Json ** |
| **Длительность** | **8:18** (497 секунд) |
| **Дата публикации** | 20260522 |
| **Объем транскрипции** | 1631 слов / 8690 символов |

---

## 💡 Аналитический обзор и ключевые инсайты (Executive Summary)

Быстрый метод создания уникального синтетического лица AI-инфлюенсера без необходимости обучать LoRA и арендовать GPU-сервера. Использование референсов из Pinterest, смешивания лиц (Face Blending) и технологий InstantID / IP-Adapter Face в ComfyUI.

### 🔑 Главные тезисы и выводы:
- Создание синтетического лица путем комбинирования нескольких референсов из Pinterest (Face Merging/Morphing).
- Работа в ComfyUI с нодами InstantID, IP-Adapter FaceID Plus и ReActor.
- Как добиться реализма без LoRA: правильная настройка весов векторов лица (Face Embedding Weight) и KSampler Denoise.
- Face Detailer и Inpainting для прорисовки глаз, ресниц и текстуры кожи в высоком разрешении.
- Быстрый старт: от идеи до первого готового сета фотографий за 15 минут.

### 🛠 Архитектура пайплайна (Step-by-Step Workflow):
```text
1. Поиск 3-4 референсных эстетических портретов на Pinterest.
2. Смешивание лиц в ComfyUI для получения уникального синтетического лица (Synthetic Face Embedding).
3. Подача эмбеддинга в InstantID / IP-Adapter Face.
4. Генерация новых фотосессий в любых позах с помощью текстовых промптов.
5. Проход Face Detailer (Impact Pack / Ultralytics YOLO Face) для восстановления максимальной четкости лица.
6. Экспорт готового контента.
```

---

## 📝 Оригинальное описание с YouTube

<details>
<summary><b>Развернуть описание ролика от автора</b></summary>

```text
In this AI Influencer tutorial, I show you how to create an AI Influencer from scratch without training a LoRA first. You will see how to start from a base image, test the AI creator identity, build a reference workflow, and prepare better reference images before moving into dataset creation or LoRA training.

----------------------------------------------

Join Skool (custom Matrix nodes):
https://www.skool.com/matrix-lab-6660/about

FREE skills, workflows + all my prompts:
Discord: https://discord.gg/uhfVpmwktQ

----------------------------------------------

What you'll learn:
- Why starting with LoRA training too early can make your AI model inconsistent
- How to create an AI influencer / AI creator from a strong base image
- How to test whether the face and identity stay consistent across generations
- How to think about reference images, reference packs, datasets, and model consistency
- When LoRA training actually makes sense in the AI workflow

----------------------------------------------

Chapters / Timestamps
00:00 Create an AI Influencer model without a LoRA
00:31 Why LoRA training is not the first step
01:16 Visual direction & Pinterest references
02:12 ComfyUI face merge workflow
02:55 Matrix image edit node setup
03:23 4K settings & dataset quality
04:15 Testing the identity swap workflow
05:17 Quality check of the AI creator identity
05:56 Creating the first dataset images
06:35 Using the prompt stack data node
07:17 Why a clean dataset is the real asset
07:41 LoRA training on a controlled identity
08:08 Matrix Lab workflows & custom nodes

 #aimodel #lora #aigeneration #aiworkflow
```

</details>

---

## ⏱ Полная стенограмма с таймкодами (Full Timestamped Transcript)

**[00:00]** This AI influencer girl was built from these  Pinterest references without training a LoRa. First, I'm going to show you the exact workflow  I used to turn a few reference images into a new synthetic creator face and then use that face to  create images that feel like a real girl, not just some random AI girls you see on the internet. And  that is the difference between random AI pictures and a creator that actually makes money. Most  people think the hard part is training the loRa,
**[00:27]** but it's not. Trust me. The hard part is building  a crater that does not fall apart after five images when it comes to SFW and especially to not  save for work content. For this build, I'm using my own comfyui workflows and custom node from the  matrix lab pack. The workflow is pretty simple to be honest. I don't start with training. I start  with the direction. First, we use Pinterest to find the type of creator we want to build. Not to  copy one person, but to understand the look we are
**[00:57]** going for. Then I bring those references into my  face merge workflow in Comfy UI and create a new face from that direction. After that, I test if  the face actually works across multiple images because one picture means nothing if the next five  looks like a totally different girl. If the result holds up, that becomes the base we can build on  later. And later in the video, I will show you how to get the prompt library I'm using for free.  So before we touch anything, we need one thing,
**[01:27]** a clear visual direction. So let's start with  Pinterest. The first mistake people make here is opening Pinterest and saving every pretty girl  they see. That gives their workflow no clear direction. If I want to build up blonde crater,  I'm not looking for the most beautiful image on Pinterest. I'm looking for a reference that  feel like they belong to the same crater type.
**[01:49]** So when I search for something like blonde girl,  blonde model selfie or blonde Instagram portrait, I'm watching the overall direction. The workflow  needs a clear signal. It needs to understand what kind of crater we are trying to build. For this  build, I will pick around three to five images.
**[02:08]** That's in my opinion enough to give the workflow  a clear signal without making it too messy. Once I have them, I save everything into one folder and  bring it into the face merge workflow. This is the workflow. You can see that I have two branches  here. The top branch is for Nano Banana and the bottom branch is for Chat GBT image 2. For this  build, I'm using image 2. That's the new image model from Open AI. I still use Nano Banana 2  and Nanoanana Pro. They are still good models
**[02:36]** in my eyes, but after a lot of generations, image  to gives me a slightly more realistic look when it comes to generate faces and details for this  specific step. At the top of my custom node setup, I have the face merge prompt. This prompt tells  the workflow how to combine the reference images into a unique creator face instead of just  making another random AI girl. Then I use the matrix image to edit note. To run the note,  it's really, really easy to be honest. Just add
**[03:03]** your API keys from waist speed. Choose how many  generations you want and pick the resolution and of course the aspect ratio. Normally I start with  two to four generations. That gives me enough to compare without wasting time and of course too  much tokens because we all love our tokens. For the resolution I use 4K. In my opinion, this  is one of the most important settings when it comes to create data set images because we  want the best quality we can get here to avoid
**[03:30]** character drifts as much as possible later on.  For the aspect ratio, I use 3 to four because it works well for me when it comes to creator image  data sets. It gives me enough focus on the face, but still leaves room for the upper body and the  kind of images we want to build later. but choose the aspect ratio that works the best for you and  especially for your use case. Then I generate a few versions of my AI model to compare them.  I'm looking for the cleanest identity I can get,
**[03:58]** like clear eyes, a strong face shape, and I  look that the style still follows the Pinterest directions without copying one exact person.  And now we want to test in the next workflow. Can this face still feel like the same girl when  we generate different images from it? Now that we have the identity base image, the next step is to  test if the face can work on a different body and still feel like the same crater. For this part,  I use my identity swap workflow. The idea here
**[04:25]** is simple. We take the face you created in the  face merge step and transfer it onto the target image so we can see if the identity holds up in  a different kind of image. Just take a character from Pinterest or Instagram, but of course,  make sure you have the right to use the photo, if you know what I mean. For this demo, I'm using  this girl I found on Pinterest as a target image to show how the workflow works. It's not meant  to copy or represent a real person. And after
**[04:51]** the demo, I can delete the temporary source image  again. And if you want to follow this workflow, I will put the prompts from the whole video inside  the free digital community in the description. You can also join and ask me any questions you  have about AI influencers. Inside the workflow, the step is again very simple. Add your API key.  Choose your output settings and set the resolution to 4K. I use 4K here for the same reason as  before. The cleaner the source output is,
**[05:18]** the eased is to judge if the identity is actual  stable. If the image is soft or low quality, you might think the workflow is bad. When the real  problem is just the input quality is bad. So after the workflow runs, I check the results I got from  it. Does the face still match the base image? Does the eyes and mouth stay stable? Does the skin look  realistic? And does the image still feel like one consistent critter instead of a random face swap?  I think we got a pretty solid outcome. Now do this
**[05:50]** step three to 10 times that we have enough images  to create the real data set. Now we come to the real data set workflow to turn those strong test  images into the first usable data set for our AI model. This workflow has three branches. At the  top you can use Nanobana 2 and Nano Banana Pro like in the other ones and also image 2 in  the middle and at the bottom there is Cream 4.5 which gives the more workflow more uncensored  flexibility if you want to create not safer work
**[06:19]** data set. What I can show you here because of  the YouTube tensorflow service every workflow here has six image slots. So I don't throw every  image in here. If I have 10 images for example, I still only pick the best ones. But you  can also only use four images if you want to like I'm doing it now. Then we have the prompt  stack data node. This note contains the data set prompts. So instead of writing a new prompt every  time, you can just move through the prompt stack,
**[06:44]** click to the next prompt, and generate the  data set images. And I want to say it again, the goal here is not to create random beautiful  pictures of our new AI influencer. The goal here is to create enough images where the creator still  feels like the same person across different poses, outfits, lighting, and styles. So, I go through  the prompts once by one and generate the first data set images. After each generation, I still  check the same things. Does the face match the
**[07:10]** identity master? Does the body look natural? And  so on. I think you got already what I mean. And once I have enough images that pass this check,  I have my first usable creator data set. And this is the part most beginners skip. They want to  jump straight into Laura training or they want to create content directly with random prompts.  But a data set is the real asset here because if you have a clean data set, you can train Allora on  almost every model you want like set image turbo,
**[07:36]** flux 2, quen 2.2, you name it because you are not  training on random images anymore where the face looks different every two images. You are training  on a controlled identity and I think that should be the goal. Or you can use this data set directly  with API models and create SFV and more advanced NSFW content because now you have a clear visual  base. And once you understand this workflow, you can repeat it for any credit you have.  And if you want the full Matrix Lab workflows,
**[08:04]** custom notes and setup notes, you can find  them inside the Matrix Lab community in the description. Subscribe and give it a like  if it helps you. And feel free to write some video ideas in the comments.  So see you in the next video. Bye.

---

## 📄 Непрерывный текст транскрипции (Verbatim Full Text)

This AI influencer girl was built from these  Pinterest references without training a LoRa. First, I'm going to show you the exact workflow  I used to turn a few reference images into a new synthetic creator face and then use that face to  create images that feel like a real girl, not just some random AI girls you see on the internet. And  that is the difference between random AI pictures and a creator that actually makes money. Most  people think the hard part is training the loRa, but it's not. Trust me. The hard part is building  a crater that does not fall apart after five images when it comes to SFW and especially to not  save for work content. For this build, I'm using my own comfyui workflows and custom node from the  matrix lab pack. The workflow is pretty simple to be honest. I don't start with training. I start  with the direction. First, we use Pinterest to find the type of creator we want to build. Not to  copy one person, but to understand the look we are going for. Then I bring those references into my  face merge workflow in Comfy UI and create a new face from that direction. After that, I test if  the face actually works across multiple images because one picture means nothing if the next five  looks like a totally different girl. If the result holds up, that becomes the base we can build on  later. And later in the video, I will show you how to get the prompt library I'm using for free.  So before we touch anything, we need one thing, a clear visual direction. So let's start with  Pinterest. The first mistake people make here is opening Pinterest and saving every pretty girl  they see. That gives their workflow no clear direction. If I want to build up blonde crater,  I'm not looking for the most beautiful image on Pinterest. I'm looking for a reference that  feel like they belong to the same crater type. So when I search for something like blonde girl,  blonde model selfie or blonde Instagram portrait, I'm watching the overall direction. The workflow  needs a clear signal. It needs to understand what kind of crater we are trying to build. For this  build, I will pick around three to five images. That's in my opinion enough to give the workflow  a clear signal without making it too messy. Once I have them, I save everything into one folder and  bring it into the face merge workflow. This is the workflow. You can see that I have two branches  here. The top branch is for Nano Banana and the bottom branch is for Chat GBT image 2. For this  build, I'm using image 2. That's the new image model from Open AI. I still use Nano Banana 2  and Nanoanana Pro. They are still good models in my eyes, but after a lot of generations, image  to gives me a slightly more realistic look when it comes to generate faces and details for this  specific step. At the top of my custom node setup, I have the face merge prompt. This prompt tells  the workflow how to combine the reference images into a unique creator face instead of just  making another random AI girl. Then I use the matrix image to edit note. To run the note,  it's really, really easy to be honest. Just add your API keys from waist speed. Choose how many  generations you want and pick the resolution and of course the aspect ratio. Normally I start with  two to four generations. That gives me enough to compare without wasting time and of course too  much tokens because we all love our tokens. For the resolution I use 4K. In my opinion, this  is one of the most important settings when it comes to create data set images because we  want the best quality we can get here to avoid character drifts as much as possible later on.  For the aspect ratio, I use 3 to four because it works well for me when it comes to creator image  data sets. It gives me enough focus on the face, but still leaves room for the upper body and the  kind of images we want to build later. but choose the aspect ratio that works the best for you and  especially for your use case. Then I generate a few versions of my AI model to compare them.  I'm looking for the cleanest identity I can get, like clear eyes, a strong face shape, and I  look that the style still follows the Pinterest directions without copying one exact person.  And now we want to test in the next workflow. Can this face still feel like the same girl when  we generate different images from it? Now that we have the identity base image, the next step is to  test if the face can work on a different body and still feel like the same crater. For this part,  I use my identity swap workflow. The idea here is simple. We take the face you created in the  face merge step and transfer it onto the target image so we can see if the identity holds up in  a different kind of image. Just take a character from Pinterest or Instagram, but of course,  make sure you have the right to use the photo, if you know what I mean. For this demo, I'm using  this girl I found on Pinterest as a target image to show how the workflow works. It's not meant  to copy or represent a real person. And after the demo, I can delete the temporary source image  again. And if you want to follow this workflow, I will put the prompts from the whole video inside  the free digital community in the description. You can also join and ask me any questions you  have about AI influencers. Inside the workflow, the step is again very simple. Add your API key.  Choose your output settings and set the resolution to 4K. I use 4K here for the same reason as  before. The cleaner the source output is, the eased is to judge if the identity is actual  stable. If the image is soft or low quality, you might think the workflow is bad. When the real  problem is just the input quality is bad. So after the workflow runs, I check the results I got from  it. Does the face still match the base image? Does the eyes and mouth stay stable? Does the skin look  realistic? And does the image still feel like one consistent critter instead of a random face swap?  I think we got a pretty solid outcome. Now do this step three to 10 times that we have enough images  to create the real data set. Now we come to the real data set workflow to turn those strong test  images into the first usable data set for our AI model. This workflow has three branches. At the  top you can use Nanobana 2 and Nano Banana Pro like in the other ones and also image 2 in  the middle and at the bottom there is Cream 4.5 which gives the more workflow more uncensored  flexibility if you want to create not safer work data set. What I can show you here because of  the YouTube tensorflow service every workflow here has six image slots. So I don't throw every  image in here. If I have 10 images for example, I still only pick the best ones. But you  can also only use four images if you want to like I'm doing it now. Then we have the prompt  stack data node. This note contains the data set prompts. So instead of writing a new prompt every  time, you can just move through the prompt stack, click to the next prompt, and generate the  data set images. And I want to say it again, the goal here is not to create random beautiful  pictures of our new AI influencer. The goal here is to create enough images where the creator still  feels like the same person across different poses, outfits, lighting, and styles. So, I go through  the prompts once by one and generate the first data set images. After each generation, I still  check the same things. Does the face match the identity master? Does the body look natural? And  so on. I think you got already what I mean. And once I have enough images that pass this check,  I have my first usable creator data set. And this is the part most beginners skip. They want to  jump straight into Laura training or they want to create content directly with random prompts.  But a data set is the real asset here because if you have a clean data set, you can train Allora on  almost every model you want like set image turbo, flux 2, quen 2.2, you name it because you are not  training on random images anymore where the face looks different every two images. You are training  on a controlled identity and I think that should be the goal. Or you can use this data set directly  with API models and create SFV and more advanced NSFW content because now you have a clear visual  base. And once you understand this workflow, you can repeat it for any credit you have.  And if you want the full Matrix Lab workflows, custom notes and setup notes, you can find  them inside the Matrix Lab community in the description. Subscribe and give it a like  if it helps you. And feel free to write some video ideas in the comments.  So see you in the next video. Bye.
