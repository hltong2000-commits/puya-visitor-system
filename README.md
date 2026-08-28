---
tags: [访客系统, 项目入口]
created: 2026-08-28
updated: 2026-08-28
type: README
author: Codex
source_primary: "用户需求与已确认设计"
source_url: ""
verified_date: 2026-08-28
data_quality: "内部方案"
---

# 普冉半导体外来客户访客系统知识库

本 Vault 用于沉淀普冉半导体外来客户扫码登记系统的业务、产品、技术、安全和实施信息。

## 快速入口

- [[00-MOC/访客系统总览]]
- [[01-业务方案/访客登记业务流程]]
- [[02-产品设计/H5登记页设计]]
- [[03-技术方案/系统架构]]
- [[05-实施路线/分阶段实施计划]]

## 当前边界

- 独立 Web/H5，客户通过现场固定二维码进入。
- 使用者允许使用手机设备扫码，直接通过手机浏览器完成登记，无需电脑或 App。
- 首版只做登记，不做员工审核、门禁联动和客户账号注册。
- 登记成功后只显示成功提示，前台通过后台列表查询。
- 登记字段采用精简版：姓名、手机号、公司、被访人、来访事由、同行人数、车牌号（选填）。

## 状态

| 项目 | 状态 |
| --- | --- |
| 方案设计 | 已确认 |
| 知识库 | 已创建 |
| 软件开发 | MVP 已完成，Vercel + Neon 试用环境已部署 |
| 现场试点 | 云端联调通过，待前台试用 |

## 本地运行

```powershell
$env:ADMIN_PASSWORD = "请替换为强密码"
npm start
```

- 手机登记页：`http://localhost:3000/`
- 后台：`http://localhost:3000/admin`
- 默认管理员账号：`admin`
- 生产环境必须设置 `ADMIN_PASSWORD`，并通过 HTTPS 反向代理发布。
- 页面已使用普冉半导体 LOGO：`public/assets/puya-logo.png`。

## 云端试用部署

- 手机登记页：<https://puya-visitor-system.vercel.app/>
- 后台入口：<https://puya-visitor-system.vercel.app/admin>
- 健康检查：<https://puya-visitor-system.vercel.app/api/health>
- 固定二维码：`public/assets/visitor-registration-qr.png`

本项目支持两种数据库模式：本机未设置 `DATABASE_URL` 时使用 SQLite；设置 `DATABASE_URL` 后自动使用 PostgreSQL。Vercel 部署请配合 Supabase、Neon 等 PostgreSQL 服务，不能把 SQLite 文件作为云端长期数据存储。

1. 在 Supabase 或 Neon 创建数据库，复制连接串 `DATABASE_URL`。
2. 在 Vercel 导入 GitHub 仓库 `hltong2000-commits/puya-visitor-system`。
3. Vercel 会读取 [`vercel.json`](E:/Codex/07_个人工作台/访客系统/vercel.json)，将请求交给 `api/index.js`，并自动选择受支持的 Node.js Runtime。
4. 在 Vercel 项目设置中填写 `ADMIN_PASSWORD` 和 `DATABASE_URL`。
5. 部署完成后访问 `/api/health`，应返回 `{"ok":true,"database":"postgres"}`。
6. 用 Vercel 的 HTTPS 地址打开 `/`，确认登记页后再生成正式二维码。

Vercel Hobby 适合低流量试用；数据库连接和用量仍受 Supabase/Neon 与 Vercel 免费计划限制。

## 维护约定

需求变化时，先更新 [[01-业务方案/MVP范围与非目标]]，再同步产品、技术和实施页面；不要在多个页面手工维护同一份字段定义。
