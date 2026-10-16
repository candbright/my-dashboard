# 23 — 渲染服务实现（阶段四形态）

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：**00（Spike 结论）**、20（模板架构）
- **Blocks**：28、29、35、39
- **ADR**：[ADR-0007](../../../docs/adr/0007-render-service-boundary.md)、[ADR-0001](../../../docs/adr/0001-render-engine-selection.md)

## 背景

ADR-0007 定义了硬接口，阶段一用浏览器原生打印充当实现，**本工单是阶段四的真正实现**。

```
RenderResume(结构化内容, 展示态) → (文件字节, 渲染告警[])
```

**引擎由工单 00 的 Spike 裁定：**
- 全部 8 项判据通过 → **Forme**（`@formepdf/next`，Node 侧）
- 任一 FAIL 或结果暧昧 → **headless Chromium**

## 任务

1. **实现引擎**（按 Spike 结论二选一）
2. **返回渲染告警**（ADR-0005 的数据源）：
   | 告警 | 用途 |
   |---|---|
   | `text_layer_empty` | `assertPdfText` 失败信号 |
   | `font_missing` | 字体未嵌入 |
   | `chars_dropped` | 字符被渲染为 `?` 或 `�` |
   | `page_count` | 一页纸约束（工单 28） |
   | `cjk_char_count` | 验证子集化是否生效 |
3. **`assertPdfText` 内置**（工单 02 的实现移入此处）：导出后立即抽取文字，为空或含替换字符则**抛错拒绝交付**——**作用于所有导出路径，不可绕过**
4. **中文字体**：**必须自带并显式注册**（ADR-0001 强制要求）
   - Forme：`Font.register({ family: 'Noto Serif SC', src: '...' })`（其内置 fallback 是 Noto Sans，**不含 CJK**）
   - Chromium：`debian:bookworm-slim` **无中文字体**，Fontconfig 匹配有静默降级风险 → 自带 TTF 并显式注册
5. **字体子集化**：**硬指标**（ADR-0001/0002）。验证 `cjk_char_count` 告警与实际文件体积
6. **部署形态**：独立部署单元，**仅内部调用**（共享密钥或内网），不对外暴露
7. **同步接口**（Q31=A）：异步/队列/缓存**全部推迟**，等真正痛了再加
8. **在阶段一实现的代码处移除"过渡实现"注释**，并保留其作为"导出图片"功能

## 验收标准

- [ ] 接口签名与 ADR-0007 完全一致（引擎可替换是硬要求）
- [ ] `assertPdfText` 在服务内部，**没有任何导出路径能绕过**
- [ ] 中文简历导出：文字可提取、可搜索、复制无乱码
- [ ] **字体子集化生效**：验证输出体积 < 1.5 MB（ADR-0002 判据 6）
- [ ] 渲染告警完整返回，且**描述的是产出文件而非内容质量**
- [ ] 中文字体自带并显式注册，**不依赖系统字体**
- [ ] 服务不对外暴露
- [ ] `DEPLOY.md` 说明新增部署单元、资源需求、回滚方式
- [ ] 替换后阶段一的浏览器打印路径仍作为"导出图片"可用

## 备注

- ⚠️ **若走 Forme**：接受了一个 **pre-1.0、单维护者（bus factor = 1）** 的依赖 → **必须精确锁版本**。
- ⚠️ **若走 Chromium**：容器 +300MB~1GB，**无 tagged PDF**（相对 Forme/Typst 的实质劣势），需队列与 SSRF 防护。
- 待定项见 `spec.md`：**TD-2**（鉴权机制）、**TD-3**（是否引入 docker-compose）。

## Comments

（待填）
