'use client';

import { useState } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { AIUpload } from '@/components/AIUpload';
import { Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type TabKey = 'standard' | 'ai';

const TEMPLATE_EXAMPLE = `---
name: 张三
title: 全栈开发工程师
email: zhangsan@example.com
phone: +86 138-0000-0000
location: 北京市
website: https://zhangsan.dev
github: https://github.com/zhangsan
linkedin: https://linkedin.com/in/zhangsan
avatar: https://i.pravatar.cc/200
---

## 关于我
热爱技术，拥有5年以上全栈开发经验...

## 工作经历
### 高级开发工程师 | 某科技有限公司
*2022年1月 - 至今*
- 主导微服务架构迁移，部署时间缩短60%
- 搭建实时数据分析平台，日活用户超5万

### 开发工程师 | 某初创公司
*2019年6月 - 2021年12月*
- 从零搭建 React 管理后台
- 建立 CI/CD 流水线

## 教育背景
### 计算机科学与技术 本科 | 某大学
*2015 - 2019*
- GPA: 3.8/4.0
- 院长荣誉名单

## 技能
- JavaScript, TypeScript, Python, Go
- React, Next.js, Node.js, Express
- PostgreSQL, MongoDB, Redis
- Docker, Kubernetes, AWS

## 项目经历
### 开源 CLI 工具
- 构建了一个获得1000+ GitHub Star的CLI工具
- 被500+开发者广泛使用`;

export function UploadPageClient() {
  const [activeTab, setActiveTab] = useState<TabKey>('standard');
  const [copied, setCopied] = useState(false);

  const handleCopyTemplate = async () => {
    await navigator.clipboard.writeText(TEMPLATE_EXAMPLE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
      className="max-w-5xl mx-auto px-6 py-12"
    >
      <h1 className="text-2xl font-bold tracking-tight mb-8">上传简历</h1>

      {/* Tab Switcher */}
      <div className="flex gap-4 mb-8 text-sm border-b border-[var(--border)]">
        {[
          { key: 'standard' as TabKey, label: '标准上传' },
          { key: 'ai' as TabKey, label: 'AI 解析' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative pb-2 transition-colors ${
              activeTab === tab.key
                ? 'text-[var(--foreground)] font-medium'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <motion.span
                layoutId="upload-tab-underline"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--foreground)] rounded-full"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'standard' ? (
          <motion.div
            key="standard"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <FileUpload />

            {/* Template Reference */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-10"
            >
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
                {/* Header bar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--muted)]/30">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                    <span className="ml-2 text-xs text-[var(--muted-foreground)]">模板格式参考</span>
                  </div>
                  <button
                    onClick={handleCopyTemplate}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-[var(--muted-foreground)]
                      hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-all"
                    title="复制模板"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-green-500">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        复制
                      </>
                    )}
                  </button>
                </div>
                {/* Code content */}
                <div className="max-h-[600px] overflow-y-auto">
                  <code className="block p-4 m-0 text-xs text-[var(--muted-foreground)] font-mono leading-relaxed whitespace-pre-wrap break-words">{TEMPLATE_EXAMPLE}</code>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="ai"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <AIUpload />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
