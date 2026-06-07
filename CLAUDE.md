# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

DWords — 将单词以弹幕形式显示在屏幕上的桌面应用，用于辅助背单词。基于 Electron + Vue 2 + Bootstrap 5 + SQLite。

仓库：`github.com/wofa24/Dwords`（原项目 `luyuhuang/DWords2`）

## 常用命令

```bash
yarn build          # 编译 Vue 模板 → renderer/
yarn start          # build + electron .（开发模式启动）
yarn pack           # build + electron-builder 打包到 dist/
yarn serve          # Vue dev server（仅前端热重载，不含 Electron）
```

## 双安装架构

本机存在两份 DWords：

| 位置 | 用途 |
|------|------|
| `D:\claude\DWords\` | **源码**，修改代码在这里 |
| `C:\Users\air\AppData\Local\Programs\dwords2\resources\app\` | **已安装版**，平时运行的这个 |

数据统一存储在 `~/.DWords2/user.db`，两份共用一个数据库。

修改代码后的部署流程：
```bash
yarn build
cp src/ipc.js "C:/Users/air/AppData/Local/Programs/dwords2/resources/app/src/"
cp src/danmaku.js "C:/Users/air/AppData/Local/Programs/dwords2/resources/app/src/"
cp -r renderer/* "C:/Users/air/AppData/Local/Programs/dwords2/resources/app/renderer/"
# migration 文件也要复制
cp migrations/*.sql "C:/Users/air/AppData/Local/Programs/dwords2/resources/app/migrations/"
```

然后重启 DWords（系统托盘退出后重新打开）。

## 架构

### 进程模型

标准 Electron 双进程架构：

- **主进程** `src/main.js` → `src/dwords.js`：初始化数据库、设置 IPC、创建窗口、启动弹幕定时器
- **渲染进程**：每个窗口独立加载 `renderer/*.html`（由 `templates/` 编译而来）

### 窗口类型

| 窗口 | title | 创建方式 |
|------|-------|---------|
| 主窗口 | `DWords` | `createMainWindow()` 加载 `renderer/home.html` |
| 弹幕窗口 | `Danmaku` | `createDanmaku()` 加载 `renderer/danmaku.html`，每个单词一个独立小窗口 |
| 显示区域 | `Display-area` | `openDisplayArea()` 加载 `renderer/displayArea.html` |

### IPC 注册机制 (`src/dwords.js:117-125`)

遍历 `ipc.js` 导出的所有函数，按类型自动注册：
- **async function** → `ipcMain.handle(channel, f)`（渲染端用 `invoke`）
- **普通 function** → `ipcMain.on(channel, f)`（渲染端用 `send`）

所有 IPC 函数已绑定 `dwords` 对象为 `this`。

### 数据库

三份 SQLite 数据库，均通过 `src/database.js` 访问：

| 数据库 | 路径 | 内容 |
|--------|------|------|
| user.db | `~/.DWords2/user.db` | 用户数据：plans、words、settings、migrations |
| dict.db | `assets/data/dict.db` | 内置词典（en-en, en-zh） |
| rich_dict.db | `assets/data/rich_dict.db` | 教材词库（81 本教材），`scripts/build-rich-dict.cjs` 构建 |

### words 表结构（迁移后）

`plan_id, word, time, paraphrase, show_paraphrase, color, status, version, deleted, memorized_at, appear_count`

- `status`: 0 = 未记住（Current），1 = 已记住（Memorized）
- `memorized_at`: 标记记住时的时间戳
- `appear_count`: 弹幕出现次数计数器

### 弹幕系统 (`src/danmaku.js`)

- `setDanmakuLauncher` 定时从 Current 单词中随机选取，创建弹幕窗口
- `setDanmakuMover` 每 20ms 移动所有弹幕窗口从右到左
- 弹幕窗口到达显示区域左边界后自动关闭

### 前端路由

Vue Router hash 模式：`#/` → Home, `#/plans` → Plans, `#/settings` → Settings

Home 页包含 Search、Table、SideBar 三个子组件，Tab 切换（Current/Planning/Memorized/All）通过 `currentTab` 控制显示内容。

### 设置系统 (`src/settings.js`)

`watchSettings(dwords, key, callback)` 监听设置变更，设置持久化在 user.db 的 `settings` 表。

### Vue 页面入口 (`vue.config.js`)

4 个多页入口：home、danmaku、about、displayArea。模板在 `templates/`，编译输出到 `renderer/`。`renderer/` 已从 `.gitignore` 移除，直接包含在仓库中。
