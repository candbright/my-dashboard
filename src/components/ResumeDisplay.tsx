'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import {
  Mail, Phone, MapPin, Globe,
  ArrowLeft, Briefcase, GraduationCap, Code, FolderOpen, User,
  ExternalLink, Calendar, Link2,
} from 'lucide-react';

// Brand icons not in lucide-react
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}
import Link from 'next/link';
import type { ResumeRecord } from '@/lib/types';
import type { ParsedResume, ResumeSection, ResumeSectionItem } from '@/lib/resume-parser';
import { FadeIn, ScrollReveal } from './ui/Animations';

interface ResumeDisplayProps {
  resume: ResumeRecord;
  parsed: ParsedResume;
  /** Hide the floating back button */
  hideBackButton?: boolean;
  /** Hide the ResumeVault footer */
  hideFooter?: boolean;
}

// Map section titles to icons
function getSectionIcon(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes('about') || lower.includes('summary') || title.includes('关于') || title.includes('简介') || title.includes('个人')) return User;
  if (lower.includes('experience') || lower.includes('work') || title.includes('工作') || title.includes('经历') || title.includes('经验')) return Briefcase;
  if (lower.includes('education') || title.includes('教育') || title.includes('学历')) return GraduationCap;
  if (lower.includes('skill') || lower.includes('tech') || title.includes('技能') || title.includes('技术')) return Code;
  if (lower.includes('project') || title.includes('项目') || title.includes('作品')) return FolderOpen;
  return Briefcase;
}

