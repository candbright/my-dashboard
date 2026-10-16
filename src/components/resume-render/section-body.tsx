/**
 * Render a section as a mixed component stream, not as `kind`.
 *
 * Consecutive entries stay siblings inside one `ResumeEntryList` so
 * `.resume-entry + .resume-entry` still supplies print spacing. Chip groups
 * keep `data-print-flatten` via `ResumeSkillList`.
 */

import { Fragment, type ReactNode } from 'react';
import { blocksOf } from '@/lib/resume-blocks';
import type { ResumeSection, ResumeSectionItem } from '@/lib/resume-model';
import type { ResumeTheme } from '@/lib/resume-template-theme';
import { ResumeEntryList, ResumeProse, ResumeSkillChip, ResumeSkillList } from './primitives';

export function ResumeSectionBody({
  section,
  theme,
  renderEntry,
  renderChips,
}: {
  section: ResumeSection;
  theme: ResumeTheme;
  renderEntry: (item: ResumeSectionItem, key: string) => ReactNode;
  renderChips?: (chips: string[], key: string) => ReactNode;
}) {
  const groups = groupBlocksForRender(blocksOf(section));

  return (
    <>
      {groups.map((group) => {
        if (group.type === 'paragraph') {
          return (
            <ResumeProse key={group.key} theme={theme}>
              {group.text}
            </ResumeProse>
          );
        }
        if (group.type === 'chips') {
          if (renderChips) {
            return <Fragment key={group.key}>{renderChips(group.chips, group.key)}</Fragment>;
          }
          return (
            <ResumeSkillList key={group.key}>
              {group.chips.map((skill) => (
                <ResumeSkillChip key={skill} theme={theme}>
                  {skill}
                </ResumeSkillChip>
              ))}
            </ResumeSkillList>
          );
        }
        return (
          <ResumeEntryList key={group.key}>
            {group.items.map((item, index) => renderEntry(item, `${group.key}-${index}`))}
          </ResumeEntryList>
        );
      })}
    </>
  );
}

type RenderGroup =
  | { type: 'paragraph'; key: string; text: string }
  | { type: 'entries'; key: string; items: ResumeSectionItem[] }
  | { type: 'chips'; key: string; chips: string[] };

function groupBlocksForRender(blocks: ReturnType<typeof blocksOf>): RenderGroup[] {
  const groups: RenderGroup[] = [];

  for (const [index, block] of blocks.entries()) {
    const last = groups[groups.length - 1];
    if (block.type === 'entry' && last?.type === 'entries') {
      last.items.push(block.item);
      continue;
    }
    if (block.type === 'chips' && last?.type === 'chips') {
      last.chips.push(...block.chips);
      continue;
    }
    if (block.type === 'paragraph') {
      groups.push({ type: 'paragraph', key: `p-${index}`, text: block.text });
    } else if (block.type === 'chips') {
      groups.push({ type: 'chips', key: `c-${index}`, chips: [...block.chips] });
    } else {
      groups.push({ type: 'entries', key: `e-${index}`, items: [block.item] });
    }
  }

  return groups;
}
