/**
 * Shared SSE reader for the AI endpoints.
 *
 * The backend speaks one frame vocabulary:
 *
 *   data: {"content":"..."}   a delta of model output
 *   data: {"notice":"..."}    a fact about the request, e.g. that our input was
 *                             truncated before being sent (no model output)
 *   data: {"error":"..."}     an in-band failure after streaming has started
 *   data: [DONE]              end of stream
 *
 * Three components independently grew a byte-identical copy of this loop, and all
 * three consumed only `content`. That silently dropped `error`, so a mid-stream
 * provider failure looked like a short but successful answer, and it would have
 * dropped `notice` too. Keeping one implementation is what makes the vocabulary
 * safe to extend.
 */

export interface SSEHandlers {
  /** A delta of model output. Receives the accumulated text so far. */
  onChunk?: (accumulated: string) => void;
  /**
   * A fact about the request rather than model output — currently only
   * "your content was truncated before being sent". Safe to ignore, but the user
   * should be told: a silently truncated resume is the failure mode this exists
   * to prevent.
   */
  onNotice?: (notice: string) => void;
  /** An in-band failure reported after the stream had already started. */
  onError?: (message: string) => void;
  /**
   * Abort if no data arrives for this long. Guards against a stalled provider
   * that holds the connection open without producing output.
   */
  idleTimeoutMs?: number;
  /** Optional external cancellation. */
  signal?: AbortSignal;
}

export interface SSEResult {
  /** Accumulated model output. */
  text: string;
  /** Notices received during the stream, in order. */
  notices: string[];
}

/**
 * IMPORTANT: parameter 2 is an options OBJECT, not a callback.
 *
 * An earlier version of this API took `(res, onChunk)`. Because a function is
 * structurally assignable to `{}`-like types, that historical call shape still
 * type-checks against an object-taking signature and silently does nothing —
 * the stream would be collected but `onChunk` never fired. These declarations
 * make that mistake a compile error instead of a silent no-op.
 */
export function readSSEStream(res: Response, handlers?: SSEHandlers): Promise<SSEResult>;
export function readSSEStream(
  res: Response,
  handlers: SSEHandlers | undefined,
  legacyOnChunk: unknown
): never;
export async function readSSEStream(
  res: Response,
  handlers: SSEHandlers = {}
): Promise<SSEResult> {
  const { onChunk, onNotice, onError, idleTimeoutMs, signal } = handlers;

  const reader = res.body?.getReader();
  if (!reader) throw new Error('未收到响应流');

  const decoder = new TextDecoder();
  let text = '';
  let buffer = '';
  const notices: string[] = [];

  /** Handles one complete `data:` payload. */
  const handleData = (raw: string) => {
    if (raw === '[DONE]') return;

    let parsed: { content?: string; notice?: string; error?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A partial or malformed line. The buffer already holds anything
      // incomplete, so there is nothing to recover here.
      return;
    }

    if (parsed.error) {
      onError?.(parsed.error);
      return;
    }

    if (parsed.notice) {
      notices.push(parsed.notice);
      onNotice?.(parsed.notice);
      return;
    }

    if (parsed.content) {
      text += parsed.content;
      onChunk?.(text);
    }
  };

  /** Splits the buffer on newlines and consumes every complete line. */
  const drainLines = () => {
    const lines = buffer.split('\n');
    // The last element is either an incomplete line or ''.
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      handleData(trimmed.slice(6));
    }
  };

  try {
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>;

      if (idleTimeoutMs && idleTimeoutMs > 0) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timedOut = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('AI 响应超时，请重试')),
            idleTimeoutMs
          );
        });

        try {
          result = await Promise.race([reader.read(), timedOut]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      } else {
        result = await reader.read();
      }

      if (result.done) break;
      if (!result.value) continue;

      buffer += decoder.decode(result.value, { stream: true });
      drainLines();
    }

    // A final frame may arrive without a trailing newline.
    buffer += decoder.decode();
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ')) handleData(trimmed.slice(6));
    }
  } finally {
    if (signal?.aborted) {
      await reader.cancel().catch(() => {});
    }
  }

  return { text, notices };
}

/**
 * Reads an SSE stream to completion and returns the accumulated text.
 *
 * Prefer this over `readSSEStream` when you do not need the notices afterwards:
 * it avoids the `result.text` unwrap at every call site.
 */
export async function readSSEText(
  res: Response,
  handlers?: Omit<SSEHandlers, 'onChunk'>
): Promise<string> {
  const { text } = await readSSEStream(res, handlers);
  return text;
}