export function ResumeDisplay({ resume, parsed, hideBackButton, hideFooter }: ResumeDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const headerOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const headerScale = useTransform(scrollYProgress, [0, 0.15], [1, 0.95]);

  const { frontmatter, sections } = parsed;

  const contactLinks = [
    { icon: Mail, value: frontmatter.email, href: `mailto:${frontmatter.email}`, label: 'Email' },
    { icon: Phone, value: frontmatter.phone, href: `tel:${frontmatter.phone}`, label: 'Phone' },
    { icon: MapPin, value: frontmatter.location, href: null, label: 'Location' },
    { icon: Globe, value: frontmatter.website, href: frontmatter.website, label: 'Website' },
    { icon: GithubIcon, value: frontmatter.github, href: frontmatter.github, label: 'GitHub' },
    { icon: LinkedinIcon, value: frontmatter.linkedin, href: frontmatter.linkedin, label: 'LinkedIn' },
  ].filter((l) => l.value);

  return (
    <div ref={containerRef} className="min-h-screen bg-background">
      {/* Floating back button */}
      {!hideBackButton && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="fixed top-6 left-6 z-50"
        >
          <Link
            href="/"
            className="bg-content1/95 backdrop-blur-md flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
              hover:shadow-sm transition-shadow duration-500"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </Link>
        </motion.div>
      )}

      {/* Progress bar */}
      <motion.div
        style={{ scaleX: scrollYProgress }}
        className="fixed top-0 left-0 right-0 h-0.5 bg-primary origin-left z-50"
      />

      {/* Hero Section */}
      <motion.section
        style={{ opacity: headerOpacity, scale: headerScale }}
        className="relative overflow-hidden pt-24 pb-32"
      >
        {/* Animated background gradient */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary opacity-10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary opacity-10 rounded-full blur-3xl" />
          <div className="absolute inset-0 dot-grid opacity-30" />
          {/* Fade-to-background gradient at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent via-transparent to-background" />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          {/* Avatar */}
          {frontmatter.avatar && (
            <FadeIn>
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="w-28 h-28 mx-auto mb-8 rounded-full overflow-hidden ring-4 ring-background shadow-sm shadow-primary/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={frontmatter.avatar}
                  alt={frontmatter.name || 'Avatar'}
                  className="w-full h-full object-cover"
                />
              </motion.div>
            </FadeIn>
          )}

          {/* Name */}
          <FadeIn delay={0.1}>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-4">
              {frontmatter.name || resume.title}
            </h1>
          </FadeIn>

          {/* Title */}
          {frontmatter.title && (
            <FadeIn delay={0.2}>
              <p className="text-xl md:text-2xl gradient-text font-medium mb-8">
                {frontmatter.title}
              </p>
            </FadeIn>
          )}

          {/* Contact row */}
          <FadeIn delay={0.3}>
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              {contactLinks.map(({ icon: Icon, value, href, label }) => (
                <motion.div
                  key={label}
                  whileHover={{ y: -2 }}
                  className="bg-content1/95 backdrop-blur-md rounded-[2rem] px-4 py-2.5 flex items-center gap-2 text-sm"
                >
                  <Icon className="w-4 h-4 text-primary" />
                  {href ? (
                    <a
                      href={href}
                      target={href.startsWith('http') ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className="hover:text-primary transition-colors"
                    >
                      {formatContactValue(value!, label)}
                    </a>
                  ) : (
                    <span>{value}</span>
                  )}
                </motion.div>
              ))}
            </div>
          </FadeIn>
        </div>
      </motion.section>

      {/* Sections */}
      <div className="max-w-4xl mx-auto px-6 pb-24 space-y-16">
        {sections.map((section, index) => (
          <ScrollReveal key={section.title}>
            <SectionBlock section={section} index={index} />
          </ScrollReveal>
        ))}
      </div>

      {/* Footer */}
      {!hideFooter && (
      <footer className="border-t border-default-200 py-8">
        <div className="max-w-4xl mx-auto px-6 text-center text-sm text-default-500">
          由{' '}
          <span className="gradient-text font-medium">ResumeVault</span>
          {' '}驱动
        </div>
      </footer>
      )}
    </div>
  );
}

function SectionBlock({ section, index }: { section: ResumeSection; index: number }) {
  const Icon = getSectionIcon(section.title);
  const isSkills = section.title.toLowerCase().includes('skill') || section.title.toLowerCase().includes('tech') || section.title.includes('技能') || section.title.includes('技术');

  return (
    <section>
      {/* Section Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className={`w-10 h-10 rounded-[2rem] bg-secondary flex items-center justify-center shadow-sm`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">{section.title}</h2>
      </div>

      {/* Section Content */}
      {section.content && !isSkills && (
        <p className="text-default-500 leading-relaxed mb-6 text-lg">
          {section.content}
        </p>
      )}

      {/* Skills as tags */}
      {isSkills && (
        <SkillsGrid section={section} />
      )}

      {/* Items (Experience, Education, Projects) */}
      {!isSkills && section.items.length > 0 && (
        <div className="space-y-6">
          {section.items.map((item, i) => (
            <TimelineItem key={i} item={item} isLast={i === section.items.length - 1} />
          ))}
        </div>
      )}
    </section>
  );
}

function TimelineItem({ item, isLast }: { item: ResumeSectionItem; isLast: boolean }) {
  return (
    <motion.div
      whileHover={{ x: 4 }}
      transition={{ duration: 0.2 }}
      className="relative pl-8 group"
    >
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[11px] top-8 bottom-0 w-px bg-default-200 group-hover:bg-primary transition-colors duration-500" />
      )}

      {/* Timeline dot */}
      <div className="absolute left-0 top-2 w-[22px] h-[22px] rounded-full border border-default-200 bg-content1 group-hover:border-primary transition-colors duration-500 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      </div>

      <div className="bg-content1 border border-default-200 rounded-[2rem] p-5 hover:shadow-sm hover:shadow-primary/5 transition-all duration-500">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 mb-2">
          <div>
            <h3 className="font-semibold text-lg">{item.title}</h3>
            {item.subtitle && (
              <p className="text-primary text-sm font-medium">{item.subtitle}</p>
            )}
          </div>
          {item.date && (
            <span className="flex items-center gap-1.5 text-sm text-default-500 whitespace-nowrap">
              <Calendar className="w-3.5 h-3.5" />
              {item.date}
            </span>
          )}
        </div>

        {item.details.length > 0 && (
          <ul className="space-y-1.5 mt-3">
            {item.details.map((detail, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-default-500">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                {detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}

function SkillsGrid({ section }: { section: ResumeSection }) {
  // Parse skills from items and content
  const skills: string[] = [];

  // From items
  section.items.forEach((item) => {
    item.details.forEach((d) => {
      d.split(',').forEach((s) => skills.push(s.trim()));
    });
    if (item.title) {
      item.title.split(',').forEach((s) => skills.push(s.trim()));
    }
  });

  // From content - parse list items and comma-separated values
  if (section.content) {
    section.content.split('\n').forEach((line) => {
      const cleaned = line.replace(/^[-*]\s*/, '').trim();
      if (cleaned) {
        cleaned.split(',').forEach((s) => {
          const skill = s.trim();
          if (skill) skills.push(skill);
        });
      }
    });
  }

  // Remove duplicates and empty
  const uniqueSkills = [...new Set(skills.filter(Boolean))];

  return (
    <div className="flex flex-wrap gap-2.5">
      {uniqueSkills.map((skill, i) => (
        <motion.span
          key={skill}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.03 }}
          whileHover={{ scale: 1.08, y: -2 }}
          className="px-4 py-2 rounded-[2rem] text-sm font-medium border border-default-200 bg-content1
            hover:border-primary hover:shadow-sm hover:shadow-primary/5 transition-all duration-500 cursor-default"
        >
          {skill}
        </motion.span>
      ))}
    </div>
  );
}

function formatContactValue(value: string, label: string): string {
  if (label === 'GitHub' || label === 'LinkedIn') {
    try {
      const url = new URL(value);
      return url.pathname.replace(/^\//, '').replace(/\/$/, '') || value;
    } catch {
      return value;
    }
  }
  if (label === 'Website') {
    try {
      const url = new URL(value);
      return url.hostname;
    } catch {
      return value;
    }
  }
  return value;
}
