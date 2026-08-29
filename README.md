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
- 登记写入数据库成功后，页面显示“登记成功”和本次登记摘要，包括登记时间、姓名、完整手机号、公司、被访人、来访事由、同行人数和车牌号。该摘要仅在当前成功页面显示，刷新后消失；登记成功即完成流程，不需要前台或员工确认。
- 登记字段采用精简版：姓名、手机号、公司、被访人、来访事由、同行人数、车牌号（选填）。

## 状态

| 项目 | 状态 |
| --- | --- |
| 方案设计 | 已确认 |
| 知识库 | 已创建 |
| 软件开发 | MVP 已完成，CloudBase 迁移实施中 |
| CloudBase 部署 | 尚未部署，等待公网联调和微信真机验收 |
| 临时回退 | 已验证的 Vercel + Neon 试用环境暂时保留 |

## 本地运行

```powershell
$env:ADMIN_PASSWORD = "请替换为强密码"
npm start
```

- 手机登记页：`http://localhost:3000/`
- 后台：`http://localhost:3000/admin`
- 默认管理员账号：`admin`
- 生产环境必须设置 `ADMIN_PASSWORD`，并通过 HTTPS 反向代理发布。
- 页面已使用普冉半导体透明 LOGO：`public/assets/puya-logo-transparent.png`。

## 生成正式部署包

```powershell
./scripts/package-release.ps1
```

默认生成 `dist/puya-visitor-system-release.zip`。包内包含 Node.js 服务、静态资源、Dockerfile、PostgreSQL 建表脚本和环境变量模板，不包含真实密钥及本地数据。详细说明见 [[docs/正式部署包说明]]。

## CloudBase 目标部署

目标架构为：微信或手机浏览器访问 CloudBase 静态托管页面，同源 `/api/*` 网关转发至 Node.js HTTP 云函数，业务数据写入 CloudBase PostgreSQL。本机未配置 PostgreSQL 时继续使用 SQLite；生产环境不得回退到云函数临时文件系统中的 SQLite。

部署所需环境变量：

- CloudBase 项目：`TCB_ENV_ID`；部署地域已在 `cloudbaserc.json` 固定为上海 `ap-shanghai`。
- 管理员：`ADMIN_PASSWORD`。
- CloudBase 函数：`TCB_ENV_ID`、`CLOUDBASE_APIKEY` 和 `ADMIN_PASSWORD`；通过 SDK `rdb()` 访问 PostgreSQL。

真实密钥只保存在被 Git 忽略的 `.env.local` 或 CloudBase 环境变量设置中，不得写入 Git。`DATABASE_URL` 仅保留给旧部署兼容回退，不作为 CloudBase 目标配置。

配置完成后执行：

```powershell
$env:TCB_ENV_ID = 'puya-visitor-system-d8bjd061ec19'
npx --package @cloudbase/cli@3.8.1 tcb validate
npx --package @cloudbase/cli@3.8.1 tcb deploy
```

线上验收依次检查 `/api/health` 返回 PostgreSQL、访客提交成功并显示完整登记摘要、后台可查询到一致记录，以及微信扫描固定二维码能够完成登记。当前 CloudBase 公网入口如下：

- 手机登记页：<https://puya-visitor-system-d8bjd061ec19-1421207492.ap-shanghai.app.tcloudbase.com/>
- 后台入口：<https://puya-visitor-system-d8bjd061ec19-1421207492.ap-shanghai.app.tcloudbase.com/admin>
- 健康检查：<https://puya-visitor-system-d8bjd061ec19-1421207492.ap-shanghai.app.tcloudbase.com/api/health>

CloudBase 免费环境需要定期续期并监控资源点、函数、数据库和流量配额，不应按永久无限额服务规划。

## 临时回退环境

已验证的 Vercel + Neon 环境仅作为 CloudBase 迁移期间的临时回退，不作为新部署目标，也不向 CloudBase 迁移其中的测试记录：

- 手机登记页：<https://puya-visitor-system.vercel.app/>
- 后台入口：<https://puya-visitor-system.vercel.app/admin>
- 健康检查：<https://puya-visitor-system.vercel.app/api/health>
- 数据库：Vercel Neon PostgreSQL 集成，通过 `DATABASE_URL` 连接。

## 维护约定

需求变化时，先更新 [[01-业务方案/MVP范围与非目标]]，再同步产品、技术和实施页面；不要在多个页面手工维护同一份字段定义。
