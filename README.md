# Alpha Research 首页部署指南

## 部署到 Cloudflare Pages

### 方法一：直接上传（最简单）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 点击左侧菜单 **Workers & Pages**
3. 点击 **Create application** → **Pages** → **Upload assets**
4. 输入项目名称，如 `alpha-research`
5. 将 `landing-page` 文件夹拖拽上传
6. 点击 **Save and Deploy**
7. 部署完成后，在 **Custom domains** 添加你的域名 `wishcan976.com`

### 方法二：连接 GitHub（推荐，支持自动更新）

1. 将 `landing-page` 文件夹上传到 GitHub 仓库
2. 在 Cloudflare Pages 中选择 **Connect to Git**
3. 授权 GitHub 并选择仓库
4. 配置：
   - Build command: 留空
   - Build output directory: `/` 或留空
5. 点击 **Save and Deploy**

## 文件结构

```
landing-page/
├── index.html    # 首页文件
└── README.md     # 本说明文件
```

## 域名配置

部署完成后：

1. 在 Cloudflare Pages 项目设置中
2. 点击 **Custom domains**
3. 添加 `wishcan976.com`
4. 按提示配置 DNS（Cloudflare 会自动配置）

## 本地投研平台

首页上的"开始研究"按钮会提示用户启动本地服务：

```bash
cd BS投研平台1/--main
npm run dev
```

然后访问 http://localhost:3000
