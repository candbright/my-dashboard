# 47 — 「无权访问」被渲染成「页面不存在」：`/resume/[slug]` 把每一个失败都当成 404

- **Type**：defect
- **Status**：done（2026-10-15 补充复核：同一现象的第二个起因，见文末）
- **Blocked by**：—
- **Blocks**：—
- **ADR**：—

## 背景

现象：**保存简历后，从「我的」点进刚保存的简历，提示「页面不存在」。** 简历明明在列表里，刚刚才保存成功。

后端其实把三种情况分得很清楚（实测 `GET /api/resumes/by-slug/{slug}`）：

| 后端答复 | 含义 |
|---|---|
| `404` `{"error":"简历不存在","reason":"RESUME_NOT_FOUND"}` | 这个 slug 真的没有简历（且请求**带着**可用身份） |
| `403` `{"error":"无权访问此简历","reason":"NO_ACCESS"}` | 没有可用身份（无 cookie、cookie 无效），或不是这份简历的所有者 |
| `5xx` / 连接失败 | 服务器没能给出答复，简历本身一无所知 |

而 `src/app/resume/[slug]/page.tsx` 把它们**全部压成一个 `null`**：

```ts
if (!res.ok) return null;   // 403、500、404 一样
…
if (!data) notFound();      // 于是都渲染成「页面不存在」
```

`403` 这一行是本工单的要害。**服务端组件读不到 localStorage**，它只认 cookie（`getServerToken`）；客户端请求带的是 localStorage 里的 token。两者由 `api-client.ts` 的 `initToken` 维持一致，而它当时判断的是 cookie 的**存在性**——只在**完全没有 cookie** 时才同步：

```ts
const hasCookie = document.cookie.split('; ').some(c => c.startsWith(`${TOKEN_KEY}=`));
if (_token && !hasCookie) { /* 写 cookie */ }
```

于是**内容是另一个 token 的 cookie 会被一直留着**，会话被劈成两半：客户端的 token 让「我的」列出这份简历，服务端的 cookie 让接口答 `403 NO_ACCESS`，而这个 403 被渲染成「页面不存在」——对用户就是**「我刚保存的简历没了」**。与工单 44 同源：界面把一个「不知道」渲染成了一个「没有」。

（已排除的假设，均为实测：`POST /api/resumes` 的 slug 冲突由后端加后缀解决、元数据 PATCH 不会改 slug、列表里的 slug 用有效 token 都能解析、游客账号是同一个稳定账号。）

## 已修复

两处，缺一不可：**让 cookie 跟上客户端 token**（治因），**让页面说实话**（治象）。

1. `src/lib/api-client.ts`
   - `readTokenCookie()` / `writeTokenCookie()` / `syncTokenCookie()`：cookie 只有**一个写入者**，页载同步改为比较**值**而不是存在性；空值（`auth_token=`，清 cookie 后的过渡态）与「没有 token」等价，因此匹配时不重写，可以每次都跑而不产生 cookie churn；
   - `setToken` 也走同一个写入者，登录与页载同步不可能再对 cookie 属性各执一词。
2. `src/lib/resume-lookup.ts`（新增）：`readResumeLookup` / `lookupResumeBySlug` 把 `found` / `missing` / `forbidden` / `unavailable` 作为数据带出来——只有 `404` 是 `missing`，`401/403`（沿用 `http-json.ts` 的 `isAuthFailure`，与 `AuthContext` 对「过期」的定义同源）是 `forbidden`，其余带上服务器自己的说明。连接被拒（`fetch` reject）算 `unavailable`，绝不冒充 404。
3. `src/app/resume/[slug]/page.tsx`：`missing` 才 `notFound()`；`forbidden` / `unavailable` 渲染 `ResumeUnavailablePage`，标签页标题也一并跟上（原来一律 `Resume Not Found`）。
4. `src/components/ResumeUnavailablePage.tsx`（新增）：两种状态各自的说法与出口。403 页给「重试」，它是**普通 `<a>`**（带 `NEXT_PUBLIC_BASE_PATH`）而不是 `<Link>`：cookie 在客户端模块加载时才写好，用户能点的时候它已经写好了，此时需要的是**文档请求**去带上它，而 `<Link>` 可能被客户端路由直接答复、根本不再问后端。

## 证据

