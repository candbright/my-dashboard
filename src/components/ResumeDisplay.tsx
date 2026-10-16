'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useMemo, useRef } from 'react';
import { ResumeMarkdown } from '@/components/ResumeMarkdown';
import { blocksOf } from '@/lib/resume-blocks';
import { resolveSectionKind } from '@/lib/resume-section';
import type { SectionKind } from '@/lib/resume-model';
import {
  ArrowLeft, Briefcase, GraduationCap, Code, FolderOpen, User,
  Calendar,
} from 'lucide-react';

import { contactEntries, displayName, resolvePhoto } from '@/components/resume-render/contact';
import { contactIcon } from '@/components/resume-render/icons';
import { presentationFromRecord } from '@/lib/resume-presentation';
import Link from 'next/link';
import type { ResumeRecord } from '@/lib/types';
import type {
  ParsedResumeWithMetadata,
  ResumeSection,
  ResumeSectionItem,
} from '@/lib/resume-model';
import { FadeIn, ScrollReveal } from './ui/Animations';

interface ResumeDisplayProps {
  resume: ResumeRecord;
  /**
   * Must be metadata-normalised: every value here goes straight into a text node,
   * `src`, or `href`, so the loose `ParsedResume` (whose frontmatter can hold whatever
   * YAML produced) would be a lie. `withMetadata` produces this type; call it wherever a
   * resume is loaded.
   */
  parsed: ParsedResumeWithMetadata;
  /** Hide the floating back button */
  hideBackButton?: boolean;
  /** Hide the ResumeVault footer */
  hideFooter?: boolean;
}

/**
 * The icon for a section kind.
 *
 * Takes the **kind**, not the title (ticket 18 task 6). It used to take the title and repeat
 * the whole keyword list — a third copy of a classification the server had already made,
 * which is why `## 教育经历` drew a briefcase here: this list tested `经历` before `教育`.
 *
 * `other` and the default both get the briefcase, which is what an unrecognised section got
 * before; there is no icon that means "unknown section", and a neutral one is correct.
 */
function getSectionIcon(kind: SectionKind) {
  switch (kind) {
    case 'summary':
      return User;
    case 'experience':
      return Briefcase;
    case 'education':
      return GraduationCap;
    case 'skills':
      return Code;
    case 'projects':
      return FolderOpen;
    case 'other':
    default:
      return Briefcase;
  }
}

export function ResumeDisplay({ resume, parsed, hideBackButton, hideFooter }: ResumeDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const headerOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const headerScale = useTransform(scrollYProgress, [0, 0.15], [1, 0.95]);

  const { frontmatter, sections } = parsed;

  /**
   * The stored presentation, resolved. Read here rather than passed in so existing call sites keep
   * working — `resume.presentation` is already on the record the detail route returns.
   *
   * `useMemo` on `resume.presentation` because this component re-renders on every scroll frame via
   * `useScroll`; re-parsing the presentation each time would do real work dozens of times a second
   * for a value that cannot change without the record changing.
   */
  const presentation = useMemo(() => presentationFromRecord(resume.presentation), [resume.presentation]);

  // The photo now honours `presentation.photo`, which it previously ignored entirely — the flag
  // existed since ticket 19 and nothing read it. See `resolvePhoto`.
  const photo = resolvePhoto(frontmatter, presentation);

  const contacts = useMemo(
    () =>
      contactEntries(frontmatter).map((entry) => ({
        ...entry,
        Icon: contactIcon(entry.label),
      })),
    [frontmatter]
  );

  const name = displayName(frontmatter, resume.title);

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
          {/* Softens the hero's edge into the next section.
              This was `bg-gradient-to-b from-transparent via-transparent
              to-background`, which AGENTS.md bans (gradients are allowed only in
              `.gradient-text`). Replaced with a solid `bg-background` band of the
              same height, which does the same job in this layer — the div sits at
              30% opacity inside the decorative stack at line 106, so the transition
              was already muted (ticket 08). A true alpha ramp would need a
              sanctioned gradient utility; if one is added later, this is where it
              belongs. */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-background" />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          {/* Avatar */}
          {photo && (
            <FadeIn>
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="w-28 h-28 mx-auto mb-8 rounded-full overflow-hidden ring-4 ring-background shadow-sm shadow-primary/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt={name || 'Avatar'} className="w-full h-full object-cover" />
              </motion.div>
            </FadeIn>
          )}

          {/* Name */}
          <FadeIn delay={0.1}>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-4">{name}</h1>
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
              {contacts.map(({ Icon, display, value, href, label }) => (
                <motion.div
                  key={label}
                  whileHover={{ y: -2 }}
                  className="bg-content1/95 backdrop-blur-md rounded-[2rem] px-4 py-2.5 flex items-center gap-2 text-sm"
                >
                  <Icon className="w-4 h-4 text-primary" />
                  {href ? (
                    <a
                      href={value}
                      target={href.startsWith('http') ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className="hover:text-primary transition-colors"
                    >
                      {display}
                    </a>
                  ) : (
                    // Previously this branch rendered the raw value while the linked branch ran the
                    // formatter, so a location and a website were treated by different rules. The
                    // shared entry carries one display form for both.
                    <span>{display}</span>
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
  // The kind comes from the server when it sent one, and from the shared local classifier
  // otherwise — never from a title test written here (ticket 18 task 6).
  const kind = resolveSectionKind(section);
  const Icon = getSectionIcon(kind);

  return (
    <section>
      {/* Section Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className={`w-10 h-10 rounded-[2rem] bg-secondary flex items-center justify-center shadow-sm`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">{section.title}</h2>
      </div>

      <SectionBody section={section} />
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
                {/* Inline: a detail is one line of a list, so block elements would
                    break the bullet's layout. */}
                <ResumeMarkdown inline>{detail}</ResumeMarkdown>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}

function SectionBody({ section }: { section: ResumeSection }) {
  const blocks = blocksOf(section);
  return (
    <div className="space-y-6">
      {blocks.map((block, index) => {
        if (block.type === 'paragraph') {
          return (
            <ResumeMarkdown key={`p-${index}`} className="text-lg text-default-500">
              {block.text}
            </ResumeMarkdown>
          );
        }
        if (block.type === 'chips') {
          return <SkillsGrid key={`c-${index}`} chips={block.chips} />;
        }
        const next = blocks[index + 1];
        return (
          <TimelineItem
            key={`e-${index}`}
            item={block.item}
            isLast={next?.type !== 'entry'}
          />
        );
      })}
    </div>
  );
}

function SkillsGrid({ chips }: { chips: string[] }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {chips.map((skill, i) => (
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
