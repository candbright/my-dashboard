'use client';

import { useState } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { AIUpload } from '@/components/AIUpload';
import { Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, Button, Card } from '@/components/ui';
import { PageContainer } from '@/components/layout/PageContainer';

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
  const [activeTab, setActiveTab] = useState('standard');
  const [copied, setCopied] = useState(false);

  const handleCopyTemplate = async () => {
    await navigator.clipboard.writeText(TEMPLATE_EXAMPLE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <PageContainer title="上传" titleAccent="简历">
      {/* Tab Switcher */}
      <Tabs
        variant="solid"
        size="md"
        items={[
          { key: 'standard', label: '标准上传' },
          { key: 'ai', label: 'AI 解析' },
        ]}
        selectedKey={activeTab}
        onSelectionChange={setActiveTab}
        className="mb-8"
      />

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
              <Card variant="bordered" className="overflow-hidden">
                {/* Header bar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-default-200 bg-content2/30">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-danger/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
                    <span className="ml-2 text-xs text-default-500">模板格式参考</span>
                  </div>
                  <Button
                    variant="light"
                    size="sm"
                    onClick={handleCopyTemplate}
                    startContent={
                      copied ? (
                        <Check className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )
                    }
                  >
                    {copied ? '已复制' : '复制'}
                  </Button>
                </div>
                {/* Code content */}
                <div className="max-h-[600px] overflow-y-auto">
                  <code className="block p-4 m-0 text-xs text-default-500 font-mono leading-relaxed whitespace-pre-wrap break-words">
                    {TEMPLATE_EXAMPLE}
                  </code>
                </div>
              </Card>
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
    </PageContainer>
  );
}
