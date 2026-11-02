---
draft: false
title: 语音朗读
description: 使用内置 TTS 功能朗读书籍。
---

## 使用 TTS

1. 打开一本书
2. 点击工具栏的**喇叭图标**或按 TTS 快捷键
3. ReadAny 将从当前位置开始朗读

## 控制

- **播放/暂停** — 切换 TTS 播放
- **停止** — 停止并重置 TTS
- **语速** — 调整朗读速度（0.5x 到 3x）
- **跳转** — 按句子前进或后退

## TTS 设置

在**设置 → 语音朗读**中配置：

- **语音** — 选择系统可用的语音
- **语速** — 默认朗读速度
- **自动翻页** — 自动翻页并继续朗读

## 平台说明

| 平台 | TTS 引擎 |
|---|---|
| macOS | 系统语音合成（高质量） |
| Windows | Microsoft Speech API |
| Linux | speech-dispatcher |
| iOS/Android | 平台原生 TTS |