- `src/lib/api-client.test.ts`（新增，10 例）：内容不同的 cookie 被替换、缺失时创建、localStorage 已无 token 时清除、**一致时不重写**（记录每次 `document.cookie` 赋值来断言「没动」）、空串不当作会话、`setToken`/`clearToken`/`getToken` 两个家都一致。反向验证过：把同步改回「存在性」判断，第一个用例失败。
- `src/lib/resume-lookup.test.ts`（新增，10 例）：只有 404 是 `missing`；`401/403` 是 `forbidden`；500 保留服务器原文；无消息时带状态码；2xx 但响应不是 JSON 算 `unavailable`；只读一次 body；连接被拒是 `unavailable`。
- `src/app/resume/[slug]/page.test.tsx`（新增，12 例，本仓第一个位于 `src/app/` 下的测试——调用点就在那里）：403 不再 `notFound()` 且渲染「无法访问这份简历」、提供 `href="/resume/resume"` 的重试与「重新登录」；500/连接失败渲染「暂时无法加载这份简历」且**不**给「重新登录」；403 不借用「暂时无法加载」的说法；404 仍然 `notFound()`；CJK slug 被编码；200 仍把记录与解析结果交给 `ResumePageClient`。反向验证过：把页面改回「任何失败都 `notFound()`」，6 个用例失败。
- **真实运行验证**（`http://127.0.0.1:30002`，去掉 `<script>` 后的可见 HTML）：

  | 请求 | 修复前 | 修复后 |
  |---|---|---|
  | 无 cookie | `404`「页面不存在」 | **`200`「无法访问这份简历」**（含重试链接） |
  | cookie 无效 | `404`「页面不存在」 | **`200`「无法访问这份简历」**（含重试链接） |
  | cookie 有效 | `200` 简历页 | `200` 简历页（不变） |
  | cookie 有效 + 不存在的 slug | `404` | **`404`**（真的没有，就该是 404） |

## 补充复核（2026-10-15，真实运行）：同一现象的第二个起因

用户复报：**「创建好的简历在我的简历中点击访问还是提示页面不存在」**。上面两处修复都在，403 那条路也确实走通了（无 cookie → `200`「无法访问这份简历」），所以这次是**另一起因造成的同一个现象**——「已修」不等于「这个现象不会再有」。

**`/resume/[slug]` 把 slug 又编码了一次，而后端 404 是诚实的。**

Next 交给动态段的 `params.slug` 是**仍然百分号编码**的值，不是解码后的值。页面随后 `encodeURIComponent(slug)`，于是 `王昱皓` → `%E7%8E%8B%E6%98%B1%E7%9A%93` → `%25E7%258E%258B%25…`。数据库里没有这个 slug，后端如实答 `404 RESUME_NOT_FOUND`，页面如实渲染「页面不存在」。**ASCII slug 掩盖了它**（`resume` 编码后还是 `resume`），而本产品的主流输入是中文名——工单 13 起 slug 就保留 CJK。

实测（库里唯一那份简历的 slug 就是 `王昱皓`，`candbright` 所有、`private`/`draft`）：

| `GET /api/resumes/by-slug/…` | 后端 | 含义 |
|---|---|---|
| `王昱皓`（原样） | `403 NO_ACCESS` | 行找得到，调用者不是所有者 |
| `%E7%8E%8B%E6%98%B1%E7%9A%93`（编码一次） | `403 NO_ACCESS` | 行找得到 |
| `%25E7%258E%258B%25…`（编码两次） | `404 RESUME_NOT_FOUND` | 找不到——**页面当时发的就是这个** |

页面对自己三种 URL 写法的答复（无 cookie）：

| 页面请求 | 修复前 | 修复后 |
|---|---|---|
| `/resume/王昱皓` | `404`「页面不存在」 | **`200`「无法访问这份简历」** |
| `/resume/%E7%8E%8B%E6%98%B1%E7%9A%93` | `404`「页面不存在」 | **`200`「无法访问这份简历」** |
| `/resume/%25E7%258E%258B%25…` | `404` | `404`（真的没有，保持 404） |

- **修复**：`src/lib/resume-slug.ts`（新增）——`decodeSlugSegment` / `slugPathSegment`：**先解码一次、再编码一次**，因此框架交来编码的还是解码的段都得到同一个路径，且对自己的输出幂等（`resume` 这类 ASCII 也照旧）。两处调用点都改用它：页面的 `fetchResumeBySlug`，以及 `ResumeUnavailablePage` 的「重试」链接（它原来也有同样的双重编码，那会让重试只能反复确认「页面不存在」）。
- **证据**：`src/lib/resume-slug.test.ts`（新增，11 例：CJK 两种形状、`+`、单独 `%`、`a/b`、`a?b`、幂等、往返）；`src/app/resume/[slug]/page.test.tsx` 新增两例钉住**框架真正交来的那一种形状**——上面第 55 行那条「CJK slug 被编码」的用例是**自己造 `params`**（解码形状），于是测试与页面共享了同一个错误假设，看不见这个 bug；`ResumeUnavailablePage` 的重试链接也补了 CJK 断言。
- **真实运行（重启后的前后端）**：自建一份 CJK slug（`王昱皓-探针`）的简历 → 带所有者 cookie 打开 `/resume/王昱皓-探针` 得 **`200` 且渲染出正文**（`<title>` 就是该 slug），匿名访问得 `200`「无法访问这份简历」，`GET /api/resumes?scope=mine` 列出的 slug 非空。探针简历已删除。
- **诚实边界**：**没有**用用户本人（`candbright`）的会话验证——没有该账号口令。能证明的是「后端现在找得到这一行」（403 而不是 404）与「所有者 cookie 能渲染 CJK slug」（用自建简历证明），两者合起来覆盖用户那条路径。
