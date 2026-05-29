'use client';

import type { ParsedResume, ResumeSection, ResumeSectionItem } from '@/lib/resume-parser';
import type { ResumeRecord } from '@/lib/types';
import {
  Mail, Phone, MapPin, Globe,
  Briefcase, GraduationCap, Code, FolderOpen, User, Calendar,
} from 'lucide-react';

// Brand icons (same as ResumeDisplay)
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

function getSectionIcon(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes('about') || lower.includes('summary') || title.includes('关于') || title.includes('简介') || title.includes('个人')) return User;
  if (lower.includes('experience') || lower.includes('work') || title.includes('工作') || title.includes('经历') || title.includes('经验')) return Briefcase;
  if (lower.includes('education') || title.includes('教育') || title.includes('学历')) return GraduationCap;
  if (lower.includes('skill') || lower.includes('tech') || title.includes('技能') || title.includes('技术')) return Code;
  if (lower.includes('project') || title.includes('项目') || title.includes('作品')) return FolderOpen;
  return Briefcase;
}

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

interface ResumePrintViewProps {
  resume: ResumeRecord;
  parsed: ParsedResume;
}

/**
 * A static (no-animation) version of the resume designed for PDF capture.
 * Renders at a fixed A4-friendly width with clean layout.
 */
export function ResumePrintView({ resume, parsed }: ResumePrintViewProps) {
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
    <div
      id="resume-print-root"
      style={{
        width: '794px', // A4 width at 96dpi
        padding: '48px 56px',
        background: '#ffffff',
        color: '#1a1a1a',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif',
        fontSize: '14px',
        lineHeight: '1.6',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        {frontmatter.avatar && (
          <div style={{ marginBottom: '16px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={frontmatter.avatar}
              alt={frontmatter.name || 'Avatar'}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '3px solid #e5e7eb',
                margin: '0 auto',
                display: 'block',
              }}
              crossOrigin="anonymous"
            />
          </div>
        )}

        <h1 style={{
          fontSize: '32px',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          margin: '0 0 6px 0',
          color: '#111',
        }}>
          {frontmatter.name || resume.title}
        </h1>

        {frontmatter.title && (
          <p style={{
            fontSize: '16px',
            fontWeight: 500,
            margin: '0 0 16px 0',
            color: '#006FEE',
          }}>
            {frontmatter.title}
          </p>
        )}

        {/* Contact row */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '12px 20px',
          fontSize: '13px',
          color: '#555',
        }}>
          {contactLinks.map(({ icon: Icon, value, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Icon style={{ width: '14px', height: '14px', color: '#006FEE', flexShrink: 0 } as React.CSSProperties} className="" />
              <span>{formatContactValue(value!, label)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Divider */}
      <hr style={{ border: 'none', borderTop: '1.5px solid #e5e7eb', margin: '0 0 28px 0' }} />

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {sections.map((section, index) => (
          <PrintSection key={section.title} section={section} index={index} />
        ))}
      </div>
    </div>
  );
}

function PrintSection({ section, index }: { section: ResumeSection; index: number }) {
  const isSkills = section.title.toLowerCase().includes('skill') || section.title.toLowerCase().includes('tech') || section.title.includes('技能') || section.title.includes('技术');

  return (
    <div>
      {/* Section Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '12px',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '8px',
      }}>
        <h2 style={{
          fontSize: '18px',
          fontWeight: 700,
          letterSpacing: '-0.01em',
          margin: 0,
          color: '#111',
        }}>
          {section.title}
        </h2>
      </div>

      {/* Section content */}
      {section.content && !isSkills && (
        <p style={{
          color: '#555',
          lineHeight: '1.7',
          margin: '0 0 12px 0',
          fontSize: '14px',
        }}>
          {section.content}
        </p>
      )}

      {/* Skills as tags */}
      {isSkills && <PrintSkills section={section} />}

      {/* Items */}
      {!isSkills && section.items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {section.items.map((item, i) => (
            <PrintItem key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function PrintItem({ item }: { item: ResumeSectionItem }) {
  return (
    <div style={{ paddingLeft: '4px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '8px',
        marginBottom: '4px',
      }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: '15px', color: '#222' }}>
            {item.title}
          </span>
          {item.subtitle && (
            <span style={{ color: '#006FEE', fontSize: '14px', fontWeight: 500, marginLeft: '8px' }}>
              {item.subtitle}
            </span>
          )}
        </div>
        {item.date && (
          <span style={{ fontSize: '13px', color: '#888', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {item.date}
          </span>
        )}
      </div>

      {item.details.length > 0 && (
        <ul style={{
          margin: '4px 0 0 0',
          paddingLeft: '18px',
          color: '#555',
          fontSize: '13px',
          lineHeight: '1.7',
        }}>
          {item.details.map((detail, i) => (
            <li key={i} style={{ marginBottom: '2px' }}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PrintSkills({ section }: { section: ResumeSection }) {
  const skills: string[] = [];

  section.items.forEach((item) => {
    item.details.forEach((d) => {
      d.split(',').forEach((s) => skills.push(s.trim()));
    });
    if (item.title) {
      item.title.split(',').forEach((s) => skills.push(s.trim()));
    }
  });

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

  const uniqueSkills = [...new Set(skills.filter(Boolean))];

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
    }}>
      {uniqueSkills.map((skill) => (
        <span
          key={skill}
          style={{
            padding: '4px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            border: '1px solid #e5e7eb',
            background: '#f9fafb',
            color: '#333',
          }}
        >
          {skill}
        </span>
      ))}
    </div>
  );
}
