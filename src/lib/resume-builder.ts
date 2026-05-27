/**
 * Convert structured resume data back to markdown string with frontmatter
 */

import type { ParsedResume, ResumeSection, ResumeSectionItem } from './resume-parser';

export interface EditableFrontmatter {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  github: string;
  linkedin: string;
  avatar: string;
}

export interface EditableSection {
  id: string;
  title: string;
  content: string;
  items: EditableSectionItem[];
}

export interface EditableSectionItem {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  details: string[];
}

export function parsedToEditable(parsed: ParsedResume): {
  frontmatter: EditableFrontmatter;
  sections: EditableSection[];
} {
  const frontmatter: EditableFrontmatter = {
    name: parsed.frontmatter.name || '',
    title: parsed.frontmatter.title || '',
    email: parsed.frontmatter.email || '',
    phone: parsed.frontmatter.phone || '',
    location: parsed.frontmatter.location || '',
    website: parsed.frontmatter.website || '',
    github: parsed.frontmatter.github || '',
    linkedin: parsed.frontmatter.linkedin || '',
    avatar: parsed.frontmatter.avatar || '',
  };

  const sections: EditableSection[] = parsed.sections.map((s, i) => ({
    id: `section-${i}-${Date.now()}`,
    title: s.title,
    content: s.content,
    items: s.items.map((item, j) => ({
      id: `item-${i}-${j}-${Date.now()}`,
      title: item.title,
      subtitle: item.subtitle || '',
      date: item.date || '',
      details: item.details.length > 0 ? [...item.details] : [''],
    })),
  }));

  return { frontmatter, sections };
}

export function editableToMarkdown(
  frontmatter: EditableFrontmatter,
  sections: EditableSection[]
): string {
  const lines: string[] = [];

  // Build frontmatter
  lines.push('---');
  if (frontmatter.name) lines.push(`name: ${frontmatter.name}`);
  if (frontmatter.title) lines.push(`title: ${frontmatter.title}`);
  if (frontmatter.email) lines.push(`email: ${frontmatter.email}`);
  if (frontmatter.phone) lines.push(`phone: ${frontmatter.phone}`);
  if (frontmatter.location) lines.push(`location: ${frontmatter.location}`);
  if (frontmatter.website) lines.push(`website: ${frontmatter.website}`);
  if (frontmatter.github) lines.push(`github: ${frontmatter.github}`);
  if (frontmatter.linkedin) lines.push(`linkedin: ${frontmatter.linkedin}`);
  if (frontmatter.avatar) lines.push(`avatar: ${frontmatter.avatar}`);
  lines.push('---');
  lines.push('');

  // Build sections
  for (const section of sections) {
    lines.push(`## ${section.title}`);

    if (section.content.trim()) {
      lines.push(section.content.trim());
    }

    for (const item of section.items) {
      const itemTitle = item.subtitle
        ? `### ${item.title} | ${item.subtitle}`
        : `### ${item.title}`;
      lines.push(itemTitle);

      if (item.date) {
        lines.push(`*${item.date}*`);
      }

      for (const detail of item.details) {
        if (detail.trim()) {
          lines.push(`- ${detail.trim()}`);
        }
      }

      lines.push('');
    }

    if (section.items.length === 0) {
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function createEmptySection(): EditableSection {
  return {
    id: `section-new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: '新模块',
    content: '',
    items: [],
  };
}

export function createEmptyItem(): EditableSectionItem {
  return {
    id: `item-new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: '',
    subtitle: '',
    date: '',
    details: [''],
  };
}
