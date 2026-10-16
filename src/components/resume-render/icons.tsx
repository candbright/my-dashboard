/**
 * Contact icons shared by every render path (ticket 20).
 *
 * `GithubIcon` and `LinkedinIcon` were defined **twice**, byte-identically, in `ResumeDisplay` and
 * `ResumePrintView` — with comments each pointing at the other ("same as ResumeDisplay",
 * "not in lucide-react"). The survey that preceded this refactor confirmed the bodies matched
 * exactly. That is the harmless-looking kind of duplication: identical copies do not read as a bug,
 * they read as a convention, right up until one of them is fixed and the on-screen preview and the
 * PDF disagree about what the candidate's GitHub link looks like.
 *
 * The print renderers do not use icons at all — ADR-0008 forbids an icon standing in for a text
 * label, and every template's contact block spells the label out. This module therefore serves the
 * on-screen path, and exists here rather than in `ResumeDisplay` so that the *next* renderer does
 * not define a third copy.
 */

import { Globe, Mail, MapPin, Phone } from 'lucide-react';
import type { ComponentType } from 'react';
import type { BrandIconProps } from '@/components/resume-render/contact';

export function GithubIcon({ className, style }: BrandIconProps) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

export function LinkedinIcon({ className, style }: BrandIconProps) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

/**
 * The icon for a contact entry, keyed by the `label` that `contactEntries` produces.
 *
 * A `Record` lookup with an explicit fallback rather than a `switch`, so adding a contact field is a
 * one-line change here and cannot be forgotten in a switch's `default` branch. `Link2` is the
 * fallback rather than `undefined` because a contact with no icon would render as a bare indented
 * value in a row of icon-led chips, which looks like a bug.
 */
const CONTACT_ICONS: Record<string, ComponentType<BrandIconProps>> = {
  Email: Mail,
  Phone: Phone,
  Location: MapPin,
  Website: Globe,
  GitHub: GithubIcon,
  LinkedIn: LinkedinIcon,
};

export function contactIcon(label: string): ComponentType<BrandIconProps> {
  return CONTACT_ICONS[label] ?? CONTACT_ICONS.Website;
}
