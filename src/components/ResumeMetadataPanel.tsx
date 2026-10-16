'use client';

/**
 * The structured metadata form (ticket 15, ADR-0003).
 *
 * # What this replaces
 *
 * Metadata used to be edited as YAML frontmatter inside the document. After ticket 17 the
 * server strips frontmatter from the stored document and keeps metadata in database columns,
 * so the old frontmatter form was editing a block that no longer existed — the fields showed
 * empty while all nine columns held good values, and a save wrote them back from a stale
 * in-memory copy.
 *
 * This form edits the columns directly, over `PATCH /api/resumes/{id}/metadata`. It sends a
 * **diff**, so a field the user did not touch is not part of the request and cannot be
 * reverted — see `metadataPatchFromDiff`.
 *
 * # Saving
 *
 * Explicit button plus save-on-blur. Not save-on-keystroke: metadata and content share one
 * `version` counter (ADR-0010), so a metadata write per character would consume a version
 * each time and collide with the body's autosave. Blur is the natural commit point for a
 * single-line field, and the button covers the case where the user tabs away expecting
 * nothing to be sent.
 *
 * A failed save surfaces the server's message verbatim. The domain produces specific Chinese
 * text for a malformed email or URL, and replacing it with a generic line would discard the
 * only part that tells the user what to fix.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, Check, Link2, Lock, Save } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Chip, Input, Textarea } from '@/components/ui';
import {
  METADATA_FIELDS,
  collectMetadataErrors,
  isMetadataPatchEmpty,
  metadataPatchFromDiff,
  type MetadataKey,
  type ResumeMetadataPatch,
  type ResumeMetadataValues,
} from '@/lib/resume-metadata';

export interface ResumeMetadataPanelProps {
  /** The form's values, already normalised so every key is a string. */
  values: ResumeMetadataValues;
  /** Called with the new value on every change, so the parent owns the state. */
  onChange: (key: MetadataKey, value: string) => void;
  /**
   * Commit the patch. Receives only changed keys; absent = leave alone, `''` = clear.
   *
   * `signal` is aborted if the panel unmounts mid-save, so a response arriving after the
   * editor closed cannot call `setState` on a dead component.
   *
   * Optional on a draft that has no resume id yet (the create flow). The parent then
   * owns the values in memory and persists them with the document on first save;
   * this panel only edits and validates. A missing `onSave` must not look like a
   * broken save button — the explicit control is hidden in that case.
   */
  onSave?: (patch: ResumeMetadataPatch, signal: AbortSignal) => Promise<void>;
  /** The server's current values, used to compute the diff. */
  originalValues: ResumeMetadataValues;
  /** The public URL's last segment. Shown read-only — renaming is a separate flow. */
  slug?: string | null;
  /** True while the parent is already saving, so this panel's inputs stay consistent. */
  isSaving?: boolean;
  /** A field-keyed error from the server, e.g. a rejected email. */
  serverErrors?: Partial<Record<MetadataKey, string>>;
  /** A general failure message, shown above the form. */
  errorMessage?: string | null;
  /** Shown after a successful save, then cleared by the parent. */
  successMessage?: string | null;
  /**
   * Hide the panel's own title. The editor keeps 「基本信息」 in the card chrome so collapsing
   * the fields does not take the heading with them.
   */
  hideHeader?: boolean;
}

