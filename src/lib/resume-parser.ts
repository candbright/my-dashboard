import matter from 'gray-matter';

export interface ParsedResume {
  frontmatter: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    location?: string;
    website?: string;
    github?: string;
    linkedin?: string;
    avatar?: string;
  };
  sections: ResumeSection[];
  rawContent: string;
}

export interface ResumeSection {
  title: string;
  content: string;
  items: ResumeSectionItem[];
}

export interface ResumeSectionItem {
  title: string;
  subtitle?: string;
  date?: string;
  details: string[];
  description?: string;
}

export function parseResumeMarkdown(markdown: string): ParsedResume {
  const { data: frontmatter, content } = matter(markdown);

  const sections = parseSections(content);

  return {
    frontmatter: {
      name: frontmatter.name,
      title: frontmatter.title,
      email: frontmatter.email,
      phone: frontmatter.phone,
      location: frontmatter.location,
      website: frontmatter.website,
      github: frontmatter.github,
      linkedin: frontmatter.linkedin,
      avatar: frontmatter.avatar,
    },
    sections,
    rawContent: content,
  };
}

function parseSections(content: string): ResumeSection[] {
  const sections: ResumeSection[] = [];
  // Normalize line endings to LF
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  let currentSection: ResumeSection | null = null;
  let currentItem: ResumeSectionItem | null = null;
  let contentBuffer: string[] = [];

  for (const line of lines) {
    // H2 = section header
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      // Save previous section
      if (currentSection) {
        if (currentItem) {
          currentSection.items.push(currentItem);
          currentItem = null;
        }
        currentSection.content = contentBuffer.join('\n').trim();
        sections.push(currentSection);
      }
      currentSection = {
        title: h2Match[1].trim(),
        content: '',
        items: [],
      };
      contentBuffer = [];
      continue;
    }

    // H3 = section item (e.g., job title, degree)
    const h3Match = line.match(/^### (.+)$/);
    if (h3Match && currentSection) {
      if (currentItem) {
        currentSection.items.push(currentItem);
      }
      // Parse "Title | Organization" or just "Title"
      const parts = h3Match[1].split('|').map((s) => s.trim());
      currentItem = {
        title: parts[0],
        subtitle: parts[1] || undefined,
        details: [],
      };
      continue;
    }

    // Date line (italic)
    const dateMatch = line.match(/^\*(.+)\*$/);
    if (dateMatch && currentItem) {
      currentItem.date = dateMatch[1].trim();
      continue;
    }

    // List item
    const listMatch = line.match(/^[-*] (.+)$/);
    if (listMatch && currentItem) {
      currentItem.details.push(listMatch[1].trim());
      continue;
    }

    // Regular content
    if (currentSection) {
      contentBuffer.push(line);
    }
  }

  // Save last section and item
  if (currentSection) {
    if (currentItem) {
      currentSection.items.push(currentItem);
    }
    currentSection.content = contentBuffer.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
}

export function generateSlug(name: string): string {
  // Check if the name contains non-ASCII characters (e.g., Chinese)
  const hasNonAscii = /[^\x00-\x7F]/.test(name);

  if (hasNonAscii) {
    // For non-ASCII names, use encodeURIComponent-safe slug
    // Keep any ASCII alphanumeric parts, convert spaces to hyphens,
    // and encode the rest as a simple hash
    const asciiPart = name.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const hash = Array.from(name)
      .reduce((acc, char) => acc + char.charCodeAt(0), 0)
      .toString(36);
    const base = asciiPart
      ? asciiPart.toLowerCase().replace(/\s+/g, '-')
      : 'resume';
    return `${base}-${hash}`;
  }

  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}
