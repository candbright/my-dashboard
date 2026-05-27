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

// Get gradient for section
function getSectionGradient(index: number): string {
  const gradients = [
    'from-indigo-500 to-purple-500',
    'from-cyan-500 to-blue-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
    'from-pink-500 to-rose-500',
    'from-violet-500 to-fuchsia-500',
  ];
  return gradients[index % gradients.length];
}

export function ResumeDisplay({ resume, parsed }: ResumeDisplayProps) {
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
    <div ref={containerRef} className="min-h-screen bg-[var(--background)]">
      {/* Floating back button */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5 }}
        className="fixed top-6 left-6 z-50"
      >
        <Link
          href="/"
          className="glass flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
            hover:shadow-lg transition-shadow duration-300"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </Link>
      </motion.div>

      {/* Progress bar */}
      <motion.div
        style={{ scaleX: scrollYProgress }}
        className="fixed top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] origin-left z-50"
      />

      {/* Hero Section */}
      <motion.section
        style={{ opacity: headerOpacity, scale: headerScale }}
        className="relative overflow-hidden pt-24 pb-20"
      >
        {/* Animated background gradient */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--gradient-start)] opacity-10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[var(--gradient-end)] opacity-10 rounded-full blur-3xl" />
          <div className="absolute inset-0 dot-grid opacity-30" />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          {/* Avatar */}
          {frontmatter.avatar && (
            <FadeIn>
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="w-28 h-28 mx-auto mb-8 rounded-full overflow-hidden ring-4 ring-[var(--background)] shadow-2xl shadow-[var(--accent-glow)]"
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
                  className="glass rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm"
                >
                  <Icon className="w-4 h-4 text-[var(--accent)]" />
                  {href ? (
                    <a
                      href={href}
                      target={href.startsWith('http') ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className="hover:text-[var(--accent)] transition-colors"
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
      <footer className="border-t border-[var(--border)] py-8">
        <div className="max-w-4xl mx-auto px-6 text-center text-sm text-[var(--muted-foreground)]">
          由{' '}
          <span className="gradient-text font-medium">ResumeVault</span>
          {' '}驱动
        </div>
      </footer>
    </div>
  );
}

function SectionBlock({ section, index }: { section: ResumeSection; index: number }) {
  const Icon = getSectionIcon(section.title);
  const gradient = getSectionGradient(index);
  const isSkills = section.title.toLowerCase().includes('skill') || section.title.toLowerCase().includes('tech') || section.title.includes('技能') || section.title.includes('技术');

  return (
    <section>
      {/* Section Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">{section.title}</h2>
      </div>

      {/* Section Content */}
      {section.content && !isSkills && (
        <p className="text-[var(--muted-foreground)] leading-relaxed mb-6 text-lg">
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
        <div className="absolute left-[11px] top-8 bottom-0 w-px bg-[var(--border)] group-hover:bg-[var(--accent)] transition-colors duration-300" />
      )}

      {/* Timeline dot */}
      <div className="absolute left-0 top-2 w-[22px] h-[22px] rounded-full border-2 border-[var(--border)] bg-[var(--card)] group-hover:border-[var(--accent)] transition-colors duration-300 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 hover:shadow-md hover:shadow-[var(--accent-glow)] transition-all duration-300">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 mb-2">
          <div>
            <h3 className="font-semibold text-lg">{item.title}</h3>
            {item.subtitle && (
              <p className="text-[var(--accent)] text-sm font-medium">{item.subtitle}</p>
            )}
          </div>
          {item.date && (
            <span className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] whitespace-nowrap">
              <Calendar className="w-3.5 h-3.5" />
              {item.date}
            </span>
          )}
        </div>

        {item.details.length > 0 && (
          <ul className="space-y-1.5 mt-3">
            {item.details.map((detail, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[var(--muted-foreground)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-1.5 flex-shrink-0" />
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
          className="px-4 py-2 rounded-xl text-sm font-medium border border-[var(--border)] bg-[var(--card)]
            hover:border-[var(--accent)] hover:shadow-md hover:shadow-[var(--accent-glow)] transition-all duration-200 cursor-default"
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