export function ResumeMetadataPanel({
  values,
  onChange,
  onSave,
  originalValues,
  slug,
  isSaving = false,
  serverErrors,
  errorMessage,
  successMessage,
  hideHeader = false,
}: ResumeMetadataPanelProps) {
  // Field-level errors the user has already been shown. A field is validated on blur and on
  // save, not on every keystroke: complaining that `z@` is not a valid email while it is
  // still being typed is noise, and it trains the user to ignore the message.
  const [touchedErrors, setTouchedErrors] = useState<Partial<Record<MetadataKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // One controller for the panel's lifetime, aborted on unmount. Without this a save that
  // resolves after the user closes the editor would write state into an unmounted tree.
  const controller = useMemo(() => new AbortController(), []);
  useEffect(() => () => controller.abort(), [controller]);

  const patch = useMemo(
    () => metadataPatchFromDiff(originalValues, values),
    [originalValues, values]
  );
  const hasChanges = !isMetadataPatchEmpty(patch);

  // Format problems in what the user is currently typing, independent of what was saved.
  const currentErrors = useMemo(() => collectMetadataErrors(values), [values]);

  // What to show: the server's error wins where present (it is authoritative and its
  // wording is the one the user's action produced), otherwise the local format check.
  const errorsFor = useCallback(
    (key: MetadataKey): string | undefined =>
      serverErrors?.[key] ?? touchedErrors[key] ?? currentErrors[key],
    [serverErrors, touchedErrors, currentErrors]
  );

  const handleBlur = useCallback(
    (key: MetadataKey) => {
      const message = currentErrors[key];
      setTouchedErrors((prev) => {
        if (message) return { ...prev, [key]: message };
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [currentErrors]
  );

  const commit = useCallback(async () => {
    // Validate before sending, so a request the server will reject never leaves the browser.
    const problems = collectMetadataErrors(values);
    if (Object.keys(problems).length > 0) {
      setTouchedErrors(problems);
      return;
    }
    // Nothing changed: do not consume a version for a no-op. The server treats an empty
    // patch as a no-op too, but not sending it at all is better than a round trip that
    // cannot change anything.
    if (!onSave || !hasChanges || busy || isSaving) return;

    setBusy(true);
    try {
      await onSave(patch, controller.signal);
      setSavedAt(Date.now());
      setTouchedErrors({});
    } catch (err) {
      // An abort is not a failure — the panel is going away.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // The parent owns the error message; it has the server's text. Swallowing it here
      // would leave the user with no indication the save failed.
    } finally {
      setBusy(false);
    }
  }, [values, hasChanges, busy, isSaving, onSave, patch, controller]);

  // Clear the "已保存" affordance after a moment, so it does not look like a permanent state
  // that the next edit has invalidated.
  useEffect(() => {
    if (savedAt === null) return;
    const timer = setTimeout(() => setSavedAt(null), 2500);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const saving = busy || isSaving;

  const saveControls = onSave ? (
    <div className="flex items-center gap-2">
      {savedAt !== null && (
        <Chip color="success" variant="flat" size="sm" startContent={<Check size={12} />}>
          已保存
        </Chip>
      )}
      <Button
        color="primary"
        variant="solid"
        size="sm"
        isLoading={saving}
        isDisabled={!hasChanges || saving}
        startContent={!saving ? <Save size={14} /> : undefined}
        onClick={commit}
      >
        保存基本信息
      </Button>
    </div>
  ) : null;

  return (
    <Card className={hideHeader ? 'border-0 bg-transparent' : undefined}>
      {hideHeader ? (
        saveControls && <div className="flex justify-end px-5 pt-1">{saveControls}</div>
      ) : (
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-serif text-lg text-foreground">基本信息</h3>
          {saveControls}
        </CardHeader>
      )}

      <CardBody className="gap-4">
        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[2rem] bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && !errorMessage && (
          <div className="flex items-center gap-2 rounded-[2rem] bg-success/10 px-4 py-3 text-sm text-success">
            <Check size={16} className="shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {METADATA_FIELDS.map((field) => {
            const message = errorsFor(field.key);
            const shared = {
              label: field.label,
              placeholder: field.placeholder,
              value: values[field.key],
              // `readOnly`, not `disabled`: a disabled input is removed from the tab order and
              // its text cannot be selected, so a user mid-save cannot copy a value out. The
              // fields are only locked for the duration of one request.
              readOnly: saving,
              isInvalid: !!message,
              errorMessage: message,
              description: field.hint,
            };
            return (
              <div key={field.key} className={clsx(field.wide && 'md:col-span-2')}>
                {field.type === 'textarea' ? (
                  <Textarea
                    {...shared}
                    name={field.key}
                    onChange={(e) => onChange(field.key, e.target.value)}
                    onBlur={() => handleBlur(field.key)}
                    rows={3}
                  />
                ) : (
                  <Input
                    {...shared}
                    name={field.key}
                    type={field.type}
                    autoComplete={field.key === 'email' ? 'email' : 'off'}
                    onChange={(e) => onChange(field.key, e.target.value)}
                    onBlur={() => handleBlur(field.key)}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/*
          The public link is shown but not editable. The slug is part of the resume's public
          URL — changing it would break every existing link — so renaming is a deliberate
          separate flow (ticket 40), not a side effect of editing a form. Saying so here is
          the difference between "this field is broken" and "this is on purpose".
        */}
        {slug && (
          <div className="border-t border-default-200 pt-4">
            <Input
              label="公开链接"
              value={`/r/${slug}`}
              readOnly
              startContent={<Link2 size={14} />}
              endContent={<Lock size={14} />}
              description="公开链接不可修改：修改会导致已分享的链接失效"
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
