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
| 软件开发 | MVP 已完成，可本地运行 |
| 现场试点 | 未开始 |

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

本项目支持两种数据库模式：本机未设置 `DATABASE_URL` 时使用 SQLite；设置 `DATABASE_URL` 后自动使用 PostgreSQL。Render 部署请配合 Neon 等 PostgreSQL 服务，不能把 SQLite 文件作为云端长期数据存储。

1. 在 Neon 创建数据库，复制连接串 `DATABASE_URL`。
2. 将项目放入 GitHub 仓库。
3. 在 Render 选择 **New → Blueprint**，选择该仓库，Render 会读取 [`render.yaml`](E:/Codex/07_个人工作台/访客系统/render.yaml)。
4. 在 Render 填写 `ADMIN_PASSWORD` 和 `DATABASE_URL`。
5. 部署完成后访问 `/api/health`，应返回 `{"ok":true,"database":"postgres"}`。
6. 用 Render 的 HTTPS 地址打开 `/`，确认登记页后再生成正式二维码。

Render 免费服务空闲后会休眠，仅用于试用；正式上线前需评估稳定性、备份和服务计划。

## 维护约定

需求变化时，先更新 [[01-业务方案/MVP范围与非目标]]，再同步产品、技术和实施页面；不要在多个页面手工维护同一份字段定义。
