/**
 * Shared candidate-header data for resume renderers (ticket 20).
 *
 * # What was wrong before
 *
 * `ResumePrintView` and `ResumeDisplay` each carried their own copy of `GithubIcon`,
 * `LinkedinIcon`, `formatContactValue` and the `contactLinks` array. The survey that preceded this
 * refactor confirmed all four were byte-identical — which is the dangerous kind of duplication.
 * Identical copies do not look like a bug; they look like a convention. They diverge the first
 * time someone fixes a display bug in one of them, and then the PDF and the preview disagree
 * about the candidate's own contact details.
 *
 * There was already one divergence hiding in the pair: `ResumeDisplay` rendered a non-link contact
 * value raw while `ResumePrintView` always ran it through `formatContactValue`. For `Location`
 * the two happened to produce the same string, so nothing looked wrong.
 *
 * # The photo decision, recorded because it is observable
 *
 * `ResumePresentation.photo` has had an `enabled` flag and a `path` since ticket 19, and **neither
 * component consulted it** — both rendered `frontmatter.avatar` whenever it was set. That made the
 * flag decorative.
 *
 * `resolvePhoto` now honours it: `photo.enabled` with a `path` wins; `photo.enabled` with no path
 * falls back to the metadata avatar rather than rendering a hole; and `photo.enabled === false`
 * suppresses the photo even when metadata has one. That last case is the whole point of having the
 * flag — "do not put my photo on this version" has to be expressible, and it is what an ATS-safe
 * template needs, since ADR-0008 forbids a photo there.
 */

import type { ResumeMetadataView } from '@/lib/resume-model';
import type { ResumePresentation } from '@/lib/resume-presentation';

/** A brand icon that lucide-react does not ship. */
export interface BrandIconProps {
  className?: string;
  style?: React.CSSProperties;
}

/** One contact detail, resolved and ready to render. */
export interface ContactEntry {
  /** The field this came from — also the display fallback when the value needs no shortening. */
  label: string;
  /** The raw value, e.g. `https://github.com/liming`. */
  value: string;
  /** How to show it, shortened for URLs. Never empty. */
  display: string;
  /** Where it points, or `null` for things with no sensible destination (a location). */
  href: string | null;
}

/**
 * GitHub and LinkedIn usernames from a profile URL; a website's hostname.
 *
 * A full `https://github.com/liming` is noise in a header that has four other contacts beside it,
 * so the display form is the part a reader needs. A value that is not a URL is shown as-is: people
 * put `github.com/liming`, `@liming` and a bare phone number in these fields, and throwing away
 * what they typed to satisfy a formatter would be worse than showing it unshortened.
 *
 * Exported because it is the one piece of header logic with a decision in it, and it is worth
 * being testable on its own rather than only through a rendered component.
 */
export function formatContactValue(value: string, label: string): string {
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

/**
 * The contact entries worth showing, in display order.
 *
 * Order is fixed rather than taken from the metadata field table: `METADATA_FIELDS` is ordered for
 * a form (name, job title, then contacts) and putting a resume header in form order is not the
 * same thing. Email first because it is what a recruiter reaches for.
 *
 * A missing value is omitted rather than rendered as a gap. `ResumeMetadataView` fields are
 * optional, so "not set" and "set to the empty string" both have to mean absent.
 */
export function contactEntries(metadata: ResumeMetadataView): ContactEntry[] {
  const candidates: Array<Omit<ContactEntry, 'display'> & { display?: string }> = [
    { label: 'Email', value: metadata.email ?? '', href: metadata.email ? `mailto:${metadata.email}` : null },
    { label: 'Phone', value: metadata.phone ?? '', href: metadata.phone ? `tel:${metadata.phone}` : null },
    { label: 'Location', value: metadata.location ?? '', href: null },
    { label: 'Website', value: metadata.website ?? '', href: metadata.website ?? null },
    { label: 'GitHub', value: metadata.github ?? '', href: metadata.github ?? null },
    { label: 'LinkedIn', value: metadata.linkedin ?? '', href: metadata.linkedin ?? null },
  ];

  return candidates
    .filter((entry) => entry.value.trim() !== '')
    .map((entry) => ({
      label: entry.label,
      value: entry.value,
      display: entry.display ?? formatContactValue(entry.value, entry.label),
      href: entry.href,
    }));
}

/**
 * The photo to show, or `null`.
 *
 * See the module note: this is where `presentation.photo` stops being decorative. `metadata` wins
 * only when the presentation does not name a photo of its own, which keeps a user who set an
 * avatar in the metadata panel from losing it by opening a template that does not mention photos.
 */
export function resolvePhoto(
  metadata: ResumeMetadataView,
  presentation: ResumePresentation
): string | null {
  if (presentation.photo.enabled) {
    return presentation.photo.path ?? metadata.avatar ?? null;
  }
  return null;
}

/**
 * The name to show.
 *
 * Falls back to the resume's own `title` column because a resume saved before metadata existed
 * has no `name` in its frontmatter, and showing a blank header would look broken rather than
 * empty. Kept here so the two render paths cannot disagree about it.
 */
export function displayName(metadata: ResumeMetadataView, fallback: string): string {
  return metadata.name || fallback;
}
