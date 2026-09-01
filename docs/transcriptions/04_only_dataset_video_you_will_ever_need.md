# 04. The ONLY Dataset Video You Will Ever Need for AI Influencers (FREE WORKFLOW)

> **Русское название**: Единственное видео по датасетам для AI-инфлюенсеров: От 5 фото до полного обучающего набора  
> **Категория**: `Dataset Engineering & LoRA Training`  
> **Стек инструментов**: `JoyCaption / Florence-2` • `AI-Toolkit` • `Kohya_ss` • `ComfyUI` • `Flux / SDXL LoRA`

---

## 📌 Метаданные видео

| Параметр | Значение |
|---|---|
| **Название на YouTube** | The ONLY Dataset Video You Will Ever Need for AI Influencers (FREE WORKFLOW) |
| **Ссылка на видео** | [youtube.com/watch?v=rbBNEVyQyyk](https://www.youtube.com/watch?v=rbBNEVyQyyk) |
| **Video ID** | `rbBNEVyQyyk` |
| **Автор / Канал** | **Json ** |
| **Длительность** | **8:53** (533 секунд) |
| **Дата публикации** | 20260731 |
| **Объем транскрипции** | 2106 слов / 10690 символов |

---

## 💡 Аналитический обзор и ключевые инсайты (Executive Summary)

Полное руководство по созданию профессионального обучающего датасета для тренировки LoRA. Превращение 4-5 исходных фотографий в структурированный набор из 30-50+ изображений с идеальным балансом ракурсов, эмоций, одежды, освещения и правильным автокэпшенингом.

### 🔑 Главные тезисы и выводы:
- Формула идеального датасета: 30% крупные планы (портреты), 40% поясные планы (medium shot), 30% полный рост (full body).
- Вариативность: разные типы освещения (golden hour, studio, indoor flash, cloudy day) и фонов для предотвращения переобучения (overfitting).
- Очистка и кадрирование: разрешения (1024x1024, 768x1024, 1024x1536) и удаление артефактов кожи/глаз.
- Стратегия кэпшенинга (Captions): использование JoyCaption / Florence-2 / Claude для разделения триггер-слова и описания окружения.
- Подготовка структуры папок для Kohya_ss / AI-Toolkit / RunPod.

### 🛠 Архитектура пайплайна (Step-by-Step Workflow):
```text
1. Отбор 3-5 эталонных изображений персонажа.
2. Синтетическое размножение датасета через Face-Swap + Inpainting (генерация новых локаций и поз).
3. Фильтрация и отбраковка неудачных генераций (руки, глаза, асимметрия).
4. Кроппинг и нормализация размеров под мульти-аспектные бакеты (Aspect Ratio Bucketing).
5. Автоматическая генерация текстовых описаний (.txt) через VLM с удалением описания неизменных черт лица.
6. Экспорт готового датасета для LoRA обучения.
```

---

## 📝 Оригинальное описание с YouTube

<details>
<summary><b>Развернуть описание ролика от автора</b></summary>

```text
Four pictures are enough to build a complete AI influencer dataset — face, body and real life, in any generator. In this video, I show you the exact three-stage system I use to take Lina from 4 starting images to a training-ready dataset: build the face, lock the body, then move her into real life. At the end you get my complete ComfyUI dataset workflow with Nano Banana and the full prompt system.

----------------------------------------------

Join Skool (full dataset system, LoRA tester + premium workflows):
https://www.skool.com/matrix-lab-6660/about

FREE skills, workflows + all my prompts:
Discord: https://discord.gg/uhfVpmwktQ

Generate your dataset (Nano Banana on WaveSpeed):
https://wavespeed.ai/?ref=matrix

Matrix Power Nodes (free ComfyUI nodes for the workflow):
https://github.com/JsonMatrixLab/matrix-power-nodes

----------------------------------------------

What you'll learn:
- How to turn 4 starting pictures into a complete, training-ready AI influencer dataset
- Why identity never goes into your prompts — the one rule that keeps your character consistent
- How to build the face first: one variable at a time, angles and expressions on grey
- How to lock the body with reference-based locks and capture full + close rotations in one outfit
- How to leave the studio and shoot believable real-life Instagram shots without breaking identity
- Why this ladder works in any generator — and how the free ComfyUI workflow automates it with Nano Banana

----------------------------------------------

Chapters / Timestamps
00:00 The only AI influencer dataset you'll ever need
00:28 Lina: from 4 pictures to a full dataset
00:57 What a real dataset actually is
01:51 The free workflow + the full path (Skool)
02:14 The one prompt rule: identity stays out
03:09 Part 1: The face (angles + expressions)
04:19 Part 2: The body (lock + rotations)
05:31 Part 3: Real life (Instagram conditions)
06:40 The free ComfyUI dataset workflow (Nano Banana)
08:36 From 4 pictures to a training-ready dataset

#aiinfluencer #comfyui #nanobanana #aimodel
```

</details>

---

## ⏱ Полная стенограмма с таймкодами (Full Timestamped Transcript)

**[00:00]** Most people have four or five pictures of their AI influencer and no idea how to get from there to a real dataset. And in this video, I show you the exact system we use to turn a handful of pictures into a complete, training-ready-to-use dataset. No matter if you have five Instagram shots or just one single face picture.
**[00:17]** And the dataset does not care what you train it on later. That part is completely up to you. And everything we see today, the full prompt system and the ComfyUI workflow, you get complete for free at the end of this video. Okay, let's get straight into it. This is Lina, our AI influencer for this video.
**[00:32]** And these four pictures here are everything we start with. One clean, one clean studio shot of her face and three random phone pictures. And if you have an AI, and if you have an AI influencer, you probably have exactly that.
**[00:42]** And whatever you build with her later, it all comes out of one folder. But four pictures are not the data set. Here is the part almost nobody talks about.
**[00:50]** You never generate everything out of these four pictures. You start with the face, and every step after that you use what you just made. This is a finished dataset, and this is not a folder with nice pictures of her, this is one whole person from every side. The first part here is their face from every angle, and these are not nice portraits, this is the geometry of their face,
**[01:09]** in every position a camera can stand in. And these are her expressions. And these are her expressions, smiling, mouth open, eyes closed, and looking away. And then comes her body, upper body from every side, and after that the full body from every side.
**[01:22]** And at the end comes the — and at the end comes the real-life pics, just normal pictures of her in a real room, to add the hyper — to add the hyper-realistic Instagram effect to the dataset. and if one of these — and if one of these parts is missing, you will feel it later, in every image you ever make with her. And you don't need hundreds of pictures for this, what matters is that every part is covered. And if you train a LoRA on this later,
**[01:46]** 25 to 36 good ones beat 75 messy ones every time. And before we go into the prompts, one quick thing. Everything in this video is free, and at the end you get the whole CompTIA workflow and prompt system on top, so the only thing I want from you is a like and a nice comment.
**[02:03]** And if you are really serious about building AI influencers and you want the whole path, not just one piece of it, then come over to our Skool community. That is where we go way deeper than I can ever go here on YouTube.
**[02:14]** Okay, now every picture in the data set comes from one prompt, and there's one rule for all of them. Get this one wrong, and nothing else will save you. There are these are, these are the prompts for her face, and I want you to look one thing.
**[02:25]** Look at her hair color. There is none. Not in this one, and not in any of the prompts. Because identity never goes into the prompt. These pictures say who she is, the prompt only says where she is, and how it is shot. The moment you write blonde, the moment you write blonde hair into a prompt, the moment you write blonde hair into a prompt, that prompt only works for blondes. Leave it out, and the
**[02:43]** same prompt builds a data set for every character you will ever make. And there's and there's exactly one exception, and there's exactly one exception, and you can see it right here. Keep the same eye color as in the reference images. This is not a description. That points back at your own pictures. So models drift, some models drift by the eye color, so we lock it in. And that is the difference
**[03:01]** that keeps it safe, and that is the difference that keeps it safe for every AI influencer. Because the look never says what her eyes look like, it only says don't change them.
**[03:08]** And everything here comes out of that one studio picture of her face. So if you don't have one yet, that is the first thing you make, and you make clean with nothing else in the frame. Now let's look at her face, because her face has to teach two things.
**[03:19]** The first one are the angles, so she is — now, now let's look at her face, because her face has to teach two things. The first one are the angles, so who she is from every side, and, and her, and there, and there her face stays neutral, because only the camera moves. And the second one are her expressions, so what her face can actually do. And there the camera stands front out, because now only her face moves. But never both in the same picture,
**[03:40]** because you have to be able to see what changed between the shots. If the camera moves and her face moves at the same time, you cannot tell if the mouse looks different because of the angle or because she is smiling.
**[03:53]** And one quick tip on the background. Take gray and not white, because white flattens the skin, and that is where plastic look starts. And there's one more thing, but that one does not go into the data set. That is one single picture with all her expressions in a grid, and we only build that when we want to make videos with her. So the video model has her whole range in one reference.
**[04:09]** And that is her face done, and these pictures are now our references for the body. Now her body. And this is where it gets interesting. And Lina already has body pictures. But if all you have is a face, then there is no body yet. And the image model just invents one.
**[04:29]** And here comes the most important part of this whole video. The first body picture you accept is her body from now on. Everything after that has to match it. So take your time with this one. And from there we — and from there we log it in. Same proportion as in the reference pictures in every single prompt. Because a lot of models make her smaller or bigger on their own without asking. And sometimes the model still does its own thing and then you just run it one more time.
**[04:55]** And that same log also works the other way around. So you can make her curvier or slimmer or a lot more than that. But this is a thing for our Skool community, not for YouTube if you know what I mean.
**[05:07]** Then we turn her all the way around. From the front to the back. And the outfit stays the same the whole way. Because otherwise it's not a rotation, it is just five different photos. And then the same position again, only frame closer. Because later you will want her in a full body shot and in a tight one. And she has to hold up in both. And that is her body done.
**[05:27]** And with that we have her completely from every side. And now we finally take care all of the studio, because everything we did until here was clean and controlled. And that is exactly what makes an AI girl look like an AI girl.
**[05:41]** And these are the pictures you probably already have a few of, because that is what Instagram photos are. What you, what you were missing the whole time is the studio. So now we just take normal Instagram pictures of her, and what matters here is not the post, it is how the picture was taken.
**[05:55]** Blurry phone shots and razor sharp ones, selfies and normal, and you, and you really want to mix in here. Blurry phone shots and razor sharp ones, selfies and normal pictures. Some of them with the flash one, some in daylight, and some in a dark room at night to give the dataset a bit variation.
**[06:08]** Basically exactly what a normal Instagram girl has on her feed. And here is where a lot of people mess up, because they make this way, and here is where a lot of people mess up, because they make this way too nice. A picture that looks planned is just a studio again with the bedroom behind it.
**[06:20]** But cheap looking is not the same as broken, and you still have to be able to tell that is her. And if you cannot tell, then it does not go into the dataset of course. Because if you train on this later, the LoRA just copies what you gave in.
**[06:33]** And that is the whole dataset. The studio gave us who she is and real live gives us how she actually looks. And that is the whole dataset.
**[06:40]** And everything you just saw we did by head, one prompt at a time, and that is exactly how you should learn it. But this is what it looks like when you don't have to. This is the workflow we built exactly for this, and every card in here is one picture of the data set. 25 of them, a whole face set and a whole body set.
**[06:58]** the reference slot — and on the left are the — and on the left are the reference slots, and these are the same four pictures we started with. Eight of them, but only the first one is — eight of them, but only the first one is required.
**[07:06]** And that one — and that one always has to be the studio picture of your face. And up here on the right side is her face, and down here is her body, and every single shot has its own switch. So you can run — so — so you can run one of them, or one — so you can run one of them, or one whole row, or all of it.
**[07:20]** color locked. And now let's open one of these prompts, because this is the part I actually want you to see. There is the gray background, and there is the eye color locked. And there's no hair color anywhere in it.
**[07:30]** And you can even change the prompt to whatever you want. That is the same rule — that is the same rule from the beginning of this video, and it's sitting inside the tool, which means this workflow does not be — which means this workflow does not belong to Lina, it works with every character you will ever build. And you don't need a GPU for this, because it runs over the WaveSpeed API. You can pick
**[07:48]** between Nano Banana Pro, Nano Banana 2, and GPT Image 2. And there's one switch in here called Live. As long as it's off, nothing else gets sent, and nothing gets paid. So you can click around in here without burning a cent.
**[08:02]** And that is your whole studio in one file, and you get it all for free. workflow and our own custom nodes that run it, and you — the workflow and our own custom nodes that run it, and you find both of them in our Discord. And you find both of them in our Discord. The link is in the description down below. And these are the dataset scenes, so everything the Studio Park needs.
**[08:18]** everything past that we build is inside our Skool community. And this is where we take you all the way to a finished creator.
**[08:25]** just don't have — and this is why we did the long way first, because now you don't just have the pictures, you know exactly why every single one of them is there. And that's — and that is it. That is the whole system.
**[08:35]** You came in with four pictures, and now you know exactly what to do with them. And like I promised, everything from today is free and waiting in our Discord. So if this video helped you, subscribe and write me a nice comment what I should build next, because that is literally how I pick the next video.
**[08:50]** So see you in next video. Bye.

---

## 📄 Непрерывный текст транскрипции (Verbatim Full Text)

Most people have four or five pictures of their AI influencer and no idea how to get from there to a real dataset. And in this video, I show you the exact system we use to turn a handful of pictures into a complete, training-ready-to-use dataset. No matter if you have five Instagram shots or just one single face picture. And the dataset does not care what you train it on later. That part is completely up to you. And everything we see today, the full prompt system and the ComfyUI workflow, you get complete for free at the end of this video. Okay, let's get straight into it. This is Lina, our AI influencer for this video. And these four pictures here are everything we start with. One clean, one clean studio shot of her face and three random phone pictures. And if you have an AI, and if you have an AI influencer, you probably have exactly that. And whatever you build with her later, it all comes out of one folder. But four pictures are not the data set. Here is the part almost nobody talks about. You never generate everything out of these four pictures. You start with the face, and every step after that you use what you just made. This is a finished dataset, and this is not a folder with nice pictures of her, this is one whole person from every side. The first part here is their face from every angle, and these are not nice portraits, this is the geometry of their face, in every position a camera can stand in. And these are her expressions. And these are her expressions, smiling, mouth open, eyes closed, and looking away. And then comes her body, upper body from every side, and after that the full body from every side. And at the end comes the — and at the end comes the real-life pics, just normal pictures of her in a real room, to add the hyper — to add the hyper-realistic Instagram effect to the dataset. and if one of these — and if one of these parts is missing, you will feel it later, in every image you ever make with her. And you don't need hundreds of pictures for this, what matters is that every part is covered. And if you train a LoRA on this later, 25 to 36 good ones beat 75 messy ones every time. And before we go into the prompts, one quick thing. Everything in this video is free, and at the end you get the whole CompTIA workflow and prompt system on top, so the only thing I want from you is a like and a nice comment. And if you are really serious about building AI influencers and you want the whole path, not just one piece of it, then come over to our Skool community. That is where we go way deeper than I can ever go here on YouTube. Okay, now every picture in the data set comes from one prompt, and there's one rule for all of them. Get this one wrong, and nothing else will save you. There are these are, these are the prompts for her face, and I want you to look one thing. Look at her hair color. There is none. Not in this one, and not in any of the prompts. Because identity never goes into the prompt. These pictures say who she is, the prompt only says where she is, and how it is shot. The moment you write blonde, the moment you write blonde hair into a prompt, the moment you write blonde hair into a prompt, that prompt only works for blondes. Leave it out, and the same prompt builds a data set for every character you will ever make. And there's and there's exactly one exception, and there's exactly one exception, and you can see it right here. Keep the same eye color as in the reference images. This is not a description. That points back at your own pictures. So models drift, some models drift by the eye color, so we lock it in. And that is the difference that keeps it safe, and that is the difference that keeps it safe for every AI influencer. Because the look never says what her eyes look like, it only says don't change them. And everything here comes out of that one studio picture of her face. So if you don't have one yet, that is the first thing you make, and you make clean with nothing else in the frame. Now let's look at her face, because her face has to teach two things. The first one are the angles, so she is — now, now let's look at her face, because her face has to teach two things. The first one are the angles, so who she is from every side, and, and her, and there, and there her face stays neutral, because only the camera moves. And the second one are her expressions, so what her face can actually do. And there the camera stands front out, because now only her face moves. But never both in the same picture, because you have to be able to see what changed between the shots. If the camera moves and her face moves at the same time, you cannot tell if the mouse looks different because of the angle or because she is smiling. And one quick tip on the background. Take gray and not white, because white flattens the skin, and that is where plastic look starts. And there's one more thing, but that one does not go into the data set. That is one single picture with all her expressions in a grid, and we only build that when we want to make videos with her. So the video model has her whole range in one reference. And that is her face done, and these pictures are now our references for the body. Now her body. And this is where it gets interesting. And Lina already has body pictures. But if all you have is a face, then there is no body yet. And the image model just invents one. And here comes the most important part of this whole video. The first body picture you accept is her body from now on. Everything after that has to match it. So take your time with this one. And from there we — and from there we log it in. Same proportion as in the reference pictures in every single prompt. Because a lot of models make her smaller or bigger on their own without asking. And sometimes the model still does its own thing and then you just run it one more time. And that same log also works the other way around. So you can make her curvier or slimmer or a lot more than that. But this is a thing for our Skool community, not for YouTube if you know what I mean. Then we turn her all the way around. From the front to the back. And the outfit stays the same the whole way. Because otherwise it's not a rotation, it is just five different photos. And then the same position again, only frame closer. Because later you will want her in a full body shot and in a tight one. And she has to hold up in both. And that is her body done. And with that we have her completely from every side. And now we finally take care all of the studio, because everything we did until here was clean and controlled. And that is exactly what makes an AI girl look like an AI girl. And these are the pictures you probably already have a few of, because that is what Instagram photos are. What you, what you were missing the whole time is the studio. So now we just take normal Instagram pictures of her, and what matters here is not the post, it is how the picture was taken. Blurry phone shots and razor sharp ones, selfies and normal, and you, and you really want to mix in here. Blurry phone shots and razor sharp ones, selfies and normal pictures. Some of them with the flash one, some in daylight, and some in a dark room at night to give the dataset a bit variation. Basically exactly what a normal Instagram girl has on her feed. And here is where a lot of people mess up, because they make this way, and here is where a lot of people mess up, because they make this way too nice. A picture that looks planned is just a studio again with the bedroom behind it. But cheap looking is not the same as broken, and you still have to be able to tell that is her. And if you cannot tell, then it does not go into the dataset of course. Because if you train on this later, the LoRA just copies what you gave in. And that is the whole dataset. The studio gave us who she is and real live gives us how she actually looks. And that is the whole dataset. And everything you just saw we did by head, one prompt at a time, and that is exactly how you should learn it. But this is what it looks like when you don't have to. This is the workflow we built exactly for this, and every card in here is one picture of the data set. 25 of them, a whole face set and a whole body set. the reference slot — and on the left are the — and on the left are the reference slots, and these are the same four pictures we started with. Eight of them, but only the first one is — eight of them, but only the first one is required. And that one — and that one always has to be the studio picture of your face. And up here on the right side is her face, and down here is her body, and every single shot has its own switch. So you can run — so — so you can run one of them, or one — so you can run one of them, or one whole row, or all of it. color locked. And now let's open one of these prompts, because this is the part I actually want you to see. There is the gray background, and there is the eye color locked. And there's no hair color anywhere in it. And you can even change the prompt to whatever you want. That is the same rule — that is the same rule from the beginning of this video, and it's sitting inside the tool, which means this workflow does not be — which means this workflow does not belong to Lina, it works with every character you will ever build. And you don't need a GPU for this, because it runs over the WaveSpeed API. You can pick between Nano Banana Pro, Nano Banana 2, and GPT Image 2. And there's one switch in here called Live. As long as it's off, nothing else gets sent, and nothing gets paid. So you can click around in here without burning a cent. And that is your whole studio in one file, and you get it all for free. workflow and our own custom nodes that run it, and you — the workflow and our own custom nodes that run it, and you find both of them in our Discord. And you find both of them in our Discord. The link is in the description down below. And these are the dataset scenes, so everything the Studio Park needs. everything past that we build is inside our Skool community. And this is where we take you all the way to a finished creator. just don't have — and this is why we did the long way first, because now you don't just have the pictures, you know exactly why every single one of them is there. And that's — and that is it. That is the whole system. You came in with four pictures, and now you know exactly what to do with them. And like I promised, everything from today is free and waiting in our Discord. So if this video helped you, subscribe and write me a nice comment what I should build next, because that is literally how I pick the next video. So see you in next video. Bye.
